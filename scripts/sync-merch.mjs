// sync-merch.mjs — pushes the design catalog into Printful as sync products.
// AI-managed: add a design PNG + a products.json entry, run `npm run sync`, commit
// the regenerated data/printful-map.json, redeploy.
//
//   npm run sync -- --dry-run     validate catalog + files, no API calls
//   npm run sync                  create/UPDATE Printful products (idempotent via
//                                 external_id), write data/printful-map.json
//
// Env (loaded via node --env-file=.env.local in the npm script):
//   PRINTFUL_API_KEY, PRINTFUL_STORE_ID, SITE_ORIGIN (public https origin serving
//   /designs/*.png — Printful downloads print files from there).

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(readFileSync(join(ROOT, "data", "products.json"), "utf8"));
const DRY = process.argv.includes("--dry-run");

const API = "https://api.printful.com";
const KEY = process.env.PRINTFUL_API_KEY;
const STORE = process.env.PRINTFUL_STORE_ID;
const ORIGIN = process.env.SITE_ORIGIN || process.env.NEXT_PUBLIC_SITE_URL;

// Printful catalog anchors. Titles are asserted at runtime so a wrong id aborts
// instead of silently syncing another product's variants.
const PF_CATALOG = {
  tshirt: { productId: 71, mustContain: "3001" },
  mug: { productId: 19, mustContain: "mug" },
  cap: { productId: 662, mustContain: "hat" },
  // Beechfield B653 — the only PF cap with a printed front (front_dtf_hat)
  // AND side embroidery placements. Colors are all pastel; no black exists.
  cap_print: { productId: 481, mustContain: "pastel" },
  sticker: { productId: 358, mustContain: "sticker" },
};

// Size label normalization: strip everything non-alphanumeric, lowercase.
// '3" × 3"' -> '3x3' matches Printful's '3″×3″'. Aliases cover naming drift.
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "").replace(/x+/g, "x");
const SIZE_ALIASES = { "2xl": ["2xl", "xxl"], "3xl": ["3xl", "xxxl"], onesize: ["onesize", "one size", ""] };
function sizeMatches(wanted, candidate) {
  const w = norm(wanted), c = norm(candidate);
  if (w === c) return true;
  return (SIZE_ALIASES[w] || []).some((a) => norm(a) === c);
}

