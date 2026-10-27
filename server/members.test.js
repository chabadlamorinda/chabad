'use strict';
process.env.PUSHKA_TIMEZONE = 'America/' + 'Los_Angeles'; // the reminder tests use fixed Pacific-time instants
// Needs a Postgres: starts a throwaway one automatically (or uses TEST_DATABASE_URL).
const test = require('node:test');
const assert = require('node:assert/strict');
const Stripe = require('stripe');
const H = require('../pushka/hebdate.js');
const { createApp } = require('./index.js');
const { createStore } = require('./store.js');
const { createScheduler } = require('./scheduler.js');
const { startPg } = require('./pg-test-helper.js');

const SECRET = 'a'.repeat(32), WH = 'whsec_test_secret', PW = 'correct horse battery';
let pg, store, sent, server, base;
const stripe = new Stripe('sk_test_dummy');

test.before(async () => {
  pg = await startPg(); store = createStore(pg.url); await store.migrate();
  sent = [];
  const app = createApp({ stripe, publishableKey: 'pk_test_x', sessionSecret: SECRET, log: { error() {} }, store, vapidPublicKey: 'BPUB',
    sendPush: async (sub, payload) => { if (sub.endpoint.includes('gone')) { const e = new Error('gone'); e.statusCode = 410; throw e; } sent.push({ endpoint: sub.endpoint, payload }); },
    webhookSecret: WH, adminPassword: PW, applePayAssoc: 'APPLE-FILE-CONTENT' });
  server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  base = 'http://127.0.0.1:' + server.address().port;
});
test.after(async () => { server.close(); await store.close(); await pg.stop(); });
test.beforeEach(async () => { await store.reset(); sent.length = 0; });

const call = async (method, path, body, o = {}) => {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(o.token ? { authorization: 'Bearer ' + o.token } : {}), ...(o.headers || {}) }, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch (e) {}
  return { status: r.status, json, text, headers: r.headers };
};
const join = async (extra = {}) => { const r = await call('POST', '/api/member', { name: 'Dina Cohen', email: 'Dina@Example.com', phone: '925-555-0100', ...extra }); assert.equal(r.status, 200); return r.json.token; };
const entry = (o = {}) => ({ id: 'e1', name: 'Moshe ben Yosef', relation: 'Father', day: 10, month: 'Tevet', year: 5780, notes: '', ...o });
const adminLogin = async () => { const r = await call('POST', '/admin/api/login', { password: PW }); assert.equal(r.status, 200); return { cookie: r.headers.get('set-cookie').split(';')[0], 'x-admin': '1' }; };

test('config advertises members and push key when configured', async () => {
  const r = await call('GET', '/api/config'); assert.equal(r.json.members, true); assert.equal(r.json.vapidPublicKey, 'BPUB');
});

test('member: create, validate, update, token cannot be forged or used as a stripe token', async () => {
  assert.equal((await call('POST', '/api/member', { name: '', email: 'a@b.co' })).json.code, 'invalid_name');
  assert.equal((await call('POST', '/api/member', { name: 'A', email: 'bad' })).json.code, 'invalid_email');
  const tok = await join();
  const me = await call('GET', '/api/member', undefined, { token: tok });
  assert.equal(me.json.email, 'dina@example.com'); assert.equal(me.json.share, false);
  // update in place keeps the same id
  const tok2 = (await call('POST', '/api/member', { name: 'Dina C', email: 'dina@example.com' }, { token: tok })).json.token;
  assert.equal(tok2, tok); assert.equal((await call('GET', '/api/member', undefined, { token: tok })).json.name, 'Dina C');
  assert.equal((await call('GET', '/api/member', undefined, { token: tok.slice(0, -2) + 'xx' })).status, 401);
  assert.equal((await call('GET', '/api/member')).status, 401);
  assert.equal((await call('GET', '/api/payment-method', undefined, { token: tok })).status, 401); // not a stripe token
});

