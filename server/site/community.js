// Community accounts for the website: sign in with your email (a 6-digit code or a link, no password),
// then keep your family, Hebrew names, birthdays and yahrzeits in one place and RSVP to events in one tap.
// It is the same "members" record the My Pushka app uses, so the app, the website and the Rabbi area all share it.
'use strict';
const crypto = require('crypto');
const express = require('express');
const H = require('../../pushka/hebdate.js');
const { clean } = require('../members.js');

const COOKIE = 'cl_member';
const TTL_DAYS = 180;
const CODE_MINUTES = 15;
const validEmail = (e) => /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(e) && e.length <= 254;
const ymdOk = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T12:00:00Z')) && s >= '1900-01-01' && s <= '2100-12-31';
const RELATIONS = ['spouse', 'child', 'parent', 'sibling', 'grandchild', 'grandparent', 'other'];

const SCHEMA = `
ALTER TABLE members ADD COLUMN IF NOT EXISTS hebrew_name TEXT NOT NULL DEFAULT '';
ALTER TABLE members ADD COLUMN IF NOT EXISTS birthday DATE;
ALTER TABLE members ADD COLUMN IF NOT EXISTS birth_after_sunset BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE members ADD COLUMN IF NOT EXISTS anniversary DATE;
ALTER TABLE members ADD COLUMN IF NOT EXISTS mezuzahs_checked DATE;
ALTER TABLE members ADD COLUMN IF NOT EXISTS tefillin_checked DATE;
ALTER TABLE members ADD COLUMN IF NOT EXISTS news BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE members ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;
ALTER TABLE members ADD COLUMN IF NOT EXISTS lang TEXT NOT NULL DEFAULT 'en';
ALTER TABLE yahrzeits ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'app';
CREATE TABLE IF NOT EXISTS login_codes (
  email TEXT PRIMARY KEY, code_hash TEXT NOT NULL, link_hash TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, attempts INT NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS family (
  id TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  name TEXT NOT NULL, hebrew_name TEXT NOT NULL DEFAULT '', relation TEXT NOT NULL DEFAULT 'other', gender TEXT NOT NULL DEFAULT '',
  birthday DATE, birth_after_sunset BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS family_member_idx ON family (member_id);
CREATE TABLE IF NOT EXISTS rsvps (
  id TEXT PRIMARY KEY, event_slug TEXT NOT NULL, member_id TEXT REFERENCES members(id) ON DELETE CASCADE,
  name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', adults INT NOT NULL DEFAULT 1, kids INT NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS rsvps_event_email_idx ON rsvps (event_slug, lower(email));
CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, member_id TEXT REFERENCES members(id) ON DELETE SET NULL,
  name TEXT NOT NULL, email TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', link TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), decided_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS submissions_status_idx ON submissions (status, created_at);
CREATE TABLE IF NOT EXISTS social_posts (
  event_slug TEXT NOT NULL, network TEXT NOT NULL, post_id TEXT NOT NULL DEFAULT '', message TEXT NOT NULL DEFAULT '',
  posted_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (event_slug, network)
);
CREATE TABLE IF NOT EXISTS email_log (key TEXT PRIMARY KEY, sent_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS form_responses (
  id TEXT PRIMARY KEY, form_id TEXT NOT NULL, member_id TEXT REFERENCES members(id) ON DELETE SET NULL, name TEXT NOT NULL, email TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb, amount_cents INT NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'new', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS form_responses_form_idx ON form_responses (form_id, created_at);
CREATE TABLE IF NOT EXISTS qa (id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, question TEXT NOT NULL, answer TEXT NOT NULL, lang TEXT NOT NULL DEFAULT 'en', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), published_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS email_unsubscribes (email TEXT PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS chat_questions (id BIGSERIAL PRIMARY KEY, question TEXT NOT NULL, lang TEXT NOT NULL DEFAULT 'en', ai BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
`;

const newId = (p) => p + crypto.randomBytes(12).toString('hex');
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const d10 = (v) => (v ? (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10) : '');

