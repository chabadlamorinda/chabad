// Back-office endpoints added after reviewing the current MyKosherGrocer screens:
// order manager (filters, totals, CSV, payment actions, history), items-to-pick report, customers, coupons,
// staff accounts, banners, product import, activity log, stock reports, pickup-point manifests.
'use strict';
const { parseCsv } = require('./backoffice');
const { xlsxToCsv } = require('./spreadsheet');
const { guessDepartment, CLOVER_CATEGORY } = require('./classify');
const { localToDate, localParts, money } = require('./core');
const pricing = require('./pricing');

const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const toCsv = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\n');

function mount(A, { db, core, settings, back, auth, J, num, httpErr, who, notifier, env, mirror, purchasing, pollInboxNow }) {
  const JBIG = require('express').json({ limit: '25mb' }); // invoice scans can be large
  // ---- time period helper: today | yesterday | tomorrow | week | month | all | YYYY-MM-DD..YYYY-MM-DD (store local time) ----
  async function period(p) {
    const s = await settings.all(), tz = s.store.timezone, now = new Date();
    const day = (offset) => { const lp = localParts(new Date(now.getTime() + offset * 86400000), tz); return localToDate(lp.y, lp.m, lp.d, 0, 0, tz); };
    switch (p) {
      case 'today': return [day(0), day(1)];
      case 'tomorrow': return [day(1), day(2)];
      case 'yesterday': return [day(-1), day(0)];
      case 'week': return [day(-6), day(1)];
      case 'upcoming': return [day(0), day(60)];
      case 'month': return [day(-29), day(1)];
      default: {
        const m = String(p || '').match(/^(\d{4})-(\d\d)-(\d\d)(?:\.\.(\d{4})-(\d\d)-(\d\d))?$/);
        if (!m) return [null, null];
        const a = localToDate(+m[1], +m[2], +m[3], 0, 0, tz), b = m[4] ? localToDate(+m[4], +m[5], +m[6], 0, 0, tz) : a;
        return [a, new Date(b.getTime() + 86400000)];
      }
    }
  }
  // the day an order is for (pickup/delivery slot, else the day it was placed)
  const WHEN = 'COALESCE(o.slot_start, o.created_at)';

  // ---------- Order manager ----------
  async function orderList(q) {
    const [from, to] = await period(q.period || 'today');
    const where = [`o.status <> 'pending_payment'`], params = [];
    if (from) { params.push(from, to); where.push(`${WHEN} >= $${params.length - 1} AND ${WHEN} < $${params.length}`); }
    if (q.q) { params.push('%' + String(q.q).toLowerCase() + '%'); where.push(`(o.id::text = btrim(${'$' + params.length}, '%') OR lower(c.name) LIKE $${params.length} OR lower(c.email) LIKE $${params.length} OR c.phone LIKE $${params.length})`); }
    if (q.fulfillment) { params.push(q.fulfillment); where.push(`o.fulfillment = $${params.length}`); }
    if (q.coop) { params.push(Number(q.coop)); where.push(`o.coop_drop_id = $${params.length}`); }
    const base = where.join(' AND ');
    const rows = await db.rows(`SELECT o.id, o.status, o.fulfillment, o.slot_start, o.slot_end, o.created_at, o.est_subtotal_cents, o.est_tax_cents, o.delivery_fee_cents, o.discount_cents, o.final_total_cents, o.captured_cents, o.unpaid_cents, o.auth_cents,
        o.picker, o.boxes, o.sub_pref, cd.label AS coop_label, c.name AS customer_name, c.email AS customer_email, c.phone AS customer_phone,
        (SELECT count(*)::int FROM order_items WHERE order_id = o.id) AS lines
      FROM orders o JOIN customers c ON c.id = o.customer_id LEFT JOIN coop_drops cd ON cd.id = o.coop_drop_id WHERE ${base} ORDER BY ${WHEN} DESC, o.id DESC LIMIT 500`, params);
    const counts = {};
    for (const r of rows) counts[r.status] = (counts[r.status] || 0) + 1;
    const ordered = rows.filter((r) => r.status !== 'cancelled').reduce((a, r) => a + (r.final_total_cents ?? r.est_subtotal_cents - r.discount_cents + r.est_tax_cents + r.delivery_fee_cents), 0);
    const processed = rows.reduce((a, r) => a + (r.captured_cents || 0), 0);
    return { orders: rows.filter((r) => !q.status || r.status === q.status), counts, total: rows.length, ordered_cents: ordered, processed_cents: processed };
  }
  A.get('/orders', async (req, res) => {
    const r = await orderList(req.query);
    if (req.query.format === 'csv') {
      res.type('text/csv').set('Content-Disposition', 'attachment; filename="orders.csv"');
      return res.send(toCsv([['Order', 'Status', 'Type', 'When', 'Customer', 'Email', 'Phone', 'Lines', 'Ordered', 'Charged', 'Boxes', 'Shopper'], ...r.orders.map((o) => [o.id, o.status, o.fulfillment + (o.coop_label ? ' ' + o.coop_label : ''), o.slot_start ? new Date(o.slot_start).toISOString() : '', o.customer_name, o.customer_email, o.customer_phone, o.lines, ((o.final_total_cents ?? o.est_subtotal_cents) / 100).toFixed(2), o.captured_cents != null ? (o.captured_cents / 100).toFixed(2) : '', o.boxes, o.picker]) ]));
    }
    res.json(r);
  });
  A.get('/orders/:id', async (req, res) => {
    const o = await core.orderWithItems(num(req.params.id, 0));
    if (!o) throw httpErr(404, 'Not found');
    const events = await db.rows('SELECT actor, kind, detail, created_at FROM order_events WHERE order_id=$1 ORDER BY id', [o.id]);
    res.json({ ...o, receipt: core.receipt(o), events });
  });
  A.post('/orders/:id/resend', J, async (req, res) => { await core.logEvent(num(req.params.id, 0), who(req), 'resend', 'Confirmation re-sent'); const o = await core.orderWithItems(num(req.params.id, 0)); if (!o) throw httpErr(404, 'Not found'); if (['ready', 'out_for_delivery', 'completed', 'cancelled'].includes(o.status)) await core.notifyReady(o.id); else await notifier().email(o.customer_email, `Bay Kosher order #${o.id}`, `<p>Order #${o.id} received.</p>`); res.json({ ok: true }); });
  A.post('/orders/:id/payment', J, async (req, res) => {
    if (!['release', 'capture'].includes(req.body.action)) throw httpErr(400, 'Unknown action');
    res.json(await core.paymentAction(num(req.params.id, 0), req.body.action, req.body.amount_cents, who(req)));
  });
  A.post('/orders/:id/boxes', J, async (req, res) => { await db.q('UPDATE orders SET boxes=$2 WHERE id=$1', [num(req.params.id, 0), Math.max(0, Math.min(99, parseInt(req.body.boxes, 10) || 0))]); res.json({ ok: true }); });

  // ---------- Items to pick, totalled across orders (what the butchers / department heads need) ----------
  A.get('/order-items', async (req, res) => {
    const [from, to] = await period(req.query.period || 'today');
    const where = [`o.status IN ('placed','picking')`], params = [];
    if (req.query.status === 'all') where[0] = `o.status NOT IN ('pending_payment','cancelled')`;
    if (from) { params.push(from, to); where.push(`${WHEN} >= $${params.length - 1} AND ${WHEN} < $${params.length}`); }
    if (req.query.dept) { params.push(Number(req.query.dept)); where.push(`p.category_id = $${params.length}`); }
    if (req.query.fulfillment) { params.push(req.query.fulfillment); where.push(`o.fulfillment = $${params.length}`); }
    if (req.query.q) { params.push('%' + String(req.query.q).toLowerCase() + '%'); where.push(`(lower(oi.name) LIKE $${params.length} OR oi.upc LIKE $${params.length})`); }
    const rows = await db.rows(`SELECT oi.product_id, max(oi.name) AS name, max(oi.image_url) AS image_url, max(oi.upc) AS upc, max(c.name) AS category, max(oi.sold_by) AS sold_by, max(oi.est_weight_lb) AS est_weight_lb,
        sum(oi.qty) AS qty, sum(CASE WHEN oi.state <> 'pending' THEN 1 ELSE 0 END)::int AS lines_done, count(*)::int AS lines, count(DISTINCT oi.order_id)::int AS orders,
        sum(CASE WHEN oi.state = 'out_of_stock' THEN 1 ELSE 0 END)::int AS not_available,
        sum(round(oi.unit_price_cents * oi.qty * COALESCE(oi.est_weight_lb, 1)))::int AS est_cents
      FROM order_items oi JOIN orders o ON o.id = oi.order_id LEFT JOIN products p ON p.id = oi.product_id LEFT JOIN categories c ON c.id = p.category_id
      WHERE ${where.join(' AND ')} GROUP BY oi.product_id, oi.name ORDER BY sum(oi.qty) DESC, max(oi.name) LIMIT 1000`, params);
    if (req.query.format === 'csv') { res.type('text/csv').set('Content-Disposition', 'attachment; filename="items-to-pick.csv"'); return res.send(toCsv([['Item', 'SKU', 'Department', 'Qty', 'Est. weight (lb)', 'Orders', 'Done', 'Est. $'], ...rows.map((r) => [r.name, r.upc, r.category, Number(r.qty), r.est_weight_lb ? (Number(r.qty) * Number(r.est_weight_lb)).toFixed(2) : '', r.orders, `${r.lines_done}/${r.lines}`, (r.est_cents / 100).toFixed(2)])])); }
    res.json({ rows: rows.map((r) => ({ ...r, qty: Number(r.qty), est_weight_lb: r.est_weight_lb ? Number(r.est_weight_lb) : null })), total_cents: rows.reduce((a, r) => a + r.est_cents, 0) });
  });

  // ---------- Customers ----------
  A.get('/customers', async (req, res) => {
    const where = ['TRUE'], params = [];
    if (req.query.q) { params.push('%' + String(req.query.q).toLowerCase() + '%'); where.push(`(lower(c.name) LIKE $${params.length} OR lower(c.email) LIKE $${params.length} OR c.phone LIKE $${params.length})`); }
    if (req.query.cart === 'open') where.push(`EXISTS (SELECT 1 FROM carts k WHERE k.customer_id = c.id AND NOT k.completed AND jsonb_array_length(k.items) > 0 AND k.updated_at > now() - interval '7 days')`);
    if (req.query.last) { params.push(Number(req.query.last)); where.push(`COALESCE((SELECT max(created_at) FROM orders WHERE customer_id=c.id AND status NOT IN ('pending_payment','cancelled')), 'epoch') < now() - ($${params.length} || ' days')::interval`); }
    const lim = Math.min(num(req.query.limit, 50), 1000), off = num(req.query.offset, 0); params.push(lim, off);
    const sort = { spent: 'spent DESC', orders: 'orders DESC', last: 'last_order DESC NULLS LAST', name: 'c.name' }[req.query.sort] || 'last_order DESC NULLS LAST';
    const rows = await db.rows(`SELECT c.id, c.name, c.email, c.phone, c.sms_ok, c.email_ok, c.lang, c.address, c.created_at, count(*) OVER() AS total,
        (SELECT count(*)::int FROM orders o WHERE o.customer_id = c.id AND o.status NOT IN ('pending_payment','cancelled')) AS orders,
        (SELECT COALESCE(sum(captured_cents),0)::int FROM orders o WHERE o.customer_id = c.id) AS spent,
        (SELECT max(created_at) FROM orders o WHERE o.customer_id = c.id AND o.status NOT IN ('pending_payment','cancelled')) AS last_order,
        (SELECT max(updated_at) FROM carts k WHERE k.customer_id = c.id) AS cart_activity
      FROM customers c WHERE ${where.join(' AND ')} ORDER BY ${sort} LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    if (req.query.format === 'csv') { res.type('text/csv').set('Content-Disposition', 'attachment; filename="customers.csv"'); return res.send(toCsv([['Name', 'Email', 'Phone', 'Address', 'Orders', 'Spent', 'Last order', 'Texts OK', 'Emails OK', 'Language'], ...rows.map((r) => [r.name, r.email, r.phone, r.address ? `${r.address.street} ${r.address.city} ${r.address.zip}` : '', r.orders, (r.spent / 100).toFixed(2), r.last_order ? new Date(r.last_order).toISOString().slice(0, 10) : '', r.sms_ok, r.email_ok, r.lang])])); }
    res.json({ total: rows[0] ? Number(rows[0].total) : 0, items: rows.map(({ total, ...r }) => r) });
  });
  A.get('/customers/:id', async (req, res) => {
    const c = await db.one('SELECT * FROM customers WHERE id=$1', [num(req.params.id, 0)]);
    if (!c) throw httpErr(404, 'Not found');
    res.json({ ...c, orders: await db.rows(`SELECT id, status, fulfillment, created_at, COALESCE(captured_cents, est_subtotal_cents) AS total_cents FROM orders WHERE customer_id=$1 AND status <> 'pending_payment' ORDER BY id DESC LIMIT 50`, [c.id]) });
  });

  // ---------- Coupons ----------
  const couponBody = (b) => {
    if (!b.code || !String(b.code).trim()) throw httpErr(400, 'Coupon needs a code');
    const pct = b.kind === 'amount' ? null : Number(b.value), amt = b.kind === 'amount' ? Math.round(Number(b.value) * 100) : null;
    if (b.kind !== 'amount' && !(pct > 0 && pct < 100)) throw httpErr(400, 'Percent must be between 0 and 100');
    if (b.kind === 'amount' && !(amt > 0)) throw httpErr(400, 'Amount must be more than $0');
    return [String(b.code).trim().toUpperCase(), b.name || '', pct, amt, b.order_number ? Number(b.order_number) : null, Math.round(Number(b.min_subtotal || 0) * 100), b.starts_at || null, b.ends_at || null, b.active !== false];
  };
  A.get('/coupons', async (req, res) => res.json(await db.rows(`SELECT c.*, (SELECT count(*)::int FROM orders o WHERE upper(o.coupon_code) = upper(c.code) AND o.status NOT IN ('cancelled','pending_payment')) AS uses FROM coupons c ORDER BY active DESC, id DESC`)));
  A.post('/coupons', J, async (req, res) => { try { res.json(await db.one('INSERT INTO coupons (code, name, percent, amount_cents, order_number, min_subtotal_cents, starts_at, ends_at, active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *', couponBody(req.body))); } catch (e) { if (e.code === '23505') throw httpErr(409, 'That code already exists'); throw e; } });
  A.put('/coupons/:id', J, async (req, res) => res.json(await db.one('UPDATE coupons SET code=$2, name=$3, percent=$4, amount_cents=$5, order_number=$6, min_subtotal_cents=$7, starts_at=$8, ends_at=$9, active=$10 WHERE id=$1 RETURNING *', [num(req.params.id, 0), ...couponBody(req.body)])));
  A.delete('/coupons/:id', async (req, res) => { await db.q('DELETE FROM coupons WHERE id=$1', [num(req.params.id, 0)]); res.json({ ok: true }); });

  // ---------- Staff ----------
  const needOwner = (req) => { if (!req.staff || !['admin', 'manager'].includes(req.staff.role)) throw httpErr(403, 'Your role cannot do this'); };
  A.get('/staff', async (req, res) => { needOwner(req); res.json(await db.rows('SELECT id, name, email, role, active, created_at FROM staff ORDER BY active DESC, name')); });
  const pinFree = async (pin, exceptId) => { for (const st of await db.rows('SELECT id, pin_hash FROM staff WHERE active')) if (st.id !== exceptId && auth.verifyPin(String(pin), st.pin_hash)) return false; return true; };
  A.post('/staff', J, async (req, res) => {
    needOwner(req);
    const { name, email, role, pin } = req.body;
    if (!name || !['manager', 'data_entry', 'shopper', 'cashier'].includes(role)) throw httpErr(400, 'Name and role are required');
    if (!/^\d{4,8}$/.test(String(pin || ''))) throw httpErr(400, 'PIN must be 4 to 8 digits');
    if (!(await pinFree(pin))) throw httpErr(409, 'That PIN is already used by someone else');
    res.json(await db.one('INSERT INTO staff (name, email, role, pin_hash) VALUES ($1,$2,$3,$4) RETURNING id, name, email, role, active', [name, email || '', role, auth.hashPin(pin)]));
  });
  A.put('/staff/:id', J, async (req, res) => {
    needOwner(req);
    const id = num(req.params.id, 0), { name, email, role, active, pin } = req.body;
    if (pin) { if (!/^\d{4,8}$/.test(String(pin))) throw httpErr(400, 'PIN must be 4 to 8 digits'); if (!(await pinFree(pin, id))) throw httpErr(409, 'That PIN is already used by someone else'); await db.q('UPDATE staff SET pin_hash=$2 WHERE id=$1', [id, auth.hashPin(pin)]); }
    res.json(await db.one('UPDATE staff SET name=COALESCE($2,name), email=COALESCE($3,email), role=COALESCE($4,role), active=COALESCE($5,active) WHERE id=$1 RETURNING id, name, email, role, active', [id, name ?? null, email ?? null, ['manager', 'data_entry', 'shopper', 'cashier'].includes(role) ? role : null, active ?? null]));
  });

  // ---------- Banners ----------
  A.get('/banners', async (req, res) => res.json(await db.rows('SELECT * FROM banners ORDER BY active DESC, sort, id')));
  const bannerVals = (b) => { if (!b.image_url) throw httpErr(400, 'Banner needs an image link'); return [b.image_url, b.link || '', b.alt || '', b.alt_he || '', ['all', 'desktop', 'mobile'].includes(b.device) ? b.device : 'all', Number(b.sort) || 0, b.starts_at || null, b.ends_at || null, b.active !== false]; };
  A.post('/banners', J, async (req, res) => res.json(await db.one('INSERT INTO banners (image_url, link, alt, alt_he, device, sort, starts_at, ends_at, active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *', bannerVals(req.body))));
  A.put('/banners/:id', J, async (req, res) => res.json(await db.one('UPDATE banners SET image_url=$2, link=$3, alt=$4, alt_he=$5, device=$6, sort=$7, starts_at=$8, ends_at=$9, active=$10 WHERE id=$1 RETURNING *', [num(req.params.id, 0), ...bannerVals(req.body)])));
  A.delete('/banners/:id', async (req, res) => { await db.q('DELETE FROM banners WHERE id=$1', [num(req.params.id, 0)]); res.json({ ok: true }); });

  // ---------- Activity log ----------
  A.get('/activity', async (req, res) => res.json(await db.rows('SELECT id, actor, action, detail, created_at FROM activity_log ORDER BY id DESC LIMIT $1', [Math.min(num(req.query.limit, 200), 1000)])));

  // ---------- Stock reports from the packers ----------
  A.get('/stock-reports', async (req, res) => res.json(await db.rows(`SELECT r.id, r.order_id, r.reported_by, r.reported_at, r.resolved_at, p.id AS product_id, p.name, p.upc, p.image_url, p.stock, c.name AS category
    FROM stock_reports r JOIN products p ON p.id = r.product_id LEFT JOIN categories c ON c.id = p.category_id
    WHERE ($1::boolean OR r.resolved_at IS NULL) AND r.reported_at > now() - interval '30 days' ORDER BY r.reported_at DESC LIMIT 300`, [req.query.all === '1'])));
  A.post('/stock-reports/:id/resolve', J, async (req, res) => {
    const r = await db.one('UPDATE stock_reports SET resolved_at = now() WHERE id=$1 RETURNING product_id', [num(req.params.id, 0)]);
    if (!r) throw httpErr(404, 'Not found');
    if (req.body.stock != null && Number(req.body.stock) >= 0) { await db.q('UPDATE products SET stock=$2, updated_at=now() WHERE id=$1', [r.product_id, Number(req.body.stock)]); core.dirty(); }
    res.json({ ok: true });
  });

  // ---------- Pickup points: who is going where ----------
  A.get('/coop/:id/manifest', async (req, res) => {
    const d = await db.one('SELECT * FROM coop_drops WHERE id=$1', [num(req.params.id, 0)]);
    if (!d) throw httpErr(404, 'Not found');
    const orders = await db.rows(`SELECT o.id, o.status, o.boxes, c.name, c.phone, (SELECT count(*)::int FROM order_items WHERE order_id=o.id) lines, COALESCE(o.captured_cents, o.est_subtotal_cents) AS total_cents
      FROM orders o JOIN customers c ON c.id=o.customer_id WHERE o.coop_drop_id=$1 AND o.status NOT IN ('pending_payment','cancelled') ORDER BY c.name`, [d.id]);
    res.json({ drop: d, orders, boxes: orders.reduce((a, o) => a + o.boxes, 0) });
  });

  // ---------- Bulk edit (department, supplier, visibility, sold-by, tax, lock, featured, markup-based reprice) ----------
  A.post('/products/bulk', J, async (req, res) => {
    const ids = (req.body.ids || []).map(Number).filter(Boolean), set = req.body.set || {};
    const allowed = ['active', 'category_id', 'supplier_id', 'sold_by', 'taxable', 'price_locked', 'featured', 'track_stock', 'kosher_type', 'passover', 'snap', 'holidays'];
    const patch = Object.fromEntries(Object.entries(set).filter(([k]) => allowed.includes(k)));
    let n = 0;
    for (const id of ids) {
      const one = { ...patch };
      if (req.body.add_holiday) { const cur = (await db.one('SELECT holidays FROM products WHERE id=$1', [id])) || { holidays: '' }; one.holidays = [...new Set([...cur.holidays.split(',').filter(Boolean), ...String(req.body.add_holiday).split(',')])].join(','); }
      await back.saveProduct(id, one); n++;
    }
    if (req.body.price_percent) { // e.g. +5 raises prices 5%
      const pct = Number(req.body.price_percent);
      if (!(pct > -90 && pct < 500)) throw httpErr(400, 'Percent out of range');
      for (const p of await db.rows('SELECT id, price_cents FROM products WHERE id = ANY($1) AND NOT price_locked', [ids])) await db.q('UPDATE products SET price_cents=$2, updated_at=now() WHERE id=$1', [p.id, pricing.charm(p.price_cents * (1 + pct / 100))]);
      core.dirty();
    }
    res.json({ updated: n });
  });

  // ---------- Invoices in: upload / email / review / apply ----------
  A.post('/invoices/upload', JBIG, async (req, res) => {
    const { filename = '', content_type = '', data_base64 = '', text = '' } = req.body || {};
    if (!data_base64 && !text) throw httpErr(400, 'Choose a file or paste the invoice text');
    const buffer = data_base64 ? Buffer.from(data_base64, 'base64') : null;
    if (buffer && buffer.length > 20 * 1024 * 1024) throw httpErr(413, 'That file is too large (20 MB maximum)');
    const type = content_type || (/\.pdf$/i.test(filename) ? 'application/pdf' : /\.png$/i.test(filename) ? 'image/png' : /\.jpe?g$/i.test(filename) ? 'image/jpeg' : /\.csv$/i.test(filename) ? 'text/csv' : 'text/plain');
    res.json(await purchasing.ingest({ buffer: /^(application\/pdf|image\/)/.test(type) ? buffer : null, text: /^(application\/pdf|image\/)/.test(type) ? '' : text || buffer.toString('utf8'), mediaType: type, filename, source: 'upload', actor: who(req) }));
  });
  A.get('/invoices', async (req, res) => res.json(await purchasing.listInvoices(req.query.status ? String(req.query.status) : null)));
  A.get('/invoices/:id', async (req, res) => {
    const inv = await purchasing.getInvoice(num(req.params.id, 0));
    res.json({ invoice: inv, preview: inv.status === 'review' ? await purchasing.previewInvoice(inv.id, String(req.query.reprice || 'propose')).catch(() => null) : null });
  });
  A.put('/invoices/:id', J, async (req, res) => res.json(await purchasing.updateDraft(num(req.params.id, 0), req.body || {})));
  A.post('/invoices/:id/apply', J, async (req, res) => res.json(await purchasing.apply(num(req.params.id, 0), { reprice: ['propose', 'all', 'new_only', 'none'].includes(req.body.reprice) ? req.body.reprice : 'propose', actor: who(req) })));
  A.post('/invoices/:id/ignore', J, async (req, res) => { await purchasing.ignore(num(req.params.id, 0)); res.json({ ok: true }); });
  A.get('/invoices/:id/freight-candidates', async (req, res) => res.json(await purchasing.freightCandidates(num(req.params.id, 0))));
  A.post('/invoices/:id/allocate', J, async (req, res) => res.json(await purchasing.allocateFreight(num(req.params.id, 0), num(req.body.target_id, 0), who(req))));
  A.get('/documents/:hash', async (req, res) => {
    const d = /^[a-f0-9]{64}$/.test(req.params.hash) ? await db.one('SELECT filename, content_type, data FROM documents WHERE hash=$1', [req.params.hash]) : null;
    if (!d) throw httpErr(404, 'Not found');
    res.set({ 'Content-Type': d.content_type, 'Content-Disposition': 'inline; filename="' + String(d.filename).replace(/[^\w.\- ]/g, '_') + '"', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox" }).send(d.data);
  });
  A.get('/inbox/status', async (req, res) => {
    const cfg = (await settings.all()).inbox;
    res.json({ accounts: pollInboxNow.accounts.length, enabled: cfg.enabled !== false, senders: cfg.senders, last: await db.one(`SELECT * FROM sync_log WHERE kind='inbox' ORDER BY id DESC LIMIT 1`), reader: purchasing.extractor.kind || 'none' });
  });
  A.post('/inbox/poll', J, async (req, res) => { if (!pollInboxNow.accounts.length) throw httpErr(501, 'No mailbox is connected yet. Set INBOXES in the server settings.'); res.json(await pollInboxNow()); });

  // ---------- Price changes waiting for a decision ----------
  A.get('/price-proposals', async (req, res) => res.json(await back.listProposals(['pending', 'approved', 'dismissed'].includes(req.query.status) ? req.query.status : 'pending')));
  A.post('/price-proposals/approve-all', J, async (req, res) => {
    const all = await back.listProposals('pending'); const only = Array.isArray(req.body.ids) ? new Set(req.body.ids.map(Number)) : null; let n = 0;
    for (const p of all) if (!only || only.has(p.id)) { await back.approveProposal(p.id, who(req)); n++; }
    res.json({ approved: n });
  });
  A.post('/price-proposals/:id/approve', J, async (req, res) => res.json(await back.approveProposal(num(req.params.id, 0), who(req))));
  A.post('/price-proposals/:id/dismiss', J, async (req, res) => res.json(await back.dismissProposal(num(req.params.id, 0), who(req))));

  // ---------- Purchase orders ----------
  A.get('/purchase-orders', async (req, res) => res.json(await db.rows(`SELECT po.*, s.name AS supplier, (SELECT count(*)::int FROM purchase_order_lines WHERE po_id = po.id) AS lines FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id ORDER BY po.id DESC LIMIT 100`)));
  A.post('/purchase-orders/from-reorder', J, async (req, res) => res.json(await purchasing.poFromReorder(num(req.body.supplier_id, 0))));
  A.get('/purchase-orders/:id', async (req, res) => { const po = await purchasing.getPo(num(req.params.id, 0)); res.json({ ...po, text: purchasing.poText(po) }); });
  A.post('/purchase-orders/:id/send', J, async (req, res) => res.json(await purchasing.sendPo(num(req.params.id, 0))));
  A.post('/purchase-orders/:id/status', J, async (req, res) => { if (!['received', 'cancelled'].includes(req.body.status)) throw httpErr(400, 'Bad status'); await db.q('UPDATE purchase_orders SET status=$2 WHERE id=$1', [num(req.params.id, 0), req.body.status]); res.json({ ok: true }); });

  A.post('/clover/push-all', J, async (req, res) => { const ids = (await db.rows('SELECT id FROM products WHERE active AND price_cents > 0')).map((r) => r.id); back.afterChange(ids); res.json({ queued: ids.length }); });

  // ---------- Hand count ----------
  A.post('/products/:id/count', J, async (req, res) => {
    const q = Number(req.body.qty); if (!(q >= 0)) throw httpErr(400, 'Enter the number counted');
    const p = await db.one('SELECT stock FROM products WHERE id=$1', [num(req.params.id, 0)]); if (!p) throw httpErr(404, 'Not found');
    await db.q('UPDATE products SET stock=$2, updated_at=now() WHERE id=$1', [num(req.params.id, 0), q]);
    await db.q(`INSERT INTO stock_events (product_id, delta, reason) VALUES ($1,$2,'count')`, [num(req.params.id, 0), q - Number(p.stock)]);
    core.dirty(); res.json({ ok: true, was: Number(p.stock), now: q });
  });

  // ---------- Photos: copy to our own storage ----------
  A.get('/images/status', async (req, res) => res.json({ external: await mirror.pending() }));
  A.post('/images/mirror', J, async (req, res) => { const r = await mirror.run(Math.min(num(req.body.limit, 25), 100)); core.dirty(); res.json(r); });

  // ---------- Product import (CSV / pasted from Excel) ----------
  const HEAD = { upc: ['upc', 'barcode', 'code'], sku: ['sku'], name: ['name', 'item', 'description', 'product'], name_he: ['name_he', 'hebrew name', 'hebrew', 'שם'], brand: ['brand'], size: ['size'], price: ['price', 'retail', 'sell'], cost: ['cost', 'unit cost'],
    clover_id: ['clover id'], code: ['product code'], price_type: ['price type'], price_unit: ['price unit'], hidden: ['hidden?', 'hidden'], default_tax: ['default tax rates?'],
    category: ['category', 'categories', 'department', 'dept'], sold_by: ['sold by', 'sold_by', 'unit', 'per'], est_weight: ['est weight', 'est_weight', 'avg weight', 'pack weight', 'weight'], stock: ['stock', 'qty', 'quantity', 'on hand'], description: ['description_long', 'details', 'about'], ingredients: ['ingredients'], image_url: ['image', 'image_url', 'photo', 'picture'], active: ['active', 'visible'],
    passover: ['kosher_passover', 'passover', 'kfp', 'kosher for passover', 'kosher-for-passover'], kosher_type: ['kosher type', 'kosher_type', 'meat/dairy', 'dairy/meat'], supplier: ['supplier', 'vendor', 'supplier_name'], supplier_sku: ['supplier_sku', 'vendor sku', 'vendor_sku'],
    case_size: ['case_size', 'case size', 'pack size', 'units per case'], snap: ['snap', 'ebt'], taxable: ['taxable', 'tax'], holidays: ['holiday', 'holidays'] };
  const yes = (v) => /^(1|y|yes|true|x|✓)$/i.test(String(v).trim());
  async function parseProducts(text, createCats, opts = {}) {
    let t = String(text || ''); if (t.includes('\t') && !t.includes(',')) t = t.replace(/\t/g, ',');
    const [head, ...body] = parseCsv(t);
    if (!head) throw httpErr(400, 'No data');
    const h = head.map((x) => x.trim().toLowerCase());
    const col = {}; for (const [k, names] of Object.entries(HEAD)) { const i = h.findIndex((x) => names.includes(x)); if (i >= 0) col[k] = i; }
    if (col.name === undefined) throw httpErr(400, 'Need a column called name (or item / product)');
    const cats = await db.rows('SELECT id, name, name_he, slug FROM categories');
    const catBy = (v) => { const x = String(v || '').trim().toLowerCase(); return cats.find((c) => c.name.toLowerCase() === x || c.slug === x || (c.name_he && c.name_he === String(v).trim())); };
    const get = (r, k) => (col[k] === undefined ? '' : String(r[col[k]] ?? '').trim());
    const money = (v) => (v === '' ? null : Math.round(Number(String(v).replace(/[$,]/g, '')) * 100));
    const isClover = col.clover_id !== undefined;
    const seenUpc = new Set();
    const out = [];
    body.forEach((r, i) => {
      const row = { line: i + 2, errors: [] };
      row.name = get(r, 'name'); row.upc = get(r, 'upc').replace(/\D/g, ''); row.sku = get(r, 'sku');
      if (!row.name) row.errors.push('no name');
      const price = money(get(r, 'price')), cost = money(get(r, 'cost'));
      if (get(r, 'price') !== '' && !(price >= 0)) row.errors.push('bad price');
      row.price_cents = price; row.cost_cents = cost;
      if (isClover) { // Clover's own export: codes, price types, hidden flag, tax flag
        row.clover_id = get(r, 'clover_id');
        const code = get(r, 'code'), digits = code.replace(/\D/g, '');
        if (!row.upc && /^\d{8,14}$/.test(digits) && digits === code) row.upc = digits;
        if (!row.sku && code) row.sku = code.slice(0, 40);
        const pt = get(r, 'price_type').toLowerCase();
        row.sold_by = pt === 'per unit' && /lb|pound/i.test(get(r, 'price_unit')) ? 'lb' : 'each';
        if (pt === 'variable') { row.price_cents = null; row.note = 'open price (needs a price)'; }
        if (/^yes$/i.test(get(r, 'hidden')) || row.note) row.hidden = true;
        if (col.default_tax !== undefined) row.taxable = yes(get(r, 'default_tax'));
        if (row.upc) { if (seenUpc.has(row.upc)) row.errors.push('same barcode appears earlier in the file'); seenUpc.add(row.upc); }
      }
      let catv = get(r, 'category').split(',')[0].trim(); let cat = catv ? catBy(catv) : null;
      if (isClover) { // map Clover's hand-made categories, then fall back to a name-based guess (department only)
        const mapped = CLOVER_CATEGORY[catv.toLowerCase()];
        if (mapped) { cat = catBy(mapped.dept); if (mapped.kosher) row.kosher_type = mapped.kosher; }
        else if (!cat) { const g = guessDepartment(row.name, { perUnitLb: row.sold_by === 'lb' }); if (g) { cat = catBy(g); row.guessed_department = true; } catv = cat ? cat.name : ''; }
      } else if (catv && !cat && !createCats) row.errors.push(`unknown department "${catv}"`);
      row.category_id = cat ? cat.id : null; row.category = cat ? cat.name : catv; row.new_category = !isClover && catv && !cat && createCats ? catv : '';
      row.supplier = get(r, 'supplier'); row.supplier_sku = get(r, 'supplier_sku'); row.case_size = Number(get(r, 'case_size')) > 0 ? Number(get(r, 'case_size')) : null;
      if (col.passover !== undefined) { const pv = get(r, 'passover'); row.passover = pv === '' ? undefined : yes(pv) ? 'yes' : 'no'; }
      const kt = get(r, 'kosher_type').toLowerCase(); row.kosher_type = row.kosher_type || (['meat', 'dairy', 'pareve'].includes(kt) ? kt : '');
      if (col.snap !== undefined) row.snap = yes(get(r, 'snap')); if (col.taxable !== undefined) row.taxable = yes(get(r, 'taxable')); row.holidays = get(r, 'holidays');
      row.brand = get(r, 'brand'); row.size = get(r, 'size'); row.name_he = get(r, 'name_he'); row.description = get(r, 'description'); row.ingredients = get(r, 'ingredients'); row.image_url = get(r, 'image_url');
      if (!isClover) { const per = get(r, 'sold_by').toLowerCase(); row.sold_by = /lb|pound/.test(per) ? 'lb' : 'each'; }
      const w = Number(get(r, 'est_weight')); row.est_weight_lb = w > 0 ? w : null;
      row.stock = get(r, 'stock') === '' || opts.useStock === false ? null : Number(get(r, 'stock')); if (row.stock != null && !(row.stock >= 0)) { if (isClover) row.stock = 0; else row.errors.push('bad stock'); }
      const act = get(r, 'active').toLowerCase(); row.active = row.hidden ? false : act === '' ? true : !['0', 'no', 'false', 'n'].includes(act);
      out.push(row);
    });
    return out;
  }
  A.post('/products/import', JBIG, async (req, res) => {
    const text = req.body.xlsx_base64 ? await xlsxToCsv(Buffer.from(req.body.xlsx_base64, 'base64')) : req.body.text;
    const rows = await parseProducts(text, !!req.body.create_departments, { useStock: req.body.use_stock !== false });
    const sup = req.body.supplier_id ? await db.one('SELECT * FROM suppliers WHERE id=$1', [req.body.supplier_id]) : null;
    for (const r of rows) {
      const ex = (r.upc && (await db.one('SELECT id FROM products WHERE upc=$1', [r.upc]))) || (r.sku && (await db.one(`SELECT id FROM products WHERE sku=$1 AND sku <> ''`, [r.sku]))) || (await db.one('SELECT id FROM products WHERE lower(name)=lower($1) ORDER BY id LIMIT 1', [r.name]));
      r.action = r.errors.length ? 'skip' : ex ? 'update' : 'create'; r.id = ex ? ex.id : null;
      if (!r.price_cents && r.cost_cents && sup && !ex) r.price_cents = pricing.suggestPrice(r.cost_cents, sup.markup_pct);
    }
    const summary = { new_departments: [...new Set(rows.map((r) => r.new_category).filter(Boolean))], create: rows.filter((r) => r.action === 'create').length, update: rows.filter((r) => r.action === 'update').length, skip: rows.filter((r) => r.action === 'skip').length, guessed_departments: rows.filter((r) => r.guessed_department && r.action !== 'skip').length, no_department: rows.filter((r) => !r.category_id && r.action !== 'skip').length, no_price: rows.filter((r) => !r.price_cents && r.action !== 'skip').length, with_stock: rows.filter((r) => r.stock > 0 && r.action !== 'skip').length };
    if (!req.body.commit) return res.json({ preview: true, ...summary, rows: rows.slice(0, 300) });
    let done = 0; const failed = []; const supCache = new Map(), catCache = new Map();
    const supplierId = async (name) => { if (!name) return sup ? sup.id : undefined; const k = name.toLowerCase(); if (!supCache.has(k)) supCache.set(k, (await db.one(`INSERT INTO suppliers (name, markup_pct) VALUES ($1, 30) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`, [name])).id); return supCache.get(k); };
    const categoryId = async (name) => { const k = name.toLowerCase(); if (!catCache.has(k)) catCache.set(k, (await db.one(`INSERT INTO categories (name, slug, sort) VALUES ($1,$2,100) ON CONFLICT (slug) DO UPDATE SET name = categories.name RETURNING id`, [name, require('./core').slugify(name)])).id); return catCache.get(k); };
    for (const r of rows) {
      if (r.action === 'skip') continue;
      if (r.new_category) r.category_id = await categoryId(r.new_category);
      r.supplier_id = await supplierId(r.supplier);
      const data = { name: r.name, upc: r.upc || undefined, sku: r.sku || undefined, brand: r.brand || undefined, size: r.size || undefined, name_he: r.name_he || undefined, description: r.description || undefined, ingredients: r.ingredients || undefined, image_url: r.image_url || undefined,
        category_id: r.category_id || undefined, sold_by: r.sold_by, est_weight_lb: r.est_weight_lb || undefined, price_cents: r.price_cents ?? undefined, cost_cents: r.cost_cents ?? undefined, stock: r.stock ?? undefined, supplier_id: r.supplier_id, active: r.active, supplier_sku: r.supplier_sku || undefined, case_size: r.case_size || undefined, passover: r.passover, kosher_type: r.kosher_type || undefined, snap: r.snap, taxable: r.taxable, holidays: r.holidays || undefined };
      if (r.clover_id) data.clover_id = r.clover_id;
      try { await back.saveProduct(r.id, Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)), { quiet: true }); done++; } // quiet: importing from Clover must not send 3,000 updates back to Clover
      catch (e) { failed.push({ line: r.line, name: r.name, error: e.message }); }
    }
    res.json({ preview: false, ...summary, saved: done, failed: failed.slice(0, 50), failed_count: failed.length });
  });
}

module.exports = { mount };
