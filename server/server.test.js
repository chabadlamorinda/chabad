'use strict';
process.env.PUSHKA_TIMEZONE = 'America/' + 'Los_Angeles'; // the reminder tests use fixed Pacific-time instants
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
  return { stripe, base, call, close: () => server.close(), app };
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
  assert.deepEqual(r.json, { enabled: true, publishableKey: 'pk_test_abc', livemode: false, members: false, vapidPublicKey: '' });
  const b = await start({ stripe: null }); t.after(b.close);
  assert.deepEqual((await b.call('GET', '/api/config')).json, { enabled: false, publishableKey: '', livemode: false, members: false, vapidPublicKey: '' });
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
  const r = await c.call('POST', '/api/subscribe', gift({ amount: 18, fund: 'holidays', idem: 'idem-sub-00000000000001' }), c.token);
  assert.equal(r.status, 200); assert.equal(r.json.status, 'active'); assert.equal(r.json.receiptUrl, 'https://invoice.stripe.com/i/test');
  assert.ok(c.stripe._st.products['pushka-monthly-holidays']);
  const [, p] = c.stripe._st.calls.find((x) => x[0] === 'subscriptions.create');
  assert.equal(p.items[0].price_data.unit_amount, 1800); assert.deepEqual(p.items[0].price_data.recurring, { interval: 'month' });
  assert.equal(p.off_session, true); assert.equal(p.payment_behavior, 'error_if_incomplete');
  const list = await c.call('GET', '/api/subscriptions', null, c.token);
  assert.equal(list.json.subscriptions.length, 1); assert.equal(list.json.subscriptions[0].amount, 18); assert.equal(list.json.subscriptions[0].fund, 'holidays'); assert.equal(list.json.subscriptions[0].next, 1893456000000);
  assert.equal((await c.call('DELETE', '/api/subscriptions/' + r.json.id, null, c.token)).status, 200);
  assert.equal((await c.call('GET', '/api/subscriptions', null, c.token)).json.subscriptions.length, 0);
});