test('yahrzeits: validation, replace, sharing is off unless asked', async () => {
  const tok = await join();
  assert.equal((await call('PUT', '/api/yahrzeits', { entries: [entry({ month: 'Nope' })] }, { token: tok })).json.code, 'invalid_entries');
  assert.equal((await call('PUT', '/api/yahrzeits', { entries: [entry({ day: 31 })] }, { token: tok })).status, 400);
  assert.equal((await call('PUT', '/api/yahrzeits', { entries: [entry(), entry()] }, { token: tok })).status, 400); // duplicate id
  assert.equal((await call('PUT', '/api/yahrzeits', { entries: [entry()] }, { token: tok })).json.count, 1);
  assert.equal((await call('GET', '/api/member', undefined, { token: tok })).json.share, false);
  const a = await adminLogin();
  assert.equal((await call('GET', '/admin/api/yahrzeits?days=400', undefined, { headers: a })).json.items.length, 0); // private, not shared
  await call('PUT', '/api/yahrzeits', { entries: [entry()], share: true }, { token: tok });
  const list = (await call('GET', '/admin/api/yahrzeits?days=400', undefined, { headers: a })).json.items;
  assert.equal(list.length, 1); assert.equal(list[0].member.email, 'dina@example.com'); assert.equal(list[0].name, 'Moshe ben Yosef');
  // opting out removes it again
  await call('PUT', '/api/yahrzeits', { entries: [entry()], share: false }, { token: tok });
  assert.equal((await call('GET', '/admin/api/yahrzeits?days=400', undefined, { headers: a })).json.items.length, 0);
  await call('PUT', '/api/yahrzeits', { entries: [entry()], share: true }, { token: tok });
  await call('DELETE', '/api/yahrzeits', undefined, { token: tok });
  assert.equal((await call('GET', '/admin/api/yahrzeits?days=400', undefined, { headers: a })).json.items.length, 0);
});

test('deleting a member removes their data', async () => {
  const tok = await join();
  await call('PUT', '/api/yahrzeits', { entries: [entry()], share: true }, { token: tok });
  assert.equal((await call('DELETE', '/api/member', undefined, { token: tok })).status, 200);
  assert.equal((await store.sharedYahrzeits()).length, 0); assert.equal((await store.listMembers()).length, 0);
  assert.equal((await call('GET', '/api/member', undefined, { token: tok })).status, 401);
});

test('admin: sign-in required, wrong password rejected, csrf header required, rate limited', async () => {
  assert.equal((await call('GET', '/admin/api/members')).status, 401);
  assert.equal((await call('POST', '/admin/api/login', { password: 'nope' })).status, 401);
  const a = await adminLogin();
  assert.equal((await call('GET', '/admin/api/members', undefined, { headers: a })).status, 200);
  const noHeader = { cookie: a.cookie };
  assert.equal((await call('PUT', '/admin/api/followup', { yahrzeitId: 'x', occurrence: '2026-01-01' }, { headers: noHeader })).status, 403);
  assert.equal((await call('GET', '/admin/api/members', undefined, { headers: { cookie: 'cl_admin=1.bad' } })).status, 401);
  const page = await call('GET', '/admin/'); assert.equal(page.status, 200); assert.match(page.text, /Rabbi/);
  assert.match(page.headers.get('x-robots-tag'), /noindex/);
  // lockout is tested on its own server so it does not use up this server's allowance
  const app2 = createApp({ stripe: null, sessionSecret: SECRET, log: { error() {} }, store, adminPassword: PW });
  const s2 = await new Promise((r) => { const x = app2.listen(0, () => r(x)); });
  let last; for (let i = 0; i < 10; i++) last = await fetch('http://127.0.0.1:' + s2.address().port + '/admin/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"password":"bad"}' });
  assert.equal(last.status, 429); s2.close();
});

test('admin is off without a strong password', async () => {
  const app = createApp({ stripe: null, sessionSecret: SECRET, log: { error() {} }, store, adminPassword: 'short' });
  const s = await new Promise((r) => { const x = app.listen(0, () => r(x)); });
  const r = await fetch('http://127.0.0.1:' + s.address().port + '/admin/'); assert.equal(r.status, 404); s.close();
});

