// Combined-cart shipping. Mirrors print-on-demand reality: the priciest line
// establishes the base parcel, every additional unit rides along cheaper.
// Mugs box separately (higher add-on), stickers ride nearly free.
const ADDITIONAL_CENTS = { mug: 400, sticker: 100, tshirt: 200, cap: 200, cap_print: 200 };
const additionalRate = (type) => ADDITIONAL_CENTS[type] ?? 200;

// lines: [{ product, qty }] -> total shipping in cents.
// A single item at qty 1 pays exactly its product.shipCents (unchanged from the
// one-item checkout this replaces).
export function cartShippingCents(lines) {
  const units = lines.filter((l) => l?.product && l.qty > 0);
  if (!units.length) return 0;
  const sorted = [...units].sort(
    (a, b) => (b.product.shipCents ?? 499) - (a.product.shipCents ?? 499)
  );
  let total = 0;
  let first = true;
  for (const l of sorted) {
    for (let i = 0; i < l.qty; i++) {
      if (first) {
        total += l.product.shipCents ?? 499;
        first = false;
      } else {
        total += additionalRate(l.product.pf?.type);
      }
    }
  }
  return total;
}
