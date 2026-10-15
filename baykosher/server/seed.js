// First-run data: the 12 departments from the current site. Demo products are only added by `npm run seed:demo`.
'use strict';

const DEPARTMENTS = [
  ['Meat', 'meat', false], ['Deli & Provisions', 'deli-provisions', false], ['Dairy', 'dairy', false], ['Frozen', 'frozen', false],
  ['Groceries', 'groceries', false], ['Baked Goods', 'baked-goods', false], ['Beverages', 'beverages', false], ['Candy & Sweets', 'candy-sweets', false],
  ['Baby Food', 'baby-food', false], ['Judaica', 'judaica', true], ['Beauty & Personal', 'beauty-personal', true], ['Household', 'household', true],
];

async function seedDepartments(db) {
  const n = await db.one('SELECT count(*)::int n FROM categories');
  if (n.n > 0) return false;
  for (const [i, [name, slug, taxable]] of DEPARTMENTS.entries()) await db.q('INSERT INTO categories (name, slug, sort, taxable_default) VALUES ($1,$2,$3,$4)', [name, slug, i, taxable]);
  return true;
}

async function seedDemo(db) {
  await seedDepartments(db);
  const cat = Object.fromEntries((await db.rows('SELECT id, slug FROM categories')).map((c) => [c.slug, c.id]));
  const sup = await db.one(`INSERT INTO suppliers (name, markup_pct) VALUES ('Demo Distributor', 32) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`);
  const items = [
    ['Osem Original Plain Couscous', 'Osem', '12 oz', 'groceries', 'each', 389, 290, 40, '7290000000014'],
    ['Elite Chocolate With Strawberry Filling', 'Elite', '3.5 oz', 'candy-sweets', 'each', 699, 480, 24, '7290000000021'],
    ['Of Tov Fully Cooked Chicken Meat Balls', 'Of Tov', '24 oz', 'frozen', 'each', 1899, 1400, 12, '7290000000038'],
    ['Osem Gluten Free Chocolate Petit Beurre', 'Osem', '8 oz', 'groceries', 'each', 519, 380, 2, '7290000000045'],
    ['Chuck Eye Roast - Regular Large Roast', '', '', 'meat', 'lb', 1349, 980, 30, '2000000000011'],
    ['Osem Chicken Style Consomme Instant Soup', 'Osem', '2.1 lb', 'groceries', 'each', 1639, 1200, 9, '7290000000052'],
    ['Round Challah', 'Bay Kosher Bakery', '1 lb', 'baked-goods', 'each', 699, 350, 20, '2000000000028'],
    ['Whole Chicken', '', '', 'meat', 'lb', 499, 330, 50, '2000000000035'],
    ['Pereg Tahini', 'Pereg', '16 oz', 'groceries', 'each', 849, 600, 0, '7290000000069'],
    ['Cholov Yisroel Whole Milk', 'Bay Dairy', '1 gal', 'dairy', 'each', 799, 540, 8, '7290000000076'],
  ];
  for (const [name, brand, size, c, by, price, cost, stock, upc] of items) {
    await db.q(`INSERT INTO products (name, brand, size, category_id, supplier_id, sold_by, price_cents, cost_cents, stock, upc, description, active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Demo product.',TRUE) ON CONFLICT DO NOTHING`, [name, brand, size, cat[c], sup.id, by, price, cost, stock, upc]);
  }
  await db.q(`INSERT INTO sales (name, kind, value, scope_type, scope_value) SELECT 'Demo: 15% off Osem', 'percent', 15, 'brand', 'Osem' WHERE NOT EXISTS (SELECT 1 FROM sales WHERE name = 'Demo: 15% off Osem')`);
}

module.exports = { seedDepartments, seedDemo, DEPARTMENTS };

if (require.main === module) {
  const { createDb } = require('./db');
  (async () => { const db = createDb(process.env.DATABASE_URL); await db.migrate(); await seedDemo(db); console.log('Demo data added.'); await db.close(); })().catch((e) => { console.error(e); process.exit(1); });
}
