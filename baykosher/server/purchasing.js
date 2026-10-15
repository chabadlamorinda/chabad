// Purchasing: supplier invoices in (uploaded, emailed, or typed), matched to products, reviewed, then applied to
// cost, stock and prices; freight/pallet bills spread over the goods they carried; reorder -> purchase orders.
'use strict';
const crypto = require('crypto');
const pricing = require('./pricing');
const { createIndex, norm } = require('./search');
const { httpErr, esc, money } = require('./core');

function createPurchasing({ db, settings, core, back, extractor, notifier, publicUrl = '' }) {
  // ---------- documents (the original PDF/photo stays viewable next to the review screen) ----------
  async function storeDocument(buffer, filename, contentType) {
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    await db.q('INSERT INTO documents (hash, filename, content_type, data) VALUES ($1,$2,$3,$4) ON CONFLICT (hash) DO NOTHING', [hash, String(filename || '').slice(0, 200), contentType || 'application/octet-stream', buffer]);
    return hash;
  }

  // ---------- supplier + product matching ----------
  async function resolveSupplier(name, email) {
    const n = norm(name);
    if (email) { const s = await db.one(`SELECT * FROM suppliers WHERE lower(email) = $1`, [String(email).toLowerCase()]); if (s) return s; }
    if (!n) return null;
    const all = await db.rows('SELECT * FROM suppliers');
    return all.find((s) => norm(s.name) === n) || all.find((s) => { const m = norm(s.name); return m.length >= 4 && n.length >= 4 && (m.includes(n) || n.includes(m)); }) || null;
  }

  let idx = null, idxAt = 0;
  async function productIndex() {
    if (idx && Date.now() - idxAt < 30000) return idx;
    const rows = await db.rows('SELECT id, name, name_he, brand, upc, tags, stock, track_stock FROM products'); // hidden items too: they came from earlier invoices
    idx = createIndex(); idx.build(rows); idxAt = Date.now(); return idx;
  }

  // For every line: matched (barcode / supplier item # / exact name), suggested (similar name), or new.
  async function matchLines(lines, supplierId) {
    const index = await productIndex();
    const out = [];
    for (const l of lines) {
      let p = null, how = '';
      if (l.upc) { p = await db.one('SELECT * FROM products WHERE upc=$1', [l.upc]); how = 'barcode'; }
      if (!p && l.supplier_sku && supplierId) { p = await db.one('SELECT * FROM products WHERE supplier_id=$1 AND supplier_sku=$2 ORDER BY id LIMIT 1', [supplierId, l.supplier_sku]); how = 'supplier item #'; }
      if (!p && l.description) { p = await db.one('SELECT * FROM products WHERE lower(name)=lower($1) ORDER BY id LIMIT 1', [l.description]); how = 'name'; }
      let suggested = null;
      if (!p && l.description) {
        // try the whole description, then without sizes/numbers, then the first few words
        const words = norm(l.description).split(' ');
        for (const q of [l.description, words.filter((w) => !/\d/.test(w)).join(' '), words.slice(0, 3).join(' ')]) {
          const top = q ? index.search(q, 3)[0] : null;
          if (top && top.score >= 7) { suggested = await db.one('SELECT id, name FROM products WHERE id=$1', [top.id]); break; }
        }
      }
      const perUnit = l.pack > 1 ? l.unit_cost_cents / l.pack : l.unit_cost_cents;
      out.push({ ...l, product_id: p ? p.id : null, product_name: p ? p.name : null, matched_by: p ? how : '', state: p ? 'matched' : suggested ? 'suggested' : 'new',
        suggested_product_id: suggested ? suggested.id : null, suggested_name: suggested ? suggested.name : null, current_cost_cents: p ? Number(p.cost_cents) : null,
        change_pct: p && Number(p.cost_cents) > 0 ? Math.round(((perUnit - Number(p.cost_cents)) / Number(p.cost_cents)) * 1000) / 10 : null, skip: false, create_new: !p });
    }
    return out;
  }

  // ---------- intake ----------
  async function ingest({ buffer = null, mediaType = '', text = '', filename = '', source = 'upload', sourceRef = null, sender = '', subject = '', actor = '' }) {
    const body = buffer || Buffer.from(text || '', 'utf8');
    if (!body.length) throw httpErr(400, 'Empty document');
    const fileHash = crypto.createHash('sha256').update(body).digest('hex');
    const dup = await db.one('SELECT id, status FROM invoices WHERE file_hash=$1 OR ($2::text IS NOT NULL AND source_ref=$2)', [fileHash, sourceRef]);
    if (dup) return { duplicate: true, invoice_id: dup.id, status: dup.status };
    const docHash = buffer ? await storeDocument(buffer, filename, mediaType) : null;
    let draft, error = '';
    try { draft = await extractor.extract({ buffer, mediaType, text, filename, sender, subject }); }
    catch (e) { error = String(e.message || e).slice(0, 300); draft = { is_invoice: true, kind: 'goods', supplier_name: '', supplier_email: '', invoice_no: '', invoice_date: '', freight_cents: 0, total_cents: 0, subtotal_cents: 0, notes: '', lines: [] }; }
    if (!error && !draft.is_invoice) {
      const r = await db.one(`INSERT INTO invoices (status, source, source_ref, file_hash, notes, draft, error) VALUES ('ignored',$1,$2,$3,$4,$5,'Not an invoice') RETURNING id`, [source, sourceRef, fileHash, filename || subject, JSON.stringify({ ...draft, doc_hash: docHash })]);
      return { invoice_id: r.id, status: 'ignored' };
    }
    const sup = await resolveSupplier(draft.supplier_name, draft.supplier_email || (sender.match(/<([^>]+)>/) || [, sender])[1]);
    const warnings = [];
    if (draft.invoice_no && sup) { const same = await db.one(`SELECT id FROM invoices WHERE supplier_id=$1 AND invoice_no=$2 AND status='applied'`, [sup.id, draft.invoice_no]); if (same) warnings.push(`Invoice ${draft.invoice_no} from ${sup.name} was already applied (#${same.id}).`); }
    const lines = await matchLines(draft.lines, sup ? sup.id : null);
    const calc = lines.reduce((a, l) => a + l.qty * l.unit_cost_cents, 0);
    if (draft.subtotal_cents && Math.abs(calc - draft.subtotal_cents) > Math.max(100, draft.subtotal_cents * 0.02)) warnings.push(`Lines add up to ${money(calc)} but the invoice subtotal says ${money(draft.subtotal_cents)}. Check quantities and prices.`);
    const r = await db.one(`INSERT INTO invoices (supplier_id, supplier_name_raw, invoice_no, invoice_date, shipping_cents, status, kind, source, source_ref, file_hash, draft, total_cents, error, notes)
      VALUES ($1,$2,$3,COALESCE($4::date, CURRENT_DATE),$5,'review',$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [sup ? sup.id : null, draft.supplier_name, draft.invoice_no, draft.invoice_date || null, draft.freight_cents || 0, draft.kind, source, sourceRef, fileHash, JSON.stringify({ ...draft, lines, warnings, doc_hash: docHash, sender, subject }), draft.total_cents || null, error, draft.notes || '']);
    return { invoice_id: r.id, status: 'review', lines: lines.length, error };
  }

  // ---------- review screen ----------
  async function getInvoice(id) {
    const inv = await db.one(`SELECT i.*, to_char(i.invoice_date, 'YYYY-MM-DD') AS invoice_date_str, s.name AS supplier_name, s.markup_pct FROM invoices i LEFT JOIN suppliers s ON s.id = i.supplier_id WHERE i.id=$1`, [id]);
    if (!inv) throw httpErr(404, 'Not found');
    return inv;
  }
  async function listInvoices(status) {
    return db.rows(`SELECT i.id, i.status, i.kind, i.source, i.invoice_no, i.invoice_date, i.created_at, i.applied_at, i.shipping_cents, i.total_cents, i.error, COALESCE(s.name, i.supplier_name_raw) AS supplier,
        COALESCE(jsonb_array_length(i.draft->'lines'), (SELECT count(*)::int FROM invoice_lines WHERE invoice_id = i.id)) AS lines
      FROM invoices i LEFT JOIN suppliers s ON s.id = i.supplier_id WHERE ($1::text IS NULL OR i.status = $1) ORDER BY i.id DESC LIMIT 200`, [status || null]);
  }
  async function updateDraft(id, patch) {
    const inv = await getInvoice(id);
    if (inv.status !== 'review') throw httpErr(409, 'This invoice is already done');
    const draft = inv.draft || { lines: [] };
    let supplierId = patch.supplier_id !== undefined ? (patch.supplier_id ? Number(patch.supplier_id) : null) : inv.supplier_id;
    if (patch.new_supplier_name) supplierId = (await db.one(`INSERT INTO suppliers (name, markup_pct) VALUES ($1, 30) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`, [String(patch.new_supplier_name).trim()])).id;
    if (patch.lines) {
      draft.lines = patch.lines.map((l) => ({ upc: String(l.upc || '').replace(/\D/g, ''), supplier_sku: String(l.supplier_sku || ''), description: String(l.description || ''), qty: Number(l.qty), unit: l.unit || 'each', pack: Number(l.pack) > 0 ? Number(l.pack) : 1,
        unit_cost_cents: Math.round(Number(l.unit_cost_cents)), product_id: l.product_id ? Number(l.product_id) : null, skip: !!l.skip, create_new: l.create_new !== false, state: l.state, product_name: l.product_name, suggested_product_id: l.suggested_product_id, suggested_name: l.suggested_name, current_cost_cents: l.current_cost_cents, change_pct: l.change_pct }));
    }
    // re-match when the supplier changes so supplier item numbers can find their products
    if (patch.supplier_id !== undefined || patch.new_supplier_name || patch.rematch) { const kept = new Map(draft.lines.map((l, i) => [i, l])); const re = await matchLines(draft.lines.map((l) => ({ ...l, product_id: undefined })), supplierId); draft.lines = re.map((m, i) => ({ ...m, product_id: kept.get(i).product_id || m.product_id, skip: kept.get(i).skip })); }
    await db.q(`UPDATE invoices SET supplier_id=$2, invoice_no=COALESCE($3,invoice_no), invoice_date=COALESCE($4::date, invoice_date), shipping_cents=COALESCE($5,shipping_cents), draft=$6 WHERE id=$1`,
      [id, supplierId, patch.invoice_no ?? null, patch.invoice_date || null, patch.shipping_cents != null ? Math.round(Number(patch.shipping_cents)) : null, JSON.stringify(draft)]);
    return getInvoice(id);
  }
  const draftLines = (inv) => ((inv.draft && inv.draft.lines) || []).filter((l) => !l.skip && (l.product_id || l.create_new !== false));
  async function previewInvoice(id, reprice = 'propose') {
    const inv = await getInvoice(id);
    const lines = draftLines(inv);
    if (!lines.length) return { preview: true, lines: [], unmatched: 0, total_cents: inv.shipping_cents };
    return back.importInvoice({ supplier_id: inv.supplier_id, invoice_no: inv.invoice_no, shipping_cents: inv.shipping_cents, lines, reprice });
  }
  async function apply(id, { reprice = 'propose', actor = '' } = {}) {
    const inv = await getInvoice(id);
    if (inv.status !== 'review') throw httpErr(409, 'This invoice is already done');
    if (inv.kind === 'freight') throw httpErr(400, 'This is a freight bill: choose which delivery it belongs to');
    const lines = draftLines(inv);
    if (!lines.length) throw httpErr(400, 'There are no lines to apply');
    let supplierId = inv.supplier_id;
    if (!supplierId && inv.supplier_name_raw) { supplierId = (await db.one(`INSERT INTO suppliers (name, markup_pct) VALUES ($1, 30) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`, [inv.supplier_name_raw])).id; }
    const r = await back.importInvoice({ supplier_id: supplierId, invoice_no: inv.invoice_no, invoice_date: inv.invoice_date_str || null, shipping_cents: inv.shipping_cents, lines, commit: true, create_missing: true, reprice, invoice_id: id, actor, notes: inv.notes });
    return r;
  }
  async function ignore(id) {
    const r = await db.one(`UPDATE invoices SET status='ignored' WHERE id=$1 AND status='review' RETURNING id`, [id]);
    if (!r) throw httpErr(409, 'This invoice is already done');
  }

  // ---------- freight / pallet / truck bills: spread over the goods they carried ----------
  async function freightCandidates(id) {
    const f = await getInvoice(id);
    return db.rows(`SELECT i.id, i.invoice_no, i.invoice_date, i.shipping_cents, i.total_cents, (SELECT count(*)::int FROM invoice_lines WHERE invoice_id = i.id) AS lines
      FROM invoices i WHERE i.status='applied' AND i.kind='goods' AND ($1::int IS NULL OR i.supplier_id = $1) AND i.created_at > now() - interval '45 days' ORDER BY i.id DESC LIMIT 20`, [f.supplier_id]);
  }
  async function allocateFreight(freightId, targetId, actor = '') {
    const f = await getInvoice(freightId), t = await getInvoice(targetId);
    if (f.status !== 'review' || f.kind !== 'freight') throw httpErr(409, 'Not an open freight bill');
    if (t.status !== 'applied' || t.kind !== 'goods') throw httpErr(409, 'Choose an invoice that has already been applied');
    const freight = f.shipping_cents;
    if (!(freight > 0)) throw httpErr(400, 'The freight amount is zero');
    const lines = await db.rows('SELECT * FROM invoice_lines WHERE invoice_id=$1 AND product_id IS NOT NULL AND qty > 0', [targetId]);
    const value = lines.reduce((a, l) => a + Number(l.qty) * Number(l.unit_cost_cents), 0);
    if (!lines.length || !(value > 0)) throw httpErr(400, 'That invoice has no priced lines to spread the freight over');
    const sup = t.supplier_id ? await db.one('SELECT * FROM suppliers WHERE id=$1', [t.supplier_id]) : null;
    let touched = 0, proposals = 0;
    for (const l of lines) {
      const addPerUnit = (freight * ((Number(l.qty) * Number(l.unit_cost_cents)) / value)) / Number(l.qty);
      const newLanded = Math.round((Number(l.landed_cost_cents) + addPerUnit) * 100) / 100;
      await db.q('UPDATE invoice_lines SET landed_cost_cents=$2 WHERE id=$1', [l.id, newLanded]);
      const p = await db.one('SELECT * FROM products WHERE id=$1', [l.product_id]);
      // only touch the product's cost if it still holds this invoice's cost (a newer invoice may have replaced it)
      if (p && Math.abs(Number(p.cost_cents) - Number(l.landed_cost_cents)) < 0.51) {
        await db.q('UPDATE products SET cost_cents=$2, updated_at=now() WHERE id=$1', [p.id, newLanded]); touched++;
        if (sup && !p.price_locked && p.price_cents > 0) { const np = pricing.suggestPrice(newLanded, sup.markup_pct); if (np && np !== p.price_cents && (await back.createProposal({ product: p, newPriceCents: np, newCostCents: newLanded, invoiceId: targetId, reason: `Freight ${money(freight)} added to invoice ${t.invoice_no}` }))) proposals++; }
      }
    }
    await db.q('UPDATE invoices SET shipping_cents = shipping_cents + $2 WHERE id=$1', [targetId, freight]);
    await db.q(`UPDATE invoices SET status='applied', applied_at=now(), notes = $2 WHERE id=$1`, [freightId, `Freight allocated to invoice #${targetId} ${t.invoice_no || ''}`]);
    core.dirty();
    return { allocated_cents: freight, products_updated: touched, proposals };
  }

  // ---------- purchase orders ----------
  async function poFromReorder(supplierId, opts = {}) {
    const sup = await db.one('SELECT * FROM suppliers WHERE id=$1', [supplierId]);
    if (!sup) throw httpErr(404, 'Supplier not found');
    const rows = (await back.reorderReport(opts)).filter((r) => r.supplier_id === Number(supplierId));
    if (!rows.length) throw httpErr(409, 'Nothing needs ordering from this supplier right now');
    const po = await db.one(`INSERT INTO purchase_orders (supplier_id, note) VALUES ($1,$2) RETURNING *`, [supplierId, 'Suggested from sales speed and stock on hand']);
    for (const r of rows) {
      const p = await db.one('SELECT case_size, cost_cents FROM products WHERE id=$1', [r.id]);
      const cs = p.case_size ? Number(p.case_size) : null, cases = cs ? Math.ceil(r.order_qty / cs) : null;
      await db.q('INSERT INTO purchase_order_lines (po_id, product_id, qty_units, case_size, qty_cases, est_cost_cents) VALUES ($1,$2,$3,$4,$5,$6)', [po.id, r.id, cases ? cases * cs : r.order_qty, cs, cases, p.cost_cents]);
    }
    return getPo(po.id);
  }
  async function getPo(id) {
    const po = await db.one('SELECT po.*, s.name AS supplier, s.email AS supplier_email, s.phone AS supplier_phone FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id WHERE po.id=$1', [id]);
    if (!po) throw httpErr(404, 'Not found');
    po.lines = await db.rows(`SELECT l.*, p.name, p.upc, p.supplier_sku FROM purchase_order_lines l JOIN products p ON p.id = l.product_id WHERE l.po_id=$1 ORDER BY p.name`, [id]);
    po.est_total_cents = Math.round(po.lines.reduce((a, l) => a + Number(l.qty_units) * Number(l.est_cost_cents), 0));
    return po;
  }
  const poText = (po) => `Order for ${po.supplier}\n\n${po.lines.map((l) => `${l.qty_cases ? l.qty_cases + ' case' + (l.qty_cases > 1 ? 's' : '') + ' (' + Number(l.qty_units) + ' units)' : Number(l.qty_units) + ' units'}  ${l.name}${l.supplier_sku ? '  #' + l.supplier_sku : ''}${l.upc ? '  UPC ' + l.upc : ''}`).join('\n')}\n\nThank you, Bay Kosher, 3477 Golden Gate Way, Lafayette CA`;
  async function sendPo(id) {
    const po = await getPo(id);
    if (!po.supplier_email) throw httpErr(400, 'Add this supplier\'s email address first (Suppliers tab).');
    if (po.status !== 'draft') throw httpErr(409, 'Already sent');
    const html = `<p>Hello,</p><p>Please prepare this order for Bay Kosher:</p><table cellpadding="6" style="border-collapse:collapse;font-family:sans-serif;font-size:14px"><tr><th align="left">Qty</th><th align="left">Item</th><th align="left">Item #</th></tr>${po.lines.map((l) => `<tr><td>${l.qty_cases ? l.qty_cases + ' case' + (l.qty_cases > 1 ? 's' : '') : Number(l.qty_units)}</td><td>${esc(l.name)}</td><td>${esc(l.supplier_sku || l.upc || '')}</td></tr>`).join('')}</table><p>${esc(po.note)}</p><p>Thank you,<br>Bay Kosher</p>`;
    const ok = await notifier.email(po.supplier_email, `Order from Bay Kosher #${po.id}`, html);
    await db.q(`UPDATE purchase_orders SET status='sent', sent_at=now() WHERE id=$1`, [id]);
    return { sent: ok, live: notifier.live.email, text: poText(po) };
  }

  return { storeDocument, resolveSupplier, matchLines, ingest, getInvoice, listInvoices, updateDraft, previewInvoice, apply, ignore, freightCandidates, allocateFreight, poFromReorder, getPo, sendPo, poText, extractor };
}

module.exports = { createPurchasing };
