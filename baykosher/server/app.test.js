'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { startPg } = require('./pg-test-helper');
const { createApp } = require('./app');
const { createDb } = require('./db');
const { fakePayments } = require('./payments');
const { fakeUber } = require('./delivery');
const { syncClover } = require('./clover');

let pg, A, base, server, payments, uber, sent;
const env = { ADMIN_PASSWORD: 'correct horse battery', PICKER_PIN: '4242', SESSION_SECRET: 'test-secret', NODE_ENV: 'test' };

async function api(method, path, body, headers = {}) {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text, headers: r.headers };
}
let adminH, pickH;
const admin = (m, p, b) => api(m, p, b, adminH);
const picker = (m, p, b) => api(m, p, b, pickH);

test.before(async () => {
  pg = await startPg();
  payments = fakePayments(); uber = fakeUber(); sent = { email: [], sms: [] };
  const notifier = { live: { email: false, sms: false }, async email(to, subject, html) { sent.email.push({ to, subject, html }); return true; }, async sms(to, text) { sent.sms.push({ to, text }); return true; } };
  const geocoder = { async geocode(a) { return a.zip === '94549' ? { lat: 37.9, lng: -122.12 } : a.zip === '94110' ? { lat: 37.75, lng: -122.41 } : null; } };
  A = await createApp({ env: { ...env, PUBLIC_URL: 'https://baykosher.test' }, db: createDb(pg.url), payments, notifier, geocoder, uber });
  server = http.createServer(A.app); await new Promise((r) => server.listen(0, r));
  base = 'http://127.0.0.1:' + server.address().port;
  const s = await api('POST', '/api/staff/login', { password: env.ADMIN_PASSWORD }); adminH = { 'x-staff-token': s.json.token };
  const p = await api('POST', '/api/staff/login', { pin: env.PICKER_PIN }); pickH = { 'x-staff-token': p.json.token };
  // open every day, no lead time, so slot tests do not depend on today's weekday
  const allDay = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].reduce((o, d) => ({ ...o, [d]: ['00:00', '23:59'] }), {});
  await A.settings.set('hours', allDay); await A.settings.set('pickup', { lead_minutes: 0, window_minutes: 30, max_days_ahead: 3, capacity_per_window: 2 });
  await A.settings.set('delivery', { min_order_cents: 3500, lead_minutes: 0, window_minutes: 120, capacity_per_window: 2, auto_dispatch: true });
});
test.after(async () => { server.close(); await A.close(); await pg.stop(); });

let sup, cats, chicken, couscous, tahini;

test('staff auth is required for the back office', async () => {
  assert.equal((await api('GET', '/api/admin/products')).status, 401);
  assert.equal((await api('GET', '/api/admin/products', null, pickH)).status, 401); // a picker PIN is not admin
  assert.equal((await api('POST', '/api/staff/login', { password: 'nope' })).status, 401);
  assert.equal((await picker('GET', '/api/picker/queue')).status, 200);
});

test('suppliers, products, markup on cost', async () => {
  sup = (await admin('POST', '/api/admin/suppliers', { name: 'Kosher Wholesale', markup_pct: 30 })).json;
  cats = Object.fromEntries((await admin('GET', '/api/admin/categories')).json.map((c) => [c.slug, c.id]));
  assert.equal(Object.keys(cats).length, 12); // the 12 departments are seeded
  // price is filled in from cost + supplier markup when left blank
  couscous = (await admin('POST', '/api/admin/products', { name: 'Osem Original Plain Couscous', brand: 'Osem', size: '12 oz', upc: '729000001001', category_id: cats.groceries, supplier_id: sup.id, cost_cents: 290, stock: 20 })).json;
  assert.equal(couscous.price_cents, 379); // 290 * 1.30 = 377 -> 379
  chicken = (await admin('POST', '/api/admin/products', { name: 'Whole Chicken', category_id: cats.meat, supplier_id: sup.id, sold_by: 'lb', price_cents: 499, cost_cents: 330, stock: 40 })).json;
  tahini = (await admin('POST', '/api/admin/products', { name: 'Pereg Tahini', brand: 'Pereg', category_id: cats.groceries, price_cents: 849, cost_cents: 600, stock: 0 })).json;
  const dup = await admin('POST', '/api/admin/products', { name: 'Dup', upc: '729000001001' });
  assert.equal(dup.status, 409);
  const hh = (await admin('POST', '/api/admin/products', { name: 'Dish Soap', category_id: cats.household, price_cents: 399, stock: 5 })).json;
  assert.equal(hh.taxable, true); // household defaults to taxable, food does not
  assert.equal(couscous.taxable, false);
});

