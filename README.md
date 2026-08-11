# tog-store — The Official Gay Guy merch storefront

Next.js storefront with Stripe Checkout + Printful per-order fulfillment.
Every product ships in Standard and (mostly) Ethical editions from
`../theofficialgayguy-site/merch-line-2026/`.

## Run

```bash
npm install
npm run dev        # or the launch.json "togstore" entry (port 5396)
```

No env needed for preview: `DEMO_CHECKOUT=1` default makes checkout return a fake
success page. Real mode: copy `.env.example` → `.env.local` and fill keys
(see MIKE-HANDOVER.md for who provides what).

## Pieces

- `data/products.json` — the single source of truth: products, prices, editions,
  garment colors, Printful type mapping. Edit → redeploy. That's catalog management.
- `public/designs/` — transparent print files (also what Printful downloads).
- `app/api/checkout` — creates Stripe Checkout Sessions (server-side prices).
- `app/api/stripe-webhook` — `checkout.session.completed` → Printful order.
  `FULFILL=off` logs a dry-run payload instead of ordering.
- `scripts/sync-merch.mjs` — pushes catalog into Printful (file upload → sync
  products → variant map in `data/printful-map.json`). `--dry-run` validates.
- `MIKE-HANDOVER.md` — the owner onboarding doc.

## Launch sequence (ORDER MATTERS — the variant map is bundled at build time)

1. `npm run sync -- --dry-run` (catalog sanity)
2. First deploy: `vercel --prod` (site must be public so Printful can download print files)
3. Mike: Stripe teammate invite + Printful billing (MIKE-HANDOVER.md)
4. Set env on Vercel: STRIPE_*, PRINTFUL_API_KEY, PRINTFUL_STORE_ID,
   SITE_ORIGIN=https://<domain>, NEXT_PUBLIC_SITE_URL=https://<domain>, remove DEMO_CHECKOUT
5. Stripe dashboard → Webhooks → add `https://<domain>/api/stripe-webhook`
   (events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`)
   → copy signing secret to env
6. `npm run sync` (creates/updates Printful products) → **commit the regenerated
   `data/printful-map.json` → `vercel --prod` again** (bundles the fresh map)
7. Test-mode order → refund → set `FULFILL=on` (+ optional ALERT_NTFY_URL) → redeploy
   → real sticker order to Mike's house

## Not yet / later

- Cart (multi-item) — v2; per-item Buy Now ships first
- Certification-series tees (Ally/Straight Mate/Fan) — standard-edition files
  pending a crop pass; marked `comingSoon`
- Space Rock stickers + head-wordmark sticker — awaiting file drop
- Printful mockup images on product cards (sync script fetches them post-keys)
