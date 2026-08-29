// The independent safety net: cross-checks EVERY paid Stripe session against
// Printful. Webhook alerts are best-effort (ntfy can be down, consoles unseen);
// this is the ground-truth sweep that catches anything silent. Run weekly, or
// any time something feels off:
//   npm run reconcile
// Exit 1 when any paid order has no confirmed Printful order.
import { createHash } from "crypto";

const SK = process.env.STRIPE_SECRET_KEY;
const PK = process.env.PRINTFUL_API_KEY;
const STORE = process.env.PRINTFUL_STORE_ID;
if (!SK || !PK || !STORE) {
  console.error("Need STRIPE_SECRET_KEY, PRINTFUL_API_KEY, PRINTFUL_STORE_ID");
  process.exit(1);
}

const pfHeaders = {
  Authorization: `Bearer ${PK}`,
  "X-PF-Store-ID": STORE,
};

let problems = 0;
let checked = 0;
let url = "https://api.stripe.com/v1/checkout/sessions?limit=100";
for (;;) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${SK}` } });
  const j = await res.json();
  if (!res.ok) throw new Error(`stripe ${res.status} ${j.error?.message}`);
  for (const s of j.data) {
    if (s.payment_status !== "paid") continue;
    checked++;
    const extId = createHash("sha256").update(s.id).digest("hex").slice(0, 32);
    const pf = await fetch(`https://api.printful.com/orders/@${extId}`, { headers: pfHeaders });
    const when = new Date(s.created * 1000).toISOString().slice(0, 16);
    const amt = `$${((s.amount_total || 0) / 100).toFixed(2)}`;
    if (pf.status === 404) {
      console.log(`MISSING   ${when}  ${amt}  ${s.id} — paid, NO Printful order at all`);
      problems++;
    } else if (pf.ok) {
      const o = (await pf.json()).result;
      if (o.status === "draft") {
        console.log(`DRAFT     ${when}  ${amt}  PF #${o.id} — held/unconfirmed, needs a human decision`);
        problems++;
      } else if (o.status === "canceled") {
        console.log(`CANCELED  ${when}  ${amt}  PF #${o.id} — fine only if the payment was refunded`);
      } else {
        console.log(`ok        ${when}  ${amt}  PF #${o.id} (${o.status})`);
      }
    } else {
      console.log(`ERROR     ${when}  ${amt}  ${s.id} — Printful lookup failed (${pf.status})`);
      problems++;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  if (!j.has_more) break;
  url = `https://api.stripe.com/v1/checkout/sessions?limit=100&starting_after=${j.data[j.data.length - 1].id}`;
}
console.log(
  problems
    ? `\nreconcile: ${problems} problem(s) across ${checked} paid order(s) — act on the lines above`
    : `\nreconcile: all ${checked} paid order(s) accounted for ✓`
);
process.exit(problems ? 1 : 0);
