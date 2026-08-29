// SAGE donation ledger. Stripe is the source of truth: every checkout session
// carries metadata.sage_cents (5% of item subtotal), stamped at creation.
// This report sums the earmark across all PAID sessions.
//   node --env-file=.env.local scripts/sage-report.mjs
const KEY = process.env.STRIPE_SECRET_KEY;
if (!KEY) {
  console.error("Need STRIPE_SECRET_KEY");
  process.exit(1);
}

let owedCents = 0;
let orders = 0;
let url = "https://api.stripe.com/v1/checkout/sessions?limit=100";
for (;;) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${KEY}` } });
  const j = await res.json();
  if (!res.ok) throw new Error(`${res.status} ${j.error?.message}`);
  for (const s of j.data) {
    if (s.payment_status !== "paid") continue;
    orders++;
    const stamped = parseInt(s.metadata?.sage_cents || "", 10);
    // Sessions from before the ledger existed get 5% of their item subtotal.
    const sage = Number.isFinite(stamped) ? stamped : Math.round((s.amount_subtotal || 0) * 0.05);
    owedCents += sage;
    console.log(
      `${new Date(s.created * 1000).toISOString().slice(0, 10)}  $${((s.amount_total || 0) / 100).toFixed(2).padStart(8)}  SAGE $${(sage / 100).toFixed(2)}${Number.isFinite(stamped) ? "" : " (backfilled 5%)"}`
    );
  }
  if (!j.has_more) break;
  url = `https://api.stripe.com/v1/checkout/sessions?limit=100&starting_after=${j.data[j.data.length - 1].id}`;
}
console.log(`\nSAGE owed across ${orders} paid order(s): $${(owedCents / 100).toFixed(2)}`);
console.log("Donate at sageusa.org, then record the donation date/amount in the partner ledger.");
