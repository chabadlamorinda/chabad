// Who visits and what they look at, so the Rabbi can serve people better.
// * Every visitor's browser gets an anonymous id (cookie cl_vid, set by site.js; not set when the browser asks not to
//   be tracked). Each page they view is noted once a day. No IP addresses are kept.
// * When they leave their name and email (RSVP, a form, the community board, a message to the Rabbi, signing in),
//   their visits are linked to them, before and after.
// * Pages are grouped into interests (giving, Bar/Bat Mitzvah, mezuzah...). When a known person looks at an important
//   one, the Rabbi gets an email (once a week per person and interest) and sees them in the Rabbi area.
// * Visits are kept for 3 years (the Rabbi's choice).
// * Each page view is also kept on its own (visitor_hits, 13 months): how long it was read, the kind of device and the time zone, so
//   the Rabbi can see who is on the website right now and get a "Someone may need you" email when someone (even anonymous) reads about
//   a loss, a hard time or a new baby (once a day per visitor, after the visit ends).
// * Forms: the name, email and phone typed into a form (and the amount on the giving form) are saved as they are typed, even if the
//   form is never sent (form_drafts). Every such form says so in a line under it (site.js), and the privacy page explains it. If the
//   form is not sent within 20 minutes, the Rabbi is emailed once. Browsers that ask not to be tracked are never tracked or saved.
'use strict';
const express = require('express');
const I = require('./insights.js');
// Pages about a loss, a hard time or a new baby: an alert for every visitor, named or anonymous.
const PASTORAL = new Set(['mourning', 'help', 'baby']);
const SCHEMA = `CREATE TABLE IF NOT EXISTS visitor_hits (id TEXT PRIMARY KEY, vid TEXT NOT NULL, path TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '', device TEXT NOT NULL DEFAULT '', tz TEXT NOT NULL DEFAULT '', lang TEXT NOT NULL DEFAULT 'en', started_at TIMESTAMPTZ NOT NULL DEFAULT now(), last_at TIMESTAMPTZ NOT NULL DEFAULT now(), secs INT NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS visitor_hits_vid_idx ON visitor_hits (vid, started_at);
CREATE INDEX IF NOT EXISTS visitor_hits_last_idx ON visitor_hits (last_at);
CREATE TABLE IF NOT EXISTS form_drafts (vid TEXT NOT NULL, form TEXT NOT NULL, path TEXT NOT NULL DEFAULT '', name TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', amount TEXT NOT NULL DEFAULT '', fields TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), submitted_at TIMESTAMPTZ, notified_at TIMESTAMPTZ, handled_at TIMESTAMPTZ, PRIMARY KEY (vid, form));
CREATE TABLE IF NOT EXISTS visitor_pastoral (vid TEXT NOT NULL, day DATE NOT NULL DEFAULT CURRENT_DATE, PRIMARY KEY (vid, day));`;

