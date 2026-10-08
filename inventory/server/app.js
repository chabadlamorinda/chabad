// HTTP API + the web app.
'use strict';

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { forecastAll, orderLists, dayKey, addDays, startOfDay } = require('./forecast');
const { codeIndex, normCode } = require('./catalog');
const inv = require('./invoices');
const cg = require('./cloudgrocer');
const { cloverClient, pushPrice } = require('./clover');
const { toCsv, parseCsvObjects } = require('./csv');

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

const PRODUCT_FIELDS = {
  name: 'text', sku: 'text', upc: 'text', category: 'text', subcategory: 'text', brand: 'text', manufacturer: 'text', shelf: 'text',
  size: 'text', unit: 'text', taxable: 'bool', snap: 'bool', sold_by_weight: 'bool', est_weight: 'numornull', est_weight_unit: 'text',
  age_restricted: 'bool', kosher_passover: 'bool', additional_skus: 'text', supplier_id: 'idornull', supplier_sku: 'text',
  case_size: 'int', cost: 'num', price: 'num', target_margin: 'numornull', min_stock: 'int', active: 'bool', notes: 'text',
};
const SUPPLIER_FIELDS = { name: 'text', contact: 'text', email: 'text', phone: 'text', order_days: 'text', lead_time_days: 'int', min_order: 'num', invoice_senders: 'text', notes: 'text' };
const SETTING_KEYS = ['store_name', 'default_margin', 'safety_days', 'review_days', 'price_rounding', 'auto_apply_costs', 'price_alert_pct',
  'push_stock_to_clover', 'push_prices_to_clover', 'web_store_file_prefix', 'web_unattended_mode', 'email_known_senders_only'];

function clean(fields, body, partial = true) {
  const out = {};
  for (const [k, type] of Object.entries(fields)) {
    if (!(k in body)) { if (!partial && type === 'text') out[k] = ''; continue; }
    const v = body[k];
    switch (type) {
      case 'text': out[k] = String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 500); break;
      case 'bool': out[k] = v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0; break;
      case 'int': { const n = Math.round(Number(v)); if (!Number.isFinite(n) || n < 0) throw new HttpError(400, k + ' must be a whole number'); out[k] = n; break; }
      case 'num': { const n = Number(v); if (!Number.isFinite(n) || n < 0) throw new HttpError(400, k + ' must be a number'); out[k] = Math.round(n * 10000) / 10000; break; }
      case 'numornull': { if (v === '' || v == null) { out[k] = null; break; } const n = Number(v); if (!Number.isFinite(n) || n < 0) throw new HttpError(400, k + ' must be a number'); out[k] = n; break; }
      case 'idornull': { if (v === '' || v == null || v === 0 || v === '0') { out[k] = null; break; } const n = Number(v); if (!Number.isInteger(n)) throw new HttpError(400, 'Bad ' + k); out[k] = n; break; }
    }
  }
  if ('target_margin' in out && out.target_margin != null) { if (out.target_margin >= 1) out.target_margin /= 100; if (out.target_margin >= 0.95) throw new HttpError(400, 'Margin must be under 95%'); }
  if ('name' in out && !out.name) throw new HttpError(400, 'Please enter a name');
  return out;
}

/**
 * @param {{db: any, sync: ReturnType<typeof import('./sync').createSync>, password: string, sessionSecret: string, extract?: Function, log?: Pick<Console,'error'>}} o
 */
