// Printful's own rates, quoted live via /orders/estimate-costs 2026-08-22 and
// verified EXACT against 4 mixed-basket estimates (tee+mug, cap+sticker,
// tee+sticker, tee+cap+mug+2 stickers) plus the first real order. THE single
// source of truth for shipping — regenerate with the pf-audit scripts if
// Printful ever reprices, and `npm run audit` warns when products.json drifts.
export const RATES = {
  US: {
    tshirt: { first: 495, addl: 220 },
    cap: { first: 469, addl: 200 },
    cap_print: { first: 469, addl: 200 },
    mug: { first: 669, addl: 350 },
    sticker: { first: 449, addl: 5 },
  },
  CA: {
    tshirt: { first: 859, addl: 195 },
    cap: { first: 789, addl: 195 },
    cap_print: { first: 789, addl: 195 },
    mug: { first: 809, addl: 470 },
    sticker: { first: 519, addl: 10 },
  },
};

export const SHIP_COUNTRIES = ["US", "CA"];

// Shipping mirrors how Printful ACTUALLY parcels an order (verified exact
// against live estimates — see data/shipping-rates.json provenance):
//   - tees bag together (first rate + addl per extra unit)
//   - caps box separately, mugs box separately
//   - stickers ride inside any existing parcel for pennies; alone they pay a
//     full first rate
// Charging PF's own rates makes shipping a pass-through: it can't lose money.
export function cartShippingCents(lines, country = "US") {
  const R = RATES[country] || RATES.US;
  const buckets = { apparel: 0, cap: 0, mug: 0, sticker: 0 };
  for (const l of lines) {
    if (!l?.product || !(l.qty > 0)) continue;
    const t = l.product.pf?.type;
    if (t === "mug") buckets.mug += l.qty;
    else if (t === "cap" || t === "cap_print") buckets.cap += l.qty;
    else if (t === "sticker") buckets.sticker += l.qty;
    else buckets.apparel += l.qty;
  }
  let total = 0;
  let hasParcel = false;
  for (const [count, type] of [
    [buckets.apparel, "tshirt"],
    [buckets.cap, "cap"],
    [buckets.mug, "mug"],
  ]) {
    if (!count) continue;
    total += R[type].first + R[type].addl * (count - 1);
    hasParcel = true;
  }
  if (buckets.sticker) {
    total += hasParcel
      ? R.sticker.addl * buckets.sticker
      : R.sticker.first + R.sticker.addl * (buckets.sticker - 1);
  }
  return total;
}
