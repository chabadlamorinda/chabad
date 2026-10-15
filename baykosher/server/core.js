// Business logic: catalog reads, time slots, cart pricing, checkout, picking and receipts.
'use strict';
const pricing = require('./pricing');
const { createIndex } = require('./search');
const { miles, deliveryFee } = require('./delivery');

const httpErr = (status, message) => Object.assign(new Error(message), { status });
const money = (c) => '$' + (c / 100).toFixed(2);
const slugify = (s) => String(s).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

// ---- time zone helpers (slots are computed in the store's local time) ----
function tzOffsetMin(date, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(date).map((x) => [x.type, x.value]));
  return (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - date.getTime()) / 60000;
}
function localToDate(y, m, d, hh, mm, tz) { // wall-clock time in tz -> real instant
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  return new Date(guess.getTime() - tzOffsetMin(new Date(guess.getTime() - tzOffsetMin(guess, tz) * 60000), tz) * 60000);
}
function localParts(date, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short' }).formatToParts(date).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, dow: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday)] };
}

function createCore({ db, settings, payments, notifier, geocoder, uber, clover, publicUrl = '' }) {
  const index = createIndex();
  let indexAt = 0, indexDirty = true;
  const dirty = () => { indexDirty = true; };

  // ---------- catalog ----------
  async function activeSales() { return db.rows('SELECT * FROM sales WHERE active'); }

  function present(p, sales) {
    const e = pricing.effectivePrice(p, sales);
    return {
      id: p.id, slug: slugify(p.name), name: p.name, brand: p.brand, size: p.size, upc: p.upc, image_url: p.image_url, sold_by: p.sold_by,
      price_cents: e.price_cents, was_cents: e.was_cents, sale_name: e.sale_name, percent_off: e.percent_off,
      category_id: p.category_id, category_name: p.category_name, category_slug: p.category_slug,
      stock_status: pricing.stockStatus(p), stock: p.track_stock ? Number(p.stock) : null, kosher_cert: p.kosher_cert,
    };
  }
  const BASE = `SELECT p.*, c.name AS category_name, c.slug AS category_slug FROM products p LEFT JOIN categories c ON c.id = p.category_id`;

  async function ensureIndex() {
    if (!indexDirty && Date.now() - indexAt < 60000) return;
    const rows = await db.rows(`${BASE} WHERE p.active`);
    index.build(rows); indexAt = Date.now(); indexDirty = false;
  }

  async function listProducts({ category, q, sale, ids, limit = 48, offset = 0, inStockOnly = false, sort = '' }) {
    const sales = await activeSales();
    let rows;
    if (q) {
      await ensureIndex();
      const hits = index.search(q, 200);
      if (!hits.length) return { total: 0, items: [] };
      const found = await db.rows(`${BASE} WHERE p.active AND p.id = ANY($1)`, [hits.map((h) => h.id)]);
      const byId = new Map(found.map((r) => [r.id, r]));
      rows = hits.map((h) => byId.get(h.id)).filter(Boolean);
    } else if (ids) {
      const found = await db.rows(`${BASE} WHERE p.active AND p.id = ANY($1)`, [ids]);
      const byId = new Map(found.map((r) => [r.id, r])); rows = ids.map((i) => byId.get(i)).filter(Boolean);
    } else if (category) {
      rows = await db.rows(`${BASE} WHERE p.active AND (c.slug = $1 OR c.parent_id = (SELECT id FROM categories WHERE slug = $1)) ORDER BY p.name`, [category]);
    } else {
      rows = await db.rows(`${BASE} WHERE p.active ORDER BY p.name`);
    }
    let items = rows.map((r) => present(r, sales));
    if (sale) items = items.filter((i) => i.was_cents);
    if (inStockOnly) items = items.filter((i) => i.stock_status !== 'out');
    if (!q) {
      if (sort === 'price_asc') items.sort((a, b) => a.price_cents - b.price_cents);
      else if (sort === 'price_desc') items.sort((a, b) => b.price_cents - a.price_cents);
      else if (sort === 'discount') items.sort((a, b) => b.percent_off - a.percent_off);
      // in-stock first, keeping name order
      else items.sort((a, b) => (a.stock_status === 'out') - (b.stock_status === 'out'));
    }
    return { total: items.length, items: items.slice(offset, offset + limit) };
  }

  async function getProduct(id) {
    const p = await db.one(`${BASE} WHERE p.id = $1 AND p.active`, [id]);
    if (!p) return null;
    const sales = await activeSales();
    return { ...present(p, sales), description: p.description, ingredients: p.ingredients, nutrition: p.nutrition, tags: p.tags };
  }

  // Similar: same category, nearby price, same brand first. Also frequently bought together from order history.
  async function similar(id, limit = 8) {
    const p = await db.one('SELECT * FROM products WHERE id=$1', [id]);
    if (!p) return [];
    const rows = await db.rows(`${BASE} WHERE p.active AND p.id <> $1 AND p.category_id IS NOT DISTINCT FROM $2
      AND (NOT p.track_stock OR p.stock > 0)
      ORDER BY (p.brand = $3 AND $3 <> '') DESC, abs(p.price_cents - $4) LIMIT $5`, [id, p.category_id, p.brand, p.price_cents, limit]);
    const sales = await activeSales();
    return rows.map((r) => present(r, sales));
  }
  async function boughtTogether(id, limit = 6) {
    const rows = await db.rows(`SELECT oi2.product_id, count(*) n FROM order_items oi1 JOIN order_items oi2 ON oi1.order_id = oi2.order_id AND oi2.product_id <> oi1.product_id
      WHERE oi1.product_id = $1 AND oi2.product_id IS NOT NULL GROUP BY oi2.product_id ORDER BY n DESC LIMIT $2`, [id, limit]);
    return rows.length ? (await listProducts({ ids: rows.map((r) => r.product_id) })).items : [];
  }
  // "Buy again": what this customer orders most, newest first as tie-break.
  async function buyAgain(customerId, limit = 24) {
    const rows = await db.rows(`SELECT oi.product_id, count(*) n, max(o.created_at) last FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.customer_id = $1 AND o.status IN ('placed','picking','ready','out_for_delivery','completed') AND oi.product_id IS NOT NULL AND oi.state <> 'out_of_stock'
      GROUP BY oi.product_id ORDER BY n DESC, last DESC LIMIT $2`, [customerId, limit]);
    return rows.length ? (await listProducts({ ids: rows.map((r) => r.product_id), limit })).items : [];
  }
  async function categories() {
    return db.rows(`SELECT c.id, c.slug, c.name, c.parent_id, c.image_url, c.sort, (SELECT count(*) FROM products p WHERE p.category_id = c.id AND p.active)::int AS product_count FROM categories c ORDER BY c.sort, c.name`);
  }

  // ---------- cart pricing ----------
  const normQty = (p, q) => {
    q = Number(q);
    if (!(q > 0)) return 0;
    return p.sold_by === 'lb' ? Math.max(0.5, Math.round(q * 4) / 4) : Math.max(1, Math.floor(q));
  };

  async function priceCart(items) {
    const ids = [...new Set((items || []).map((i) => Number(i.product_id)).filter(Boolean))];
    const prods = ids.length ? await db.rows('SELECT * FROM products WHERE id = ANY($1) AND active', [ids]) : [];
    const byId = new Map(prods.map((p) => [p.id, p]));
    const sales = await activeSales();
    const lines = [], problems = [];
    for (const it of items || []) {
      const p = byId.get(Number(it.product_id));
      if (!p) { problems.push({ product_id: Number(it.product_id), message: 'No longer available' }); continue; }
      let qty = normQty(p, it.qty); if (!qty) continue;
      const status = pricing.stockStatus(p);
      if (status === 'out') { problems.push({ product_id: p.id, name: p.name, message: 'Out of stock' }); continue; }
      if (p.track_stock && qty > Number(p.stock)) { problems.push({ product_id: p.id, name: p.name, message: `Only ${Number(p.stock)} left` }); qty = p.sold_by === 'lb' ? Math.floor(Number(p.stock) * 4) / 4 : Math.floor(Number(p.stock)); if (!(qty > 0)) continue; }
      const e = pricing.effectivePrice(p, sales);
      lines.push({ product_id: p.id, name: p.name, upc: p.upc || '', image_url: p.image_url, sold_by: p.sold_by, taxable: p.taxable, qty, unit_price_cents: e.price_cents, was_cents: e.was_cents, line_cents: Math.round(e.price_cents * qty), stock_status: status, size: p.size });
    }
    return { lines, problems };
  }

  async function totals(lines, deliveryFeeCents = 0) {
    const s = await settings.all();
    const subtotal = lines.reduce((a, l) => a + l.line_cents, 0);
    const taxable = lines.filter((l) => l.taxable).reduce((a, l) => a + l.line_cents, 0);
    const tax = Math.round(taxable * s.tax_rate);
    const savings = lines.reduce((a, l) => a + (l.was_cents ? Math.round((l.was_cents - l.unit_price_cents) * l.qty) : 0), 0);
    return { subtotal_cents: subtotal, tax_cents: tax, delivery_fee_cents: deliveryFeeCents, total_cents: subtotal + tax + deliveryFeeCents, savings_cents: savings };
  }

  // ---------- slots ----------
  async function slots(kind) {
    const s = await settings.all();
    const tz = s.store.timezone;
    const cfg = kind === 'pickup' ? s.pickup : s.delivery;
    const now = new Date();
    const earliest = new Date(now.getTime() + cfg.lead_minutes * 60000);
    const maxDays = s.pickup.max_days_ahead;
    const booked = await db.rows(`SELECT slot_start, count(*)::int n FROM orders WHERE status <> 'cancelled' AND status <> 'pending_payment' AND fulfillment = ANY($1) AND slot_start >= $2 GROUP BY slot_start`, [kind === 'pickup' ? ['pickup'] : ['uber'], now]);
    const taken = new Map(booked.map((b) => [new Date(b.slot_start).getTime(), b.n]));
    const out = [];
    for (let i = 0; i <= maxDays; i++) {
      const lp = localParts(new Date(now.getTime() + i * 86400000), tz);
      const h = s.hours[lp.dow];
      if (!h) continue;
      const [oh, om] = h[0].split(':').map(Number), [ch, cm] = h[1].split(':').map(Number);
      const open = localToDate(lp.y, lp.m, lp.d, oh, om, tz), close = localToDate(lp.y, lp.m, lp.d, ch, cm, tz);
      const win = cfg.window_minutes * 60000;
      for (let t = open.getTime(); t + win <= close.getTime(); t += win) {
        if (t < earliest.getTime()) continue;
        const left = cfg.capacity_per_window - (taken.get(t) || 0);
        if (left > 0) out.push({ start: new Date(t).toISOString(), end: new Date(t + win).toISOString(), date: `${lp.y}-${String(lp.m).padStart(2, '0')}-${String(lp.d).padStart(2, '0')}`, left });
      }
    }
    return out;
  }
  async function slotValid(kind, startIso) {
    return (await slots(kind)).find((x) => x.start === new Date(startIso).toISOString()) || null;
  }

  async function coopDrops() {
    return db.rows(`SELECT id, label, location, address, drop_date, window_text, cutoff_at FROM coop_drops WHERE active AND (cutoff_at IS NULL OR cutoff_at > now()) AND drop_date >= CURRENT_DATE ORDER BY drop_date`);
  }

  // ---------- delivery quote ----------
  async function quoteDelivery(address, subtotalCents) {
    const s = await settings.all();
    if (subtotalCents < s.delivery.min_order_cents) return { deliverable: false, fee_cents: 0, reason: `Delivery minimum is ${money(s.delivery.min_order_cents)}` };
    const pt = await geocoder.geocode(address);
    if (!pt) return { deliverable: false, fee_cents: 0, reason: "We couldn't find that address" };
    const d = miles(s.store, pt);
    return { ...deliveryFee(d, subtotalCents, s.delivery_tiers), miles: Math.round(d * 10) / 10, point: pt };
  }

  // ---------- customers ----------
  async function upsertCustomer({ email, name, phone, sms_ok }) {
    email = String(email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw httpErr(400, 'Please enter a valid email');
    return db.one(`INSERT INTO customers (email, name, phone, sms_ok) VALUES ($1,$2,$3,$4)
      ON CONFLICT (email) DO UPDATE SET name = COALESCE(NULLIF($2,''), customers.name), phone = COALESCE(NULLIF($3,''), customers.phone), sms_ok = customers.sms_ok OR $4 RETURNING *`,
      [email, name || '', phone || '', !!sms_ok]);
  }

  // ---------- checkout ----------
  async function checkout({ items, fulfillment, slot_start, address, coop_drop_id, sub_pref, note, customer, auth }) {
    if (!['pickup', 'uber', 'coop'].includes(fulfillment)) throw httpErr(400, 'Choose pickup or delivery');
    const subPref = ['substitute', 'call_sub', 'call_no_sub', 'never'].includes(sub_pref) ? sub_pref : 'substitute';
    const { lines, problems } = await priceCart(items);
    if (!lines.length) throw httpErr(400, 'Your cart is empty' + (problems.length ? ': ' + problems.map((p) => p.message).join(', ') : ''));
    const s = await settings.all();
    let slotStart = null, slotEnd = null, fee = 0, addr = null, coopId = null;
    const subtotal = lines.reduce((a, l) => a + l.line_cents, 0);
    if (fulfillment === 'pickup' || fulfillment === 'uber') {
      const sl = await slotValid(fulfillment === 'pickup' ? 'pickup' : 'delivery', slot_start);
      if (!sl) throw httpErr(409, 'That time is no longer available. Please pick another.');
      slotStart = sl.start; slotEnd = sl.end;
    }
    if (fulfillment === 'uber') {
      if (!address || !address.street || !address.city || !address.zip) throw httpErr(400, 'Please enter your delivery address');
      const q = await quoteDelivery(address, subtotal);
      if (!q.deliverable) throw httpErr(400, q.reason);
      fee = q.fee_cents; addr = { ...address, miles: q.miles, lat: q.point.lat, lng: q.point.lng };
    }
    if (fulfillment === 'coop') {
      const d = (await coopDrops()).find((x) => x.id === Number(coop_drop_id));
      if (!d) throw httpErr(409, 'That co-op drop is closed or unavailable');
      coopId = d.id;
      // co-op deliveries are free; the slot is the drop date
      slotStart = new Date(d.drop_date).toISOString();
    }
    const t = await totals(lines, fee);
    const cushion = Math.round(t.total_cents * (1 + s.auth_cushion_pct / 100));
    if (cushion < 50) throw httpErr(400, 'Order total is too small');
    const cust = await upsertCustomer(customer || {});
    if (auth && auth.customer_id && auth.customer_id !== cust.id) throw httpErr(403, 'Signed in as a different customer');
    const order = await db.tx(async (tx) => {
      const o = await tx.one(`INSERT INTO orders (public_token, customer_id, status, fulfillment, slot_start, slot_end, address, coop_drop_id, sub_pref, note, est_subtotal_cents, est_tax_cents, delivery_fee_cents, auth_cents)
        VALUES ($1,$2,'pending_payment',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
        [require('crypto').randomBytes(16).toString('hex'), cust.id, fulfillment, slotStart, slotEnd, addr, coopId, subPref, String(note || '').slice(0, 500), t.subtotal_cents, t.tax_cents, fee, cushion]);
      for (const l of lines) {
        await tx.q(`INSERT INTO order_items (order_id, product_id, name, upc, image_url, sold_by, taxable, unit_price_cents, qty) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [o.id, l.product_id, l.name, l.upc, l.image_url, l.sold_by, l.taxable, l.unit_price_cents, l.qty]);
      }
      return o;
    });
    const stripeCust = await payments.ensureCustomer({ email: cust.email, name: cust.name, existingId: cust.stripe_customer_id });
    if (stripeCust !== cust.stripe_customer_id) await db.q('UPDATE customers SET stripe_customer_id=$2 WHERE id=$1', [cust.id, stripeCust]);
    const pi = await payments.authorize({ amount_cents: cushion, customer_id: stripeCust, order_id: order.id, email: cust.email });
    await db.q('UPDATE orders SET payment_intent_id=$2 WHERE id=$1', [order.id, pi.id]);
    return { order_id: order.id, token: order.public_token, client_secret: pi.client_secret, totals: t, problems, auth_cents: cushion };
  }

  // Called after the customer finishes paying (browser confirm, or Stripe webhook). Idempotent.
  async function confirmPaid(orderId, token) {
    const o = await db.one('SELECT * FROM orders WHERE id=$1', [orderId]);
    if (!o || (token !== undefined && o.public_token !== token)) throw httpErr(404, 'Order not found');
    if (o.status !== 'pending_payment') return o;
    const st = await payments.status(o.payment_intent_id);
    if (st.status !== 'requires_capture') throw httpErr(402, 'Payment not completed yet');
    const upd = await db.one(`UPDATE orders SET status='placed' WHERE id=$1 AND status='pending_payment' RETURNING *`, [o.id]);
    if (!upd) return db.one('SELECT * FROM orders WHERE id=$1', [o.id]);
    await db.q(`UPDATE carts SET completed = TRUE WHERE customer_id = $1 AND NOT completed`, [o.customer_id]);
    const cust = await db.one('SELECT * FROM customers WHERE id=$1', [o.customer_id]);
    const where = o.fulfillment === 'pickup' ? 'pickup' : o.fulfillment === 'uber' ? 'delivery' : 'co-op delivery';
    await notifier.email(cust.email, `Bay Kosher order #${o.id} received`, `<p>Thank you${cust.name ? ', ' + esc(cust.name) : ''}! We received your ${where} order #${o.id}. We'll email${cust.sms_ok ? ' and text' : ''} you when it's ready.</p><p><a href="${publicUrl}/order/${o.id}?t=${o.public_token}">View your order</a></p>`);
    return upd;
  }

  async function cancelStale() {
    const stale = await db.rows(`SELECT id, payment_intent_id FROM orders WHERE status = 'pending_payment' AND created_at < now() - interval '90 minutes'`);
    for (const o of stale) {
      try { await confirmPaid(o.id); } catch {
        try { await payments.cancel(o.payment_intent_id); } catch {}
        await db.q(`UPDATE orders SET status='cancelled' WHERE id=$1 AND status='pending_payment'`, [o.id]);
      }
    }
    return stale.length;
  }

  // ---------- picking ----------
  const orderWithItems = async (id) => {
    const o = await db.one(`SELECT o.*, c.name AS customer_name, c.email AS customer_email, c.phone AS customer_phone, cd.label AS coop_label, cd.location AS coop_location
      FROM orders o JOIN customers c ON c.id = o.customer_id LEFT JOIN coop_drops cd ON cd.id = o.coop_drop_id WHERE o.id = $1`, [id]);
    if (!o) return null;
    o.items = await db.rows(`SELECT oi.*, p.stock AS stock_now, p.upc AS product_upc FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE order_id = $1 ORDER BY oi.id`, [id]);
    return o;
  };

  async function startPicking(orderId, picker) {
    const o = await db.one(`UPDATE orders SET status='picking', picker=$2, picking_started_at = COALESCE(picking_started_at, now()) WHERE id=$1 AND status IN ('placed','picking') RETURNING id`, [orderId, picker || '']);
    if (!o) throw httpErr(409, 'This order is not ready to pick');
    return orderWithItems(orderId);
  }

  async function findProduct(ref) {
    if (ref.product_id) return db.one('SELECT * FROM products WHERE id=$1', [ref.product_id]);
    if (ref.upc) return db.one('SELECT * FROM products WHERE upc=$1', [String(ref.upc).replace(/\D/g, '')]);
    return null;
  }
  async function unitPrice(p) { return pricing.effectivePrice(p, await activeSales()).price_cents; }

  async function itemAction(orderId, itemId, action, body = {}) {
    const o = await db.one('SELECT * FROM orders WHERE id=$1', [orderId]);
    if (!o || o.status !== 'picking') throw httpErr(409, 'Order is not being picked');
    const it = itemId ? await db.one('SELECT * FROM order_items WHERE id=$1 AND order_id=$2', [itemId, orderId]) : null;
    if (action !== 'add' && !it) throw httpErr(404, 'Item not found');
    const lineOf = (unit, qty) => Math.round(unit * qty);
    const needQty = (item, q) => {
      q = Number(q);
      if (!(q > 0)) throw httpErr(400, item.sold_by === 'lb' ? 'Enter the weight' : 'Enter a quantity');
      if (item.sold_by === 'lb' && q > 50) throw httpErr(400, 'That weight looks too large. Check the scale.');
      return item.sold_by === 'lb' ? Math.round(q * 100) / 100 : Math.round(q);
    };
    if (action === 'pick') {
      if (body.scanned_upc && it.upc && String(body.scanned_upc).replace(/\D/g, '') !== it.upc) throw httpErr(409, 'Wrong item scanned');
      const q = needQty(it, body.qty ?? (it.sold_by === 'lb' ? body.weight : it.qty));
      await db.q(`UPDATE order_items SET state='picked', final_qty=$2, final_unit_price_cents=unit_price_cents, line_total_cents=$3, sub_product_id=NULL, sub_name='' WHERE id=$1`, [it.id, q, lineOf(it.unit_price_cents, q)]);
    } else if (action === 'oos') {
      await db.q(`UPDATE order_items SET state='out_of_stock', final_qty=0, line_total_cents=0, picked_note=$2 WHERE id=$1`, [it.id, String(body.note || '').slice(0, 200)]);
    } else if (action === 'sub') {
      if (o.sub_pref === 'never') throw httpErr(409, 'Customer said never substitute');
      if ((o.sub_pref === 'call_sub' || o.sub_pref === 'call_no_sub') && !body.customer_approved) throw httpErr(409, 'Customer asked to be called before substituting. Confirm they approved.');
      const sp = await findProduct({ product_id: body.sub_product_id, upc: body.sub_upc });
      if (!sp) throw httpErr(404, 'Substitute product not found');
      const q = needQty(sp, body.qty ?? (sp.sold_by === 'lb' ? body.weight : it.qty));
      const unit = await unitPrice(sp);
      await db.q(`UPDATE order_items SET state='substituted', sub_product_id=$2, sub_name=$3, final_qty=$4, final_unit_price_cents=$5, line_total_cents=$6, sold_by=$7, taxable=$8, picked_note=$9 WHERE id=$1`,
        [it.id, sp.id, sp.name, q, unit, lineOf(unit, q), sp.sold_by, sp.taxable, String(body.note || '').slice(0, 200)]);
    } else if (action === 'undo') {
      await db.q(`UPDATE order_items SET state='pending', final_qty=NULL, final_unit_price_cents=NULL, line_total_cents=NULL, sub_product_id=NULL, sub_name='', picked_note='' WHERE id=$1`, [it.id]);
    } else if (action === 'add') {
      const p = await findProduct({ product_id: body.product_id, upc: body.upc });
      if (!p) throw httpErr(404, 'Product not found');
      const q = needQty(p, body.qty ?? body.weight ?? 1);
      const unit = await unitPrice(p);
      await db.q(`INSERT INTO order_items (order_id, product_id, name, upc, image_url, sold_by, taxable, unit_price_cents, qty, state, final_qty, final_unit_price_cents, line_total_cents, is_extra)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'picked',$9,$8,$10,TRUE)`, [orderId, p.id, p.name, p.upc || '', p.image_url, p.sold_by, p.taxable, unit, q, lineOf(unit, q)]);
    } else throw httpErr(400, 'Unknown action');
    return orderWithItems(orderId);
  }

  async function finishOrder(orderId) {
    const o0 = await orderWithItems(orderId);
    if (!o0 || o0.status !== 'picking') throw httpErr(409, 'Order is not being picked');
    const pending = o0.items.filter((i) => i.state === 'pending');
    if (pending.length) throw httpErr(409, `${pending.length} item${pending.length > 1 ? 's' : ''} still need an answer: ${pending.slice(0, 3).map((i) => i.name).join(', ')}`);
    const s = await settings.all();
    const live = o0.items.filter((i) => i.state === 'picked' || i.state === 'substituted');
    const subtotal = live.reduce((a, i) => a + i.line_total_cents, 0);
    const tax = Math.round(live.filter((i) => i.taxable).reduce((a, i) => a + i.line_total_cents, 0) * s.tax_rate);
    const fee = live.length ? o0.delivery_fee_cents : 0;
    const total = subtotal + tax + fee;
    let captured = 0, shortfall = 0, extraId = null, unpaid = 0;
    if (live.length) {
      captured = Math.min(total, o0.auth_cents);
      shortfall = total - captured;
      await payments.capture(o0.payment_intent_id, captured);
      // heavier weights / added items can push the total past the card hold: charge the difference to the same card
      if (shortfall >= 50) {
        try { extraId = (await payments.chargeShortfall({ payment_intent_id: o0.payment_intent_id, amount_cents: shortfall, order_id: orderId })).id; captured += shortfall; }
        catch { unpaid = shortfall; }
      } else shortfall = 0; // under 50 cents is not worth a separate charge
    } else {
      await payments.cancel(o0.payment_intent_id); // nothing was available: release the hold
    }
    const locked = await db.one(`UPDATE orders SET status = $2, final_subtotal_cents=$3, final_tax_cents=$4, final_total_cents=$5, captured_cents=$6, extra_charge_id=$7, unpaid_cents=$8, ready_at=now() WHERE id=$1 AND status='picking' RETURNING *`,
      [orderId, live.length ? 'ready' : 'cancelled', subtotal, tax, total, captured, extraId, unpaid]);
    if (!locked) throw httpErr(409, 'Order was already finished');
    // inventory: take picked quantities out of stock
    const touched = [];
    for (const i of live) {
      const pid = i.state === 'substituted' ? i.sub_product_id : i.product_id;
      if (!pid) continue;
      await db.q('UPDATE products SET stock = GREATEST(stock - $2, 0), updated_at = now() WHERE id=$1 AND track_stock', [pid, i.final_qty]);
      await db.q(`INSERT INTO stock_events (product_id, delta, reason) VALUES ($1,$2,'online')`, [pid, -Number(i.final_qty)]);
      touched.push(pid);
    }
    // "not in stock" from the picker means the shelf is empty: correct our count (and Clover's) to zero
    for (const i of o0.items.filter((x) => x.state === 'out_of_stock' && x.product_id)) {
      const z = await db.one('UPDATE products SET stock = 0, updated_at = now() WHERE id=$1 AND track_stock AND stock > 0 RETURNING stock', [i.product_id]).catch(() => null);
      if (z) touched.push(i.product_id);
    }
    dirty();
    if (clover) await require('./clover').pushStock({ db, clover, productIds: touched }).catch(() => {});
    // delivery hand-off
    let dispatchNote = '';
    if (live.length && o0.fulfillment === 'uber' && s.delivery.auto_dispatch && uber) {
      try { await dispatch(orderId); } catch (e) { dispatchNote = 'Uber dispatch failed: ' + e.message; }
    }
    await notifyReady(orderId);
    return { ...(await orderWithItems(orderId)), shortfall_cents: shortfall, extra_charged: !!extraId, dispatch_note: dispatchNote };
  }

  async function dispatch(orderId) {
    if (!uber) throw httpErr(501, 'Uber delivery is not connected');
    const o = await orderWithItems(orderId);
    if (o.fulfillment !== 'uber' || !['ready', 'out_for_delivery'].includes(o.status)) throw httpErr(409, 'Order cannot be dispatched');
    if (o.uber_delivery_id) return o;
    const s = await settings.all();
    const pickup = { name: s.store.name, street: s.store.address.split(',')[0], city: 'Lafayette', state: 'CA', zip: (s.store.address.match(/\b\d{5}\b/) || [''])[0], phone: s.store.phone };
    const a = o.address;
    const dropoff = { name: o.customer_name || 'Customer', phone: o.customer_phone, street: a.street, unit: a.unit, city: a.city, state: a.state, zip: a.zip, notes: a.notes };
    const q = await uber.quote({ pickup, dropoff });
    const d = await uber.create({ quote_id: q.id, pickup, dropoff, order_id: o.id, items: o.items.filter((i) => i.state === 'picked' || i.state === 'substituted').map((i) => ({ name: i.sub_name || i.name, qty: i.final_qty })) });
    await db.q(`UPDATE orders SET uber_delivery_id=$2, uber_tracking_url=$3, status='out_for_delivery' WHERE id=$1`, [orderId, d.id, d.tracking_url || '']);
    return orderWithItems(orderId);
  }

  async function markCompleted(orderId) {
    const o = await db.one(`UPDATE orders SET status='completed' WHERE id=$1 AND status IN ('ready','out_for_delivery') RETURNING id`, [orderId]);
    if (!o) throw httpErr(409, 'Order is not ready');
    return orderWithItems(orderId);
  }

  async function cancelOrder(orderId) {
    const o = await db.one('SELECT * FROM orders WHERE id=$1', [orderId]);
    if (!o) throw httpErr(404, 'Not found');
    if (!['placed', 'pending_payment'].includes(o.status)) throw httpErr(409, 'Only orders not yet picked can be cancelled');
    if (o.payment_intent_id) { try { await payments.cancel(o.payment_intent_id); } catch {} }
    await db.q(`UPDATE orders SET status='cancelled' WHERE id=$1`, [orderId]);
  }

  // ---------- receipt ----------
  function receipt(o) {
    const lines = o.items.map((i) => {
      let status = 'pending';
      if (i.state === 'picked') status = 'Fulfilled';
      else if (i.state === 'substituted') status = `Substituted with ${i.sub_name}`;
      else if (i.state === 'out_of_stock') status = 'Not in stock (not charged)';
      return { name: i.name, status, state: i.state, qty_ordered: Number(i.qty), qty_final: i.final_qty == null ? null : Number(i.final_qty), sold_by: i.sold_by, unit_price_cents: i.final_unit_price_cents ?? i.unit_price_cents, line_total_cents: i.line_total_cents, is_extra: i.is_extra };
    });
    return { order_id: o.id, status: o.status, fulfillment: o.fulfillment, lines, subtotal_cents: o.final_subtotal_cents ?? o.est_subtotal_cents, tax_cents: o.final_tax_cents ?? o.est_tax_cents, delivery_fee_cents: o.delivery_fee_cents, total_cents: o.final_total_cents ?? (o.est_subtotal_cents + o.est_tax_cents + o.delivery_fee_cents), charged_cents: o.captured_cents };
  }
  function receiptHtml(r) {
    const rows = r.lines.map((l) => `<tr><td>${esc(l.name)}${l.is_extra ? ' (added)' : ''}<br><small>${esc(l.status)}</small></td><td align="right">${l.qty_final == null ? '' : l.qty_final + (l.sold_by === 'lb' ? ' lb' : '')}</td><td align="right">${l.line_total_cents == null ? '' : money(l.line_total_cents)}</td></tr>`).join('');
    return `<table width="100%" cellpadding="6" style="border-collapse:collapse;font-family:sans-serif;font-size:14px">${rows}
      <tr><td colspan="2" align="right">Subtotal</td><td align="right">${money(r.subtotal_cents)}</td></tr>
      ${r.tax_cents ? `<tr><td colspan="2" align="right">Tax</td><td align="right">${money(r.tax_cents)}</td></tr>` : ''}
      ${r.delivery_fee_cents ? `<tr><td colspan="2" align="right">Delivery</td><td align="right">${money(r.delivery_fee_cents)}</td></tr>` : ''}
      <tr><td colspan="2" align="right"><b>Total charged</b></td><td align="right"><b>${money(r.charged_cents ?? r.total_cents)}</b></td></tr></table>`;
  }
  async function notifyReady(orderId) {
    const o = await orderWithItems(orderId);
    const cust = { email: o.customer_email, phone: o.customer_phone };
    if (o.status === 'cancelled') { await notifier.email(cust.email, `Bay Kosher order #${o.id}`, `<p>We're sorry, none of the items in order #${o.id} were available, so you have not been charged.</p>`); return; }
    const r = receipt(o);
    const missing = r.lines.filter((l) => l.state === 'out_of_stock').length, subs = r.lines.filter((l) => l.state === 'substituted').length;
    const where = o.fulfillment === 'pickup' ? 'ready for pickup at 3477 Golden Gate Way' : o.fulfillment === 'uber' ? 'on its way to you' : 'ready for the co-op delivery';
    await notifier.email(cust.email, `Your Bay Kosher order #${o.id} is ready`,
      `<p>Your order is ${where}.${missing ? ` ${missing} item${missing > 1 ? 's were' : ' was'} not in stock.` : ''}${subs ? ` ${subs} substitution${subs > 1 ? 's' : ''}.` : ''}</p>${receiptHtml(r)}<p><a href="${publicUrl}/order/${o.id}?t=${o.public_token}">View receipt</a></p>`);
    if (o.customer_phone && (await db.one('SELECT sms_ok FROM customers WHERE id=$1', [o.customer_id])).sms_ok) {
      await notifier.sms(o.customer_phone, `Bay Kosher: order #${o.id} is ${where}. Total ${money(r.charged_cents ?? r.total_cents)}. ${publicUrl}/order/${o.id}?t=${o.public_token}`);
    }
  }

  return { index, dirty, ensureIndex, present, listProducts, getProduct, similar, boughtTogether, buyAgain, categories, priceCart, totals, slots, coopDrops, quoteDelivery, upsertCustomer, checkout, confirmPaid, cancelStale, orderWithItems, startPicking, itemAction, finishOrder, dispatch, markCompleted, cancelOrder, receipt, receiptHtml, notifyReady, activeSales, httpErr, slugify, money };
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

module.exports = { createCore, esc, money, slugify, httpErr, localToDate, localParts };