test('admin: upcoming list, follow-up notes, csv is formula-safe', async () => {
  const tok = await join({ name: '=HYPERLINK("http://evil")' });
  const today = require('./scheduler.js').ptParts(new Date()).ymd, target = H.addDays(today, 5), hd = H.hebrewOf(target);
  await call('PUT', '/api/yahrzeits', { entries: [entry({ id: 'near', name: '+cmd|evil', day: hd.day, month: hd.month, year: hd.year - 3 }), entry({ id: 'far', name: 'Far', day: hd.day, month: hd.month === 'Tishri' ? 'Nisan' : 'Tishri', year: 5700 })], share: true }, { token: tok });
  const a = await adminLogin();
  const soon = (await call('GET', '/admin/api/yahrzeits?days=10', undefined, { headers: a })).json.items;
  assert.equal(soon.length, 1); assert.equal(soon[0].daysLeft, 5); assert.equal(soon[0].date, target);
  assert.equal((await call('PUT', '/admin/api/followup', { yahrzeitId: soon[0].id, occurrence: soon[0].date, note: 'Called, will visit', done: true }, { headers: a })).status, 200);
  const again = (await call('GET', '/admin/api/yahrzeits?days=10', undefined, { headers: a })).json.items[0];
  assert.deepEqual(again.followup, { note: 'Called, will visit', done: true });
  assert.equal((await call('PUT', '/admin/api/followup', { yahrzeitId: 'x', occurrence: 'bad' }, { headers: a })).status, 400);
  const csv = await call('GET', '/admin/api/export.csv', undefined, { headers: a });
  assert.match(csv.headers.get('content-type'), /text\/csv/); assert.ok(csv.text.includes('"\'+cmd|evil"')); assert.ok(csv.text.includes('"\'=HYPERLINK'));
  assert.ok(!/(^|,)"[=+@-]/m.test(csv.text.split('\r\n').slice(1).join('\r\n')));
  const members = (await call('GET', '/admin/api/members', undefined, { headers: a })).json.members;
  assert.equal(members[0].yahrzeits, 2);
});

test('push: subscribe validation, prefs, unsubscribe, broadcast rules and delivery', async () => {
  const bad = await call('POST', '/api/push/subscribe', { subscription: { endpoint: 'http://insecure', keys: { p256dh: 'a', auth: 'b' } } });
  assert.equal(bad.json.code, 'invalid_subscription');
  const tok = await join();
  const sub = (n) => ({ subscription: { endpoint: 'https://push.example/' + n, keys: { p256dh: 'p256', auth: 'auth' } }, prefs: { lang: 'he', candle: { on: true, mins: 999 }, streak: { on: true }, yahrzeit: { on: true, leads: [7, 1, 0, 99] } } });
  assert.equal((await call('POST', '/api/push/subscribe', sub('one'), { token: tok })).status, 200);
  assert.equal((await call('POST', '/api/push/subscribe', sub('gone'))).status, 200); // anonymous device
  const subs = await store.listPushSubs(); assert.equal(subs.length, 2);
  const p = subs.find((x) => x.endpoint.endsWith('/one')); assert.equal(p.prefs.candle.mins, 120); assert.deepEqual(p.prefs.yahrzeit.leads, [7, 1, 0]); assert.equal(p.member_id !== null, true);
  await call('PUT', '/api/push/prefs', { endpoint: 'https://push.example/one', prefs: { lang: 'en', streak: { on: false } } });
  assert.equal((await store.listPushSubs()).find((x) => x.endpoint.endsWith('/one')).prefs.lang, 'en');

  const a = await adminLogin();
  const body = { title: 'Shabbat Shalom', body: 'Join us Friday night', url: '/pushka/' };
  assert.equal((await call('POST', '/admin/api/broadcast', body, { headers: a })).json.code, 'confirm');
  assert.equal((await call('POST', '/admin/api/broadcast', { ...body, confirm: true, url: 'https://evil.example' }, { headers: a })).status, 400);
  assert.equal((await call('POST', '/admin/api/broadcast', { ...body, confirm: true, url: '/pushka/../admin/' }, { headers: a })).status, 400);
  assert.equal((await call('POST', '/admin/api/broadcast', { ...body, confirm: true, title: 'x'.repeat(61) }, { headers: a })).status, 400);
  const ok = await call('POST', '/admin/api/broadcast', { ...body, confirm: true }, { headers: a });
  assert.equal(ok.json.sent, 1); assert.equal(ok.json.total, 2); assert.equal(sent[0].payload.title, 'Shabbat Shalom');
  assert.equal((await store.listPushSubs()).length, 1); // the expired (410) device was dropped
  await call('POST', '/api/push/unsubscribe', { endpoint: 'https://push.example/one' });
  assert.equal((await store.listPushSubs()).length, 0);
});

const hook = async (event, { secret = WH, ts } = {}) => {
  const payload = JSON.stringify(event);
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret, ...(ts ? { timestamp: ts } : {}) });
  return call('POST', '/api/stripe/webhook', payload, { headers: { 'stripe-signature': header } });
};
test('webhook: rejects bad signatures, flags card issue on failure, clears on success, idempotent', async () => {
  const tok = await join(); const mid = tok.split('.')[0];
  await store.linkStripe(mid, 'cus_ABC123');
  const bodyStr = JSON.stringify({ id: 'evt_1', type: 'invoice.payment_failed', data: { object: { customer: 'cus_ABC123', customer_email: 'dina@example.com', amount_due: 3600 } } });
  assert.equal((await call('POST', '/api/stripe/webhook', bodyStr, { headers: { 'stripe-signature': 't=1,v1=deadbeef' } })).status, 400);
  assert.equal((await call('POST', '/api/stripe/webhook', bodyStr)).status, 400);
  assert.equal((await hook({ id: 'evt_1', type: 'invoice.payment_failed', data: { object: { customer: 'cus_ABC123' } } }, { secret: 'whsec_wrong' })).status, 400);
  assert.equal((await hook({ id: 'evt_1', type: 'invoice.payment_failed', data: { object: { customer: 'cus_ABC123', customer_email: 'dina@example.com', amount_due: 3600 } } })).status, 200);
  assert.equal((await call('GET', '/api/member', undefined, { token: tok })).json.cardIssue, 'Monthly gift could not be charged');
  await hook({ id: 'evt_1', type: 'invoice.payment_failed', data: { object: { customer: 'cus_ABC123' } } }); // replay
  assert.equal((await store.listPaymentEvents()).length, 1);
  // a non-pushka one-off failure is ignored; a pushka one is recorded
  await hook({ id: 'evt_2', type: 'payment_intent.payment_failed', data: { object: { customer: 'cus_ABC123', amount: 100, metadata: {} } } });
  assert.equal((await store.listPaymentEvents()).length, 1);
  await hook({ id: 'evt_3', type: 'payment_intent.payment_failed', data: { object: { customer: 'cus_ABC123', amount: 1800, metadata: { source: 'pushka' }, last_payment_error: { message: 'Your card was declined.' } } } });
  assert.equal((await call('GET', '/api/member', undefined, { token: tok })).json.cardIssue, 'Your card was declined.');
  const a = await adminLogin();
  assert.equal((await call('GET', '/admin/api/payments', undefined, { headers: a })).json.events.length, 2);
  assert.equal((await call('POST', '/api/member/card-updated', {}, { token: tok })).status, 200);
  assert.equal((await call('GET', '/api/member', undefined, { token: tok })).json.cardIssue, '');
  await hook({ id: 'evt_5', type: 'payment_intent.payment_failed', data: { object: { customer: 'cus_ABC123', amount: 1800, metadata: { source: 'pushka' } } } });
  await hook({ id: 'evt_4', type: 'invoice.paid', data: { object: { customer: 'cus_ABC123' } } });
  assert.equal((await call('GET', '/api/member', undefined, { token: tok })).json.cardIssue, '');
  assert.ok((await store.listPaymentEvents()).every((e) => e.resolved));
  assert.equal((await call('POST', '/admin/api/payments/evt_1/resolve', {}, { headers: a })).status, 200);
});

