import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { allProductsRaw } from "../../../lib/catalog";
import { sageCents as sagePct, orderProfitCents, stripeFeeCents } from "../../../lib/pricing";
import map from "../../../data/printful-map.json";

const STRIPE_API_VERSION = "2025-02-24.acacia";
const PF = "https://api.printful.com";

// Stripe -> paid order -> Printful per-order fulfillment.
// Safety properties:
//  - idempotent: checks Printful for an existing order with this session id first
//  - only fulfills sessions whose payment_status is "paid"
//  - PROFIT BACKSTOP: the Printful order is created as a DRAFT, its real costs
//    are compared against what the buyer paid (minus tax collected, Stripe's
//    fee, and the 5% SAGE earmark), and it is confirmed for production ONLY if
//    profit clears FULFILL_MIN_PROFIT_CENTS (default 0). Underwater orders stay
//    drafts + fire a critical alert — no order can auto-print at a loss.
//  - guarded awaits: transient errors -> 500 (Stripe retries, dedupe absorbs them);
//    permanent errors -> 200 + alert (no retry storm, humans notified)

function pfHeaders() {
  return {
    Authorization: `Bearer ${process.env.PRINTFUL_API_KEY}`,
    "X-PF-Store-ID": process.env.PRINTFUL_STORE_ID,
    "Content-Type": "application/json",
  };
}

