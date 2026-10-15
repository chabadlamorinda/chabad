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
let pg, store, stripe, server, base, serverNoDb, baseNoDb;

test.before(async () => {
  pg = await startPg(); store = createStore(pg.url); await store.migrate();
  stripe = fakeStripe();
  const mk = (extra) => createApp({ stripe, publishableKey: 'pk_test_x', sessionSecret: SECRET, log: { error() {} }, webhookSecret: WH, now: () => NOW, ...extra });
  server = await new Promise((r) => { const s = mk({ store, adminPassword: PW }).listen(0, () => r(s)); });
  base = 'http://127.0.0.1:' + server.address().port;
  serverNoDb = await new Promise((r) => { const s = mk({}).listen(0, () => r(s)); });
  baseNoDb = 'http://127.0.0.1:' + serverNoDb.address().port;
});
test.after(async () => { server.close(); serverNoDb.close(); await store.close(); await pg.stop(); });
test.beforeEach(async () => { await store.kiddushResetForTests(); stripe._st.calls.length = 0; });

const call = async (method, path, body, o = {}) => {
  const r = await fetch((o.base || base) + path, { method, headers: { 'content-type': 'application/json', ...(o.headers || {}) }, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch (e) { /* not json */ }
  return { status: r.status, json, text, headers: r.headers };
};
const adminLogin = async () => { const r = await call('POST', '/admin/api/login', { password: PW }); assert.equal(r.status, 200); return { cookie: r.headers.get('set-cookie').split(';')[0], 'x-admin': '1' }; };
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

test('board: only year 5787, current week is the next upcoming one', async () => {
  const b = await board();
  assert.equal(b.year, 5787); assert.equal(b.yearHe, 'תשפ״ז'); assert.deepEqual(b.years, [5787]);
  assert.ok(b.slots.every((s) => s.year === 5787) && b.slots[0].key === '2026-09-12|rh1' && b.slots.at(-1).date < '2027-10-01');
  assert.equal(b.today, '2026-10-15');
  assert.equal(b.current, '2026-10-17|shabbat');
  const cur = b.slots.find((s) => s.key === b.current);
  assert.equal(cur.title, 'Noach'); assert.equal(cur.status, 'open'); assert.equal(cur.priceCents, 18000);
  assert.ok(b.slots.find((s) => s.key === '2026-10-10|shabbat').past);
  assert.equal(b.settings.ways.card, true); assert.equal(b.settings.ways.zelle, false, 'Zelle stays off until the address is entered');
  assert.equal((await board('?year=5788')).year, 5787, 'other years are not offered');
  const next = { key: '2027-09-25|shabbat', priceCents: 18000 }; // 5787's last Shabbat is sponsorable; 5788's first is not
  assert.equal((await call('POST', '/api/kiddush/sponsor', form({ key: '2027-10-09|shabbat', priceCents: 18000 }))).status, 404);
  assert.equal((await call('POST', '/api/kiddush/sponsor', form(next))).status, 200);
});

test('board without a database: shows the calendar, all open, and sponsoring is off', async () => {
  const b = (await call('GET', '/api/kiddush/board', undefined, { base: baseNoDb })).json;
  assert.equal(b.sponsoring, false); assert.ok(b.slots.length > 50); assert.ok(b.slots.every((s) => s.status === 'open'));
  const r = await call('POST', '/api/kiddush/sponsor', form({ key: b.current, priceCents: 18000 }), { base: baseNoDb });
  assert.equal(r.status, 503); assert.equal(r.json.code, 'not_configured');
});

// ---------------------------------------------------------------- sponsoring: check / Zelle / Venmo

test('sponsor by check: reserves the week, shows instructions, hides private details, blocks double booking', async () => {
  const slot = await firstOpen();
  const r = await call('POST', '/api/kiddush/sponsor', form(slot));
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.status, 'pending'); assert.equal(r.json.instructions.payable, 'Chabad of Lamorinda'); assert.match(r.json.instructions.address, /Golden Gate/);
  assert.equal(r.json.instructions.amount, '180'); assert.match(r.json.instructions.memo, /Kiddush /);
  const b = await board(); const s = b.slots.find((x) => x.key === slot.key);
  assert.equal(s.status, 'reserved'); assert.equal(s.sponsor.name, 'The Levy Family'); assert.equal(s.sponsor.dedication, 'In honor of Sara’s birthday');
  const raw = JSON.stringify(b);
  for (const secret of ['Levy@Example.com', 'levy@example.com', '925-555-0101', 'Please call me']) assert.ok(!raw.includes(secret), 'leaked ' + secret);
  const again = await call('POST', '/api/kiddush/sponsor', form(slot, { name: 'Someone Else' }));
  assert.equal(again.status, 409); assert.equal(again.json.code, 'taken');
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
  await bad({ method: 'zelle' }, 'method_off'); // no Zelle address set yet
  assert.equal((await call('POST', '/api/kiddush/sponsor', form({ key: '2026-10-21|shabbat', priceCents: 18000 }))).status, 404);
  assert.equal((await call('POST', '/api/kiddush/sponsor', form({ key: '2026-10-10|shabbat', priceCents: 18000 }))).json.code, 'past');
  assert.equal((await call('POST', '/api/kiddush/sponsor', form({ key: 'garbage', priceCents: 18000 }))).status, 404);

  const adm = await adminLogin();
  assert.equal((await call('PUT', '/admin/api/kiddush/settings', { zelleId: 'rabbi@chabadoflamorinda.com', venmoHandle: '@Chabad-Lamorinda' }, { headers: adm })).status, 200);
  const z = await call('POST', '/api/kiddush/sponsor', form(slot, { method: 'zelle', anonymous: true, amount: 250 }));
  assert.equal(z.status, 200, z.text); assert.equal(z.json.instructions.zelleId, 'rabbi@chabadoflamorinda.com'); assert.equal(z.json.instructions.amount, '250'); assert.equal(z.json.display.name, 'Anonymous');
  assert.equal((await board()).slots.find((x) => x.key === slot.key).sponsor.name, 'Anonymous');
  const slot2 = await firstOpen();
  const v = await call('POST', '/api/kiddush/sponsor', form(slot2, { method: 'venmo' }));
  assert.equal(v.json.instructions.venmoHandle, 'Chabad-Lamorinda'); assert.match(v.json.instructions.link, /^https:\/\/venmo\.com\/Chabad-Lamorinda\?txn=pay&amount=180&note=Kiddush/);
});

test('sponsor: at most four unpaid reservations per email', async () => {
  for (let i = 0; i < 4; i++) assert.equal((await call('POST', '/api/kiddush/sponsor', form(await firstOpen()))).status, 200);
  const r = await call('POST', '/api/kiddush/sponsor', form(await firstOpen())); assert.equal(r.status, 429); assert.equal(r.json.code, 'too_many');
});

// ---------------------------------------------------------------- sponsoring: card (Stripe Checkout)

test('card: creates a Stripe Checkout session, holds the week, confirms after payment, never double-books', async () => {
  const slot = await firstOpen();
  const r = await call('POST', '/api/kiddush/sponsor', form(slot, { method: 'card', fee: true, amount: 200 }));
  assert.equal(r.status, 200, r.text); assert.match(r.json.url, /^https:\/\/checkout\.stripe\.com\//);
  const [, params, opts] = stripe._st.calls.find((c) => c[0] === 'checkout.sessions.create');
  assert.equal(params.mode, 'payment'); assert.equal(params.customer_email, 'levy@example.com');
  assert.equal(params.line_items[0].price_data.unit_amount, 20700, '$200 + 3.5% fee'); // 20000 + 700
  assert.equal(params.metadata.source, 'kiddush'); assert.equal(params.metadata.slot, slot.key);
  assert.match(params.success_url, /\/kiddush\/\?paid=ks_[0-9a-f]{24}&session_id=\{CHECKOUT_SESSION_ID\}$/); assert.match(params.cancel_url, /\/kiddush\/\?cancelled=ks_/);
  assert.ok(opts.idempotencyKey.startsWith('kiddush-ks_'));
  const id = r.json.id, sessionId = Object.keys(stripe._st.sessions).pop();
  assert.equal((await board()).slots.find((x) => x.key === slot.key).status, 'reserved');
  assert.equal((await call('POST', '/api/kiddush/sponsor', form(slot, { method: 'card' }))).status, 409, 'held while the donor is at checkout');

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
  assert.equal((await board()).slots.find((x) => x.key === b.key).status, 'reserved');

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
  const slot = await firstOpen(); await call('POST', '/api/kiddush/sponsor', form(slot, { amount: 200 }));
  const ab = (await call('GET', '/admin/api/kiddush/board', undefined, { headers: adm })).json;
  const s = ab.slots.find((x) => x.key === slot.key);
  assert.equal(s.sponsorship.email, 'levy@example.com'); assert.equal(s.sponsorship.note, 'Please call me'); assert.equal(s.sponsorship.status, 'pending'); assert.equal(s.sponsorship.amountCents, 20000);
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

  // the week is taken: a manual entry for the same week is refused until released
  const body = { slot: slot.key, name: 'Cohen', amount: 180, method: 'cash', status: 'paid' };
  assert.equal((await call('POST', '/admin/api/kiddush/sponsorship', body, h)).status, 409);
  assert.equal((await call('POST', `/admin/api/kiddush/sponsorship/${r.json.id}/release`, {}, h)).status, 200);
  assert.equal((await board()).slots.find((x) => x.key === slot.key).status, 'open');
  const made = await call('POST', '/admin/api/kiddush/sponsorship', { ...body, dedicationKind: 'refuah', dedication: 'Rivka bas Sarah' }, h); assert.equal(made.status, 200, made.text);
  s = (await board()).slots.find((x) => x.key === slot.key);
  assert.equal(s.status, 'sponsored'); assert.equal(s.sponsor.dedication, 'For the speedy recovery of Rivka bas Sarah');
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
  assert.equal(s.title, 'Chanukah Celebration'); assert.equal(s.kind, 'custom'); assert.equal(s.heb, '28 Kislev'); assert.equal(s.priceCents, 18000);
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
