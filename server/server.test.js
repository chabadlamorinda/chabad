'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('./index.js');

const { fakeStripe } = require('./fake-stripe.js');

async function start(opts = {}) {
  const stripe = 'stripe' in opts ? opts.stripe : fakeStripe();
  const app = createApp({ stripe, publishableKey: 'pk_test_abc', sessionSecret: 'a'.repeat(32), log: { error() {} } });
  const server = await new Promise((r) => { const sv = app.listen(0, () => r(sv)); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const call = async (method, path, body, token) => {
    const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, json: await r.json().catch(() => null), headers: r.headers };
  };
  return { stripe, base, call, close: () => server.close() };
}
const gift = (o = {}) => ({ amount: 36, fund: 'general', dedication: 'In honor of Mom', idem: 'idem-1234567890abcdef', ...o });
async function signedIn(t) {
  const c = await start(); t.after(c.close);
  const r = await c.call('POST', '/api/customer', { name: 'Test Donor', email: 'Donor@Example.com' });
  assert.equal(r.status, 200); c.token = r.json.token;
  return c;
}

test('config exposes publishable key only when stripe is enabled', async (t) => {
  const a = await start(); t.after(a.close);
  const r = await a.call('GET', '/api/config');
  assert.deepEqual(r.json, { enabled: true, publishableKey: 'pk_test_abc', livemode: false });
  const b = await start({ stripe: null }); t.after(b.close);
  assert.deepEqual((await b.call('GET', '/api/config')).json, { enabled: false, publishableKey: '', livemode: false });
  assert.equal((await b.call('POST', '/api/customer', { name: 'A', email: 'a@b.co' })).status, 503);
});

test('customer: validates input, normalizes email, returns a signed token', async (t) => {
  const c = await start(); t.after(c.close);
  assert.equal((await c.call('POST', '/api/customer', { name: '', email: 'a@b.co' })).json.code, 'invalid_name');
  assert.equal((await c.call('POST', '/api/customer', { name: 'A', email: 'nope' })).json.code, 'invalid_email');
  const r = await c.call('POST', '/api/customer', { name: 'Test Donor', email: 'Donor@Example.com' });
  assert.match(r.json.token, /^cus_[A-Za-z0-9]+\.[A-Za-z0-9_-]+$/);
  const cus = Object.values(c.stripe._st.customers)[0];
  assert.equal(cus.email, 'donor@example.com');
  // calling again with the token updates, not duplicates
  const r2 = await c.call('POST', '/api/customer', { name: 'New Name', email: 'new@example.com' }, r.json.token);
  assert.equal(r2.json.token, r.json.token);
  assert.equal(Object.keys(c.stripe._st.customers).length, 1);
  assert.equal(cus.name, 'New Name');
});

test('auth: missing, tampered and forged tokens are rejected', async (t) => {
  const c = await signedIn(t);
  for (const tok of [undefined, 'garbage', c.token + 'x', c.token.replace(/\.[^.]+$/, '.AAAA'), 'cus_evil.' + c.token.split('.')[1]]) {
    const r = await c.call('GET', '/api/payment-method', null, tok);
    assert.equal(r.status, 401, 'token ' + tok);
  }
  assert.equal((await c.call('GET', '/api/payment-method', null, c.token)).status, 200);
});

test('setup intent is restricted to cards, off-session, for this customer', async (t) => {
  const c = await signedIn(t);
  const r = await c.call('POST', '/api/setup-intent', null, c.token);
  assert.equal(r.json.clientSecret, 'seti_secret_x');
  const p = c.stripe._st.calls.find((x) => x[0] === 'setupIntents.create')[1];
  assert.deepEqual(p.allowed_payment_method_types, ['card']); assert.equal(p.usage, 'off_session');
  assert.equal(p.customer, c.token.split('.')[0]);
});

test('payment method: reports saved card and removes it', async (t) => {
  const c = await signedIn(t);
  assert.equal((await c.call('GET', '/api/payment-method', null, c.token)).json.card, null);
  c.stripe.addCard(c.token.split('.')[0]);
  const r = await c.call('GET', '/api/payment-method', null, c.token);
  assert.equal(r.json.card.brand, 'visa'); assert.equal(r.json.card.last4, '4242');
  await c.call('DELETE', '/api/payment-method', null, c.token);
  assert.equal((await c.call('GET', '/api/payment-method', null, c.token)).json.card, null);
});

test('donate: no card -> 400; with card -> charges saved card in cents, with receipt + metadata', async (t) => {
  const c = await signedIn(t);
  assert.equal((await c.call('POST', '/api/donate', gift(), c.token)).json.code, 'no_card');
  const pm = c.stripe.addCard(c.token.split('.')[0]);
  const r = await c.call('POST', '/api/donate', gift({ amount: 1.8 }), c.token);
  assert.equal(r.status, 200); assert.equal(r.json.status, 'succeeded'); assert.equal(r.json.receiptUrl, 'https://pay.stripe.com/receipts/test');
  const [, p, o] = c.stripe._st.calls.find((x) => x[0] === 'paymentIntents.create');
  assert.equal(p.amount, 180); assert.equal(p.currency, 'usd'); assert.equal(p.payment_method, pm.id);
  assert.equal(p.off_session, true); assert.equal(p.confirm, true); assert.equal(p.receipt_email, 'donor@example.com');
  assert.deepEqual(p.metadata, { source: 'pushka', fund: 'general', dedication: 'In honor of Mom', fee_covered: 'no', gift_cents: '180' });
  assert.equal(o.idempotencyKey, 'pushka-donate-idem-1234567890abcdef');
});

test('donate: same idempotency key does not double charge', async (t) => {
  const c = await signedIn(t); c.stripe.addCard(c.token.split('.')[0]);
  const a = await c.call('POST', '/api/donate', gift(), c.token), b = await c.call('POST', '/api/donate', gift(), c.token);
  assert.equal(a.json.id, b.json.id); assert.equal(Object.keys(c.stripe._st.pis).length, 1);
});

test('donate: rejects bad amounts, funds and missing request id', async (t) => {
  const c = await signedIn(t); c.stripe.addCard(c.token.split('.')[0]);
  for (const amount of [0, 0.5, -5, 10001, 'abc', null, NaN, 1e9]) assert.equal((await c.call('POST', '/api/donate', gift({ amount }), c.token)).json.code, 'invalid_amount', String(amount));
  assert.equal((await c.call('POST', '/api/donate', gift({ fund: 'evil' }), c.token)).json.code, 'invalid_fund');
  assert.equal((await c.call('POST', '/api/donate', gift({ fund: '__proto__' }), c.token)).json.code, 'invalid_fund');
  assert.equal((await c.call('POST', '/api/donate', gift({ idem: 'x' }), c.token)).json.code, 'invalid_request');
  assert.equal(Object.keys(c.stripe._st.pis).length, 0);
  assert.equal((await c.call('POST', '/api/donate', gift({ amount: 10000 }), c.token)).status, 200);
});

test('donate: long/control-character dedications are cleaned and truncated', async (t) => {
  const c = await signedIn(t); c.stripe.addCard(c.token.split('.')[0]);
  await c.call('POST', '/api/donate', gift({ dedication: 'a\nb' + 'x'.repeat(200) }), c.token);
  const p = c.stripe._st.calls.find((x) => x[0] === 'paymentIntents.create')[1];
  assert.equal(p.metadata.dedication.length, 80); assert.ok(!/[\n]/.test(p.metadata.dedication));
});

test('donate: declined card -> 402 with the bank message; auth required -> requires_action', async (t) => {
  const c = await signedIn(t); c.stripe.addCard(c.token.split('.')[0]);
  c.stripe._st.failNext = Object.assign(new Error('Your card has insufficient funds.'), { type: 'StripeCardError', code: 'card_declined' });
  const r = await c.call('POST', '/api/donate', gift({ idem: 'idem-declined-000000001' }), c.token);
  assert.equal(r.status, 402); assert.equal(r.json.error, 'Your card has insufficient funds.');
  c.stripe._st.failNext = Object.assign(new Error('auth'), { type: 'StripeCardError', code: 'authentication_required', payment_intent: { id: 'pi_auth', client_secret: 'pi_auth_secret' } });
  const r2 = await c.call('POST', '/api/donate', gift({ idem: 'idem-auth-0000000000002' }), c.token);
  assert.equal(r2.json.status, 'requires_action'); assert.equal(r2.json.clientSecret, 'pi_auth_secret'); assert.ok(r2.json.paymentMethodId.startsWith('pm_'));
});

test('donate: unexpected errors do not leak details', async (t) => {
  const c = await signedIn(t); c.stripe.addCard(c.token.split('.')[0]);
  c.stripe._st.failNext = new Error('sk_live_SECRET internal detail');
  const r = await c.call('POST', '/api/donate', gift({ idem: 'idem-boom-000000000003' }), c.token);
  assert.equal(r.status, 500); assert.ok(!JSON.stringify(r.json).includes('SECRET'));
});

test('payment lookup only returns your own payments', async (t) => {
  const a = await signedIn(t), b = await start(); t.after(b.close);
  a.stripe.addCard(a.token.split('.')[0]);
  const don = await a.call('POST', '/api/donate', gift(), a.token);
  assert.equal((await a.call('GET', '/api/payment/' + don.json.id, null, a.token)).json.status, 'succeeded');
  // a second donor on the same Stripe account must not read it
  const r2 = await a.call('POST', '/api/customer', { name: 'Other', email: 'o@x.co' });
  assert.equal((await a.call('GET', '/api/payment/' + don.json.id, null, r2.json.token)).status, 403);
});

test('monthly gift: creates product + subscription, lists it, cancels it', async (t) => {
  const c = await signedIn(t); c.stripe.addCard(c.token.split('.')[0]);
  const r = await c.call('POST', '/api/subscribe', gift({ amount: 18, fund: 'preschool', idem: 'idem-sub-00000000000001' }), c.token);
  assert.equal(r.status, 200); assert.equal(r.json.status, 'active'); assert.equal(r.json.receiptUrl, 'https://invoice.stripe.com/i/test');
  assert.ok(c.stripe._st.products['pushka-monthly-preschool']);
  const [, p] = c.stripe._st.calls.find((x) => x[0] === 'subscriptions.create');
  assert.equal(p.items[0].price_data.unit_amount, 1800); assert.deepEqual(p.items[0].price_data.recurring, { interval: 'month' });
  assert.equal(p.off_session, true); assert.equal(p.payment_behavior, 'error_if_incomplete');
  const list = await c.call('GET', '/api/subscriptions', null, c.token);
  assert.equal(list.json.subscriptions.length, 1); assert.equal(list.json.subscriptions[0].amount, 18); assert.equal(list.json.subscriptions[0].fund, 'preschool'); assert.equal(list.json.subscriptions[0].next, 1893456000000);
  assert.equal((await c.call('DELETE', '/api/subscriptions/' + r.json.id, null, c.token)).status, 200);
  assert.equal((await c.call('GET', '/api/subscriptions', null, c.token)).json.subscriptions.length, 0);
});

test('cannot cancel someone else\'s subscription', async (t) => {
  const a = await signedIn(t); a.stripe.addCard(a.token.split('.')[0]);
  const sub = await a.call('POST', '/api/subscribe', gift({ idem: 'idem-sub-00000000000002' }), a.token);
  const other = await a.call('POST', '/api/customer', { name: 'Other', email: 'o@x.co' });
  assert.equal((await a.call('DELETE', '/api/subscriptions/' + sub.json.id, null, other.json.token)).status, 403);
  assert.equal(a.stripe._st.subs[sub.json.id].status, 'active');
});

test('delete account: cancels monthly gifts and removes cards', async (t) => {
  const c = await signedIn(t); c.stripe.addCard(c.token.split('.')[0]);
  await c.call('POST', '/api/subscribe', gift({ idem: 'idem-sub-00000000000003' }), c.token);
  assert.equal((await c.call('DELETE', '/api/account', null, c.token)).status, 200);
  assert.equal((await c.call('GET', '/api/subscriptions', null, c.token)).json.subscriptions.length, 0);
  assert.equal((await c.call('GET', '/api/payment-method', null, c.token)).json.card, null);
});

test('website: serves public files only, with security headers', async (t) => {
  const c = await start(); t.after(c.close);
  for (const p of ['/', '/styles.css', '/pushka/', '/pushka/pushka.js', '/pushka/segulos.js']) assert.equal((await fetch(c.base + p)).status, 200, p);
  for (const p of ['/package.json', '/server/index.js', '/.git/config', '/render.yaml', '/README.md', '/pushka/../package.json', '/node_modules/express/package.json']) assert.equal((await fetch(c.base + p)).status, 404, p);
  const r = await fetch(c.base + '/pushka/');
  assert.match(r.headers.get('content-security-policy'), /script-src 'self' https:\/\/js\.stripe\.com/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff'); assert.equal(r.headers.get('x-powered-by'), null);
  assert.equal((await fetch(c.base + '/healthz')).status, 200);
});

test('rate limit: too many donate attempts get 429', async (t) => {
  const c = await signedIn(t); c.stripe.addCard(c.token.split('.')[0]);
  let last; for (let i = 0; i < 32; i++) last = await c.call('POST', '/api/donate', gift({ amount: 0 }), c.token);
  assert.equal(last.status, 429);
});

test('every website fund is accepted; old fund ids are not', async (t) => {
  const c = await signedIn(t); c.stripe.addCard(c.token.split('.')[0]);
  const ids = ['general', 'chai', 'preschool', 'market', 'building', 'holidays', 'synagogue', 'endyear', 'children', 'pledge'];
  for (const [i, fund] of ids.entries()) assert.equal((await c.call('POST', '/api/donate', gift({ fund, idem: 'idem-fund-0000000000' + String(i).padStart(2, '0') }), c.token)).status, 200, fund);
  assert.equal((await c.call('POST', '/api/donate', gift({ fund: 'school' }), c.token)).json.code, 'invalid_fund');
});

test('processing-fee option adds 3.5% and records the original gift', async (t) => {
  const c = await signedIn(t); c.stripe.addCard(c.token.split('.')[0]);
  await c.call('POST', '/api/donate', gift({ amount: 180, fee: true, idem: 'idem-fee-000000000001' }), c.token);
  let p = c.stripe._st.calls.filter((x) => x[0] === 'paymentIntents.create').pop()[1];
  assert.equal(p.amount, 18630); assert.equal(p.metadata.fee_covered, 'yes'); assert.equal(p.metadata.gift_cents, '18000');
  await c.call('POST', '/api/donate', gift({ amount: 180, fee: 'yes', idem: 'idem-fee-000000000002' }), c.token);
  p = c.stripe._st.calls.filter((x) => x[0] === 'paymentIntents.create').pop()[1];
  assert.equal(p.amount, 18000); assert.equal(p.metadata.fee_covered, 'no');
  await c.call('POST', '/api/subscribe', gift({ amount: 360, fee: true, idem: 'idem-fee-000000000003' }), c.token);
  assert.equal(c.stripe._st.calls.filter((x) => x[0] === 'subscriptions.create').pop()[1].items[0].price_data.unit_amount, 37260);
});

test('customer: optional phone and address are stored', async (t) => {
  const c = await start(); t.after(c.close);
  await c.call('POST', '/api/customer', { name: 'A B', email: 'a@b.co', phone: '555-1234', address: '1 Main St, Lafayette CA' });
  const cus = Object.values(c.stripe._st.customers)[0];
  assert.equal(cus.phone, '555-1234'); assert.equal(cus.metadata.address, '1 Main St, Lafayette CA');
});
