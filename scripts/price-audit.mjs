// Profit gate: proves every product's retail covers Printful cost (worst-case
// size), PF-billed tax (until the resale certificate), Stripe's fee, and the 5%
// SAGE earmark — with margin to spare. Shipping is excluded on both sides: we
// charge Printful's own rates, so it is a pass-through (see lib/shipping.js).
// Run in CI / before launch:  npm run audit
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { STRIPE_PCT, STRIPE_FLAT_CENTS, SAGE_PCT, evaluateRetail } from "../lib/pricing.js";
import { RATES } from "../lib/shipping.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const costs = JSON.parse(readFileSync(join(ROOT, "data", "pf-costs.json"), "utf8"));
const seed = JSON.parse(readFileSync(join(ROOT, "data", "products.json"), "utf8"));

// B+C 3001 3XL runs $4.00 over base (measured live 2026-08-22): flat retail
// must survive the most expensive size.
const SIZE_WORST_UPCHARGE = { tshirt: 400 };
const PROFIT_FLOOR = { tshirt: 600, cap: 600, cap_print: 600, mug: 600, sticker: 100 };

let fail = 0;
console.log("product                     retail   pfCost   pfTax    fee   SAGE  profit  margin  CAworst");
for (const p of seed.products) {
  if (p.comingSoon) continue;
  const c = costs[p.id];
  if (!c) {
    console.log(`FAIL ${p.id.padEnd(24)} no pf-costs entry — rerun the PF audit`);
    fail++;
    continue;
  }
  const type = p.pf.type;
  const up = SIZE_WORST_UPCHARGE[type] || 0;
  const item = c.itemCents + up;
  // PF tax scales with the item value; scale the measured tax the same way.
  const tax = Math.ceil(c.taxUSCents * (item / c.itemCents));
  const shipCharge = RATES.US[type].first;
  const fee = Math.ceil((p.priceCents + shipCharge) * STRIPE_PCT) + STRIPE_FLAT_CENTS;
  const sage = Math.round(p.priceCents * SAGE_PCT);
  // Shared math with reprice.mjs: US floor = profitability bar; CA worst case
  // (heavier tax + intl-card surcharge) = the never-lose-money bar.
  const { usProfit: profit, caProfit } = evaluateRetail({
    retailCents: p.priceCents,
    itemCents: item,
    taxUSCents: tax,
    taxCACents: Math.ceil((c.taxCACents || 0) * (item / c.itemCents)),
    shipUSFirstCents: shipCharge,
    shipCAFirstCents: RATES.CA[type].first,
  });
  const floor = PROFIT_FLOOR[type] ?? 600;
  const bad = profit < floor || caProfit < 0;
  if (bad) fail++;
  const $ = (v) => (v / 100).toFixed(2).padStart(6);
  console.log(
    `${bad ? "FAIL" : " ok "} ${p.id.padEnd(24)}${$(p.priceCents)} ${$(item)} ${$(tax)} ${$(fee)} ${$(sage)} ${$(profit)}  ${((profit / p.priceCents) * 100).toFixed(0).padStart(4)}% ${$(caProfit)}`
  );
  if (p.shipCents !== shipCharge)
    console.log(`     ^ WARN shipCents ${p.shipCents} != rate table ${shipCharge} (display drift)`);
}
console.log(fail ? `\nprice-audit: ${fail} FAILURE(S) — fix prices before launch` : "\nprice-audit: every product clears its profit floor ✓");
process.exit(fail ? 1 : 0);
