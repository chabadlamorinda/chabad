// My Cloud Grocer (the baykosher website).
//
// Two directions, as Cloud Grocer described their "unattended mode" POS integration:
//  * Products -> website: a CSV in their "MCG Data Export Format", uploaded to their FTP server
//    at least every two hours, named <Store>_<YYYYMMDD>_<HHMMSS>.csv. QtyOnHand carries the
//    unified stock, and LastSold / LastReceived let the website publish or hide items.
//  * Orders -> us: their tickets API returns orders that were paid online. We subtract each
//    paid line from stock, and remember the latest PaidDateUtc for the next call.
'use strict';

const { codeIndex, normCode, splitCodes } = require('./catalog');
const { toCsv } = require('./csv');

const HEADER = ['ID', 'SKU', 'BARCODE', 'CATEGORY', 'SUBCATEGORY', 'DESCRIPTION', 'LABELDESCRIPTION', 'BRAND', 'MANUFACTURER', 'SHELF',
  'PRICEPER', 'PRICE', 'CASEQTY', 'CASEPRICE', 'CASESTART', 'CASEEND', 'CASEMAX', 'SALEPRICEPER', 'SALEPRICE', 'SALESTART', 'SALEEND', 'SALEMAX',
  'ONHAND', 'SIZE', 'UNIT', 'ISSNAP', 'FLAGS', 'ISTAXABLE', 'LASTRECEIVED', 'LASTSOLD', 'DATECREATED', 'ADDITIONALSKUS', 'SOLDBYWEIGHT',
  'ESTIMATEDWEIGHT', 'ESTIMATEDWEIGHTUNIT', 'AGERESTRICTED', 'KOSHERFORPASSOVER'];
const FIRST_SYNC_DAYS = 56;

const ymd = (iso) => {
  if (!iso) return '';
  const d = new Date(String(iso).includes('T') || String(iso).includes('Z') ? iso : String(iso).replace(' ', 'T') + 'Z');
  if (isNaN(d)) return '';
  return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
};
const money = (n) => (n == null || n === '' ? '' : (Math.round(Number(n) * 100) / 100).toFixed(2));
const flag = (b) => (b ? 1 : 0);

/** File name the website expects, e.g. Bay_Kosher_20260907_090840.csv (store-local time). */
function exportFileName(prefix, now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return String(prefix || 'Bay_Kosher').replace(/[^A-Za-z0-9_-]+/g, '_') + '_' + now.getFullYear() + p(now.getMonth() + 1) + p(now.getDate()) + '_' + p(now.getHours()) + p(now.getMinutes()) + p(now.getSeconds()) + '.csv';
}

/** Build the product file for the website. */
function buildExport(db) {
  const lastSold = new Map(db.all("SELECT product_id, MAX(at) AS at FROM movements WHERE kind = 'sale' GROUP BY product_id").map((r) => [r.product_id, r.at]));
  const lastRecv = new Map(db.all("SELECT product_id, MAX(at) AS at FROM movements WHERE kind IN ('receive','initial') GROUP BY product_id").map((r) => [r.product_id, r.at]));
  const rows = [HEADER];
  let skipped = 0;
  for (const p of db.all('SELECT * FROM products WHERE active = 1 ORDER BY id')) {
    const sku = p.upc || p.sku;
    if (!sku) { skipped++; continue; }                         // SKU is required by the website
    rows.push([
      p.id, sku, p.upc || '', (p.category || '').toUpperCase(), (p.subcategory || '').toUpperCase(), p.name, p.name, p.brand, p.manufacturer, p.shelf,
      1, money(p.price), '', '', '', '', '', '', '', '', '', '',
      Math.max(0, Math.floor(p.stock + 1e-9)), p.size, p.unit, flag(p.snap), '', flag(p.taxable),
      ymd(lastRecv.get(p.id)), ymd(lastSold.get(p.id)), ymd(p.created_at),
      p.upc && p.sku && normCode(p.sku) !== normCode(p.upc) ? [p.sku, ...splitCodes(p.additional_skus)].join('~') : splitCodes(p.additional_skus).join('~'),
      flag(p.sold_by_weight), p.est_weight == null ? '' : p.est_weight, p.est_weight_unit, flag(p.age_restricted), flag(p.kosher_passover),
    ]);
  }
  return { csv: toCsv(rows), count: rows.length - 1, skipped };
}

