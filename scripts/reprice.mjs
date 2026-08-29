// Auto-repricer: refetches Printful's LIVE economics, then raises any retail
// price that no longer clears its profit floor (US worst-case size) or the CA
// never-lose-money bar. Prices only ever go UP — lowering is a marketing
// decision for humans. Standing order (Austin, 2026-08-22): every future order
// must be priced for profit, automatically.
//
//   npm run reprice                live fetch + apply changes to products.json
//   npm run reprice -- --dry-run   live fetch, report only
//   npm run reprice -- --offline   reuse data/pf-costs.json (tests, no API)
//
// Exit codes: 0 = nothing to change, 2 = prices changed (sync + commit +
// redeploy REQUIRED — Printful sync replaces all variant ids!), 1 = shipping
// drift or error (lib/shipping.js RATES needs a human/Claude update first).
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { evaluateRetail } from "../lib/pricing.js";
import { RATES } from "../lib/shipping.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DRY = process.argv.includes("--dry-run");
const OFFLINE = process.argv.includes("--offline");
const catalog = JSON.parse(readFileSync(join(ROOT, "data", "products.json"), "utf8"));
const map = JSON.parse(readFileSync(join(ROOT, "data", "printful-map.json"), "utf8"));

const SIZE_WORST_UPCHARGE = { tshirt: 400 };
const PROFIT_FLOOR = { tshirt: 600, cap: 600, cap_print: 600, mug: 600, sticker: 100 };
const MAX_BUMP_CENTS = 5000; // one run never raises a price more than $50 — investigate instead

// ---------- gather live costs (or reuse the snapshot) ----------
let costs;
if (OFFLINE) {
  costs = JSON.parse(readFileSync(join(ROOT, "data", "pf-costs.json"), "utf8"));
  console.log("(offline: using existing data/pf-costs.json)");
} else {
  const H = {
    Authorization: `Bearer ${process.env.PRINTFUL_API_KEY}`,
    "X-PF-Store-ID": process.env.PRINTFUL_STORE_ID,
    "Content-Type": "application/json",
  };
  if (!process.env.PRINTFUL_API_KEY || !process.env.PRINTFUL_STORE_ID) {
    console.error("Need PRINTFUL_API_KEY + PRINTFUL_STORE_ID (or use --offline)");
    process.exit(1);
  }
  const REC = {
    US: { name: "Estimate Only", address1: "100 SE 2nd St", city: "Miami", state_code: "FL", country_code: "US", zip: "33131" },
    CA: { name: "Estimate Only", address1: "100 Queen St W", city: "Toronto", state_code: "ON", country_code: "CA", zip: "M5H 2N2" },
  };
  async function estimate(cc, items, label) {
    for (let a = 1; a <= 6; a++) {
      const res = await fetch("https://api.printful.com/orders/estimate-costs", {
        method: "POST", headers: H, body: JSON.stringify({ recipient: REC[cc], items }),
      });
      if (res.status === 429) { await new Promise((r) => setTimeout(r, 20000)); continue; }
      const j = await res.json();
      if (!res.ok) throw new Error(`${label}: ${res.status} ${JSON.stringify(j).slice(0, 150)}`);
      return j.result.costs;
    }
    throw new Error(`${label}: rate-limited out`);
  }
  const cents = (s) => Math.round(parseFloat(s) * 100);
  costs = {};
  for (const p of catalog.products) {
    const firstSize = p.sizes?.[0] || "default";
    const vid = map[`${p.id}:standard:${firstSize}`];
    if (!vid) { console.log(`SKIP ${p.id} — unmapped (run npm run sync first)`); continue; }
    const one = [{ sync_variant_id: vid, quantity: 1 }];
    const us1 = await estimate("US", one, `${p.id} US1`);
    const us2 = await estimate("US", [{ sync_variant_id: vid, quantity: 2 }], `${p.id} US2`);
    const ca1 = await estimate("CA", one, `${p.id} CA1`);
    costs[p.id] = {
      type: p.pf.type,
      retailCents: p.priceCents,
      itemCents: cents(us1.subtotal),
      shipUSFirstCents: cents(us1.shipping),
      shipUSAddlCents: cents(us2.shipping) - cents(us1.shipping),
      taxUSCents: cents(us1.tax),
      shipCAFirstCents: cents(ca1.shipping),
      taxCACents: cents(ca1.tax),
    };
    await new Promise((r) => setTimeout(r, 1200));
  }
  if (!DRY) writeFileSync(join(ROOT, "data", "pf-costs.json"), JSON.stringify(costs, null, 2) + "\n");
}