// Interest tags, first match wins. "alert" interests email the Rabbi when a known person looks at them.
const INTERESTS = [
  ['giving', 'Giving / sponsoring', true, /^\/(donate|sponsor|kiddush|chai-club|sponsor-a-kiddush|campaign)(\/|$)|^\/learn\/(supporting-chabad-of-lamorinda|halachic-will|maaser|tzedakah|hachnasat-sefer-torah|letter-in-a-torah|tzedakah-priorities|jewish-view-on-wealth|sponsoring-a-kiddush)$|^\/programs\/chai-club$/],
  ['bar-bat-mitzvah', 'Bar / Bat Mitzvah', true, /bar-mitzvah|bat-mitzvah|bar-bat-mitzvah/],
  ['mezuzah', 'Mezuzah', true, /mezuzah|chanukat-habayit|setting-up-a-jewish-home|get-judaica-through-chabad/],
  ['tefillin', 'Tefillin', true, /tefillin|mitzvah-tanks/],
  ['wedding', 'Wedding / marriage', true, /wedding|kallah|chosson|engagement|getting-married|ketubah|chuppah|family-purity|mikvah/],
  ['mourning', 'Loss / mourning', true, /passed-away|funeral|shiva|kaddish|yahrzeit|yizkor|mourning|kriah|unveiling|sheloshim|end-of-life|pregnancy-loss/],
  ['conversion', 'Conversion / Jewish identity', true, /convert|who-is-a-jew|jewish-identity/],
  ['education', 'Preschool / Hebrew School / kids', true, /preschool|hebrew-school|ckids|summer-camp|kids-and-teens|jewish-kids/],
  ['baby', 'New baby', true, /brit|baby|pidyon|upsherin|new-parents|pregnancy/],
  ['help', 'A hard time (family, illness, disputes)', true, /^\/help\/|disputes|shalom-bayit|caregiver|mental-health|addiction|marriage-arguments/],
  ['classes', 'Torah classes', false, /adult-education|torah-classes|tanya|talmud|daily-torah|parsha/],
  ['shabbat', 'Shabbat', false, /shabbat/],
  ['holidays', 'Holidays', false, /^\/holidays\/|jewish-holidays/],
  ['kosher', 'Kosher', false, /kosher|bay-kosher/],
];
const interestOf = (path) => { for (const [key, label, alert, re] of INTERESTS) if (re.test(path)) return { key, label, alert }; return null; };
// Where a visitor came from: a ?src=... (or utm_source) on the link, such as a flyer's QR code or the weekly email, else the page
// they came from (Google, Facebook, WhatsApp...), else "direct". Our own pages (moving around the site) say nothing.
const OWN = /(^|\.)(jewishlamorinda\.(com|org)|chabadoflamorinda\.com|onrender\.com|localhost)$/;
const SOURCE_NAMES = { fb: 'facebook', ig: 'instagram', wa: 'whatsapp', qr: 'flyer', mail: 'email', newsletter: 'email' };
function sourceOf(ref, search) {
  let params; try { params = new URLSearchParams(String(search || '').slice(0, 300)); } catch (e) { params = new URLSearchParams(''); }
  const tag = String(params.get('src') || params.get('utm_source') || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 30);
  if (tag) return SOURCE_NAMES[tag] || tag;
  let host = ''; try { host = new URL(String(ref || '')).hostname.toLowerCase().replace(/^www\./, ''); } catch (e) { host = ''; }
  if (!host) return 'direct';
  if (OWN.test(host)) return null;
  if (/(^|\.)google\./.test(host)) return 'google';
  if (/(^|\.)bing\.com$/.test(host)) return 'bing';
  if (/duckduckgo\.com$/.test(host)) return 'duckduckgo';
  if (/(^|\.)yahoo\./.test(host)) return 'yahoo';
  if (/(^|\.)(facebook\.com|fb\.me|fb\.com)$/.test(host)) return 'facebook';
  if (/instagram\.com$/.test(host)) return 'instagram';
  if (/(^|\.)(whatsapp\.com|wa\.me)$/.test(host)) return 'whatsapp';
  if (/(^|\.)(chatgpt\.com|openai\.com|perplexity\.ai|claude\.ai)$/.test(host)) return 'ai-assistant';
  if (/(^|\.)(t\.co|twitter\.com|x\.com)$/.test(host)) return 'x';
  if (/youtube\.com$|youtu\.be$/.test(host)) return 'youtube';
  if (/(^|\.)(mail\.google\.com|outlook\.live\.com|outlook\.office\.com|mail\.yahoo\.com)$/.test(host)) return 'email';
  return 'other: ' + host.slice(0, 40);
}
const VID = /^[a-z0-9]{16,40}$/;
const vidOf = (req) => { const m = /(?:^|;\s*)cl_vid=([a-z0-9]+)/.exec(req.get('cookie') || ''); return m && VID.test(m[1]) ? m[1] : null; };
// Submissions that are not people leaving their details.
const NOT_CONTACT = /^\/api\/site\/(chat|lead|view|seen|mitzvah|draft|ping)/;

