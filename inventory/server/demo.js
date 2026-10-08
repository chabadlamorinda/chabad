// Sample data for trying the app (npm run demo). Not used with real connections.
'use strict';

const { saveInvoice } = require('./invoices');

const SUPPLIERS = [
  { name: 'Kayco (Kosher Distributor)', contact: 'Sales desk', email: 'orders@example-kayco.com', order_days: 'Mon, Thu', lead_time_days: 3, min_order: 500, invoice_senders: '@example-kayco.com' },
  { name: 'Golden Gate Produce', contact: 'Danny', email: 'danny@example-ggproduce.com', order_days: 'Mon, Wed, Fri', lead_time_days: 1, min_order: 150, invoice_senders: '@example-ggproduce.com' },
  { name: 'Empire Kosher Poultry', contact: 'West Coast rep', email: 'west@example-empire.com', order_days: 'Tue', lead_time_days: 5, min_order: 400, invoice_senders: '@example-empire.com' },
  { name: 'Brooklyn Bakery Supply', contact: 'Office', email: 'office@example-bkbakery.com', order_days: 'Wed', lead_time_days: 6, min_order: 200, invoice_senders: '' },
];

// [name, category, brand, supplierIndex, case, cost, price, stock, salesPerDay, upc]
const PRODUCTS = [
  ['Bamba Peanut Snack 1oz', 'Snacks', 'Osem', 0, 24, 0.62, 1.29, 30, 4.5, '7290000066318'],
  ['Bissli BBQ 2.5oz', 'Snacks', 'Osem', 0, 24, 0.85, 1.79, 12, 2.2, '7290000068220'],
  ['Matzo Ball Mix 4.5oz', 'Grocery', "Manischewitz", 0, 24, 1.35, 2.99, 40, 1.1, '077544120018'],
  ['Israeli Couscous 8.8oz', 'Grocery', 'Osem', 0, 12, 1.40, 2.99, 18, 0.9, '7290000048208'],
  ['Grape Juice 64oz', 'Beverages', "Kedem", 0, 8, 4.10, 7.49, 6, 1.6, '070978509331'],
  ['Concord Grape Wine 750ml', 'Wine', "Kedem", 0, 12, 5.25, 9.99, 22, 0.8, '070978509348'],
  ['Gefilte Fish Jar 24oz', 'Grocery', "Manischewitz", 0, 12, 4.60, 8.49, 5, 0.7, '077544829121'],
  ['Hummus Classic 17oz', 'Refrigerated', 'Sabra', 0, 6, 3.20, 5.99, 9, 2.1, '040822011143'],
  ['Pita Bread 6ct', 'Bakery', 'Angel', 3, 12, 1.55, 3.49, 14, 3.0, '784058775003'],
  ['Challah Plain', 'Bakery', 'In-house', 3, 10, 2.40, 6.99, 0, 4.0, '210057'],
  ['Rugelach Chocolate 12oz', 'Bakery', 'Brooklyn Bakery', 3, 12, 3.10, 6.99, 20, 0.6, '651219205535'],
  ['Chicken Whole (lb)', 'Meat & Poultry', 'Empire', 2, 40, 3.45, 6.49, 55, 7.5, 'N117'],
  ['Chicken Cutlets (lb)', 'Meat & Poultry', 'Empire', 2, 20, 6.90, 11.99, 18, 4.2, 'N118'],
  ['Ground Beef 85% (lb)', 'Meat & Poultry', 'Empire', 2, 20, 6.10, 10.99, 25, 2.8, 'N119'],
  ['Turkey Breast Deli 7oz', 'Deli', 'Empire', 2, 12, 4.10, 7.49, 15, 1.2, '890360004257'],
  ['Pink Lady Apples (lb)', 'Produce', '', 1, 40, 1.10, 2.19, 60, 6.0, '4130'],
  ['Persian Cucumbers 1lb', 'Produce', '', 1, 12, 1.35, 2.99, 10, 3.5, '033383000123'],
  ['Romaine Hearts 3pk', 'Produce', '', 1, 12, 2.05, 3.99, 16, 2.4, '033383000456'],
  ['Fresh Dill Bunch', 'Produce', '', 1, 24, 0.55, 1.49, 8, 1.8, '4891'],
  ['Shabbat Candles 72ct', 'Household', 'Ner Mitzvah', 0, 24, 3.30, 6.99, 35, 0.5, '600699310073'],
  ['Yahrzeit Candle Glass', 'Household', 'Ner Mitzvah', 0, 48, 0.80, 1.99, 50, 0.3, '600699310110'],
  ['Halva Vanilla 8oz', 'Snacks', 'Achva', 0, 12, 2.30, 4.49, 3, 0.2, '7290000176109'],
  ['Schug Spicy Sauce 7oz', 'Grocery', "Pereg", 0, 12, 2.80, 5.49, 11, 0.4, '7290006652485'],
  ['Techina Paste 17.6oz', 'Grocery', 'Al Arz', 0, 12, 4.40, 7.99, 2, 0.6, '7290011200009'],
];