// ---------- shipping drift: our charged rates must still match Printful's ----------
let drift = 0;
const seenTypes = new Set();
for (const p of catalog.products) {
  const c = costs[p.id];
  const type = p.pf?.type;
  if (!c || seenTypes.has(type)) continue;
  seenTypes.add(type);
  const checks = [
    ["US first", RATES.US[type]?.first, c.shipUSFirstCents],
    ["US addl", RATES.US[type]?.addl, c.shipUSAddlCents],
    ["CA first", RATES.CA[type]?.first, c.shipCAFirstCents],
  ];
  for (const [label, ours, theirs] of checks) {
    if (ours !== theirs) {
      console.log(`SHIPPING DRIFT ${type} ${label}: we charge ${ours}, Printful now ${theirs} — update RATES in lib/shipping.js`);
      drift++;
    }
  }
}

// ---------- bump any price that no longer clears its bars ----------
const changes = [];
for (const p of catalog.products) {
  const c = costs[p.id];
  if (!c) continue;
  const type = p.pf.type;
  const up = SIZE_WORST_UPCHARGE[type] || 0;
  const item = c.itemCents + up;
  const scale = item / c.itemCents;
  const inputs = {
    itemCents: item,
    taxUSCents: Math.ceil(c.taxUSCents * scale),
    taxCACents: Math.ceil((c.taxCACents || 0) * scale),
    shipUSFirstCents: RATES.US[type].first,
    shipCAFirstCents: RATES.CA[type].first,
  };
  const floor = PROFIT_FLOOR[type] ?? 600;
  let retail = p.priceCents;
  for (;;) {
    const { usProfit, caProfit } = evaluateRetail({ retailCents: retail, ...inputs });
    if (usProfit >= floor && caProfit >= 0) break;
    retail += 100; // .99 price points stay .99
    if (retail - p.priceCents > MAX_BUMP_CENTS) {
      console.error(`RUNAWAY ${p.id}: +$50 still unprofitable — check the cost data, not the price`);
      process.exit(1);
    }
  }
  // Shipping display field tracks the rate table (engine uses the table itself).
  const shipField = RATES.US[type].first;
  if (retail !== p.priceCents || p.shipCents !== shipField) {
    changes.push({ id: p.id, from: p.priceCents, to: retail });
    p.priceCents = retail;
    p.shipCents = shipField;
  }
}

if (changes.length) {
  for (const ch of changes)
    console.log(`RAISE ${ch.id.padEnd(26)} $${(ch.from / 100).toFixed(2)} -> $${(ch.to / 100).toFixed(2)}`);
  if (!DRY) {
    writeFileSync(join(ROOT, "data", "products.json"), JSON.stringify(catalog, null, 2) + "\n");
    console.log(`\nreprice: ${changes.length} price(s) raised and written.`);
    console.log("NEXT (all required): npm run audit && npm run sync, commit products+costs+map, redeploy.");
  } else {
    console.log(`\nreprice (dry-run): ${changes.length} price(s) WOULD be raised.`);
  }
} else {
  console.log("\nreprice: every price still clears its bars — nothing to change ✓");
}
if (drift) console.log(`\n${drift} shipping drift issue(s) — fix lib/shipping.js RATES before trusting the numbers above.`);
process.exit(drift ? 1 : changes.length ? 2 : 0);
