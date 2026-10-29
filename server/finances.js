// Finances: the built-in books and donor records for the Rabbi area (/admin/finances).
//
// * Money in and out, one row each (fin_tx): date, amount, category, fund, how it was paid, who, a note.
// * Online gifts come in by themselves from Stripe (donations, Chai Club, campaigns, Kiddush, form payments), with
//   Stripe's fee as an expense and refunds as money out; campaign gifts the Rabbi entered by hand (checks, cash...)
//   come in from the campaign pages. Everything else (checks, cash, Zelle, grants, rent, every expense) is entered here.
// * People (fin_people): every donor and payee, matched by email, with notes and tags; their giving by year, and a
//   year-end tax letter. Lists: who gave last year but not yet this year, and who gives again and again.
// * Reports: by month, category, fund and payment method; budget against actual; a spreadsheet for the accountant.
// Works wherever the database is on (DATABASE_URL); the tables are created on first use.
'use strict';
const crypto = require('crypto');

const IN_CATEGORIES = ['Donations', 'Chai Club (monthly)', 'Campaign', 'Kiddush sponsorships', 'Events & programs', 'Tuition (preschool, Hebrew school, camp)', 'Holiday kits & sales', 'Grants', 'Rental income', 'Other income'];
const OUT_CATEGORIES = ['Rent / mortgage', 'Utilities', 'Salaries & staff', 'Food & events', 'Holiday programs', 'Programs & supplies', 'Printing & mailing', 'Advertising', 'Website & software', 'Insurance', 'Repairs & maintenance', 'Travel & car', 'Judaica & books', 'Professional fees', 'Bank & card fees', 'Refunds', 'Building', 'Charity given', 'Other expenses'];
const METHODS = { online: 'Online (card, Apple Pay, bank)', check: 'Check', cash: 'Cash', zelle: 'Zelle', ach: 'Bank transfer / ACH', wire: 'Wire', daf: 'Donor-advised fund', stock: 'Stock', paypal: 'PayPal / Venmo', card: 'Card (in person)', other: 'Other' };

const SCHEMA = `
CREATE TABLE IF NOT EXISTS fin_people (
  id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT 'donor', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fin_people_email ON fin_people (lower(email)) WHERE email <> '';
CREATE TABLE IF NOT EXISTS fin_tx (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('in', 'out')), day DATE NOT NULL, cents BIGINT NOT NULL CHECK (cents >= 0),
  category TEXT NOT NULL, fund TEXT NOT NULL DEFAULT '', method TEXT NOT NULL DEFAULT 'other', person_id TEXT REFERENCES fin_people(id) ON DELETE SET NULL,
  payee TEXT NOT NULL DEFAULT '', memo TEXT NOT NULL DEFAULT '', ref TEXT NOT NULL DEFAULT '', deductible BOOLEAN NOT NULL DEFAULT TRUE,
  source TEXT NOT NULL DEFAULT 'manual', ext_id TEXT UNIQUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fin_tx_day ON fin_tx (day);
CREATE INDEX IF NOT EXISTS fin_tx_person ON fin_tx (person_id);
CREATE TABLE IF NOT EXISTS fin_budget (year INT NOT NULL, category TEXT NOT NULL, cents BIGINT NOT NULL, PRIMARY KEY (year, category));
`;

