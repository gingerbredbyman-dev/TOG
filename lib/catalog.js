import seed from "../data/products.json";

// Catalog source of truth:
//  - If Supabase env is configured, products live in the `products` table and are
//    fully editable from /admin (add / edit / hide / delete) — no deploys needed.
//  - Otherwise falls back to the bundled data/products.json seed (demo mode).
// scripts/seed-supabase.mjs pushes the JSON seed into the table once.

const SUPA = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

export function supabaseConfigured() {
  return Boolean(SUPA && SUPA_KEY);
}

async function fetchProducts() {
  if (!supabaseConfigured()) return seed.products;
  try {
    const res = await fetch(
      `${SUPA}/rest/v1/products?select=data&order=sort.asc.nullslast`,
      {
        headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
        cache: "no-store",
      }
    );
    if (!res.ok) throw new Error(`supabase ${res.status}`);
    const rows = await res.json();
    if (!rows.length) return seed.products;
    return rows.map((r) => r.data);
  } catch (e) {
    console.error("catalog: supabase fetch failed, using bundled seed:", e.message);
    return seed.products;
  }
}

export async function allSections({ includeHidden = false } = {}) {
  const products = await fetchProducts();
  return seed.sections.map((s) => ({
    ...s,
    products: products.filter(
      (p) => p.section === s.id && (includeHidden || !p.hidden)
    ),
  }));
}

export async function getProduct(id) {
  const products = await fetchProducts();
  const p = products.find((x) => x.id === id) || null;
  return p && !p.hidden ? p : null;
}

export async function allProductsRaw() {
  return fetchProducts();
}