async function pf(path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: {
      Authorization: `Bearer ${KEY}`,
      "X-PF-Store-ID": STORE,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(`${path} -> ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
    e.status = res.status;
    throw e;
  }
  return json.result;
}

const localFile = (publicPath) => join(ROOT, "public", publicPath.replace(/^\//, ""));

// ---------- validate ----------
let problems = 0;
for (const p of catalog.products) {
  for (const [ed, spec] of Object.entries(p.editions || {})) {
    for (const f of [spec.image, spec.back].filter(Boolean)) {
      if (!existsSync(localFile(f))) {
        console.log(`MISSING FILE  ${p.id} [${ed}] -> ${f}`);
        problems++;
      }
    }
  }
  if (!p.comingSoon && !PF_CATALOG[p.pf?.type]) {
    console.log(`NO PF MAPPING ${p.id} (type: ${p.pf?.type})`);
    problems++;
  }
}
console.log(problems ? `validation: ${problems} problem(s)` : "validation: all catalog files present ✓");

if (DRY) {
  const buyable = catalog.products.filter((p) => !p.comingSoon);
  console.log(`dry-run complete: ${buyable.length} buyable products, ${catalog.products.length - buyable.length} coming soon.`);
  process.exit(problems ? 1 : 0);
}

if (!KEY || !STORE || !ORIGIN) {
  console.error("Need PRINTFUL_API_KEY, PRINTFUL_STORE_ID and SITE_ORIGIN to sync live.");
  process.exit(1);
}
if (!ORIGIN.startsWith("https://")) {
  console.error(`SITE_ORIGIN must be a public https origin (got ${ORIGIN}) — Printful must be able to download the print files.`);
  process.exit(1);
}

// ---------- sync ----------
const map = {};
const variantCache = {};
let hardErrors = 0;

async function catalogVariants(type) {
  const { productId, mustContain } = PF_CATALOG[type];
  if (!variantCache[productId]) {
    variantCache[productId] = await pf(`/products/${productId}`);
    const title = (variantCache[productId].product?.title || "").toLowerCase();
    if (!title.includes(mustContain)) {
      throw new Error(`catalog id ${productId} resolved to "${title}" — expected it to contain "${mustContain}". Aborting.`);
    }
  }
  return variantCache[productId].variants.filter((v) => v.availability_status !== "discontinued");
}

// Existing sync products, keyed by external_id, for idempotent re-runs.
async function existingByExternalId() {
  const out = {};
  let offset = 0;
  for (;;) {
    const page = await pf(`/store/products?limit=100&offset=${offset}`);
    for (const sp of page) if (sp.external_id) out[sp.external_id] = sp.id;
    if (page.length < 100) break;
    offset += 100;
  }
  return out;
}

const existing = await existingByExternalId();

for (const p of catalog.products) {
  if (p.comingSoon) continue;
  for (const [ed, spec] of Object.entries(p.editions)) {
    const externalId = `${p.id}:${ed}`;
    const editionLabel =
      Object.keys(p.editions).length > 1 && !p.unifiedEdition
        ? ed === "ethical" ? " — Ethical Edition" : " — Standard Edition"
        : "";
    const name = `${p.name}${editionLabel}`;

    const all = await catalogVariants(p.pf.type);
    // Exact color match only — substring matching confuses Black/Vintage Black/Heather.
    const colorMatched = p.pf.color
      ? all.filter((v) => (v.color || "").toLowerCase() === p.pf.color.toLowerCase())
      : all;
    const pool = colorMatched.length ? colorMatched : all;
    if (!colorMatched.length && p.pf.color) {
      console.log(`  ~ color "${p.pf.color}" not found for ${p.id}; matching across all colors`);
    }

    const sizes = p.sizes?.length ? p.sizes : ["default"];
    const sync_variants = [];
    for (const size of sizes) {
      const v =
        size === "default"
          ? pool[0]
          : pool.find((c) => sizeMatches(size, c.size || ""));
      if (!v) {
        console.error(`  !! NO VARIANT for ${p.id} [${ed}] size "${size}" — SKIPPED (fix products.json or PF color)`);
        hardErrors++;
        continue;
      }
      const primaryType =
        p.pf.placement && p.pf.placement !== "default" && p.pf.placement !== "front+back"
          ? p.pf.placement
          : p.pf.placement === "front+back" || p.pf.type === "tshirt"
            ? "front"
            : "default";
      const files = [{ type: primaryType, url: `${ORIGIN}${spec.image}` }];
      if (p.twoSided && spec.back) files.push({ type: "back", url: `${ORIGIN}${spec.back}` });
      // Small brand mark on the cap's left side. Sides are embroidery-only
      // across Printful's entire cap catalog (no printed-side product exists),
      // so the mark always ships as embroidery_left — on printed caps too.
      if (p.pf.sideLogo && (p.pf.type === "cap" || p.pf.type === "cap_print"))
        files.push({ type: "embroidery_left", url: `${ORIGIN}${p.pf.sideLogo}` });
      sync_variants.push({
        retail_price: (p.priceCents / 100).toFixed(2),
        variant_id: v.id,
        files,
        _size: size,
      });
    }
    if (!sync_variants.length) {
      console.error(`  !! ${p.id} [${ed}] has ZERO resolvable variants — not synced`);
      hardErrors++;
      continue;
    }

    const payload = {
      sync_product: { name, external_id: externalId, thumbnail: `${ORIGIN}${spec.image}` },
      sync_variants: sync_variants.map(({ _size, ...v }) => v),
    };

    let productId;
    if (existing[externalId]) {
      const updated = await pf(`/store/products/${existing[externalId]}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      productId = updated.id;
      console.log(`updated ${name} (${sync_variants.length} variants)`);
    } else {
      const created = await pf(`/store/products`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      productId = created.id;
      console.log(`created ${name} (${sync_variants.length} variants)`);
    }

    // Map sizes -> sync variant ids by catalog variant_id (NOT array order —
    // Printful reorders sync_variants in its responses).
    const detail = await pf(`/store/products/${productId}`);
    for (const sv of detail.sync_variants) {
      const match = sync_variants.find((s) => s.variant_id === sv.variant_id);
      if (match) map[`${p.id}:${ed}:${match._size}`] = sv.id;
    }
  }
}

writeFileSync(join(ROOT, "data", "printful-map.json"), JSON.stringify(map, null, 2));
console.log(`wrote data/printful-map.json with ${Object.keys(map).length} variant mappings ${hardErrors ? `— ${hardErrors} HARD ERROR(S), fix before launch` : "✓"}`);
console.log("NEXT: commit data/printful-map.json and redeploy — the webhook bundles it at build time.");
process.exit(hardErrors ? 1 : 0);
