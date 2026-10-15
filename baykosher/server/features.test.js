'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { startPg } = require('./pg-test-helper');
const { createApp } = require('./app');
const { createDb } = require('./db');
const { fakePayments } = require('./payments');
const { HE, DYNAMIC_KEYS } = require('./i18n');

let pg, A, base, server, payments, sent, adminH;
const env = { ADMIN_PASSWORD: 'correct horse battery', SESSION_SECRET: 'test-secret', NODE_ENV: 'test' };
async function api(method, p, body, headers = {}) {
  const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text, headers: r.headers };
}
const admin = (m, p, b) => api(m, p, b, adminH);
let staffH = {}; const as = (who) => (m, p, b) => api(m, p, b, staffH[who]);
let cats, sup;

test.before(async () => {
  pg = await startPg(); payments = fakePayments(); sent = { email: [], sms: [] };
  const notifier = { live: { email: false, sms: false }, async email(to, subject, html) { sent.email.push({ to, subject, html }); return true; }, async sms(to, text) { sent.sms.push({ to, text }); return true; } };
  A = await createApp({ env, db: createDb(pg.url), payments, notifier, geocoder: { async geocode() { return { lat: 37.9, lng: -122.12 }; } } });
  server = http.createServer(A.app); await new Promise((r) => server.listen(0, r)); base = 'http://127.0.0.1:' + server.address().port;
  adminH = { 'x-staff-token': (await api('POST', '/api/staff/login', { password: env.ADMIN_PASSWORD })).json.token };
  const allDay = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].reduce((o, d) => ({ ...o, [d]: ['00:00', '23:59'] }), {});
  await A.settings.set('hours', allDay); await A.settings.set('pickup', { lead_minutes: 0, window_minutes: 30, max_days_ahead: 3, capacity_per_window: 20 });
  cats = Object.fromEntries((await admin('GET', '/api/admin/categories')).json.map((c) => [c.slug, c.id]));
  sup = (await admin('POST', '/api/admin/suppliers', { name: 'Test Supplier', markup_pct: 30 })).json;
});
test.after(async () => { server.close(); await A.close(); await pg.stop(); });

async function placeAndPay(items, extra = {}) {
  const slots = (await api('GET', '/api/slots?kind=pickup')).json;
  const co = await api('POST', '/api/checkout', { items, fulfillment: 'pickup', slot_start: slots[extra.slot || 0].start, customer: { email: extra.email || 'a@example.com', name: extra.name || 'A', phone: '+19255550000' }, coupon: extra.coupon, sub_pref: extra.sub_pref }, extra.headers);
  if (co.status !== 200) return co;
  payments.confirm([...payments.intents.keys()].pop());
  await api('POST', `/api/orders/${co.json.order_id}/confirm`, { token: co.json.token });
  return co;
}