function communityStore(store) {
  const { pool } = store;
  const q = (t, p) => pool.query(t, p), rows = async (t, p) => (await q(t, p)).rows, one = async (t, p) => (await q(t, p)).rows[0] || null;
  return {
    async saveCode(email, code, link) { await q(`INSERT INTO login_codes (email, code_hash, link_hash, expires_at) VALUES ($1,$2,$3, now() + interval '${CODE_MINUTES} minutes')
      ON CONFLICT (email) DO UPDATE SET code_hash=EXCLUDED.code_hash, link_hash=EXCLUDED.link_hash, expires_at=EXCLUDED.expires_at, attempts=0`, [email, sha(code), sha(link)]); },
    // Returns true once for a correct, unexpired code (or link); five wrong tries burn the code.
    async useCode(email, { code, link }) {
      const r = await one('SELECT * FROM login_codes WHERE email=$1 AND expires_at > now() AND attempts < 5', [email]);
      if (!r) return false;
      const ok = code ? crypto.timingSafeEqual(Buffer.from(sha(code)), Buffer.from(r.code_hash)) : crypto.timingSafeEqual(Buffer.from(sha(link)), Buffer.from(r.link_hash));
      if (!ok) { await q('UPDATE login_codes SET attempts=attempts+1 WHERE email=$1', [email]); return false; }
      await q('DELETE FROM login_codes WHERE email=$1', [email]);
      return true;
    },
    // One account per email; the oldest record wins if the app created duplicates.
    setLang: (id, lang) => q('UPDATE members SET lang=$2 WHERE id=$1', [id, ['en', 'he', 'ru'].includes(lang) ? lang : 'en']),
    async memberForEmail(email) {
      const m = await one('SELECT * FROM members WHERE lower(email)=$1 ORDER BY created_at LIMIT 1', [email]);
      if (m) { await q('UPDATE members SET last_login=now() WHERE id=$1', [m.id]); return m.id; }
      const id = newId('m_');
      await q("INSERT INTO members (id, name, email, last_login) VALUES ($1, '', $2, now())", [id, email]);
      return id;
    },
    updateProfile: (id, p) => q('UPDATE members SET name=$2, phone=$3, address=$4, hebrew_name=$5, birthday=$6, birth_after_sunset=$7, anniversary=$8, news=$9, mezuzahs_checked=$10, tefillin_checked=$11, updated_at=now() WHERE id=$1',
      [id, p.name, p.phone, p.address, p.hebrewName, p.birthday || null, p.birthAfterSunset, p.anniversary || null, p.news, p.mezuzahsChecked || null, p.tefillinChecked || null]),
    family: (memberId) => rows("SELECT id, name, hebrew_name, relation, gender, to_char(birthday,'YYYY-MM-DD') AS birthday, birth_after_sunset FROM family WHERE member_id=$1 ORDER BY created_at", [memberId]),
    async replaceFamily(memberId, list) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN'); await c.query('DELETE FROM family WHERE member_id=$1', [memberId]);
        for (const f of list) await c.query('INSERT INTO family (id, member_id, name, hebrew_name, relation, gender, birthday, birth_after_sunset) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [newId('f_'), memberId, f.name, f.hebrewName, f.relation, f.gender, f.birthday || null, f.birthAfterSunset]);
        await c.query('COMMIT');
      } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
    },
    webYahrzeits: (memberId) => rows("SELECT * FROM yahrzeits WHERE member_id=$1 ORDER BY created_at", [memberId]),
    async replaceWebYahrzeits(memberId, list) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN'); await c.query("DELETE FROM yahrzeits WHERE member_id=$1 AND source='web'", [memberId]);
        for (const y of list) await c.query("INSERT INTO yahrzeits (id, member_id, name, relation, h_day, h_month, h_year, notes, source) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'web')", [memberId + ':web-' + crypto.randomBytes(6).toString('hex'), memberId, y.name, y.relation, y.day, y.month, y.year || null, y.notes]);
        await c.query('COMMIT');
      } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
    },
    async upsertRsvp(r) {
      return one(`INSERT INTO rsvps (id, event_slug, member_id, name, email, phone, adults, kids, note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (event_slug, lower(email)) DO UPDATE SET member_id=COALESCE(EXCLUDED.member_id, rsvps.member_id), name=EXCLUDED.name, phone=EXCLUDED.phone, adults=EXCLUDED.adults, kids=EXCLUDED.kids, note=EXCLUDED.note, updated_at=now()
        RETURNING id`, [newId('r_'), r.event, r.memberId || null, r.name, r.email, r.phone, r.adults, r.kids, r.note]);
    },
    cancelRsvp: (event, email) => q('DELETE FROM rsvps WHERE event_slug=$1 AND lower(email)=$2', [event, email]),
    rsvpFor: (event, email) => one('SELECT adults, kids, note FROM rsvps WHERE event_slug=$1 AND lower(email)=$2', [event, email]),
    myRsvps: (email) => rows('SELECT event_slug, adults, kids FROM rsvps WHERE lower(email)=$1', [email]),
    async counts() { const out = {}; for (const r of await rows('SELECT event_slug, sum(adults+kids)::int AS n FROM rsvps GROUP BY event_slug')) out[r.event_slug] = r.n; return out; },
    rsvpList: (event) => rows('SELECT name, email, phone, adults, kids, note, created_at, member_id FROM rsvps WHERE event_slug=$1 ORDER BY created_at', [event]),
    // For the Rabbi: everyone with a birthday or anniversary on file (members and their families).
    birthdays: () => rows(`SELECT m.id AS member_id, m.name AS member_name, m.email, m.phone, m.name AS name, m.hebrew_name, 'self' AS relation, to_char(m.birthday,'YYYY-MM-DD') AS birthday, m.birth_after_sunset, to_char(m.anniversary,'YYYY-MM-DD') AS anniversary FROM members m WHERE m.birthday IS NOT NULL OR m.anniversary IS NOT NULL
      UNION ALL SELECT m.id, m.name, m.email, m.phone, f.name, f.hebrew_name, f.relation, to_char(f.birthday,'YYYY-MM-DD'), f.birth_after_sunset, NULL FROM family f JOIN members m ON m.id=f.member_id WHERE f.birthday IS NOT NULL`),
    familiesOf: () => rows('SELECT member_id, count(*)::int AS n FROM family GROUP BY member_id'),
  };
}