const newId = (p) => p + crypto.randomBytes(9).toString('hex');
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !isNaN(Date.parse(s));
const ptDay = (sec) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(sec * 1000));
const money = (c) => '$' + (Number(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const csvCell = (v) => { let s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
const escHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Which income category an online payment belongs to, from what the website put on it.
function categoryOf(m = {}, description = '') {
  if (m.campaign) return 'Campaign';
  if (m.club === 'yes' || m.fund === 'chai') return 'Chai Club (monthly)';
  if (m.source === 'kiddush' || m.kiddush || /kiddush/i.test(description)) return 'Kiddush sponsorships';
  if (m.form || m.event) return 'Events & programs';
  return 'Donations';
}

function createFinances({ stripe = null, store = null, content = null, mailer = null, log = console, funds = {}, now = () => new Date() }) {
  const pool = store && store.pool;
  let ready = null;
  const ensure = () => (ready = ready || pool.query(SCHEMA));
  const q = async (text, params) => { await ensure(); return pool.query(text, params); };
  const org = () => ((content && content()) || {}).org || {};

  // Find a person by email (or create them); returns the id.
  async function personFor({ name = '', email = '', phone = '', address = '' }, kind = 'donor') {
    email = clean(email, 254).toLowerCase(); name = clean(name, 120);
    if (email) {
      const r = (await q('SELECT id, name, phone, address FROM fin_people WHERE lower(email) = $1', [email])).rows[0];
      if (r) { if ((!r.name && name) || (!r.phone && phone) || (!r.address && address)) await q('UPDATE fin_people SET name = COALESCE(NULLIF(name, \'\'), $2), phone = COALESCE(NULLIF(phone, \'\'), $3), address = COALESCE(NULLIF(address, \'\'), $4) WHERE id = $1', [r.id, name, clean(phone, 40), clean(address, 300)]); return r.id; }
    } else if (!name) return null;
    else { const r = (await q("SELECT id FROM fin_people WHERE email = '' AND lower(name) = lower($1) LIMIT 1", [name])).rows[0]; if (r) return r.id; }
    const id = newId('p_');
    await q('INSERT INTO fin_people (id, name, email, phone, address, kind) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING', [id, name, email, clean(phone, 40), clean(address, 300), kind]);
    return email ? (await q('SELECT id FROM fin_people WHERE lower(email) = $1', [email])).rows[0].id : id;
  }
  async function addTx(t) {
    const r = await q(`INSERT INTO fin_tx (id, kind, day, cents, category, fund, method, person_id, payee, memo, ref, deductible, source, ext_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT (ext_id) DO NOTHING RETURNING id`,
    [t.id || newId('t_'), t.kind, t.day, t.cents, t.category, t.fund || '', t.method || 'other', t.person_id || null, t.payee || '', t.memo || '', t.ref || '', t.deductible !== false, t.source || 'manual', t.ext_id || null]);
    return r.rows[0] ? r.rows[0].id : null;
  }

  // ---- Bring in online payments from Stripe (and campaign gifts entered by hand) ----
  async function syncStripe() {
    if (!stripe) return 0;
    const last = (await store.getKv('fin-stripe-synced', 0)) || 0, started = Math.floor(now().getTime() / 1000);
    let added = 0, after;
    for (let page = 0; page < 100; page++) {
      const ask = (expand) => stripe.balanceTransactions.list({ limit: 100, created: { gte: Math.max(0, last - 86400) }, expand, ...(after ? { starting_after: after } : {}) });
      // Newer Stripe versions have no invoice on a payment: then monthly gifts are read without it (as Donations).
      const list = await ask(['data.source', 'data.source.invoice']).catch(() => ask(['data.source']));
      for (const bt of list.data) {
        const src = bt.source && typeof bt.source === 'object' ? bt.source : {}, day = ptDay(bt.created);
        if (bt.type === 'charge' || bt.type === 'payment') {
          const inv = src.invoice && typeof src.invoice === 'object' ? src.invoice : null;
          const m = { ...((inv && ((inv.subscription_details && inv.subscription_details.metadata) || (inv.parent && inv.parent.subscription_details && inv.parent.subscription_details.metadata))) || {}), ...(src.metadata || {}) };
          const bd = src.billing_details || {}, who = await personFor({ name: m.wall_name && m.wall_show === 'yes' ? bd.name || m.wall_name : bd.name || '', email: bd.email || src.receipt_email || (inv && inv.customer_email) || '', phone: bd.phone || '', address: bd.address ? [bd.address.line1, bd.address.line2, bd.address.city, bd.address.state, bd.address.postal_code].filter(Boolean).join(', ') : '' });
          const memo = [src.description || (inv && inv.description) || '', m.dedication && 'Dedication: ' + m.dedication, m.campaign && 'Campaign: ' + m.campaign].filter(Boolean).join(' · ');
          if (await addTx({ kind: 'in', day, cents: bt.amount, category: categoryOf(m, src.description || ''), fund: m.fund || (m.campaign ? '' : 'general'), method: 'online', person_id: who, memo: memo.slice(0, 300), ref: src.id || bt.id, source: 'stripe', ext_id: bt.id })) added++;
          if (bt.fee > 0) await addTx({ kind: 'out', day, cents: bt.fee, category: 'Bank & card fees', method: 'online', payee: 'Stripe', memo: 'Processing fee', deductible: false, source: 'stripe', ext_id: bt.id + ':fee' });
        } else if (bt.type === 'refund' || bt.type === 'payment_refund') {
          if (await addTx({ kind: 'out', day, cents: Math.abs(bt.amount), category: 'Refunds', method: 'online', payee: 'Refund', memo: src.charge ? 'Refund of ' + (typeof src.charge === 'string' ? src.charge : src.charge.id) : 'Refund', deductible: false, source: 'stripe', ext_id: bt.id })) added++;
        } else if (bt.type === 'stripe_fee' || bt.type === 'adjustment') {
          if (bt.amount < 0 && await addTx({ kind: 'out', day, cents: Math.abs(bt.amount), category: 'Bank & card fees', method: 'online', payee: 'Stripe', memo: bt.description || bt.type, deductible: false, source: 'stripe', ext_id: bt.id })) added++;
        } // payouts are money moving to the bank, not income or expenses
      }
      if (!list.has_more || !list.data.length) break;
      after = list.data[list.data.length - 1].id;
    }
    await store.setKv('fin-stripe-synced', started);
    return added;
  }
  async function syncCampaigns() {
    let added = 0;
    for (const c of ((content && content()) || {}).campaigns || []) {
      for (const g of await store.getKv('campaign-offline:' + c.slug, [])) {
        const who = await personFor({ name: g.name });
        if (await addTx({ kind: 'in', day: ptDay(Math.floor(g.at / 1000)), cents: g.cents, category: 'Campaign', fund: c.fund || '', method: { check: 'check', cash: 'cash', wire: 'wire', stock: 'stock', daf: 'daf' }[g.how] || 'other', person_id: who, memo: ['Campaign: ' + c.title, g.dedication, g.message].filter(Boolean).join(' · ').slice(0, 300), source: 'campaign', ext_id: 'campoff:' + g.id })) added++;
      }
    }
    return added;
  }
  let syncing = null;
  async function sync() {
    if (!pool) return { added: 0 };
    if (!syncing) syncing = (async () => { const a = await syncStripe(); const b = await syncCampaigns(); await store.setKv('fin-last-sync', now().toISOString()); return { added: a + b }; })().finally(() => { syncing = null; });
    return syncing;
  }
  function startAutoSync(ms = 6 * 3600 * 1000) {
    if (!pool || !stripe) return;
    const run = () => sync().catch((e) => log.error('finances sync:', e && e.message));
    setTimeout(run, 60 * 1000).unref(); setInterval(run, ms).unref();
  }

  // ---- Reports ----
  async function summary(year) {
    const y = Number(year) || now().getFullYear(), from = `${y}-01-01`, to = `${y + 1}-01-01`, ly = [`${y - 1}-01-01`, from];
    const sums = async (group) => (await q(`SELECT ${group} AS k, kind, sum(cents)::bigint AS c, count(*)::int AS n FROM fin_tx WHERE day >= $1 AND day < $2 GROUP BY 1, 2 ORDER BY 3 DESC`, [from, to])).rows.map((r) => ({ key: r.k, kind: r.kind, cents: Number(r.c), n: r.n }));
    const tot = (await q("SELECT kind, sum(cents)::bigint AS c FROM fin_tx WHERE day >= $1 AND day < $2 GROUP BY kind", [from, to])).rows;
    const income = Number((tot.find((r) => r.kind === 'in') || {}).c || 0), expenses = Number((tot.find((r) => r.kind === 'out') || {}).c || 0);
    const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, in: 0, out: 0 }));
    for (const r of (await q("SELECT extract(month FROM day)::int AS m, kind, sum(cents)::bigint AS c FROM fin_tx WHERE day >= $1 AND day < $2 GROUP BY 1, 2", [from, to])).rows) months[r.m - 1][r.kind] = Number(r.c);
    const donors = (await q(`SELECT p.id, p.name, p.email, sum(t.cents)::bigint AS c, count(*)::int AS n FROM fin_tx t JOIN fin_people p ON p.id = t.person_id WHERE t.kind = 'in' AND t.day >= $1 AND t.day < $2 GROUP BY p.id ORDER BY c DESC LIMIT 25`, [from, to])).rows.map((r) => ({ id: r.id, name: r.name, email: r.email, cents: Number(r.c), n: r.n }));
    const lapsed = (await q(`SELECT p.id, p.name, p.email, p.phone, sum(t.cents)::bigint AS c FROM fin_tx t JOIN fin_people p ON p.id = t.person_id WHERE t.kind = 'in' AND t.day >= $1 AND t.day < $2
      AND NOT EXISTS (SELECT 1 FROM fin_tx u WHERE u.person_id = p.id AND u.kind = 'in' AND u.day >= $2 AND u.day < $3) GROUP BY p.id ORDER BY c DESC LIMIT 50`, [ly[0], ly[1], to])).rows.map((r) => ({ id: r.id, name: r.name, email: r.email, phone: r.phone, cents: Number(r.c) }));
    const repeat = (await q(`SELECT p.id, p.name, p.email, p.phone, count(*)::int AS n, sum(t.cents)::bigint AS c FROM fin_tx t JOIN fin_people p ON p.id = t.person_id WHERE t.kind = 'in' AND t.day >= $1 AND t.day < $2 AND t.category <> 'Chai Club (monthly)'
      AND NOT EXISTS (SELECT 1 FROM fin_tx u WHERE u.person_id = p.id AND u.category = 'Chai Club (monthly)' AND u.day >= $1) GROUP BY p.id HAVING count(*) >= 2 ORDER BY n DESC, c DESC LIMIT 50`, [ly[0], to])).rows.map((r) => ({ id: r.id, name: r.name, email: r.email, phone: r.phone, n: r.n, cents: Number(r.c) }));
    const budget = (await q('SELECT category, cents FROM fin_budget WHERE year = $1', [y])).rows.map((r) => ({ category: r.category, cents: Number(r.cents) }));
    const lastYear = (await q("SELECT kind, sum(cents)::bigint AS c FROM fin_tx WHERE day >= $1 AND day < $2 GROUP BY kind", ly)).rows;
    return { year: y, income, expenses, net: income - expenses, lastYear: { income: Number((lastYear.find((r) => r.kind === 'in') || {}).c || 0), expenses: Number((lastYear.find((r) => r.kind === 'out') || {}).c || 0) },
      months, byCategory: await sums('category'), byFund: await sums('fund'), byMethod: await sums('method'), donors, lapsed, repeat, budget, lastSync: await store.getKv('fin-last-sync', null), online: !!stripe };
  }

  // A year-end letter listing a person's tax-deductible gifts (printable, or emailed).
  async function letter(personId, year) {
    const p = (await q('SELECT * FROM fin_people WHERE id = $1', [personId])).rows[0]; if (!p) return null;
    const gifts = (await q("SELECT day, cents, method, memo FROM fin_tx WHERE person_id = $1 AND kind = 'in' AND deductible AND day >= $2 AND day < $3 ORDER BY day", [p.id, `${year}-01-01`, `${year + 1}-01-01`])).rows;
    const o = org(), total = gifts.reduce((a, g) => a + Number(g.cents), 0), addr = o.address ? [o.address.street, [o.address.city, o.address.region, o.address.postal].filter(Boolean).join(' ')].filter(Boolean).join(', ') : '';
    const rows = gifts.map((g) => `<tr><td>${escHtml(String(g.day instanceof Date ? g.day.toISOString().slice(0, 10) : g.day).slice(0, 10))}</td><td>${escHtml(METHODS[g.method] || g.method)}</td><td style="text-align:right">${money(g.cents)}</td></tr>`).join('');
    const text = `Dear ${p.name || 'friend'},\n\nThank you for your generous support of ${o.name || 'our organization'} in ${year}. Your gifts this year total ${money(total)}.\n\n${gifts.map((g) => `${String(g.day instanceof Date ? g.day.toISOString() : g.day).slice(0, 10)}  ${money(g.cents)}  ${METHODS[g.method] || g.method}`).join('\n')}\n\nNo goods or services were provided in exchange for these contributions, other than intangible religious benefits. ${o.legal || ''}\n\nWith blessings and gratitude,\n${o.name || ''}\n${addr}`;
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escHtml(year + ' giving: ' + (p.name || ''))}</title>
<style>body{font:16px/1.6 Georgia,serif;max-width:720px;margin:40px auto;padding:0 20px;color:#1d1d1d}h1{font-weight:400;font-size:24px;margin:0}table{width:100%;border-collapse:collapse;margin:16px 0}td,th{border-bottom:1px solid #ddd;padding:6px 4px;text-align:left}.org{color:#555;font-size:14px}.no-print{margin:20px 0}@media print{.no-print{display:none}}</style></head><body>
<p class="no-print"><button onclick="print()">Print</button></p>
<h1>${escHtml(o.name || '')}</h1><p class="org">${escHtml(addr)}${o.phone ? ' · ' + escHtml(o.phone) : ''}${o.email ? ' · ' + escHtml(o.email) : ''}</p>
<p>${escHtml(new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }))}</p>
<p>${escHtml(p.name || '')}${p.address ? '<br>' + escHtml(p.address) : ''}</p>
<p>Dear ${escHtml(p.name || 'friend')},</p>
<p>Thank you for your generous support of ${escHtml(o.name || 'our organization')} in ${year}. Your gifts this year total <b>${money(total)}</b>.</p>
<table><thead><tr><th>Date</th><th>How</th><th style="text-align:right">Amount</th></tr></thead><tbody>${rows || '<tr><td colspan="3">No gifts this year.</td></tr>'}</tbody></table>
<p>No goods or services were provided in exchange for these contributions, other than intangible religious benefits. ${escHtml(o.legal || '')}</p>
<p>With blessings and gratitude,<br>${escHtml(o.name || '')}</p></body></html>`;
    return { person: p, total, count: gifts.length, html, text };
  }

  function readTx(b, existing = {}) {
    const kind = b.kind === 'out' ? 'out' : b.kind === 'in' ? 'in' : existing.kind;
    const cents = b.amount != null ? Math.round(Number(b.amount) * 100) : existing.cents;
    const day = b.day != null ? b.day : existing.day;
    if (!['in', 'out'].includes(kind)) throw Object.assign(new Error('Choose money in or money out.'), { status: 400 });
    if (!Number.isFinite(cents) || cents <= 0 || cents > 10000000000) throw Object.assign(new Error('Please enter the amount.'), { status: 400 });
    if (!isDay(day)) throw Object.assign(new Error('Please enter the date.'), { status: 400 });
    const cats = kind === 'in' ? IN_CATEGORIES : OUT_CATEGORIES, category = clean(b.category != null ? b.category : existing.category, 60);
    return { kind, cents, day, category: cats.includes(category) ? category : kind === 'in' ? 'Other income' : 'Other expenses', fund: clean(b.fund != null ? b.fund : existing.fund, 40),
      method: Object.prototype.hasOwnProperty.call(METHODS, b.method) ? b.method : existing.method || 'other', payee: clean(b.payee != null ? b.payee : existing.payee, 120), memo: clean(b.memo != null ? b.memo : existing.memo, 300),
      ref: clean(b.ref != null ? b.ref : existing.ref, 60), deductible: kind === 'in' && (b.deductible != null ? b.deductible !== false : existing.deductible !== false) };
  }

  function mountAdmin(r, { authed, wrap }) {
    const path = require('path');
    r.get('/finances', (req, res) => res.sendFile(path.join(__dirname, 'admin', 'finances.html')));
    r.get('/finances.js', (req, res) => res.sendFile(path.join(__dirname, 'admin', 'finances.js')));
    const need = (req, res, next) => (pool ? next() : res.status(503).json({ error: 'The finances need the database (DATABASE_URL).' }));
    const fail = (res, e) => res.status(e.status || 500).json({ error: e.status ? e.message : 'Something went wrong.' });
    r.get('/api/fin/meta', authed, (req, res) => res.json({ in: IN_CATEGORIES, out: OUT_CATEGORIES, methods: METHODS, funds, online: !!stripe, db: !!pool }));
    r.get('/api/fin/summary', authed, need, wrap(async (req, res) => res.json(await summary(req.query.year))));
    r.post('/api/fin/sync', authed, need, wrap(async (req, res) => res.json(await sync())));
    r.get('/api/fin/tx', authed, need, wrap(async (req, res) => {
      const y = Number(req.query.year) || now().getFullYear(), where = ['t.day >= $1', 't.day < $2'], args = [`${y}-01-01`, `${y + 1}-01-01`];
      if (['in', 'out'].includes(req.query.kind)) { args.push(req.query.kind); where.push('t.kind = $' + args.length); }
      if (req.query.category) { args.push(String(req.query.category)); where.push('t.category = $' + args.length); }
      if (req.query.person) { args.push(String(req.query.person)); where.push('t.person_id = $' + args.length); }
      if (req.query.q) { args.push('%' + String(req.query.q).toLowerCase().slice(0, 60) + '%'); where.push(`(lower(t.memo) LIKE $${args.length} OR lower(t.payee) LIKE $${args.length} OR lower(coalesce(p.name, '')) LIKE $${args.length} OR lower(t.ref) LIKE $${args.length})`); }
      const rows = (await q(`SELECT t.*, to_char(t.day, 'YYYY-MM-DD') AS d, p.name AS person FROM fin_tx t LEFT JOIN fin_people p ON p.id = t.person_id WHERE ${where.join(' AND ')} ORDER BY t.day DESC, t.created_at DESC LIMIT 1000`, args)).rows;
      res.json({ items: rows.map((t) => ({ id: t.id, kind: t.kind, day: t.d, cents: Number(t.cents), category: t.category, fund: t.fund, method: t.method, person_id: t.person_id, person: t.person || '', payee: t.payee, memo: t.memo, ref: t.ref, deductible: t.deductible, source: t.source })) });
    }));
    r.post('/api/fin/tx', authed, need, wrap(async (req, res) => {
      try {
        const b = req.body || {}, t = readTx(b), who = b.person_id || (b.personName || b.personEmail ? await personFor({ name: b.personName, email: b.personEmail, phone: b.personPhone }, t.kind === 'out' ? 'payee' : 'donor') : null);
        res.json({ ok: true, id: await addTx({ ...t, person_id: who, source: 'manual' }) });
      } catch (e) { fail(res, e); }
    }));
    r.put('/api/fin/tx/:id', authed, need, wrap(async (req, res) => {
      const old = (await q("SELECT *, to_char(day, 'YYYY-MM-DD') AS d FROM fin_tx WHERE id = $1", [req.params.id])).rows[0]; if (!old) return res.status(404).json({ error: 'Not found.' });
      try {
        const b = { ...req.body }; if (old.source !== 'manual') { delete b.amount; delete b.day; delete b.kind; } // online payments keep their amount and date
        const t = readTx(b, { ...old, day: old.d, cents: Number(old.cents) });
        await q('UPDATE fin_tx SET kind=$2, day=$3, cents=$4, category=$5, fund=$6, method=$7, payee=$8, memo=$9, ref=$10, deductible=$11 WHERE id=$1', [old.id, t.kind, t.day, t.cents, t.category, t.fund, t.method, t.payee, t.memo, t.ref, t.deductible]);
        res.json({ ok: true });
      } catch (e) { fail(res, e); }
    }));
    r.delete('/api/fin/tx/:id', authed, need, wrap(async (req, res) => {
      const r2 = await q("DELETE FROM fin_tx WHERE id = $1 AND source = 'manual' RETURNING id", [req.params.id]);
      res.status(r2.rows.length ? 200 : 400).json(r2.rows.length ? { ok: true } : { error: 'Online payments cannot be deleted here (they come from Stripe).' });
    }));
    r.get('/api/fin/people', authed, need, wrap(async (req, res) => {
      const s = '%' + String(req.query.q || '').toLowerCase().slice(0, 60) + '%', y = now().getFullYear();
      const rows = (await q(`SELECT p.*, COALESCE(sum(t.cents) FILTER (WHERE t.kind = 'in'), 0)::bigint AS total, COALESCE(sum(t.cents) FILTER (WHERE t.kind = 'in' AND t.day >= $2), 0)::bigint AS this_year,
        to_char(max(t.day) FILTER (WHERE t.kind = 'in'), 'YYYY-MM-DD') AS last_gift, count(t.id) FILTER (WHERE t.kind = 'in')::int AS gifts
        FROM fin_people p LEFT JOIN fin_tx t ON t.person_id = p.id WHERE lower(p.name) LIKE $1 OR lower(p.email) LIKE $1 OR lower(p.tags) LIKE $1 OR p.phone LIKE $1
        GROUP BY p.id ORDER BY total DESC, p.name LIMIT 500`, [s, `${y}-01-01`])).rows;
      res.json({ items: rows.map((p) => ({ id: p.id, name: p.name, email: p.email, phone: p.phone, tags: p.tags, kind: p.kind, total: Number(p.total), thisYear: Number(p.this_year), lastGift: p.last_gift, gifts: p.gifts })) });
    }));
    r.get('/api/fin/people/:id', authed, need, wrap(async (req, res) => {
      const p = (await q('SELECT * FROM fin_people WHERE id = $1', [req.params.id])).rows[0]; if (!p) return res.status(404).json({ error: 'Not found.' });
      const years = (await q("SELECT extract(year FROM day)::int AS y, sum(cents)::bigint AS c, count(*)::int AS n FROM fin_tx WHERE person_id = $1 AND kind = 'in' GROUP BY 1 ORDER BY 1 DESC", [p.id])).rows.map((r) => ({ year: r.y, cents: Number(r.c), n: r.n }));
      const tx = (await q("SELECT id, kind, to_char(day, 'YYYY-MM-DD') AS day, cents, category, fund, method, memo, source FROM fin_tx WHERE person_id = $1 ORDER BY day DESC LIMIT 500", [p.id])).rows.map((t) => ({ ...t, cents: Number(t.cents) }));
      res.json({ person: { id: p.id, name: p.name, email: p.email, phone: p.phone, address: p.address, notes: p.notes, tags: p.tags, kind: p.kind }, years, tx });
    }));
    r.post('/api/fin/people', authed, need, wrap(async (req, res) => {
      const b = req.body || {}; if (!clean(b.name, 120) && !clean(b.email, 254)) return res.status(400).json({ error: 'Please enter a name or email.' });
      res.json({ ok: true, id: await personFor({ name: b.name, email: b.email, phone: b.phone, address: b.address }, b.kind === 'payee' ? 'payee' : 'donor') });
    }));
    r.put('/api/fin/people/:id', authed, need, wrap(async (req, res) => {
      const b = req.body || {};
      try { await q('UPDATE fin_people SET name=$2, email=$3, phone=$4, address=$5, notes=$6, tags=$7 WHERE id=$1', [req.params.id, clean(b.name, 120), clean(b.email, 254).toLowerCase(), clean(b.phone, 40), clean(b.address, 300), clean(b.notes, 4000), clean(b.tags, 200)]); }
      catch (e) { return res.status(400).json({ error: 'Another person already has this email.' }); }
      res.json({ ok: true });
    }));
    r.put('/api/fin/budget', authed, need, wrap(async (req, res) => {
      const y = Number(req.body && req.body.year), items = (req.body && req.body.items) || [];
      if (!(y > 2000 && y < 2200)) return res.status(400).json({ error: 'Which year?' });
      for (const it of items) {
        const cat = clean(it.category, 60), c = Math.round(Number(it.amount) * 100);
        if (![...IN_CATEGORIES, ...OUT_CATEGORIES].includes(cat)) continue;
        if (Number.isFinite(c) && c > 0) await q('INSERT INTO fin_budget (year, category, cents) VALUES ($1,$2,$3) ON CONFLICT (year, category) DO UPDATE SET cents = EXCLUDED.cents', [y, cat, c]);
        else await q('DELETE FROM fin_budget WHERE year = $1 AND category = $2', [y, cat]);
      }
      res.json({ ok: true });
    }));
    r.get('/api/fin/export.csv', authed, need, wrap(async (req, res) => {
      const y = Number(req.query.year) || now().getFullYear();
      const rows = (await q(`SELECT to_char(t.day, 'YYYY-MM-DD') AS d, t.kind, t.cents, t.category, t.fund, t.method, coalesce(p.name, '') AS person, coalesce(p.email, '') AS email, t.payee, t.memo, t.ref, t.deductible, t.source FROM fin_tx t LEFT JOIN fin_people p ON p.id = t.person_id WHERE t.day >= $1 AND t.day < $2 ORDER BY t.day`, [`${y}-01-01`, `${y + 1}-01-01`])).rows;
      const lines = [['Date', 'In/Out', 'Amount', 'Category', 'Fund', 'How paid', 'Person', 'Email', 'Paid to', 'Note', 'Reference', 'Tax-deductible', 'Source'], ...rows.map((t) => [t.d, t.kind === 'in' ? 'In' : 'Out', (Number(t.cents) / 100).toFixed(2), t.category, funds[t.fund] || t.fund, METHODS[t.method] || t.method, t.person, t.email, t.payee, t.memo, t.ref, t.deductible ? 'yes' : 'no', t.source])];
      res.type('text/csv').set('Content-Disposition', `attachment; filename="finances-${y}.csv"`).send(lines.map((l) => l.map(csvCell).join(',')).join('\r\n'));
    }));
    r.get('/finances/letter/:id', authed, need, wrap(async (req, res) => {
      const L = await letter(req.params.id, Number(req.query.year) || now().getFullYear() - 1); if (!L) return res.status(404).send('Not found');
      res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'").type('html').send(L.html);
    }));
    // Email every donor with tax-deductible gifts that year their letter (only when the Rabbi presses the button).
    r.post('/api/fin/letters', authed, need, wrap(async (req, res) => {
      const y = Number(req.body && req.body.year); if (!(y > 2000) || !(req.body && req.body.confirm === true)) return res.status(400).json({ error: 'Which year?' });
      if (!mailer) return res.status(503).json({ error: 'Email sending is not set up yet (SMTP_URL).' });
      const ids = (await q("SELECT DISTINCT p.id FROM fin_tx t JOIN fin_people p ON p.id = t.person_id WHERE t.kind = 'in' AND t.deductible AND p.email <> '' AND t.day >= $1 AND t.day < $2", [`${y}-01-01`, `${y + 1}-01-01`])).rows.map((x) => x.id);
      let sent = 0;
      for (const id of ids) { const L = await letter(id, y); try { await mailer.send({ to: L.person.email, subject: `${y} giving summary from ${org().name || 'us'}`, text: L.text }); sent++; } catch (e) { log.error('letter:', e && e.message); } }
      res.json({ ok: true, sent, total: ids.length });
    }));
  }

  return { mountAdmin, sync, startAutoSync, summary, letter, personFor, addTx, categoryOf };
}

module.exports = { createFinances, categoryOf, IN_CATEGORIES, OUT_CATEGORIES, METHODS, SCHEMA };
