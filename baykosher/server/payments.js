// Card payments through Stripe. Orders are AUTHORIZED at checkout (estimate + a cushion for weighed items)
// and CAPTURED for the exact final amount after the order is picked. Apple Pay / Google Pay / cards all
// come through Stripe's Payment Element on the checkout page.
'use strict';

function stripePayments(secretKey) {
  const Stripe = require('stripe');
  const stripe = new Stripe(secretKey);
  return {
    kind: 'stripe',
    async ensureCustomer({ email, name, existingId }) {
      if (existingId) return existingId;
      const c = await stripe.customers.create({ email, name: name || undefined });
      return c.id;
    },
    async authorize({ amount_cents, customer_id, order_id, email }) {
      const pi = await stripe.paymentIntents.create({
        amount: amount_cents, currency: 'usd', customer: customer_id, capture_method: 'manual',
        automatic_payment_methods: { enabled: true }, setup_future_usage: 'off_session',
        receipt_email: email || undefined, metadata: { order_id: String(order_id) }, description: `Bay Kosher order #${order_id}`,
      });
      return { id: pi.id, client_secret: pi.client_secret };
    },
    async status(id) { const pi = await stripe.paymentIntents.retrieve(id); return { status: pi.status, amount_cents: pi.amount }; },
    async capture(id, amount_cents) { const pi = await stripe.paymentIntents.capture(id, { amount_to_capture: amount_cents }); return { status: pi.status, captured_cents: pi.amount_received }; },
    async cancel(id) { await stripe.paymentIntents.cancel(id); },
    // Final total went over the card hold (heavier weights, added items): charge the difference to the same saved card.
    async chargeShortfall({ payment_intent_id, amount_cents, order_id }) {
      const orig = await stripe.paymentIntents.retrieve(payment_intent_id);
      const pi = await stripe.paymentIntents.create({ amount: amount_cents, currency: 'usd', customer: orig.customer, payment_method: orig.payment_method, off_session: true, confirm: true,
        metadata: { order_id: String(order_id), kind: 'weight_adjustment' }, description: `Bay Kosher order #${order_id} (added items / weight adjustment)` });
      if (pi.status !== 'succeeded') throw new Error('Extra charge not completed: ' + pi.status);
      return { id: pi.id };
    },
  };
}

// In-memory stand-in for tests and demos (no network). `confirm(id)` mimics the customer completing payment.
function fakePayments() {
  const intents = new Map(); let n = 0;
  return {
    kind: 'fake', intents,
    async ensureCustomer({ existingId }) { return existingId || 'cus_fake_' + (++n); },
    async authorize({ amount_cents }) { const id = 'pi_fake_' + (++n); intents.set(id, { status: 'requires_payment_method', amount_cents, captured: 0 }); return { id, client_secret: id + '_secret' }; },
    async status(id) { const i = intents.get(id); return { status: i.status, amount_cents: i.amount_cents }; },
    async capture(id, amount_cents) {
      const i = intents.get(id);
      if (i.status !== 'requires_capture') throw new Error('not capturable');
      if (amount_cents > i.amount_cents) throw new Error('amount exceeds authorization');
      i.status = 'succeeded'; i.captured = amount_cents; return { status: 'succeeded', captured_cents: amount_cents };
    },
    async cancel(id) { intents.get(id).status = 'canceled'; },
    failExtra: false,
    async chargeShortfall({ amount_cents }) { if (this.failExtra) throw new Error('card declined'); const id = 'pi_fake_' + (++n); intents.set(id, { status: 'succeeded', amount_cents, captured: amount_cents }); return { id }; },
    confirm(id) { intents.get(id).status = 'requires_capture'; },
  };
}

module.exports = { stripePayments, fakePayments };
