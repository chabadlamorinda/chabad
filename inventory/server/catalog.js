// Finding the same product across Clover, the website and supplier invoices.
'use strict';

/** Barcodes come with and without leading zeros / check digits; compare them loosely. */
function normCode(c) {
  const s = String(c == null ? '' : c).trim().toUpperCase().replace(/\.$/, '');
  if (!s) return '';
  if (/^\d+$/.test(s)) return s.replace(/^0+/, '') || '0';
  return s.replace(/\s+/g, '');
}
const splitCodes = (s) => String(s || '').split(/[~,;|\s]+/).map(normCode).filter(Boolean);

/** Map of every code (sku, upc, extra skus) -> product id. */
function codeIndex(db) {
  const idx = new Map();
  for (const p of db.all('SELECT id, sku, upc, additional_skus FROM products')) {
    for (const c of [normCode(p.sku), normCode(p.upc), ...splitCodes(p.additional_skus)]) if (c && !idx.has(c)) idx.set(c, p.id);
  }
  return idx;
}

const STOP = new Set(['the', 'and', 'of', 'with', 'oz', 'lb', 'lbs', 'ct', 'pk', 'pack', 'ea', 'each', 'cs', 'case', 'x', 'gr', 'g', 'ml']);
function tokens(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((t) => t && !STOP.has(t));
}
/**
 * 0..1 similarity of an invoice/line text `a` to a product name `b`. Mostly "how much of the
 * product's name appears in the line", since invoice lines carry extra pack and size words.
 */
function nameScore(a, b) {
  const A = new Set(tokens(a)), B = new Set(tokens(b));
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const t of B) if (A.has(t) || [...A].some((u) => u.length > 3 && t.length > 3 && (u.startsWith(t) || t.startsWith(u)))) hit++;
  return 0.7 * hit / B.size + 0.3 * Math.min(1, hit / A.size);
}

module.exports = { normCode, splitCodes, codeIndex, nameScore, tokens };