/** Upload the product file to the website's FTP server. Tries encrypted FTP first. */
async function uploadExport({ host, port, user, password, dir }, fileName, csv, { ftpModule } = {}) {
  const { Client } = ftpModule || require('basic-ftp');
  const { Readable } = require('stream');
  const attempt = async (secure) => {
    const client = new Client(30000);
    try {
      await client.access({ host, port: Number(port) || 21, user, password, secure, secureOptions: { rejectUnauthorized: false } });
      if (dir) await client.cd(dir);
      await client.uploadFrom(Readable.from([Buffer.from(csv, 'utf8')]), fileName);
    } finally { client.close(); }
  };
  try { await attempt(true); return { secure: true }; }
  catch (e) {
    // Some FTP servers don't offer TLS. The TLS handshake happens before the password is sent,
    // so falling back does not leak anything that the plain connection would not.
    if (!/TLS|SSL|AUTH|534|504|500|502|ECONNRESET|handshake/i.test(String(e && (e.code || '') + ' ' + (e.message || '')))) throw e;
    await attempt(false); return { secure: false };
  }
}

/** Minimal client for the tickets (orders) API. */
function ticketsClient({ baseUrl, username, password, storeId = 1, unattended = true, fetchImpl = fetch }) {
  const base = String(baseUrl).replace(/\/+$/, '');
  return {
    async tickets(fromUtc, pageSize = 250) {
      const q = new URLSearchParams({ username, password, fromDateTimeUtc: fromUtc, storeId: String(storeId), pagesize: String(pageSize), paymentStatusId: '30' });
      if (unattended) q.set('unattendedMode', 'true');
      const res = await fetchImpl(base + '/export/tickets?' + q, { headers: { accept: 'application/json', 'cache-control': 'no-cache' } });
      if (!res.ok) throw new Error('Website orders API returned ' + res.status + (res.status === 401 || res.status === 403 ? ' (check the username and password)' : ''));
      const body = await res.json();
      if (!body || body.success === false) throw new Error('Website orders API error: ' + JSON.stringify(body && (body.message || body.error || body)).slice(0, 200));
      return Array.isArray(body.data) ? body.data : [];
    },
  };
}

/** 'yyyy-MM-ddTHH:mm:ss.fff' in UTC, the format the API expects. */
const apiDate = (d) => new Date(d).toISOString().replace('Z', '').replace(/(\.\d{3})\d*$/, '$1');
const parseUtc = (s) => Date.parse(/Z|[+-]\d\d:?\d\d$/.test(s) ? s : s + 'Z');

/** Import paid web orders and subtract their items from stock. */
async function pullOrders(db, api, now = Date.now()) {
  const golive = Date.parse(db.goLive());
  let cursor = db.setting('web_orders_cursor') || apiDate(now - FIRST_SYNC_DAYS * 86400000);
  const idx = codeIndex(db);
  const getP = (id) => db.get('SELECT id, sold_by_weight, est_weight, case_size FROM products WHERE id = ?', id);
  let tickets = 0, lines = 0, unknown = [];
  for (let page = 0; page < 40; page++) {
    const data = await api.tickets(cursor);
    let next = cursor;
    for (const t of data) {
      if (t.PaidDateUtc && parseUtc(t.PaidDateUtc) > parseUtc(next)) next = apiDate(parseUtc(t.PaidDateUtc));
      if (t.PaymentStatus !== 'Paid') continue;                       // only import tickets that have been paid
      const atMs = parseUtc(t.PaidDateUtc || t.CreatedOnUtc) || now;
      const at = new Date(atMs).toISOString();
      let any = false;
      (t.Products || []).forEach((it, i) => {
        const pid = idx.get(normCode(it.Sku));
        if (!pid) { unknown.push(String(it.Sku)); return; }
        const p = getP(pid);
        let qty = Number(it.Quantity) || 0;
        if (p.sold_by_weight) qty = Number(it.Weight) > 0 ? Number(it.Weight) : qty * (p.est_weight || 1);
        else if (it.Case) qty *= Math.max(1, p.case_size || 1);
        if (!qty) return;
        if (db.move({ product_id: pid, qty: -qty, kind: 'sale', source: 'web', ref: 't' + t.TicketId + ':' + i + ':' + it.Sku, at, counted: atMs >= golive, note: 'Web order ' + (t.OrderId || t.TicketId) })) { lines++; any = true; }
      });
      if (any) tickets++;
    }
    const advanced = next !== cursor;
    cursor = next;
    if (data.length < 250 || !advanced) break;
  }
  db.setSetting('web_orders_cursor', cursor);
  return { tickets, lines, unknown: [...new Set(unknown)].slice(0, 50) };
}

module.exports = { buildExport, exportFileName, uploadExport, ticketsClient, pullOrders, apiDate, HEADER };
