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
