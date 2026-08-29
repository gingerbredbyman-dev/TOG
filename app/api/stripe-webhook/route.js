import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { allProductsRaw } from "../../../lib/catalog";
import map from "../../../data/printful-map.json";

const STRIPE_API_VERSION = "2025-02-24.acacia";
const PF = "https://api.printful.com";

// Stripe -> paid order -> Printful per-order fulfillment.
// Safety properties:
//  - idempotent: checks Printful for an existing order with this session id first
//  - only fulfills sessions whose payment_status is "paid"
//  - guarded awaits: transient errors -> 500 (Stripe retries, dedupe absorbs them);
//    permanent errors -> 200 + alert (no retry storm, humans notified)

function pfHeaders() {
  return {
    Authorization: `Bearer ${process.env.PRINTFUL_API_KEY}`,
    "X-PF-Store-ID": process.env.PRINTFUL_STORE_ID,
    "Content-Type": "application/json",
  };
}

async function alert(msg) {
  console.error("[FULFILLMENT ALERT]", msg);
  if (process.env.ALERT_NTFY_URL) {
    try {
      await fetch(process.env.ALERT_NTFY_URL, {
        method: "POST",
        body: `TOGG store: ${msg}`,
        headers: { Title: "TOGG fulfillment", Priority: "high", Tags: "warning" },
      });
    } catch {
      /* alerting must never take the webhook down */
    }
  }
}

