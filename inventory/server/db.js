// SQLite storage (Node's built-in node:sqlite, so there is nothing to compile).
//
// Stock is a ledger: every change (a sale on Clover, a web order, a delivery, a shelf count)
// is a row in `movements`, and products.stock is kept equal to the sum of that product's rows.
// Each platform's own stock number is never trusted as the truth; we only read their sales
// and push our number back. That is what keeps one unified count.
'use strict';

const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  contact TEXT DEFAULT '',
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  order_days TEXT DEFAULT '',          -- e.g. "Mon,Thu"; empty = any day
  lead_time_days INTEGER DEFAULT 3,    -- days from placing an order to having it on the shelf
  min_order REAL DEFAULT 0,            -- dollars
  invoice_senders TEXT DEFAULT '',     -- email addresses or @domains whose emails are this supplier's invoices
  notes TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  sku TEXT DEFAULT '',
  upc TEXT DEFAULT '',
  category TEXT DEFAULT '',
  subcategory TEXT DEFAULT '',
  brand TEXT DEFAULT '',
  manufacturer TEXT DEFAULT '',
  shelf TEXT DEFAULT '',
  size TEXT DEFAULT '',                -- website: "6"  (with unit "Pk")
  unit TEXT DEFAULT '',                -- website: Oz, Ct, Pk, Lb, Gr, Pc, Ml, Ltr, Each, Lit, Tab, Pcs
  taxable INTEGER DEFAULT 0,
  snap INTEGER DEFAULT 0,
  sold_by_weight INTEGER DEFAULT 0,    -- stock and sales are then in pounds
  est_weight REAL,                     -- website: estimated weight of one piece
  est_weight_unit TEXT DEFAULT '',     -- website: each, tray, pack, bunch, bag, container
  age_restricted INTEGER DEFAULT 0,
  kosher_passover INTEGER DEFAULT 0,
  additional_skus TEXT DEFAULT '',     -- old/alternate barcodes, separated by commas
  supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_sku TEXT DEFAULT '',
  case_size INTEGER DEFAULT 1,         -- units in one supplier case
  cost REAL DEFAULT 0,                 -- landed cost per unit (incl. its share of shipping)
  price REAL DEFAULT 0,                -- shelf / web price per unit
  target_margin REAL,                  -- null = use the default
  min_stock INTEGER DEFAULT 0,         -- never let it fall below this
  stock REAL DEFAULT 0,                -- = SUM(movements.qty)
  active INTEGER DEFAULT 1,
  clover_id TEXT,
  clover_pushed_qty REAL,              -- last quantity we sent to Clover
  notes TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS products_clover ON products(clover_id) WHERE clover_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS products_upc ON products(upc);
CREATE INDEX IF NOT EXISTS products_sku ON products(sku);

