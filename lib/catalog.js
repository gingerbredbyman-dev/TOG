import catalog from "../data/products.json";

export function allSections() {
  return catalog.sections.map((s) => ({
    ...s,
    products: catalog.products.filter((p) => p.section === s.id),
  }));
}

export function getProduct(id) {
  return catalog.products.find((p) => p.id === id) || null;
}

export function formatPrice(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function editionsOf(product) {
  return Object.keys(product.editions || {});
}
