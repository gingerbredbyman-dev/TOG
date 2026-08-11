import { NextResponse } from "next/server";
import { getProduct } from "../../../lib/catalog";

// Stripe -> paid order -> Printful per-order fulfillment.
// FULFILL=off  : logs the would-be Printful order (dry run) and returns 200.
// FULFILL=on   : creates + confirms the Printful order (requires PRINTFUL_API_KEY,
//                PRINTFUL_STORE_ID and a synced variant map from scripts/sync-merch.mjs).

export async function POST(req) {
  const payload = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const { default: Stripe } = await import("stripe");
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      payload,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return NextResponse.json({ error: `Bad signature: ${err.message}` }, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object;
  const full = await stripe.checkout.sessions.retrieve(session.id, {
    expand: ["line_items"],
  });

  const { productId, edition, size } = full.metadata || {};
  const product = getProduct(productId);
  const qty = full.line_items?.data?.[0]?.quantity || 1;
  const ship = full.collected_information?.shipping_details || full.shipping_details;

  const origin = process.env.NEXT_PUBLIC_SITE_URL || "https://example.com";
  const ed = product?.editions?.[edition || "standard"] || {};
  const files = [{ type: "default", url: `${origin}${ed.image}` }];
  if (product?.twoSided && ed.back) files.push({ type: "back", url: `${origin}${ed.back}` });

  const draftOrder = {
    external_id: session.id,
    recipient: ship
      ? {
          name: ship.name,
          address1: ship.address?.line1,
          address2: ship.address?.line2 || undefined,
          city: ship.address?.city,
          state_code: ship.address?.state,
          country_code: ship.address?.country,
          zip: ship.address?.postal_code,
        }
      : null,
    items: [
      {
        quantity: qty,
        // sync_variant_id is resolved from data/printful-map.json (written by sync-merch)
        _resolve: { productId, edition, size },
        files,
      },
    ],
  };

  if (process.env.FULFILL !== "on" || !process.env.PRINTFUL_API_KEY) {
    console.log("[dry-run fulfillment] would create Printful order:", JSON.stringify(draftOrder));
    return NextResponse.json({ received: true, fulfillment: "dry-run" });
  }

  // Live path: resolve the synced variant and create the order.
  const { readFileSync } = await import("fs");
  const { join } = await import("path");
  let map = {};
  try {
    map = JSON.parse(readFileSync(join(process.cwd(), "data", "printful-map.json"), "utf8"));
  } catch {
    console.error("printful-map.json missing — run `npm run sync` first");
    return NextResponse.json({ received: true, fulfillment: "unmapped" });
  }

  const key = `${productId}:${edition || "standard"}:${size || "default"}`;
  const syncVariantId = map[key];
  if (!syncVariantId) {
    console.error("No Printful variant mapped for", key);
    return NextResponse.json({ received: true, fulfillment: "unmapped" });
  }

  const pfRes = await fetch("https://api.printful.com/orders?confirm=true", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PRINTFUL_API_KEY}`,
      "X-PF-Store-ID": process.env.PRINTFUL_STORE_ID,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      external_id: session.id,
      recipient: draftOrder.recipient,
      items: [{ sync_variant_id: syncVariantId, quantity: qty }],
    }),
  });
  const pfJson = await pfRes.json();
  if (!pfRes.ok) {
    console.error("Printful order failed:", JSON.stringify(pfJson));
    return NextResponse.json({ received: true, fulfillment: "failed" });
  }

  console.log("Printful order created:", pfJson?.result?.id);
  return NextResponse.json({ received: true, fulfillment: "created" });
}
