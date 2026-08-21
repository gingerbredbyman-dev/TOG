import { allProductsRaw } from "./catalog";
import { cartShippingCents } from "./shipping";

export const MAX_CART_LINES = 20;
export const MAX_LINE_QTY = 10;

// Validate + price a cart entirely server-side. Client sends only
// [{ id, edition, size, qty }]; every price comes from the catalog here.
// Used by BOTH /api/cart-quote (drawer display) and /api/checkout (the actual
// Stripe charge) so what the drawer shows is exactly what Stripe collects.
// Returns { error } or { lines, subtotalCents, shippingCents, totalCents }.
export async function resolveCart(items) {
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
  const shippingCents = cartShippingCents(lines);
  return { lines, subtotalCents, shippingCents, totalCents: subtotalCents + shippingCents };
}