function sanitizeProfile(b) {
  const birthday = ymdOk(b.birthday || '') ? b.birthday : '', anniversary = ymdOk(b.anniversary || '') ? b.anniversary : '';
  return { name: clean(b.name, 100), phone: clean(b.phone, 30), address: clean(b.address, 200), hebrewName: clean(b.hebrewName, 100), birthday, birthAfterSunset: b.birthAfterSunset === true, anniversary, news: b.news !== false, mezuzahsChecked: ymdOk(b.mezuzahsChecked || '') ? b.mezuzahsChecked : '', tefillinChecked: ymdOk(b.tefillinChecked || '') ? b.tefillinChecked : '' };
}
function sanitizeFamily(list) {
  if (!Array.isArray(list) || list.length > 20) return null;
  const out = [];
  for (const f of list) {
    const name = clean(f && f.name, 100);
    if (!name) return null;
    out.push({ name, hebrewName: clean(f.hebrewName, 100), relation: RELATIONS.includes(f.relation) ? f.relation : 'other', gender: f.gender === 'f' || f.gender === 'm' ? f.gender : '', birthday: ymdOk(f.birthday || '') ? f.birthday : '', birthAfterSunset: f.birthAfterSunset === true });
  }
  return out;
}
// Yahrzeits can be entered as a civil date of passing (we work out the Hebrew date) or as a Hebrew date.
function sanitizeYahrzeits(list) {
  if (!Array.isArray(list) || list.length > 30) return null;
  const out = [];
  for (const y of list) {
    const name = clean(y && y.name, 80);
    if (!name) return null;
    let day = Number(y.day), month = y.month, year = y.year ? Number(y.year) : null;
    if (y.date && ymdOk(y.date)) { const p = H.hebrewOf(y.date, y.afterSunset === true); day = p.day; month = p.month; year = p.year; }
    if (!Number.isInteger(day) || day < 1 || day > 30 || !H.MONTHS.includes(month)) return null;
    if (year !== null && (!Number.isInteger(year) || year < 4000 || year > 6000)) return null;
    out.push({ name, relation: clean(y.relation, 40), day, month, year, notes: clean(y.notes, 200) });
  }
  return out;
}

