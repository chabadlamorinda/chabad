'use strict';
process.env.PUSHKA_TIMEZONE = 'America/' + 'Los_Angeles';
const test = require('node:test');
const assert = require('node:assert/strict');
const Stripe = require('stripe');
const { createApp } = require('./index.js');
const { createStore } = require('./store.js');
const { startPg } = require('./pg-test-helper.js');

const WH = 'whsec_test_gift', stripe = new Stripe('sk_test_x');
let pg, store, server, base; const sent = [];
const mailer = { from: 'test', send: async (m) => { sent.push(m); } };
test.before(async () => {
  pg = await startPg(); store = createStore(pg.url); await store.migrate();
  const app = createApp({ stripe, publishableKey: 'pk_test_x', sessionSecret: 'a'.repeat(32), log: { error() {} }, store, mailer, webhookSecret: WH, siteEnv: { ADMIN_EMAIL: 'rabbi@example.org' } });
  server = await new Promise((r) => { const s = app.listen(0, () => r(s)); }); base = 'http://127.0.0.1:' + server.address().port;
});
test.after(async () => { server.close(); await store.close(); await pg.stop(); });
test.beforeEach(async () => { await store.reset(); sent.length = 0; });

const hook = async (event) => {
  const payload = JSON.stringify(event), sig = stripe.webhooks.generateTestHeaderString({ payload, secret: WH });
  return (await fetch(base + '/api/stripe/webhook', { method: 'POST', headers: { 'stripe-signature': sig, 'content-type': 'application/json' }, body: payload })).status;
};
const settle = () => new Promise((r) => setTimeout(r, 50));

test('the Rabbi is emailed once when a pushka gift succeeds, and not for other payments', async () => {
  const pi = { id: 'evt_g1', type: 'payment_intent.succeeded', data: { object: { id: 'pi_1', customer: 'cus_X', amount: 3600, amount_received: 3600, receipt_email: 'dina@example.com', metadata: { source: 'pushka', fund: 'general', dedication: 'In memory of Moshe' } } } };
  assert.equal(await hook(pi), 200); await settle();
  assert.equal(sent.length, 1); assert.equal(sent[0].to, 'rabbi@example.org'); assert.match(sent[0].subject, /\$36\.00/); assert.match(sent[0].text, /dina@example\.com/); assert.match(sent[0].text, /In memory of Moshe/);
  assert.equal(await hook(pi), 200); await settle(); assert.equal(sent.length, 1, 'Stripe retries do not email twice');
  await hook({ id: 'evt_o', type: 'payment_intent.succeeded', data: { object: { id: 'pi_2', amount: 500, metadata: { source: 'something-else' } } } }); await settle();
  assert.equal(sent.length, 1);
  await hook({ id: 'evt_m', type: 'invoice.paid', data: { object: { customer: 'cus_X', customer_email: 'club@example.com', amount_paid: 18000, subscription_details: { metadata: { source: 'pushka', fund: 'general', club: 'yes' } } } } }); await settle();
  const mid = await store.createVerifiedMember('club@example.com', 'Club Donor');
  assert.equal(sent.length, 2); assert.match(sent[1].subject, /monthly/); assert.match(sent[1].subject, /Chai Club/);
  const me = (await store.listMembers()).find((m) => m.id === mid); assert.equal(me.gift_cents, 18000); assert.equal(me.gift_count, 1);
  assert.equal((await store.listPaymentEvents()).length, 0, 'gifts are not payment problems');
});