function loadDemo(db) {
  if (db.get('SELECT 1 FROM products LIMIT 1')) return;
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const poisson = (l) => { let k = 0, p = 1; const L = Math.exp(-l); do { k++; p *= rand(); } while (p > L); return k - 1; };

  db.tx(() => {
    const supIds = SUPPLIERS.map((s) => Number(db.run('INSERT INTO suppliers (name, contact, email, order_days, lead_time_days, min_order, invoice_senders) VALUES (?, ?, ?, ?, ?, ?, ?)',
      s.name, s.contact, s.email, s.order_days, s.lead_time_days, s.min_order, s.invoice_senders).lastInsertRowid));
    const start = new Date(); start.setHours(9, 0, 0, 0); start.setDate(start.getDate() - 56);
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('golive_at', ?)", start.toISOString());
    PRODUCTS.forEach(([name, cat, brand, si, cs, cost, price, stockNow, rate, upc], i) => {
      const weight = /\(lb\)/.test(name);
      const id = Number(db.run(`INSERT INTO products (name, category, brand, supplier_id, case_size, cost, price, upc, sku, supplier_sku, sold_by_weight, unit, taxable, created_at, clover_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        name, cat, brand, supIds[si], cs, cost, price, upc, upc, 'S' + (1000 + i * 7), weight ? 1 : 0, weight ? 'Lb' : '', cat === 'Household' ? 1 : 0,
        start.toISOString().replace('T', ' ').slice(0, 19), null).lastInsertRowid);
      // 8 weeks of sales across the register and the website, Fridays busiest.
      let sold = 0; const sales = [];
      for (let d = 0; d < 56; d++) {
        const day = new Date(start); day.setDate(day.getDate() + d);
        const mult = day.getDay() === 5 ? 1.8 : day.getDay() === 4 ? 1.3 : day.getDay() === 6 ? 0 : 1;
        const n = poisson(rate * mult * (0.8 + 0.4 * d / 56));
        for (let k = 0; k < n; k++) { const at = new Date(day); at.setHours(10 + Math.floor(rand() * 8), Math.floor(rand() * 60)); sales.push([at, rand() < 0.3 ? 'web' : 'clover']); sold++; }
      }
      db.move({ product_id: id, qty: stockNow + sold, kind: 'initial', source: 'demo', at: start.toISOString(), note: 'Starting stock (demo)' });
      sales.forEach(([at, src], k) => db.move({ product_id: id, qty: -1, kind: 'sale', source: src === 'web' ? 'web' : 'clover', ref: 'demo' + id + ':' + k, at: at.toISOString(), note: src === 'web' ? 'Web order (demo)' : 'Clover sale (demo)' }));
    });
    // An order already placed with the produce supplier.
    const po = Number(db.run("INSERT INTO purchase_orders (supplier_id, expected_at) VALUES (?, date('now', '+1 day'))", supIds[1]).lastInsertRowid);
    db.run("INSERT INTO po_lines (po_id, product_id, qty, unit_cost) SELECT ?, id, case_size, cost FROM products WHERE name = 'Persian Cucumbers 1lb'", po);
  });

  // Two invoices waiting for review, as if they came in by email.
  saveInvoice(db, {
    kind: 'supplier_invoice', supplier_name: 'Kayco', invoice_number: 'KC-48213', reference_number: '', invoice_date: new Date().toISOString().slice(0, 10),
    subtotal: 266.4, shipping: 18.5, tax: 0, total: 284.9,
    lines: [
      { description: 'OSEM BAMBA PEANUT 1OZ 24/CS', supplier_sku: 'S1000', upc: '7290000066318', qty: 3, uom: 'case', pack_size: 24, unit_cost: 16.32, line_total: 48.96 },
      { description: 'KEDEM GRAPE JUICE 64OZ 8/CS', supplier_sku: 'S1028', upc: '070978509331', qty: 4, uom: 'case', pack_size: 8, unit_cost: 35.6, line_total: 142.4 },
      { description: 'AL ARZ TECHINA 17.6OZ 12/CS', supplier_sku: '', upc: '', qty: 1, uom: 'case', pack_size: 12, unit_cost: 56.4, line_total: 56.4 },
      { description: 'PEREG SCHUG GREEN 7OZ', supplier_sku: 'PG-SCH7', upc: '', qty: 1, uom: 'case', pack_size: 12, unit_cost: 18.64, line_total: 18.64 },
    ],
  }, { source: 'email', email_id: 'demo-1', subject: 'Invoice KC-48213 from Kayco', from: 'billing@example-kayco.com' });
  saveInvoice(db, {
    kind: 'supplier_invoice', supplier_name: 'Golden Gate Produce', invoice_number: 'GG-7781', reference_number: '', invoice_date: new Date().toISOString().slice(0, 10),
    subtotal: 96.6, shipping: 12, tax: 0, total: 108.6,
    lines: [
      { description: 'Pink Lady apples 40lb', supplier_sku: '', upc: '', qty: 1, uom: 'case', pack_size: 40, unit_cost: 52.0, line_total: 52.0 },
      { description: 'Dill bunches 24ct', supplier_sku: '', upc: '', qty: 1, uom: 'case', pack_size: 24, unit_cost: 15.6, line_total: 15.6 },
      { description: 'Romaine hearts 3pk 12ct', supplier_sku: '', upc: '', qty: 1, uom: 'case', pack_size: 12, unit_cost: 29.0, line_total: 29.0 },
    ],
  }, { source: 'email', email_id: 'demo-2', subject: 'Your invoice GG-7781', from: 'danny@example-ggproduce.com' });
}

module.exports = { loadDemo };
