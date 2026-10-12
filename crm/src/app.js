// HTTP app: the password-protected dashboard + its JSON API, plus the Telegram / Twilio webhooks.
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');

const COOKIE = 'crm_session';
const SESSION_DAYS = 30;

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

function createApp({ db, inbox, adminPassword, sessionSecret, routers = [], log = console }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.get('/healthz', (req, res) => res.json({ ok: true }));
  for (const r of routers) app.use(r);

  // ---------- login ----------
  const mac = (s) => crypto.createHmac('sha256', sessionSecret).update(s).digest('base64url');
  const makeToken = () => { const exp = String(Date.now() + SESSION_DAYS * 864e5); return `${exp}.${mac(exp)}`; };
  const validToken = (t) => {
    const [exp, sig] = String(t || '').split('.');
    if (!exp || !sig || Number(exp) < Date.now()) return false;
    const a = Buffer.from(sig); const b = Buffer.from(mac(exp));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  };
  const cookieOf = (req) => (String(req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith(COOKIE + '=')) || '').slice(COOKIE.length + 1);
  const sameSecret = (a, b) => { const x = crypto.createHash('sha256').update(String(a)).digest(); const y = crypto.createHash('sha256').update(String(b)).digest(); return crypto.timingSafeEqual(x, y); };

  const attempts = new Map();
  app.post('/api/login', express.json(), (req, res) => {
    const key = req.ip;
    const a = attempts.get(key) || { n: 0, until: 0 };
    if (a.until > Date.now()) return res.status(429).json({ error: 'Too many tries. Wait a few minutes.' });
    if (!adminPassword || !sameSecret((req.body || {}).password || '', adminPassword)) {
      a.n += 1; if (a.n >= 8) { a.n = 0; a.until = Date.now() + 10 * 60e3; } attempts.set(key, a);
      return res.status(401).json({ error: 'Wrong password.' });
    }
    attempts.delete(key);
    res.cookie(COOKIE, makeToken(), { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: SESSION_DAYS * 864e5, path: '/' });
    res.json({ ok: true });
  });
  app.post('/api/logout', (req, res) => { res.clearCookie(COOKIE, { path: '/' }); res.json({ ok: true }); });

  const requireLogin = (req, res, next) => (validToken(cookieOf(req)) ? next() : res.status(401).json({ error: 'Please log in.' }));
  app.use('/api', requireLogin);
  app.use('/api', express.json({ limit: '30mb' }));

  const wrap = (fn) => (req, res, next) => Promise.resolve().then(() => fn(req, res)).then((out) => { if (out !== undefined) res.json(out); }).catch(next);
  const id = (req) => { const n = Number(req.params.id); if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'Bad id'); return n; };
  const year = (req) => (req.query.year ? Number(req.query.year) : new Date().getFullYear());
  const found = (x) => { if (!x) throw new HttpError(404, 'Not found'); return x; };

  app.get('/api/me', (req, res) => res.json({ ok: true }));

  // ---------- talk to the CRM from the dashboard ----------
  app.post('/api/message', wrap(async (req) => {
    const b = req.body || {};
    const decode = (f) => ({ buffer: Buffer.from(String(f.base64 || ''), 'base64'), mime: String(f.mime || '') });
    const voice = b.voice && b.voice.base64 ? decode(b.voice) : null;
    const photos = Array.isArray(b.photos) ? b.photos.slice(0, 5).filter((p) => p && p.base64).map(decode) : [];
    const text = String(b.text || '');
    if (!text.trim() && !voice && !photos.length) throw new HttpError(400, 'Send text, a voice note or a photo.');
    return inbox.receive({ channel: 'web', chatId: 'web', text, voice, photos });
  }));
  app.get('/api/messages', wrap(() => db.listMessages(100)));
  app.get('/api/attachments/:id', wrap((req, res) => {
    const a = found(db.getAttachment(id(req)));
    const file = db.uploadsDir && path.join(db.uploadsDir, path.basename(a.file));
    if (!file || !fs.existsSync(file)) throw new HttpError(404, 'File missing');
    res.type(a.mime).sendFile(file);
  }));

  // ---------- data ----------
  app.get('/api/summary', wrap((req) => ({ ...db.yearSummary(year(req)), follow_ups: db.followUps(new Date().toISOString().slice(0, 10)) })));

  app.get('/api/people', wrap((req) => db.listPeople({ q: String(req.query.q || '') })));
  app.get('/api/people/:id', wrap((req) => found(db.personProfile(id(req)))));
  app.post('/api/people', wrap((req) => db.createPerson(req.body || {})));
  app.patch('/api/people/:id', wrap((req) => db.updatePerson(id(req), req.body || {})));
  app.delete('/api/people/:id', wrap((req) => ({ deleted: db.deletePerson(id(req)) })));

  app.get('/api/donations', wrap((req) => db.listDonations({ year: year(req), person_id: req.query.person_id ? Number(req.query.person_id) : undefined })));
  app.post('/api/donations', wrap((req) => db.addDonation(req.body || {})));
  app.patch('/api/donations/:id', wrap((req) => db.updateDonation(id(req), req.body || {})));
  app.delete('/api/donations/:id', wrap((req) => ({ deleted: db.deleteDonation(id(req)) })));
  app.get('/api/donations.csv', wrap((req, res) => {
    const y = year(req);
    const rows = db.listDonations({ year: y });
    const cols = ['date', 'name', 'amount', 'method', 'fund', 'check_number', 'note', 'email', 'address', 'city'];
    const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : s; };
    res.type('text/csv').attachment(`donations-${y}.csv`).send([cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n'));
  }));

  app.get('/api/activities', wrap((req) => db.listActivities({ year: req.query.year === 'all' ? undefined : year(req), type: req.query.type || undefined, person_id: req.query.person_id ? Number(req.query.person_id) : undefined })));
  app.post('/api/activities', wrap((req) => db.addActivity(req.body || {})));
  app.patch('/api/activities/:id', wrap((req) => db.updateActivity(id(req), req.body || {})));
  app.delete('/api/activities/:id', wrap((req) => ({ deleted: db.deleteActivity(id(req)) })));

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || (err instanceof Error && /must be|Invalid|No person|No donation|No activity|Unknown|needs at least/.test(err.message) ? 400 : 500);
    if (status >= 500) log.error(err);
    res.status(status).json({ error: status >= 500 ? 'Server error' : err.message });
  });

  // ---------- dashboard ----------
  app.use(express.static(path.join(__dirname, '..', 'public'), { index: 'index.html' }));
  return app;
}

module.exports = { createApp };
