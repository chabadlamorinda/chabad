// Postgres schema and tiny query helpers. Money is integer cents; weights/quantities are numeric.
'use strict';
const { Pool } = require('pg');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS suppliers (
  id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, markup_pct NUMERIC NOT NULL DEFAULT 30,
  contact TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, parent_id INT REFERENCES categories(id),
  sort INT NOT NULL DEFAULT 0, image_url TEXT NOT NULL DEFAULT '', taxable_default BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY, upc TEXT, sku TEXT NOT NULL DEFAULT '', name TEXT NOT NULL, brand TEXT NOT NULL DEFAULT '',
  size TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', ingredients TEXT NOT NULL DEFAULT '',
  nutrition JSONB NOT NULL DEFAULT '{}'::jsonb, image_url TEXT NOT NULL DEFAULT '', kosher_cert TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '', category_id INT REFERENCES categories(id), supplier_id INT REFERENCES suppliers(id),
  sold_by TEXT NOT NULL DEFAULT 'each' CHECK (sold_by IN ('each','lb')),
  price_cents INT NOT NULL DEFAULT 0, cost_cents NUMERIC NOT NULL DEFAULT 0, price_locked BOOLEAN NOT NULL DEFAULT FALSE,
  taxable BOOLEAN NOT NULL DEFAULT FALSE, stock NUMERIC NOT NULL DEFAULT 0, low_stock_at NUMERIC NOT NULL DEFAULT 3,
  track_stock BOOLEAN NOT NULL DEFAULT TRUE, active BOOLEAN NOT NULL DEFAULT TRUE, clover_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS products_upc_idx ON products (upc) WHERE upc IS NOT NULL AND upc <> '';
CREATE UNIQUE INDEX IF NOT EXISTS products_clover_idx ON products (clover_id) WHERE clover_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS products_cat_idx ON products (category_id);
CREATE TABLE IF NOT EXISTS sales (
  id SERIAL PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('percent','margin','price')),
  value NUMERIC NOT NULL, scope_type TEXT NOT NULL CHECK (scope_type IN ('all','category','supplier','brand','product')),
  scope_value TEXT NOT NULL DEFAULT '', starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ,
  allow_below_cost BOOLEAN NOT NULL DEFAULT FALSE, active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS invoices (
  id SERIAL PRIMARY KEY, supplier_id INT REFERENCES suppliers(id), invoice_no TEXT NOT NULL DEFAULT '',
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE, shipping_cents INT NOT NULL DEFAULT 0, notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS invoice_lines (
  id SERIAL PRIMARY KEY, invoice_id INT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE, product_id INT REFERENCES products(id),
  upc TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', qty NUMERIC NOT NULL, unit_cost_cents INT NOT NULL,
  landed_cost_cents NUMERIC NOT NULL
);
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
  stripe_customer_id TEXT, sms_ok BOOLEAN NOT NULL DEFAULT FALSE, email_ok BOOLEAN NOT NULL DEFAULT TRUE,
  default_sub_pref TEXT NOT NULL DEFAULT 'substitute', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS login_codes (email TEXT NOT NULL, code TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, tries INT NOT NULL DEFAULT 0, PRIMARY KEY (email));
CREATE TABLE IF NOT EXISTS carts (
  id TEXT PRIMARY KEY, customer_id INT REFERENCES customers(id), email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
  sms_ok BOOLEAN NOT NULL DEFAULT FALSE, items JSONB NOT NULL DEFAULT '[]'::jsonb, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reminders_sent INT NOT NULL DEFAULT 0, last_reminded_at TIMESTAMPTZ, completed BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE IF NOT EXISTS coop_drops (
  id SERIAL PRIMARY KEY, label TEXT NOT NULL, location TEXT NOT NULL, address TEXT NOT NULL DEFAULT '',
  drop_date DATE NOT NULL, window_text TEXT NOT NULL DEFAULT '', cutoff_at TIMESTAMPTZ, active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY, public_token TEXT NOT NULL UNIQUE, customer_id INT NOT NULL REFERENCES customers(id),
  status TEXT NOT NULL DEFAULT 'pending_payment' CHECK (status IN ('pending_payment','placed','picking','ready','out_for_delivery','completed','cancelled')),
  fulfillment TEXT NOT NULL CHECK (fulfillment IN ('pickup','uber','coop')),
  slot_start TIMESTAMPTZ, slot_end TIMESTAMPTZ, address JSONB, coop_drop_id INT REFERENCES coop_drops(id),
  sub_pref TEXT NOT NULL DEFAULT 'substitute' CHECK (sub_pref IN ('substitute','call_sub','call_no_sub','never')),
  note TEXT NOT NULL DEFAULT '', est_subtotal_cents INT NOT NULL DEFAULT 0, est_tax_cents INT NOT NULL DEFAULT 0,
  delivery_fee_cents INT NOT NULL DEFAULT 0, auth_cents INT NOT NULL DEFAULT 0, final_subtotal_cents INT, final_tax_cents INT,
  final_total_cents INT, captured_cents INT, extra_charge_id TEXT, unpaid_cents INT NOT NULL DEFAULT 0, payment_intent_id TEXT, uber_delivery_id TEXT, uber_tracking_url TEXT,
  picker TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), picking_started_at TIMESTAMPTZ, ready_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders (status, slot_start);
CREATE INDEX IF NOT EXISTS orders_customer_idx ON orders (customer_id);
CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY, order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE, product_id INT REFERENCES products(id),
  name TEXT NOT NULL, upc TEXT NOT NULL DEFAULT '', image_url TEXT NOT NULL DEFAULT '', sold_by TEXT NOT NULL DEFAULT 'each',
  taxable BOOLEAN NOT NULL DEFAULT FALSE, unit_price_cents INT NOT NULL, qty NUMERIC NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','picked','substituted','out_of_stock')),
  final_qty NUMERIC, final_unit_price_cents INT, line_total_cents INT,
  sub_product_id INT REFERENCES products(id), sub_name TEXT NOT NULL DEFAULT '', is_extra BOOLEAN NOT NULL DEFAULT FALSE,
  picked_note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items (order_id);
CREATE INDEX IF NOT EXISTS order_items_product_idx ON order_items (product_id);
CREATE TABLE IF NOT EXISTS subscribers (id SERIAL PRIMARY KEY, email TEXT NOT NULL UNIQUE, token TEXT NOT NULL UNIQUE, subscribed BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS campaigns (id SERIAL PRIMARY KEY, subject TEXT NOT NULL, html TEXT NOT NULL, sent_at TIMESTAMPTZ, sent_count INT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS notify_log (id SERIAL PRIMARY KEY, channel TEXT NOT NULL, recipient TEXT NOT NULL, subject TEXT NOT NULL DEFAULT '', body TEXT NOT NULL, ok BOOLEAN NOT NULL DEFAULT TRUE, error TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS stock_events (id BIGSERIAL PRIMARY KEY, product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE, delta NUMERIC NOT NULL, reason TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS stock_events_idx ON stock_events (product_id, created_at);
CREATE TABLE IF NOT EXISTS sync_log (id SERIAL PRIMARY KEY, kind TEXT NOT NULL, summary JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
`;

function createDb(url, opts = {}) {
  const ssl = /sslmode=require/.test(url) || process.env.DATABASE_SSL === '1' ? { rejectUnauthorized: false } : undefined;
  const pool = new Pool({ connectionString: url, max: 8, ssl, ...opts });
  const q = (text, params) => pool.query(text, params);
  const rows = async (text, params) => (await q(text, params)).rows;
  const one = async (text, params) => (await q(text, params)).rows[0] || null;
  async function tx(fn) {
    const c = await pool.connect();
    const cq = (text, params) => c.query(text, params);
    const api = { q: cq, rows: async (t, p) => (await cq(t, p)).rows, one: async (t, p) => (await cq(t, p)).rows[0] || null };
    try { await cq('BEGIN'); const r = await fn(api); await cq('COMMIT'); return r; }
    catch (e) { try { await cq('ROLLBACK'); } catch {} throw e; }
    finally { c.release(); }
  }
  return { pool, q, rows, one, tx, migrate: () => q(SCHEMA), close: () => pool.end() };
}

module.exports = { createDb, SCHEMA };
