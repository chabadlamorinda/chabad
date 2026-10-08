'use strict';
process.env.TZ = 'America/Los_Angeles';
const test = require('node:test');
const assert = require('node:assert/strict');
const { openDb } = require('../server/db');
const { forecastAll, orderLists, parseOrderDays, nextOrderDay } = require('../server/forecast');
const { normCode, codeIndex, nameScore } = require('../server/catalog');
const { parseCsv, toCsv } = require('../server/csv');
const inv = require('../server/invoices');

function seed() {
  const db = openDb();
  const sup = Number(db.run("INSERT INTO suppliers (name, order_days, lead_time_days, invoice_senders, min_order) VALUES ('Kayco', 'Mon, Thu', 3, '@kayco.com', 100)").lastInsertRowid);
  const pid = Number(db.run("INSERT INTO products (name, brand, upc, sku, supplier_id, case_size, cost, price, created_at) VALUES ('Bamba Peanut Snack 1oz', 'Osem', '07290000066318', 'B1', ?, 24, 0.6, 1.29, datetime('now', '-60 days'))", sup).lastInsertRowid);
  return { db, sup, pid };
}

test('ledger: stock is the sum of movements; the same external sale is never counted twice', () => {
  const { db, pid } = seed();
  assert.equal(db.move({ product_id: pid, qty: 50, kind: 'initial', source: 'clover', ref: 'i1' }), true);
  assert.equal(db.move({ product_id: pid, qty: -2, kind: 'sale', source: 'clover', ref: 'li1' }), true);
  assert.equal(db.move({ product_id: pid, qty: -2, kind: 'sale', source: 'clover', ref: 'li1' }), false);
  assert.equal(db.move({ product_id: pid, qty: -1, kind: 'sale', source: 'web', ref: 'li1' }), true, 'same ref from a different source is a different sale');
  assert.equal(db.get('SELECT stock FROM products WHERE id = ?', pid).stock, 47);
  db.move({ product_id: pid, qty: -5, kind: 'sale', source: 'clover', ref: 'old', counted: false });
  assert.equal(db.get('SELECT stock FROM products WHERE id = ?', pid).stock, 47, 'history does not change stock');
  db.count(pid, 40);
  assert.equal(db.get('SELECT stock FROM products WHERE id = ?', pid).stock, 40);
  const sum = db.get('SELECT SUM(qty) s FROM movements WHERE product_id = ? AND counted = 1', pid).s;
  assert.equal(sum, 40);
});

test('order days and next order day', () => {
  assert.deepEqual([...parseOrderDays('Mon, thu')].sort(), [1, 4]);
  assert.equal(parseOrderDays(''), null);
  const wed = new Date(2026, 9, 7); // Wed Oct 7 2026
  assert.equal(nextOrderDay(wed, parseOrderDays('Mon,Thu')).getDate(), 8);
  assert.equal(nextOrderDay(wed, parseOrderDays('Wed')).getDate(), 7);
  assert.equal(nextOrderDay(wed, null).getDate(), 7);
});

test('forecast: steady seller gets an order sized to cover lead time + until the next order, in whole cases', () => {
  const { db, pid } = seed();
  const now = new Date(2026, 9, 7, 12); // Wednesday
  db.move({ product_id: pid, qty: 200, kind: 'initial', source: 'manual', at: new Date(2026, 7, 1).toISOString() });
  for (let d = 1; d <= 56; d++) for (let k = 0; k < 4; k++) db.move({ product_id: pid, qty: -1, kind: 'sale', source: 'clover', ref: `s${d}-${k}`, at: new Date(2026, 9, 7 - d, 12).toISOString() });
  db.count(pid, 10);
  const f = forecastAll(db, now).get(pid);
  assert.ok(Math.abs(f.rate - 4 * 56 / 57) < 0.3, 'about 4 a day, got ' + f.rate);
  assert.equal(f.order_day, '2026-10-08');           // next Thursday
  assert.equal(f.lead_days, 3);
  assert.equal(f.suggest_qty % 24, 0);
  assert.ok(f.suggest_qty >= 24);
  assert.equal(f.status, 'urgent');                   // 10 units will not last until the delivery
  const lists = orderLists(db, now);
  assert.equal(lists.length, 1);
  assert.equal(lists[0].supplier.name, 'Kayco');
  assert.equal(lists[0].lines[0].qty, f.suggest_qty);
});

test('forecast: nothing to order for items that do not sell, and stock on order counts', () => {
  const { db, pid } = seed();
  db.move({ product_id: pid, qty: 5, kind: 'initial', source: 'manual' });
  assert.equal(forecastAll(db).get(pid).suggest_qty, 0);
  db.run('UPDATE products SET min_stock = 30 WHERE id = ?', pid);
  assert.equal(forecastAll(db).get(pid).suggest_qty, 48);
  const po = Number(db.run('INSERT INTO purchase_orders (supplier_id) VALUES (1)').lastInsertRowid);
  db.run('INSERT INTO po_lines (po_id, product_id, qty) VALUES (?, ?, 24)', po, pid);
  assert.equal(forecastAll(db).get(pid).suggest_qty, 24);
});

test('codes: leading zeros and alternate barcodes match the same product', () => {
  const { db, pid } = seed();
  db.run("UPDATE products SET additional_skus = '0123~456' WHERE id = ?", pid);
  const idx = codeIndex(db);
  assert.equal(idx.get(normCode('7290000066318')), pid);
  assert.equal(idx.get(normCode('007290000066318')), pid);
  assert.equal(idx.get(normCode('123')), pid);
  assert.equal(idx.get(normCode('b1')), pid);
  assert.ok(nameScore('OSEM BAMBA PEANUT 1OZ 24/CS', 'Osem Bamba Peanut Snack 1oz') > 0.6);
  assert.ok(nameScore('KEDEM GRAPE JUICE 64OZ', 'Osem Bamba Peanut Snack 1oz') < 0.2);
});

