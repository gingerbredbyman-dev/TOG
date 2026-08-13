import { NextResponse } from "next/server";
import { getProduct } from "../../../lib/catalog";
import { webPath } from "../../../lib/format";

const STRIPE_API_VERSION = "2025-02-24.acacia";

// Server-controlled origin only — never trust the Origin header (phishing vector:
// attacker-supplied origin would become the Stripe success_url redirect).
function siteOrigin() {
  return (
    process.env.SITE_ORIGIN ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:5396"
  );
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const { productId, edition = "standard", size = null } = body || {};
  const product = await getProduct(productId);
  if (!product || product.comingSoon) {
    return NextResponse.json({ error: "Unknown product" }, { status: 404 });
  }
  if (!Object.prototype.hasOwnProperty.call(product.editions, edition)) {
    return NextResponse.json({ error: "Unknown edition" }, { status: 400 });
  }
  // Sized products REQUIRE a valid size (metadata drives fulfillment mapping).
  if (product.sizes?.length && !product.sizes.includes(size)) {
    return NextResponse.json({ error: "Pick a size" }, { status: 400 });
  }

  const origin = siteOrigin();

  // Demo mode: preview-only. Refuses to run in production builds.
  if (!process.env.STRIPE_SECRET_KEY) {
    if (process.env.DEMO_CHECKOUT === "1" && process.env.NODE_ENV !== "production") {
      return NextResponse.json({ url: `${origin}/success?demo=1` });
    }
    return NextResponse.json(
      { error: "Checkout not connected yet — Stripe keys pending." },
      { status: 503 }
    );
  }

  const { default: Stripe } = await import("stripe");
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: STRIPE_API_VERSION,
  });

  const editionLabel =
    Object.keys(product.editions).length > 1 && !product.unifiedEdition
      ? ` — ${edition[0].toUpperCase()}${edition.slice(1)} Edition`
      : "";

  const shipCents = product.shipCents ?? 499;

  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: product.priceCents, // server-side price — never trust the client
            product_data: {
              name: `${product.name}${editionLabel}${size ? ` (${size})` : ""}`,
              images: [`${origin}${webPath(product.editions[edition].image)}`],
            },
          },
          quantity: 1,
          adjustable_quantity: { enabled: true, minimum: 1, maximum: 10 },
        },
      ],
      shipping_options: [
        {
          shipping_rate_data: {
            display_name: "Standard shipping (printed per order)",
            type: "fixed_amount",
            fixed_amount: { amount: shipCents, currency: "usd" },
            delivery_estimate: {
              minimum: { unit: "business_day", value: 5 },
              maximum: { unit: "business_day", value: 10 },
            },
          },
        },
      ],
      shipping_address_collection: { allowed_countries: ["US", "CA"] },
      metadata: { productId, edition, size: size || "" },
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/p/${productId}`,
    });
  } catch (err) {
    console.error("checkout session create failed:", err.message);
    return NextResponse.json({ error: "Checkout unavailable, try again." }, { status: 502 });
  }

  return NextResponse.json({ url: session.url });
}
