// Members (name/email/phone), yahrzeit sync, and push-notification subscriptions.
'use strict';
const H = require('../pushka/hebdate.js');
const { validTz } = require('./scheduler.js');

const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
const validEmail = (e) => /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(e) && e.length <= 254;

function sanitizeEntries(list) {
  if (!Array.isArray(list) || list.length > 30) return null;
  const out = [], seen = new Set();
  for (const e of list) {
    const id = clean(e && e.id, 40).replace(/[^A-Za-z0-9_-]/g, '');
    const name = clean(e && e.name, 80), day = Number(e && e.day), month = e && e.month, year = e && e.year ? Number(e.year) : null;
    if (!id || seen.has(id) || !name || !Number.isInteger(day) || day < 1 || day > 30 || !H.MONTHS.includes(month)) return null;
    if (year !== null && (!Number.isInteger(year) || year < 4000 || year > 6000)) return null;
    seen.add(id); out.push({ id, name, relation: clean(e.relation, 40), day, month, year, notes: clean(e.notes, 200) });
  }
  return out;
}
function sanitizePrefs(p) {
  p = p || {}; const leads = Array.isArray(p.yahrzeit && p.yahrzeit.leads) ? [...new Set(p.yahrzeit.leads.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 30))].slice(0, 6) : [30, 7, 1];
  return {
    lang: p.lang === 'he' ? 'he' : 'en',
    candle: { on: !!(p.candle && p.candle.on), mins: Math.min(Math.max(Number(p.candle && p.candle.mins) || 15, 5), 120) },
    streak: { on: !!(p.streak && p.streak.on) },
    yahrzeit: { on: !!(p.yahrzeit && p.yahrzeit.on), leads },
    lastCoin: /^\d{4}-\d{2}-\d{2}$/.test(p.lastCoin || '') ? p.lastCoin : '',
    streakN: Math.min(Math.max(parseInt(p.streakN, 10) || 0, 0), 5000),
    tz: validTz(p.tz) ? p.tz : '',
    weekly: { on: !!(p.weekly && p.weekly.on) },
    week: { coins: Math.min(Math.max(parseInt(p.week && p.week.coins, 10) || 0, 0), 10000), sum: Math.min(Math.max(Number(p.week && p.week.sum) || 0, 0), 1e7) },
    custom: (Array.isArray(p.custom) ? p.custom : []).slice(0, 12).map((c) => ({ id: clean(c && c.id, 20).replace(/[^A-Za-z0-9_-]/g, ''), time: /^\d{2}:\d{2}$/.test(c && c.time) ? c.time : '', days: ['daily', 'weekdays', 'friday', 'roshchodesh', 'chai', 'erevrc', 'prefast', 'once'].includes(c && c.days) ? c.days : '', date: /^\d{4}-\d{2}-\d{2}$/.test((c && c.date) || '') ? c.date : '', text: clean(c && c.text, 120) })).filter((c) => c.id && c.time && c.days && (c.days !== 'once' || c.date)),
    dates: (Array.isArray(p.dates) ? p.dates : []).slice(0, 20).map((d) => ({ id: clean(d && d.id, 20).replace(/[^A-Za-z0-9_-]/g, ''), name: clean(d && d.name, 60), kind: clean(d && d.kind, 20), m: parseInt(d && d.m, 10), d: parseInt(d && d.d, 10) })).filter((d) => d.id && d.name && d.m >= 1 && d.m <= 12 && d.d >= 1 && d.d <= 31),
  };
}

