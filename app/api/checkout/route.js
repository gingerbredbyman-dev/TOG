import { NextResponse } from "next/server";
import { getProduct } from "../../../lib/catalog";

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const { productId, edition = "standard", size = null } = body || {};
  const product = getProduct(productId);
  if (!product || product.comingSoon) {
    return NextResponse.json({ error: "Unknown product" }, { status: 404 });
  }
  if (!product.editions[edition]) {
    return NextResponse.json({ error: "Unknown edition" }, { status: 400 });
  }
  if (product.sizes && size && !product.sizes.includes(size)) {
    return NextResponse.json({ error: "Unknown size" }, { status: 400 });
  }

  const origin =
    req.headers.get("origin") ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:5396";

  // Demo mode: fully clickable store before Mike's Stripe keys exist.
  if (!process.env.STRIPE_SECRET_KEY) {
    if (process.env.DEMO_CHECKOUT === "1") {
      return NextResponse.json({ url: `${origin}/success?demo=1` });
    }
    return NextResponse.json(
      { error: "Checkout not connected yet — Stripe keys pending." },
      { status: 503 }
    );
  }

  const { default: Stripe } = await import("stripe");
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  const editionLabel =
    Object.keys(product.editions).length > 1 && !product.unifiedEdition
      ? edition === "ethical"
        ? " — Ethical Edition"
        : " — Standard Edition"
      : "";

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: product.priceCents, // server-side price — never trust the client
          product_data: {
            name: `${product.name}${editionLabel}${size ? ` (${size})` : ""}`,
            images: [`${origin}${product.editions[edition].image}`],
          },
        },
        quantity: 1,
        adjustable_quantity: { enabled: true, minimum: 1, maximum: 10 },
      },
    ],
    shipping_address_collection: { allowed_countries: ["US", "CA"] },
    phone_number_collection: { enabled: false },
    metadata: { productId, edition, size: size || "" },
    success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/p/${productId}`,
  });

  return NextResponse.json({ url: session.url });
}
