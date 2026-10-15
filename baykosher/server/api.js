// HTTP API: storefront, customer account, staff (admin + picker).
'use strict';
const express = require('express');
const { httpErr } = require('./core');

function createApi({ db, settings, core, back, auth, limiter, env, stripeWebhook, clover, syncCloverNow }) {
  const r = express.Router();
  const J = express.json({ limit: '2mb' });
  const ip = (req) => req.ip || req.socket.remoteAddress || 'x';
  const num = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v != null ? Number(v) : d);
  const setCookie = (res, name, val, maxAge, strict) => res.append('Set-Cookie', `${name}=${encodeURIComponent(val)}; Path=/; HttpOnly; SameSite=${strict ? 'Strict' : 'Lax'}; Max-Age=${maxAge}${env.NODE_ENV === 'production' ? '; Secure' : ''}`);

  // ---- identity ----
  const customerOf = (req) => { const p = auth.verify(auth.cookie(req, 'bk_cust') || (req.headers.authorization || '').replace(/^Bearer /, '')); return p && p.cid ? { customer_id: p.cid } : null; };
  const staffOf = (req) => { const p = auth.verify(auth.cookie(req, 'bk_staff') || (req.headers['x-staff-token'] || '')); return p && p.role ? p : null; };
  const needAdmin = (req, res, next) => { const s = staffOf(req); if (!s || s.role !== 'admin') return res.status(401).json({ error: 'Sign in required' }); req.staff = s; next(); };
  const needPicker = (req, res, next) => { const s = staffOf(req); if (!s) return res.status(401).json({ error: 'Sign in required' }); req.staff = s; next(); };

  // ---- storefront ----
  r.get('/store', async (req, res) => {
    const s = await settings.all();
    res.json({ store: s.store, hours: s.hours, pickup_lead_minutes: s.pickup.lead_minutes, delivery_min_cents: s.delivery.min_order_cents, delivery_tiers: s.delivery_tiers, stripe_pk: env.STRIPE_PUBLISHABLE_KEY || '', payments: env.STRIPE_SECRET_KEY ? 'stripe' : 'test' });
  });
  r.get('/categories', async (req, res) => res.json(await core.categories()));
  r.get('/products', async (req, res) => {
    const { q, category, sale, sort } = req.query;
    res.json(await core.listProducts({ q: q ? String(q).slice(0, 80) : '', category: category ? String(category) : '', sale: sale === '1', sort: String(sort || ''), limit: Math.min(num(req.query.limit, 48), 100), offset: num(req.query.offset, 0), inStockOnly: req.query.in_stock === '1' }));
  });
  r.get('/suggest', async (req, res) => {
    const q = String(req.query.q || '').slice(0, 60);
    await core.ensureIndex();
    // names starting with the text first, then fuzzy matches (covers typos)
    const ids = [...core.index.suggest(q, 6)];
    for (const h of core.index.search(q, 8)) if (!ids.includes(h.id)) ids.push(h.id);
    const items = ids.length ? (await core.listProducts({ ids: ids.slice(0, 8) })).items : [];
    res.json(items.map((p) => ({ id: p.id, slug: p.slug, name: p.name, image_url: p.image_url, price_cents: p.price_cents, sold_by: p.sold_by, stock_status: p.stock_status })));
  });
  r.get('/products/:id', async (req, res) => {
    const p = await core.getProduct(num(req.params.id, 0));
    if (!p) throw httpErr(404, 'Not found');
    res.json({ ...p, similar: await core.similar(p.id), together: await core.boughtTogether(p.id) });
  });
  r.post('/cart/price', J, async (req, res) => {
    const { lines, problems } = await core.priceCart(req.body.items);
    res.json({ lines, problems, ...(await core.totals(lines)) });
  });
  // Saves the cart so we can remind people who leave without paying. Contact info is optional.
  r.put('/cart/:id', J, async (req, res) => {
    const id = String(req.params.id);
    if (!/^[a-zA-Z0-9_-]{16,64}$/.test(id)) throw httpErr(400, 'Bad cart id');
    const items = (Array.isArray(req.body.items) ? req.body.items : []).slice(0, 200).map((i) => ({ product_id: Number(i.product_id), qty: Number(i.qty) })).filter((i) => i.product_id && i.qty > 0);
    const who = customerOf(req);
    const email = String(req.body.email || '').trim().toLowerCase().slice(0, 200), phone = String(req.body.phone || '').replace(/[^\d+]/g, '').slice(0, 20);
    await db.q(`INSERT INTO carts (id, customer_id, email, phone, sms_ok, items, updated_at) VALUES ($1,$2,$3,$4,$5,$6,now())
      ON CONFLICT (id) DO UPDATE SET items=$6, updated_at=now(), customer_id=COALESCE($2, carts.customer_id),
        email=CASE WHEN $3<>'' THEN $3 ELSE carts.email END, phone=CASE WHEN $4<>'' THEN $4 ELSE carts.phone END, sms_ok = carts.sms_ok OR $5,
        reminders_sent = CASE WHEN carts.items IS DISTINCT FROM $6 THEN 0 ELSE carts.reminders_sent END, completed = FALSE`,
      [id, who ? who.customer_id : null, email, phone, !!req.body.sms_ok && !!phone, JSON.stringify(items)]);
    res.json({ ok: true });
  });
  r.get('/cart/:id', async (req, res) => {
    const c = await db.one('SELECT items FROM carts WHERE id=$1', [req.params.id]);
    res.json({ items: c ? c.items : [] });
  });
  r.get('/slots', async (req, res) => res.json(await core.slots(req.query.kind === 'delivery' ? 'delivery' : 'pickup')));
  r.get('/coop', async (req, res) => res.json(await core.coopDrops()));
  r.post('/delivery/quote', J, async (req, res) => {
    if (!limiter.geo(ip(req))) throw httpErr(429, 'Too many requests');
    const { lines } = await core.priceCart(req.body.items);
    const sub = lines.reduce((a, l) => a + l.line_cents, 0);
    const { point, ...q } = await core.quoteDelivery(req.body.address || {}, sub);
    res.json(q);
  });
  r.post('/checkout', J, async (req, res) => {
    if (!limiter.checkout(ip(req))) throw httpErr(429, 'Too many attempts, please wait a minute');
    res.json(await core.checkout({ ...req.body, auth: customerOf(req) }));
  });
  r.post('/orders/:id/confirm', J, async (req, res) => {
    const o = await core.confirmPaid(num(req.params.id, 0), String(req.body.token || ''));
    res.json({ status: o.status });
  });
  r.get('/orders/:id', async (req, res) => {
    const o = await core.orderWithItems(num(req.params.id, 0));
    const who = customerOf(req);
    if (!o || !((req.query.t && auth.same(req.query.t, o.public_token)) || (who && who.customer_id === o.customer_id))) throw httpErr(404, 'Order not found');
    res.json({ ...core.receipt(o), slot_start: o.slot_start, slot_end: o.slot_end, address: o.address && { street: o.address.street, city: o.address.city }, coop: o.coop_label ? `${o.coop_label} at ${o.coop_location}` : null, tracking_url: o.uber_tracking_url || null, sub_pref: o.sub_pref });
  });

  // ---- customer sign-in with an emailed code (no passwords) ----
  r.post('/auth/request', J, async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!limiter.login(ip(req)) || !limiter.login(email)) throw httpErr(429, 'Too many attempts, please wait a few minutes');
    const c = await db.one('SELECT * FROM customers WHERE email=$1', [email]);
    if (c) {
      const code = String(require('crypto').randomInt(100000, 1000000));
      await db.q(`INSERT INTO login_codes (email, code, expires_at, tries) VALUES ($1,$2, now() + interval '10 minutes', 0) ON CONFLICT (email) DO UPDATE SET code=$2, expires_at=now() + interval '10 minutes', tries=0`, [email, code]);
      await require('./notifyRef').get().email(email, 'Your Bay Kosher sign-in code', `<p>Your code is <b style="font-size:22px">${code}</b>. It expires in 10 minutes.</p>`);
    }
    res.json({ ok: true }); // same answer whether or not the email exists
  });
  r.post('/auth/verify', J, async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase(), code = String(req.body.code || '');
    if (!limiter.login(ip(req) + ':v')) throw httpErr(429, 'Too many attempts');
    const l = await db.one('SELECT * FROM login_codes WHERE email=$1', [email]);
    if (!l || l.expires_at < new Date() || l.tries >= 5) throw httpErr(401, 'Code expired. Request a new one.');
    if (!auth.same(l.code, code)) { await db.q('UPDATE login_codes SET tries = tries + 1 WHERE email=$1', [email]); throw httpErr(401, 'That code is not right'); }
    await db.q('DELETE FROM login_codes WHERE email=$1', [email]);
    const c = await db.one('SELECT id, email, name FROM customers WHERE email=$1', [email]);
    const token = auth.sign({ cid: c.id }, 60 * 86400);
    setCookie(res, 'bk_cust', token, 60 * 86400);
    res.json({ ok: true, name: c.name, email: c.email });
  });
  r.post('/auth/logout', (req, res) => { setCookie(res, 'bk_cust', '', 0); res.json({ ok: true }); });
  r.get('/me', async (req, res) => {
    const who = customerOf(req);
    if (!who) return res.json({ signed_in: false });
    const c = await db.one('SELECT id, email, name, phone, sms_ok, email_ok, default_sub_pref FROM customers WHERE id=$1', [who.customer_id]);
    if (!c) return res.json({ signed_in: false });
    const orders = await db.rows(`SELECT id, status, fulfillment, slot_start, created_at, COALESCE(final_total_cents, est_subtotal_cents + est_tax_cents + delivery_fee_cents) AS total_cents, public_token FROM orders WHERE customer_id=$1 AND status <> 'pending_payment' ORDER BY id DESC LIMIT 20`, [c.id]);
    res.json({ signed_in: true, customer: c, orders, buy_again: await core.buyAgain(c.id) });
  });
  r.put('/me', J, async (req, res) => {
    const who = customerOf(req); if (!who) throw httpErr(401, 'Sign in required');
    const b = req.body;
    await db.q(`UPDATE customers SET name=COALESCE($2,name), phone=COALESCE($3,phone), sms_ok=COALESCE($4,sms_ok), email_ok=COALESCE($5,email_ok), default_sub_pref=COALESCE($6,default_sub_pref) WHERE id=$1`,
      [who.customer_id, b.name ?? null, b.phone ?? null, b.sms_ok ?? null, b.email_ok ?? null, ['substitute', 'call_sub', 'call_no_sub', 'never'].includes(b.default_sub_pref) ? b.default_sub_pref : null]);
    res.json({ ok: true });
  });
  r.post('/subscribe', J, async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!limiter.login(ip(req) + ':s')) throw httpErr(429, 'Too many attempts');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw httpErr(400, 'Please enter a valid email');
    await db.q(`INSERT INTO subscribers (email, token) VALUES ($1,$2) ON CONFLICT (email) DO UPDATE SET subscribed=TRUE`, [email, auth.token(16)]);
    res.json({ ok: true });
  });
  if (stripeWebhook) r.post('/stripe/webhook', express.raw({ type: 'application/json' }), stripeWebhook);

  // ---- staff login ----
  r.post('/staff/login', J, async (req, res) => {
    if (!limiter.staff(ip(req))) throw httpErr(429, 'Too many attempts, please wait');
    const { password, pin } = req.body || {};
    let role = null;
    if (password && env.ADMIN_PASSWORD && auth.same(password, env.ADMIN_PASSWORD)) role = 'admin';
    else if (pin && env.PICKER_PIN && auth.same(pin, env.PICKER_PIN)) role = 'picker';
    if (!role) throw httpErr(401, 'Wrong password or PIN');
    const token = auth.sign({ role }, role === 'admin' ? 12 * 3600 : 12 * 3600);
    setCookie(res, 'bk_staff', token, 12 * 3600, true);
    res.json({ ok: true, role, token });
  });
  r.post('/staff/logout', (req, res) => { setCookie(res, 'bk_staff', '', 0, true); res.json({ ok: true }); });
  r.get('/staff/me', (req, res) => { const s = staffOf(req); res.json({ role: s ? s.role : null }); });

  // ---- picker ----
  const P = express.Router(); r.use('/picker', P); P.use(needPicker);
  P.get('/queue', async (req, res) => {
    res.json(await db.rows(`SELECT o.id, o.status, o.fulfillment, o.slot_start, o.sub_pref, o.picker, c.name AS customer_name,
      (SELECT count(*)::int FROM order_items WHERE order_id=o.id) items, (SELECT count(*)::int FROM order_items WHERE order_id=o.id AND state <> 'pending') done
      FROM orders o JOIN customers c ON c.id=o.customer_id WHERE o.status IN ('placed','picking') ORDER BY o.slot_start NULLS LAST, o.id`));
  });
  P.get('/orders/:id', async (req, res) => { const o = await core.orderWithItems(num(req.params.id, 0)); if (!o) throw httpErr(404, 'Not found'); res.json(o); });
  P.post('/orders/:id/start', J, async (req, res) => res.json(await core.startPicking(num(req.params.id, 0), String(req.body.picker || req.staff.role).slice(0, 40))));
  P.post('/orders/:id/items/:item/:action', J, async (req, res) => res.json(await core.itemAction(num(req.params.id, 0), num(req.params.item, 0), req.params.action, req.body || {})));
  P.post('/orders/:id/add', J, async (req, res) => res.json(await core.itemAction(num(req.params.id, 0), null, 'add', req.body || {})));
  P.post('/orders/:id/finish', J, async (req, res) => res.json(await core.finishOrder(num(req.params.id, 0))));
  P.get('/find', async (req, res) => {
    const q = String(req.query.q || '');
    res.json((await core.listProducts({ q, limit: 12 })).items);
  });

  // ---- admin ----
  const A = express.Router(); r.use('/admin', A); A.use(needAdmin);
  A.get('/dashboard', async (req, res) => res.json(await back.dashboard()));
  A.get('/settings', async (req, res) => res.json(await settings.all()));
  A.put('/settings/:key', J, async (req, res) => { await settings.set(req.params.key, req.body.value); res.json({ ok: true }); });

  A.get('/products', async (req, res) => {
    const { q, filter } = req.query; const where = ['TRUE'], params = [];
    if (q) { params.push('%' + String(q).toLowerCase() + '%'); where.push(`(lower(p.name) LIKE $${params.length} OR p.upc LIKE $${params.length} OR lower(p.brand) LIKE $${params.length})`); }
    if (filter === 'hidden') where.push('NOT p.active');
    if (filter === 'low') where.push('p.active AND p.track_stock AND p.stock <= p.low_stock_at');
    if (filter === 'noimage') where.push(`p.image_url = ''`);
    if (filter === 'uncategorized') where.push('p.category_id IS NULL');
    if (filter === 'nocost') where.push('p.cost_cents = 0');
    const lim = Math.min(num(req.query.limit, 50), 200), off = num(req.query.offset, 0);
    params.push(lim, off);
    const rows = await db.rows(`SELECT p.*, c.name AS category_name, s.name AS supplier_name, count(*) OVER() AS total FROM products p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN suppliers s ON s.id=p.supplier_id WHERE ${where.join(' AND ')} ORDER BY p.updated_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    res.json({ total: rows[0] ? Number(rows[0].total) : 0, items: rows.map(({ total, ...p }) => p) });
  });
  A.get('/products/:id', async (req, res) => { const p = await db.one('SELECT * FROM products WHERE id=$1', [num(req.params.id, 0)]); if (!p) throw httpErr(404, 'Not found'); res.json(p); });
  A.post('/products', J, async (req, res) => res.json(await back.saveProduct(null, req.body)));
  A.put('/products/:id', J, async (req, res) => res.json(await back.saveProduct(num(req.params.id, 0), req.body)));
  A.post('/products/bulk', J, async (req, res) => {
    const ids = (req.body.ids || []).map(Number).filter(Boolean), set = req.body.set || {};
    let n = 0; for (const id of ids) { await back.saveProduct(id, Object.fromEntries(Object.entries(set).filter(([k]) => ['active', 'category_id', 'supplier_id', 'sold_by', 'taxable', 'price_locked'].includes(k)))); n++; }
    res.json({ updated: n });
  });
  A.get('/upc/:code', async (req, res) => { if (!limiter.geo('upc' + ip(req))) throw httpErr(429, 'Slow down'); res.json(await back.draftFromUpc(req.params.code)); });

  A.get('/suppliers', async (req, res) => res.json(await db.rows('SELECT * FROM suppliers ORDER BY name')));
  A.post('/suppliers', J, async (req, res) => res.json(await db.one('INSERT INTO suppliers (name, markup_pct, contact, notes) VALUES ($1,$2,$3,$4) RETURNING *', [req.body.name, num(req.body.markup_pct, 30), req.body.contact || '', req.body.notes || ''])));
  A.put('/suppliers/:id', J, async (req, res) => res.json(await db.one('UPDATE suppliers SET name=$2, markup_pct=$3, contact=$4, notes=$5 WHERE id=$1 RETURNING *', [num(req.params.id, 0), req.body.name, num(req.body.markup_pct, 30), req.body.contact || '', req.body.notes || ''])));
  A.post('/suppliers/:id/reprice', J, async (req, res) => res.json(await back.repriceSupplier(num(req.params.id, 0), { apply: !!req.body.apply, only: req.body.include_locked ? 'all' : 'unlocked' })));

  A.get('/categories', async (req, res) => res.json(await core.categories()));
  A.post('/categories', J, async (req, res) => res.json(await db.one('INSERT INTO categories (slug, name, parent_id, sort, image_url, taxable_default) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [core.slugify(req.body.slug || req.body.name), req.body.name, req.body.parent_id || null, num(req.body.sort, 0), req.body.image_url || '', !!req.body.taxable_default])));
  A.put('/categories/:id', J, async (req, res) => { const row = await db.one('UPDATE categories SET name=$2, parent_id=$3, sort=$4, image_url=$5, taxable_default=$6 WHERE id=$1 RETURNING *', [num(req.params.id, 0), req.body.name, req.body.parent_id || null, num(req.body.sort, 0), req.body.image_url || '', !!req.body.taxable_default]); core.dirty(); res.json(row); });

  A.post('/invoices/parse-csv', J, async (req, res) => res.json({ lines: back.parseInvoiceCsv(String(req.body.text || '')) }));
  A.post('/invoices', J, async (req, res) => res.json(await back.importInvoice(req.body)));
  A.get('/invoices', async (req, res) => res.json(await db.rows(`SELECT i.*, s.name AS supplier, (SELECT count(*)::int FROM invoice_lines WHERE invoice_id=i.id) lines FROM invoices i LEFT JOIN suppliers s ON s.id=i.supplier_id ORDER BY i.id DESC LIMIT 100`)));

  A.get('/sales', async (req, res) => res.json(await db.rows('SELECT * FROM sales ORDER BY active DESC, id DESC')));
  A.post('/sales', J, async (req, res) => { const s = await back.saveSale(null, req.body); core.dirty(); res.json(s); });
  A.put('/sales/:id', J, async (req, res) => res.json(await back.saveSale(num(req.params.id, 0), req.body)));
  A.delete('/sales/:id', async (req, res) => { await db.q('DELETE FROM sales WHERE id=$1', [num(req.params.id, 0)]); res.json({ ok: true }); });
  A.post('/sales/preview', J, async (req, res) => res.json(await back.previewSale(req.body)));

  A.get('/reorder', async (req, res) => res.json(await back.reorderReport({ windowDays: num(req.query.days, 28), coverDays: num(req.query.cover, 14) })));

  A.get('/clover/status', async (req, res) => res.json({ connected: !!clover, last: await db.one(`SELECT * FROM sync_log WHERE kind='clover' ORDER BY id DESC LIMIT 1`) }));
  A.post('/clover/sync', J, async (req, res) => { if (!clover) throw httpErr(501, 'Clover is not connected. Set CLOVER_MERCHANT_ID and CLOVER_TOKEN.'); res.json(await syncCloverNow(req.body.direction)); });

  A.get('/orders', async (req, res) => {
    const st = req.query.status ? String(req.query.status).split(',') : null;
    res.json(await db.rows(`SELECT o.id, o.status, o.fulfillment, o.slot_start, o.created_at, o.est_subtotal_cents, o.final_total_cents, o.captured_cents, o.unpaid_cents, c.name AS customer_name, c.email AS customer_email
      FROM orders o JOIN customers c ON c.id=o.customer_id WHERE o.status <> 'pending_payment' AND ($1::text[] IS NULL OR o.status = ANY($1)) ORDER BY o.id DESC LIMIT 100`, [st]));
  });
  A.get('/orders/:id', async (req, res) => { const o = await core.orderWithItems(num(req.params.id, 0)); if (!o) throw httpErr(404, 'Not found'); res.json({ ...o, receipt: core.receipt(o) }); });
  A.post('/orders/:id/cancel', J, async (req, res) => { await core.cancelOrder(num(req.params.id, 0)); res.json({ ok: true }); });
  A.post('/orders/:id/dispatch', J, async (req, res) => res.json(await core.dispatch(num(req.params.id, 0))));
  A.post('/orders/:id/complete', J, async (req, res) => res.json(await core.markCompleted(num(req.params.id, 0))));

  A.get('/coop', async (req, res) => res.json(await db.rows('SELECT * FROM coop_drops ORDER BY drop_date DESC LIMIT 50')));
  A.post('/coop', J, async (req, res) => res.json(await db.one('INSERT INTO coop_drops (label, location, address, drop_date, window_text, cutoff_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [req.body.label, req.body.location, req.body.address || '', req.body.drop_date, req.body.window_text || '', req.body.cutoff_at || null])));
  A.put('/coop/:id', J, async (req, res) => res.json(await db.one('UPDATE coop_drops SET label=$2, location=$3, address=$4, drop_date=$5, window_text=$6, cutoff_at=$7, active=$8 WHERE id=$1 RETURNING *', [num(req.params.id, 0), req.body.label, req.body.location, req.body.address || '', req.body.drop_date, req.body.window_text || '', req.body.cutoff_at || null, req.body.active !== false])));

  A.get('/campaign/draft', async (req, res) => res.json({ ...(await back.buildWeekly()), recipients: (await back.recipients()).length, email_live: require('./notifyRef').get().live.email }));
  A.post('/campaign/send', J, async (req, res) => { if (!req.body.subject || !req.body.html) throw httpErr(400, 'Subject and body required'); res.json(await back.sendCampaign(req.body)); });
  A.get('/carts/abandoned', async (req, res) => res.json(await db.rows(`SELECT id, email, phone, jsonb_array_length(items) AS item_count, updated_at, reminders_sent FROM carts WHERE NOT completed AND jsonb_array_length(items) > 0 ORDER BY updated_at DESC LIMIT 100`)));
  A.get('/messages', async (req, res) => res.json(await db.rows('SELECT id, channel, recipient, subject, ok, error, created_at FROM notify_log ORDER BY id DESC LIMIT 100')));

  return r;
}

module.exports = { createApi };
