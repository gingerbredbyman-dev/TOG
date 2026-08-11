// sync-merch.mjs — pushes the design catalog into Printful as sync products.
// AI-managed: add a design PNG + a products.json entry, run `npm run sync`, redeploy.
//
//   node scripts/sync-merch.mjs --dry-run     validate catalog + files, no API calls
//   node scripts/sync-merch.mjs               create/update Printful products, write data/printful-map.json
//
// Requires env: PRINTFUL_API_KEY, PRINTFUL_STORE_ID, NEXT_PUBLIC_SITE_URL (deployed origin
// serving /designs/*.png — Printful downloads print files from there).

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(readFileSync(join(ROOT, "data", "products.json"), "utf8"));
const DRY = process.argv.includes("--dry-run");

const API = "https://api.printful.com";
const KEY = process.env.PRINTFUL_API_KEY;
const STORE = process.env.PRINTFUL_STORE_ID;
const ORIGIN = process.env.NEXT_PUBLIC_SITE_URL;

// Printful catalog anchors per product type (resolved to live variant ids at sync time).
const PF_CATALOG = {
  tshirt: { productId: 71, note: "Bella + Canvas 3001" },
  mug: { productId: 19, note: "White Glossy Mug 11oz" },
  cap: { productId: 662, note: "Classic Dad Hat (embroidery)" },
  sticker: { productId: 358, note: "Kiss-Cut Stickers" },
};

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
  const json = await res.json();
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  return json.result;
}

function localFile(publicPath) {
  return join(ROOT, "public", publicPath.replace(/^\//, ""));
}

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
  console.error("Need PRINTFUL_API_KEY, PRINTFUL_STORE_ID and NEXT_PUBLIC_SITE_URL to sync live.");
  process.exit(1);
}

// ---------- sync ----------
const map = {};
const variantCache = {};

async function variantsFor(type, color) {
  const pid = PF_CATALOG[type].productId;
  if (!variantCache[pid]) variantCache[pid] = await pf(`/products/${pid}`);
  const { variants } = variantCache[pid];
  return variants.filter((v) => !color || (v.color || "").toLowerCase().includes(color.toLowerCase()));
}

for (const p of catalog.products) {
  if (p.comingSoon) continue;
  for (const [ed, spec] of Object.entries(p.editions)) {
    const editionLabel =
      Object.keys(p.editions).length > 1 && !p.unifiedEdition
        ? ed === "ethical" ? " — Ethical Edition" : " — Standard Edition"
        : "";
    const name = `${p.name}${editionLabel}`;
    const candidates = await variantsFor(p.pf.type, p.pf.color);

    const sizes = p.sizes?.length ? p.sizes : ["default"];
    const sync_variants = [];
    for (const size of sizes) {
      const v =
        candidates.find((c) => (c.size || "").toLowerCase() === String(size).toLowerCase()) ||
        candidates[0];
      if (!v) { console.log(`  !! no variant for ${p.id} ${size}`); continue; }
      const files = [{ url: `${ORIGIN}${spec.image}` }];
      if (p.twoSided && spec.back) files.push({ type: "back", url: `${ORIGIN}${spec.back}` });
      sync_variants.push({
        retail_price: (p.priceCents / 100).toFixed(2),
        variant_id: v.id,
        files,
        _size: size,
      });
    }

    const created = await pf(`/store/products`, {
      method: "POST",
      body: JSON.stringify({
        sync_product: { name, thumbnail: `${ORIGIN}${spec.image}` },
        sync_variants: sync_variants.map(({ _size, ...v }) => v),
      }),
    });

    const detail = await pf(`/store/products/${created.id}`);
    detail.sync_variants.forEach((sv, i) => {
      const size = sync_variants[i]?._size || "default";
      map[`${p.id}:${ed}:${size}`] = sv.id;
    });
    console.log(`synced ${name} (${sync_variants.length} variants)`);
  }
}

writeFileSync(join(ROOT, "data", "printful-map.json"), JSON.stringify(map, null, 2));
console.log(`wrote data/printful-map.json with ${Object.keys(map).length} variant mappings ✓`);
