import { NextResponse } from "next/server";
import { resolveCart } from "../../../lib/orders";
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

  // Cart checkout: { items: [{ id, edition, size, qty }], country }.
  // Legacy single-item body { productId, edition, size } still accepted.
  const items = Array.isArray(body?.items)
    ? body.items
    : body?.productId
      ? [{ id: body.productId, edition: body.edition, size: body.size, qty: 1 }]
      : null;

  const cart = await resolveCart(items, body?.country || "US");
  if (cart.error) {
    const missing = /Unknown product/.test(cart.error) ? 404 : 400;
    return NextResponse.json({ error: cart.error }, { status: missing });
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

  // Stripe Tax: buyer pays their own jurisdiction's sales tax at checkout.
  // Requires activation + registrations in the Stripe dashboard first, so it is
  // gated behind STRIPE_TAX=on (a session with automatic_tax but no dashboard
  // setup would error for every buyer).
  const taxOn = process.env.STRIPE_TAX === "on";

  const line_items = cart.lines.map((l) => {
    const editionLabel =
      Object.keys(l.product.editions).length > 1 && !l.product.unifiedEdition
        ? ` — ${l.edition[0].toUpperCase()}${l.edition.slice(1)} Edition`
        : "";
    return {
      price_data: {
        currency: "usd",
        unit_amount: l.product.priceCents, // server-side price — never trust the client
        ...(taxOn ? { tax_behavior: "exclusive" } : {}),
        product_data: {
          name: `${l.product.name}${editionLabel}${l.size ? ` (${l.size})` : ""}`,
          images: [`${origin}${webPath(l.product.editions[l.edition].image)}`],
        },
      },
      quantity: l.qty,
      // Quantities are managed in the cart; letting Stripe change them here
      // would desync the fulfillment metadata below.
    };
  });

  // Fulfillment source of truth. Stripe caps metadata values at 500 chars, so
  // the cart JSON is sharded across cart0..cartN keys; the webhook re-joins.
  const cartJson = JSON.stringify(
    cart.lines.map((l) => ({ i: l.id, e: l.edition, s: l.size || "", q: l.qty }))
  );
  const metadata = {
    cartv: "1",
    ship_country: cart.country,
    // The SAGE earmark lives on the session itself: Stripe is the donation
    // ledger (scripts/sage-report.mjs sums it across paid sessions).
    sage_cents: String(cart.sageCents),
  };
  for (let i = 0; i * 450 < cartJson.length; i++) {
    metadata[`cart${i}`] = cartJson.slice(i * 450, (i + 1) * 450);
  }

  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      ...(taxOn ? { automatic_tax: { enabled: true } } : {}),
      shipping_options: [
        {
          shipping_rate_data: {
            display_name: "Standard shipping (printed per order)",
            type: "fixed_amount",
            fixed_amount: { amount: cart.shippingCents, currency: "usd" },
            ...(taxOn ? { tax_behavior: "exclusive" } : {}),
            delivery_estimate: {
              minimum: { unit: "business_day", value: 5 },
              maximum: { unit: "business_day", value: 10 },
            },
          },
        },
      ],
      // The rate above was quoted for THIS country — lock the address form to it
      // so the buyer can't pay a US rate on a Canadian delivery.
      shipping_address_collection: { allowed_countries: [cart.country] },
      metadata,
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:
        cart.lines.length === 1 ? `${origin}/p/${cart.lines[0].id}` : `${origin}/`,
    });
  } catch (err) {
    console.error("checkout session create failed:", err.message);
    return NextResponse.json({ error: "Checkout unavailable, try again." }, { status: 502 });
  }

  return NextResponse.json({ url: session.url });
}
