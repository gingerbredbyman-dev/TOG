// Money truths for the shop. Every number that decides profit lives here.
//
// Per-order economics:
//   buyer pays   = items retail + shipping charge (+ sales tax when Stripe Tax on)
//   we owe       = Printful (items + their shipping + their tax until the FL
//                  resale certificate is filed) + Stripe's fee + tax remittance
//   SAGE         = 5% of the item subtotal ("proceeds"), earmarked per order
//   profit       = buyer pays − tax collected − Stripe fee − Printful total − SAGE
//
// The webhook refuses to auto-confirm any order whose computed profit falls
// below FULFILL_MIN_PROFIT_CENTS (default 0): held as a Printful draft + alert.

export const STRIPE_PCT = 0.029; // US online card
export const STRIPE_INTL_PCT = 0.015; // surcharge for non-US-issued cards
export const STRIPE_FLAT_CENTS = 30;
export const SAGE_PCT = 0.05; // of item subtotal
// Printful bills us sales tax (~7% FL) until a resale certificate is on file.
// Pricing carries this buffer so pre-certificate orders still clear the floor.
export const PF_TAX_BUFFER_PCT = 0.075;

// intlCard: a Canadian (or any non-US-issued) card carries Stripe's +1.5%
// surcharge — the estimate must not be optimistic for the CA half of the market.
export function stripeFeeCents(grossCents, { intlCard = false } = {}) {
  const pct = STRIPE_PCT + (intlCard ? STRIPE_INTL_PCT : 0);
  return Math.ceil(grossCents * pct) + STRIPE_FLAT_CENTS;
}

export function sageCents(itemSubtotalCents) {
  return Math.round(itemSubtotalCents * SAGE_PCT);
}

// Actual per-order profit from real numbers (webhook backstop).
export function orderProfitCents({ amountTotalCents, taxCollectedCents, stripeFeeCents, pfTotalCents, sageCents }) {
  return amountTotalCents - taxCollectedCents - stripeFeeCents - pfTotalCents - sageCents;
}

// Candidate-retail evaluation, shared by scripts/price-audit.mjs (the gate) and
// scripts/reprice.mjs (the auto-adjuster) so they can never disagree. Caller
// passes WORST-CASE-size item and tax figures. Shipping cancels out (charged at
// Printful's own rate) so it appears only inside the fee base.
// CA tax floor: Canadian GST/PST runs roughly double the US figure — 2.2x the
// US tax is the assumption when the measured CA value is lower or missing.
export function evaluateRetail({
  retailCents, itemCents, taxUSCents, taxCACents, shipUSFirstCents, shipCAFirstCents,
}) {
  const sage = sageCents(retailCents);
  const usFee = stripeFeeCents(retailCents + shipUSFirstCents);
  const usProfit = retailCents - itemCents - taxUSCents - usFee - sage;
  const caTax = Math.max(taxCACents || 0, Math.ceil(taxUSCents * 2.2));
  const caFee = stripeFeeCents(retailCents + shipCAFirstCents, { intlCard: true });
  const caProfit = retailCents - itemCents - caTax - caFee - sage;
  return { usProfit, caProfit };
}