// A member's own Jewish calendar: yahrzeits, Hebrew birthdays (theirs and the family's), children's
// Bar/Bat Mitzvah dates and the wedding anniversary, soonest first.
async function upcomingDatesFor(m, family, yz, today) {
  const Z = require('./zmanim.js'), out = [], within = (d, days) => d && H.daysBetween(today, d) >= 0 && H.daysBetween(today, d) <= days;
  for (const y of yz) { const n = H.next({ day: y.h_day, month: y.h_month, year: y.h_year }, today); if (n && within(n.date, 400)) out.push({ kind: 'yahrzeit', name: y.name, date: n.date }); }
  const people = [{ name: m.name, birthday: d10(m.birthday), night: m.birth_after_sunset, relation: 'self' }, ...family.map((f) => ({ name: f.name, birthday: f.birthday, night: f.birth_after_sunset, relation: f.relation, gender: f.gender }))];
  for (const p of people) {
    if (!p.birthday) continue;
    const hp = H.hebrewOf(p.birthday, p.night), n = H.next({ day: hp.day, month: hp.month }, today);
    if (n && within(n.date, 400)) out.push({ kind: 'hebrew-birthday', name: p.name, date: n.date });
    if (p.relation === 'child' && p.gender) {
      const [y, mo, d] = p.birthday.split('-').map(Number), md = await Z.mitzvahDate(new Date(y, mo - 1, d), p.night, p.gender === 'f');
      if (within(md.date, 3 * 366)) out.push({ kind: p.gender === 'f' ? 'bat-mitzvah' : 'bar-mitzvah', name: p.name, date: md.date });
    }
  }
  const ann = d10(m.anniversary);
  if (ann) { let next = today.slice(0, 4) + ann.slice(4); if (next < today) next = String(+today.slice(0, 4) + 1) + ann.slice(4); out.push({ kind: 'anniversary', name: m.name, date: next, years: +next.slice(0, 4) - +ann.slice(0, 4) }); }
  // Mezuzahs and tefillin are checked by a scribe twice in seven years: due 3.5 years after the last check.
  for (const [kind, last] of [['mezuzah-check', d10(m.mezuzahs_checked)], ['tefillin-check', d10(m.tefillin_checked)]]) {
    const due = checkDue(last);
    if (due && H.daysBetween(today, due) <= 400) out.push({ kind, name: m.name, date: due < today ? today : due, overdue: due < today });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 15);
}
// 42 months after the last check (a date string), or '' if unknown.
function checkDue(last) {
  if (!last) return '';
  const [y, mo, d] = last.split('-').map(Number), t = new Date(Date.UTC(y, mo - 1 + 42, d));
  return t.toISOString().slice(0, 10);
}

