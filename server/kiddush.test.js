'use strict';
// Kiddush board tests. Needs a Postgres: starts a throwaway one automatically (or uses TEST_DATABASE_URL).
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('./index.js');
const { createStore } = require('./store.js');
const { fakeStripe } = require('./fake-stripe.js');
const { startPg } = require('./pg-test-helper.js');
const cal = require('./kiddush-calendar.js');

const SECRET = 'a'.repeat(32), WH = 'whsec_kiddush_test', PW = 'correct horse battery';
const NOW = new Date('2026-10-15T12:00:00-07:00'); // Simchat Torah 5787 has passed; Noach is the next Shabbat
let pg, store, stripe, server, base, serverNoDb, baseNoDb, dbApp;
const mailed = []; const fakeMailer = { send: async (m) => { mailed.push(m); } };

test.before(async () => {
  pg = await startPg(); store = createStore(pg.url); await store.migrate();
  stripe = fakeStripe();
  const mk = (extra) => createApp({ stripe, publishableKey: 'pk_test_x', sessionSecret: SECRET, log: { error() {} }, webhookSecret: WH, now: () => NOW, ...extra });
  dbApp = mk({ store, adminPassword: PW, mailer: fakeMailer }); server = await new Promise((r) => { const s = dbApp.listen(0, () => r(s)); });
  base = 'http://127.0.0.1:' + server.address().port;
  serverNoDb = await new Promise((r) => { const s = mk({}).listen(0, () => r(s)); });
  baseNoDb = 'http://127.0.0.1:' + serverNoDb.address().port;
});
test.after(async () => { server.close(); serverNoDb.close(); await store.close(); await pg.stop(); });
test.beforeEach(async () => { await store.kiddushResetForTests(); stripe._st.calls.length = 0; mailed.length = 0; });

