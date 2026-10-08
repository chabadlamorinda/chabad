'use strict';
process.env.TZ = 'America/Los_Angeles';
const test = require('node:test');
const assert = require('node:assert/strict');
const { openDb } = require('../server/db');
const clover = require('../server/clover');
const cg = require('../server/cloudgrocer');
const { parseCsv } = require('../server/csv');
const { createSync } = require('../server/sync');
const { checkMailbox } = require('../server/email');

/** A pretend Clover account. */
function fakeClover({ items = [], orders = [] } = {}) {
  const calls = [];
  const stock = {};
  const fetchImpl = async (url, opts = {}) => {
    const u = new URL(url);
    calls.push([opts.method || 'GET', u.pathname + u.search, opts.body ? JSON.parse(opts.body) : null]);
    assert.equal(opts.headers.authorization, 'Bearer tok');
    const path = u.pathname.replace('/v3/merchants/M1', '');
    const offset = Number(u.searchParams.get('offset') || 0), limit = Number(u.searchParams.get('limit') || 100);
    const json = (b) => ({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b) });
    if (path === '/items') return json({ elements: items.slice(offset, offset + limit) });
    if (path === '/orders') {
      const since = Number(/modifiedTime>=(\d+)/.exec(u.searchParams.get('filter'))[1]);
      return json({ elements: orders.filter((o) => o.modifiedTime >= since).slice(offset, offset + limit) });
    }
    let m;
    if ((m = /^\/item_stocks\/(\w+)$/.exec(path))) { stock[m[1]] = JSON.parse(opts.body).quantity; return json({}); }
    if ((m = /^\/items\/(\w+)$/.exec(path))) return json({});
    return { ok: false, status: 404, json: async () => ({}), text: async () => 'nope' };
  };
  return { fetchImpl, calls, stock, client: clover.cloverClient({ merchantId: 'M1', token: 'tok', fetchImpl, pauseMs: 0 }) };
}

const now = Date.parse('2026-10-07T20:00:00Z');

test('clover: imports items with starting stock, counts only sales after go-live, handles refunds and weight, pushes stock', async () => {
  const db = openDb();
  const items = [
    { id: 'IA', name: 'Bamba', sku: 'B1', code: '7290000066318', price: 129, priceType: 'FIXED', itemStock: { quantity: 40 }, categories: { elements: [{ name: 'Snacks' }] } },
    { id: 'IB', name: 'Chicken (lb)', sku: 'N117', price: 649, priceType: 'PER_UNIT', itemStock: { quantity: 20.5 } },
  ];
  const f = fakeClover({ items });
  const r = await clover.importItems(db, f.client);
  assert.deepEqual(r, { created: 2, linked: 0, updated: 0 });
  const a = db.get("SELECT * FROM products WHERE clover_id = 'IA'"), b = db.get("SELECT * FROM products WHERE clover_id = 'IB'");
  assert.equal(a.stock, 40); assert.equal(a.price, 1.29); assert.equal(a.category, 'Snacks');
  assert.equal(b.sold_by_weight, 1); assert.equal(b.stock, 20.5);
  const golive = Date.parse(db.setting('golive_at'));

  f.calls.length = 0;
  const orders = [
    { id: 'O-old', paymentState: 'PAID', createdTime: golive - 86400000 * 3, modifiedTime: golive - 86400000 * 3, lineItems: { elements: [{ id: 'L0', item: { id: 'IA' } }] } },
    { id: 'O1', paymentState: 'PAID', createdTime: golive + 1000, modifiedTime: golive + 1000, lineItems: { elements: [{ id: 'L1', item: { id: 'IA' } }, { id: 'L2', item: { id: 'IA' } }, { id: 'L3', item: { id: 'IB' }, unitQty: 1500 }] } },
    { id: 'O2', paymentState: 'OPEN', createdTime: golive + 2000, modifiedTime: golive + 2000, lineItems: { elements: [{ id: 'L4', item: { id: 'IA' } }] } },
    { id: 'O3', paymentState: 'PARTIALLY_REFUNDED', createdTime: golive + 3000, modifiedTime: golive + 5000, lineItems: { elements: [{ id: 'L5', item: { id: 'IA' }, refunded: true }, { id: 'L6', item: { id: 'ZZ' } }] } },
  ];
  const f2 = fakeClover({ items, orders });
  const s = await clover.pullSales(db, f2.client, golive + 10000);
  assert.deepEqual(s, { sales: 5, returns: 1, unknown: 1 });
  assert.equal(db.get("SELECT stock FROM products WHERE clover_id = 'IA'").stock, 40 - 2 - 1 + 1, 'old sale is history only; refund puts it back');
  assert.equal(db.get("SELECT stock FROM products WHERE clover_id = 'IB'").stock, 19);
  assert.equal(db.get("SELECT COUNT(*) n FROM movements WHERE counted = 0").n, 1);
  // Reading the same orders again changes nothing.
  await clover.pullSales(db, f2.client, golive + 20000);
  assert.equal(db.get("SELECT stock FROM products WHERE clover_id = 'IA'").stock, 38);

  // Web sale lowers stock; push sends only changed counts.
  db.move({ product_id: a.id, qty: -3, kind: 'sale', source: 'web', ref: 'w1' });
  const p = await clover.pushStock(db, f2.client);
  assert.equal(p.pushed, 2);
  assert.equal(f2.stock.IA, 35); assert.equal(f2.stock.IB, 19);
  assert.equal((await clover.pushStock(db, f2.client)).pushed, 0);
});