test('website giving: Stripe checkout once or monthly, Chai Club details for the honor board', async (t) => {
  const c = await start(); t.after(c.close);
  const once = await c.call('POST', '/api/give/checkout', { ...gift({ amount: 180, idem: 'idem-site-0000000000001' }), freq: 'once', lang: 'he', back: '/donate' });
  assert.equal(once.status, 200); assert.match(once.json.url, /^https:\/\/checkout\.stripe\.com\//);
  let p = c.stripe._st.calls.filter((x) => x[0] === 'checkout.sessions.create').pop()[1];
  assert.equal(p.mode, 'payment'); assert.equal(p.line_items[0].price_data.unit_amount, 18000); assert.equal(p.payment_intent_data.metadata.source, 'pushka');
  assert.match(p.success_url, /\/he\/donate\/thank-you\?session_id=/); assert.match(p.cancel_url, /\/he\/donate$/);
  const club = await c.call('POST', '/api/give/checkout', { ...gift({ amount: 180, fund: 'chai', idem: 'idem-site-0000000000002' }), freq: 'monthly', club: { show: true, name: 'The Levi Family' }, back: '/chai-club' });
  assert.equal(club.status, 200);
  p = c.stripe._st.calls.filter((x) => x[0] === 'checkout.sessions.create').pop()[1];
  assert.equal(p.mode, 'subscription'); assert.deepEqual(p.line_items[0].price_data.recurring, { interval: 'month' });
  assert.equal(p.subscription_data.metadata.club, 'yes'); assert.equal(p.subscription_data.metadata.board_name, 'The Levi Family'); assert.equal(p.subscription_data.metadata.gift_cents, '18000');
  assert.equal((await c.call('POST', '/api/give/checkout', { ...gift({ fund: 'chai', idem: 'idem-site-0000000000003' }), freq: 'once', club: { show: true, name: 'X' } })).status, 400, 'the club is monthly');
  assert.equal((await c.call('POST', '/api/give/checkout', { ...gift({ amount: 0, idem: 'idem-site-0000000000004' }) })).status, 400);
  const evil = await c.call('POST', '/api/give/checkout', { ...gift({ idem: 'idem-site-0000000000005' }), back: '//evil.example' });
  assert.match(c.stripe._st.calls.filter((x) => x[0] === 'checkout.sessions.create').pop()[1].cancel_url, /\/donate$/); assert.equal(evil.status, 200);
  const off = await start({ stripe: null }); t.after(off.close);
  assert.equal((await off.call('POST', '/api/give/checkout', gift())).status, 503);
});

test('campaigns: one payment, or monthly or yearly payments that stop by themselves; totals and the donor wall', async (t) => {
  const c = await start(); t.after(c.close);
  if (!c.app.locals.site.content) return t.skip('the shareable kit has no website');
  const { lastPaymentEnd, withMatch } = require('./campaign.js');
  const data = c.app.locals.site.content();
  data.campaigns.push({ slug: 'test-drive', title: 'Test Drive', goal: 10000, start: '2020-01-01', end: '2099-12-31', fund: 'building', months: [12, 24], years: [3], matching: { multiplier: 2, cap: 1000 }, teams: [{ slug: 'levis', name: 'The Levis', goal: 2000 }], levels: [{ id: 'room', title: 'A room', amount: 1800, quantity: 2 }] });
  const give = (o) => c.call('POST', '/api/campaign/checkout', { campaign: 'test-drive', amount: 180, idem: 'idem-camp-' + Math.random().toString(36).slice(2, 12) + 'abcdef', ...o });
  const calls = () => c.stripe._st.calls.filter((x) => x[0] === 'checkout.sessions.create').pop()[1];

  const once = await give({ amount: 50000, name: 'The Cohens', team: 'levis', level: 'room', message: 'Mazal tov!', lang: 'he' });
  assert.equal(once.status, 200); let p = calls();
  assert.equal(p.mode, 'payment'); assert.equal(p.line_items[0].price_data.unit_amount, 5000000); assert.equal(p.payment_intent_data.metadata.campaign, 'test-drive');
  assert.equal(p.payment_intent_data.metadata.team, 'levis'); assert.equal(p.payment_intent_data.metadata.level, 'room'); assert.equal(p.payment_intent_data.metadata.fund, 'building');
  assert.equal(p.payment_method_types, undefined, 'every payment method switched on in Stripe is offered');
  assert.match(p.success_url, /\/he\/campaign\/test-drive\/thank-you\?session_id=\{CHECKOUT_SESSION_ID\}&team=levis$/);

  const split = await give({ amount: 36000, plan: 'month-24', fee: true, anonymous: true });
  assert.equal(split.status, 200); p = calls();
  assert.equal(p.mode, 'subscription'); assert.deepEqual(p.line_items[0].price_data.recurring, { interval: 'month' });
  assert.equal(p.line_items[0].price_data.unit_amount, Math.round(150000 * 1.035), '$36,000 over 24 months is $1,500 a month, plus the fee');
  assert.equal(p.subscription_data.metadata.installments, '24'); assert.equal(p.subscription_data.metadata.pledge_cents, '3600000'); assert.equal(p.subscription_data.metadata.wall_show, 'no');
  assert.equal((await give({ amount: 360000, plan: 'year-3' })).status, 200); p = calls();
  assert.deepEqual(p.line_items[0].price_data.recurring, { interval: 'year' }); assert.equal(p.line_items[0].price_data.unit_amount, 12000000); assert.equal(p.subscription_data.metadata.interval, 'year');

  assert.equal((await give({ plan: 'month-7' })).status, 400, 'only the plans the campaign offers');
  assert.equal((await give({ plan: 'year-5' })).status, 400);
  assert.equal((await give({ amount: 300000 })).status, 400, 'over $250,000 in one payment');
  assert.equal((await give({ amount: 2000000, plan: 'month-12' })).status, 400, 'over $1,000,000');
  assert.equal((await give({ amount: 60, plan: 'month-24' })).status, 400, 'at least $5 a payment');
  assert.equal((await give({ campaign: 'building-campaign' })).status, 400, 'a draft campaign takes no gifts');

  // The donor pays: a one-time gift (shown with name), a split gift (anonymous). Totals count the whole pledge, with matching up to the cap.
  const st = c.stripe._st;
  st.pis.pi_a = { id: 'pi_a', status: 'succeeded', created: 1800000000, amount_received: 18000, metadata: { campaign: 'test-drive', gift_cents: '18000', wall_name: 'The Cohens', wall_show: 'yes', team: 'levis', level: 'room', message: 'Mazal tov!' } };
  st.subs.sub_a = { id: 'sub_a', status: 'active', created: 1800000100, billing_cycle_anchor: 1800000100, metadata: { campaign: 'test-drive', installments: '24', pledge_cents: '3600000', gift_cents: '150000', wall_name: 'Secret', wall_show: 'no', hide_amount: 'yes' } };
  st.subs.sub_y = { id: 'sub_y', status: 'active', created: 1800000200, billing_cycle_anchor: 1800000200, metadata: { campaign: 'test-drive', installments: '3', interval: 'year', pledge_cents: '300000', gift_cents: '100000', wall_name: 'The Yearlys', wall_show: 'yes' } };
  const tot = (await c.call('GET', '/api/campaign/test-drive')).json;
  assert.equal(tot.given, 39180); assert.equal(tot.raised, 39180 + 1000, 'matching adds up to its $1,000 cap');
  assert.equal(tot.donors, 3); assert.equal(tot.teams.levis, 360); assert.equal(tot.teamDonors.levis, 1); assert.equal(tot.levels.room, 1);
  assert.deepEqual(tot.wall.map((w) => [w.name, w.cents, w.count, w.interval]), [['The Yearlys', 300000, 3, 'year'], ['', null, 24, 'month'], ['The Cohens', 18000, 0, '']], 'anonymous and hidden amounts stay hidden');
  assert.equal(st.subs.sub_a.cancel_at, lastPaymentEnd(1800000100, 24), 'the split gift stops after its 24th payment');
  assert.equal(st.subs.sub_y.cancel_at, lastPaymentEnd(1800000200, 3, 'year')); assert.equal(st.subs.sub_a.proration_behavior, 'none');
  assert.equal(new Date(lastPaymentEnd(Date.UTC(2026, 0, 15) / 1000, 12) * 1000).toISOString().slice(0, 10), '2026-12-16', 'payments Jan 15 ... Dec 15, then it stops');
  assert.equal(new Date(lastPaymentEnd(Date.UTC(2026, 0, 15) / 1000, 3, 'year') * 1000).toISOString().slice(0, 10), '2028-01-16', 'payments 2026, 2027, 2028');
  assert.equal(withMatch({ matching: { multiplier: 3 } }, 100), 300);
  assert.equal((await c.call('GET', '/api/campaign/nope')).status, 404);
  const off = await start({ stripe: null }); t.after(off.close);
  assert.equal((await off.call('POST', '/api/campaign/checkout', { campaign: 'test-drive', amount: 18, idem: 'idem-camp-0000000000001' })).status, 503);
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
  for (const p of ['/pushka/', '/pushka/pushka.js', '/pushka/segulos.js']) assert.equal((await fetch(c.base + p)).status, 200, p);
  const root = await fetch(c.base + '/', { redirect: 'manual' });
  assert.equal(root.status, 302); assert.equal(root.headers.get('location'), '/pushka/');
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

test('every configured fund is accepted; unknown fund ids are not', async (t) => {
  const c = await signedIn(t); c.stripe.addCard(c.token.split('.')[0]);
  const ids = Object.keys(require('./index.js').FUND_NAMES); assert.ok(ids.includes('chai') && ids.includes('general'));
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

test('Android verification file: empty until configured, then lists only valid fingerprints', async (t) => {
  const a = await start(); t.after(a.close);
  const r0 = await fetch(a.base + '/.well-known/assetlinks.json');
  assert.equal(r0.status, 200); assert.match(r0.headers.get('content-type'), /json/); assert.deepEqual(await r0.json(), []);
  const fp = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, '0').toUpperCase()).join(':');
  const app = createApp({ stripe: null, sessionSecret: 'a'.repeat(32), androidSha256: fp.toLowerCase() + ', not-a-fingerprint', log: { error() {} } });
  const sv = await new Promise((r) => { const s = app.listen(0, () => r(s)); }); t.after(() => sv.close());
  const j = await (await fetch('http://127.0.0.1:' + sv.address().port + '/.well-known/assetlinks.json')).json();
  assert.equal(j.length, 1); assert.equal(j[0].target.package_name, 'com.chabadoflamorinda.pushka'); assert.deepEqual(j[0].target.sha256_cert_fingerprints, [fp]);
  assert.deepEqual(j[0].relation, ['delegate_permission/common.handle_all_urls']);
});

test('privacy policy and support pages are public', async (t) => {
  const a = await start(); t.after(a.close);
  for (const p of ['/pushka/privacy.html', '/pushka/support.html', '/pushka/manifest.json', '/pushka/sw.js', '/pushka/icon-512.png', '/pushka/icon-maskable-512.png']) assert.equal((await fetch(a.base + p)).status, 200, p);
  assert.match(await (await fetch(a.base + '/pushka/privacy.html')).text(), /Tax ID 47-4642750/);
});

test('change card: newest card becomes the one charged, monthly gifts follow it, old cards are removed', async (t) => {
  const c = await signedIn(t); const cus = c.token.split('.')[0];
  assert.equal((await c.call('POST', '/api/payment-method/default', {}, c.token)).json.code, 'no_card');
  const old = c.stripe.addCard(cus);
  const sub = await c.call('POST', '/api/subscribe', gift({ idem: 'idem-chg-0000000000001' }), c.token);
  const fresh = c.stripe.addCard(cus); fresh.card.last4 = '1111';
  const r = await c.call('POST', '/api/payment-method/default', {}, c.token);
  assert.equal(r.status, 200); assert.equal(r.json.card.last4, '1111');
  assert.equal(c.stripe._st.subs[sub.json.id].default_payment_method, fresh.id);
  assert.equal(c.stripe._st.customers[cus].invoice_settings.default_payment_method, fresh.id);
  assert.equal(Object.values(c.stripe._st.pms).filter((m) => m.customer === cus).length, 1);
  assert.ok(!c.stripe._st.pms[old.id]);
  assert.equal((await c.call('GET', '/api/payment-method', null, c.token)).json.card.last4, '1111');
  assert.equal((await c.call('POST', '/api/payment-method/default', {})).status, 401);
});

test('chai club: levels, board shows only chosen names, replace switches level, amounts never exposed', async (t) => {
  const c = await signedIn(t); const cus = c.token.split('.')[0]; c.stripe.addCard(cus);
  const join = (amount, club, extra = {}) => c.call('POST', '/api/subscribe', gift({ amount, fund: 'chai', idem: 'idem-club-' + amount + '-' + Math.random().toString(36).slice(2, 12), club, ...extra }), c.token);
  assert.equal((await join(50, { name: 'Small Giver', show: true })).status, 200); // below $72 is accepted, just not on the board
  let b0 = (await c.call('GET', '/api/club')).json; assert.equal(b0.total, 0); assert.deepEqual(b0.members, []);
  await c.call('DELETE', '/api/subscriptions/' + (await c.call('GET', '/api/subscriptions', null, c.token)).json.subscriptions[0].id, null, c.token);
  assert.equal((await join(180, { name: '', show: true })).json.code, 'invalid_name');
  assert.equal((await c.call('POST', '/api/subscribe', gift({ amount: 180, fund: 'general', idem: 'idem-club-wrongfund-00001', club: { name: 'X', show: true } }), c.token)).status, 400);
  assert.equal((await join(180, { name: 'The Cohen Family', show: true })).status, 200); // 180 = silver
  let b = (await c.call('GET', '/api/club')).json;
  assert.deepEqual(b.members.map((m) => [m.name, m.level]), [['The Cohen Family', 'silver']]); assert.equal(b.counts.silver, 1); assert.equal(b.total, 1);
  assert.ok(!JSON.stringify(b).includes('18000') && !JSON.stringify(b).includes('180'));
  // level change replaces the old gift
  assert.equal((await join(720, { name: 'The Cohen Family', show: true }, { replace: true })).status, 200);
  b = (await c.call('GET', '/api/club')).json; assert.equal(b.members.length, 1); assert.equal(b.members[0].level, 'platinum'); assert.equal(b.total, 1);
  assert.equal((await c.call('GET', '/api/subscriptions', null, c.token)).json.subscriptions.length, 1);
  // anonymous donors are counted, not named
  const d = await start(); t.after(d.close); d.stripe = c.stripe;
  await c.call('POST', '/api/subscribe', gift({ amount: 72, fund: 'chai', idem: 'idem-club-anon-0000001', club: { name: 'Secret', show: false } }), c.token);
  b = (await c.call('GET', '/api/club')).json; assert.equal(b.counts.bronze, 1); assert.ok(!JSON.stringify(b).includes('Secret'));
  assert.equal(b.members[0].level, 'platinum');
  const r = await fetch(c.base + '/api/club'); assert.equal(r.headers.get('access-control-allow-origin'), '*');
  const page = await fetch(c.base + '/board/'); assert.equal(page.status, 200); assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'self' https:\/\//);
});

test('admin: monthly donors screen lists people with levels and contact details (private)', async (t) => {
  const stripe = fakeStripe();
  const app = createApp({ stripe, publishableKey: 'pk_test_abc', sessionSecret: 'a'.repeat(32), log: { error() {} }, adminPassword: 'correct horse battery' });
  const server = await new Promise((r) => { const sv = app.listen(0, () => r(sv)); }); t.after(() => server.close());
  const base = 'http://127.0.0.1:' + server.address().port;
  const cus = await stripe.customers.create({ name: 'Dina Cohen', email: 'dina@example.com' }); stripe.addCard(cus.id);
  const token = require('crypto').createHmac('sha256', 'a'.repeat(32)).update(cus.id).digest('base64url');
  const post = (path, body, headers = {}) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const sub = (amount, club, fund) => post('/api/subscribe', { amount, fund, idem: 'idem-adm-' + amount + '-xxxxxxxxxx', club }, { authorization: 'Bearer ' + cus.id + '.' + token });
  assert.equal((await sub(360, { name: 'The Cohens', show: true }, 'chai')).status, 200);
  assert.equal((await sub(50, { name: 'x', show: true }, 'chai')).status, 200);
  assert.equal((await fetch(base + '/admin/api/donors')).status, 401);
  const login = await post('/admin/api/login', { password: 'correct horse battery' });
  const h = { cookie: login.headers.get('set-cookie').split(';')[0] };
  const j = await (await fetch(base + '/admin/api/donors', { headers: h })).json();
  assert.equal(j.donors.length, 2); assert.equal(j.donors[0].level, 'gold'); assert.equal(j.donors[0].email, 'dina@example.com'); assert.equal(j.donors[0].onBoard, true);
  assert.equal(j.donors[1].level, null); assert.equal(j.byLevel.gold.count, 1); assert.equal(j.byLevel.gold.monthly, 360); assert.equal(j.total.count, 2);
  assert.equal((await fetch(base + '/admin/api/members', { headers: h })).status, 503); // no database connected
});