function mountCommunity(app, { store, mailer, secret, base, limit, log = console, content, now = () => new Date(), tOf = () => (x, v) => (v ? x.replace(/\{(\w+)\}/g, (m, k) => v[k]) : x), langOf = () => 'en' }) {
  const cs = store ? communityStore(store) : null;
  const mac = (s) => crypto.createHmac('sha256', secret + ':site-member').update(s).digest('base64url');
  const issue = (id) => { const exp = String(Date.now() + TTL_DAYS * 864e5); return `${id}.${exp}.${mac(id + '.' + exp)}`; };
  const readCookie = (req) => {
    const m = new RegExp('(?:^|; )' + COOKIE + '=([^;]+)').exec(req.get('cookie') || ''); if (!m) return null;
    const [id, exp, sig] = m[1].split('.');
    if (!id || !exp || !sig || !/^m_[0-9a-f]{24}$/.test(id) || Number(exp) < Date.now()) return null;
    const a = Buffer.from(sig), b = Buffer.from(mac(id + '.' + exp));
    return a.length === b.length && crypto.timingSafeEqual(a, b) ? id : null;
  };
  const secure = /^https:/.test(base) ? '; Secure' : '';
  const setCookie = (res, id) => res.setHeader('Set-Cookie', `${COOKIE}=${issue(id)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TTL_DAYS * 86400}${secure}`);

  const upcomingDates = (m, family, yz) => upcomingDatesFor(m, family, yz, new Date(now()).toISOString().slice(0, 10));
  const r = express.Router();
  r.use(express.json({ limit: '32kb' }));
  r.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  // Writes must come from our own pages (a custom header cannot be sent cross-site without CORS).
  r.use((req, res, next) => (req.method === 'GET' || req.get('x-site') === '1' ? next() : res.status(403).json({ code: 'forbidden', error: 'Forbidden.' })));
  const need = (req, res, next) => (cs ? next() : res.status(503).json({ code: 'not_configured', error: tOf(req)('Accounts are not switched on yet. Please email or call us.') }));
  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch((e) => { log.error('site error:', e && e.message); res.status(500).json({ code: 'server_error', error: tOf(req)('Something went wrong. Please try again.') }); });
  const authed = wrap(async (req, res, next) => {
    const id = readCookie(req), m = id && await store.getMember(id);
    if (!m) return res.status(401).json({ code: 'unauthorized', error: tOf(req)('Please sign in.') });
    req.member = m; next();
  });
  const bad = (res, code, error) => res.status(400).json({ code, error });

  r.get('/status', (req, res) => res.json({ accounts: !!(cs && mailer), rsvp: !!cs }));

  r.post('/login', need, limit('site-login', 20, 15 * 60 * 1000), wrap(async (req, res) => {
    const email = clean(req.body && req.body.email, 254).toLowerCase();
    if (!validEmail(email)) return bad(res, 'invalid_email', tOf(req)('Please enter a valid email address.'));
    if (!mailer) return res.status(503).json({ code: 'not_configured', error: tOf(req)('Email sign-in is not switched on yet.') });
    const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0'), link = crypto.randomBytes(24).toString('base64url');
    await cs.saveCode(email, code, link);
    const url = `${base}/account/verify?e=${encodeURIComponent(email)}&t=${link}`;
    const t = tOf(req), L = langOf(req), url2 = L === 'en' ? url : url + '&l=' + L;
    await mailer.send({ to: email, subject: t('Your sign-in code: {code}', { code }), text: t('Your Chabad of Lamorinda sign-in code is {code}', { code }) + '\n\n' + t('Or tap this link to sign in:') + '\n' + url2 + '\n\n' + t('The code works for {n} minutes. If you did not ask for it, you can ignore this email.', { n: CODE_MINUTES }) });
    res.json({ ok: true });
  }));
  r.post('/verify', need, limit('site-verify', 12, 15 * 60 * 1000), wrap(async (req, res) => {
    const email = clean(req.body && req.body.email, 254).toLowerCase(), code = String((req.body && req.body.code) || '').replace(/\D/g, '');
    if (!validEmail(email) || code.length !== 6 || !(await cs.useCode(email, { code }))) return bad(res, 'bad_code', tOf(req)('That code is not right or has expired. Please try again.'));
    const id = await cs.memberForEmail(email); await cs.setLang(id, langOf(req));
    setCookie(res, id); res.json({ ok: true });
  }));
  r.post('/logout', (req, res) => { res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`); res.json({ ok: true }); });

  r.get('/me', need, authed, wrap(async (req, res) => {
    const m = req.member, [family, yz, rs] = await Promise.all([cs.family(m.id), cs.webYahrzeits(m.id), cs.myRsvps(m.email.toLowerCase())]);
    res.json({
      profile: { name: m.name, email: m.email, phone: m.phone, address: m.address, hebrewName: m.hebrew_name, birthday: d10(m.birthday), birthAfterSunset: m.birth_after_sunset, anniversary: d10(m.anniversary), mezuzahsChecked: d10(m.mezuzahs_checked), tefillinChecked: d10(m.tefillin_checked), news: m.news, shareYahrzeits: m.share_yahrzeits },
      family: family.map((f) => ({ name: f.name, hebrewName: f.hebrew_name, relation: f.relation, gender: f.gender, birthday: f.birthday || '', birthAfterSunset: f.birth_after_sunset })),
      yahrzeits: yz.map((y) => ({ name: y.name, relation: y.relation, day: y.h_day, month: y.h_month, year: y.h_year, notes: y.notes, fromApp: y.source !== 'web', next: (H.next({ day: y.h_day, month: y.h_month, year: y.h_year }, new Date(now()).toISOString().slice(0, 10)) || {}).date || '' })),
      rsvps: rs.map((x) => ({ event: x.event_slug, adults: x.adults, kids: x.kids })),
      upcoming: await upcomingDates(m, family, yz),
    });
  }));
  r.put('/me', need, authed, wrap(async (req, res) => {
    const p = sanitizeProfile(req.body || {});
    if (!p.name) return bad(res, 'invalid_name', tOf(req)('Please enter your name.'));
    await cs.updateProfile(req.member.id, p);
    if (typeof req.body.shareYahrzeits === 'boolean') await store.setShare(req.member.id, req.body.shareYahrzeits);
    res.json({ ok: true });
  }));
  r.put('/family', need, authed, wrap(async (req, res) => {
    const list = sanitizeFamily(req.body && req.body.family);
    if (!list) return bad(res, 'invalid_family', tOf(req)('Please give each family member a name.'));
    await cs.replaceFamily(req.member.id, list); res.json({ ok: true, count: list.length });
  }));
  r.put('/yahrzeits', need, authed, wrap(async (req, res) => {
    const list = sanitizeYahrzeits(req.body && req.body.yahrzeits);
    if (!list) return bad(res, 'invalid_yahrzeits', tOf(req)('Please check the names and dates.'));
    await cs.replaceWebYahrzeits(req.member.id, list); res.json({ ok: true, count: list.length });
  }));
  r.delete('/me', need, authed, wrap(async (req, res) => { await store.deleteMember(req.member.id); res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`); res.json({ ok: true }); }));

  // ----- RSVP: signed-in members tap once; guests fill in name and email -----
  const eventOf = (slug) => content().events.find((e) => e.slug === slug && e.published && e.rsvp);
  r.get('/rsvp/:slug', need, wrap(async (req, res) => {
    const e = eventOf(req.params.slug); if (!e) return res.status(404).json({ code: 'not_found', error: tOf(req)('Event not found.') });
    const id = readCookie(req), m = id && await store.getMember(id);
    const mine = m ? await cs.rsvpFor(e.slug, m.email.toLowerCase()) : null, n = (await cs.counts())[e.slug] || 0;
    const fam = m ? await cs.family(m.id) : [];
    res.json({ signedIn: !!m, name: m ? m.name : '', mine, going: n, capacity: e.rsvp.capacity || null,
      suggest: m ? { adults: 1 + fam.filter((f) => f.relation === 'spouse').length, kids: fam.filter((f) => f.relation === 'child').length } : null });
  }));
  r.post('/rsvp/:slug', need, limit('site-rsvp', 20, 10 * 60 * 1000), wrap(async (req, res) => {
    const e = eventOf(req.params.slug); if (!e) return res.status(404).json({ code: 'not_found', error: tOf(req)('Event not found.') });
    const b = req.body || {}, id = readCookie(req), m = id && await store.getMember(id);
    const adults = Math.trunc(Number(b.adults)), kids = Math.trunc(Number(b.kids || 0));
    if (!(adults >= 0 && adults <= 30 && kids >= 0 && kids <= 30 && adults + kids >= 1)) return bad(res, 'invalid_count', tOf(req)('Please choose how many people are coming.'));
    const name = m && m.name ? m.name : clean(b.name, 100), email = (m ? m.email : clean(b.email, 254)).toLowerCase();
    if (!name) return bad(res, 'invalid_name', tOf(req)('Please enter your name.'));
    if (!validEmail(email)) return bad(res, 'invalid_email', tOf(req)('Please enter a valid email address.'));
    const prev = await cs.rsvpFor(e.slug, email), n = (await cs.counts())[e.slug] || 0;
    const cap = e.rsvp.capacity;
    if (cap && n - (prev ? prev.adults + prev.kids : 0) + adults + kids > cap) return res.status(409).json({ code: 'full', error: tOf(req)('Sorry, there is not enough room left. Please contact us to join the waiting list.') });
    await cs.upsertRsvp({ event: e.slug, memberId: m ? m.id : null, name, email, phone: m ? m.phone : clean(b.phone, 30), adults, kids, note: clean(b.note, 300) });
    const t = tOf(req), L = langOf(req), title = (L !== 'en' && e[L] && e[L].title) || e.title, page = base + (L === 'en' ? '' : '/' + L) + '/events/' + e.slug;
    if (mailer) mailer.send({ to: email, subject: t("You're coming: {title}", { title }), text: t('Thank you, {name}! You are on the list. Number of people: {n}.', { name, n: adults + kids }) + `\n\n${title}\n${e.start.replace('T', ' ')}\n${page}\n\n` + t('Add it to your calendar:') + ` ${base}/events/${e.slug}.ics` }).catch((err) => log.error('rsvp email:', err && err.message));
    res.json({ ok: true, going: (await cs.counts())[e.slug] || 0 });
  }));
  r.delete('/rsvp/:slug', need, authed, wrap(async (req, res) => { await cs.cancelRsvp(req.params.slug, req.member.email.toLowerCase()); res.json({ ok: true }); }));

  app.use('/api/site', r);

  // Sign-in link from the email.
  app.get('/account/verify', wrap(async (req, res) => {
    const email = clean(req.query.e, 254).toLowerCase(), link = String(req.query.t || '');
    if (!cs || !validEmail(email) || link.length < 20 || !(await cs.useCode(email, { link }))) return res.redirect(302, '/account?expired=1');
    const L = ['he', 'ru'].includes(req.query.l) ? req.query.l : 'en', id = await cs.memberForEmail(email);
    if (L !== 'en') await cs.setLang(id, L);
    setCookie(res, id); res.redirect(302, (L === 'en' ? '' : '/' + L) + '/account');
  }));

  const readMember = async (req) => { const id = cs && readCookie(req); return id ? store.getMember(id) : null; };
  return { cs, readMember, counts: async () => (cs ? cs.counts() : {}) };
}

