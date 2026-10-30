// Sign in with an emailed code (no passwords), and keep each person's own pushka on all their devices.
// Needs the database (DATABASE_URL) and email (SMTP_URL + MAIL_FROM). Without them the app simply stays on one device.
'use strict';
const crypto = require('crypto');
const express = require('express');

const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
const validEmail = (e) => /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(e) && e.length <= 254;
const CODE_MINUTES = 10, MAX_ATTEMPTS = 5, COOLDOWN_SECONDS = 30, STATE_LIMIT = '1mb';

function mountAccounts(app, { store, mailer, tokens, sessionSecret, limit, log = console }) {
  const on = !!(store && mailer);
  const hashCode = (email, code) => crypto.createHmac('sha256', sessionSecret + ':code').update(email + ':' + code).digest('hex');
  const same = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };
  const fail = (res, status, code, error) => res.status(status).json({ code, error });
  const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => { log.error('account error:', e && e.message); fail(res, 500, 'server_error', 'Something went wrong. Please try again.'); });
  const needOn = (req, res, next) => (on ? next() : fail(res, 503, 'not_configured', 'Signing in is not set up yet.'));
  const json = express.json({ limit: '10kb' });

  const MAIL = {
    en: (code) => ({ subject: `Your code: ${code}`, text: `Your sign-in code for My Pushka (Chabad of Lamorinda) is:\n\n    ${code}\n\nIt works for ${CODE_MINUTES} minutes. If you did not ask for it, you can ignore this email.` }),
    he: (code) => ({ subject: `הקוד שלכם: ${code}`, text: `קוד הכניסה שלכם ל״קופת הצדקה שלי״ (חב״ד לאמורינדה) הוא:\n\n    ${code}\n\nהקוד תקף למשך ${CODE_MINUTES} דקות. אם לא ביקשתם אותו, אפשר להתעלם מהמייל.` }),
  };

  app.post('/api/auth/request', json, needOn, limit('auth-req', 12, 15 * 60 * 1000), wrap(async (req, res) => {
    const email = clean(req.body && req.body.email, 254).toLowerCase();
    if (!validEmail(email)) return fail(res, 400, 'invalid_email', 'Please enter a valid email address.');
    const old = await store.getAuthCode(email);
    if (old && Number(old.age) < COOLDOWN_SECONDS) return fail(res, 429, 'too_soon', 'Please wait a moment before asking for another code.');
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    await store.putAuthCode(email, hashCode(email, code), CODE_MINUTES);
    const m = (MAIL[req.body && req.body.lang === 'he' ? 'he' : 'en'])(code);
    try { await mailer.send({ to: email, subject: m.subject, text: m.text }); }
    catch (e) { await store.deleteAuthCode(email); log.error('sign-in email failed:', e && e.message); return fail(res, 502, 'email_failed', 'We could not send the email. Please check the address and try again.'); }
    res.json({ ok: true, minutes: CODE_MINUTES }); // the same answer whether or not this email already has an account
  }));

  app.post('/api/auth/verify', json, needOn, limit('auth-verify', 30, 15 * 60 * 1000), wrap(async (req, res) => {
    const email = clean(req.body && req.body.email, 254).toLowerCase(), code = clean(req.body && req.body.code, 12).replace(/\s/g, '');
    if (!validEmail(email) || !/^\d{6}$/.test(code)) return fail(res, 400, 'invalid_code', 'Please enter the 6-digit code.');
    const row = await store.getAuthCode(email);
    if (!row || !row.live || row.attempts >= MAX_ATTEMPTS) return fail(res, 400, 'code_expired', 'That code has expired. Please ask for a new one.');
    if (!same(row.code_hash, hashCode(email, code))) { await store.bumpAuthAttempts(email); return fail(res, 400, 'invalid_code', 'That code is not right.'); }
    await store.deleteAuthCode(email);
    let m = await store.verifiedMemberByEmail(email);
    if (!m) { const id = await store.createVerifiedMember(email, clean(req.body && req.body.name, 100)); m = await store.getMember(id); }
    const st = await store.getState(m.id);
    res.json({ token: tokens.signMember(m.id), email: m.email, name: m.name || '', stripeToken: m.stripe_customer_id ? tokens.signCustomer(m.stripe_customer_id) : '', hasState: !!st, rev: st ? st.rev : 0 });
  }));

  // ---- the signed-in person's own data ----
  const auth = async (req, res, next) => {
    try {
      const h = /^Bearer (.+)$/.exec(req.get('authorization') || ''), id = h && tokens.verifyMember(h[1]), m = id && await store.getMember(id);
      if (!m || !m.verified_at) return fail(res, 401, 'unauthorized', 'Please sign in again.');
      req.member = m; next();
    } catch (e) { next(e); }
  };
  app.get('/api/account', needOn, auth, wrap(async (req, res) => {
    const m = req.member, st = await store.getState(m.id);
    res.json({ email: m.email, name: m.name, stripeToken: m.stripe_customer_id ? tokens.signCustomer(m.stripe_customer_id) : '', hasState: !!st, rev: st ? st.rev : 0 });
  }));
  app.get('/api/account/state', needOn, auth, limit('state-get', 120, 10 * 60 * 1000), wrap(async (req, res) => {
    const st = await store.getState(req.member.id); res.setHeader('Cache-Control', 'no-store');
    res.json(st ? { rev: st.rev, state: st.state, updatedAt: new Date(st.updated_at).getTime() } : { rev: 0, state: null, updatedAt: 0 });
  }));
  app.put('/api/account/state', express.json({ limit: STATE_LIMIT }), needOn, auth, limit('state-put', 240, 10 * 60 * 1000), wrap(async (req, res) => {
    const b = req.body || {}, state = b.state;
    if (!state || typeof state !== 'object' || Array.isArray(state)) return fail(res, 400, 'invalid_state', 'Nothing to save.');
    for (const k of ['token', 'mtoken', 'bio', 'notified', 'candles']) delete state[k]; // never keep a device's keys or sign-in on the server
    res.setHeader('Cache-Control', 'no-store');
    if (b.force === true) return res.json({ rev: await store.forceState(req.member.id, state) });
    const rev = await store.putState(req.member.id, parseInt(b.baseRev, 10) || 0, state);
    if (rev) return res.json({ rev });
    const cur = await store.getState(req.member.id); // someone (another device) saved first
    res.status(409).json({ code: 'conflict', error: 'Newer data exists.', rev: cur ? cur.rev : 0, state: cur ? cur.state : null, updatedAt: cur ? new Date(cur.updated_at).getTime() : 0 });
  }));
  return on;
}
module.exports = { mountAccounts };