export async function POST(req) {
  const payload = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const { default: Stripe } = await import("stripe");
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: STRIPE_API_VERSION,
  });

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

  // Delayed payment methods complete later via async_payment_succeeded.
  const fulfillable =
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded";
  if (!fulfillable) return NextResponse.json({ received: true });

  let full;
  try {
    full = await stripe.checkout.sessions.retrieve(event.data.object.id, {
      expand: ["line_items"],
    });
  } catch (err) {
    console.error("session retrieve failed (transient):", err.message);
    return NextResponse.json({ error: "retry" }, { status: 500 });
  }

  if (full.payment_status !== "paid") {
    return NextResponse.json({ received: true, skipped: "unpaid" });
  }

  // Fulfillment lines come from session metadata: cart JSON sharded across
  // cart0..cartN keys (Stripe caps each value at 500 chars). Legacy single-item
  // sessions carried productId/edition/size instead.
  const md = full.metadata || {};
  let cartLines = null;
  if (md.cartv === "1") {
    let joined = "";
    for (let i = 0; md[`cart${i}`] !== undefined; i++) joined += md[`cart${i}`];
    try {
      const parsed = JSON.parse(joined);
      if (Array.isArray(parsed) && parsed.length) cartLines = parsed;
    } catch {
      /* unreadable — handled by the alert below */
    }
  } else if (md.productId) {
    cartLines = [
      {
        i: md.productId,
        e: md.edition || "standard",
        s: md.size || "",
        q: full.line_items?.data?.[0]?.quantity || 1,
      },
    ];
  }
  if (!cartLines) {
    await alert(`paid session ${full.id} has no/unreadable cart metadata`);
    return NextResponse.json({ received: true, fulfillment: "no-metadata" });
  }

  // Raw lookup: a product hidden AFTER purchase must still fulfill.
  const all = await allProductsRaw();
  const unknown = cartLines.filter((l) => !all.some((p) => p.id === l.i));
  if (unknown.length) {
    await alert(
      `paid session ${full.id} references unknown product(s): ${unknown
        .map((l) => l.i)
        .join(", ")}`
    );
    return NextResponse.json({ received: true, fulfillment: "no-metadata" });
  }
  const ship = full.collected_information?.shipping_details || full.shipping_details;
  if (!ship?.address) {
    await alert(`paid session ${full.id} (${cartLines.map((l) => l.i).join(", ")}) has no shipping address`);
    return NextResponse.json({ received: true, fulfillment: "no-address" });
  }

  if (
    process.env.FULFILL !== "on" ||
    !process.env.PRINTFUL_API_KEY ||
    !process.env.PRINTFUL_STORE_ID
  ) {
    console.log(
      `[dry-run fulfillment] ${cartLines
        .map((l) => `${l.i}:${l.e}:${l.s} x${l.q}`)
        .join(" + ")} for session ${full.id}`
    );
    return NextResponse.json({ received: true, fulfillment: "dry-run" });
  }

  if (!Object.keys(map).length) {
    await alert("FULFILL=on but printful-map.json is EMPTY — run `npm run sync`, commit, redeploy");
    return NextResponse.json({ received: true, fulfillment: "unmapped" });
  }

  const orderItems = [];
  const unmapped = [];
  for (const l of cartLines) {
    const key = `${l.i}:${l.e || "standard"}:${l.s || "default"}`;
    const quantity = Math.min(10, Math.max(1, Math.floor(Number(l.q)) || 1));
    if (!map[key]) unmapped.push(key);
    else orderItems.push({ sync_variant_id: map[key], quantity });
  }
  if (unmapped.length) {
    // Never partially fulfill a paid order — all lines or none, humans decide.
    await alert(
      `paid but UNMAPPED variant(s) ${unmapped.join(", ")} (session ${full.id}) — manual order needed`
    );
    return NextResponse.json({ received: true, fulfillment: "unmapped" });
  }

  // Printful caps external_id at 32 chars; Stripe session ids are ~66. A stable
  // hash keeps idempotency: same session always derives the same external_id.
  const extId = createHash("sha256").update(full.id).digest("hex").slice(0, 32);

  // Idempotency: Stripe delivers at-least-once. Has this session already been ordered?
  try {
    const dup = await fetch(`${PF}/orders/@${extId}`, { headers: pfHeaders() });
    if (dup.ok) {
      console.log("duplicate webhook delivery — order already exists for", full.id);
      return NextResponse.json({ received: true, fulfillment: "duplicate" });
    }
    if (dup.status !== 404) {
      console.error("dedupe check failed (transient):", dup.status);
      return NextResponse.json({ error: "retry" }, { status: 500 });
    }
  } catch (err) {
    console.error("dedupe check failed (transient):", err.message);
    return NextResponse.json({ error: "retry" }, { status: 500 });
  }

  let pfRes, pfJson;
  try {
    pfRes = await fetch(`${PF}/orders?confirm=true`, {
      method: "POST",
      headers: pfHeaders(),
      body: JSON.stringify({
        external_id: extId,
        recipient: {
          name: ship.name,
          address1: ship.address.line1,
          address2: ship.address.line2 || undefined,
          city: ship.address.city,
          state_code: ship.address.state,
          country_code: ship.address.country,
          zip: ship.address.postal_code,
        },
        items: orderItems,
      }),
    });
    pfJson = await pfRes.json().catch(() => ({}));
  } catch (err) {
    console.error("Printful create failed (transient):", err.message);
    return NextResponse.json({ error: "retry" }, { status: 500 });
  }

  if (!pfRes.ok) {
    // 4xx = permanent (bad address, discontinued variant): alert, no retry storm.
    // 5xx = transient: let Stripe retry; dedupe check absorbs double-sends.
    if (pfRes.status >= 500) {
      console.error("Printful 5xx (transient):", JSON.stringify(pfJson).slice(0, 300));
      return NextResponse.json({ error: "retry" }, { status: 500 });
    }
    await alert(
      `Printful REJECTED order for ${cartLines.map((l) => l.i).join(", ")} (session ${full.id}): ${JSON.stringify(pfJson).slice(0, 200)}`
    );
    return NextResponse.json({ received: true, fulfillment: "rejected" });
  }

  console.log("Printful order created:", pfJson?.result?.id, "for", full.id);
  // Good-news ping (never blocks the response; no customer address in the message).
  if (process.env.ALERT_NTFY_URL) {
    try {
      await fetch(process.env.ALERT_NTFY_URL, {
        method: "POST",
        body: `SALE printed: $${(full.amount_total / 100).toFixed(2)} — ${cartLines
          .map((l) => `${l.i} x${l.q}`)
          .join(", ")} (PF #${pfJson?.result?.id})`,
        headers: { Title: "TOGG sale", Priority: "default", Tags: "tada" },
      });
    } catch {
      /* never fail the webhook over a ping */
    }
  }
  return NextResponse.json({ received: true, fulfillment: "created" });
}