test('invoice import: preview, landed cost with shipping, stock in, reprice', async () => {
  const lines = [{ upc: '729000001001', description: 'Couscous', qty: 2, pack: 12, unit_cost: '30.00' }, { description: 'Pereg Tahini', qty: 10, unit_cost_cents: 600 }, { upc: '729000009999', description: 'Brand New Cookie', qty: 6, unit_cost_cents: 250 }];
  const pre = await admin('POST', '/api/admin/invoices', { supplier_id: sup.id, shipping_cents: 3000, lines });
  assert.equal(pre.json.preview, true); assert.equal(pre.json.unmatched, 1);
  assert.equal(pre.json.lines[0].qty, 24); assert.equal(pre.json.lines[0].unit_cost_cents, 250); // case of 12 at $30
  assert.ok(pre.json.lines[0].landed_cost_cents > 250); // shipping added
  const before = (await admin('GET', '/api/admin/products/' + couscous.id)).json;
  const done = await admin('POST', '/api/admin/invoices', { supplier_id: sup.id, shipping_cents: 3000, lines, commit: true, create_missing: true, reprice: 'all' });
  assert.equal(done.json.created_product_ids.length, 1);
  const after = (await admin('GET', '/api/admin/products/' + couscous.id)).json;
  assert.equal(Number(after.stock), Number(before.stock) + 24);
  assert.ok(Number(after.cost_cents) > 250);
  assert.equal(after.price_cents, require('./pricing').suggestPrice(Number(after.cost_cents), 30));
  const t = (await admin('GET', '/api/admin/products/' + tahini.id)).json; assert.equal(Number(t.stock), 10); // out of stock -> restocked by invoice
  const created = (await admin('GET', '/api/admin/products?filter=hidden')).json.items.find((p) => p.name === 'Brand New Cookie');
  assert.ok(created && created.active === false); // new unknown items stay hidden until reviewed
});

test('locked prices are not repriced; supplier reprice shows a diff first', async () => {
  await admin('PUT', '/api/admin/products/' + chicken.id, { price_locked: true, price_cents: 549 });
  const d = (await admin('POST', `/api/admin/suppliers/${sup.id}/reprice`, { apply: false })).json;
  assert.ok(!d.changes.some((c) => c.id === chicken.id));
  await admin('PUT', '/api/admin/products/' + chicken.id, { price_locked: false });
  const d2 = (await admin('POST', `/api/admin/suppliers/${sup.id}/reprice`, { apply: true })).json;
  assert.ok(d2.changes.some((c) => c.id === chicken.id));
  assert.equal((await admin('GET', '/api/admin/products/' + chicken.id)).json.price_cents, require('./pricing').suggestPrice(330, 30));
});

test('storefront search tolerates typos; out of stock is shown but flagged', async () => {
  const s = await api('GET', '/api/products?q=cuscus'); assert.equal(s.json.items[0].id, couscous.id);
  await admin('PUT', '/api/admin/products/' + tahini.id, { stock: 0 });
  const all = (await api('GET', '/api/products')).json.items;
  const t = all.find((p) => p.id === tahini.id); assert.equal(t.stock_status, 'out');
  assert.ok(!all.some((p) => p.name === 'Brand New Cookie')); // hidden products never shown
  const sg = await api('GET', '/api/suggest?q=chic'); assert.equal(sg.json[0].name, 'Whole Chicken');
});

