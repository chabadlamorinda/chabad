// Who visits and what they look at, so the Rabbi can serve people better.
// * Every visitor's browser gets an anonymous id (cookie cl_vid, set by site.js; not set when the browser asks not to
//   be tracked). Each page they view is noted once a day. No IP addresses are kept.
// * When they leave their name and email (RSVP, a form, the community board, a message to the Rabbi, signing in),
//   their visits are linked to them, before and after.
// * Pages are grouped into interests (giving, Bar/Bat Mitzvah, mezuzah...). When a known person looks at an important
//   one, the Rabbi gets an email (once a week per person and interest) and sees them in the Rabbi area.
// * Visits are kept for 3 years (the Rabbi's choice).
'use strict';
const express = require('express');

// Interest tags, first match wins. "alert" interests email the Rabbi when a known person looks at them.
const INTERESTS = [
  ['giving', 'Giving / sponsoring', true, /^\/(donate|sponsor|kiddush|chai-club|sponsor-a-kiddush)(\/|$)|^\/learn\/(supporting-chabad-of-lamorinda|halachic-will|maaser|tzedakah|hachnasat-sefer-torah|letter-in-a-torah|tzedakah-priorities|jewish-view-on-wealth|sponsoring-a-kiddush)$|^\/programs\/chai-club$/],
  ['bar-bat-mitzvah', 'Bar / Bat Mitzvah', true, /bar-mitzvah|bat-mitzvah|bar-bat-mitzvah/],
  ['mezuzah', 'Mezuzah', true, /mezuzah|chanukat-habayit|setting-up-a-jewish-home/],
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
const VID = /^[a-z0-9]{16,40}$/;
const vidOf = (req) => { const m = /(?:^|;\s*)cl_vid=([a-z0-9]+)/.exec(req.get('cookie') || ''); return m && VID.test(m[1]) ? m[1] : null; };
// Submissions that are not people leaving their details.
const NOT_CONTACT = /^\/api\/site\/(chat|lead|view|seen|mitzvah)/;

function mountVisitors(app, { store, mailer, notifyTo = '', content, base = '', limit, log = console, readMember = async () => null }) {
  const pool = store && store.pool;
  if (!pool) return { mountAdmin() {} };
  const q = (t, p) => pool.query(t, p);
  let inserts = 0;

  // Link this visitor to the person who just left their details (runs after any successful form-like POST).
  app.use('/api/site', (req, res, next) => {
    if (req.method !== 'POST' || NOT_CONTACT.test(req.originalUrl)) return next();
    const vid = vidOf(req);
    if (vid) res.on('finish', () => {
      const b = req.body || {}, email = String(b.email || '').trim().toLowerCase().slice(0, 200);
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
      if (++inserts % 500 === 0) q("DELETE FROM visitor_views WHERE day < CURRENT_DATE - 1096").catch(() => {});
      const m = await readMember(req).catch(() => null);
      if (m && m.email) await link(vid, { name: m.name, email: String(m.email).toLowerCase(), phone: m.phone, source: 'account' });
      const it = interestOf(path);
      if (r.rowCount && it && it.alert) await alert(vid, it, path);
    } catch (e) { log.error('visitor view:', e && e.message); }
  });

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
    link, interestOf,
    mountAdmin(r2, { authed, wrap }) {
      // People who left their details, with their interests and the pages they looked at (newest first).
      r2.get('/api/site/visitors', authed, wrap(async (req, res) => {
        const people = (await q(`SELECT p.email, max(p.name) AS name, max(p.phone) AS phone, array_agg(DISTINCT p.vid) AS vids, max(p.updated_at) AS linked FROM visitor_people p GROUP BY p.email`)).rows;
        const views = people.length ? (await q("SELECT vid, path, to_char(day,'YYYY-MM-DD') AS day FROM visitor_views WHERE vid = ANY($1) ORDER BY day DESC", [people.flatMap((p) => p.vids)])).rows : [];
        const byVid = {}; for (const v of views) (byVid[v.vid] = byVid[v.vid] || []).push(v);
        const items = people.map((p) => {
          const seen = p.vids.flatMap((v) => byVid[v] || []).sort((a, b) => b.day.localeCompare(a.day)), tags = {};
          for (const v of seen) { const it = interestOf(v.path); if (it) { const t = tags[it.key] || (tags[it.key] = { key: it.key, label: it.label, alert: it.alert, n: 0, last: v.day }); t.n++; } }
          const recentAlert = Object.values(tags).some((t) => t.alert && t.last >= new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10));
          return { name: p.name, email: p.email, phone: p.phone, lastSeen: seen[0] ? seen[0].day : null, interests: Object.values(tags).sort((a, b) => b.alert - a.alert || b.n - a.n), pages: seen.slice(0, 12), hot: recentAlert };
        }).filter((p) => p.lastSeen).sort((a, b) => b.hot - a.hot || String(b.lastSeen).localeCompare(String(a.lastSeen)));
        // Everyone, anonymous: visitors this week by interest.
        const week = (await q("SELECT path, count(DISTINCT vid)::int AS n FROM visitor_views WHERE day > CURRENT_DATE - 7 GROUP BY path")).rows, totals = {};
        for (const w of week) { const it = interestOf(w.path); if (it) totals[it.label] = (totals[it.label] || 0) + w.n; }
        const unique = (await q('SELECT count(DISTINCT vid)::int AS n FROM visitor_views WHERE day > CURRENT_DATE - 7')).rows[0].n;
        res.json({ items: items.slice(0, 200), week: { visitors: unique, interests: Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([label, n]) => ({ label, n })) } });
      }));
    },
  };
}
module.exports = { mountVisitors, interestOf, INTERESTS };
