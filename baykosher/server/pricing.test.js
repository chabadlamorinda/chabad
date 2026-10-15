'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const p = require('./pricing');
const { createIndex, skeleton } = require('./search');
const { deliveryFee, miles } = require('./delivery');
const { parseCsv, parseInvoiceCsv } = require('./backoffice');
const { localToDate } = require('./core');

test('charm pricing ends in 9', () => { assert.equal(p.charm(387), 389); assert.equal(p.charm(390), 399); assert.equal(p.suggestPrice(300, 30), 399); assert.equal(p.suggestPrice(0, 30), null); });
test('shipping is spread by value and raises landed cost', () => {
  const r = p.allocateShipping([{ qty: 10, unit_cost_cents: 200 }, { qty: 5, unit_cost_cents: 400 }], 400);
  assert.equal(r[0].landed_cost_cents, 220); assert.equal(r[1].landed_cost_cents, 440);
});
test('sales: percent, margin over cost, never below cost', () => {
  const prod = { id: 1, price_cents: 1000, cost_cents: 800, category_id: 2, supplier_id: 3, brand: 'Osem' };
  const base = { active: true, scope_type: 'all', scope_value: '' };
  assert.equal(p.salePrice({ ...base, kind: 'percent', value: 10 }, prod), 900);
  assert.equal(p.salePrice({ ...base, kind: 'percent', value: 50 }, prod), 800); // floored at cost
  assert.equal(p.salePrice({ ...base, kind: 'percent', value: 50, allow_below_cost: true }, prod), 500);
  assert.equal(p.salePrice({ ...base, kind: 'margin', value: 5 }, prod), 840);
  assert.equal(p.salePrice({ ...base, kind: 'margin', value: 50 }, prod), null); // not a discount
  const sales = [{ ...base, name: 'A', kind: 'percent', value: 10, scope_type: 'brand', scope_value: 'osem' }, { ...base, name: 'B', kind: 'percent', value: 20, scope_type: 'category', scope_value: '2' }, { ...base, name: 'C', kind: 'percent', value: 30, scope_type: 'category', scope_value: '9' }];
  const e = p.effectivePrice(prod, sales); assert.equal(e.price_cents, 800); assert.equal(e.sale_name, 'B'); assert.equal(e.was_cents, 1000);
  assert.equal(p.effectivePrice(prod, [{ ...base, kind: 'percent', value: 10, ends_at: '2000-01-01' }]).was_cents, null);
});
test('stock status and reorder hint', () => {
  assert.equal(p.stockStatus({ track_stock: true, stock: 0, low_stock_at: 3 }), 'out'); assert.equal(p.stockStatus({ track_stock: true, stock: 2, low_stock_at: 3 }), 'low');
  assert.equal(p.stockStatus({ track_stock: true, stock: 9, low_stock_at: 3 }), 'in'); assert.equal(p.stockStatus({ track_stock: false, stock: 0, low_stock_at: 3 }), 'in');
  const h = p.reorderHint({ stock: 4, soldInWindow: 28, windowDays: 28, coverDays: 14, leadDays: 3 }); assert.equal(h.per_day, 1); assert.equal(h.order_qty, 13); assert.equal(h.urgent, true);
});
test('search finds typos and sounds-alike spellings', () => {
  const i = createIndex();
  i.build([{ id: 1, name: 'Round Challah', track_stock: true, stock: 5 }, { id: 2, name: 'Osem Matzah Meal', track_stock: true, stock: 5 }, { id: 3, name: 'Hummus Classic', track_stock: true, stock: 5 }, { id: 4, name: 'Chicken Soup Mix', track_stock: true, stock: 5 }, { id: 5, name: 'Gefilte Fish', brand: 'Manischewitz', track_stock: true, stock: 5, upc: '722776000123' }]);
  const top = (q) => (i.search(q)[0] || {}).id;
  assert.equal(top('hallah'), 1); assert.equal(top('chalah'), 1); assert.equal(top('matzo'), 2); assert.equal(top('humus'), 3); assert.equal(top('chiken sup'), 4);
  assert.equal(top('gefilta fish'), 5); assert.equal(top('manishevitz'), 5); assert.equal(top('722776000123'), 5); assert.equal(top('soup chicken'), 4); assert.equal(i.search('zzzz').length, 0);
  assert.ok(skeleton('challah') === skeleton('hallah'));
});
test('delivery fee tiers and free threshold', () => {
  const tiers = [{ max_miles: 3, fee_cents: 599, free_over_cents: 15000 }, { max_miles: 8, fee_cents: 999, free_over_cents: 25000 }];
  assert.deepEqual(deliveryFee(2, 5000, tiers).fee_cents, 599); assert.equal(deliveryFee(2, 15000, tiers).fee_cents, 0); assert.equal(deliveryFee(5, 15000, tiers).fee_cents, 999);
  assert.equal(deliveryFee(9, 99999, tiers).deliverable, false);
  assert.ok(Math.abs(miles({ lat: 37.8934, lng: -122.1117 }, { lat: 37.9, lng: -122.1117 }) - 0.45) < 0.1);
});
test('csv parsing and invoice csv', () => {
  assert.deepEqual(parseCsv('a,"b,c"\n"x""y",2\r\n'), [['a', 'b,c'], ['x"y', '2']]);
  const l = parseInvoiceCsv('UPC,Description,Qty,Unit Cost,Pack\n722776000123,"Gefilte Fish, 24oz",2,$24.00,12\n,Challah,10,1.50,1');
  assert.equal(l.length, 2); assert.equal(l[0].unit_cost_cents, 2400); assert.equal(l[0].pack, 12); assert.equal(l[0].description, 'Gefilte Fish, 24oz');
});
test('store local time to instant honors daylight saving', () => {
  assert.equal(localToDate(2026, 7, 1, 10, 0, 'America/Los_Angeles').toISOString(), '2026-07-01T17:00:00.000Z');
  assert.equal(localToDate(2026, 1, 15, 10, 0, 'America/Los_Angeles').toISOString(), '2026-01-15T18:00:00.000Z');
});