test('clover: links to existing products by barcode instead of duplicating', async () => {
  const db = openDb();
  db.run("INSERT INTO products (name, upc, stock) VALUES ('Bamba (from spreadsheet)', '7290000066318', 0)");
  const f = fakeClover({ items: [{ id: 'IA', name: 'Bamba', code: '7290000066318', price: 129, itemStock: { quantity: 40 } }] });
  assert.deepEqual(await clover.importItems(db, f.client), { created: 0, linked: 1, updated: 0 });
  assert.equal(db.get('SELECT COUNT(*) n FROM products').n, 1);
});

test('website export matches the My Cloud Grocer format', () => {
  const db = openDb();
  const id = Number(db.run(`INSERT INTO products (name, sku, upc, category, subcategory, brand, price, size, unit, taxable, sold_by_weight, est_weight, est_weight_unit, additional_skus, created_at)
    VALUES ('Apple Pink Lady', '4130', '', 'Fruit', 'Apples', '', 2.19, '', 'Lb', 0, 1, 0.47, 'each', '', '2020-04-19 10:00:00')`).lastInsertRowid);
  db.move({ product_id: id, qty: 86.6, kind: 'receive', source: 'manual', at: '2025-07-18T18:00:00Z' });
  db.move({ product_id: id, qty: -0.5, kind: 'sale', source: 'clover', ref: 'x', at: '2025-07-22T18:00:00Z' });
  db.run("INSERT INTO products (name, sku, upc, price) VALUES ('No code', '', '', 1)");
  const { csv, count, skipped } = cg.buildExport(db);
  assert.equal(count, 1); assert.equal(skipped, 1);
  const [head, row] = parseCsv(csv);
  assert.deepEqual(head, cg.HEADER);
  const o = Object.fromEntries(head.map((h, i) => [h, row[i]]));
  assert.equal(o.SKU, '4130'); assert.equal(o.CATEGORY, 'FRUIT'); assert.equal(o.SUBCATEGORY, 'APPLES');
  assert.equal(o.PRICE, '2.19'); assert.equal(o.PRICEPER, '1'); assert.equal(o.ONHAND, '86');
  assert.equal(o.LASTRECEIVED, '20250718'); assert.equal(o.LASTSOLD, '20250722'); assert.equal(o.DATECREATED, '20200419');
  assert.equal(o.SOLDBYWEIGHT, '1'); assert.equal(o.ESTIMATEDWEIGHT, '0.47'); assert.equal(o.ESTIMATEDWEIGHTUNIT, 'each'); assert.equal(o.UNIT, 'Lb');
  assert.equal(cg.exportFileName('Bay_Kosher', new Date(2026, 8, 7, 9, 8, 40)), 'Bay_Kosher_20260907_090840.csv');
});

