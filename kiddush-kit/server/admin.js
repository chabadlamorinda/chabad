// Staff sign-in for the Kiddush staff page (/admin/kiddush/). Switched off unless ADMIN_PASSWORD is set (12+ characters).
'use strict';
const crypto = require('crypto');
const path = require('path');
const express = require('express');

const COOKIE = 'kb_admin';
const TTL = 12 * 3600e3;

function mountAdmin(app, { store, password, secret, limit, log = console, extend = null }) {
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

  if (extend) extend(r, { authed, wrap });
  r.get('/kiddush', (req, res) => res.sendFile(path.join(__dirname, 'admin', 'kiddush.html')));
  r.get('/kiddush.js', (req, res) => res.sendFile(path.join(__dirname, 'admin', 'kiddush.js')));
  r.get(['/', '/index.html'], (req, res) => res.redirect(302, '/admin/kiddush/'));
  r.use((req, res) => res.status(404).json({ code: 'not_found', error: 'Not found.' }));
  app.use('/admin', r);
  return true;
}
module.exports = { mountAdmin };
