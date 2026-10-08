'use strict';
process.env.TZ = 'America/Los_Angeles';
const test = require('node:test');
const assert = require('node:assert/strict');
const { openDb } = require('../server/db');
const { createSync } = require('../server/sync');
const { createApp } = require('../server/app');
const { loadDemo } = require('../server/demo');

async function start({ demo = true, extract } = {}) {
  const db = openDb();
  if (demo) loadDemo(db);
  const sync = createSync(db, { config: { clover: null, webOrders: null, webFtp: null, email: null, claude: !!extract } });
  const app = createApp({ db, sync, password: 'secret-pass', sessionSecret: 'x'.repeat(32), extract, log: { error() {} } });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = 'http://127.0.0.1:' + server.address().port;
  let cookie = '';
  const call = async (method, path, body, headers = {}) => {
    const r = await fetch(base + path, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), 'x-requested-with': 'app', ...headers }, body: body ? JSON.stringify(body) : undefined });
    const set = r.headers.get('set-cookie'); if (set) cookie = set.split(';')[0];
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch {}
    return { status: r.status, json, text };
  };
  return { db, call, close: () => server.close() };
}

test('login is required, wrong passwords are refused, and writes need the app header', async (t) => {
  const c = await start(); t.after(c.close);
  assert.equal((await c.call('GET', '/api/dashboard')).status, 401);
  assert.equal((await c.call('POST', '/api/login', { password: 'nope' })).status, 401);
  assert.equal((await c.call('POST', '/api/login', { password: 'secret-pass' })).status, 200);
  assert.equal((await c.call('GET', '/api/dashboard')).status, 200);
  assert.equal((await c.call('POST', '/api/suppliers', { name: 'X' }, { 'x-requested-with': '' })).status, 403);
  const page = await c.call('GET', '/');
  assert.match(page.text, /<div id="root">/);
});

test('main screens return data for the demo store', async (t) => {
  const c = await start(); t.after(c.close);
  await c.call('POST', '/api/login', { password: 'secret-pass' });
  const d = (await c.call('GET', '/api/dashboard')).json;
  assert.equal(d.totals.products, 24);
  assert.equal(d.invoicesToReview, 2);
  assert.ok(d.due.length > 0);
  assert.equal(d.salesByDay.length, 28);
  const p = (await c.call('GET', '/api/products?q=bamba')).json.products;
  assert.equal(p.length, 1);
  const one = (await c.call('GET', '/api/products/' + p[0].id)).json;
  assert.equal(one.sales.length, 56);
  const o = (await c.call('GET', '/api/orders')).json;
  assert.ok(o.lists.every((g) => g.lines.every((l) => l.qty > 0)));
  assert.equal(o.open.length, 1);
  assert.match((await c.call('GET', '/api/export/website.csv')).text, /^ID,SKU,BARCODE/);
  assert.equal((await c.call('GET', '/api/lookup?code=07290000066318')).json.product.name, 'Bamba Peanut Snack 1oz');
});

test('count, receive and adjust change stock; editing a price records history', async (t) => {
  const c = await start(); t.after(c.close);
  await c.call('POST', '/api/login', { password: 'secret-pass' });
  const id = c.db.get("SELECT id FROM products WHERE name = 'Halva Vanilla 8oz'").id;
  assert.equal((await c.call('POST', `/api/products/${id}/count`, { qty: 10 })).json.product.stock, 10);
  assert.equal((await c.call('POST', `/api/products/${id}/receive`, { qty: 12 })).json.product.stock, 22);
  assert.equal((await c.call('POST', `/api/products/${id}/adjust`, { qty: -2, note: 'Expired' })).json.product.stock, 20);
  assert.equal((await c.call('POST', `/api/products/${id}/count`, { qty: -1 })).status, 400);
  await c.call('PUT', '/api/products/' + id, { price: 4.99, target_margin: 35 });
  const p = c.db.get('SELECT * FROM products WHERE id = ?', id);
  assert.equal(p.price, 4.99); assert.equal(p.target_margin, 0.35);
  assert.ok(c.db.get("SELECT 1 FROM price_history WHERE product_id = ? AND field = 'price'", id));
});