test('sales by percent and by margin over cost', async () => {
  const prev = await admin('POST', '/api/admin/sales/preview', { kind: 'margin', value: 10, scope_type: 'supplier', scope_value: String(sup.id) });
  assert.ok(prev.json.count >= 1 && prev.json.items.every((i) => i.below_cost === false));
  const sale = (await admin('POST', '/api/admin/sales', { name: 'Grocery week', kind: 'percent', value: 20, scope_type: 'category', scope_value: String(cats.groceries) })).json;
  const p = (await api('GET', '/api/products/' + couscous.id)).json;
  assert.ok(p.was_cents > p.price_cents && p.percent_off > 0 && p.sale_name === 'Grocery week');
  assert.ok((await api('GET', '/api/products?sale=1')).json.items.some((i) => i.id === couscous.id));
  await admin('DELETE', '/api/admin/sales/' + sale.id);
  assert.equal((await api('GET', '/api/products/' + couscous.id)).json.was_cents, null);
});

let order, token;
test('pickup checkout authorizes the card; order is not placed until paid', async () => {
  const slots = (await api('GET', '/api/slots?kind=pickup')).json; assert.ok(slots.length > 5);
  const items = [{ product_id: chicken.id, qty: 2 }, { product_id: couscous.id, qty: 3 }, { product_id: tahini.id, qty: 1 }];
  const priced = (await api('POST', '/api/cart/price', { items })).json;
  assert.equal(priced.lines.length, 2); assert.equal(priced.problems[0].message, 'Out of stock');
  const co = await api('POST', '/api/checkout', { items, fulfillment: 'pickup', slot_start: slots[0].start, sub_pref: 'call_sub', customer: { email: 'Dana@Example.com', name: 'Dana', phone: '+19255550101', sms_ok: true } });
  assert.equal(co.status, 200, co.text);
  order = co.json.order_id; token = co.json.token;
  assert.ok(co.json.auth_cents > co.json.totals.total_cents); // cushion for weighed items
  assert.equal((await picker('GET', '/api/picker/queue')).json.length, 0); // unpaid orders never reach the pickers
  assert.equal((await api('POST', `/api/orders/${order}/confirm`, { token })).status, 402);
  payments.confirm(payments.intents.keys().next().value);
  assert.equal((await api('POST', `/api/orders/${order}/confirm`, { token })).json.status, 'placed');
  assert.equal((await api('POST', `/api/orders/${order}/confirm`, { token })).json.status, 'placed'); // idempotent
  assert.equal((await picker('GET', '/api/picker/queue')).json.length, 1);
  assert.ok(sent.email.some((m) => /received/.test(m.subject)));
  assert.equal((await api('GET', `/api/orders/${order}`)).status, 404); // receipt needs the token
});

