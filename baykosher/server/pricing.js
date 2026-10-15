// Pure pricing rules: markup from cost, landed cost from invoices, sales, stock labels. All money is integer cents.
'use strict';

const round = (n) => Math.round(n);

// "Charm" pricing: next price ending in 9 cents at or above the raw number (3.87 -> 3.89, 3.90 -> 3.99).
function charm(cents) {
  let p = Math.ceil(cents / 10) * 10 - 1;
  if (p < cents) p += 10;
  return Math.max(p, 1);
}

// Price from landed cost and a markup percent (30 = cost x 1.30).
function suggestPrice(landedCents, markupPct, { charmPricing = true } = {}) {
  if (!(landedCents > 0)) return null;
  const raw = landedCents * (1 + (Number(markupPct) || 0) / 100);
  return charmPricing ? charm(raw) : round(raw);
}

// Spread an invoice's shipping over its lines in proportion to line value, then return landed unit cost per line.
// lines: [{qty, unit_cost_cents}]  ->  same lines plus landed_cost_cents (per unit, 3 decimals kept as float cents)
function allocateShipping(lines, shippingCents) {
  const total = lines.reduce((s, l) => s + l.qty * l.unit_cost_cents, 0);
  return lines.map((l) => {
    const share = total > 0 && shippingCents > 0 ? (shippingCents * (l.qty * l.unit_cost_cents)) / total : 0;
    const perUnit = l.qty > 0 ? share / l.qty : 0;
    return { ...l, landed_cost_cents: round((l.unit_cost_cents + perUnit) * 100) / 100 };
  });
}

function saleApplies(sale, p, now = new Date()) {
  if (!sale.active) return false;
  if (sale.starts_at && new Date(sale.starts_at) > now) return false;
  if (sale.ends_at && new Date(sale.ends_at) < now) return false;
  switch (sale.scope_type) {
    case 'all': return true;
    case 'category': return Number(sale.scope_value) === p.category_id;
    case 'supplier': return Number(sale.scope_value) === p.supplier_id;
    case 'brand': return String(sale.scope_value || '').toLowerCase() === String(p.brand || '').toLowerCase();
    case 'product': return String(sale.scope_value).split(',').map(Number).includes(p.id);
    default: return false;
  }
}

// One sale price for one sale on one product, or null.
//   percent: value% off the regular price
//   margin:  price = cost x (1 + value%)   ("sell at 10% over what I paid")
//   price:   fixed price in cents
// Never goes below landed cost unless the sale sets allow_below_cost.
function salePrice(sale, p) {
  const regular = p.price_cents;
  let cents;
  if (sale.kind === 'percent') cents = round(regular * (1 - Number(sale.value) / 100));
  else if (sale.kind === 'margin') { if (!(p.cost_cents > 0)) return null; cents = round(p.cost_cents * (1 + Number(sale.value) / 100)); }
  else if (sale.kind === 'price') cents = round(Number(sale.value));
  else return null;
  if (!sale.allow_below_cost && p.cost_cents > 0 && cents < p.cost_cents) cents = p.cost_cents;
  if (cents >= regular) return null; // not actually a discount
  return Math.max(cents, 1);
}

// The price a customer pays right now: the best (lowest) applicable sale, else regular.
function effectivePrice(p, sales, now = new Date()) {
  let best = null;
  for (const s of sales) {
    if (!saleApplies(s, p, now)) continue;
    const c = salePrice(s, p);
    if (c != null && (best == null || c < best.cents)) best = { cents: c, sale: s };
  }
  if (!best) return { price_cents: p.price_cents, was_cents: null, sale_name: null, percent_off: 0 };
  return { price_cents: best.cents, was_cents: p.price_cents, sale_name: best.sale.name, percent_off: Math.round((1 - best.cents / p.price_cents) * 100) };
}

// in | low | out  (products that do not track stock are always "in")
function stockStatus(p) {
  if (!p.track_stock) return 'in';
  const s = Number(p.stock);
  if (!(s > 0)) return 'out';
  if (s <= Number(p.low_stock_at)) return 'low';
  return 'in';
}

// Reorder hint: units sold per day over the window, days of stock left, how many to order to cover `coverDays`.
function reorderHint({ stock, soldInWindow, windowDays, coverDays = 14, leadDays = 3 }) {
  const perDay = soldInWindow / Math.max(windowDays, 1);
  const daysLeft = perDay > 0 ? Number(stock) / perDay : null;
  const target = perDay * (coverDays + leadDays);
  const order = Math.max(0, Math.ceil(target - Number(stock)));
  return { per_day: Math.round(perDay * 100) / 100, days_left: daysLeft == null ? null : Math.round(daysLeft * 10) / 10, order_qty: order, urgent: daysLeft != null && daysLeft < leadDays + 2 };
}

module.exports = { charm, suggestPrice, allocateShipping, saleApplies, salePrice, effectivePrice, stockStatus, reorderHint };