test('website orders: imports paid tickets once, by SKU, weight for weighed items, and moves the cursor', async () => {
  const db = openDb();
  db.setSetting('golive_at', '2026-09-01T00:00:00.000Z');
  const a = Number(db.run("INSERT INTO products (name, upc, stock) VALUES ('Juice', '070978509331', 10)").lastInsertRowid);
  const m = Number(db.run("INSERT INTO products (name, sku, sold_by_weight, stock) VALUES ('Brisket', 'N117', 1, 50)").lastInsertRowid);
  const tickets = [
    { TicketId: 1, OrderId: 11, PaymentStatus: 'Paid', PaidDateUtc: '2026-09-24T17:15:57.663', Products: [{ Sku: '70978509331', Quantity: 2, Weight: 0, Case: false }, { Sku: 'N117', Quantity: 1, Weight: 3.25, Case: false }, { Sku: '999', Quantity: 1 }] },
    { TicketId: 2, OrderId: 12, PaymentStatus: 'Voided', PaidDateUtc: '2026-09-24T18:00:00.000', Products: [{ Sku: '070978509331', Quantity: 5 }] },
  ];
  const seen = [];
  const api = cg.ticketsClient({ baseUrl: 'https://baykosher.com/api/', username: 'u@x.com', password: 'p w', fetchImpl: async (url) => {
    const u = new URL(url); seen.push(u);
    assert.equal(u.pathname, '/api/export/tickets');
    const from = u.searchParams.get('fromDateTimeUtc');
    assert.match(from, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}$/);
    return { ok: true, json: async () => ({ success: true, data: tickets.filter((t) => t.PaidDateUtc >= from) }) };
  } });
  const r = await cg.pullOrders(db, api, Date.parse('2026-10-07T00:00:00Z'));
  assert.equal(r.tickets, 1); assert.equal(r.lines, 2); assert.deepEqual(r.unknown, ['999']);
  assert.equal(db.get('SELECT stock FROM products WHERE id = ?', a).stock, 8);
  assert.equal(db.get('SELECT stock FROM products WHERE id = ?', m).stock, 46.75);
  assert.equal(db.setting('web_orders_cursor'), '2026-09-24T18:00:00.000');
  assert.equal(seen[0].searchParams.get('password'), 'p w');
  assert.equal(seen[0].searchParams.get('unattendedMode'), 'true');
  await cg.pullOrders(db, api);
  assert.equal(db.get('SELECT stock FROM products WHERE id = ?', a).stock, 8, 'no double counting');
});

test('ftp upload: tries TLS first, falls back to plain when the server has no TLS', async () => {
  const log = [];
  let fail = true;
  class Client {
    async access(o) { log.push(['access', o.secure, o.port]); if (o.secure && fail) throw new Error('AUTH TLS not understood (500)'); }
    async cd(d) { log.push(['cd', d]); }
    async uploadFrom(stream, name) { let s = ''; for await (const c of stream) s += c; log.push(['upload', name, s]); }
    close() { log.push(['close']); }
  }
  const r = await cg.uploadExport({ host: 'h', port: 1175, user: 'u', password: 'p' }, 'f.csv', 'a,b\r\n', { ftpModule: { Client } });
  assert.deepEqual(r, { secure: false });
  assert.deepEqual(log.filter((l) => l[0] === 'upload'), [['upload', 'f.csv', 'a,b\r\n']]);
  assert.deepEqual(log.filter((l) => l[0] === 'access').map((l) => l[1]), [true, false]);
  fail = false; log.length = 0;
  assert.deepEqual(await cg.uploadExport({ host: 'h', port: 1175, user: 'u', password: 'p' }, 'f.csv', 'x', { ftpModule: { Client } }), { secure: true });
});