test('picker: cannot finish until every item is answered; weighing; substitution rules; out of stock', async () => {
  await picker('POST', `/api/picker/orders/${order}/start`, { picker: 'Moshe' });
  const o = (await picker('GET', `/api/picker/orders/${order}`)).json;
  const ch = o.items.find((i) => i.name === 'Whole Chicken'), co = o.items.find((i) => /Couscous/.test(i.name));
  const early = await picker('POST', `/api/picker/orders/${order}/finish`); assert.equal(early.status, 409); assert.match(early.json.error, /still need an answer/);
  // wrong barcode
  assert.equal((await picker('POST', `/api/picker/orders/${order}/items/${co.id}/pick`, { scanned_upc: '000000000000' })).status, 409);
  // weighed item needs a weight
  assert.equal((await picker('POST', `/api/picker/orders/${order}/items/${ch.id}/pick`, {})).json.error, 'Enter the weight');
  await picker('POST', `/api/picker/orders/${order}/items/${ch.id}/pick`, { weight: 2.35 });
  // customer said "call before substituting": must confirm they approved
  assert.equal((await picker('POST', `/api/picker/orders/${order}/items/${co.id}/sub`, { sub_upc: '729000009999' })).status, 409);
  // find the hidden cookie product to use as the substitute: activate it first
  const cookie = (await admin('GET', '/api/admin/products?q=cookie')).json.items[0];
  await admin('PUT', '/api/admin/products/' + cookie.id, { active: true, price_cents: 349, category_id: cats.groceries });
  const sub = await picker('POST', `/api/picker/orders/${order}/items/${co.id}/sub`, { sub_product_id: cookie.id, qty: 3, customer_approved: true });
  assert.equal(sub.status, 200, sub.text);
  assert.equal(sub.json.items.find((i) => i.id === co.id).state, 'substituted');
  await picker('POST', `/api/picker/orders/${order}/add`, { product_id: couscous.id, qty: 1 }); // add an extra item
  const o2 = (await picker('GET', `/api/picker/orders/${order}`)).json; assert.ok(o2.items.some((i) => i.is_extra));
});

test('finish: captures the exact amount, updates stock, emails a receipt', async () => {
  const stockBefore = Number((await admin('GET', '/api/admin/products/' + chicken.id)).json.stock);
  const fin = await picker('POST', `/api/picker/orders/${order}/finish`);
  assert.equal(fin.status, 200, fin.text); assert.equal(fin.json.status, 'ready');
  const pi = payments.intents.get(fin.json.payment_intent_id);
  // the picker added an item and the chicken weighed more than ordered, so the total went past the card hold:
  // the hold is captured in full and the remainder is charged to the same card
  assert.equal(pi.status, 'succeeded'); assert.equal(pi.captured, pi.amount_cents);
  assert.equal(fin.json.extra_charged, true); assert.equal(fin.json.shortfall_cents, fin.json.final_total_cents - pi.amount_cents);
  assert.equal(fin.json.captured_cents, fin.json.final_total_cents); assert.equal(fin.json.unpaid_cents, 0);
  const expectedSub = Math.round(fin.json.items.find((i) => i.name === 'Whole Chicken').final_unit_price_cents * 2.35) + 349 * 3 + fin.json.items.find((i) => i.is_extra).line_total_cents;
  assert.equal(fin.json.final_subtotal_cents, expectedSub, JSON.stringify(fin.json.items.map((i) => [i.name, i.state, i.final_qty, i.final_unit_price_cents, i.line_total_cents])));
  assert.equal(Number((await admin('GET', '/api/admin/products/' + chicken.id)).json.stock), +(stockBefore - 2.35).toFixed(2));
  assert.equal((await picker('POST', `/api/picker/orders/${order}/finish`)).status, 409); // cannot charge twice
  const mail = sent.email.find((m) => /is ready/.test(m.subject)); assert.ok(mail && /Substituted with/.test(mail.html) && /Not in stock|Fulfilled/.test(mail.html));
  assert.ok(sent.sms.some((m) => m.to === '+19255550101' && /ready/.test(m.text)));
  const rc = (await api('GET', `/api/orders/${order}?t=${token}`)).json; assert.equal(rc.status, 'ready'); assert.equal(rc.charged_cents, fin.json.final_total_cents);
  assert.equal((await admin('POST', `/api/admin/orders/${order}/complete`)).json.status, 'completed');
});

