// First-run data: the 12 departments from the current site. Demo products are only added by `npm run seed:demo`.
'use strict';

const DEPARTMENTS = [
  ['Meat', 'meat', false, 'בשר'], ['Deli & Provisions', 'deli-provisions', false, 'מעדנייה ומזון'], ['Dairy', 'dairy', false, 'מוצרי חלב'], ['Frozen', 'frozen', false, 'קפואים'],
  ['Groceries', 'groceries', false, 'מכולת'], ['Baked Goods', 'baked-goods', false, 'מאפים ולחם'], ['Beverages', 'beverages', false, 'משקאות'], ['Candy & Sweets', 'candy-sweets', false, 'ממתקים וחטיפים'],
  ['Baby Food', 'baby-food', false, 'מזון לתינוקות'], ['Judaica', 'judaica', true, 'יודאיקה'], ['Beauty & Personal', 'beauty-personal', true, 'טיפוח ואישי'], ['Household', 'household', true, 'מוצרים לבית'],
];

async function seedDepartments(db) {
  const n = await db.one('SELECT count(*)::int n FROM categories');
  if (n.n > 0) return false;
  for (const [i, [name, slug, taxable, he]] of DEPARTMENTS.entries()) await db.q('INSERT INTO categories (name, slug, name_he, sort, taxable_default) VALUES ($1,$2,$3,$4,$5)', [name, slug, he, i, taxable]);
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
  const he = { 'Osem Original Plain Couscous': 'אסם קוסקוס רגיל', 'Round Challah': 'חלה עגולה', 'Whole Chicken': 'עוף שלם', 'Pereg Tahini': 'פרג טחינה', 'Cholov Yisroel Whole Milk': 'חלב מלא חלב ישראל', 'Chuck Eye Roast - Regular Large Roast': 'צלי כתף', 'Elite Chocolate With Strawberry Filling': 'עלית שוקולד במילוי תות' };
  for (const [name, brand, size, c, by, price, cost, stock, upc] of items) {
    // meat sold as packs of an average weight (priced per lb)
    const pack = name.startsWith('Chuck Eye') ? 2.4 : name === 'Whole Chicken' ? 4.1 : null;
    await db.q(`INSERT INTO products (name, name_he, brand, size, category_id, supplier_id, sold_by, est_weight_lb, price_cents, cost_cents, stock, upc, description, active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'Demo product.',TRUE) ON CONFLICT DO NOTHING`, [name, he[name] || '', brand, size, cat[c], sup.id, by, pack, price, cost, stock, upc]);
  }
  await db.q(`INSERT INTO sales (name, kind, value, scope_type, scope_value) SELECT 'Demo: 15% off Osem', 'percent', 15, 'brand', 'Osem' WHERE NOT EXISTS (SELECT 1 FROM sales WHERE name = 'Demo: 15% off Osem')`);
}

module.exports = { seedDepartments, seedDemo, DEPARTMENTS };

if (require.main === module) {
  const { createDb } = require('./db');
  (async () => { const db = createDb(process.env.DATABASE_URL); await db.migrate(); await seedDemo(db); console.log('Demo data added.'); await db.close(); })().catch((e) => { console.error(e); process.exit(1); });
}
