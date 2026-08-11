import { NextResponse } from "next/server";
import seed from "../../../../data/products.json";
import { supabaseConfigured, allProductsRaw } from "../../../../lib/catalog";

// Admin CRUD for products. Auth: x-admin-password header checked against
// ADMIN_PASSWORD env (set it in .env.local / Vercel). Writes require Supabase.

const SUPA = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function authed(req) {
  const pw = process.env.ADMIN_PASSWORD;
  return Boolean(pw) && req.headers.get("x-admin-password") === pw;
}

async function supa(path, opts = {}) {
  const res = await fetch(`${SUPA}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation,resolution=merge-duplicates",
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

export async function GET(req) {
  if (!authed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const products = await allProductsRaw();
  return NextResponse.json({
    products,
    sections: seed.sections,
    editable: supabaseConfigured() && Boolean(KEY),
  });
}

export async function POST(req) {
  if (!authed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!supabaseConfigured() || !KEY)
    return NextResponse.json(
      { error: "Editing needs Supabase — see README 'Admin setup'." },
      { status: 503 }
    );
  const { product, sort } = await req.json();
  if (!product?.id || !/^[a-z0-9-]+$/.test(product.id))
    return NextResponse.json({ error: "Product needs a kebab-case id" }, { status: 400 });
  const row = { id: product.id, sort: sort ?? 999, data: product };
  const saved = await supa("products?on_conflict=id", {
    method: "POST",
    body: JSON.stringify([row]),
  });
  return NextResponse.json({ ok: true, saved: saved?.[0]?.id });
}

export async function DELETE(req) {
  if (!authed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!supabaseConfigured() || !KEY)
    return NextResponse.json({ error: "Editing needs Supabase" }, { status: 503 });
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await supa(`products?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
  return NextResponse.json({ ok: true });
}