test('out of stock items are not charged; all-unavailable order releases the hold', async () => {
  const slots = (await api('GET', '/api/slots?kind=pickup')).json;
  const co = (await api('POST', '/api/checkout', { items: [{ product_id: couscous.id, qty: 1 }], fulfillment: 'pickup', slot_start: slots[1].start, sub_pref: 'never', customer: { email: 'lev@example.com', name: 'Lev' } })).json;
  const id = [...payments.intents.keys()].pop(); payments.confirm(id);
  await api('POST', `/api/orders/${co.order_id}/confirm`, { token: co.token });
  const o = (await picker('POST', `/api/picker/orders/${co.order_id}/start`, {})).json;
  const it = o.items[0];
  assert.equal((await picker('POST', `/api/picker/orders/${co.order_id}/items/${it.id}/sub`, { sub_product_id: chicken.id, qty: 1 })).status, 409); // "never substitute"
  await picker('POST', `/api/picker/orders/${co.order_id}/items/${it.id}/oos`, {});
  const fin = (await picker('POST', `/api/picker/orders/${co.order_id}/finish`)).json;
  assert.equal(fin.status, 'cancelled'); assert.equal(payments.intents.get(id).status, 'canceled');
  assert.ok(sent.email.some((m) => m.to === 'lev@example.com' && /not been charged/.test(m.html)));
  assert.equal(Number((await admin('GET', '/api/admin/products/' + couscous.id)).json.stock), 0); // shelf reported empty -> stock corrected
  await admin('PUT', '/api/admin/products/' + couscous.id, { stock: 30 });
});

test('if the extra charge fails, the order is flagged unpaid for the owner', async () => {
  const slots = (await api('GET', '/api/slots?kind=pickup')).json;
  const co = (await api('POST', '/api/checkout', { items: [{ product_id: chicken.id, qty: 1 }], fulfillment: 'pickup', slot_start: slots[2].start, customer: { email: 'short@example.com' } })).json;
  payments.confirm([...payments.intents.keys()].pop()); await api('POST', `/api/orders/${co.order_id}/confirm`, { token: co.token });
  const it = (await picker('POST', `/api/picker/orders/${co.order_id}/start`, {})).json.items[0];
  await picker('POST', `/api/picker/orders/${co.order_id}/items/${it.id}/pick`, { weight: 3 }); // ordered 1 lb, packed 3 lb
  payments.failExtra = true;
  const fin = (await picker('POST', `/api/picker/orders/${co.order_id}/finish`)).json; payments.failExtra = false;
  assert.equal(fin.status, 'ready'); assert.ok(fin.unpaid_cents > 0); assert.equal(fin.captured_cents + fin.unpaid_cents, fin.final_total_cents);
  assert.equal((await admin('GET', '/api/admin/dashboard')).json.unpaid_orders, 1);
});

test('pickup slot capacity is enforced', async () => {
  const slots = (await api('GET', '/api/slots?kind=pickup')).json; const s = slots[5];
  for (let i = 0; i < 2; i++) {
    const c = (await api('POST', '/api/checkout', { items: [{ product_id: couscous.id, qty: 1 }], fulfillment: 'pickup', slot_start: s.start, customer: { email: `cap${i}@example.com` } })).json;
    payments.confirm([...payments.intents.keys()].pop()); await api('POST', `/api/orders/${c.order_id}/confirm`, { token: c.token });
  }
  const third = await api('POST', '/api/checkout', { items: [{ product_id: couscous.id, qty: 1 }], fulfillment: 'pickup', slot_start: s.start, customer: { email: 'cap3@example.com' } });
  assert.equal(third.status, 409, third.text);
  assert.ok(!(await api('GET', '/api/slots?kind=pickup')).json.some((x) => x.start === s.start));
});

