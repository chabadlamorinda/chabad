// How fast things sell, when they will run out, and what to order from whom.
//
// Sales speed is a weighted average of daily sales over the last 8 weeks, with recent days
// counting more (a day two weeks ago counts half as much as today), so a new favorite or a
// fading item shows up quickly without one busy day swinging the numbers.
//
// For each supplier we know which days you place orders and how long delivery takes. An order
// placed on the next order day has to last until the order after that arrives, plus a safety
// cushion sized from how unpredictable the item's sales are.
'use strict';

const WINDOW_DAYS = 56;
const HALF_LIFE = 14;
const Z = 1.65;            // ~95% chance of not running out
const DAY = 86400000;
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const dayKey = (d) => { const x = new Date(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / DAY);

/** "Mon, Thu" -> Set{1,4}. Empty -> null (any day). */
function parseOrderDays(s) {
  const set = new Set();
  for (const part of String(s || '').toLowerCase().split(/[\s,;/]+/)) {
    const i = WEEKDAYS.indexOf(part.slice(0, 3));
    if (i >= 0) set.add(i);
  }
  return set.size ? set : null;
}
/** First order day on or after `from`. */
function nextOrderDay(from, days) {
  let d = startOfDay(from);
  if (!days) return d;
  for (let i = 0; i < 7; i++, d = addDays(d, 1)) if (days.has(d.getDay())) return d;
  return d;
}

/** Weighted mean and std-dev of a daily series (oldest first). */
function velocity(series) {
  let sw = 0, s = 0, s2 = 0;
  const n = series.length;
  series.forEach((v, i) => { const w = Math.pow(0.5, (n - 1 - i) / HALF_LIFE); sw += w; s += w * v; s2 += w * v * v; });
  if (!sw) return { rate: 0, sd: 0 };
  const rate = s / sw;
  return { rate, sd: Math.sqrt(Math.max(0, s2 / sw - rate * rate)) };
}

/**
 * @param {ReturnType<import('./db').openDb>} db
 * @param {Date} [now]
 */
function forecastAll(db, now = new Date()) {
  const today = startOfDay(now);
  const since = addDays(today, -(WINDOW_DAYS - 1));
  const settings = { safety: db.num('safety_days'), review: Math.max(1, db.num('review_days')) };

  // Daily units sold per product (sales are negative movements; returns positive).
  const sold = new Map();
  for (const r of db.all("SELECT product_id, qty, at FROM movements WHERE kind IN ('sale','return') AND at >= ?", since.toISOString())) {
    let m = sold.get(r.product_id); if (!m) sold.set(r.product_id, (m = new Map()));
    const k = dayKey(r.at); m.set(k, (m.get(k) || 0) - r.qty);
  }
  const firstSeen = new Map(db.all('SELECT product_id, MIN(at) AS first FROM movements GROUP BY product_id').map((r) => [r.product_id, r.first]));
  const lastSale = new Map(db.all("SELECT product_id, MAX(at) AS last FROM movements WHERE kind = 'sale' GROUP BY product_id").map((r) => [r.product_id, r.last]));
  const onOrder = new Map(db.all("SELECT l.product_id, SUM(l.qty) AS q FROM po_lines l JOIN purchase_orders o ON o.id = l.po_id WHERE o.status = 'ordered' GROUP BY l.product_id").map((r) => [r.product_id, r.q]));
  const suppliers = new Map(db.all('SELECT * FROM suppliers').map((s) => [s.id, s]));

  const out = new Map();
  for (const p of db.all('SELECT * FROM products WHERE active = 1')) {
    const sup = p.supplier_id ? suppliers.get(p.supplier_id) : null;
    // Series runs from the later of (8 weeks ago, first time we saw the item), at least 7 days.
    let start = since;
    const fs = p.created_at ? new Date(p.created_at.replace(' ', 'T') + (p.created_at.includes('Z') || p.created_at.includes('+') ? '' : 'Z')) : null;
    const fm = firstSeen.get(p.id) ? new Date(firstSeen.get(p.id)) : null;
    const first = [fs, fm].filter((d) => d && !isNaN(d)).sort((a, b) => a - b)[0];
    if (first && first > start) start = startOfDay(first);
    if (daysBetween(start, today) < 6) start = addDays(today, -6);
    const series = [];
    const m = sold.get(p.id);
    for (let d = start; d <= today; d = addDays(d, 1)) series.push(Math.max(0, (m && m.get(dayKey(d))) || 0));
    const { rate, sd } = velocity(series);
    const sold28 = series.slice(-28).reduce((a, b) => a + b, 0);

    const days = sup ? parseOrderDays(sup.order_days) : null;
    const lead = sup ? Math.max(0, Number(sup.lead_time_days) || 0) : 7;
    const d0 = nextOrderDay(today, days);
    const d1 = days ? nextOrderDay(addDays(d0, 1), days) : addDays(d0, settings.review);
    const review = daysBetween(d0, d1);
    const safety = Math.max(Z * sd * Math.sqrt(lead + review), settings.safety * rate);
    const target = Math.max(rate * (lead + review) + safety, p.min_stock || 0);
    const pending = onOrder.get(p.id) || 0;
    const untilD0 = daysBetween(today, d0);
    const projected = p.stock + pending - rate * untilD0;     // what we will have on the order day
    const caseSize = Math.max(1, p.case_size || 1);
    let need = target - projected;
    let qty = 0;
    if (need > 0.01 && (rate > 0 || (p.min_stock || 0) > 0)) qty = Math.ceil(need / caseSize - 1e-9) * caseSize;

    const cover = rate > 0 ? p.stock / rate : null;           // days of stock left
    const runOut = cover != null ? addDays(today, Math.floor(cover)) : null;
    let status = 'ok';
    if (p.stock <= 0 && (rate > 0 || (p.min_stock || 0) > 0)) status = 'out';
    else if (qty > 0 && cover != null && cover + (pending / (rate || 1)) < untilD0 + lead) status = 'urgent';
    else if (qty > 0) status = 'order';
    else if (p.stock > 0 && rate === 0 && !lastSale.get(p.id)) status = 'idle';
    else if (p.stock > 0 && lastSale.get(p.id) && daysBetween(new Date(lastSale.get(p.id)), today) > 60) status = 'idle';

    out.set(p.id, {
      product_id: p.id,
      rate: round(rate, 3),                 // units per day
      weekly: round(rate * 7, 1),
      sold28,
      days_cover: cover == null ? null : round(cover, 1),
      run_out: runOut ? dayKey(runOut) : null,
      on_order: pending,
      order_day: dayKey(d0),
      next_order_day: dayKey(d1),
      lead_days: lead,
      target: Math.ceil(target),
      safety: Math.ceil(safety),
      suggest_qty: qty,
      suggest_cases: qty / caseSize,
      status,
      last_sale: lastSale.get(p.id) || null,
    });
  }
  return out;
}

/** Order lists grouped by supplier. */
function orderLists(db, now = new Date()) {
  const fc = forecastAll(db, now);
  const products = db.all('SELECT * FROM products WHERE active = 1');
  const suppliers = db.all('SELECT * FROM suppliers ORDER BY name');
  const groups = new Map(suppliers.map((s) => [s.id, { supplier: s, lines: [], total: 0 }]));
  const none = { supplier: { id: 0, name: 'No supplier set', order_days: '', lead_time_days: 7, min_order: 0, email: '' }, lines: [], total: 0 };
  for (const p of products) {
    const f = fc.get(p.id);
    if (!f || f.suggest_qty <= 0) continue;
    const g = (p.supplier_id && groups.get(p.supplier_id)) || none;
    const line = { product: p, forecast: f, qty: f.suggest_qty, cases: f.suggest_cases, est_cost: round(f.suggest_qty * (p.cost || 0), 2) };
    g.lines.push(line); g.total += line.est_cost;
  }
  const rank = { out: 0, urgent: 1, order: 2 };
  const list = [...groups.values(), none].filter((g) => g.lines.length);
  for (const g of list) {
    g.lines.sort((a, b) => (rank[a.forecast.status] ?? 3) - (rank[b.forecast.status] ?? 3) || a.product.name.localeCompare(b.product.name));
    g.total = round(g.total, 2);
    g.order_day = g.lines[0].forecast.order_day;
    g.urgent = g.lines.filter((l) => l.forecast.status === 'out' || l.forecast.status === 'urgent').length;
    g.below_min = g.supplier.min_order > 0 && g.total < g.supplier.min_order;
  }
  list.sort((a, b) => a.order_day.localeCompare(b.order_day) || b.urgent - a.urgent || a.supplier.name.localeCompare(b.supplier.name));
  return list;
}

function round(n, d) { const f = Math.pow(10, d); return Math.round(n * f) / f; }

module.exports = { forecastAll, orderLists, parseOrderDays, nextOrderDay, velocity, dayKey, addDays, startOfDay };