function mountMembers(api, { store, tokens, wrap, HttpError, vapidPublicKey, limit }) {
  const need = (req, res, next) => (store ? next() : res.status(503).json({ code: 'not_configured', error: 'This feature is not set up yet.' }));
  const auth = async (req, res, next) => {
    try {
      const m = /^Bearer (.+)$/.exec(req.get('authorization') || ''), id = m && tokens.verifyMember(m[1]);
      const member = id && await store.getMember(id);
      if (!member) return res.status(401).json({ code: 'unauthorized', error: 'Please add your details again.' });
      req.member = member; next();
    } catch (e) { next(e); }
  };

  api.post('/member', need, limit('member', 20, 10 * 60 * 1000), wrap(async (req, res) => {
    const name = clean(req.body && req.body.name, 100), email = clean(req.body && req.body.email, 254).toLowerCase();
    if (!name) throw new HttpError(400, 'invalid_name', 'Please enter your name.');
    if (!validEmail(email)) throw new HttpError(400, 'invalid_email', 'Please enter a valid email address.');
    const fields = { name, email, phone: clean(req.body.phone, 30), address: clean(req.body.address, 200) };
    const m = /^Bearer (.+)$/.exec(req.get('authorization') || ''), existing = m && tokens.verifyMember(m[1]);
    let id = existing && (await store.getMember(existing)) ? existing : null;
    if (id) await store.updateMember(id, fields); else id = await store.createMember(fields);
    const cus = req.body.stripeToken && tokens.verifyCustomer(req.body.stripeToken);
    if (cus) await store.linkStripe(id, cus);
    res.json({ token: tokens.signMember(id) });
  }));
  api.get('/member', need, auth, wrap(async (req, res) => {
    const m = req.member;
    res.json({ name: m.name, email: m.email, phone: m.phone, address: m.address, share: m.share_yahrzeits, cardIssue: m.card_issue || '' });
  }));
  // The donor saved a new card: the "please update your card" notice can go away.
  api.post('/member/card-updated', need, auth, wrap(async (req, res) => { if (req.member.stripe_customer_id) await store.clearCardIssue(req.member.stripe_customer_id); res.json({ ok: true }); }));
  api.delete('/member', need, auth, wrap(async (req, res) => { await store.deleteMember(req.member.id); res.json({ ok: true }); }));

  // The app sends the full list. share=true means the Rabbi may see it; false keeps it private to this member (used only for their own reminders).
  api.put('/yahrzeits', need, auth, wrap(async (req, res) => {
    const entries = sanitizeEntries(req.body && req.body.entries);
    if (!entries) throw new HttpError(400, 'invalid_entries', 'Please check the yahrzeit details.');
    await store.replaceYahrzeits(req.member.id, entries);
    await store.setShare(req.member.id, req.body.share === true);
    res.json({ ok: true, count: entries.length });
  }));
  api.delete('/yahrzeits', need, auth, wrap(async (req, res) => { await store.replaceYahrzeits(req.member.id, []); await store.setShare(req.member.id, false); res.json({ ok: true }); }));

  api.post('/push/subscribe', need, limit('push', 30, 10 * 60 * 1000), wrap(async (req, res) => {
    const s = req.body && req.body.subscription, k = s && s.keys;
    if (!s || typeof s.endpoint !== 'string' || !/^https:\/\//.test(s.endpoint) || s.endpoint.length > 600 || !k || typeof k.p256dh !== 'string' || typeof k.auth !== 'string' || k.p256dh.length > 200 || k.auth.length > 100) throw new HttpError(400, 'invalid_subscription', 'Invalid notification subscription.');
    const m = /^Bearer (.+)$/.exec(req.get('authorization') || ''), mid = m && tokens.verifyMember(m[1]);
    const member = mid && await store.getMember(mid);
    await store.upsertPushSub({ endpoint: s.endpoint, p256dh: k.p256dh, auth: k.auth, memberId: member ? member.id : null, prefs: sanitizePrefs(req.body.prefs) });
    res.json({ ok: true });
  }));
  api.put('/push/prefs', need, wrap(async (req, res) => {
    if (typeof (req.body && req.body.endpoint) !== 'string') throw new HttpError(400, 'invalid_subscription', 'Invalid notification subscription.');
    await store.updatePrefs(req.body.endpoint, sanitizePrefs(req.body.prefs)); res.json({ ok: true });
  }));
  api.post('/push/unsubscribe', need, wrap(async (req, res) => {
    if (typeof (req.body && req.body.endpoint) !== 'string') throw new HttpError(400, 'invalid_subscription', 'Invalid notification subscription.');
    await store.deletePushSub(req.body.endpoint); res.json({ ok: true });
  }));
}
module.exports = { mountMembers, sanitizeEntries, sanitizePrefs, clean };