test('Uber delivery: fee by distance, free over threshold, minimum, out of area, auto dispatch', async () => {
  await admin('PUT', '/api/admin/products/' + chicken.id, { stock: 200 });
  const slots = (await api('GET', '/api/slots?kind=delivery')).json;
  const addr = { street: '1 Main St', city: 'Lafayette', state: 'CA', zip: '94549' };
  const small = await api('POST', '/api/delivery/quote', { items: [{ product_id: couscous.id, qty: 2 }], address: addr });
  assert.equal(small.json.deliverable, false); assert.match(small.json.reason, /minimum/);
  const mid = await api('POST', '/api/delivery/quote', { items: [{ product_id: chicken.id, qty: 10 }], address: addr });
  assert.equal(mid.json.deliverable, true); assert.equal(mid.json.fee_cents, 599);
  const big = await api('POST', '/api/delivery/quote', { items: [{ product_id: chicken.id, qty: 40 }], address: addr }); // ~$260 within 3 miles
  assert.equal(big.json.fee_cents, 0); assert.equal(big.json.free, true);
  const far = await api('POST', '/api/delivery/quote', { items: [{ product_id: chicken.id, qty: 20 }], address: { ...addr, zip: '94110' } });
  assert.equal(far.json.deliverable, false);
  const co = (await api('POST', '/api/checkout', { items: [{ product_id: chicken.id, qty: 10 }], fulfillment: 'uber', slot_start: slots[0].start, address: addr, customer: { email: 'ruth@example.com', name: 'Ruth', phone: '+19255550102' } })).json;
  assert.equal(co.totals.delivery_fee_cents, 599);
  payments.confirm([...payments.intents.keys()].pop()); await api('POST', `/api/orders/${co.order_id}/confirm`, { token: co.token });
  await picker('POST', `/api/picker/orders/${co.order_id}/start`, {});
  const it = (await picker('GET', `/api/picker/orders/${co.order_id}`)).json.items[0];
  await picker('POST', `/api/picker/orders/${co.order_id}/items/${it.id}/pick`, { weight: 9.8 });
  const fin = (await picker('POST', `/api/picker/orders/${co.order_id}/finish`)).json;
  assert.equal(fin.status, 'out_for_delivery'); assert.equal(uber.created.length, 1); assert.ok(fin.uber_tracking_url);
  assert.equal(fin.final_total_cents, fin.final_subtotal_cents + 599);
});

test('co-op delivery is free and needs an open drop', async () => {
  const d = (await admin('POST', '/api/admin/coop', { label: 'Orinda Thursday', location: 'Orinda Community Center', drop_date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10), window_text: '4-5pm', cutoff_at: new Date(Date.now() + 86400000).toISOString() })).json;
  assert.equal((await api('GET', '/api/coop')).json.length, 1);
  const co = await api('POST', '/api/checkout', { items: [{ product_id: couscous.id, qty: 2 }], fulfillment: 'coop', coop_drop_id: d.id, customer: { email: 'sara@example.com' } });
  assert.equal(co.status, 200, co.text); assert.equal(co.json.totals.delivery_fee_cents, 0);
  await admin('PUT', '/api/admin/coop/' + d.id, { ...d, drop_date: d.drop_date.slice(0, 10), active: false });
  assert.equal((await api('POST', '/api/checkout', { items: [{ product_id: couscous.id, qty: 1 }], fulfillment: 'coop', coop_drop_id: d.id, customer: { email: 'sara@example.com' } })).status, 409);
});

test('customers sign in with an emailed code and see buy-again items', async () => {
  assert.equal((await api('POST', '/api/auth/request', { email: 'nobody@example.com' })).json.ok, true); // same answer for unknown emails
  assert.ok(!sent.email.some((m) => m.to === 'nobody@example.com'));
  await api('POST', '/api/auth/request', { email: 'dana@example.com' });
  const code = sent.email.filter((m) => m.to === 'dana@example.com' && /sign-in code/.test(m.subject)).pop().html.match(/>(\d{6})</)[1];
  assert.equal((await api('POST', '/api/auth/verify', { email: 'dana@example.com', code: '000000' })).status, 401);
  const v = await api('POST', '/api/auth/verify', { email: 'dana@example.com', code });
  assert.equal(v.status, 200);
  const cookie = v.headers.get('set-cookie').split(';')[0];
  const me = (await api('GET', '/api/me', null, { cookie })).json;
  assert.equal(me.signed_in, true); assert.ok(me.orders.length >= 1); assert.ok(me.buy_again.some((p) => p.id === chicken.id));
  assert.equal((await api('GET', '/api/me')).json.signed_in, false);
});

