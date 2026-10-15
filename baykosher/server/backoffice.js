// Back-office logic: product editing, invoice import (cost + stock + repricing), supplier markup, sales preview,
// reorder suggestions, weekly email.
'use strict';
const pricing = require('./pricing');
const { httpErr, esc, money, slugify } = require('./core');

// Minimal CSV parser (quotes, commas, newlines).
function parseCsv(text) {
  const rows = []; let row = [], cur = '', q = false;
  const s = String(text).replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some((x) => x.trim() !== '')) rows.push(row); row = []; }
    else cur += c;
  }
  row.push(cur); if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}
const dollarsToCents = (v) => Math.round(Number(String(v).replace(/[$,\s]/g, '')) * 100);

// Turn invoice CSV text into line objects. Headers are matched loosely: upc/barcode, description/item/name, qty, cost/price, pack/case.
function parseInvoiceCsv(text) {
  const [head, ...body] = parseCsv(text);
  if (!head) return [];
  const h = head.map((x) => x.trim().toLowerCase());
  const find = (...names) => h.findIndex((x) => names.some((n) => x === n || x.includes(n)));
  const iUpc = find('upc', 'barcode', 'code'), iDesc = find('description', 'item', 'name', 'product'), iQty = find('qty', 'quantity', 'cases', 'units'),
    iCost = find('unit cost', 'unit_cost', 'cost', 'price'), iPack = find('pack', 'per case', 'case size');
  if (iQty < 0 || iCost < 0) throw httpErr(400, 'CSV needs qty and cost columns');
  return body.map((r) => ({
    upc: iUpc >= 0 ? String(r[iUpc] || '').replace(/\D/g, '') : '', description: iDesc >= 0 ? (r[iDesc] || '').trim() : '',
    qty: Number(r[iQty]), unit_cost_cents: dollarsToCents(r[iCost]), pack: iPack >= 0 ? Number(r[iPack]) || 1 : 1,
  })).filter((l) => l.qty > 0 && l.unit_cost_cents >= 0 && (l.upc || l.description));
}

