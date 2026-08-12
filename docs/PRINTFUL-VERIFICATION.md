# Printful Verification — art-v2 line (2026-08-12)

**Method.** Every claim below was verified against Printful's live Catalog API using the
account's private token (`GET /products/{id}` — placements, techniques, variant colors,
per-region supplier stock). Repo gates: `verify-orders.mjs` (art→article correctness,
0 FAIL / 0 WARN across 22 products) and `npm run sync -- --dry-run` (all catalog files
present). Printful's own Mockup Generator renders (our art on their blanks) are the final
proof layer — **blocked only on store creation** (Dashboard → Stores → Add → "API" type),
after which `npm run sync` also goes live. No store exists yet (`GET /stores` → 0).

## Category → Printful product matrix

| Category | PF product | Technique | Placements used | Verdict |
|---|---|---|---|---|
| Tees (9) | 71 — Bella+Canvas 3001 | DTG | `front` + `back` | ✅ two-sided verified |
| Mugs (3) | 19 — White Glossy Mug 11oz | Sublimation | `default` (wrap) | ✅ variant 1320 in stock |
| Stickers (8) | 358 — Kiss-Cut 3″×3″ | Digital | `default` | ✅ variant 10163 in stock |
| Caps (2) | **481 — Beechfield B653 "Pastel Baseball Hat"** | DTF front + embroidery sides | `front_dtf_hat` + `left` | ✅ see below |

## The cap findings (the interesting ones)

1. **Front + back tee printing: VERIFIED.** Product 71 exposes both `front` and `back`
   DTG placements; sync sends both files for every `twoSided` product.
2. **Black logo on the cap side: VERIFIED — as embroidery.** No product in Printful's
   entire cap catalog (53 headwear items swept) offers a *printed* side placement; sides
   are embroidery-only, industry-standard. The black T.O.G. side mark ships as
   `embroidery_left` in black thread (+$2.95) — supported on 481. Fine detail in the
   lockup may be simplified by Printful's digitization pass; their review flags it if so.
3. **No black caps: GUARANTEED BY THE BLANK.** 481 comes only in pastels —
   Pastel Lemon / Mint / Pink / Blue / Beige. Black does not exist for this product.
4. **481 is the only viable cap.** The five printed-front caps (1574, 1586, 1593, 1594,
   1634) are all front-only (no side placement). Every other cap is embroidery-only —
   and both cap artworks are full-color print jobs no embroidery can reproduce.
   481 is the unique intersection: printed front + side mark + pastel.
5. **Stock reality (US, checked 2026-08-12): only Pastel Mint (variant 12417) is in
   stock.** Pink (12418), Blue (12415), Lemon (12416), Beige (49346) are
   supplier_out_of_stock in all regions. Both caps therefore ship **Pastel Mint**;
   swap seal-cap to Pink/Blue when restocked (2-line change, variant ids above).

## Catalog changes this pass

- `good-morning-cap` + `seal-cap` → PF 481, color **Pastel Mint**, placement
  `front_dtf_hat`, side mark unchanged. (Navy/black colorways don't exist on 481.)
- `mutetv-tee` dropped **3XL** — Bella+Canvas 3001 has no Teal 3XL variant; an order
  would have failed at fulfillment.
- `sync-merch.mjs`: `cap_print → 481` anchor added; side-logo rule now covers
  `cap_print`. `verify-orders.mjs`: `cap_print` placement whitelist = `front_dtf_hat`.

## Margin flag (no change made)

481 costs $17.95 + $2.95 (DTF front) + $2.95 (left embroidery) = **$23.85** before
shipping vs **$27.99** retail. Consider $32.99–34.99 (old luxe-cap territory) when
reviewing prices.