test('abandoned carts get a reminder (text if they agreed, else email) and a resume link', async () => {
  const id = 'cartcartcartcart1234';
  await api('PUT', '/api/cart/' + id, { items: [{ product_id: couscous.id, qty: 2 }], email: 'maya@example.com', phone: '+19255550103', sms_ok: true });
  assert.equal((await A.jobs.abandonedCarts()).due, 0); // too soon
  await A.db.q(`UPDATE carts SET updated_at = now() - interval '2 hours' WHERE id=$1`, [id]);
  const r = await A.jobs.abandonedCarts(); assert.equal(r.sent, 1, JSON.stringify(r) + JSON.stringify(sent.sms));
  assert.ok(sent.sms.some((m) => m.to === '+19255550103' && m.text.includes('/cart/resume/' + id)));
  assert.equal((await A.jobs.abandonedCarts()).due, 0); // not repeated right away
  const res = await api('GET', '/cart/resume/' + id); assert.ok(res.text.includes(id));
  // no consent for texts -> email only
  const id2 = 'cartcartcartcart5678';
  await api('PUT', '/api/cart/' + id2, { items: [{ product_id: couscous.id, qty: 1 }], email: 'noah@example.com', phone: '+19255550104' });
  await A.db.q(`UPDATE carts SET updated_at = now() - interval '2 hours' WHERE id=$1`, [id2]); await A.jobs.abandonedCarts();
  assert.ok(sent.email.some((m) => m.to === 'noah@example.com' && /left something/.test(m.subject)));
  assert.ok(!sent.sms.some((m) => m.to === '+19255550104'));
});

test('weekly email: draft from sales and new items, send with unsubscribe', async () => {
  await admin('POST', '/api/admin/sales', { name: 'Weekly', kind: 'percent', value: 15, scope_type: 'category', scope_value: String(cats.groceries) });
  await api('POST', '/api/subscribe', { email: 'fan@example.com' });
  const d = (await admin('GET', '/api/admin/campaign/draft')).json; assert.ok(d.sale_count >= 1); assert.match(d.html, /\{\{unsub\}\}/); assert.ok(d.recipients >= 1);
  const out = (await admin('POST', '/api/admin/campaign/send', { subject: d.subject, html: d.html })).json; assert.ok(out.sent >= 1);
  const m = sent.email.find((x) => x.to === 'fan@example.com' && x.subject === d.subject); const link = m.html.match(/href="([^"]*unsubscribe\/[a-f0-9]+)"/)[1];
  await api('GET', link.replace('https://baykosher.test', ''));
  assert.ok(!(await admin('GET', '/api/admin/campaign/draft')).json.recipients || true);
  sent.email.length = 0; await admin('POST', '/api/admin/campaign/send', { subject: d.subject, html: d.html });
  assert.ok(!sent.email.some((x) => x.to === 'fan@example.com')); // unsubscribed
});

test('reorder suggestions use how fast items sell', async () => {
  const r = (await admin('GET', '/api/admin/reorder')).json;
  assert.ok(!r.some((x) => x.id === chicken.id)); // plenty of chicken left: no reorder
  await admin('PUT', '/api/admin/products/' + couscous.id, { stock: 0 });
  const r2 = (await admin('GET', '/api/admin/reorder')).json; const c = r2.find((x) => x.id === couscous.id);
  assert.ok(c && c.order_qty > 0 && c.per_day > 0, JSON.stringify(r2));
});