test('webhook: informational events are recorded as handled; unknown events accepted', async () => {
  assert.equal((await hook({ id: 'evt_r', type: 'charge.refunded', data: { object: { customer: 'cus_Z', amount_refunded: 500 } } })).status, 200);
  const e = (await store.listPaymentEvents())[0]; assert.equal(e.resolved, true); assert.equal(e.amount_cents, 500);
  assert.equal((await hook({ id: 'evt_x', type: 'customer.created', data: { object: {} } })).status, 200);
});

test('apple pay domain file is served when configured', async () => {
  const r = await call('GET', '/.well-known/apple-developer-merchantid-domain-association'); assert.equal(r.status, 200); assert.equal(r.text, 'APPLE-FILE-CONTENT');
});

test('without a database the member endpoints say so and nothing crashes', async () => {
  const app = createApp({ stripe: null, sessionSecret: SECRET, log: { error() {} } });
  const s = await new Promise((r) => { const x = app.listen(0, () => r(x)); });
  const b = 'http://127.0.0.1:' + s.address().port;
  assert.equal((await fetch(b + '/api/member', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 503);
  assert.equal((await fetch(b + '/api/stripe/webhook', { method: 'POST' })).status, 503);
  assert.equal((await (await fetch(b + '/api/config')).json()).members, false); s.close();
});

test('scheduler: yahrzeit reminders at the right lead times, once, in the right language', async () => {
  const tok = await join(), mid = tok.split('.')[0];
  const now = new Date(Date.UTC(2026, 9, 15, 15, 5)); // 8:05 am Pacific, 15 Oct 2026
  const target = H.addDays('2026-10-15', 7), hd = H.hebrewOf(target);
  await call('PUT', '/api/yahrzeits', { entries: [entry({ id: 'y', day: hd.day, month: hd.month, year: hd.year - 10 })] }, { token: tok });
  await call('POST', '/api/push/subscribe', { subscription: { endpoint: 'https://push.example/s', keys: { p256dh: 'a', auth: 'b' } }, prefs: { lang: 'he', yahrzeit: { on: true, leads: [7, 1, 0] } } }, { token: tok });
  const sch = createScheduler({ store, send: async (sub, payload) => { sent.push({ endpoint: sub.endpoint, payload }); }, getCandles: async () => [], log: { error() {} } });
  assert.equal(await sch.tick(now), 1); assert.match(sent[0].payload.title, /יארצייט/); assert.equal(sent[0].payload.url, '/pushka/?go=yahrzeit');
  assert.equal(await sch.tick(now), 0); // not repeated
  assert.equal(await sch.tick(new Date(Date.UTC(2026, 9, 15, 17, 5))), 0); // 10:05, outside the morning window
  assert.equal(await sch.tick(new Date(Date.UTC(2026, 9, 16, 15, 5))), 0); // 6 days left: no reminder configured
  assert.equal(await sch.tick(new Date(Date.UTC(2026, 9, 21, 15, 5))), 1); // 1 day left
  assert.ok(mid);
});

test('scheduler: candle lighting reminder and daily coin streak', async () => {
  await call('POST', '/api/push/subscribe', { subscription: { endpoint: 'https://push.example/c', keys: { p256dh: 'a', auth: 'b' } }, prefs: { lang: 'en', candle: { on: true, mins: 20 }, streak: { on: true }, lastCoin: '' } });
  const candle = '2026-10-16T18:07:00-07:00';
  const sch = createScheduler({ store, send: async (sub, payload) => { sent.push(payload); }, getCandles: async () => [candle], log: { error() {} } });
  assert.equal(await sch.tick(new Date('2026-10-16T17:50:00-07:00')), 1); // 17 min before = inside the window after the 20-min mark
  assert.equal(sent[0].tag, 'candle'); assert.match(sent[0].body, /20 minutes/);
  assert.equal(await sch.tick(new Date('2026-10-16T17:55:00-07:00')), 0);
  assert.equal(await sch.tick(new Date('2026-10-14T20:03:00-07:00')), 1); // Wednesday evening streak nudge
  assert.equal(sent[1].tag, 'streak');
  await call('PUT', '/api/push/prefs', { endpoint: 'https://push.example/c', prefs: { lang: 'en', streak: { on: true }, lastCoin: '2026-10-15' } });
  assert.equal(await sch.tick(new Date('2026-10-15T20:03:00-07:00')), 0); // already dropped a coin today
  assert.equal(await sch.tick(new Date('2026-10-17T20:03:00-07:00')), 0); // Shabbat: no nudge
});

test('yahrzeit reminders default to a month, a week and a day before', async () => {
  const tok = await join(), now = new Date(Date.UTC(2026, 9, 15, 15, 5));
  const hd = H.hebrewOf(H.addDays('2026-10-15', 30));
  await call('PUT', '/api/yahrzeits', { entries: [entry({ id: 'm', day: hd.day, month: hd.month, year: hd.year - 5 })] }, { token: tok });
  await call('POST', '/api/push/subscribe', { subscription: { endpoint: 'https://push.example/d', keys: { p256dh: 'a', auth: 'b' } }, prefs: { lang: 'en', yahrzeit: { on: true } } }, { token: tok });
  assert.deepEqual((await store.listPushSubs())[0].prefs.yahrzeit.leads, [30, 7, 1]);
  const sch = createScheduler({ store, send: async (s, p) => { sent.push(p); }, getCandles: async () => [], log: { error() {} } });
  assert.equal(await sch.tick(now), 1); assert.match(sent[0].body, /about a month/);
  assert.equal(await sch.tick(new Date(Date.UTC(2026, 10, 7, 16, 5))), 1); // 7 days before (pacific 8:05)
  assert.equal(await sch.tick(new Date(Date.UTC(2026, 10, 13, 16, 5))), 1); // 1 day before
});

test('community counter and announcements', async () => {
  assert.equal((await call('POST', '/api/community/coins', { n: 3, cents: 540 })).status, 200);
  assert.equal((await call('POST', '/api/community/coins', { n: 999999, cents: -5 })).status, 200); // clamped, never negative
  const w = (await call('GET', '/api/community')).json.weekCoins; assert.equal(w, 53);
  assert.deepEqual((await call('GET', '/api/announcements')).json.items, []);
  const a = await adminLogin();
  assert.equal((await call('PUT', '/admin/api/announcements', { items: [{ title: '' }] }, { headers: a })).status, 400);
  const items = [{ kind: 'cause', title: 'Shabbos meals', body: 'Help us feed 60 families', goal: 1800, raised: 900, fund: 'general', until: '2999-01-01' }, { kind: 'match', title: 'Old match', until: '2000-01-01', fund: 'nope' }];
  const saved = await call('PUT', '/admin/api/announcements', { items }, { headers: a }); assert.equal(saved.status, 200); assert.equal(saved.json.items[1].fund, '');
  const pub = (await call('GET', '/api/announcements')).json.items; assert.equal(pub.length, 1); assert.equal(pub[0].title, 'Shabbos meals'); assert.equal(pub[0].raised, 900);
  assert.equal((await call('PUT', '/admin/api/announcements', { items }, {})).status, 401);
});

test('scheduler: custom reminders, one-off, weekly summary, streak rescue, birthdays', async () => {
  const sub = (prefs) => call('POST', '/api/push/subscribe', { subscription: { endpoint: 'https://push.example/' + Math.random().toString(36).slice(2), keys: { p256dh: 'a', auth: 'b' } }, prefs });
  const sch = createScheduler({ store, send: async (s, p) => { sent.push(p); }, getCandles: async () => [], log: { error() {} } });
  await sub({ lang: 'en', custom: [{ id: 'c1', time: '08:00', days: 'daily', text: 'Good morning coin' }, { id: 'c2', time: '09:00', days: 'once', date: '2026-10-21', text: 'Travel coin' }, { id: 'c3', time: '10:00', days: 'chai', text: 'Chai day' }, { id: 'bad', time: 'xx', days: 'daily' }] });
  // Wed 21 Oct 2026, 8:05 am Pacific
  assert.equal(await sch.tick(new Date(Date.UTC(2026, 9, 21, 15, 5))), 1); assert.equal(sent[0].body, 'Good morning coin');
  assert.equal(await sch.tick(new Date(Date.UTC(2026, 9, 21, 15, 6))), 0); // once only
  assert.equal(await sch.tick(new Date(Date.UTC(2026, 9, 21, 16, 5))), 1); assert.equal(sent[1].body, 'Travel coin'); // 9:05, one-off on its date
  assert.equal(await sch.tick(new Date(Date.UTC(2026, 9, 22, 16, 5))), 0); // next day: one-off gone, daily one not yet due
  await store.reset(); sent.length = 0;
  await sub({ lang: 'en', weekly: { on: true }, week: { coins: 4, sum: 7.2 } });
  assert.equal(await sch.tick(new Date(Date.UTC(2026, 9, 25, 17, 5))), 1); assert.match(sent[0].body, /4 coins/); // Sunday 10:05
  await store.reset(); sent.length = 0;
  await sub({ lang: 'he', streak: { on: true }, streakN: 12, lastCoin: '' });
  assert.equal(await sch.tick(new Date(Date.UTC(2026, 9, 22, 3, 5))), 1); assert.match(sent[0].body, /12/); // Wed 8:05 pm Pacific, 12-day streak
  await store.reset(); sent.length = 0;
  await sub({ lang: 'en', tz: 'America/' + 'New_York', dates: [{ id: 'd1', name: 'Rachel', kind: 'birthday', m: 10, d: 28 }] });
  assert.equal(await sch.tick(new Date(Date.UTC(2026, 9, 21, 12, 5))), 1); assert.match(sent[0].title, /Rachel.*7 days/); // 8:05 am Eastern, 7 days before
  assert.equal(await sch.tick(new Date(Date.UTC(2026, 9, 28, 12, 5))), 1); assert.match(sent[1].title, /Today/);
});
