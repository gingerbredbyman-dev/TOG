// verify-orders.mjs — proves every buyable product can be ordered with the CORRECT
// art on the CORRECT article. Run in CI / before any launch:
//   node scripts/verify-orders.mjs
// Checks: files exist, placement is valid for the product type, two-sided pairing,
// minimum print resolution per article, id uniqueness, price sanity.

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { imageSize } from "./lib-imgsize.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const seed = JSON.parse(readFileSync(join(ROOT, "data", "products.json"), "utf8"));

const VALID_PLACEMENTS = {
  tshirt: ["front", "front+back"],
  cap: ["embroidery_front"],
  cap_print: ["default"],
  mug: ["default"],
  sticker: ["default"],
};
// Minimum pixel width of print art per article (print-quality floor).
const MIN_WIDTH = { tshirt: 1500, cap: 1000, cap_print: 1000, mug: 2500, sticker: 900 };

let fail = 0, warn = 0;
const seen = new Set();
const say = (level, id, msg) => {
  console.log(`${level}  ${id.padEnd(24)} ${msg}`);
  if (level === "FAIL") fail++;
  if (level === "WARN") warn++;
};

for (const p of seed.products) {
  if (seen.has(p.id)) say("FAIL", p.id, "duplicate product id");
  seen.add(p.id);
  if (p.comingSoon) continue;

  if (!(p.priceCents > 0)) say("FAIL", p.id, "priceCents must be > 0");
  if (!(p.shipCents >= 0)) say("WARN", p.id, "no shipCents — will default to 499");
  if (!VALID_PLACEMENTS[p.pf?.type]) {
    say("FAIL", p.id, `unknown pf.type "${p.pf?.type}"`);
    continue;
  }
  if (!VALID_PLACEMENTS[p.pf.type].includes(p.pf.placement || "default"))
    say("FAIL", p.id, `placement "${p.pf.placement}" invalid for ${p.pf.type}`);
  if (p.twoSided && p.pf.placement !== "front+back")
    say("FAIL", p.id, "twoSided product must use placement front+back");

  for (const [ed, spec] of Object.entries(p.editions || {})) {
    const files = [["image", spec.image], ...(spec.back ? [["back", spec.back]] : [])];
    if (p.twoSided && !spec.back)
      say("FAIL", p.id, `[${ed}] twoSided but no back file`);
    if (!p.twoSided && spec.back)
      say("FAIL", p.id, `[${ed}] has a back file but product is not twoSided`);
    for (const [kind, f] of files) {
      const local = join(ROOT, "public", (f || "").replace(/^\//, ""));
      if (!f || !existsSync(local)) {
        say("FAIL", p.id, `[${ed}] ${kind} file missing: ${f}`);
        continue;
      }
      try {
        const { width, height } = imageSize(local);
        const min = MIN_WIDTH[p.pf.type];
        if (width < min)
          say("FAIL", p.id, `[${ed}] ${kind} ${width}x${height} below ${min}px print floor`);
        if (p.pf.type === "mug" && width / height < 1.8)
          say("WARN", p.id, `[${ed}] mug wrap aspect ${(width / height).toFixed(2)} — expected wide wrap`);
      } catch (e) {
        say("WARN", p.id, `[${ed}] ${kind} unreadable dimensions (${e.message})`);
      }
    }
  }
  if (p.situ && !existsSync(join(ROOT, "public", p.situ.replace(/^\//, ""))))
    say("WARN", p.id, `situ image missing: ${p.situ}`);
}

console.log(`\nverify-orders: ${fail} FAIL, ${warn} WARN across ${seed.products.length} products`);
process.exit(fail ? 1 : 0);
