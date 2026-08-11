# 🏳️‍🌈 Mike's Handover — connecting YOUR money to YOUR store

Hi Mike. The store is built. Every design is loaded. It prints one item at a time,
only when a fan pays — you never buy inventory, ever. Two short missions and the
money flows to you. Phone-friendly, no tech skills needed.

---

## Mission 1 — Stripe (where fans' money lands) · ~15 min

Stripe is the checkout — like the card reader at a shop. The account must be YOURS
so payouts hit YOUR bank.

1. Go to **stripe.com** → **Sign up**. Use your everyday email.
2. It will ask about your business: choose **Individual** unless you have an LLC.
   Fill in your name, address, and the bank account payouts should land in.
3. That's the whole account. Now — instead of copying secret codes around — do the
   easy, safe thing:

   **Invite Austin as a teammate:**
   - In the Stripe dashboard: **Settings → Team and security → Team → + New member**
   - Email: *(Austin's email)* · Role: **Developer**
   - Send invite. Done.

   Why this way: no secret keys ever get texted or emailed, you can **remove Austin
   any time with one click**, and every action is logged under his own login. You
   stay 100% owner of the money.

4. Nothing else. Austin's side handles the technical wiring (keys, webhook, test
   orders) from that Developer seat.

> Prefer not to invite anyone? Plan B: in Stripe go to **Developers → API keys**,
> and send Austin the **Publishable key** and **Secret key** through a password
> manager share or Signal (never plain email/text). But the teammate invite is
> genuinely easier and safer.

## Mission 2 — Printful (the printers) · ~10 min

Printful prints and ships each order. They charge the item's base cost per order —
your Stripe money more than covers it; the difference is your profit.

Two options — pick one:

**Option A (fastest): adopt the existing setup.**
A Printful account is already wired to the store. You just make it bill properly:
1. Log into that Printful account (Austin sends you the login handoff).
2. **Billing → Add payment method** → add your card (this card pays base costs
   per order — roughly $13 of every $30 tee).
3. Optional but smart: turn on **Printful Wallet auto-top-up** so orders never stall.

**Option B (clean slate): your own Printful.**
1. **printful.com** → sign up → add your card under Billing.
2. **Stores → Add store → choose "API"** (name it TOG Store).
3. Go to **developers.printful.com → Tokens → Add new token** → scope
   **"Account (all stores)"** → copy the long code it shows **once** → send it to
   Austin the same safe way as above.

## What happens the moment both missions are done

Austin flips one switch (`FULFILL=on`) and:

1. Fan pays $29.99 → lands in **your Stripe** → auto-pays out to **your bank**
   (rolling ~2 days).
2. The store automatically tells Printful to print that one item.
3. Printful charges **your card** the base cost (~$13) and ships direct to the fan.
4. You keep the difference. No stock. No shipping runs. No dashboard babysitting.

First-day checklist (Austin drives, you watch):
- [ ] $1 test-mode order placed and refunded — flow verified end to end
- [ ] One REAL sticker ordered to your own address — hold the merch in your hand
- [ ] Payout arrives in your bank → champagne 🍾

## Your controls, forever

- **Kill switch:** remove Austin from Stripe Team → nobody but you touches money.
- **Prices:** every price lives in one file; say the word and they change.
- **Pause the shop:** one env switch turns checkout off (site stays up).
- **Refunds:** Stripe dashboard → Payments → Refund. Printful orders can be
  canceled within minutes of creation from the Printful dashboard.