test('sync: a full round pulls both channels then pushes the combined count to Clover', async () => {
  const db = openDb();
  const f = fakeClover({ items: [{ id: 'IA', name: 'Juice', code: '070978509331', price: 749, itemStock: { quantity: 10 } }] });
  const fetchImpl = async (url, opts) => {
    if (String(url).includes('/export/tickets')) {
      const golive = db.setting('golive_at');
      return { ok: true, json: async () => ({ success: true, data: [{ TicketId: 5, PaymentStatus: 'Paid', PaidDateUtc: new Date(Date.parse(golive) + 60000).toISOString().replace('Z', ''), Products: [{ Sku: '070978509331', Quantity: 3 }] }] }) };
    }
    return f.fetchImpl(url, opts);
  };
  const sync = createSync(db, { fetchImpl, config: { clover: { merchantId: 'M1', token: 'tok' }, webOrders: { baseUrl: 'https://x/api', username: 'u', password: 'p' }, webFtp: null, email: null, claude: false } });
  await sync.syncStock();
  assert.equal(db.get('SELECT stock FROM products').stock, 7);
  assert.equal(f.stock.IA, 7);
  const st = sync.status();
  assert.equal(st.tasks.web_orders.ok, true);
});

test('email: only invoice-looking mail is read, and the inbox position is remembered', async () => {
  const db = openDb();
  db.run("INSERT INTO suppliers (name, invoice_senders) VALUES ('Kayco', '@kayco.com')");
  const msgs = {
    1: { from: 'news@shop.com', subject: 'Big sale this week', text: 'Deals' },
    2: { from: 'billing@kayco.com', subject: 'Statement', text: 'see attached', attachments: [{ contentType: 'application/pdf', filename: 'inv.pdf', content: Buffer.from('%PDF') }] },
    3: { from: 'someone@else.com', subject: 'Invoice #77 for your order', text: 'Total $10' },
  };
  class ImapFlow {
    async connect() {} async logout() {}
    async mailboxOpen() { return { uidValidity: 9 }; }
    async search(q) { return q.uid ? Object.keys(msgs).map(Number).filter((u) => u >= Number(q.uid.split(':')[0])) : Object.keys(msgs).map(Number); }
    async fetchOne(uid) { return { source: uid }; }
  }
  const simpleParser = async (uid) => { const m = msgs[uid]; return { messageId: '<m' + uid + '>', subject: m.subject, text: m.text, from: { text: m.from }, attachments: m.attachments || [] }; };
  const seen = [];
  const extract = async (x) => { seen.push(x.subject); return { kind: x.subject.startsWith('Invoice') ? 'other' : 'supplier_invoice', supplier_name: 'Kayco', invoice_number: 'S1', reference_number: '', invoice_date: '', subtotal: 1, shipping: 0, tax: 0, total: 1, lines: [] }; };
  const r = await checkMailbox(db, extract, { config: { host: 'h', port: 993, secure: true, auth: {}, folder: 'INBOX' }, ImapFlow, simpleParser });
  assert.deepEqual(seen, ['Statement', 'Invoice #77 for your order']);
  assert.equal(r.saved, 1);
  assert.equal(db.get('SELECT supplier_id FROM invoices').supplier_id, 1);
  assert.equal(db.setting('imap_last_uid'), '3');
  msgs[4] = { from: 'billing@kayco.com', subject: 'Invoice S2', text: '' };
  seen.length = 0;
  await checkMailbox(db, extract, { config: { host: 'h', port: 993, secure: true, auth: {}, folder: 'INBOX' }, ImapFlow, simpleParser });
  assert.deepEqual(seen, ['Invoice S2']);
});
