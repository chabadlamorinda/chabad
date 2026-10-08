// Clover: import items, read sales, push the unified stock number (and approved prices) back.
//
// Uses a merchant API token (Clover dashboard -> Account & Setup -> API Tokens) with
// Inventory (read + write) and Orders (read) permissions.
'use strict';

const { codeIndex, normCode } = require('./catalog');

const BASES = {
  us: 'https://api.clover.com',
  eu: 'https://api.eu.clover.com',
  la: 'https://api.la.clover.com',
  sandbox: 'https://apisandbox.dev.clover.com',
};
const OVERLAP_MS = 60 * 60 * 1000;          // re-read the last hour each time; duplicates are ignored
const FIRST_SYNC_DAYS = 56;                  // first run pulls 8 weeks of sales history for sales speed

class CloverError extends Error {}

function cloverClient({ merchantId, token, region = 'us', baseUrl, fetchImpl = fetch, pauseMs = 70 }) {
  const base = (baseUrl || BASES[region] || BASES.us).replace(/\/$/, '') + '/v3/merchants/' + encodeURIComponent(merchantId);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function call(method, path, body, attempt = 0) {
    const res = await fetchImpl(base + path, {
      method,
      headers: { authorization: 'Bearer ' + token, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429 && attempt < 5) { await sleep(1000 * (attempt + 1)); return call(method, path, body, attempt + 1); }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (res.status === 401 || res.status === 403) throw new CloverError('Clover rejected the API token (401). Check CLOVER_API_TOKEN and its permissions.');
      throw new CloverError('Clover ' + method + ' ' + path.split('?')[0] + ' failed: ' + res.status + ' ' + text.slice(0, 200));
    }
    if (pauseMs) await sleep(pauseMs);    // stay well under Clover's 16 requests/second
    return res.status === 204 ? null : res.json();
  }
  async function* pages(path, size = 1000) {
    for (let offset = 0; ; offset += size) {
      const sep = path.includes('?') ? '&' : '?';
      const r = await call('GET', path + sep + 'limit=' + size + '&offset=' + offset);
      const els = (r && r.elements) || [];
      yield* els;
      if (els.length < size) return;
    }
  }
  return {
    items: () => pages('/items?expand=itemStock,categories'),
    orders: (sinceMs) => pages('/orders?filter=' + encodeURIComponent('modifiedTime>=' + sinceMs) + '&expand=lineItems', 100),
    // Clover documents PUT for item stock; some older accounts only accept POST.
    async setStock(itemId, quantity) {
      const path = '/item_stocks/' + encodeURIComponent(itemId);
      try { return await call('PUT', path, { quantity }); }
      catch (e) { if (/failed: 40[45]/.test(e.message)) return call('POST', path, { quantity }); throw e; }
    },
    setPrice: (itemId, cents) => call('POST', '/items/' + encodeURIComponent(itemId), { price: cents }),
    merchant: () => call('GET', ''),
  };
}

const cents = (n) => (n == null ? null : Math.round(Number(n)) / 100);

/**
 * Bring Clover items into the catalog. New items are created with Clover's stock as their starting
 * count. Existing items are linked by Clover id, then SKU / barcode.
 * @param {{refresh?: boolean}} opts refresh=true also copies names, categories and prices from Clover.
 */
async function importItems(db, clover, { refresh = false } = {}) {
  db.goLive();
  const idx = codeIndex(db);
  let created = 0, linked = 0, updated = 0;
  for await (const it of clover.items()) {
    if (it.deleted) continue;
    const category = (it.categories && it.categories.elements && it.categories.elements[0] && it.categories.elements[0].name) || '';
    const byWeight = it.priceType === 'PER_UNIT' ? 1 : 0;
    let p = db.get('SELECT * FROM products WHERE clover_id = ?', it.id);
    if (!p) {
      const pid = (it.sku && idx.get(normCode(it.sku))) || (it.code && idx.get(normCode(it.code)));
      if (pid) {
        const cur = db.get('SELECT clover_id FROM products WHERE id = ?', pid);
        if (cur && !cur.clover_id) { db.run('UPDATE products SET clover_id = ? WHERE id = ?', it.id, pid); linked++; p = db.get('SELECT * FROM products WHERE id = ?', pid); }
      }
    }
    if (!p) {
      db.tx(() => {
        const r = db.run(`INSERT INTO products (name, sku, upc, category, price, cost, taxable, sold_by_weight, unit, clover_id, active)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          it.name || 'Unnamed item', it.sku || '', it.code || '', category, cents(it.price) || 0, cents(it.cost) || 0,
          it.defaultTaxRates === false ? 0 : 1, byWeight, byWeight ? 'Lb' : '', it.id, it.hidden ? 0 : 1);
        const id = Number(r.lastInsertRowid);
        const q = it.itemStock && it.itemStock.quantity;
        if (q != null && Number(q) !== 0) db.move({ product_id: id, qty: Number(q), kind: 'initial', source: 'clover', ref: 'initial:' + it.id, note: 'Starting stock from Clover' });
        db.run('UPDATE products SET clover_pushed_qty = stock WHERE id = ?', id);
        for (const c of [it.sku, it.code]) if (c) idx.set(normCode(c), id);
      });
      created++;
    } else if (refresh) {
      db.run("UPDATE products SET name = ?, category = COALESCE(NULLIF(?, ''), category), sku = COALESCE(NULLIF(?, ''), sku), upc = COALESCE(NULLIF(?, ''), upc), updated_at = datetime('now') WHERE id = ?",
        it.name || p.name, category, it.sku || '', it.code || '', p.id);
      const price = cents(it.price);
      if (price != null && Math.abs(price - p.price) >= 0.005) { db.recordPrice(p.id, 'price', p.price, price, 'clover'); db.run('UPDATE products SET price = ? WHERE id = ?', price, p.id); }
      updated++;
    }
  }
  return { created, linked, updated };
}

/** Read Clover orders since the last sync and subtract what was sold. */
async function pullSales(db, clover, now = Date.now()) {
  const last = Number(db.setting('clover_orders_cursor')) || now - FIRST_SYNC_DAYS * 86400000;
  const since = Math.max(0, last - OVERLAP_MS);
  const golive = Date.parse(db.goLive());
  const byClover = new Map(db.all('SELECT id, clover_id FROM products WHERE clover_id IS NOT NULL').map((r) => [r.clover_id, r.id]));
  let sales = 0, returns = 0, unknown = 0, maxSeen = last;
  for await (const o of clover.orders(since)) {
    maxSeen = Math.max(maxSeen, Number(o.modifiedTime) || 0);
    const paid = ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(o.paymentState);
    if (!paid) continue;
    const atMs = Number(o.clientCreatedTime || o.createdTime) || now;
    const at = new Date(atMs).toISOString();
    const counted = atMs >= golive;     // older sales only teach us sales speed
    for (const li of (o.lineItems && o.lineItems.elements) || []) {
      const pid = li.item && byClover.get(li.item.id);
      if (!pid) { unknown++; continue; }
      if (li.isRevenue === false) continue;
      const qty = li.unitQty ? Number(li.unitQty) / 1000 : 1;   // weighed items come in thousandths of a pound
      if (db.move({ product_id: pid, qty: -qty, kind: 'sale', source: 'clover', ref: li.id, at, counted, note: 'Clover order ' + o.id })) sales++;
      if (li.refunded || o.paymentState === 'REFUNDED') {
        const rAt = Number(o.modifiedTime) || now;
        if (db.move({ product_id: pid, qty, kind: 'return', source: 'clover', ref: li.id + ':refund', at: new Date(rAt).toISOString(), counted: rAt >= golive, note: 'Refund on Clover order ' + o.id })) returns++;
      }
    }
  }
  db.setSetting('clover_orders_cursor', String(Math.min(maxSeen, now)));
  return { sales, returns, unknown };
}

/** Send the unified stock to Clover for every linked item whose number changed. */
async function pushStock(db, clover) {
  let pushed = 0;
  const rows = db.all('SELECT id, clover_id, stock FROM products WHERE clover_id IS NOT NULL AND (clover_pushed_qty IS NULL OR ABS(clover_pushed_qty - stock) > 0.0005)');
  for (const p of rows) {
    const q = Math.round(p.stock * 1000) / 1000;
    await clover.setStock(p.clover_id, q);
    db.run('UPDATE products SET clover_pushed_qty = ? WHERE id = ?', q, p.id);
    pushed++;
  }
  return { pushed };
}

async function pushPrice(clover, product) {
  if (!product.clover_id) return false;
  await clover.setPrice(product.clover_id, Math.round(product.price * 100));
  return true;
}

module.exports = { cloverClient, importItems, pullSales, pushStock, pushPrice, CloverError, BASES };