test('every string used in the code has a Hebrew translation (nothing ships untranslated)', () => {
  const files = ['server/pages.js', 'server/core.js', 'public/app.js', 'server/api.js', 'server/jobs.js', 'server/backoffice.js', 'server/app.js'];
  const re = /(?:\bt|\btr)\(\s*(?:\w+\s*,\s*)?(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g;
  const missing = new Set();
  for (const f of files) { const s = fs.readFileSync(path.join(__dirname, '..', f), 'utf8'); let m; while ((m = re.exec(s))) { if (m[1] === '`' && m[2].includes('${')) continue; const k = m[2].replace(/\\'/g, "'").replace(/\\"/g, '"'); if (!HE[k]) missing.add(k); } }
  for (const k of DYNAMIC_KEYS) if (!HE[k]) missing.add(k);
  assert.deepEqual([...missing], []);
  // placeholders must survive translation
  for (const [k, v] of Object.entries(HE)) assert.deepEqual((k.match(/\{\w+\}/g) || []).sort(), (v.match(/\{\w+\}/g) || []).sort(), k);
});

let chicken, challah, brisket;
test('Hebrew: names, right-to-left pages, hreflang, sitemap, remembered language', async () => {
  challah = (await admin('POST', '/api/admin/products', { name: 'Round Challah', name_he: 'חלה עגולה', description_he: 'חלה טרייה', category_id: cats['baked-goods'], price_cents: 699, cost_cents: 350, stock: 20, featured: true })).json;
  const en = await api('GET', '/'); assert.match(en.text, /<html lang="en" dir="ltr">/); assert.match(en.text, /Round Challah/); assert.ok(!en.text.includes('חלה עגולה'));
  const he = await api('GET', '/he'); assert.equal(he.status, 200); assert.match(he.text, /<html lang="he" dir="rtl">/); assert.match(he.text, /חלה עגולה/); assert.match(he.text, /מכולת כשרה/);
  assert.match(he.text, /hreflang="en" href="[^"]*\/"/); assert.match(he.text, /rel="canonical" href="[^"]*\/he"/); assert.match(he.text, /href="\/he\/c\/baked-goods"/); // links stay in Hebrew
  const cat = await api('GET', '/he/c/baked-goods'); assert.match(cat.text, /מאפים ולחם/); assert.match(cat.text, /חלה עגולה/);
  const pdp = await api('GET', `/he/p/${challah.id}-round-challah`); assert.match(pdp.text, /<h1>חלה עגולה<\/h1>/); assert.match(pdp.text, /חלה טרייה/); assert.match(pdp.text, /"inLanguage":"he"/);
  assert.equal((await api('GET', '/he/nope')).status, 404); assert.equal((await api('GET', '/he/p/99999-x')).status, 404);
  const sm = (await api('GET', '/sitemap.xml')).text; assert.match(sm, /\/he\/p\/\d+-round-challah/); assert.match(sm, /hreflang="he"/);
  const redir = await api('GET', '/sale', null, { cookie: 'bk_lang=he' }); assert.equal(redir.status, 302); assert.equal(redir.headers.get('location'), '/he/sale');
  assert.equal((await api('GET', '/sale', null, { cookie: 'bk_lang=en' })).status, 200);
  assert.equal((await api('GET', '/api/products', null, { cookie: 'bk_lang=he' })).status, 200); // API and files never redirect
});

test('Hebrew API: names, categories, errors, search by Hebrew word and English/Hebrew aliases', async () => {
  const he = { 'X-Lang': 'he' };
  const list = (await api('GET', '/api/products?category=baked-goods', null, he)).json.items; assert.equal(list[0].name, 'חלה עגולה');
  assert.equal((await api('GET', '/api/categories', null, he)).json.find((c) => c.slug === 'meat').name, 'בשר');
  assert.equal((await api('GET', '/api/products?q=' + encodeURIComponent('חלה'))).json.items[0].id, challah.id);
  assert.equal((await api('GET', '/api/products?q=challah', null, he)).json.items[0].id, challah.id);
  const bad = await api('POST', '/api/checkout', { items: [], fulfillment: 'pickup', customer: { email: 'x@example.com' } }, he); assert.equal(bad.status, 400); assert.match(bad.json.error, /העגלה ריקה/);
  assert.equal((await api('POST', '/api/checkout', { items: [], fulfillment: 'pickup', customer: { email: 'x@example.com' } })).json.error, 'Your cart is empty');
  const priced = (await api('POST', '/api/cart/price', { items: [{ product_id: challah.id, qty: 1 }] }, he)).json; assert.equal(priced.lines[0].name, 'חלה עגולה');
});

test('Hebrew customers get Hebrew emails, texts and receipts', async () => {
  const co = await placeAndPay([{ product_id: challah.id, qty: 2 }], { email: 'he@example.com', name: 'דנה', headers: { 'X-Lang': 'he' } });
  assert.equal(co.status, 200, co.text);
  const got = sent.email.find((m) => m.to === 'he@example.com' && /התקבלה/.test(m.subject)); assert.ok(got); assert.match(got.html, /dir="rtl"/); assert.match(got.html, /\/he\/order\//);
  const A2 = await as('x'); // pick it
  const o = (await admin('GET', `/api/admin/orders/${co.json.order_id}`)).json;
  await admin('POST', `/api/picker/orders/${o.id}/start`, {}); // admin may pick too
  await admin('POST', `/api/picker/orders/${o.id}/items/${o.items[0].id}/pick`, { qty: 2 });
  await admin('POST', `/api/picker/orders/${o.id}/finish`, { boxes: 2 });
  const ready = sent.email.find((m) => m.to === 'he@example.com' && /מוכנה/.test(m.subject)); assert.ok(ready); assert.match(ready.html, /נארז/); assert.match(ready.html, /חלה עגולה/);
  const rc = (await api('GET', `/api/orders/${o.id}?t=${co.json.token}`, null, { 'X-Lang': 'he' })).json; assert.equal(rc.lines[0].status, 'נארז'); assert.equal(rc.boxes, 2);
});

test('meat sold in packs of an average weight: ordered in packs, charged for the exact weight', async () => {
  brisket = (await admin('POST', '/api/admin/products', { name: 'Boneless Chicken Breast', category_id: cats.meat, sold_by: 'lb', est_weight_lb: 1.9, price_cents: 899, cost_cents: 600, stock: 10 })).json;
  const priced = (await api('POST', '/api/cart/price', { items: [{ product_id: brisket.id, qty: 2 }] })).json;
  assert.equal(priced.lines[0].line_cents, Math.round(899 * 1.9 * 2)); assert.equal(priced.lines[0].est_weight_lb, 1.9);
  assert.equal((await api('POST', '/api/cart/price', { items: [{ product_id: brisket.id, qty: 1.5 }] })).json.lines[0].qty, 1); // whole packs only
  const card = (await api('GET', '/c/meat')).text; assert.match(card, /\$17\.08/); assert.match(card, /\$8\.99\/lb/); assert.match(card, /about 1\.9 lb per pack/);
  const co = await placeAndPay([{ product_id: brisket.id, qty: 2 }], { email: 'pack@example.com' });
  const o = (await admin('GET', `/api/admin/orders/${co.json.order_id}`)).json; assert.equal(Number(o.items[0].est_weight_lb), 1.9);
  await admin('POST', `/api/picker/orders/${o.id}/start`, {});
  assert.equal((await admin('POST', `/api/picker/orders/${o.id}/items/${o.items[0].id}/pick`, {})).status, 400); // must weigh
  await admin('POST', `/api/picker/orders/${o.id}/items/${o.items[0].id}/pick`, { weight: 3.7 });
  const fin = (await admin('POST', `/api/picker/orders/${o.id}/finish`, { boxes: 1 })).json;
  assert.equal(fin.final_subtotal_cents, Math.round(899 * 3.7));
  assert.equal(Number((await admin('GET', '/api/admin/products/' + brisket.id)).json.stock), 8); // 2 packs out of stock, not 3.7
});

test('coupons: first-order %, fixed $, minimums, one-time order number, recalculated on what was packed', async () => {
  await admin('POST', '/api/admin/coupons', { code: 'first10', name: '10% first order', kind: 'percent', value: 10, order_number: 1 });
  await admin('POST', '/api/admin/coupons', { code: 'TENOFF', name: '$10 off', kind: 'amount', value: 10, min_subtotal: 50 });
  const items = [{ product_id: challah.id, qty: 10 }]; // $69.90
  assert.equal((await api('POST', '/api/coupon/check', { code: 'nope', items })).status, 400);
  assert.equal((await api('POST', '/api/coupon/check', { code: 'FIRST10', items, email: 'newbie@example.com' })).json.discount_cents, 699);
  assert.equal((await api('POST', '/api/coupon/check', { code: 'TENOFF', items: [{ product_id: challah.id, qty: 2 }] })).status, 400); // under the minimum
  const co = await placeAndPay(items, { email: 'newbie@example.com', coupon: 'first10' });
  assert.equal(co.status, 200, co.text); assert.equal(co.json.totals.discount_cents, 699);
  const o = (await admin('GET', `/api/admin/orders/${co.json.order_id}`)).json;
  await admin('POST', `/api/picker/orders/${o.id}/start`, {});
  await admin('POST', `/api/picker/orders/${o.id}/items/${o.items[0].id}/pick`, { qty: 5 }); // only 5 of 10 available
  const fin = (await admin('POST', `/api/picker/orders/${o.id}/finish`, {})).json;
  assert.equal(fin.final_subtotal_cents, 3495); assert.equal(fin.final_discount_cents, 350); assert.equal(fin.final_total_cents, 3145);
  assert.equal(payments.intents.get(fin.payment_intent_id).captured, 3145);
  // second order: "first order" coupon is no longer valid
  assert.equal((await placeAndPay(items, { email: 'newbie@example.com', coupon: 'FIRST10' })).status, 400);
  assert.equal((await placeAndPay(items, { email: 'newbie@example.com', coupon: 'TENOFF' })).json.totals.discount_cents, 1000);
  const list = (await admin('GET', '/api/admin/coupons')).json; assert.equal(list.find((c) => c.code === 'FIRST10').uses, 1);
});

test('staff: own PINs, roles, names on every action, hold and take over, activity log', async () => {
  const mk = async (name, role, pin) => (await admin('POST', '/api/admin/staff', { name, role, pin }));
  assert.equal((await mk('Manuel', 'shopper', '4821')).status, 200);
  assert.equal((await mk('Dup', 'shopper', '4821')).status, 409); // PINs are unique
  assert.equal((await mk('Bad', 'shopper', '12')).status, 400);
  await mk('Lynnel', 'data_entry', '7733'); await mk('Kate', 'cashier', '9090'); await mk('Ana', 'shopper', '5566');
  for (const [k, pin] of [['manuel', '4821'], ['lynnel', '7733'], ['kate', '9090'], ['ana', '5566']]) { const r = await api('POST', '/api/staff/login', { pin }); assert.equal(r.status, 200); staffH[k] = { 'x-staff-token': r.json.token }; }
  assert.equal((await api('POST', '/api/staff/login', { pin: '0000' })).status, 401);
  // roles
  assert.equal((await as('manuel')('GET', '/api/picker/queue')).status, 200); assert.equal((await as('manuel')('GET', '/api/admin/products')).status, 401);
  assert.equal((await as('lynnel')('GET', '/api/admin/products')).status, 200); assert.equal((await as('lynnel')('GET', '/api/admin/orders')).status, 403); assert.equal((await as('lynnel')('GET', '/api/admin/staff')).status, 403);
  assert.equal((await as('kate')('GET', '/api/admin/orders')).status, 200); assert.equal((await as('kate')('GET', '/api/admin/products')).status, 403); assert.equal((await as('kate')('POST', '/api/admin/staff', { name: 'x', role: 'shopper', pin: '1111' })).status, 403);
  // a named shopper packs; hold; another takes over
  const co = await placeAndPay([{ product_id: challah.id, qty: 2 }, { product_id: brisket.id, qty: 1 }], { email: 'staff@example.com' });
  const id = co.json.order_id; let o = (await as('manuel')('POST', `/api/picker/orders/${id}/start`, {})).json; assert.equal(o.picker, 'Manuel');
  await as('manuel')('POST', `/api/picker/orders/${id}/items/${o.items[0].id}/pick`, { qty: 2 });
  assert.equal((await as('manuel')('POST', `/api/picker/orders/${id}/hold`, {})).json.status, 'placed');
  assert.equal((await as('manuel')('POST', `/api/picker/orders/${id}/finish`, {})).status, 409);
  o = (await as('ana')('POST', `/api/picker/orders/${id}/start`, {})).json; assert.equal(o.picker, 'Ana'); assert.equal(o.items[0].state, 'picked'); // progress kept
  await as('ana')('POST', `/api/picker/orders/${id}/items/${o.items[1].id}/pick`, { weight: 2 });
  const fin = await as('ana')('POST', `/api/picker/orders/${id}/finish`, { boxes: 3 }); assert.equal(fin.json.boxes, 3);
  const ev = (await admin('GET', `/api/admin/orders/${id}`)).json.events.map((e) => `${e.actor}:${e.kind}`);
  assert.ok(ev.includes('Manuel:start') && ev.includes('Manuel:hold') && ev.includes('Ana:finish') && ev.includes('Ana:item:pick'), ev.join(','));
  assert.equal((await as('kate')('POST', `/api/admin/orders/${id}/complete`)).json.status, 'completed');
  assert.ok((await admin('GET', '/api/admin/activity')).json.some((a) => a.actor === 'Kate' && /complete/.test(a.action)));
  assert.ok(!(await admin('GET', '/api/admin/activity')).json.some((a) => /4821|7733/.test(a.detail))); // PINs are never logged
  await admin('PUT', '/api/admin/staff/' + (await admin('GET', '/api/admin/staff')).json.find((s) => s.name === 'Ana').id, { active: false });
  assert.equal((await api('POST', '/api/staff/login', { pin: '5566' })).status, 401);
});

test('order manager: filters, totals, CSV; items to pick totals; customers list; manual card actions', async () => {
  const a = await placeAndPay([{ product_id: challah.id, qty: 3 }], { email: 'f1@example.com', name: 'Filter One' });
  await placeAndPay([{ product_id: challah.id, qty: 4 }], { email: 'f2@example.com', name: 'Filter Two' });
  const r = (await admin('GET', '/api/admin/orders?period=upcoming&q=filter')).json; assert.equal(r.total, 2); assert.equal(r.counts.placed, 2); assert.ok(r.ordered_cents > 0);
  assert.equal((await admin('GET', '/api/admin/orders?period=upcoming&q=' + a.json.order_id)).json.total, 1);
  assert.equal((await admin('GET', '/api/admin/orders?period=yesterday&q=filter')).json.total, 0);
  const csv = await admin('GET', '/api/admin/orders?period=upcoming&q=filter&format=csv'); assert.match(csv.headers.get('content-type'), /csv/); assert.match(csv.text, /Filter One/);
  const it = (await admin('GET', '/api/admin/order-items?period=upcoming')).json; const row = it.rows.find((x) => x.product_id === challah.id); assert.equal(row.qty, 17); assert.equal(row.orders, 3); // 3 + 4 from this test, plus 10 left unpicked by the coupon test
  assert.match((await admin('GET', '/api/admin/order-items?period=upcoming&format=csv')).text, /Round Challah/);
  const cu = (await admin('GET', '/api/admin/customers?q=filter')).json; assert.equal(cu.total, 2); assert.equal(cu.items[0].orders, 1);
  assert.match((await admin('GET', '/api/admin/customers?format=csv')).text, /f1@example.com/);
  // release a hold by hand, and capture a partial amount on the other
  const id = a.json.order_id; assert.equal((await admin('POST', `/api/admin/orders/${id}/payment`, { action: 'release' })).status, 200);
  assert.equal((await admin('POST', `/api/admin/orders/${id}/payment`, { action: 'release' })).status, 409); // already released
  const b = await placeAndPay([{ product_id: challah.id, qty: 1 }], { email: 'f3@example.com' });
  assert.equal((await admin('POST', `/api/admin/orders/${b.json.order_id}/payment`, { action: 'capture', amount_cents: 99999 })).status, 400);
  assert.equal((await admin('POST', `/api/admin/orders/${b.json.order_id}/payment`, { action: 'capture', amount_cents: 500 })).status, 200);
  assert.equal((await admin('GET', `/api/admin/orders/${b.json.order_id}`)).json.captured_cents, 500);
  assert.equal((await admin('POST', `/api/admin/orders/${b.json.order_id}/resend`)).status, 200);
});

test('stock reports from packers; restock', async () => {
  const co = await placeAndPay([{ product_id: challah.id, qty: 1 }], { email: 'oos@example.com' });
  const id = co.json.order_id; const o = (await admin('POST', `/api/picker/orders/${id}/start`, {})).json;
  await admin('POST', `/api/picker/orders/${id}/items/${o.items[0].id}/oos`, {}); await admin('POST', `/api/picker/orders/${id}/finish`, {});
  const rep = (await admin('GET', '/api/admin/stock-reports')).json.find((r) => r.product_id === challah.id); assert.ok(rep);
  await admin('POST', `/api/admin/stock-reports/${rep.id}/resolve`, { stock: 12 });
  assert.equal(Number((await admin('GET', '/api/admin/products/' + challah.id)).json.stock), 12);
  assert.ok(!(await admin('GET', '/api/admin/stock-reports')).json.some((r) => r.id === rep.id));
});

test('product import from a spreadsheet: preview, update by barcode, department match, pack weights, errors', async () => {
  await admin('POST', '/api/admin/products', { name: 'Existing Item', upc: '729000555001', price_cents: 100, category_id: cats.groceries });
  const text = 'name\tupc\tprice\tcost\tdepartment\tsold by\test weight\tstock\tname_he\nChicken Cutlets\t729000555002\t10.99\t7\tMeat\tlb\t2.2\t5\tשניצל עוף\nExisting Item\t729000555001\t2.50\t\tGroceries\teach\t\t9\t\nBroken\t729000555003\tabc\t\tNowhere\t\t\t\t\n';
  const pre = (await admin('POST', '/api/admin/products/import', { text, supplier_id: sup.id })).json;
  assert.equal(pre.preview, true); assert.equal(pre.create, 1); assert.equal(pre.update, 1); assert.equal(pre.skip, 1); assert.match(pre.rows[2].errors.join(), /unknown department/);
  const done = (await admin('POST', '/api/admin/products/import', { text, supplier_id: sup.id, commit: true })).json; assert.equal(done.saved, 2);
  const p = (await admin('GET', '/api/admin/products?q=cutlets')).json.items[0]; assert.equal(p.price_cents, 1099); assert.equal(Number(p.est_weight_lb), 2.2); assert.equal(p.name_he, 'שניצל עוף'); assert.equal(p.sold_by, 'lb');
  const ex = (await admin('GET', '/api/admin/products?q=729000555001')).json.items[0]; assert.equal(ex.price_cents, 250); assert.equal(Number(ex.stock), 9);
  assert.equal((await admin('POST', '/api/admin/products/import', { text: 'price\n5' })).status, 400); // needs a name column
});

test('bulk edit, banners, featured products on the home page', async () => {
  const ps = (await admin('GET', '/api/admin/products?q=chicken')).json.items;
  await admin('POST', '/api/admin/products/bulk', { ids: ps.map((p) => p.id), set: { featured: true, active: true } });
  const before = ps[0].price_cents; await admin('POST', '/api/admin/products/bulk', { ids: [ps[0].id], price_percent: 10 });
  assert.ok((await admin('GET', '/api/admin/products/' + ps[0].id)).json.price_cents > before);
  await admin('POST', '/api/admin/banners', { image_url: 'https://img.example/banner.jpg', link: '/sale', alt: 'Big sale', alt_he: 'מבצע גדול' });
  assert.match((await api('GET', '/')).text, /banner\.jpg[^>]*alt="Big sale"|alt="Big sale"/); assert.match((await api('GET', '/he')).text, /מבצע גדול/);
  assert.equal((await api('POST', '/api/admin/banners', { link: 'x' }, adminH)).status, 400);
});

test('pickup point manifest shows who is going where', async () => {
  const d = (await admin('POST', '/api/admin/coop', { label: 'Chabad NP', location: '115 Monte Diablo Ave, San Mateo', drop_date: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10), window_text: '3-4 PM' })).json;
  const co = await api('POST', '/api/checkout', { items: [{ product_id: challah.id, qty: 1 }], fulfillment: 'coop', coop_drop_id: d.id, customer: { email: 'np@example.com', name: 'NP Person' } });
  payments.confirm([...payments.intents.keys()].pop()); await api('POST', `/api/orders/${co.json.order_id}/confirm`, { token: co.json.token });
  const m = (await admin('GET', `/api/admin/coop/${d.id}/manifest`)).json; assert.equal(m.orders.length, 1); assert.equal(m.orders[0].name, 'NP Person');
  assert.equal((await admin('GET', `/api/admin/orders?period=upcoming&coop=${d.id}`)).json.total, 1);
});
