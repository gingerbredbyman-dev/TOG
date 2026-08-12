# Contributing / Release process

(Model per lizTheDeveloper/shipping-skills → release-process, adapted to this repo.)

## Branch model

- **`main` is production.** Vercel prod deploys from it. Nothing pushes to it
  directly — PRs only.
- Work happens on short-lived branches (`qa/*`, `feat/*`, `fix/*`) that PR into
  `main`.
- **A human promotes**: merging the PR and running `vercel --prod` are Austin's
  actions, never automated.

## Every PR carries a walkable test plan

Per shipping-skills → verify-release: the PR description contains a numbered
checkbox test plan (blocking vs non-blocking, `[changed]` / `[side-effect]` /
`[regression net]` tags) walked against a preview. Never tick a box for a step
that was not actually run.

## Gates

- `npm run build` must pass
- `node scripts/verify-orders.mjs` must pass (art→article correctness: files
  exist, placements valid for product type, two-sided pairing, print-resolution
  floors)
- `npm run sync -- --dry-run` must pass before any live sync

## Not machine-enforced (documented convention, not control)

- No CI service is wired yet — the three gates above are run locally before
  merging. Wire GitHub Actions when the repo lands on GitHub.
- `data/printful-map.json` must be regenerated + committed + redeployed after any
  catalog sync (the webhook bundles it at build time).
- `FULFILL=on` only after a walked test-mode order.