test('placing an order puts items on the way; receiving it adds stock', async (t) => {
  const c = await start(); t.after(c.close);
  await c.call('POST', '/api/login', { password: 'secret-pass' });
  const g = (await c.call('GET', '/api/orders')).json.lists.find((x) => x.supplier.id);
  const before = Object.fromEntries(g.lines.map((l) => [l.product.id, l.product.stock]));
  const r = await c.call('POST', '/api/orders', { supplier_id: g.supplier.id, lines: g.lines.map((l) => ({ product_id: l.product.id, qty: l.qty })) });
  const after = (await c.call('GET', '/api/orders')).json;
  assert.ok(!after.lists.find((x) => x.supplier.id === g.supplier.id), 'no longer suggested');
  await c.call('POST', `/api/purchase-orders/${r.json.id}/receive`);
  for (const l of g.lines) assert.equal(c.db.get('SELECT stock FROM products WHERE id = ?', l.product.id).stock, before[l.product.id] + l.qty);
});

test('invoice review: pick a product for a line, apply, then approve the suggested price', async (t) => {
  const c = await start(); t.after(c.close);
  await c.call('POST', '/api/login', { password: 'secret-pass' });
  const invs = (await c.call('GET', '/api/invoices?status=review')).json.invoices;
  const kc = invs.find((i) => i.number === 'KC-48213');
  const d = (await c.call('GET', '/api/invoices/' + kc.id)).json;
  const schug = d.lines.find((l) => /SCHUG/.test(l.description));
  const pid = c.db.get("SELECT id FROM products WHERE name LIKE 'Schug%'").id;
  await c.call('PUT', `/api/invoices/${kc.id}/lines/${schug.id}`, { product_id: pid });
  const r = await c.call('POST', `/api/invoices/${kc.id}/apply`, { receive: true });
  assert.equal(r.json.received, 4);
  const review = (await c.call('GET', '/api/prices')).json.review;
  const juice = review.find((x) => /Grape Juice/.test(x.product.name));
  assert.ok(juice && juice.suggested > juice.product.price);
  await c.call('POST', '/api/prices/' + juice.product.id, { price: juice.suggested });
  assert.equal(c.db.get('SELECT price FROM products WHERE id = ?', juice.product.id).price, juice.suggested);
  assert.ok(!(await c.call('GET', '/api/prices')).json.review.find((x) => x.product.id === juice.product.id));
});

test('upload goes through the invoice reader', async (t) => {
  let got;
  const c = await start({ extract: async (x) => { got = x; return { kind: 'supplier_invoice', supplier_name: 'Kayco', invoice_number: 'UP-1', reference_number: '', invoice_date: '', subtotal: 1, shipping: 0, tax: 0, total: 1, lines: [] }; } });
  t.after(c.close);
  await c.call('POST', '/api/login', { password: 'secret-pass' });
  const r = await c.call('POST', '/api/invoices/upload', { files: [{ name: 'a.pdf', type: 'application/pdf', data: Buffer.from('%PDF-1').toString('base64') }] });
  assert.ok(r.json.id);
  assert.equal(got.pdfs.length, 1);
  assert.equal((await c.call('POST', '/api/invoices/upload', { files: [{ type: 'application/zip', data: 'AAAA' }] })).status, 400);
});

test('CSV import adds and updates products, creating suppliers by name', async (t) => {
  const c = await start({ demo: false }); t.after(c.close);
  await c.call('POST', '/api/login', { password: 'secret-pass' });
  const csv = 'Name,UPC,Supplier,Case Size,Cost,Price,Stock\nOlive Oil 1L,111,Kayco,12,"$6.50",11.99,8\nTuna Can,222,Kayco,24,1.10,2.49,30\n';
  assert.deepEqual((await c.call('POST', '/api/import/products', { csv })).json, { created: 2, updated: 0 });
  assert.deepEqual((await c.call('POST', '/api/import/products', { csv: 'upc,stock\n111,5\n' })).json, { created: 0, updated: 1 });
  assert.equal(c.db.get("SELECT stock FROM products WHERE upc = '111'").stock, 5);
  assert.equal(c.db.get("SELECT cost FROM products WHERE upc = '111'").cost, 6.5);
  assert.equal(c.db.get('SELECT COUNT(*) n FROM suppliers').n, 1);
});
