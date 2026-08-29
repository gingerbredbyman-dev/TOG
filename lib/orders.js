import { allProductsRaw } from "./catalog";
import { cartShippingCents, SHIP_COUNTRIES } from "./shipping";
import { sageCents } from "./pricing";

export const MAX_CART_LINES = 20;
export const MAX_LINE_QTY = 10;

// Validate + price a cart entirely server-side. Client sends only
// [{ id, edition, size, qty }] and a ship country; every price comes from the
// catalog here. Used by BOTH /api/cart-quote (drawer display) and /api/checkout
// (the actual Stripe charge) so what the drawer shows is exactly what Stripe
// collects. Returns { error } or
// { lines, country, subtotalCents, shippingCents, sageCents, totalCents }.
export async function resolveCart(items, country = "US") {
  if (!SHIP_COUNTRIES.includes(country)) return { error: "We only ship to the US and Canada right now" };
  if (!Array.isArray(items) || !items.length) return { error: "Cart is empty" };
  if (items.length > MAX_CART_LINES)
    return { error: `Too many different items — ${MAX_CART_LINES} max per order` };

  const all = await allProductsRaw();
  const lines = [];
  for (const raw of items) {
    const { id, edition = "standard", size = null } = raw || {};
    const qty = Math.floor(Number(raw?.qty ?? 1));
    if (!Number.isFinite(qty) || qty < 1 || qty > MAX_LINE_QTY)
      return { error: `Quantity must be 1–${MAX_LINE_QTY} (${id})` };
    const product = all.find((p) => p.id === id) || null;
    if (!product || product.hidden || product.comingSoon)
      return { error: `Unknown product: ${id}` };
    if (!Object.prototype.hasOwnProperty.call(product.editions || {}, edition))
      return { error: `Unknown edition for ${id}` };
    // Sized products REQUIRE a valid size (metadata drives fulfillment mapping).
    if (product.sizes?.length && !product.sizes.includes(size))
      return { error: `Pick a size for ${product.name}` };

    const dup = lines.find(
      (l) => l.id === id && l.edition === edition && l.size === size
    );
    if (dup) dup.qty = Math.min(MAX_LINE_QTY, dup.qty + qty);
    else lines.push({ id, edition, size, qty, product });
  }

  const subtotalCents = lines.reduce((n, l) => n + l.product.priceCents * l.qty, 0);
  const shippingCents = cartShippingCents(lines, country);
  return {
    lines,
    country,
    subtotalCents,
    shippingCents,
    sageCents: sageCents(subtotalCents),
    totalCents: subtotalCents + shippingCents,
  };
}
