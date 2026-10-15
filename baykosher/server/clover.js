// Clover (POS) client and two-way sync. Clover holds the in-store truth for stock; price can follow either side.
// NOTE: written against Clover's public REST docs but not yet run against a live merchant: do a first sync
// against Clover's sandbox (CLOVER_BASE=https://apisandbox.dev.clover.com) before pointing it at the real store.
'use strict';

function createClover({ merchantId, token, base = 'https://api.clover.com', fetchImpl = globalThis.fetch }) {
  const call = async (path, opts = {}) => {
    const r = await fetchImpl(`${base}/v3/merchants/${merchantId}${path}`, { ...opts, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
    if (!r.ok) throw new Error(`Clover ${r.status} on ${path}`);
    return r.json();
  };
  return {
    async items() {
      const all = []; let offset = 0;
      for (;;) {
        const j = await call(`/items?expand=itemStock&limit=1000&offset=${offset}`);
        const els = j.elements || [];
        all.push(...els.map((i) => ({
          id: i.id, name: i.name, upc: i.code || '', sku: i.sku || '', price_cents: i.price || 0, cost_cents: i.cost || 0,
          per_lb: i.priceType === 'PER_UNIT' || /^lbs?$/i.test(i.unitName || ''), stock: i.itemStock ? i.itemStock.quantity : null, hidden: !!i.hidden,
        })));
        if (els.length < 1000) break;
        offset += 1000;
      }
      return all;
    },
    updatePrice: (id, price_cents) => call(`/items/${id}`, { method: 'POST', body: JSON.stringify({ price: price_cents }) }),
    // a new item made here appears at the register with its barcode and price (weighed items are priced per lb)
    async createItem(p) {
      const j = await call('/items', { method: 'POST', body: JSON.stringify({ name: p.name, price: p.price_cents, code: p.upc || undefined, sku: p.sku || undefined, cost: Math.round(Number(p.cost_cents) || 0), priceType: p.sold_by === 'lb' ? 'PER_UNIT' : 'FIXED', unitName: p.sold_by === 'lb' ? 'lb' : undefined, hidden: false }) });
      return j.id;
    },
    // register sales since a time: [{item_id, qty, at}] (weighed lines carry their weight in thousandths in unitQty)
    async sales(sinceMs) {
      const out = []; let offset = 0;
      for (;;) {
        const j = await call(`/orders?filter=${encodeURIComponent('createdTime>' + sinceMs)}&expand=lineItems&limit=100&offset=${offset}`);
        const els = j.elements || [];
        for (const o of els) {
          if (o.state === 'open') continue; // not paid yet
          for (const li of (o.lineItems && o.lineItems.elements) || []) { if (li.refunded || !li.item) continue; out.push({ item_id: li.item.id, qty: li.unitQty ? li.unitQty / 1000 : 1, at: o.createdTime }); }
        }
        if (els.length < 100) break;
        offset += 100;
      }
      return out;
    },
    setStock: (id, quantity) => call(`/item_stocks/${id}`, { method: 'POST', body: JSON.stringify({ quantity }) }),
  };
}

// direction: 'clover_wins' (default: Clover prices overwrite the site) or 'site_wins' (site prices are pushed to Clover).
// Prices of products with price_locked are never overwritten by Clover. Stock always comes from Clover.
async function syncClover({ db, clover, direction = 'clover_wins', stockSource = 'clover' }) {
  const items = await clover.items();
  const s = { seen: items.length, matched: 0, created: 0, price_pulled: 0, price_pushed: 0, stock_updated: 0, errors: [] };
  const products = await db.rows('SELECT id, upc, name, clover_id, price_cents, price_locked, stock, track_stock FROM products');
  const byClover = new Map(products.filter((p) => p.clover_id).map((p) => [p.clover_id, p]));
  const byUpc = new Map(products.filter((p) => p.upc).map((p) => [p.upc, p]));
  const byName = new Map(products.filter((p) => !p.clover_id).map((p) => [String(p.name).trim().toLowerCase(), p]));
  for (const it of items) {
    try {
      // match by Clover id, then barcode, then exact name (for items with no barcode, e.g. weighed meat)
      let p = byClover.get(it.id) || (it.upc && byUpc.get(it.upc)) || byName.get(String(it.name).trim().toLowerCase());
      if (!p) {
        // Unknown in-store item: bring it in hidden so you can review category/description before it shows online.
        await db.q(`INSERT INTO products (upc, sku, name, sold_by, price_cents, cost_cents, stock, clover_id, active) VALUES (NULLIF($1,''),$2,$3,$4,$5,$6,$7,$8,FALSE)
                    ON CONFLICT DO NOTHING`, [it.upc, it.sku, it.name, it.per_lb ? 'lb' : 'each', it.price_cents, it.cost_cents || 0, Math.max(0, it.stock || 0), it.id]);
        s.created++; continue;
      }
      s.matched++;
      if (!p.clover_id) await db.q('UPDATE products SET clover_id=$2 WHERE id=$1', [p.id, it.id]);
      if (direction === 'site_wins') {
        if (p.price_cents > 0 && p.price_cents !== it.price_cents) { await clover.updatePrice(it.id, p.price_cents); s.price_pushed++; }
      } else if (!p.price_locked && it.price_cents > 0 && it.price_cents !== p.price_cents) {
        await db.q('UPDATE products SET price_cents=$2, updated_at=now() WHERE id=$1', [p.id, it.price_cents]); s.price_pulled++;
      }
      if (stockSource === 'clover' && it.stock != null && Number(it.stock) !== Number(p.stock)) {
        const next = Math.max(0, it.stock);
        await db.q('UPDATE products SET stock=$2, updated_at=now() WHERE id=$1', [p.id, next]);
        await db.q(`INSERT INTO stock_events (product_id, delta, reason) VALUES ($1,$2,'clover_sync')`, [p.id, next - Number(p.stock)]);
        s.stock_updated++;
      }
    } catch (e) { s.errors.push(`${it.name}: ${e.message}`); }
  }
  await db.q('INSERT INTO sync_log (kind, summary) VALUES ($1,$2)', ['clover', s]);
  return s;
}

// Register sales -> stock. Starts counting from the first run (it does not replay history). Needs stock source "computed".
async function syncSales({ db, clover, now = Date.now() }) {
  const cur = await db.one(`SELECT value FROM settings WHERE key='clover_sales_cursor'`);
  const since = cur ? Number(cur.value) : now;
  if (!cur) { await db.q(`INSERT INTO settings (key, value) VALUES ('clover_sales_cursor', $1)`, [JSON.stringify(now)]); return { first_run: true, sold: 0 }; }
  const sales = await clover.sales(since);
  const by = new Map(); let max = since;
  for (const x of sales) { by.set(x.item_id, (by.get(x.item_id) || 0) + x.qty); if (x.at > max) max = x.at; }
  let sold = 0;
  for (const [cid, qty] of by) {
    const p = await db.one('SELECT id, stock, track_stock FROM products WHERE clover_id=$1', [cid]);
    if (!p || !p.track_stock) continue;
    await db.q('UPDATE products SET stock = GREATEST(stock - $2, 0), updated_at = now() WHERE id=$1', [p.id, qty]);
    await db.q(`INSERT INTO stock_events (product_id, delta, reason) VALUES ($1,$2,'clover_sync')`, [p.id, -qty]);
    sold += qty;
  }
  if (max > since) await db.q(`UPDATE settings SET value=$1 WHERE key='clover_sales_cursor'`, [JSON.stringify(max)]);
  await db.q('INSERT INTO sync_log (kind, summary) VALUES ($1,$2)', ['clover_sales', { items: by.size, units: sold }]);
  return { sold, items: by.size };
}

// Send prices to Clover (and create items that do not exist there yet). Best effort; every result is logged.
async function pushProducts({ db, clover, ids }) {
  if (!clover || !ids.length) return { updated: 0, created: 0, errors: [] };
  const out = { updated: 0, created: 0, errors: [] };
  for (const p of await db.rows('SELECT * FROM products WHERE id = ANY($1)', [ids])) {
    try {
      if (p.clover_id) { await clover.updatePrice(p.clover_id, p.price_cents); out.updated++; }
      else if (p.active && p.price_cents > 0) { const id = await clover.createItem(p); await db.q('UPDATE products SET clover_id=$2 WHERE id=$1', [p.id, id]); out.created++; }
    } catch (e) { out.errors.push(`${p.name}: ${e.message}`); }
  }
  await db.q('INSERT INTO sync_log (kind, summary) VALUES ($1,$2)', ['clover_push', out]);
  return out;
}

// After an online order is picked, tell Clover the new on-hand counts (best effort).
async function pushStock({ db, clover, productIds }) {
  if (!clover || !productIds.length) return 0;
  const ps = await db.rows('SELECT clover_id, stock FROM products WHERE id = ANY($1) AND clover_id IS NOT NULL', [productIds]);
  let n = 0;
  for (const p of ps) { try { await clover.setStock(p.clover_id, Number(p.stock)); n++; } catch { /* next sync will correct it */ } }
  return n;
}

module.exports = { createClover, syncClover, syncSales, pushProducts, pushStock };