function createApp({ db, sync, password, sessionSecret, extract, log = console }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    next();
  });
  app.get('/healthz', (req, res) => res.type('text').send('ok'));

  // ---------- login (one shared password) ----------
  const COOKIE = 'bkinv';
  const mac = (s) => crypto.createHmac('sha256', sessionSecret).update(s).digest('base64url');
  const issue = () => { const p = Buffer.from(JSON.stringify({ exp: Date.now() + 30 * 86400000, n: crypto.randomBytes(8).toString('hex') })).toString('base64url'); return p + '.' + mac(p); };
  const valid = (tok) => {
    if (typeof tok !== 'string') return false;
    const [p, m] = tok.split('.');
    if (!p || !m) return false;
    const a = Buffer.from(m), b = Buffer.from(mac(p));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
    try { return JSON.parse(Buffer.from(p, 'base64url').toString()).exp > Date.now(); } catch { return false; }
  };
  const cookieOf = (req) => { const m = /(?:^|;\s*)bkinv=([^;]+)/.exec(req.get('cookie') || ''); return m && decodeURIComponent(m[1]); };
  const fails = new Map();

  const api = express.Router();
  api.use(express.json({ limit: '25mb' }));
  api.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

  api.post('/login', (req, res) => {
    const key = req.ip, f = fails.get(key) || { n: 0, until: 0 };
    if (f.until > Date.now()) return res.status(429).json({ error: 'Too many tries. Please wait a few minutes.' });
    const given = Buffer.from(String((req.body && req.body.password) || '')), want = Buffer.from(password);
    const ok = given.length === want.length && crypto.timingSafeEqual(given, want);
    if (!ok) { f.n++; if (f.n >= 8) { f.until = Date.now() + 10 * 60000; f.n = 0; } fails.set(key, f); return res.status(401).json({ error: 'That password is not right.' }); }
    fails.delete(key);
    res.setHeader('Set-Cookie', `${COOKIE}=${issue()}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${30 * 86400}${req.secure ? '; Secure' : ''}`);
    res.json({ ok: true });
  });
  api.post('/logout', (req, res) => { res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`); res.json({ ok: true }); });

  api.use((req, res, next) => {
    if (!valid(cookieOf(req))) return res.status(401).json({ error: 'Please sign in.' });
    if (req.method !== 'GET' && req.get('x-requested-with') !== 'app') return res.status(403).json({ error: 'Bad request origin.' });
    next();
  });

  const wrap = (fn) => (req, res) => Promise.resolve().then(() => fn(req, res)).then((r) => { if (!res.headersSent) res.json(r === undefined ? { ok: true } : r); })
    .catch((e) => {
      if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
      log.error('api error', req.method, req.path, e);
      res.status(500).json({ error: e.message || 'Something went wrong.' });
    });
  const idParam = (req, name = 'id') => { const n = Number(req.params[name]); if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'Bad id'); return n; };
  const product = (id) => { const p = db.get('SELECT * FROM products WHERE id = ?', id); if (!p) throw new HttpError(404, 'Product not found'); return p; };

  api.get('/me', wrap(() => ({ store: db.setting('store_name'), today: dayKey(new Date()), status: sync.status() })));

  // ---------- dashboard ----------
  api.get('/dashboard', wrap(() => {
    const fc = forecastAll(db);
    const products = db.all('SELECT p.*, s.name AS supplier_name FROM products p LEFT JOIN suppliers s ON s.id = p.supplier_id WHERE p.active = 1');
    let value = 0, retail = 0;
    const counts = { out: 0, urgent: 0, order: 0, idle: 0 };
    const attention = [];
    for (const p of products) {
      value += Math.max(0, p.stock) * (p.cost || 0); retail += Math.max(0, p.stock) * (p.price || 0);
      const f = fc.get(p.id);
      if (!f) continue;
      if (counts[f.status] != null) counts[f.status]++;
      if (f.status === 'out' || f.status === 'urgent') attention.push({ ...slim(p), forecast: f });
    }
    attention.sort((a, b) => (a.forecast.status === 'out' ? 0 : 1) - (b.forecast.status === 'out' ? 0 : 1) || b.forecast.rate - a.forecast.rate);
    const today = startOfDay(new Date());
    const since = addDays(today, -27).toISOString();
    const daily = new Map();
    for (const r of db.all("SELECT at, qty, source, product_id FROM movements WHERE kind = 'sale' AND at >= ?", since)) {
      const k = dayKey(r.at); const d = daily.get(k) || { store: 0, web: 0 }; d[r.source === 'web' ? 'web' : 'store'] += -r.qty; daily.set(k, d);
    }
    const salesByDay = [];
    for (let d = addDays(today, -27); d <= today; d = addDays(d, 1)) { const k = dayKey(d); salesByDay.push({ day: k, ...(daily.get(k) || { store: 0, web: 0 }) }); }
    const top = [...fc.values()].filter((f) => f.sold28 > 0).sort((a, b) => b.sold28 - a.sold28).slice(0, 8)
      .map((f) => ({ ...slim(products.find((p) => p.id === f.product_id) || {}), forecast: f }));
    const lists = orderLists(db);
    return {
      store: db.setting('store_name'),
      today: dayKey(new Date()),
      totals: { products: products.length, value: round2(value), retail: round2(retail), ...counts },
      due: lists.map((g) => ({ supplier: g.supplier, order_day: g.order_day, lines: g.lines.length, total: g.total, urgent: g.urgent })).slice(0, 8),
      attention: attention.slice(0, 12),
      top,
      salesByDay,
      invoicesToReview: db.get("SELECT COUNT(*) AS n FROM invoices WHERE status = 'review'").n,
      pricesToReview: inv.priceReview(db).length,
      openOrders: db.get("SELECT COUNT(*) AS n FROM purchase_orders WHERE status = 'ordered'").n,
      sync: sync.status(),
      activity: db.all('SELECT * FROM sync_log ORDER BY id DESC LIMIT 12'),
    };
  }));

  // ---------- products ----------
  api.get('/products', wrap((req) => {
    const fc = forecastAll(db);
    const q = String(req.query.q || '').trim().toLowerCase();
    const code = q && normCode(q);
    let rows = db.all('SELECT p.*, s.name AS supplier_name FROM products p LEFT JOIN suppliers s ON s.id = p.supplier_id ORDER BY p.name COLLATE NOCASE');
    if (req.query.inactive !== '1') rows = rows.filter((p) => p.active);
    if (q) rows = rows.filter((p) => p.name.toLowerCase().includes(q) || (p.brand || '').toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q)
      || [p.sku, p.upc, p.supplier_sku, ...(p.additional_skus || '').split(/[~,]/)].some((c) => c && normCode(c) === code));
    if (req.query.supplier) rows = rows.filter((p) => String(p.supplier_id || 0) === String(req.query.supplier));
    if (req.query.category) rows = rows.filter((p) => p.category === req.query.category);
    const list = rows.map((p) => ({ ...p, forecast: fc.get(p.id) || null }));
    const st = req.query.status;
    const filtered = st ? list.filter((p) => p.forecast && (st === 'low' ? ['out', 'urgent', 'order'].includes(p.forecast.status) : p.forecast.status === st)) : list;
    return { products: filtered, categories: db.all("SELECT DISTINCT category FROM products WHERE category <> '' ORDER BY category").map((r) => r.category) };
  }));

  api.get('/lookup', wrap((req) => {
    const id = codeIndex(db).get(normCode(req.query.code));
    return { product: id ? product(id) : null };
  }));

  api.get('/products/:id', wrap((req) => {
    const p = product(idParam(req));
    const f = forecastAll(db).get(p.id) || null;
    const today = startOfDay(new Date());
    const daily = new Map();
    for (const r of db.all("SELECT at, qty FROM movements WHERE product_id = ? AND kind IN ('sale','return') AND at >= ?", p.id, addDays(today, -55).toISOString())) {
      const k = dayKey(r.at); daily.set(k, (daily.get(k) || 0) - r.qty);
    }
    const sales = [];
    for (let d = addDays(today, -55); d <= today; d = addDays(d, 1)) sales.push({ day: dayKey(d), qty: Math.max(0, daily.get(dayKey(d)) || 0) });
    return {
      product: p,
      supplier: p.supplier_id ? db.get('SELECT * FROM suppliers WHERE id = ?', p.supplier_id) : null,
      forecast: f,
      sales,
      movements: db.all('SELECT * FROM movements WHERE product_id = ? ORDER BY at DESC, id DESC LIMIT 60', p.id),
      prices: db.all("SELECT * FROM price_history WHERE product_id = ? AND field IN ('cost','price') ORDER BY id DESC LIMIT 30", p.id),
      suggested: inv.suggestPrice(p.cost, p.target_margin != null ? p.target_margin : db.num('default_margin'), db.setting('price_rounding')),
    };
  }));

  api.post('/products', wrap((req) => {
    const f = clean(PRODUCT_FIELDS, req.body || {}, false);
    if (!f.name) throw new HttpError(400, 'Please enter a name');
    const stock = Number(req.body.stock) || 0;
    return db.tx(() => {
      const keys = Object.keys(f);
      const r = db.run(`INSERT INTO products (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`, ...keys.map((k) => f[k]));
      const id = Number(r.lastInsertRowid);
      if (stock) db.move({ product_id: id, qty: stock, kind: 'initial', source: 'manual', note: 'Starting stock' });
      return { id };
    });
  }));

  api.put('/products/:id', wrap(async (req) => {
    const p = product(idParam(req));
    const f = clean(PRODUCT_FIELDS, req.body || {});
    const keys = Object.keys(f);
    if (!keys.length) return { product: p };
    db.tx(() => {
      if ('cost' in f) db.recordPrice(p.id, 'cost', p.cost, f.cost, 'edited');
      if ('price' in f) db.recordPrice(p.id, 'price', p.price, f.price, 'edited');
      db.run(`UPDATE products SET ${keys.map((k) => k + ' = ?').join(', ')}, updated_at = datetime('now') WHERE id = ?`, ...keys.map((k) => f[k]), p.id);
    });
    const after = product(p.id);
    let pushed = null;
    if ('price' in f && Math.abs(f.price - p.price) >= 0.005) pushed = await pushPriceSafe(after);
    return { product: after, pushed };
  }));

  async function pushPriceSafe(p) {
    if (!sync.config.clover || !p.clover_id || db.setting('push_prices_to_clover') !== '1') return null;
    try { await pushPrice(cloverClient({ ...sync.config.clover, fetchImpl: sync.fetchImpl }), p); return 'clover'; }
    catch (e) { db.log('clover_price', false, p.name + ': ' + e.message); return 'failed: ' + e.message; }
  }

  const stockChange = (kind) => wrap((req) => {
    const p = product(idParam(req));
    const qty = Number(req.body && req.body.qty);
    if (!Number.isFinite(qty)) throw new HttpError(400, 'Please enter a number');
    const note = String((req.body && req.body.note) || '').slice(0, 200);
    if (kind === 'count') { if (qty < 0) throw new HttpError(400, 'A count cannot be negative'); db.count(p.id, qty, note); }
    else if (kind === 'receive') { if (qty <= 0) throw new HttpError(400, 'Enter how many came in'); db.move({ product_id: p.id, qty, kind: 'receive', source: 'manual', note: note || 'Received' }); }
    else { if (!qty) throw new HttpError(400, 'Enter how many to add or remove'); db.move({ product_id: p.id, qty, kind: 'adjust', source: 'manual', note: note || (qty < 0 ? 'Removed' : 'Added') }); }
    return { product: product(p.id) };
  });
  api.post('/products/:id/count', stockChange('count'));
  api.post('/products/:id/receive', stockChange('receive'));
  api.post('/products/:id/adjust', stockChange('adjust'));

  // ---------- suppliers ----------
  api.get('/suppliers', wrap(() => ({
    suppliers: db.all(`SELECT s.*, (SELECT COUNT(*) FROM products p WHERE p.supplier_id = s.id AND p.active = 1) AS products,
      (SELECT COUNT(*) FROM purchase_orders o WHERE o.supplier_id = s.id AND o.status = 'ordered') AS open_orders FROM suppliers s ORDER BY s.name COLLATE NOCASE`),
  })));
  api.post('/suppliers', wrap((req) => {
    const f = clean(SUPPLIER_FIELDS, req.body || {}, false);
    if (!f.name) throw new HttpError(400, 'Please enter a name');
    const keys = Object.keys(f);
    return { id: Number(db.run(`INSERT INTO suppliers (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`, ...keys.map((k) => f[k])).lastInsertRowid) };
  }));
  api.put('/suppliers/:id', wrap((req) => {
    const id = idParam(req);
    const f = clean(SUPPLIER_FIELDS, req.body || {});
    const keys = Object.keys(f);
    if (keys.length) db.run(`UPDATE suppliers SET ${keys.map((k) => k + ' = ?').join(', ')} WHERE id = ?`, ...keys.map((k) => f[k]), id);
  }));
  api.delete('/suppliers/:id', wrap((req) => { db.run('DELETE FROM suppliers WHERE id = ?', idParam(req)); }));

  // ---------- order lists & purchase orders ----------
  api.get('/orders', wrap(() => {
    const lists = orderLists(db).map((g) => ({ ...g, lines: g.lines.map((l) => ({ ...l, product: slim(l.product) })) }));
    const open = db.all(`SELECT o.*, s.name AS supplier_name, (SELECT COUNT(*) FROM po_lines l WHERE l.po_id = o.id) AS lines,
      (SELECT SUM(l.qty * l.unit_cost) FROM po_lines l WHERE l.po_id = o.id) AS total FROM purchase_orders o LEFT JOIN suppliers s ON s.id = o.supplier_id
      WHERE o.status = 'ordered' ORDER BY o.created_at`);
    return { lists, open };
  }));
  api.post('/orders', wrap((req) => {
    const supplierId = Number(req.body && req.body.supplier_id) || null;
    const lines = Array.isArray(req.body && req.body.lines) ? req.body.lines : [];
    const good = lines.map((l) => ({ product_id: Number(l.product_id), qty: Number(l.qty) })).filter((l) => Number.isInteger(l.product_id) && l.qty > 0);
    if (!good.length) throw new HttpError(400, 'Nothing to order');
    return db.tx(() => {
      const sup = supplierId ? db.get('SELECT * FROM suppliers WHERE id = ?', supplierId) : null;
      const expected = dayKey(addDays(new Date(), sup ? sup.lead_time_days : 3));
      const id = Number(db.run('INSERT INTO purchase_orders (supplier_id, expected_at) VALUES (?, ?)', supplierId, expected).lastInsertRowid);
      for (const l of good) { const p = product(l.product_id); db.run('INSERT INTO po_lines (po_id, product_id, qty, unit_cost) VALUES (?, ?, ?, ?)', id, p.id, l.qty, p.cost || 0); }
      return { id };
    });
  }));
  api.get('/purchase-orders/:id', wrap((req) => {
    const o = db.get('SELECT o.*, s.name AS supplier_name FROM purchase_orders o LEFT JOIN suppliers s ON s.id = o.supplier_id WHERE o.id = ?', idParam(req));
    if (!o) throw new HttpError(404, 'Order not found');
    return { order: o, lines: db.all('SELECT l.*, p.name, p.upc, p.sku, p.supplier_sku, p.case_size FROM po_lines l JOIN products p ON p.id = l.product_id WHERE l.po_id = ?', o.id) };
  }));
  api.post('/purchase-orders/:id/receive', wrap((req) => {
    const id = idParam(req);
    const o = db.get("SELECT * FROM purchase_orders WHERE id = ? AND status = 'ordered'", id);
    if (!o) throw new HttpError(404, 'Open order not found');
    const got = new Map(((req.body && req.body.lines) || []).map((l) => [Number(l.product_id), Number(l.qty)]));
    db.tx(() => {
      for (const l of db.all('SELECT * FROM po_lines WHERE po_id = ?', id)) {
        const q = got.has(l.product_id) ? got.get(l.product_id) : l.qty;
        if (q > 0) db.move({ product_id: l.product_id, qty: q, kind: 'receive', source: 'manual', ref: 'po' + id + ':' + l.product_id, note: 'Order #' + id + ' received' });
      }
      db.run("UPDATE purchase_orders SET status = 'received', received_at = datetime('now') WHERE id = ?", id);
    });
  }));
  api.post('/purchase-orders/:id/cancel', wrap((req) => { db.run("UPDATE purchase_orders SET status = 'cancelled' WHERE id = ? AND status = 'ordered'", idParam(req)); }));

  // ---------- invoices ----------
  api.get('/invoices', wrap((req) => ({
    invoices: db.all(`SELECT i.*, s.name AS supplier, (SELECT COUNT(*) FROM invoice_lines l WHERE l.invoice_id = i.id) AS lines,
      (SELECT COUNT(*) FROM invoice_lines l WHERE l.invoice_id = i.id AND l.product_id IS NULL) AS unmatched
      FROM invoices i LEFT JOIN suppliers s ON s.id = i.supplier_id ${req.query.status ? 'WHERE i.status = ?' : ''} ORDER BY i.id DESC LIMIT 200`, ...(req.query.status ? [req.query.status] : [])),
    readerReady: !!(extract && sync.config.claude),
    emailReady: !!sync.config.email,
  })));
  api.get('/invoices/:id', wrap((req) => {
    const i = db.get('SELECT i.*, s.name AS supplier FROM invoices i LEFT JOIN suppliers s ON s.id = i.supplier_id WHERE i.id = ?', idParam(req));
    if (!i) throw new HttpError(404, 'Invoice not found');
    return {
      invoice: i,
      lines: inv.landed(db, i.id).map((x) => ({ ...x.line, units: x.units, pack: x.pack, landed_unit_cost: x.unit_cost, shipping_share: x.shipping_share, product: x.product ? slim(x.product) : null, old_cost: x.product ? x.product.cost : null })),
      targets: i.kind === 'shipping_charge' ? db.all("SELECT id, number, date, supplier_name FROM invoices WHERE kind = 'supplier_invoice' ORDER BY id DESC LIMIT 30") : [],
    };
  }));
  api.put('/invoices/:id', wrap((req) => {
    const id = idParam(req);
    const b = req.body || {};
    const f = clean({ supplier_id: 'idornull', number: 'text', date: 'text', shipping: 'num' }, b);
    const keys = Object.keys(f);
    if (keys.length) db.run(`UPDATE invoices SET ${keys.map((k) => k + ' = ?').join(', ')} WHERE id = ? AND status = 'review'`, ...keys.map((k) => f[k]), id);
  }));
  api.put('/invoices/:id/lines/:line', wrap((req) => {
    const id = idParam(req), lineId = idParam(req, 'line');
    const f = clean({ product_id: 'idornull', qty: 'num', uom: 'text', pack_size: 'numornull', line_total: 'num' }, req.body || {});
    if (f.uom && !['each', 'case', 'lb', 'other'].includes(f.uom)) throw new HttpError(400, 'Bad unit');
    if ('product_id' in f) f.match = f.product_id ? 'picked' : '';
    const keys = Object.keys(f);
    if (keys.length) db.run(`UPDATE invoice_lines SET ${keys.map((k) => k + ' = ?').join(', ')} WHERE id = ? AND invoice_id = ?`, ...keys.map((k) => f[k]), lineId, id);
  }));
  api.post('/invoices/:id/apply', wrap((req) => inv.applyInvoice(db, idParam(req), { receive: !(req.body && req.body.receive === false) })));
  api.post('/invoices/:id/ignore', wrap((req) => { db.run("UPDATE invoices SET status = 'ignored' WHERE id = ? AND status = 'review'", idParam(req)); }));
  api.post('/invoices/:id/attach', wrap((req) => {
    const t = inv.attachShipping(db, idParam(req), Number(req.body && req.body.target) || undefined);
    if (!t) throw new HttpError(400, 'No invoice to add this shipping to.');
    return { target: t };
  }));
  api.delete('/invoices/:id', wrap((req) => { db.run("DELETE FROM invoices WHERE id = ? AND status <> 'applied'", idParam(req)); }));
  api.post('/invoices/upload', wrap(async (req) => {
    if (!extract || !sync.config.claude) throw new HttpError(400, 'The invoice reader is not set up yet (ANTHROPIC_API_KEY).');
    const b = req.body || {};
    const pdfs = [], images = [];
    for (const f of (Array.isArray(b.files) ? b.files : []).slice(0, 5)) {
      const data = Buffer.from(String(f.data || ''), 'base64');
      if (!data.length) continue;
      if (f.type === 'application/pdf') pdfs.push(data);
      else if (/^image\/(png|jpeg|gif|webp)$/.test(f.type)) images.push({ type: f.type, data });
      else if (/^text\//.test(f.type)) b.text = (b.text || '') + '\n' + data.toString('utf8');
      else throw new HttpError(400, 'Please upload a PDF, a photo, or a text file.');
    }
    if (!pdfs.length && !images.length && !String(b.text || '').trim()) throw new HttpError(400, 'Add a file or paste the invoice text.');
    const data = await extract({ subject: String(b.subject || 'Uploaded invoice'), from: String(b.from || ''), text: String(b.text || ''), pdfs, images });
    if (data.kind === 'other') return { id: null, message: 'This does not look like a supplier invoice.' };
    return { id: inv.saveInvoice(db, data, { source: 'upload', from: '' }) };
  }));

  // ---------- prices ----------
  api.get('/prices', wrap(() => ({ review: inv.priceReview(db).map((r) => ({ ...r, product: slim(r.product) })), default_margin: db.num('default_margin') })));
  api.post('/prices/:id', wrap(async (req) => {
    const p = product(idParam(req));
    const price = Number(req.body && req.body.price);
    if (!Number.isFinite(price) || price <= 0) throw new HttpError(400, 'Enter a price');
    db.recordPrice(p.id, 'price', p.price, price, 'price review');
    db.run("UPDATE products SET price = ?, updated_at = datetime('now') WHERE id = ?", round2(price), p.id);
    return { pushed: await pushPriceSafe(product(p.id)) };
  }));
  api.post('/prices/:id/dismiss', wrap((req) => {
    const p = product(idParam(req));
    db.run("INSERT INTO price_history (product_id, field, old_value, new_value, source) VALUES (?, 'dismiss', ?, ?, 'kept price')", p.id, p.price, p.cost);
  }));

  // ---------- settings, sync, import/export ----------
  api.get('/settings', wrap(() => ({ settings: db.settings(), status: sync.status() })));
  api.put('/settings', wrap((req) => {
    for (const k of SETTING_KEYS) if (req.body && k in req.body) db.setSetting(k, String(req.body[k]).slice(0, 200));
    return { settings: db.settings() };
  }));
  api.get('/sync', wrap(() => sync.status()));
  api.post('/sync', wrap(async (req) => {
    const t = req.body && req.body.task;
    if (t && sync.tasks[t]) { const r = await sync.tasks[t](); return { result: r, status: sync.status() }; }
    await sync.syncAll();
    return { status: sync.status() };
  }));
  api.get('/activity', wrap(() => ({ log: db.all('SELECT * FROM sync_log ORDER BY id DESC LIMIT 100') })));

  api.get('/export/website.csv', (req, res) => {
    const { csv } = cg.buildExport(db);
    res.setHeader('Content-Disposition', `attachment; filename="${cg.exportFileName(db.setting('web_store_file_prefix'))}"`);
    res.type('text/csv').send(csv);
  });
  api.get('/export/products.csv', (req, res) => {
    const fc = forecastAll(db);
    const rows = [['id', 'name', 'sku', 'upc', 'category', 'brand', 'supplier', 'supplier_sku', 'case_size', 'cost', 'price', 'stock', 'per_week', 'days_left', 'status']];
    for (const p of db.all('SELECT p.*, s.name AS supplier FROM products p LEFT JOIN suppliers s ON s.id = p.supplier_id WHERE p.active = 1 ORDER BY p.name')) {
      const f = fc.get(p.id) || {};
      rows.push([p.id, p.name, p.sku, p.upc, p.category, p.brand, p.supplier || '', p.supplier_sku, p.case_size, p.cost, p.price, p.stock, f.weekly, f.days_cover, f.status]);
    }
    res.setHeader('Content-Disposition', 'attachment; filename="products.csv"');
    res.type('text/csv').send(toCsv(rows));
  });
  api.get('/orders/:sid/csv', (req, res) => {
    const g = orderLists(db).find((x) => String(x.supplier.id) === String(req.params.sid));
    const rows = [['Item code', 'Barcode', 'Product', 'Cases', 'Units', 'Est. cost']];
    for (const l of (g && g.lines) || []) rows.push([l.product.supplier_sku, l.product.upc, l.product.name, l.cases, l.qty, l.est_cost]);
    res.setHeader('Content-Disposition', `attachment; filename="order-${String((g && g.supplier.name) || 'supplier').replace(/[^A-Za-z0-9]+/g, '-')}.csv"`);
    res.type('text/csv').send(toCsv(rows));
  });

  // Bulk add/update products from a spreadsheet (CSV). Matches by barcode / SKU.
  api.post('/import/products', wrap((req) => {
    const rows = parseCsvObjects(String((req.body && req.body.csv) || ''));
    if (!rows.length) throw new HttpError(400, 'The file is empty.');
    const pick = (r, ...names) => { for (const n of names) if (r[n] != null && r[n] !== '') return r[n]; return ''; };
    const supplierByName = new Map(db.all('SELECT id, name FROM suppliers').map((s) => [s.name.toLowerCase(), s.id]));
    let created = 0, updated = 0;
    db.tx(() => {
      const idx = codeIndex(db);
      for (const r of rows) {
        const name = pick(r, 'name', 'description', 'itemdescription', 'product', 'item');
        const upc = pick(r, 'upc', 'barcode'), sku = pick(r, 'sku', 'code', 'item code');
        const supName = pick(r, 'supplier', 'vendor');
        let supplier_id = null;
        if (supName) { supplier_id = supplierByName.get(supName.toLowerCase()) || null; if (!supplier_id) { supplier_id = Number(db.run('INSERT INTO suppliers (name) VALUES (?)', supName).lastInsertRowid); supplierByName.set(supName.toLowerCase(), supplier_id); } }
        const body = {};
        const set = (k, v) => { if (v !== '' && v != null) body[k] = v; };
        set('name', name); set('upc', upc); set('sku', sku); set('category', pick(r, 'category')); set('subcategory', pick(r, 'subcategory'));
        set('brand', pick(r, 'brand')); set('supplier_sku', pick(r, 'supplier_sku', 'supplier sku', 'vendor code', 'item #'));
        set('case_size', pick(r, 'case_size', 'case size', 'case', 'pack')); set('cost', String(pick(r, 'cost', 'unit cost')).replace(/[$,]/g, ''));
        set('price', String(pick(r, 'price', 'retail', 'regularprice')).replace(/[$,]/g, '')); set('min_stock', pick(r, 'min_stock', 'min', 'minimum'));
        set('size', pick(r, 'size')); set('unit', pick(r, 'unit'));
        if (supplier_id) body.supplier_id = supplier_id;
        const f = clean(PRODUCT_FIELDS, body);
        const id = (upc && idx.get(normCode(upc))) || (sku && idx.get(normCode(sku)));
        const stock = pick(r, 'stock', 'on hand', 'onhand', 'qty', 'quantity');
        if (id) {
          const keys = Object.keys(f);
          if (keys.length) db.run(`UPDATE products SET ${keys.map((k) => k + ' = ?').join(', ')}, updated_at = datetime('now') WHERE id = ?`, ...keys.map((k) => f[k]), id);
          if (stock !== '') db.count(id, Number(stock), 'Imported count');
          updated++;
        } else {
          if (!f.name) continue;
          const keys = Object.keys(f);
          const nid = Number(db.run(`INSERT INTO products (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`, ...keys.map((k) => f[k])).lastInsertRowid);
          if (stock !== '' && Number(stock)) db.move({ product_id: nid, qty: Number(stock), kind: 'initial', source: 'manual', note: 'Imported' });
          for (const c of [upc, sku]) if (c) idx.set(normCode(c), nid);
          created++;
        }
      }
    });
    return { created, updated };
  }));

  api.post('/demo', wrap(() => {
    if (db.get('SELECT 1 FROM products LIMIT 1')) throw new HttpError(400, 'Demo data can only be loaded into an empty system.');
    require('./demo').loadDemo(db);
  }));

  api.use((req, res) => res.status(404).json({ error: 'Not found' }));
  app.use('/api', api);

  const pub = path.join(__dirname, '..', 'public');
  app.use(express.static(pub, { index: false, maxAge: 0, etag: true }));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(pub, 'index.html')));
  return app;
}

function slim(p) {
  return { id: p.id, name: p.name, sku: p.sku, upc: p.upc, category: p.category, brand: p.brand, supplier_id: p.supplier_id, supplier_name: p.supplier_name, supplier_sku: p.supplier_sku, case_size: p.case_size, cost: p.cost, price: p.price, stock: p.stock, min_stock: p.min_stock, sold_by_weight: p.sold_by_weight, unit: p.unit, target_margin: p.target_margin };
}
const round2 = (n) => Math.round(n * 100) / 100;

module.exports = { createApp };