function mountVisitors(app, { store, mailer, notifyTo = '', content, base = '', limit, log = console, readMember = async () => null, jobs = false }) {
  const pool = store && store.pool;
  if (!pool) return { mountAdmin() {} };
  const q = (t, p) => pool.query(t, p);
  let inserts = 0;
  const ready = q(SCHEMA).catch((e) => log.error('visitor tables:', e && e.message));
  const to = () => notifyTo || content().org.email;
  const visitorUrl = (vid) => `${base}/admin/visitor?v=${vid}`;
  // A form (or a gift) was really sent: what was typed into it no longer counts as "started but didn't finish".
  const sent = (vid, form) => ready.then(() => q(`UPDATE form_drafts SET submitted_at = now() WHERE vid = $1 AND submitted_at IS NULL AND updated_at > now() - interval '6 hours'${form ? ' AND form = $2' : ''}`, form ? [vid, form] : [vid])).catch(() => {});
  app.use('/api/give', (req, res, next) => { const vid = vidOf(req); if (vid && req.method === 'POST') res.on('finish', () => { if (res.statusCode < 300) sent(vid, 'give'); }); next(); });

  // Link this visitor to the person who just left their details (runs after any successful form-like POST).
  app.use('/api/site', (req, res, next) => {
    if (req.method !== 'POST' || NOT_CONTACT.test(req.originalUrl)) return next();
    const vid = vidOf(req);
    if (vid) res.on('finish', () => {
      const b = req.body || {}, email = String(b.email || '').trim().toLowerCase().slice(0, 200);
      if (res.statusCode < 300) sent(vid);
      if (res.statusCode >= 300 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return;
      link(vid, { name: b.name, email, phone: b.phone, source: req.originalUrl.split('?')[0] }).catch((e) => log.error('visitor link:', e && e.message));
    });
    next();
  });
  async function link(vid, { name, email, phone, source }) {
    await q(`INSERT INTO visitor_people (vid, email, name, phone, source) VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (vid, email) DO UPDATE SET name = COALESCE(NULLIF(EXCLUDED.name,''), visitor_people.name), phone = COALESCE(NULLIF(EXCLUDED.phone,''), visitor_people.phone), updated_at = now()`,
    [vid, email, String(name || '').slice(0, 120), String(phone || '').slice(0, 40), String(source || '').slice(0, 80)]);
  }

  // A page view (sent by site.js on every page).
  app.post('/api/site/view', limit('site-view', 600, 60 * 60 * 1000), express.json({ limit: '2kb' }), async (req, res) => {
    res.status(204).end();
    if (req.get('x-site') !== '1') return;
    const vid = vidOf(req), path = String((req.body && req.body.path) || '').replace(/^\/(he|ru)(?=\/|$)/, '').split(/[?#]/)[0] || '/';
    if (!vid || !/^\/[a-z0-9/._-]{0,150}$/i.test(path) || /^\/(admin|api)\b/.test(path)) return;
    try {
      const r = await q('INSERT INTO visitor_views (vid, path) VALUES ($1,$2) ON CONFLICT DO NOTHING', [vid, path]);
      const src = sourceOf(req.body && req.body.ref, req.body && req.body.q);
      if (src) await q("INSERT INTO visitor_sources (vid, source) VALUES ($1,$2) ON CONFLICT (vid, day) DO UPDATE SET source = EXCLUDED.source WHERE visitor_sources.source = 'direct' AND EXCLUDED.source <> 'direct'", [vid, src]);
      if (++inserts % 500 === 0) q("DELETE FROM visitor_views WHERE day < CURRENT_DATE - 1096").catch(() => {});
      const m = await readMember(req).catch(() => null);
      if (m && m.email) await link(vid, { name: m.name, email: String(m.email).toLowerCase(), phone: m.phone, source: 'account' });
      const it = interestOf(path);
      if (r.rowCount && it && it.alert && !PASTORAL.has(it.key)) await alert(vid, it, path); // pastoral topics get the fuller alert below
      // This one view, for time on page, "on the website now" and the pastoral alert.
      const b = req.body || {}, hit = String(b.hit || ''), device = I.deviceOf(req.get('user-agent'));
      if (/^[a-z0-9]{8,40}$/.test(hit) && device !== 'bot') {
        await ready;
        await q('INSERT INTO visitor_hits (id, vid, path, title, source, device, tz, lang) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING',
          [hit, vid, path, String(b.title || '').replace(/[\u0000-\u001f]/g, ' ').slice(0, 150), src || '', device, String(b.tz || '').replace(/[^A-Za-z_/+-]/g, '').slice(0, 40), ['he', 'ru'].includes(b.lang) ? b.lang : 'en']);
        if (inserts % 500 === 1) q("DELETE FROM visitor_hits WHERE started_at < now() - interval '400 days'").then(() => q("DELETE FROM form_drafts WHERE updated_at < now() - interval '90 days' AND submitted_at IS NULL")).catch(() => {});
      }
    } catch (e) { log.error('visitor view:', e && e.message); }
  });

  // Still reading: how long the page has been open in view (site.js, every 30 seconds and when the page is left).
  app.post('/api/site/ping', limit('site-ping', 3000, 60 * 60 * 1000), express.json({ limit: '1kb', type: () => true }), async (req, res) => {
    res.status(204).end();
    const vid = vidOf(req), b = req.body || {}, hit = String(b.hit || ''), secs = Math.max(0, Math.min(7200, Math.round(Number(b.secs) || 0)));
    if (!vid || !/^[a-z0-9]{8,40}$/.test(hit)) return;
    try { await ready; await q('UPDATE visitor_hits SET last_at = now(), secs = GREATEST(secs, $3) WHERE id = $1 AND vid = $2', [hit, vid, secs]); } catch (e) { log.error('visitor ping:', e && e.message); }
  });

  // What has been typed into a form so far (only the name, email and phone, and the amount on the giving form), before it is sent.
  app.post('/api/site/draft', limit('site-draft', 600, 60 * 60 * 1000), express.json({ limit: '2kb' }), async (req, res) => {
    res.status(204).end();
    if (req.get('x-site') !== '1') return;
    const vid = vidOf(req), b = req.body || {}, form = String(b.form || '').toLowerCase().replace(/[^a-z0-9:_-]/g, '').slice(0, 80);
    const path = String(b.path || '').replace(/^\/(he|ru)(?=\/|$)/, '').split(/[?#]/)[0].slice(0, 150) || '/';
    const name = String(b.name || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 120), email = String(b.email || '').trim().toLowerCase().slice(0, 200);
    const phone = String(b.phone || '').replace(/[^0-9+()\-. ]/g, '').trim().slice(0, 40), amount = String(b.amount || '').replace(/[^0-9$.,]/g, '').slice(0, 20);
    const okEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email), okPhone = phone.replace(/\D/g, '').length >= 7;
    if (!vid || !form || !(okEmail || okPhone || name.length >= 2)) return;
    try {
      await ready;
      await q(`INSERT INTO form_drafts (vid, form, path, name, email, phone, amount, fields) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (vid, form) DO UPDATE SET path = EXCLUDED.path, name = COALESCE(NULLIF(EXCLUDED.name,''), form_drafts.name), email = COALESCE(NULLIF(EXCLUDED.email,''), form_drafts.email),
          phone = COALESCE(NULLIF(EXCLUDED.phone,''), form_drafts.phone), amount = COALESCE(NULLIF(EXCLUDED.amount,''), form_drafts.amount), fields = EXCLUDED.fields, updated_at = now(),
          created_at = CASE WHEN form_drafts.submitted_at IS NOT NULL OR form_drafts.handled_at IS NOT NULL THEN now() ELSE form_drafts.created_at END,
          submitted_at = NULL, notified_at = CASE WHEN form_drafts.submitted_at IS NOT NULL OR form_drafts.handled_at IS NOT NULL THEN NULL ELSE form_drafts.notified_at END, handled_at = NULL`,
      [vid, form, path, name, okEmail ? email : '', okPhone ? phone : '', amount, (Array.isArray(b.fields) ? b.fields : []).map(String).join(',').replace(/[^a-zA-Z0-9_,.-]/g, '').slice(0, 300)]);
      if (okEmail) await link(vid, { name, email, phone: okPhone ? phone : '', source: 'draft:' + form });
    } catch (e) { log.error('form draft:', e && e.message); }
  });

  const formTitle = (key) => {
    if (key === 'give') return 'a gift on the Donate page';
    if (/^campaign:/.test(key)) return 'a gift to the campaign';
    if (/^rsvp:/.test(key)) { const ev = (content().events || []).find((e) => e.slug === key.slice(5)); return `an RSVP${ev ? ' for ' + ev.title : ''}`; }
    if (key === 'subscribe') return 'signing up for the weekly email';
    const f = (content().forms || []).find((x) => x.id === key); if (f) return `the form "${f.title}"`;
    return { rabbi: 'a message to the Rabbi', kaddish: 'a Kaddish request', tehillim: 'a prayer-list request', ask: 'a question to the Rabbi' }[key] || `a form (${key})`;
  };
  const todayPages = async (vid) => (await q("SELECT path, title, sum(secs)::int AS secs, min(started_at) AS at FROM visitor_hits WHERE vid = $1 AND started_at > now() - interval '12 hours' GROUP BY path, title ORDER BY min(started_at)", [vid])).rows;

  // Started a form or a gift, typed a way to reach them, and stopped: the Rabbi is emailed once, 20 minutes later.
  async function checkDrafts() {
    await ready;
    const rows = (await q(`SELECT * FROM form_drafts WHERE submitted_at IS NULL AND notified_at IS NULL AND handled_at IS NULL AND updated_at < now() - interval '20 minutes'
      AND updated_at > now() - interval '2 days' AND (email <> '' OR phone <> '') ORDER BY updated_at LIMIT 20`)).rows;
    for (const d of rows) {
      const claim = await q('UPDATE form_drafts SET notified_at = now() WHERE vid = $1 AND form = $2 AND notified_at IS NULL', [d.vid, d.form]);
      if (!claim.rowCount || !mailer || !to()) continue;
      const m = I.draftEmail({ base, d, formTitle: formTitle(d.form), pages: (await todayPages(d.vid)).filter((p) => p.path !== d.path), visitorUrl: visitorUrl(d.vid) });
      await mailer.send({ to: to(), subject: m.subject, text: m.text }).catch((e) => log.error('draft alert:', e && e.message));
    }
    return rows.length;
  }

  // "Someone may need you": a visit that touched a loss, a hard time or a new baby, sent once the visit is over (10 minutes quiet).
  async function checkPastoral() {
    await ready;
    const visits = (await q(`SELECT vid FROM visitor_hits WHERE started_at > now() - interval '12 hours' GROUP BY vid HAVING max(last_at) < now() - interval '10 minutes'`)).rows;
    let sentN = 0;
    for (const { vid } of visits) {
      const hits = (await q("SELECT path, title, source, device, tz, started_at, secs FROM visitor_hits WHERE vid = $1 AND started_at > now() - interval '12 hours' ORDER BY started_at", [vid])).rows;
      const tags = [...new Set(hits.map((h) => interestOf(h.path)).filter((it) => it && PASTORAL.has(it.key)).map((it) => it.key === 'baby' ? 'Bris & new baby' : it.key === 'mourning' ? 'Loss & mourning' : 'A hard time'))];
      if (!tags.length) continue;
      if (!(await q('INSERT INTO visitor_pastoral (vid) VALUES ($1) ON CONFLICT DO NOTHING', [vid])).rowCount) continue;
      if (!mailer || !to()) continue;
      const who = (await q('SELECT name, email, phone FROM visitor_people WHERE vid = $1 ORDER BY updated_at DESC LIMIT 1', [vid])).rows[0] || null;
      const before = Number((await q('SELECT count(DISTINCT day)::int AS n FROM visitor_views WHERE vid = $1 AND day < CURRENT_DATE', [vid])).rows[0].n);
      const pages = []; for (const h of hits) { const last = pages[pages.length - 1]; if (last && last.path === h.path) last.secs += h.secs; else pages.push({ path: h.path, title: h.title, secs: h.secs }); }
      const first = hits[0], src = (hits.find((h) => h.source) || {}).source || 'direct';
      const m = I.pastoralEmail({ base, who, tags, device: first.device, area: I.areaOf(first.tz), visits: before ? `came before on ${before} other day${before === 1 ? '' : 's'}` : 'first visit',
        when: I.pacific(first.started_at), source: src, pages, visitorUrl: visitorUrl(vid) });
      await mailer.send({ to: to(), subject: m.subject, text: m.text, html: m.html }).then(() => sentN++).catch((e) => log.error('pastoral alert:', e && e.message));
    }
    return sentN;
  }
  if (jobs) {
    const run = () => { checkDrafts().catch((e) => log.error('drafts job:', e && e.message)); checkPastoral().catch((e) => log.error('pastoral job:', e && e.message)); };
    setInterval(run, 2 * 60 * 1000).unref();
  }

  // Email the Rabbi when a known person looks at something important (once a week per person and interest).
  async function alert(vid, it, path) {
    const who = (await q('SELECT name, email, phone FROM visitor_people WHERE vid=$1 ORDER BY updated_at DESC LIMIT 1', [vid])).rows[0];
    if (!who) return;
    const week = String(Math.floor(Date.now() / (7 * 864e5)));
    const ins = await q('INSERT INTO visitor_alerts (email, interest, week) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [who.email, it.key, week]);
    if (!ins.rowCount || !mailer) return;
    const to = notifyTo || content().org.email;
    const text = [`${who.name || who.email} is looking at the website about: ${it.label}.`, `Page: ${base}${path}`, '', `Email: ${who.email}`, who.phone ? `Phone: ${who.phone}` : '', '',
      'This may be a good moment to reach out.', `Everything they looked at: ${base}/admin/community`].filter((x) => x !== '').join('\n');
    try { await mailer.send({ to, subject: `Website: ${who.name || who.email} is looking at ${it.label.toLowerCase()}`, text }); } catch (e) { log.error('visitor alert:', e && e.message); }
  }

  return {
    link, interestOf, checkDrafts, checkPastoral,
    mountAdmin(r2, { authed, wrap }) {
      // Who is on the website right now (a page open in the last 2 minutes), and today so far.
      r2.get('/api/site/live', authed, wrap(async (req, res) => {
        await ready;
        const pages = (await q("SELECT path, max(title) AS title, count(DISTINCT vid)::int AS n FROM visitor_hits WHERE last_at > now() - interval '2 minutes' GROUP BY path ORDER BY n DESC LIMIT 12")).rows;
        const now = Number((await q("SELECT count(DISTINCT vid)::int AS n FROM visitor_hits WHERE last_at > now() - interval '2 minutes'")).rows[0].n);
        const today = Number((await q("SELECT count(DISTINCT vid)::int AS n FROM visitor_hits WHERE started_at > date_trunc('day', now() AT TIME ZONE 'America/Los_Angeles') AT TIME ZONE 'America/Los_Angeles'")).rows[0].n);
        const devices = (await q("SELECT device, count(DISTINCT vid)::int AS n FROM visitor_hits WHERE last_at > now() - interval '2 minutes' GROUP BY device")).rows;
        res.set('Cache-Control', 'no-store').json({ now, today, pages: pages.map((p) => ({ path: p.path, title: I.cleanTitle(p.title) || p.path, n: p.n })), devices });
      }));
      // One visitor's visits (from the alert emails): who (if known), every page with how long, and forms they started.
      r2.get(/^\/api\/site\/visitor\/([a-z0-9]{16,40})$/, authed, wrap(async (req, res) => {
        await ready;
        const vid = req.params[0];
        const who = (await q('SELECT name, email, phone FROM visitor_people WHERE vid = $1 ORDER BY updated_at DESC LIMIT 1', [vid])).rows[0] || null;
        const hits = (await q("SELECT path, title, source, device, tz, started_at, secs FROM visitor_hits WHERE vid = $1 AND started_at > now() - interval '120 days' ORDER BY started_at DESC LIMIT 300", [vid])).rows;
        const older = (await q("SELECT path, to_char(day,'YYYY-MM-DD') AS day FROM visitor_views WHERE vid = $1 ORDER BY day DESC LIMIT 300", [vid])).rows;
        const drafts = (await q('SELECT form, path, name, email, phone, amount, updated_at, submitted_at FROM form_drafts WHERE vid = $1 ORDER BY updated_at DESC', [vid])).rows;
        res.json({ who, area: hits[0] ? I.areaOf(hits[0].tz) : '', device: hits[0] ? hits[0].device : '',
          hits: hits.map((h) => ({ path: h.path, title: I.cleanTitle(h.title) || h.path, when: I.pacific(h.started_at), day: new Date(h.started_at).toISOString().slice(0, 10), secs: h.secs, time: I.howLong(h.secs), source: h.source, interest: (interestOf(h.path) || {}).label || '' })),
          older, drafts: drafts.map((d) => ({ ...d, title: formTitle(d.form), when: I.pacific(d.updated_at), finished: !!d.submitted_at })) });
      }));
      // "Started but didn't finish": the Rabbi has followed up.
      r2.post('/api/site/drafts/done', authed, wrap(async (req, res) => {
        await ready;
        const b = req.body || {};
        await q('UPDATE form_drafts SET handled_at = now() WHERE vid = $1 AND form = $2', [String(b.vid || ''), String(b.form || '')]);
        res.json({ ok: true });
      }));
      // Suggestions from what visitors do.
      r2.get('/api/site/ideas', authed, wrap(async (req, res) => { await ready; res.json({ items: await I.ideas(q, content(), base) }); }));
      // People who left their details, with their interests and the pages they looked at (newest first).
      r2.get('/api/site/visitors', authed, wrap(async (req, res) => {
        const people = (await q(`SELECT p.email, max(p.name) AS name, max(p.phone) AS phone, array_agg(DISTINCT p.vid) AS vids, array_agg(DISTINCT p.source) AS sources, max(p.updated_at) AS linked FROM visitor_people p GROUP BY p.email`)).rows;
        // What they did when they left their details (the form or action the website saw them use).
        const viaOf = (s) => { s = String(s || ''); if (!s) return ''; if (s === 'account') return 'Signed in to an account'; if (/^draft:/.test(s)) return 'Started ' + formTitle(s.slice(6)) + ' (typed their details; may not have sent it)'; if (/subscribe/.test(s)) return 'Signed up for the weekly email'; if (/\/forms\//.test(s)) return 'Filled in the form "' + s.split('/').pop() + '"'; if (/rsvp/.test(s)) return 'Made an RSVP'; if (/submit/.test(s)) return 'Sent a prayer name, a message to the Rabbi, or a community post'; if (/lead/.test(s)) return 'Used Call / Text / WhatsApp'; return s.replace('/api/site/', ''); };
        const views = people.length ? (await q("SELECT vid, path, to_char(day,'YYYY-MM-DD') AS day FROM visitor_views WHERE vid = ANY($1) ORDER BY day DESC", [people.flatMap((p) => p.vids)])).rows : [];
        const byVid = {}; for (const v of views) (byVid[v.vid] = byVid[v.vid] || []).push(v);
        const items = people.map((p) => {
          const seen = p.vids.flatMap((v) => byVid[v] || []).sort((a, b) => b.day.localeCompare(a.day)), tags = {};
          for (const v of seen) { const it = interestOf(v.path); if (it) { const t = tags[it.key] || (tags[it.key] = { key: it.key, label: it.label, alert: it.alert, n: 0, last: v.day }); t.n++; } }
          const recentAlert = Object.values(tags).some((t) => t.alert && t.last >= new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10));
          return { name: p.name, email: p.email, phone: p.phone, via: [...new Set((p.sources || []).map(viaOf).filter(Boolean))], lastSeen: seen[0] ? seen[0].day : null, interests: Object.values(tags).sort((a, b) => b.alert - a.alert || b.n - a.n), pages: seen.slice(0, 12), hot: recentAlert };
        }).filter((p) => p.lastSeen).sort((a, b) => b.hot - a.hot || String(b.lastSeen).localeCompare(String(a.lastSeen)));
        // Everyone, anonymous: visitors this week by interest.
        const week = (await q("SELECT path, count(DISTINCT vid)::int AS n FROM visitor_views WHERE day > CURRENT_DATE - 7 GROUP BY path")).rows, totals = {};
        for (const w of week) { const it = interestOf(w.path); if (it) totals[it.label] = (totals[it.label] || 0) + w.n; }
        const unique = (await q('SELECT count(DISTINCT vid)::int AS n FROM visitor_views WHERE day > CURRENT_DATE - 7')).rows[0].n;
        await ready;
        const drafts = (await q(`SELECT vid, form, path, name, email, phone, amount, updated_at FROM form_drafts WHERE submitted_at IS NULL AND handled_at IS NULL AND (email <> '' OR phone <> '')
          AND updated_at > now() - interval '14 days' AND updated_at < now() - interval '5 minutes' ORDER BY updated_at DESC LIMIT 50`)).rows.map((d) => ({ ...d, title: formTitle(d.form), when: I.pacific(d.updated_at) }));
        const pastoral = (await q(`SELECT a.vid, to_char(a.day,'YYYY-MM-DD') AS day, (SELECT max(name) FROM visitor_people p WHERE p.vid = a.vid) AS name FROM visitor_pastoral a WHERE a.day > CURRENT_DATE - 14 ORDER BY a.day DESC LIMIT 30`)).rows;
        res.json({ drafts, pastoral, items: items.slice(0, 200), week: { visitors: unique, interests: Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([label, n]) => ({ label, n })) } });
      }));
    },
  };
}
module.exports = { mountVisitors, interestOf, INTERESTS, sourceOf };