// Rabbi area: RSVP lists, upcoming birthdays (English and Hebrew), community families.
function mountCommunityAdmin(r, { authed, wrap }, { cs, content, store }) {
  if (!cs) return;
  r.get('/api/site/rsvps', authed, wrap(async (req, res) => {
    const counts = await cs.counts(), today = new Date().toISOString().slice(0, 10);
    res.json({ events: content().events.filter((e) => e.rsvp && (e.end || e.start).slice(0, 10) >= today).map((e) => ({ slug: e.slug, title: e.title, start: e.start, capacity: e.rsvp.capacity || null, going: counts[e.slug] || 0 })) });
  }));
  r.get('/api/site/rsvps/:slug', authed, wrap(async (req, res) => res.json({ list: await cs.rsvpList(req.params.slug) })));
  r.get('/api/site/birthdays', authed, wrap(async (req, res) => {
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 366), today = new Date().toISOString().slice(0, 10), out = [];
    for (const b of await cs.birthdays()) {
      if (b.birthday) {
        const [, mo, da] = b.birthday.split('-'); let next = today.slice(0, 4) + '-' + mo + '-' + da; if (next < today) next = String(+today.slice(0, 4) + 1) + '-' + mo + '-' + da;
        const left = H.daysBetween(today, next);
        const p = H.hebrewOf(b.birthday, b.birth_after_sunset), hn = H.next({ day: p.day, month: p.month }, today);
        if (left <= days) out.push({ kind: 'birthday', date: next, daysLeft: left, name: b.name, hebrewName: b.hebrew_name, relation: b.relation, family: b.member_name, email: b.email, phone: b.phone, age: +next.slice(0, 4) - +b.birthday.slice(0, 4) });
        if (hn && H.daysBetween(today, hn.date) <= days) out.push({ kind: 'hebrew birthday', date: hn.date, daysLeft: H.daysBetween(today, hn.date), name: b.name, hebrewName: b.hebrew_name, relation: b.relation, family: b.member_name, email: b.email, phone: b.phone, hebrew: H.label(p) });
      }
      if (b.anniversary) {
        const [, mo, da] = b.anniversary.split('-'); let next = today.slice(0, 4) + '-' + mo + '-' + da; if (next < today) next = String(+today.slice(0, 4) + 1) + '-' + mo + '-' + da;
        if (H.daysBetween(today, next) <= days) out.push({ kind: 'anniversary', date: next, daysLeft: H.daysBetween(today, next), name: b.name, family: b.member_name, email: b.email, phone: b.phone, years: +next.slice(0, 4) - +b.anniversary.slice(0, 4) });
      }
    }
    res.json({ days, items: out.sort((a, b) => a.daysLeft - b.daysLeft) });
  }));
}

module.exports = { mountCommunity, mountCommunityAdmin, communityStore, sanitizeFamily, sanitizeYahrzeits, sanitizeProfile, checkDue, SCHEMA };
