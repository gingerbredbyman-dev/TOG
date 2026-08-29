// Client-side cart, persisted in localStorage. Lines: { id, edition, size, qty }.
// All pricing happens server-side (/api/cart-quote, /api/checkout) — the client
// stores only what was picked.
const KEY = "togg-cart-v1";
const EVT = "togg-cart";
const OPEN_EVT = "togg-cart-open";
export const MAX_QTY = 10;

export function readCart() {
  try {
    const arr = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(arr)
      ? arr.filter((l) => l && typeof l.id === "string" && l.qty > 0)
      : [];
  } catch {
    return [];
  }
}

function write(lines) {
  localStorage.setItem(KEY, JSON.stringify(lines));
  window.dispatchEvent(new CustomEvent(EVT));
}

export function addToCart({ id, edition = "standard", size = null, qty = 1 }) {
  const lines = readCart();
  const hit = lines.find((l) => l.id === id && l.edition === edition && l.size === size);
  if (hit) hit.qty = Math.min(MAX_QTY, hit.qty + qty);
  else lines.push({ id, edition, size, qty: Math.min(MAX_QTY, qty) });
  write(lines);
}

// Lines are addressed by identity, not index — the drawer renders the server
// quote's order, which is not guaranteed to match localStorage order.
export function setLineQty({ id, edition = "standard", size = null }, qty) {
  const lines = readCart();
  const idx = lines.findIndex(
    (l) => l.id === id && l.edition === edition && l.size === size
  );
  if (idx === -1) return;
  if (qty <= 0) lines.splice(idx, 1);
  else lines[idx].qty = Math.min(MAX_QTY, qty);
  write(lines);
}

export function removeLine(line) {
  setLineQty(line, 0);
}

export function clearCart() {
  write([]);
}

export function cartCount() {
  return readCart().reduce((n, l) => n + l.qty, 0);
}

export function openCart() {
  window.dispatchEvent(new CustomEvent(OPEN_EVT));
}

// Ship-to country (US default). Changing it re-quotes shipping, so it fires
// the same change event the cart lines do.
const COUNTRY_KEY = "togg-ship-country";
export function cartCountry() {
  try {
    const c = localStorage.getItem(COUNTRY_KEY);
    return c === "CA" ? "CA" : "US";
  } catch {
    return "US";
  }
}
export function setCartCountry(c) {
  localStorage.setItem(COUNTRY_KEY, c === "CA" ? "CA" : "US");
  window.dispatchEvent(new CustomEvent(EVT));
}

// Fires on same-tab changes (custom event) and cross-tab changes (storage event).
export function onCartChange(fn) {
  window.addEventListener(EVT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(EVT, fn);
    window.removeEventListener("storage", fn);
  };
}

export function onCartOpen(fn) {
  window.addEventListener(OPEN_EVT, fn);
  return () => window.removeEventListener(OPEN_EVT, fn);
}