CREATE TABLE IF NOT EXISTS movements (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  qty REAL NOT NULL,                   -- + in, - out
  kind TEXT NOT NULL,                  -- sale | return | receive | count | adjust | initial
  source TEXT NOT NULL,                -- clover | web | manual | invoice | demo
  ref TEXT,                            -- external id, so re-reading the same sale never double counts
  counted INTEGER DEFAULT 1,           -- 0 = sales history from before go-live: used for sales speed, not stock
  at TEXT NOT NULL,                    -- ISO time it happened
  note TEXT DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS movements_ref ON movements(source, ref) WHERE ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS movements_product_at ON movements(product_id, at);

CREATE TABLE IF NOT EXISTS aliases (      -- remembers "this invoice line = that product"
  supplier_id INTEGER,
  key TEXT NOT NULL,                      -- normalized supplier sku or description
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  PRIMARY KEY (supplier_id, key)
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY,
  supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT DEFAULT '',
  number TEXT DEFAULT '',
  date TEXT DEFAULT '',
  subtotal REAL DEFAULT 0,
  shipping REAL DEFAULT 0,
  tax REAL DEFAULT 0,
  total REAL DEFAULT 0,
  kind TEXT DEFAULT 'supplier_invoice',  -- supplier_invoice | shipping_charge
  reference TEXT DEFAULT '',             -- for a shipping charge: the invoice/order it belongs to
  attached_to INTEGER,                   -- shipping charge added to this invoice
  status TEXT DEFAULT 'review',          -- review | applied | ignored
  source TEXT DEFAULT 'upload',          -- email | upload
  email_id TEXT,
  email_subject TEXT DEFAULT '',
  email_from TEXT DEFAULT '',
  receive_stock INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  applied_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS invoices_email ON invoices(email_id) WHERE email_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS invoice_lines (
  id INTEGER PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT DEFAULT '',
  supplier_sku TEXT DEFAULT '',
  upc TEXT DEFAULT '',
  qty REAL DEFAULT 0,
  uom TEXT DEFAULT 'each',               -- each | case
  pack_size INTEGER,                     -- units per case if the invoice says so
  unit_cost REAL DEFAULT 0,              -- per invoice unit (each or case)
  line_total REAL DEFAULT 0,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  match TEXT DEFAULT ''                  -- how it was matched: alias | sku | upc | name | manual
);

CREATE TABLE IF NOT EXISTS price_history (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  field TEXT NOT NULL,                   -- cost | price
  old_value REAL, new_value REAL,
  source TEXT DEFAULT '', at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id INTEGER PRIMARY KEY,
  supplier_id INTEGER REFERENCES suppliers(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'ordered',         -- ordered | received | cancelled
  created_at TEXT DEFAULT (datetime('now')),
  expected_at TEXT,
  received_at TEXT
);
CREATE TABLE IF NOT EXISTS po_lines (
  po_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  qty REAL NOT NULL,                     -- units
  unit_cost REAL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sync_log (
  id INTEGER PRIMARY KEY,
  at TEXT DEFAULT (datetime('now')),
  task TEXT, ok INTEGER, message TEXT
);
`;

const DEFAULT_SETTINGS = {
  store_name: 'Bay Kosher Market',
  default_margin: '0.30',      // 30% gross margin
  safety_days: '3',            // extra days of stock kept as a cushion
  review_days: '7',            // how often you reorder from a supplier with no set order days
  price_rounding: 'smart',     // smart: .x9 under $10, .49/.99 above; '0.99'; 'none'
  auto_apply_costs: '1',       // invoice costs update product costs when an invoice is applied
  price_alert_pct: '5',        // flag cost jumps bigger than this %
  push_stock_to_clover: '1',
  push_prices_to_clover: '1',
  web_store_file_prefix: 'Bay_Kosher',
  web_unattended_mode: '0',    // 1 = only orders processed by Cloud Grocer's Cashier module ("unattended mode")
};

function openDb(file = ':memory:') {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  const ins = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) ins.run(k, v);
  return wrap(db);
}

function wrap(db) {
  const cache = new Map();
  const st = (sql) => { let s = cache.get(sql); if (!s) { s = db.prepare(sql); cache.set(sql, s); } return s; };
  const plain = (r) => (r ? { ...r } : r);
  const api = {
    raw: db,
    all: (sql, ...p) => st(sql).all(...p).map(plain),
    get: (sql, ...p) => plain(st(sql).get(...p)),
    run: (sql, ...p) => st(sql).run(...p),
    tx(fn) {
      if (api._inTx) return fn();
      db.exec('BEGIN IMMEDIATE'); api._inTx = true;
      try { const r = fn(); db.exec('COMMIT'); return r; }
      catch (e) { db.exec('ROLLBACK'); throw e; }
      finally { api._inTx = false; }
    },
    setting(key) { const r = api.get('SELECT value FROM settings WHERE key = ?', key); return r ? r.value : DEFAULT_SETTINGS[key]; },
    num(key) { const n = Number(api.setting(key)); return Number.isFinite(n) ? n : Number(DEFAULT_SETTINGS[key]); },
    setSetting(key, value) { api.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, String(value)); },
    settings() { const o = { ...DEFAULT_SETTINGS }; for (const r of api.all('SELECT key, value FROM settings')) o[r.key] = r.value; return o; },

    /**
     * Record a stock change. Returns false (and changes nothing) if this source+ref was already recorded.
     * @param {{product_id:number, qty:number, kind:string, source:string, ref?:string|null, at?:string, note?:string, counted?:boolean}} m
     */
    move(m) {
      return api.tx(() => {
        const counted = m.counted === false ? 0 : 1;
        const r = api.run('INSERT OR IGNORE INTO movements (product_id, qty, kind, source, ref, counted, at, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          m.product_id, m.qty, m.kind, m.source, m.ref == null ? null : String(m.ref), counted, m.at || new Date().toISOString(), m.note || '');
        if (!r.changes) return false;
        if (counted) api.run("UPDATE products SET stock = stock + ?, updated_at = datetime('now') WHERE id = ?", m.qty, m.product_id);
        return true;
      });
    },
    /** Set stock to an exact counted number (records the difference as a "count" movement). */
    count(productId, counted, note = '', source = 'manual') {
      return api.tx(() => {
        const p = api.get('SELECT stock FROM products WHERE id = ?', productId);
        if (!p) return false;
        const diff = Number(counted) - p.stock;
        if (Math.abs(diff) < 1e-9) return true;
        return api.move({ product_id: productId, qty: diff, kind: 'count', source, note: note || 'Counted ' + counted });
      });
    },
    /** The moment stock tracking started. Sales before it are history only (already reflected in the starting count). */
    goLive() {
      let v = api.setting('golive_at');
      if (!v) { v = new Date().toISOString(); api.setSetting('golive_at', v); }
      return v;
    },
    log(task, ok, message) {
      api.run('INSERT INTO sync_log (task, ok, message) VALUES (?, ?, ?)', task, ok ? 1 : 0, String(message).slice(0, 2000));
      api.run('DELETE FROM sync_log WHERE id NOT IN (SELECT id FROM sync_log ORDER BY id DESC LIMIT 500)');
    },
    recordPrice(productId, field, oldV, newV, source) {
      if (Math.abs((oldV || 0) - (newV || 0)) < 0.005) return;
      api.run('INSERT INTO price_history (product_id, field, old_value, new_value, source) VALUES (?, ?, ?, ?, ?)', productId, field, oldV, newV, source);
    },
  };
  return api;
}

module.exports = { openDb, DEFAULT_SETTINGS };
