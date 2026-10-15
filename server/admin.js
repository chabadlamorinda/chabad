// Private area for the Rabbi: upcoming yahrzeits (only from people who chose to share),
// members, failed payments, and push broadcasts. Switched off unless ADMIN_PASSWORD is set (12+ characters).
'use strict';
const crypto = require('crypto');
const path = require('path');
const express = require('express');
const H = require('../pushka/hebdate.js');
const { ptParts } = require('./scheduler.js');

const COOKIE = 'cl_admin';
const TTL = 12 * 3600e3;

function mountAdmin(app, { store, password, secret, limit, send, log = console }) {
  if (!password || password.length < 12 || !store) return false;
  const mac = (s) => crypto.createHmac('sha256', secret + ':admin').update(s).digest('base64url');
  const issue = () => { const exp = String(Date.now() + TTL); return exp + '.' + mac(exp); };
  const valid = (tok) => {
    if (typeof tok !== 'string') return false;
    const i = tok.indexOf('.'); if (i < 1) return false;
    const exp = tok.slice(0, i), a = Buffer.from(tok.slice(i + 1)), b = Buffer.from(mac(exp));
    return a.length === b.length && crypto.timingSafeEqual(a, b) && Number(exp) > Date.now();
  };
  const cookieOf = (req) => { const m = new RegExp('(?:^|; )' + COOKIE + '=([^;]+)').exec(req.get('cookie') || ''); return m ? m[1] : ''; };
  const same = (a, b) => { const x = crypto.createHash('sha256').update(String(a)).digest(), y = crypto.createHash('sha256').update(String(b)).digest(); return crypto.timingSafeEqual(x, y); };

  const r = express.Router();
  r.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Robots-Tag', 'noindex'); next(); });
  r.use('/api', express.json({ limit: '10kb' }));
  const authed = (req, res, next) => {
    if (!valid(cookieOf(req))) return res.status(401).json({ code: 'unauthorized', error: 'Please sign in.' });
    if (req.method !== 'GET' && req.get('x-admin') !== '1') return res.status(403).json({ code: 'forbidden', error: 'Forbidden.' });
    next();
  };
  const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => { log.error('admin error:', e && e.message); res.status(500).json({ code: 'server_error', error: 'Something went wrong.' }); });

  r.post('/api/login', limit('admin-login', 8, 15 * 60 * 1000), (req, res) => {
    if (!same(req.body && req.body.password, password)) return res.status(401).json({ code: 'bad_password', error: 'Wrong password.' });
    res.setHeader('Set-Cookie', `${COOKIE}=${issue()}; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=${TTL / 1000}`);
    res.json({ ok: true });
  });
  r.post('/api/logout', (req, res) => { res.setHeader('Set-Cookie', `${COOKIE}=; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=0`); res.json({ ok: true }); });
  r.get('/api/me', authed, (req, res) => res.json({ ok: true }));

  async function upcoming(days, now = new Date()) {
    const today = ptParts(now).ymd;
    const [ys, fu] = await Promise.all([store.sharedYahrzeits(), store.listFollowups()]);
    const fmap = new Map(fu.map((f) => [f.yahrzeit_id + '|' + f.occurrence, f]));
    const out = [];
    for (const y of ys) {
      const occ = H.next({ day: y.h_day, month: y.h_month, year: y.h_year }, today); if (!occ) continue;
      const left = H.daysBetween(today, occ.date); if (left > days) continue;
      const f = fmap.get(y.id + '|' + occ.date);
      out.push({ id: y.id, name: y.name, relation: y.relation, notes: y.notes, hebrew: H.label({ day: y.h_day, month: y.h_month }, false), hebrewHe: H.label({ day: y.h_day, month: y.h_month }, true),
        date: occ.date, daysLeft: left, dateNotes: occ.notes || [], member: { name: y.member_name, email: y.email, phone: y.phone, address: y.address },
        followup: { note: f ? f.note : '', done: !!(f && f.done_at) } });
    }
    return out.sort((a, b) => a.daysLeft - b.daysLeft || a.name.localeCompare(b.name));
  }

  r.get('/api/yahrzeits', authed, wrap(async (req, res) => {
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 60, 1), 400);
    res.json({ days, items: await upcoming(days) });
  }));
  r.put('/api/followup', authed, wrap(async (req, res) => {
    const b = req.body || {};
    if (typeof b.yahrzeitId !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.occurrence || '')) return res.status(400).json({ code: 'invalid', error: 'Invalid request.' });
    await store.setFollowup(b.yahrzeitId.slice(0, 80), b.occurrence, String(b.note || '').slice(0, 500), b.done === true);
    res.json({ ok: true });
  }));
  r.get('/api/members', authed, wrap(async (req, res) => {
    res.json({ members: (await store.listMembers()).map((m) => ({ id: m.id, name: m.name, email: m.email, phone: m.phone, shares: m.share_yahrzeits, yahrzeits: m.share_yahrzeits ? m.yahrzeit_count : null, push: m.push_count, cardIssue: m.card_issue, joined: m.created_at })) });
  }));
  r.get('/api/payments', authed, wrap(async (req, res) => { res.json({ events: await store.listPaymentEvents() }); }));
  r.post('/api/payments/:id/resolve', authed, wrap(async (req, res) => { await store.resolvePayment(req.params.id); res.json({ ok: true }); }));

  // CSV: cells beginning with = + - @ are prefixed so a spreadsheet never runs them as formulas.
  const cell = (v) => { let s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  r.get('/api/export.csv', authed, wrap(async (req, res) => {
    const items = await upcoming(400);
    const head = ['Name', 'Relation', 'Hebrew date', 'Next date', 'Days left', 'Member', 'Email', 'Phone', 'Address', 'Follow-up note', 'Done'];
    const lines = [head.map(cell).join(',')].concat(items.map((i) => [i.name, i.relation, i.hebrew, i.date, i.daysLeft, i.member.name, i.member.email, i.member.phone, i.member.address, i.followup.note, i.followup.done ? 'yes' : ''].map(cell).join(',')));
    res.type('text/csv').set('Content-Disposition', 'attachment; filename="yahrzeits.csv"').send(lines.join('\r\n') + '\r\n');
  }));

  r.post('/api/broadcast', authed, limit('broadcast', 10, 60 * 60 * 1000), wrap(async (req, res) => {
    const b = req.body || {}, title = String(b.title || '').trim(), body = String(b.body || '').trim(), url = String(b.url || '/pushka/');
    if (b.confirm !== true) return res.status(400).json({ code: 'confirm', error: 'Please confirm before sending.' });
    if (!title || title.length > 60 || !body || body.length > 200) return res.status(400).json({ code: 'invalid', error: 'Title up to 60 and message up to 200 characters.' });
    if (!/^\/pushka\/[A-Za-z0-9_\-./?=&]*$/.test(url) || url.includes('..')) return res.status(400).json({ code: 'invalid', error: 'Link must stay inside the app.' });
    if (!send) return res.status(503).json({ code: 'not_configured', error: 'Push notifications are not set up yet (VAPID keys).' });
    const subs = await store.listPushSubs(); let sent = 0;
    for (const s of subs) {
      try { await send(s, { title, body, url, tag: 'broadcast' }); sent++; }
      catch (e) { if (e && (e.statusCode === 404 || e.statusCode === 410)) await store.deletePushSub(s.endpoint); }
    }
    res.json({ ok: true, sent, total: subs.length });
  }));

  r.get(['/', '/index.html'], (req, res) => res.sendFile(path.join(__dirname, 'admin', 'index.html')));
  r.get('/admin.js', (req, res) => res.sendFile(path.join(__dirname, 'admin', 'admin.js')));
  r.use((req, res) => res.status(404).json({ code: 'not_found', error: 'Not found.' }));
  app.use('/admin', r);
  return true;
}
module.exports = { mountAdmin };
