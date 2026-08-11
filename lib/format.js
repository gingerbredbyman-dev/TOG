// Client-safe helpers (no catalog import — keeps products.json out of the client bundle).
export function formatPrice(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

// Print files live in /designs (full res, Printful downloads these).
// Browsers get the /web webp derivative (<=800px).
export function webPath(designPath) {
  if (!designPath?.startsWith("/designs/")) return designPath;
  return designPath.replace("/designs/", "/web/").replace(/\.png$/, ".webp");
}