test('csv round trip with commas, quotes and newlines', () => {
  const rows = [['a', 'b,c', 'say "hi"'], ['1', 'two\nlines', '']];
  assert.deepEqual(parseCsv(toCsv(rows)), rows);
});

test('price rounding and suggestions', () => {
  assert.equal(inv.roundPrice(1.039), 1.09);
  assert.equal(inv.roundPrice(4.2), 4.29);
  assert.equal(inv.roundPrice(10.2), 10.49);
  assert.equal(inv.roundPrice(12.6), 12.99);
  assert.equal(inv.roundPrice(3.333, 'none'), 3.33);
  assert.equal(inv.roundPrice(3.2, '0.99'), 3.99);
  assert.equal(inv.suggestPrice(0.7, 0.3), 1.09);
});

test('invoice: match, landed cost with shipping, apply receives stock, remembers matches, flags price', () => {
  const { db, sup, pid } = seed();
  const other = Number(db.run("INSERT INTO products (name, supplier_id, case_size, cost, price) VALUES ('Techina Paste 17.6oz', ?, 12, 4.4, 7.99)", sup).lastInsertRowid);
  db.run("INSERT INTO purchase_orders (supplier_id) VALUES (?)", sup);
  const id = inv.saveInvoice(db, {
    kind: 'supplier_invoice', supplier_name: 'KAYCO INC', invoice_number: 'A-1', reference_number: '', invoice_date: '2026-10-07',
    subtotal: 100, shipping: 10, tax: 0, total: 110,
    lines: [
      { description: 'OSEM BAMBA 24/1OZ', supplier_sku: 'K55', upc: '7290000066318', qty: 2, uom: 'case', pack_size: 24, unit_cost: 20, line_total: 40 },
      { description: 'AL ARZ TECHINA 17.6OZ', supplier_sku: 'K77', upc: '', qty: 1, uom: 'case', pack_size: null, unit_cost: 60, line_total: 60 },
      { description: 'Plastic bags (store supplies)', supplier_sku: '', upc: '', qty: 1, uom: 'each', pack_size: null, unit_cost: 0, line_total: 0 },
    ],
  }, { from: 'Billing <billing@kayco.com>', email_id: 'm1' });
  const i = db.get('SELECT * FROM invoices WHERE id = ?', id);
  assert.equal(i.supplier_id, sup, 'supplier found by email domain');
  const lines = inv.landed(db, id);
  assert.equal(lines[0].product.id, pid); assert.equal(lines[0].units, 48);
  assert.equal(lines[1].product.id, other); assert.equal(lines[1].units, 12, 'case size from the product');
  assert.equal(lines[2].product, null);
  assert.equal(lines[0].unit_cost, Math.round((40 + 4) / 48 * 10000) / 10000, '40% of shipping goes to the $40 line');
  assert.equal(lines[1].unit_cost, 5.5);
  // Same email again: no duplicate.
  assert.equal(inv.saveInvoice(db, { kind: 'supplier_invoice', lines: [] }, { email_id: 'm1' }), id);

  inv.applyInvoice(db, id);
  assert.equal(db.get('SELECT stock FROM products WHERE id = ?', pid).stock, 48);
  assert.equal(db.get('SELECT cost FROM products WHERE id = ?', other).cost, 5.5);
  assert.equal(db.get("SELECT status FROM purchase_orders").status, 'received');
  assert.equal(db.get('SELECT supplier_sku FROM products WHERE id = ?', pid).supplier_sku, 'K55');
  inv.applyInvoice(db, id); // applying twice changes nothing
  assert.equal(db.get('SELECT stock FROM products WHERE id = ?', pid).stock, 48);

  const review = inv.priceReview(db);
  const t = review.find((r) => r.product.id === other);
  assert.ok(t, 'techina cost went up 25% so it is flagged');
  assert.equal(t.suggested, 9.99);   // 7.99 * 5.5/4.4 = 9.99 keeps the margin
  // Next invoice with the same supplier code matches by memory.
  const m = inv.matchLine(db, sup, { supplier_sku: 'K77', description: 'something else' });
  assert.deepEqual(m, { product_id: other, match: 'remembered' });
});

test('shipping-only bill is added to the invoice it refers to and updates landed costs', () => {
  const { db, pid } = seed();
  const id = inv.saveInvoice(db, { kind: 'supplier_invoice', supplier_name: 'Kayco', invoice_number: 'A-9', reference_number: '', invoice_date: '', subtotal: 24, shipping: 0, tax: 0, total: 24,
    lines: [{ description: 'Bamba', supplier_sku: '', upc: '7290000066318', qty: 1, uom: 'case', pack_size: 24, unit_cost: 24, line_total: 24 }] }, {});
  inv.applyInvoice(db, id);
  assert.equal(db.get('SELECT cost FROM products WHERE id = ?', pid).cost, 1);
  const ship = inv.saveInvoice(db, { kind: 'shipping_charge', supplier_name: 'Fast Freight', invoice_number: 'F1', reference_number: 'A-9', invoice_date: '', subtotal: null, shipping: 12, tax: null, total: 12, lines: [] }, {});
  assert.equal(db.get('SELECT attached_to FROM invoices WHERE id = ?', ship).attached_to, id);
  assert.equal(db.get('SELECT cost FROM products WHERE id = ?', pid).cost, 1.5);
});

test('"other" emails are not saved', () => {
  const { db } = seed();
  assert.equal(inv.saveInvoice(db, { kind: 'other', lines: [] }, {}), null);
});