async function notify(msg, { title = "TOGG fulfillment", priority = "high", tags = "warning" } = {}) {
  if (priority === "high") console.error("[FULFILLMENT ALERT]", msg);
  else console.log("[FULFILLMENT]", msg);
  if (process.env.ALERT_NTFY_URL) {
    try {
      await fetch(process.env.ALERT_NTFY_URL, {
        method: "POST",
        body: `TOGG store: ${msg}`,
        headers: { Title: title, Priority: priority, Tags: tags },
      });
    } catch {
      /* alerting must never take the webhook down */
    }
  }
}
const alert = (msg) => notify(msg);

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
    // A permanent 4xx (bad/rotated key, revoked permission) would loop as 500
    // until Stripe drops the event in ~3 days — with nobody told. Alert instead.
    const sc = err?.statusCode;
    if (sc && sc !== 429 && sc < 500) {
      await alert(
        `session retrieve PERMANENTLY failing (${sc}) for ${event.data.object.id} — check the Stripe key. Manual fulfillment needed.`
      );
      return NextResponse.json({ received: true, fulfillment: "retrieve-failed" });
    }
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
    const summary = cartLines.map((l) => `${l.i}:${l.e}:${l.s} x${l.q}`).join(" + ");
    console.log(`[dry-run fulfillment] ${summary} for session ${full.id}`);
    // Dry-run in PRODUCTION means money was collected and nothing will print —
    // exactly the silent failure that ate the first real order. Scream.
    if (process.env.NODE_ENV === "production") {
      await notify(
        `PAID ORDER NOT FULFILLED (fulfillment switched off): ${summary}, session ${full.id}. Fix the FULFILL env or place it by hand.`,
        { priority: "urgent", tags: "rotating_light" }
      );
    }
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

  // Idempotency: Stripe delivers at-least-once. If an order already exists and
  // is past draft, we're done. A leftover DRAFT (an earlier run died before the
  // profit gate, or a human hasn't released a held order) re-enters the gate.
  let pfOrder = null;
  let resuming = false;
  try {
    const dup = await fetch(`${PF}/orders/@${extId}`, { headers: pfHeaders() });
    if (dup.ok) {
      const dj = await dup.json();
      if (dj.result?.status === "draft") {
        pfOrder = dj.result;
        resuming = true;
        console.log("resuming existing draft", pfOrder.id, "for", full.id);
      } else {
        console.log("duplicate webhook delivery — order already exists for", full.id);
        return NextResponse.json({ received: true, fulfillment: "duplicate" });
      }
    } else if (dup.status === 429 || dup.status >= 500) {
      console.error("dedupe check failed (transient):", dup.status);
      return NextResponse.json({ error: "retry" }, { status: 500 });
    } else if (dup.status !== 404) {
      // Permanent 4xx (bad/rotated PF key): retrying can't heal it — alert.
      await alert(
        `Printful dedupe check PERMANENTLY failing (${dup.status}) for session ${full.id} — check the Printful key. Manual fulfillment needed.`
      );
      return NextResponse.json({ received: true, fulfillment: "pf-auth-failed" });
    }
  } catch (err) {
    console.error("dedupe check failed (transient):", err.message);
    return NextResponse.json({ error: "retry" }, { status: 500 });
  }

  // A resumed draft may exist because a HUMAN held it (profit floor) and then
  // refunded the buyer. Never auto-confirm over a refund; if the refund state
  // can't be read (restricted key), leave it for a human rather than guess.
  if (resuming) {
    try {
      const pi = await stripe.paymentIntents.retrieve(full.payment_intent, {
        expand: ["latest_charge"],
      });
      const ch = pi.latest_charge;
      if (ch?.refunded || (ch?.amount_refunded ?? 0) > 0) {
        await alert(
          `draft PF #${pfOrder.id} left UNCONFIRMED: payment for session ${full.id} was refunded. Cancel the draft in Printful if it should not ship.`
        );
        return NextResponse.json({ received: true, fulfillment: "refunded-skip" });
      }
    } catch {
      await alert(
        `draft PF #${pfOrder.id} needs MANUAL review: cannot verify refund state for session ${full.id}. Confirm or cancel it in Printful yourself.`
      );
      return NextResponse.json({ received: true, fulfillment: "resume-unverified" });
    }
  }

  // Step 1: create as DRAFT — nothing is billed or printed yet.
  if (!pfOrder) {
    let pfRes, pfJson;
    try {
      pfRes = await fetch(`${PF}/orders`, {
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
      console.error("Printful draft create failed (transient):", err.message);
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
    pfOrder = pfJson.result;
  }

  // Step 2: the profit gate, on REAL numbers.
  const pfTotalCents = Math.round(parseFloat(pfOrder.costs?.total || "0") * 100);
  const taxCollectedCents = full.total_details?.amount_tax || 0;
  const sageEarmarkCents = Number.isFinite(parseInt(md.sage_cents, 10))
    ? parseInt(md.sage_cents, 10)
    : sagePct(full.amount_subtotal || 0);
  // Exact Stripe fee when the key can read it; conservative estimate otherwise.
  // Fallback fee estimate must not be optimistic: non-US shipping means a
  // non-US-issued card is likely, and those carry Stripe's +1.5% surcharge.
  const intlCard = (md.ship_country || ship.address.country || "US") !== "US";
  let feeCents;
  try {
    const pi = await stripe.paymentIntents.retrieve(full.payment_intent, {
      expand: ["latest_charge.balance_transaction"],
    });
    feeCents =
      pi.latest_charge?.balance_transaction?.fee ??
      stripeFeeCents(full.amount_total, { intlCard });
  } catch {
    feeCents = stripeFeeCents(full.amount_total, { intlCard });
  }
  const profitCents = orderProfitCents({
    amountTotalCents: full.amount_total,
    taxCollectedCents,
    stripeFeeCents: feeCents,
    pfTotalCents,
    sageCents: sageEarmarkCents,
  });
  // A malformed env value ("$1.00") must fail SAFE to a 0 floor, not to NaN —
  // `profit < NaN` is always false, which would silently disable the gate.
  const minRaw = parseInt(process.env.FULFILL_MIN_PROFIT_CENTS || "0", 10);
  const minProfit = Number.isFinite(minRaw) ? minRaw : 0;
  const money = (c) => `$${(c / 100).toFixed(2)}`;

  if (profitCents < minProfit) {
    await notify(
      `ORDER HELD (draft PF #${pfOrder.id}): profit ${money(profitCents)} below floor ${money(minProfit)}. ` +
        `Paid ${money(full.amount_total)}, PF ${money(pfTotalCents)}, fee ${money(feeCents)}, ` +
        `tax ${money(taxCollectedCents)}, SAGE ${money(sageEarmarkCents)}. Session ${full.id}. ` +
        `Review in Printful and confirm or refund by hand.`,
      { priority: "urgent", tags: "rotating_light" }
    );
    return NextResponse.json({ received: true, fulfillment: "held-draft" });
  }

  // Step 3: profitable — confirm for production.
  try {
    const conf = await fetch(`${PF}/orders/${pfOrder.id}/confirm`, {
      method: "POST",
      headers: pfHeaders(),
    });
    const confJson = await conf.json().catch(() => ({}));
    if (!conf.ok) {
      if (conf.status >= 500) {
        console.error("Printful confirm 5xx (transient):", JSON.stringify(confJson).slice(0, 300));
        return NextResponse.json({ error: "retry" }, { status: 500 });
      }
      await alert(
        `Printful draft #${pfOrder.id} created but CONFIRM rejected (session ${full.id}): ${JSON.stringify(confJson).slice(0, 200)}`
      );
      return NextResponse.json({ received: true, fulfillment: "confirm-rejected" });
    }
  } catch (err) {
    console.error("Printful confirm failed (transient):", err.message);
    return NextResponse.json({ error: "retry" }, { status: 500 });
  }

  console.log("Printful order confirmed:", pfOrder.id, "for", full.id);
  await notify(
    `SALE printed: ${money(full.amount_total)} — ${cartLines.map((l) => `${l.i} x${l.q}`).join(", ")} ` +
      `(PF #${pfOrder.id}) | profit ${money(profitCents)} | SAGE ${money(sageEarmarkCents)}`,
    { title: "TOGG sale", priority: "default", tags: "tada" }
  );
  return NextResponse.json({ received: true, fulfillment: "created" });
}