function createBackoffice({ db, settings, core, notifier, upc, publicUrl = '' }) {
  // ---- products ----
  const FIELDS = ['upc', 'sku', 'name', 'name_he', 'description_he', 'est_weight_lb', 'featured', 'kosher_type', 'passover', 'holidays', 'supplier_sku', 'case_size', 'snap', 'brand', 'size', 'description', 'ingredients', 'nutrition', 'image_url', 'kosher_cert', 'tags', 'category_id', 'supplier_id', 'sold_by', 'price_cents', 'cost_cents', 'price_locked', 'taxable', 'stock', 'low_stock_at', 'track_stock', 'active'];
  const clean = (k, v) => {
    if (k === 'upc') { v = String(v || '').replace(/\D/g, ''); return v || null; }
    if (k === 'nutrition') return JSON.stringify(v && typeof v === 'object' ? v : {});
    if (['category_id', 'supplier_id'].includes(k)) return v ? Number(v) : null;
    if (k === 'est_weight_lb' || k === 'case_size') return Number(v) > 0 ? Number(v) : null;
    if (k === 'kosher_type') return ['meat', 'dairy', 'pareve'].includes(v) ? v : '';
    if (k === 'passover') return ['yes', 'no'].includes(v) ? v : 'unknown';
    if (k === 'holidays') { const ok = require('./holidays').slugs(); return [...new Set((Array.isArray(v) ? v : String(v || '').split(',')).map((x) => String(x).trim()).filter((x) => ok.includes(x)))].join(','); }
    if (['price_cents'].includes(k)) return Math.max(0, Math.round(Number(v) || 0));
    if (['cost_cents', 'stock', 'low_stock_at'].includes(k)) return Math.max(0, Number(v) || 0);
    if (['price_locked', 'taxable', 'track_stock', 'active', 'featured', 'snap'].includes(k)) return !!v;
    if (k === 'sold_by') return v === 'lb' ? 'lb' : 'each';
    return String(v ?? '').trim();
  };
  async function saveProduct(id, input) {
    if (id === null && !String(input.name || '').trim()) throw httpErr(400, 'Name is required');
    // category default taxability for new products
    if (id === null && input.taxable === undefined && input.category_id) {
      const c = await db.one('SELECT taxable_default FROM categories WHERE id=$1', [input.category_id]); if (c) input.taxable = c.taxable_default;
    }
    // auto-price from supplier markup when price missing but cost known
    if (id === null && !input.price_cents && input.cost_cents && input.supplier_id) {
      const sup = await db.one('SELECT markup_pct FROM suppliers WHERE id=$1', [input.supplier_id]);
      if (sup) input.price_cents = pricing.suggestPrice(Number(input.cost_cents), sup.markup_pct);
    }
    const keys = FIELDS.filter((k) => input[k] !== undefined);
    const vals = keys.map((k) => clean(k, input[k]));
    try {
      let row;
      if (id === null) row = await db.one(`INSERT INTO products (${keys.join(',')}) VALUES (${keys.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING *`, vals);
      else {
        if (!keys.length) return db.one('SELECT * FROM products WHERE id=$1', [id]);
        row = await db.one(`UPDATE products SET ${keys.map((k, i) => `${k}=$${i + 2}`).join(',')}, updated_at=now() WHERE id=$1 RETURNING *`, [id, ...vals]);
        if (!row) throw httpErr(404, 'Product not found');
      }
      core.dirty(); return row;
    } catch (e) {
      if (e.code === '23505') throw httpErr(409, 'A product with that barcode already exists');
      throw e;
    }
  }

  // Look a UPC up online and merge into a draft product (does not save).
  async function draftFromUpc(code) {
    const existing = await db.one('SELECT id, name FROM products WHERE upc = $1', [String(code).replace(/\D/g, '')]);
    if (existing) return { exists: existing };
    const r = await upc.lookup(code);
    if (!r) return { found: false, upc: String(code).replace(/\D/g, '') };
    return { found: true, draft: r };
  }

  // ---- markup ----
  async function repriceSupplier(supplierId, { apply = false, only = 'unlocked' } = {}) {
    const sup = await db.one('SELECT * FROM suppliers WHERE id=$1', [supplierId]);
    if (!sup) throw httpErr(404, 'Supplier not found');
    const ps = await db.rows('SELECT id, name, cost_cents, price_cents, price_locked FROM products WHERE supplier_id=$1 AND cost_cents > 0', [supplierId]);
    const changes = [];
    for (const p of ps) {
      if (p.price_locked && only === 'unlocked') continue;
      const next = pricing.suggestPrice(Number(p.cost_cents), sup.markup_pct);
      if (next !== p.price_cents) changes.push({ id: p.id, name: p.name, cost_cents: Number(p.cost_cents), old_price_cents: p.price_cents, new_price_cents: next });
    }
    if (apply && changes.length) {
      await db.tx(async (tx) => { for (const c of changes) await tx.q('UPDATE products SET price_cents=$2, updated_at=now() WHERE id=$1', [c.id, c.new_price_cents]); });
      core.dirty();
    }
    return { supplier: sup.name, markup_pct: Number(sup.markup_pct), count: changes.length, changes };
  }

  // ---- invoices ----
  async function importInvoice({ supplier_id, invoice_no = '', invoice_date, shipping_cents = 0, lines, commit = false, reprice = 'new_only', create_missing = false, notes = '' }) {
    if (!Array.isArray(lines) || !lines.length) throw httpErr(400, 'No invoice lines');
    const sup = supplier_id ? await db.one('SELECT * FROM suppliers WHERE id=$1', [supplier_id]) : null;
    if (supplier_id && !sup) throw httpErr(404, 'Supplier not found');
    // per-unit cost and units from case pack
    const norm = lines.map((l) => {
      const pack = Number(l.pack) > 0 ? Number(l.pack) : 1;
      const unitCost = l.unit_cost_cents != null ? Number(l.unit_cost_cents) : dollarsToCents(l.unit_cost);
      return { upc: String(l.upc || '').replace(/\D/g, ''), description: String(l.description || '').trim(), qty: Number(l.qty) * pack, unit_cost_cents: Math.round(unitCost / pack) };
    });
    if (norm.some((l) => !(l.qty > 0) || !Number.isFinite(l.unit_cost_cents))) throw httpErr(400, 'Every line needs a quantity and cost');
    const withLanded = pricing.allocateShipping(norm, Number(shipping_cents) || 0);
    const matched = [];
    for (const l of withLanded) {
      let p = l.upc ? await db.one('SELECT * FROM products WHERE upc=$1', [l.upc]) : null;
      if (!p && l.description) p = await db.one('SELECT * FROM products WHERE lower(name)=lower($1) ORDER BY id LIMIT 1', [l.description]);
      const out = { ...l, product_id: p ? p.id : null, product_name: p ? p.name : null, old_cost_cents: p ? Number(p.cost_cents) : null, old_price_cents: p ? p.price_cents : null };
      if (p) {
        const doIt = !p.price_locked && sup && (reprice === 'all' || (reprice === 'new_only' && p.price_cents === 0));
        out.new_price_cents = doIt ? pricing.suggestPrice(l.landed_cost_cents, sup.markup_pct) : null;
        if (reprice === 'all' && !p.price_locked && sup && out.new_price_cents === p.price_cents) out.new_price_cents = null;
      }
      matched.push(out);
    }
    const summary = { lines: matched, unmatched: matched.filter((m) => !m.product_id).length, total_cents: Math.round(matched.reduce((a, l) => a + l.qty * l.unit_cost_cents, 0)) + (Number(shipping_cents) || 0) };
    if (!commit) return { preview: true, ...summary };
    return db.tx(async (tx) => {
      const inv = await tx.one('INSERT INTO invoices (supplier_id, invoice_no, invoice_date, shipping_cents, notes) VALUES ($1,$2,COALESCE($3::date, CURRENT_DATE),$4,$5) RETURNING *', [supplier_id || null, invoice_no, invoice_date || null, Number(shipping_cents) || 0, notes]);
      const created = [];
      for (const m of matched) {
        let pid = m.product_id;
        if (!pid && create_missing) {
          const np = await tx.one(`INSERT INTO products (upc, name, supplier_id, cost_cents, price_cents, stock, active) VALUES (NULLIF($1,''),$2,$3,$4,$5,0,FALSE) RETURNING id`,
            [m.upc, m.description || 'Unnamed item ' + m.upc, supplier_id || null, m.landed_cost_cents, sup ? pricing.suggestPrice(m.landed_cost_cents, sup.markup_pct) : 0]);
          pid = np.id; created.push(pid); m.product_id = pid;
        }
        await tx.q('INSERT INTO invoice_lines (invoice_id, product_id, upc, description, qty, unit_cost_cents, landed_cost_cents) VALUES ($1,$2,$3,$4,$5,$6,$7)', [inv.id, pid, m.upc, m.description, m.qty, m.unit_cost_cents, m.landed_cost_cents]);
        if (pid) {
          await tx.q('UPDATE products SET cost_cents=$2, stock = stock + $3, supplier_id = COALESCE(supplier_id, $4), updated_at=now() WHERE id=$1', [pid, m.landed_cost_cents, m.qty, supplier_id || null]);
          await tx.q(`INSERT INTO stock_events (product_id, delta, reason) VALUES ($1,$2,'invoice')`, [pid, m.qty]);
          if (m.new_price_cents) await tx.q('UPDATE products SET price_cents=$2 WHERE id=$1', [pid, m.new_price_cents]);
        }
      }
      core.dirty();
      return { preview: false, invoice_id: inv.id, created_product_ids: created, ...summary };
    });
  }

  // ---- sales ----
  async function previewSale(spec) {
    const now = new Date();
    const sale = { ...spec, active: true, starts_at: null, ends_at: null };
    const ps = await db.rows('SELECT * FROM products WHERE active');
    const hits = [];
    for (const p of ps) {
      if (!pricing.saleApplies(sale, p, now)) continue;
      const c = pricing.salePrice(sale, p);
      if (c == null) continue;
      hits.push({ id: p.id, name: p.name, regular_cents: p.price_cents, sale_cents: c, cost_cents: Number(p.cost_cents) || null, margin_pct: p.cost_cents > 0 ? Math.round(((c - p.cost_cents) / c) * 100) : null, below_cost: p.cost_cents > 0 && c < p.cost_cents });
    }
    return { count: hits.length, items: hits.slice(0, 200) };
  }
  const SALE_COLS = ['name', 'kind', 'value', 'scope_type', 'scope_value', 'starts_at', 'ends_at', 'allow_below_cost', 'active'];
  async function saveSale(id, s) {
    if (!s.name || !['percent', 'margin', 'price'].includes(s.kind) || !(Number(s.value) >= 0)) throw httpErr(400, 'Sale needs a name, type and value');
    if (s.kind === 'percent' && Number(s.value) >= 100) throw httpErr(400, 'Percent off must be under 100');
    const vals = [s.name, s.kind, Number(s.value), s.scope_type || 'all', String(s.scope_value ?? ''), s.starts_at || null, s.ends_at || null, !!s.allow_below_cost, s.active !== false];
    const row = id === null
      ? await db.one(`INSERT INTO sales (${SALE_COLS.join(',')}) VALUES (${SALE_COLS.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING *`, vals)
      : await db.one(`UPDATE sales SET ${SALE_COLS.map((c, i) => `${c}=$${i + 2}`).join(',')} WHERE id=$1 RETURNING *`, [id, ...vals]);
    if (!row) throw httpErr(404, 'Sale not found');
    return row;
  }

  // ---- reorder suggestions ----
  async function reorderReport({ windowDays = 28, coverDays = 14, leadDays = 3 } = {}) {
    const rows = await db.rows(`SELECT p.id, p.name, p.upc, p.stock, p.cost_cents, p.supplier_id, s.name AS supplier,
        COALESCE((SELECT sum(-delta) FROM stock_events e WHERE e.product_id = p.id AND e.delta < 0 AND e.reason IN ('online','clover_sync') AND e.created_at > now() - ($1 || ' days')::interval), 0) AS sold
      FROM products p LEFT JOIN suppliers s ON s.id = p.supplier_id WHERE p.track_stock AND p.active OR (p.track_stock AND p.stock = 0)`, [String(windowDays)]);
    return rows.map((r) => ({ ...r, stock: Number(r.stock), sold: Number(r.sold), ...pricing.reorderHint({ stock: r.stock, soldInWindow: Number(r.sold), windowDays, coverDays, leadDays }) }))
      .filter((r) => r.order_qty > 0 && r.sold > 0).sort((a, b) => (b.urgent - a.urgent) || ((a.days_left ?? 1e9) - (b.days_left ?? 1e9)));
  }

  // ---- weekly email ----
  const emailCard = (p) => `<td width="50%" style="padding:8px;vertical-align:top;font-family:sans-serif"><a href="${publicUrl}/p/${p.id}-${p.slug}" style="color:#00209f;text-decoration:none">${p.image_url ? `<img src="${esc(p.image_url)}" width="140" alt="" style="display:block;margin-bottom:6px">` : ''}<div style="font-size:14px">${esc(p.name)}</div></a><div style="font-weight:bold">${p.was_cents ? `<span style="color:#b00020">${money(p.price_cents)}</span> <s style="color:#777;font-weight:normal">${money(p.was_cents)}</s>` : money(p.price_cents)}${p.sold_by === 'lb' ? ' / lb' : ''}</div></td>`;
  async function buildWeekly() {
    const s = await settings.all();
    const onSale = (await core.listProducts({ sale: true, sort: 'discount', limit: 12, inStockOnly: true })).items;
    const newRows = await db.rows(`SELECT id FROM products WHERE active AND created_at > now() - interval '10 days' AND (NOT track_stock OR stock > 0) ORDER BY created_at DESC LIMIT 8`);
    const fresh = newRows.length ? (await core.listProducts({ ids: newRows.map((r) => r.id) })).items : [];
    const grid = (items) => { let h = '<table width="100%" cellspacing="0">'; for (let i = 0; i < items.length; i += 2) h += `<tr>${emailCard(items[i])}${items[i + 1] ? emailCard(items[i + 1]) : '<td></td>'}</tr>`; return h + '</table>'; };
    const html = `<div style="max-width:600px;margin:auto;font-family:sans-serif"><h1 style="color:#00209f">This week at Bay Kosher</h1>
      ${onSale.length ? `<h2>On sale</h2>${grid(onSale)}` : ''}${fresh.length ? `<h2>New this week</h2>${grid(fresh)}` : ''}
      <p><a href="${publicUrl}/sale" style="background:#00209f;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none">Shop now</a></p>
      <hr><p style="font-size:12px;color:#666">${esc(s.store.name)}, ${esc(s.store.address)}. <a href="{{unsub}}">Unsubscribe</a></p></div>`;
    return { subject: onSale.length ? `This week at Bay Kosher: up to ${Math.max(...onSale.map((p) => p.percent_off))}% off` : 'New at Bay Kosher', html, sale_count: onSale.length, new_count: fresh.length };
  }
  async function recipients() {
    return db.rows(`SELECT email, token FROM subscribers WHERE subscribed
      UNION SELECT c.email, (SELECT token FROM subscribers s WHERE s.email = c.email) FROM customers c WHERE c.email_ok AND c.email NOT IN (SELECT email FROM subscribers WHERE NOT subscribed)`);
  }
  async function sendCampaign({ subject, html, testTo }) {
    const mk = async (email) => {
      let t = (await db.one('SELECT token FROM subscribers WHERE email=$1', [email]))?.token;
      if (!t) t = (await db.one(`INSERT INTO subscribers (email, token) VALUES ($1,$2) ON CONFLICT (email) DO UPDATE SET email=EXCLUDED.email RETURNING token`, [email, require('crypto').randomBytes(16).toString('hex')])).token;
      return `${publicUrl}/unsubscribe/${t}`;
    };
    if (testTo) { await notifier.email(testTo, '[TEST] ' + subject, html.replace('{{unsub}}', publicUrl + '/unsubscribe/test')); return { sent: 1, test: true }; }
    const c = await db.one('INSERT INTO campaigns (subject, html) VALUES ($1,$2) RETURNING id', [subject, html]);
    let sent = 0;
    for (const r of await recipients()) {
      if (await notifier.email(r.email, subject, html.replace('{{unsub}}', await mk(r.email)))) sent++;
    }
    await db.q('UPDATE campaigns SET sent_at=now(), sent_count=$2 WHERE id=$1', [c.id, sent]);
    return { sent, campaign_id: c.id, live: notifier.live.email };
  }

  // ---- dashboard ----
  async function dashboard() {
    const [orders, low, oos, noImg, unreviewed, sales30] = await Promise.all([
      db.rows(`SELECT status, count(*)::int n FROM orders WHERE status IN ('placed','picking','ready','out_for_delivery') GROUP BY status`),
      db.one(`SELECT count(*)::int n FROM products WHERE active AND track_stock AND stock > 0 AND stock <= low_stock_at`),
      db.one(`SELECT count(*)::int n FROM products WHERE active AND track_stock AND stock <= 0`),
      db.one(`SELECT count(*)::int n FROM products WHERE active AND image_url = ''`),
      db.one(`SELECT count(*)::int n FROM products WHERE NOT active`),
      db.one(`SELECT COALESCE(sum(captured_cents),0)::int c, count(*)::int n FROM orders WHERE captured_cents IS NOT NULL AND created_at > now() - interval '30 days'`),
    ]);
    const unpaid = await db.one(`SELECT count(*)::int n, COALESCE(sum(unpaid_cents),0)::int c FROM orders WHERE unpaid_cents > 0`);
    const carts = await db.one(`SELECT count(*)::int n FROM carts WHERE NOT completed AND jsonb_array_length(items) > 0 AND updated_at > now() - interval '3 days'`);
    return { orders: Object.fromEntries(orders.map((o) => [o.status, o.n])), low_stock: low.n, out_of_stock: oos.n, missing_images: noImg.n, hidden_products: unreviewed.n, revenue_30d_cents: sales30.c, orders_30d: sales30.n, open_carts: carts.n, unpaid_orders: unpaid.n, unpaid_cents: unpaid.c };
  }

  return { parseInvoiceCsv, saveProduct, draftFromUpc, repriceSupplier, importInvoice, previewSale, saveSale, reorderReport, buildWeekly, sendCampaign, recipients, dashboard, slugify };
}

module.exports = { createBackoffice, parseCsv, parseInvoiceCsv };