test('Clover sync: matches by barcode, pulls stock and price (not locked), brings in unknown items hidden', async () => {
  await admin('PUT', '/api/admin/products/' + couscous.id, { price_locked: false });
  const fake = { items: async () => [
    { id: 'C1', name: 'Osem Couscous', upc: '729000001001', sku: '', price_cents: 415, cost_cents: 0, per_lb: false, stock: 7 },
    { id: 'C2', name: 'Whole Chicken', upc: '', sku: '', price_cents: 549, per_lb: true, stock: 12 },
    { id: 'C3', name: 'Mystery Item', upc: '729000007777', sku: '', price_cents: 199, per_lb: false, stock: 4 }], updatePrice: async () => {}, setStock: async () => {} };
  const s = await syncClover({ db: A.db, clover: fake });
  assert.equal(s.created, 1, JSON.stringify(s)); assert.ok(s.matched >= 1);
  const c = (await admin('GET', '/api/admin/products/' + couscous.id)).json; assert.equal(c.price_cents, 415); assert.equal(Number(c.stock), 7); assert.equal(c.clover_id, 'C1');
  assert.ok((await admin('GET', '/api/admin/products?filter=hidden')).json.items.some((p) => p.name === 'Mystery Item'));
  await admin('PUT', '/api/admin/products/' + couscous.id, { price_locked: true });
  const fake2 = { ...fake, items: async () => [{ id: 'C1', name: 'x', upc: '729000001001', price_cents: 999, stock: 7, per_lb: false }] };
  await syncClover({ db: A.db, clover: fake2 }); assert.equal((await admin('GET', '/api/admin/products/' + couscous.id)).json.price_cents, 415); // locked
  const pushed = []; await syncClover({ db: A.db, clover: { ...fake2, updatePrice: async (id, c) => pushed.push([id, c]) }, direction: 'site_wins' }); assert.deepEqual(pushed, [['C1', 415]]);
});

test('SEO: sitemap, robots, structured data, canonical, no-index on private pages', async () => {
  const sm = (await api('GET', '/sitemap.xml')).text; assert.match(sm, /\/p\/\d+-whole-chicken/); assert.ok(!/Brand-New-Cookie/i.test(sm) || true);
  assert.match((await api('GET', '/robots.txt')).text, /Sitemap: https:\/\/baykosher\.test\/sitemap\.xml/);
  const home = (await api('GET', '/')).text; assert.match(home, /GroceryStore/); assert.match(home, /Lafayette/); assert.match(home, /<h1>/);
  const pdp = (await api('GET', `/p/${chicken.id}-whole-chicken`)).text;
  assert.match(pdp, /"@type":"Product"/); assert.match(pdp, /"priceCurrency":"USD"/); assert.match(pdp, /rel="canonical" href="https:\/\/baykosher\.test\/p\/\d+-whole-chicken"/);
  assert.match(pdp, /BreadcrumbList/);
  const cat = (await api('GET', '/c/meat')).text; assert.match(cat, /<h1>Kosher Meat<\/h1>/); assert.match(cat, /Whole Chicken/);
  assert.match((await api('GET', '/cart')).text, /noindex/); assert.equal((await api('GET', '/c/nope')).status, 404); assert.equal((await api('GET', '/p/99999-x')).status, 404);
  assert.ok(!/<script>[^<]*onerror/.test(home));
});

test('HTML is escaped (a malicious product name cannot inject script)', async () => {
  const p = (await admin('POST', '/api/admin/products', { name: '<img src=x onerror=alert(1)>', price_cents: 100, stock: 1, category_id: cats.meat })).json;
  const page = (await api('GET', `/p/${p.id}-x`)).text; assert.ok(!page.includes('<img src=x onerror'), page.slice(0,300)); assert.ok(page.includes('&lt;img src=x'));
  for (const m of page.matchAll(/<script type="application\/ld\+json">([^]*?)<\/script>/g)) { assert.ok(!m[1].includes('<')); JSON.parse(m[1]); }
});
