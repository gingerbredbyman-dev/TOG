import { NextResponse } from "next/server";
import { resolveCart } from "../../../lib/orders";
import { webPath } from "../../../lib/format";

// Prices the cart for the drawer. Same resolveCart as /api/checkout, so the
// numbers shown are the numbers charged.
export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const cart = await resolveCart(body?.items);
  if (cart.error) return NextResponse.json({ error: cart.error }, { status: 400 });

  return NextResponse.json({
    lines: cart.lines.map((l) => ({
      id: l.id,
      edition: l.edition,
      size: l.size,
      qty: l.qty,
      name: l.product.name,
      priceCents: l.product.priceCents,
      lineCents: l.product.priceCents * l.qty,
      image: webPath(l.product.editions[l.edition].image),
      soldOut: false,
    })),
    subtotalCents: cart.subtotalCents,
    shippingCents: cart.shippingCents,
    totalCents: cart.totalCents,
  });
}