const call = async (method, path, body, o = {}) => {
  const r = await fetch((o.base || base) + path, { method, headers: { 'content-type': 'application/json', ...(o.headers || {}) }, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch (e) { /* not json */ }
  return { status: r.status, json, text, headers: r.headers };
};
let adminSession = null; // sign in once: the real login is rate-limited (8 per 15 minutes)
const adminLogin = async () => { if (adminSession) return adminSession; const r = await call('POST', '/admin/api/login', { password: PW }); assert.equal(r.status, 200); return (adminSession = { cookie: r.headers.get('set-cookie').split(';')[0], 'x-admin': '1' }); };
const confirmPaid = async (id) => { const r = await call('PATCH', '/admin/api/kiddush/sponsorship/' + id, { status: 'paid' }, { headers: await adminLogin() }); assert.equal(r.status, 200, r.text); return r.json; };
const board = async (q = '') => (await call('GET', '/api/kiddush/board' + q)).json;
const firstOpen = async (pred = () => true) => (await board()).slots.find((s) => s.status === 'open' && !s.past && pred(s));
let n = 0;
const form = (slot, o = {}) => ({ slot: slot.key, name: 'The Levy Family', email: 'Levy@Example.com', phone: '925-555-0101', method: 'check', amount: slot.priceCents / 100, dedicationKind: 'honor', dedication: 'Sara’s birthday', note: 'Please call me', idem: 'idem-' + (++n) + '-abcdefghijklmnop', ...o });

// ---------------------------------------------------------------- calendar

test('calendar: 5786 matches the original board (parshiyos and every holiday day)', async () => {
  const slots = await cal.buildYear(5786);
  const by = new Map(slots.map((s) => [s.key, s]));
  const expect = {
    '2025-09-23|rh1': 'Rosh Hashanah – Day 1', '2025-09-24|rh2': 'Rosh Hashanah – Day 2', '2025-09-27|shabbat': 'Vayelech', '2025-10-02|yk': 'Yom Kippur – Break-Fast',
    '2025-10-07|suk1': 'Sukkot – Day 1', '2025-10-08|suk2': 'Sukkot – Day 2', '2025-10-11|sukcm': 'Shabbos Chol Hamoed Sukkot', '2025-10-14|sha': 'Shemini Atzeret', '2025-10-15|simt': 'Simchat Torah',
    '2025-10-18|shabbat': 'Bereishis', '2025-11-29|shabbat': 'Vayeitzei', '2026-03-07|shabbat': 'Ki Tisa', '2026-03-14|shabbat': 'Vayakhel-Pekudei', '2026-03-03|purim': 'Purim',
    '2026-04-02|pes1': 'Pesach – Day 1', '2026-04-03|pes2': 'Pesach – Day 2', '2026-04-04|pescm': 'Shabbos Chol Hamoed Pesach', '2026-04-08|pes7': 'Pesach – Day 7', '2026-04-09|pes8': 'Pesach – Day 8',
    '2026-04-18|shabbat': 'Tazria-Metzora', '2026-04-25|shabbat': 'Acharei-Kedoshim', '2026-05-09|shabbat': 'Behar-Bechukotai', '2026-05-22|shav1': 'Shavuos – Day 1', '2026-05-23|shav2': 'Shavuos – Day 2',
    '2026-05-30|shabbat': 'Naso', '2026-06-06|shabbat': 'Behaalotecha', '2026-06-27|shabbat': 'Chukas-Balak', '2026-07-11|shabbat': 'Matot-Masei', '2026-09-05|shabbat': 'Nitzavim-Vayelech',
  };
  for (const [k, title] of Object.entries(expect)) assert.equal(by.get(k) && by.get(k).title, title, k);
  assert.equal(by.get('2025-11-29|shabbat').heb, '9 Kislev');
  assert.equal(by.get('2025-11-29|shabbat').dateLabel, 'Nov 29');
  assert.equal(slots.length, by.size, 'no duplicate keys');
  assert.deepEqual(slots.map((s) => s.date), slots.map((s) => s.date).slice().sort(), 'date order');
  // Shabbat that is also Yom Tov (Shavuos 5786 started Friday; Sukkot) never appears twice
  assert.equal(slots.filter((s) => s.date === '2026-05-23').length, 1);
});

test('calendar: every Shabbat of several years has a parshah name we recognise; leap years put Purim in Adar II', async () => {
  for (let y = 5786; y < 5800; y++) {
    const slots = await cal.buildYear(y);
    const sh = slots.filter((s) => s.kind === 'shabbat');
    assert.ok(sh.length >= 43 && sh.length <= 52, y + ': ' + sh.length);
    for (const s of sh) { assert.ok(s.title && !/^[a-z]/.test(s.title) , s.title); assert.equal(s.dow, 6); }
    assert.equal(slots.filter((s) => s.key.endsWith('|purim')).length, 1);
  }
  const leap = (await cal.buildYear(5787)).find((s) => s.kind === 'purim');
  assert.equal(leap.heb, '14 Adar II');
  assert.equal(leap.date, '2027-03-23');
  assert.equal(await cal.hebrewYearOf('2026-09-11'), 5786); assert.equal(await cal.hebrewYearOf('2026-09-12'), 5787);
});

// ---------------------------------------------------------------- public board

test('board: automatic year (5787 now), current week is the next upcoming one', async () => {
  const b = await board();
  assert.equal(b.year, 5787); assert.equal(b.yearHe, 'תשפ״ז'); assert.deepEqual(b.years, [5787]);
  assert.ok(b.slots.every((s) => s.year === 5787) && b.slots[0].key === '2026-09-12|rh1' && b.slots.at(-1).date < '2027-10-01');
  assert.equal(b.today, '2026-10-15');
  assert.equal(b.current, '2026-10-17|shabbat');
  const cur = b.slots.find((s) => s.key === b.current);
  assert.equal(cur.title, 'Noach'); assert.equal(cur.status, 'open'); assert.equal(cur.priceCents, 50000);
  assert.ok(b.slots.find((s) => s.key === '2026-10-10|shabbat').past);
  assert.equal(b.settings.ways.card, true); assert.equal(b.settings.ways.zelle, true); assert.equal(b.settings.zelleId, 'chabadlamorinda@gmail.com');
  assert.equal((await board('?year=5788')).year, 5787, 'other years are not offered');
  // automatic flip: the day before Rosh Hashanah 5788 the board already shows 5788; a manual setting overrides
  const flip = createApp({ stripe, publishableKey: 'pk_test_x', sessionSecret: SECRET, log: { error() {} }, store, now: () => new Date('2027-10-01T12:00:00-07:00') });
  const fs2 = await new Promise((r) => { const s = flip.listen(0, () => r(s)); });
  const fb = (await call('GET', '/api/kiddush/board', undefined, { base: 'http://127.0.0.1:' + fs2.address().port })).json;
  fs2.close(); assert.equal(fb.year, 5788); assert.equal(fb.current, '2027-10-02|rh1');
  const adm = await adminLogin();
  await call('PUT', '/admin/api/kiddush/settings', { boardYear: 5786 }, { headers: adm }); assert.equal((await board()).year, 5786);
  await call('PUT', '/admin/api/kiddush/settings', { boardYear: 0 }, { headers: adm }); assert.equal((await board()).year, 5787);
  const next = { key: '2027-09-25|shabbat', priceCents: 50000 }; // 5787's last Shabbat is sponsorable; 5788's first is not
  assert.equal((await call('POST', '/api/kiddush/sponsor', form({ key: '2027-10-09|shabbat', priceCents: 50000 }))).status, 404);
  assert.equal((await call('POST', '/api/kiddush/sponsor', form(next))).status, 200);
});

test('board without a database: shows the calendar, sponsoring still works (card via Stripe, others get instructions), but is not recorded', async () => {
  const nb = (m, p, b) => call(m, p, b, { base: baseNoDb });
  const b = (await nb('GET', '/api/kiddush/board')).json;
  assert.equal(b.sponsoring, true); assert.equal(b.recorded, false); assert.ok(b.slots.length > 50); assert.ok(b.slots.every((s) => s.status === 'open'));
  const slot = b.slots.find((s) => s.key === b.current);
  const z = await nb('POST', '/api/kiddush/sponsor', form(slot, { method: 'zelle' }));
  assert.equal(z.status, 200, z.text); assert.equal(z.json.recorded, false); assert.equal(z.json.instructions.zelleId, 'chabadlamorinda@gmail.com'); assert.equal(z.json.display.name, 'The Levy Family');
  assert.equal((await nb('POST', '/api/kiddush/sponsor', form(slot, { amount: 10 }))).json.code, 'amount_too_low');
  // card: Stripe Checkout carries the sponsor's details; coming back reads the payment from Stripe
  const c = await nb('POST', '/api/kiddush/sponsor', form(slot, { method: 'card', dedicationKind: 'memory', dedication: 'Avraham ben Yitzchak' }));
  assert.equal(c.status, 200, c.text); assert.match(c.json.url, /^https:\/\/checkout\.stripe\.com\//); assert.equal(c.json.recorded, false);
  const sid = Object.keys(stripe._st.sessions).pop(), sess = stripe._st.sessions[sid];
  assert.equal(sess.metadata.sponsor, 'The Levy Family'); assert.equal(sess.metadata.slot, slot.key); assert.match(sess.params.success_url, /paid=unrecorded&session_id=/);
  assert.equal((await nb('GET', `/api/kiddush/confirm?id=unrecorded&session_id=${sid}`)).json.status, 'pending');
  stripe.payCheckout(sid);
  const ok = (await nb('GET', `/api/kiddush/confirm?id=unrecorded&session_id=${sid}`)).json;
  assert.equal(ok.status, 'paid'); assert.equal(ok.display.name, 'The Levy Family'); assert.equal(ok.display.dedication, 'In loving memory of Avraham ben Yitzchak'); assert.equal(ok.slot.key, slot.key); assert.equal(ok.amountCents, 50000);
  assert.equal((await nb('GET', '/api/kiddush/confirm?id=unrecorded&session_id=cs_nope')).status, 404, 'unknown sessions are refused');
  assert.equal((await nb('POST', '/api/kiddush/cancel', { id: 'unrecorded' })).status, 200);
});

// ---------------------------------------------------------------- sponsoring: check / Zelle / Venmo

test('sponsor by check: reserves the week, shows instructions, hides private details, allows co-sponsors', async () => {
  const slot = await firstOpen();
  const r = await call('POST', '/api/kiddush/sponsor', form(slot));
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.status, 'pending'); assert.equal(r.json.instructions.payable, 'Chabad of Lamorinda'); assert.match(r.json.instructions.address, /Golden Gate/);
  assert.equal(r.json.instructions.amount, '500'); assert.match(r.json.instructions.memo, /Kiddush /);
  const b = await board(); const s = b.slots.find((x) => x.key === slot.key);
  assert.equal(s.status, 'open', 'a pledge is NOT on the board until the Rabbi confirms it'); assert.deepEqual(s.sponsors, []); assert.equal(s.sponsor, null);
  await confirmPaid(r.json.id);
  const shown = (await board()).slots.find((x) => x.key === slot.key);
  assert.equal(shown.status, 'sponsored'); assert.equal(shown.sponsor.name, 'The Levy Family'); assert.equal(shown.sponsor.dedication, 'In honor of Sara’s birthday');
  const raw = JSON.stringify(await board());
  for (const secret of ['Levy@Example.com', 'levy@example.com', '925-555-0101', 'Please call me']) assert.ok(!raw.includes(secret), 'leaked ' + secret);
  const again = await call('POST', '/api/kiddush/sponsor', form(slot, { name: 'Someone Else', email: 'else@example.com' }));
  assert.equal(again.status, 200, 'a second sponsor can join the same week');
  await confirmPaid(again.json.id);
  const pair = (await board()).slots.find((x) => x.key === slot.key);
  assert.deepEqual(pair.sponsors.map((x) => x.name), ['The Levy Family', 'Someone Else']); assert.equal(pair.sponsor.name, 'The Levy Family');
  // the same request sent twice (double tap) answers again instead of failing
  const body = form(await firstOpen());
  const one = await call('POST', '/api/kiddush/sponsor', body), two = await call('POST', '/api/kiddush/sponsor', body);
  assert.equal(two.status, 200); assert.equal(two.json.id, one.json.id); assert.equal(two.json.duplicate, true);
});

test('sponsor: validation, minimum amount, anonymous, Zelle and Venmo instructions', async () => {
  const slot = await firstOpen();
  const bad = async (o, code) => { const r = await call('POST', '/api/kiddush/sponsor', form(slot, o)); assert.equal(r.status, 400, JSON.stringify(o)); assert.equal(r.json.code, code); };
  await bad({ name: '' }, 'invalid_name'); await bad({ email: 'nope' }, 'invalid_email'); await bad({ method: 'bitcoin' }, 'invalid_method');
  await bad({ amount: 'abc' }, 'invalid_amount'); await bad({ amount: 100 }, 'amount_too_low'); await bad({ idem: 'short' }, 'invalid_request');
  assert.equal((await call('POST', '/api/kiddush/sponsor', form({ key: '2026-10-21|shabbat', priceCents: 50000 }))).status, 404);
  assert.equal((await call('POST', '/api/kiddush/sponsor', form({ key: 'garbage', priceCents: 50000 }))).status, 404);

  const adm = await adminLogin();
  assert.equal((await call('PUT', '/admin/api/kiddush/settings', { zelleId: 'rabbi@chabadoflamorinda.com', venmoHandle: '@Chabad-Lamorinda' }, { headers: adm })).status, 200);
  const z = await call('POST', '/api/kiddush/sponsor', form(slot, { method: 'zelle', anonymous: true, amount: 600 }));
  assert.equal(z.status, 200, z.text); assert.equal(z.json.instructions.zelleId, 'rabbi@chabadoflamorinda.com'); assert.equal(z.json.instructions.amount, '600'); assert.equal(z.json.display.name, 'Anonymous');
  assert.equal((await board()).slots.find((x) => x.key === slot.key).sponsor, null, 'hidden until confirmed');
  await confirmPaid(z.json.id);
  assert.equal((await board()).slots.find((x) => x.key === slot.key).sponsor.name, 'Anonymous');
  const slot2 = await firstOpen();
  const v = await call('POST', '/api/kiddush/sponsor', form(slot2, { method: 'venmo' }));
  assert.equal(v.json.instructions.venmoHandle, 'Chabad-Lamorinda'); assert.match(v.json.instructions.link, /^https:\/\/venmo\.com\/Chabad-Lamorinda\?txn=pay&amount=500&note=Kiddush/);
});

test('sponsor: at most four unpaid reservations per email', async () => {
  for (let i = 0; i < 4; i++) assert.equal((await call('POST', '/api/kiddush/sponsor', form(await firstOpen()))).status, 200);
  const r = await call('POST', '/api/kiddush/sponsor', form(await firstOpen())); assert.equal(r.status, 429); assert.equal(r.json.code, 'too_many');
});

// ---------------------------------------------------------------- sponsoring: card (Stripe Checkout)

test('card: creates a Stripe Checkout session, holds the week, confirms after payment, never double-books', async () => {
  const slot = await firstOpen();
  const r = await call('POST', '/api/kiddush/sponsor', form(slot, { method: 'card', fee: true, amount: 600 }));
  assert.equal(r.status, 200, r.text); assert.match(r.json.url, /^https:\/\/checkout\.stripe\.com\//);
  const [, params, opts] = stripe._st.calls.find((c) => c[0] === 'checkout.sessions.create');
  assert.equal(params.mode, 'payment'); assert.equal(params.customer_email, 'levy@example.com');
  assert.equal(params.line_items[0].price_data.unit_amount, 62100, '$600 + 3.5% fee'); // 60000 + 2100
  assert.equal(params.metadata.source, 'kiddush'); assert.equal(params.metadata.slot, slot.key);
  assert.match(params.success_url, /\/kiddush\/\?paid=ks_[0-9a-f]{24}&session_id=\{CHECKOUT_SESSION_ID\}$/); assert.match(params.cancel_url, /\/kiddush\/\?cancelled=ks_/);
  assert.ok(opts.idempotencyKey.startsWith('kiddush-ks_'));
  const id = r.json.id, sessionId = Object.keys(stripe._st.sessions).pop();
  assert.equal((await board()).slots.find((x) => x.key === slot.key).status, 'open', 'not shown while the donor is still at checkout');

  // back from Stripe before paying: still pending. Wrong ids are refused.
  assert.equal((await call('GET', `/api/kiddush/confirm?id=${id}&session_id=${sessionId}`)).json.status, 'pending');
  assert.equal((await call('GET', `/api/kiddush/confirm?id=${id}&session_id=cs_other`)).status, 404);
  assert.equal((await call('GET', '/api/kiddush/confirm?id=ks_nope&session_id=' + sessionId)).status, 404);
  stripe.payCheckout(sessionId);
  const ok = await call('GET', `/api/kiddush/confirm?id=${id}&session_id=${sessionId}`);
  assert.equal(ok.json.status, 'paid'); assert.equal(ok.json.slot.key, slot.key); assert.equal(ok.json.display.name, 'The Levy Family');
  assert.equal((await board()).slots.find((x) => x.key === slot.key).status, 'sponsored');
  assert.equal((await call('GET', `/api/kiddush/confirm?id=${id}&session_id=${sessionId}`)).json.status, 'paid', 'idempotent');
  assert.equal((await store.getSponsorship(id)).stripe_payment_intent, 'pi_' + sessionId);
});

test('card: cancelling, an expired checkout and the 35-minute hold all free the week again', async () => {
  const a = await firstOpen();
  const r = await call('POST', '/api/kiddush/sponsor', form(a, { method: 'card' }));
  await call('POST', '/api/kiddush/cancel', { id: r.json.id });
  assert.equal((await board()).slots.find((x) => x.key === a.key).status, 'open');
  assert.equal(stripe._st.sessions[Object.keys(stripe._st.sessions).pop()].status, 'expired', 'Stripe session closed too');

  const r2 = await call('POST', '/api/kiddush/sponsor', form(a, { method: 'card' })); assert.equal(r2.status, 200);
  await store.pool.query("UPDATE kiddush_sponsorships SET created_at = now() - interval '36 minutes' WHERE id=$1", [r2.json.id]);
  assert.equal((await board()).slots.find((x) => x.key === a.key).status, 'open');

  // a pending CHECK is never auto-released
  const b = await firstOpen(); const c = await call('POST', '/api/kiddush/sponsor', form(b));
  await store.pool.query("UPDATE kiddush_sponsorships SET created_at = now() - interval '30 days' WHERE id=$1", [c.json.id]);
  assert.equal((await store.getSponsorship(c.json.id)).status, 'pending', 'a pending CHECK is never auto-released');

  // a Stripe failure while creating the session must not leave the week stuck
  const d = await firstOpen((s) => s.key !== b.key);
  stripe._st.failNext = Object.assign(new Error('boom'), { type: 'StripeAPIError' });
  assert.equal((await call('POST', '/api/kiddush/sponsor', form(d, { method: 'card' }))).status, 500);
  assert.equal((await board()).slots.find((x) => x.key === d.key).status, 'open');
});

function signed(event) {
  const payload = JSON.stringify(event);
  return { payload, headers: { 'stripe-signature': stripe.webhooks.generateTestHeaderString({ payload, secret: WH }) } };
}
test('webhook: checkout.session.completed marks paid even if the donor never returns; expired releases; foreign sessions ignored', async () => {
  const a = await firstOpen();
  const r = await call('POST', '/api/kiddush/sponsor', form(a, { method: 'card' }));
  const ev = (type, extra = {}) => ({ id: 'evt_' + Math.random(), type, data: { object: { id: 'cs_x', payment_status: 'paid', payment_intent: 'pi_wh', metadata: { source: 'kiddush', sponsorship: r.json.id }, ...extra } } });
  let w = signed(ev('checkout.session.completed')); assert.equal((await call('POST', '/api/stripe/webhook', w.payload, { headers: w.headers })).status, 200);
  assert.equal((await board()).slots.find((x) => x.key === a.key).status, 'sponsored');
  assert.equal((await store.getSponsorship(r.json.id)).stripe_payment_intent, 'pi_wh');

  const b = await firstOpen(); const r2 = await call('POST', '/api/kiddush/sponsor', form(b, { method: 'card' }));
  w = signed({ id: 'evt_2', type: 'checkout.session.expired', data: { object: { id: 'cs_y', payment_status: 'unpaid', metadata: { source: 'kiddush', sponsorship: r2.json.id } } } });
  assert.equal((await call('POST', '/api/stripe/webhook', w.payload, { headers: w.headers })).status, 200);
  assert.equal((await board()).slots.find((x) => x.key === b.key).status, 'open');

  w = signed({ id: 'evt_3', type: 'checkout.session.completed', data: { object: { id: 'cs_z', payment_status: 'paid', metadata: { source: 'pushka' } } } });
  assert.equal((await call('POST', '/api/stripe/webhook', w.payload, { headers: w.headers })).status, 200);
  assert.equal((await call('POST', '/api/stripe/webhook', w.payload, { headers: { 'stripe-signature': 't=1,v1=bad' } })).status, 400);
});

// ---------------------------------------------------------------- Rabbi's admin

test('admin: must sign in; sees private details and hidden weeks', async () => {
  assert.equal((await call('GET', '/admin/api/kiddush/board')).status, 401);
  assert.equal((await call('PUT', '/admin/api/kiddush/settings', {})).status, 401);
  const adm = await adminLogin();
  assert.equal((await call('PUT', '/admin/api/kiddush/settings', { priceShabbat: 200 }, { headers: { cookie: adm.cookie } })).status, 403, 'needs the X-Admin header');
  const slot = await firstOpen(); await call('POST', '/api/kiddush/sponsor', form(slot, { amount: 600 }));
  const ab = (await call('GET', '/admin/api/kiddush/board', undefined, { headers: adm })).json;
  const s = ab.slots.find((x) => x.key === slot.key);
  assert.equal(s.sponsorship.email, 'levy@example.com'); assert.equal(s.sponsorship.note, 'Please call me'); assert.equal(s.sponsorship.status, 'pending'); assert.equal(s.sponsorship.amountCents, 60000);
  const pend = (await call('GET', '/admin/api/kiddush/pending', undefined, { headers: adm })).json.pending;
  assert.equal(pend.length, 1); assert.equal(pend[0].slot.key, slot.key);
});

test('admin: mark paid, edit, release, assign by hand, hide a week, change price or name', async () => {
  const adm = await adminLogin(); const h = { headers: adm };
  const slot = await firstOpen(); const r = await call('POST', '/api/kiddush/sponsor', form(slot));
  assert.equal((await call('PATCH', '/admin/api/kiddush/sponsorship/' + r.json.id, { status: 'paid', name: 'Levy Family', dedication: 'Mom', dedicationKind: 'memory' }, h)).status, 200);
  let s = (await board()).slots.find((x) => x.key === slot.key);
  assert.equal(s.status, 'sponsored'); assert.equal(s.sponsor.name, 'Levy Family'); assert.equal(s.sponsor.dedication, 'In loving memory of Mom');
  assert.ok((await store.getSponsorship(r.json.id)).paid_at);

  // a week can have several sponsors: add one by hand next to the first, then remove the first
  const body = { slot: slot.key, name: 'Cohen', amount: 180, method: 'cash', status: 'paid' };
  const made = await call('POST', '/admin/api/kiddush/sponsorship', { ...body, dedicationKind: 'refuah', dedication: 'Rivka bas Sarah' }, h); assert.equal(made.status, 200, made.text);
  s = (await board()).slots.find((x) => x.key === slot.key);
  assert.equal(s.sponsors.length, 2); assert.equal(s.sponsors[1].dedication, 'For the speedy recovery of Rivka bas Sarah');
  const ab2 = (await call('GET', '/admin/api/kiddush/board', undefined, h)).json.slots.find((x) => x.key === slot.key);
  assert.equal(ab2.sponsorships.length, 2); assert.equal(ab2.sponsorship.id, r.json.id);
  assert.equal((await call('POST', `/admin/api/kiddush/sponsorship/${r.json.id}/release`, {}, h)).status, 200);
  s = (await board()).slots.find((x) => x.key === slot.key);
  assert.equal(s.status, 'sponsored'); assert.equal(s.sponsors.length, 1); assert.equal(s.sponsor.name, 'Cohen');
  assert.equal((await call('POST', `/admin/api/kiddush/sponsorship/${made.json.id}/release`, {}, h)).status, 200);
  assert.equal((await board()).slots.find((x) => x.key === slot.key).status, 'open');
  assert.equal((await call('POST', '/admin/api/kiddush/sponsorship', { slot: slot.key }, h)).status, 400, 'a name is required');

  // hide a week (e.g. the Rabbi is away): gone from the public board and cannot be sponsored, still visible to the Rabbi
  const other = await firstOpen();
  assert.equal((await call('PUT', '/admin/api/kiddush/slot', { key: other.key, hidden: true, price: '250', title: 'Special Shabbos' }, h)).status, 200);
  assert.ok(!(await board()).slots.some((x) => x.key === other.key));
  assert.equal((await call('POST', '/api/kiddush/sponsor', form(other))).status, 404);
  const mine = (await call('GET', '/admin/api/kiddush/board', undefined, h)).json.slots.find((x) => x.key === other.key);
  assert.equal(mine.hidden, true); assert.equal(mine.priceCents, 25000); assert.equal(mine.title, 'Special Shabbos');
  await call('PUT', '/admin/api/kiddush/slot', { key: other.key, hidden: false, price: '250', title: '' }, h);
  const shown = (await board()).slots.find((x) => x.key === other.key);
  assert.equal(shown.priceCents, 25000); assert.notEqual(shown.title, 'Special Shabbos');
  assert.equal((await call('POST', '/api/kiddush/sponsor', form(other, { amount: 100 }))).json.code, 'amount_too_low', 'the new price applies');
});

test('admin: custom events (e.g. a community Chanukah party) appear on the board and can be sponsored; settings are validated', async () => {
  const adm = await adminLogin(); const h = { headers: adm };
  assert.equal((await call('POST', '/admin/api/kiddush/events', { date: 'x', title: 'A' }, h)).status, 400);
  assert.equal((await call('POST', '/admin/api/kiddush/events', { date: '2026-12-08', title: '' }, h)).status, 400);
  const e = await call('POST', '/admin/api/kiddush/events', { date: '2026-12-08', title: 'Chanukah Celebration', titleHe: 'חנוכה' }, h); assert.equal(e.status, 200, e.text);
  const s = (await board()).slots.find((x) => x.key === e.json.key);
  assert.equal(s.title, 'Chanukah Celebration'); assert.equal(s.kind, 'custom'); assert.equal(s.heb, '28 Kislev'); assert.equal(s.priceCents, 72000, 'holiday / event price');
  assert.equal((await call('POST', '/api/kiddush/sponsor', form(s))).status, 200);
  assert.equal((await call('DELETE', '/admin/api/kiddush/events/' + e.json.key.split('|c_')[1], undefined, h)).status, 409, 'cannot delete an event that has a sponsor');
  const e2 = await call('POST', '/admin/api/kiddush/events', { date: '2026-12-09', title: 'Other' }, h);
  assert.equal((await call('DELETE', '/admin/api/kiddush/events/' + e2.json.id, undefined, h)).status, 200);
  assert.ok(!(await board()).slots.some((x) => x.key === e2.json.key));

  assert.equal((await call('PUT', '/admin/api/kiddush/settings', { priceShabbat: 0 }, h)).status, 400);
  assert.equal((await call('PUT', '/admin/api/kiddush/settings', { publicUrl: 'javascript:alert(1)' }, h)).status, 400);
  const ok = await call('PUT', '/admin/api/kiddush/settings', { priceShabbat: 360, includePurim: false, publicUrl: 'https://kiddush.chabadoflamorinda.com/', unknownKey: 'x', cardOn: false }, h);
  assert.equal(ok.status, 200); assert.equal(ok.json.settings.publicUrl, 'https://kiddush.chabadoflamorinda.com'); assert.ok(!('unknownKey' in ok.json.settings));
  const b = await board();
  assert.ok(!b.slots.some((x) => x.kind === 'purim')); assert.equal(b.slots.find((x) => x.kind === 'shabbat').priceCents, 36000); assert.equal(b.settings.ways.card, false);
  assert.equal((await call('POST', '/api/kiddush/sponsor', form(await firstOpen(), { method: 'card' }))).json.code, 'method_off');
});

test('admin: CSV export lists every sponsorship and neutralises spreadsheet formulas', async () => {
  const adm = await adminLogin(); const h = { headers: adm };
  await call('POST', '/api/kiddush/sponsor', form(await firstOpen(), { name: '=HYPERLINK("http://evil")', dedication: '+1 evil' }));
  const r = await call('GET', '/admin/api/kiddush/export.csv', undefined, h);
  assert.equal(r.status, 200); assert.match(r.headers.get('content-type'), /text\/csv/);
  const lines = r.text.trim().split('\r\n'); assert.equal(lines.length, 2); assert.match(lines[0], /^"Date","Week","Status","Sponsor"/);
  assert.ok(lines[1].includes('"\'=HYPERLINK(""http://evil"")"')); assert.ok(lines[1].includes('levy@example.com'));
});

test('pages: TV display, sponsor page and admin page are served', async () => {
  for (const [p, re] of [['/kiddush/', /Sponsor a Kiddush/i], ['/kiddush/tv/', /Kiddush Sponsors/i], ['/admin/kiddush/', /Kiddush/i]]) {
    const r = await fetch(base + p); assert.equal(r.status, 200, p); assert.match(await r.text(), re, p);
  }
  assert.equal((await fetch(base + '/kiddush/fonts/cinzel-latin-600-normal.woff2')).status, 200);
  assert.equal((await fetch(base + '/kiddush/tv.js')).status, 200);
});

test('molad: the Shabbat that blesses the new month carries the month and its molad', async () => {
  const slots = await cal.buildYear(5787);
  const by = new Map(slots.map((s) => [s.key, s]));
  const k = by.get('2026-11-07|shabbat');
  assert.equal(k.mevarchim, 'Kislev'); assert.match(k.molad, /^Monday, 10:27 PM and 3 chalakim$/);
  assert.equal(by.get('2027-01-02|shabbat').mevarchim, 'Shevat');
  assert.equal(by.get('2026-11-14|shabbat').mevarchim, undefined);
  assert.ok(!slots.some((s) => s.mevarchim === 'Tishrei'), 'no blessing before Tishrei');
  assert.equal(slots.filter((s) => s.mevarchim).length, 12); // Cheshvan..Elul, 5787 being a leap year with both Adars
  const b = (await call('GET', '/api/kiddush/board')).json;
  assert.equal(b.slots.find((x) => x.key === '2026-11-07|shabbat').molad, 'Monday, 10:27 PM and 3 chalakim');
  assert.equal(b.settings.standardNote, 'Standard Kiddush for 25 people');
  assert.equal(b.slots.find((x) => x.kind === 'shabbat').priceCents, 50000);
  assert.equal(b.slots.find((x) => x.key === '2027-03-23|purim').priceCents, 72000);
});

test('board sponsorship: a $5,000 year-long offer that is always open, off the tiles, shown as boardSponsor', async () => {
  const b = await board();
  assert.ok(!b.slots.some((s) => s.kind === 'board'), 'not a tile');
  assert.equal(b.boardSponsor.title, 'Kiddush Board Sponsor – 5787'); assert.equal(b.boardSponsor.priceCents, 500000);
  assert.equal(b.boardSponsor.status, 'open'); assert.equal(b.boardSponsor.past, false); assert.notEqual(b.current, b.boardSponsor.key);
  assert.equal((await call('POST', '/api/kiddush/sponsor', form(b.boardSponsor, { amount: 1000 }))).json.code, 'amount_too_low');
  const r = await call('POST', '/api/kiddush/sponsor', form(b.boardSponsor, { dedicationKind: 'memory', dedication: 'Avraham ben Yitzchak' }));
  assert.equal(r.status, 200, r.text); assert.equal(r.json.slot.kind, 'board'); assert.equal(r.json.instructions.amount, '5000'); assert.equal(r.json.instructions.memo, 'Kiddush Board Sponsor – 5787');
  const after = await board();
  assert.equal(after.boardSponsor.status, 'open'); assert.equal(after.boardSponsor.sponsors.length, 0, 'hidden until confirmed');
  await confirmPaid(r.json.id);
  const taken = (await board()).boardSponsor;
  assert.equal(taken.status, 'sponsored'); assert.equal(taken.sponsor.name, 'The Levy Family'); assert.equal(taken.sponsor.dedication, 'In loving memory of Avraham ben Yitzchak');
  const co = await call('POST', '/api/kiddush/sponsor', form(b.boardSponsor, { name: 'Co Donor', email: 'co@example.com' }));
  assert.equal(co.status, 200, 'co-donors welcome'); await confirmPaid(co.json.id);
  assert.equal((await board()).boardSponsor.sponsors.length, 2);
  assert.ok(!JSON.stringify(after).includes('levy@example.com'));
  const adm = await adminLogin();
  assert.equal((await call('PUT', '/admin/api/kiddush/settings', { priceBoard: 6000 }, { headers: adm })).status, 200);
  const ab = (await call('GET', '/admin/api/kiddush/board', undefined, { headers: adm })).json;
  assert.equal(ab.slots[0].kind, 'board'); assert.equal(ab.slots[0].sponsorship.status, 'paid'); assert.equal(ab.slots[0].priceCents, 600000);
  const staff = await fetch(baseNoDb + '/admin/kiddush/'); // no database/password: a helpful page, not a bare 404
  assert.equal(staff.status, 404); assert.match(await staff.text(), /DATABASE_URL/);
});

test('legacy import: the sponsors from the original board load once, with names, dedications and paid status', async () => {
  const { importLegacy } = require('./kiddush-legacy.js');
  assert.equal(await importLegacy(store, { error() {} }), 10);
  assert.equal(await importLegacy(store, { error() {} }), 0, 'only once');
  const b = await board('?year=5787');
  const at = (k) => b.slots.find((x) => x.key === k);
  assert.deepEqual(at('2026-09-12|rh1').sponsors.map((x) => x.name), ['Bar & Meghan Levy', 'Anonymous']);
  assert.equal(at('2026-09-12|rh1').status, 'sponsored');
  assert.deepEqual(at('2026-09-13|rh2').sponsors.map((x) => x.name), ['Yossi Harrush'], 'the unpaid Zelle pledge stays off the board until confirmed');
  assert.equal(at('2026-10-10|shabbat').sponsors[0].dedication, 'In loving memory of His father Chaim Ben Aziz');
  assert.equal(at('2026-10-17|shabbat').sponsors[0].name, 'Yosef Chaim Harrush');
  assert.equal(at('2026-09-19|shabbat').sponsors[0].name, 'איזי לייטנר');
  assert.ok(!JSON.stringify(b.slots).includes('@'), 'no contact details on the weeks');
  const adm = await adminLogin();
  const row = (await call('GET', '/admin/api/kiddush/board', undefined, { headers: adm })).json.slots.find((x) => x.key === '2026-09-13|rh2');
  assert.deepEqual(row.sponsorships.map((x) => x.status), ['paid', 'pending']); assert.equal(row.sponsorships[0].amountCents, 72000); assert.ok(row.sponsorships[1].dedication.startsWith('Their grandfather'));
});

test('unconfirmed payments: the pending list, "Send reminder", and the confirmation email', async () => {
  const adm = await adminLogin(); const h = { headers: adm };
  const slot = await firstOpen(); const r = await call('POST', '/api/kiddush/sponsor', form(slot, { method: 'zelle' }));
  const pend = (await call('GET', '/admin/api/kiddush/pending', undefined, h)).json.pending;
  assert.equal(pend.length, 1); assert.equal(pend[0].reminderCount, 0); assert.equal(pend[0].method, 'zelle');
  // Send reminder: emailed (email is set up here), recorded, and still not on the board
  const rem = (await call('POST', `/admin/api/kiddush/sponsorship/${r.json.id}/remind`, {}, h)).json;
  assert.equal(rem.sent, true); assert.equal(rem.to, 'levy@example.com'); assert.match(rem.subject, /Reminder/); assert.match(rem.body, /\$500/); assert.match(rem.body, /chabadlamorinda@gmail\.com/); assert.match(rem.body, /appear on the Kiddush board as soon as we confirm/);
  assert.equal(mailed.length, 1); assert.equal(mailed[0].to, 'levy@example.com');
  const after = (await call('GET', '/admin/api/kiddush/pending', undefined, h)).json.pending[0];
  assert.equal(after.reminderCount, 1); assert.ok(after.remindedAt);
  assert.equal((await board()).slots.find((x) => x.key === slot.key).status, 'open');
  // card pledges cannot be reminded; confirming sends a thank-you email and puts the name on the board
  const c = await call('POST', '/api/kiddush/sponsor', form(await firstOpen(), { method: 'card', email: 'card@example.com' }));
  assert.equal((await call('POST', `/admin/api/kiddush/sponsorship/${c.json.id}/remind`, {}, h)).status, 400);
  mailed.length = 0;
  const done = await confirmPaid(r.json.id);
  assert.equal(done.emailed, true); assert.match(mailed[0].subject, /confirmed/); assert.match(mailed[0].text, /now appears on our Kiddush board/);
  assert.equal((await board()).slots.find((x) => x.key === slot.key).sponsor.name, 'The Levy Family');
});

test('automatic reminders: unpaid Zelle/Venmo/check/cash pledges are emailed after 3 days, then every 3 days, at most 3 times; never cards or paid', async () => {
  const kd = dbApp.locals.kiddush;
  const a = await call('POST', '/api/kiddush/sponsor', form(await firstOpen(), { method: 'check' }));
  const paid = await call('POST', '/api/kiddush/sponsor', form(await firstOpen(), { method: 'venmo', email: 'paid@example.com' })); await confirmPaid(paid.json.id);
  const card = await call('POST', '/api/kiddush/sponsor', form(await firstOpen(), { method: 'card', email: 'card@example.com' }));
  const age = (id, days) => store.pool.query("UPDATE kiddush_sponsorships SET created_at = now() - ($2 || ' days')::interval, reminded_at = NULL WHERE id=$1", [id, String(days)]);
  mailed.length = 0;
  assert.equal(await kd.runReminders(), 0, 'nothing is due on day 0');
  await age(a.json.id, 2); assert.equal(await kd.runReminders(), 0, 'not yet at 2 days');
  await age(a.json.id, 3); await age(paid.json.id, 9); await store.pool.query("UPDATE kiddush_sponsorships SET created_at = now() - interval '5 days' WHERE id=$1", [card.json.id]);
  assert.equal(await kd.runReminders(), 1); assert.equal(mailed.length, 1); assert.equal(mailed[0].to, 'levy@example.com'); assert.match(mailed[0].subject, /Reminder/);
  assert.equal(await kd.runReminders(), 0, 'not again right away');
  for (const n of [2, 3]) { await store.pool.query("UPDATE kiddush_sponsorships SET reminded_at = now() - interval '4 days' WHERE id=$1", [a.json.id]); assert.equal(await kd.runReminders(), 1, 'reminder ' + n); }
  await store.pool.query("UPDATE kiddush_sponsorships SET reminded_at = now() - interval '4 days' WHERE id=$1", [a.json.id]);
  assert.equal(await kd.runReminders(), 0, 'stops after 3 reminders');
  // switched off in Settings
  await store.pool.query("UPDATE kiddush_sponsorships SET reminder_count = 0, reminded_at = NULL WHERE id=$1", [a.json.id]);
  const adm = await adminLogin(); await call('PUT', '/admin/api/kiddush/settings', { autoReminders: false }, { headers: adm });
  assert.equal(await kd.runReminders(), 0, 'turned off');
  assert.equal((await call('PUT', '/admin/api/kiddush/settings', { reminderDays: 0 }, { headers: adm })).status, 400);
});

test('retroactive sponsorship: a past week that had no sponsor can still be sponsored (and shows once confirmed)', async () => {
  const b = await board(); const past = b.slots.find((x) => x.past && x.status === 'open' && x.kind === 'shabbat');
  assert.ok(past, 'there is an earlier, unsponsored Shabbat this year');
  const r = await call('POST', '/api/kiddush/sponsor', form(past, { method: 'check', dedicationKind: 'memory', dedication: 'a loved one' }));
  assert.equal(r.status, 200, r.text);
  assert.equal((await board()).slots.find((x) => x.key === past.key).status, 'open');
  await confirmPaid(r.json.id);
  const now = (await board()).slots.find((x) => x.key === past.key);
  assert.equal(now.status, 'sponsored'); assert.equal(now.sponsor.name, 'The Levy Family'); assert.equal(now.past, true);
});

test('hebrew: slots carry Hebrew titles/dates, public sponsors carry kind and reason, settings carry Hebrew text', async () => {
  const b = await board();
  assert.ok(b.slots.every((s) => s.titleHe && s.hebHe), 'every slot has a Hebrew title and date');
  assert.match(b.yearHe, /תשפ/);
  assert.ok(b.settings.blessingHe && b.settings.standardNoteHe);
  const s = await firstOpen();
  const r = await call('POST', '/api/kiddush/sponsor', form(s, { dedicationKind: 'memory', dedication: 'Sara Levy', lang: 'he' }));
  assert.equal(r.status, 200, r.text);
  assert.equal((await board()).slots.find((x) => x.key === s.key).status, 'open', 'hidden until confirmed');
  await confirmPaid(r.json.id);
  const sp = (await board()).slots.find((x) => x.key === s.key).sponsors[0];
  assert.equal(sp.kind, 'memory'); assert.equal(sp.reason, 'Sara Levy');
});

test('calendar notes: a yahrzeit shows with its week; reminders can be scheduled, cancelled, resumed', async () => {
  const H = { headers: await adminLogin() };
  const s = await firstOpen((x) => x.kind === 'shabbat');
  const day = new Date(Date.parse(s.date + 'T12:00:00Z') - 4 * 864e5).toISOString().slice(0, 10); // a Tuesday-ish day in that week
  assert.equal((await call('POST', '/admin/api/kiddush/notes', { date: 'nope', text: 'x' }, H)).status, 400);
  const add = await call('POST', '/admin/api/kiddush/notes', { date: day, kind: 'yahrzeit', text: 'Yahrzeit of Reb Moshe', textHe: 'יארצייט' }, H);
  assert.equal(add.status, 200, add.text);
  const slot = (await board()).slots.find((x) => x.key === s.key);
  assert.equal(slot.notes.length, 1); assert.equal(slot.notes[0].text, 'Yahrzeit of Reb Moshe'); assert.equal(slot.notes[0].date, day);
  assert.equal(slot.notes[0].id, undefined, 'ids are not public');
  assert.equal((await call('GET', '/admin/api/kiddush/notes', undefined, H)).json.notes.length, 1);
  const ed = await call('PUT', '/admin/api/kiddush/notes/' + add.json.id, { date: day, kind: 'event', text: 'Shiur with the Rabbi', textHe: '' }, H);
  assert.equal(ed.status, 200, ed.text);
  assert.equal((await board()).slots.find((x) => x.key === s.key).notes[0].text, 'Shiur with the Rabbi');
  assert.equal((await call('PUT', '/admin/api/kiddush/notes/kn_missing', { date: day, text: 'x' }, H)).status, 404);
  await call('DELETE', '/admin/api/kiddush/notes/' + add.json.id, undefined, H);
  assert.equal((await board()).slots.find((x) => x.key === s.key).notes.length, 0);

  const sp = await call('POST', '/api/kiddush/sponsor', form(s));
  const id = sp.json.id, P = (b) => call('PATCH', '/admin/api/kiddush/sponsorship/' + id, b, H);
  assert.equal((await P({ remindAt: 'garbage' })).status, 400);
  assert.equal((await P({ remindAt: new Date(Date.now() - 1000).toISOString() })).status, 200);
  assert.equal(await dbApp.locals.kiddush.runReminders(), 1, 'a scheduled reminder that is due is sent');
  assert.equal(await dbApp.locals.kiddush.runReminders(), 0, 'and only once');
  await P({ remindAt: new Date(Date.now() - 1000).toISOString() }); await P({ remindersOff: true });
  assert.equal(await dbApp.locals.kiddush.runReminders(), 0, 'cancelled reminders never go out');
  await P({ remindersOff: false });
  assert.equal(await dbApp.locals.kiddush.runReminders(), 0);
});
