// One-time: create the products table and seed it from data/products.json.
// Run:  node --env-file-if-exists=.env.local scripts/seed-supabase.mjs
// Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. Safe to re-run (upserts).
// Table DDL (run in Supabase SQL editor once — the script prints it too):
//   create table if not exists products (
//     id text primary key,
//     sort int,
//     data jsonb not null,
//     updated_at timestamptz default now()
//   );
//   alter table products enable row level security;  -- service role bypasses RLS

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const seed = JSON.parse(readFileSync(join(ROOT, "data", "products.json"), "utf8"));

const SUPA = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA || !KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.");
  console.error("Create the table with the DDL in this file's header, then re-run.");
  process.exit(1);
}

const rows = seed.products.map((p, i) => ({ id: p.id, sort: i, data: p }));
const res = await fetch(`${SUPA}/rest/v1/products?on_conflict=id`, {
  method: "POST",
  headers: {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates",
  },
  body: JSON.stringify(rows),
});
if (!res.ok) {
  console.error("Seed failed:", res.status, (await res.text()).slice(0, 300));
  process.exit(1);
}
console.log(`Seeded ${rows.length} products into Supabase ✓ — /admin can now edit them.`);
