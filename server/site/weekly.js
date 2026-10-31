// The email system: subscribers, the weekly email (and holiday and personal-message editions, see email.js), sending,
// tracking, and the Rabbi area's tools.
//
// * Signing up: the box at the bottom of every page, the pop-up for visitors who stay a while (site.js), /subscribe,
//   the newsletter form and the account's "Email me about events and holidays". Every new address must confirm from
//   its own inbox (double opt-in) before it gets anything, so no one can sign up someone else.
// * Who gets it: confirmed subscribers (email_subscribers), older newsletter sign-ups and members who opted in, minus
//   anyone who unsubscribed. Each gets it in their own language (English, Hebrew or Russian).
// * Tracking (email_sends, email_clicks): one row per email sent, with when it was opened (a tiny picture) and which
//   links were clicked (links go through /e/c/, signed so they cannot be used to send people elsewhere).
// * Sending: by the Rabbi's button, as a test to himself, or by itself every week at the day and hour he chose.
//   Never twice the same week to the same person. Every email has one-click unsubscribe and a language choice.
'use strict';
const crypto = require('crypto');
const express = require('express');
const Z = require('./zmanim.js');
const { portionsOf } = require('./parsha.js');
const { compose: composeEmail } = require('./email.js');
const { esc } = require('./md.js');

const LANGS = ['en', 'he', 'ru'];
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;
const lower = (e) => String(e || '').trim().toLowerCase().slice(0, 254);
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function mountWeekly(app, { store, mailer, content, base, secret, ctxOf, log = console, upcoming = () => [], giving = {}, limit = () => (req, res, next) => next(), notifyTo = '', auto = false, now = () => new Date(), delayMs = 250 }) {
  const pool = store && store.pool, q = (t, p) => pool.query(t, p);
  const X = (lang) => ctxOf({ lang: LANGS.includes(lang) ? lang : 'en', method: 'GET', originalUrl: '/', query: {}, get: () => '' });
  const hmac = (what, s) => crypto.createHmac('sha256', secret + ':' + what).update(s).digest('base64url').slice(0, 24);
  const sig = (email) => hmac('unsub', email);
  const unsubUrl = (email) => `${base}/unsubscribe?e=${encodeURIComponent(email)}&t=${sig(email)}`;
  const prefsUrl = (email) => `${base}/email/prefs?e=${encodeURIComponent(email)}&t=${sig(email)}`;
  const csig = (email) => hmac('news-confirm', email);
  const confirmUrl = (email, lang = 'en') => `${base}${lang === 'he' || lang === 'ru' ? '/' + lang : ''}/newsletter/confirm?e=${encodeURIComponent(email)}&t=${csig(email)}`;
  const sigOk = (got, want) => { const a = Buffer.from(String(got)), b = Buffer.from(want); return a.length === b.length && crypto.timingSafeEqual(a, b); };

  let ready = null;
  const ensure = () => ready || (ready = q(`
CREATE TABLE IF NOT EXISTS email_subscribers (email TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', lang TEXT NOT NULL DEFAULT 'en', source TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), confirmed_at TIMESTAMPTZ, last_open TIMESTAMPTZ, last_click TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS email_campaigns (id SERIAL PRIMARY KEY, kind TEXT NOT NULL, subject TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', auto BOOLEAN NOT NULL DEFAULT FALSE,
  total INT NOT NULL DEFAULT 0, sent INT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), done_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS email_sends (id TEXT PRIMARY KEY, campaign_id INT NOT NULL, email TEXT NOT NULL, lang TEXT NOT NULL DEFAULT 'en', sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  opened_at TIMESTAMPTZ, opens INT NOT NULL DEFAULT 0, clicked_at TIMESTAMPTZ, clicks INT NOT NULL DEFAULT 0, error TEXT NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS email_sends_campaign_idx ON email_sends (campaign_id);
CREATE INDEX IF NOT EXISTS email_sends_email_idx ON email_sends (email);
CREATE TABLE IF NOT EXISTS email_clicks (send_id TEXT NOT NULL, url TEXT NOT NULL, at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS email_clicks_send_idx ON email_clicks (send_id);`).catch((e) => { ready = null; throw e; }));

  // Everyone who gets the email, each with their language.
  async function recipients() {
    if (!pool) return [];
    await ensure();
    const rows = (await q(`SELECT email, lang FROM email_subscribers WHERE status='confirmed'
      UNION ALL SELECT lower(email), 'en' FROM form_responses WHERE form_id='newsletter' AND status='confirmed'
      UNION ALL SELECT lower(verified_email), lang FROM members WHERE news AND verified_email IS NOT NULL AND last_login IS NOT NULL`)).rows;
    const out = new Map(), unsub = new Set((await q('SELECT email FROM email_unsubscribes')).rows.map((r) => r.email));
    for (const r of rows) if (r.email && /@/.test(r.email) && !unsub.has(r.email) && !out.has(r.email)) out.set(r.email, LANGS.includes(r.lang) ? r.lang : 'en');
    return [...out].map(([email, lang]) => ({ email, lang }));
  }

  // Sign up (from the website): saved as pending, and a confirmation email goes to the address.
  async function subscribe({ email, name = '', lang = 'en', source = '' }) {
    await ensure();
    const L = LANGS.includes(lang) ? lang : 'en', cur = (await q('SELECT status FROM email_subscribers WHERE email=$1', [email])).rows[0];
    const unsubbed = (await q('SELECT 1 FROM email_unsubscribes WHERE email=$1', [email])).rowCount > 0;
    if (cur && cur.status === 'confirmed' && !unsubbed) return { already: true };
    await q(`INSERT INTO email_subscribers (email, name, lang, source, status) VALUES ($1,$2,$3,$4,'pending')
      ON CONFLICT (email) DO UPDATE SET name=COALESCE(NULLIF($2,''), email_subscribers.name), lang=$3, status='pending'`, [email, name.slice(0, 100), L, source.slice(0, 60)]);
    await sendConfirm(email, L);
    return { pending: true };
  }
  async function sendConfirm(email, L) {
    if (!mailer) return;
    const { t, C } = X(L), link = confirmUrl(email, L);
    const html = `<div style="font:16px/1.6 -apple-system,'Segoe UI',Roboto,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1f2433"${L === 'he' ? ' dir="rtl"' : ''}><p style="font:600 20px Georgia,serif;color:#14284b">${esc(C.org.name)}</p><p>${esc(t('Please confirm you would like the weekly email from {org}:', { org: C.org.name }))}</p><p><a href="${esc(link)}" style="display:inline-block;padding:12px 22px;border-radius:999px;background:#c99a2e;color:#1b1405;font-weight:600;text-decoration:none">${esc(t('Yes, sign me up'))}</a></p><p style="color:#5f6470;font-size:14px">${esc(t('If you did not ask for it, ignore this email.'))}</p></div>`;
    await mailer.send({ to: email, subject: t('Please confirm: the weekly email from {org}', { org: C.org.name }), text: t('Please confirm you would like the weekly email from {org}:', { org: C.org.name }) + `\n${link}\n\n` + t('If you did not ask for it, ignore this email.'), html }).catch((e) => log.error('newsletter confirm:', e && e.message));
  }

  // One email for one person: their tracking picture, tracked links (with the campaign named for website statistics),
  // and their own unsubscribe and language links.
  function personalize(m, sendId, email, campaign) {
    const tag = `utm_source=email&utm_medium=email&utm_campaign=${encodeURIComponent(campaign)}`;
    const track = (u) => {
      let to = u.replace(/&amp;/g, '&');
      if (to.startsWith(base + '/')) to += (to.includes('?') ? '&' : '?') + tag;
      return `${base}/e/c/${sendId}?u=${encodeURIComponent(to)}&s=${hmac('click', sendId + to)}`;
    };
    const html = m.html.replace(/href="(https?:\/\/[^"]+)"/g, (x, u) => `href="${esc(track(u))}"`)
      .replace('{{open}}', `<img src="${base}/e/o/${sendId}.gif" width="1" height="1" alt="" style="display:block;border:0">`)
      .replace(/\{\{unsub\}\}/g, esc(unsubUrl(email))).replace(/\{\{prefs\}\}/g, esc(prefsUrl(email)));
    const text = m.text.replace(/\{\{unsub\}\}/g, unsubUrl(email)).replace(/\{\{prefs\}\}/g, prefsUrl(email));
    return { html, text };
  }
  // "A word from the Rabbi": Claude writes a draft for each Shabbat (rabbi-words.json, in three languages); it goes out
  // only once the Rabbi approves it (the Approve button, saved in kv "email-word:<Shabbat date>", or "approved": true
  // in the file when he approves in chat). If he changes the words, everyone gets his words as he wrote them.
  // The Shabbat the next email is for: this week's, or from Shabbat day on, the next one.
  const shabbatOf = async () => {
    const day = (sh) => (sh.parsha && sh.parsha.date) || (sh.havdalah && sh.havdalah.date) || '';
    const d = day(await Z.thisShabbat(now())), today = Z.ymd(Z.todayLocal(now()));
    return d && d <= today ? day(await Z.thisShabbat(new Date(now().getTime() + 864e5))) : d;
  };
  async function wordFor(week) {
    const draft = (content().rabbiWords || []).find((w) => w.week === week) || null;
    const saved = store && store.getKv ? await store.getKv('email-word:' + week, null).catch(() => null) : null;
    return { week, draft, approved: !!(saved || (draft && draft.approved)), text: saved ? saved.text : draft ? draft.text : '' };
  }
  const wordIn = (L, text, w) => {
    if (!String(text || '').trim()) return null;
    const d = w && w.draft;
    if (d && text.trim() === d.text.trim()) return { title: (d[L] && d[L].title) || d.title || '', text: (d[L] && d[L].text) || d.text };
    return { title: '', text };
  };
  // opts.note: the words in the Rabbi area's box (as he left them); without it (sending by itself), the approved word.
  const compose = async (lang, opts = {}) => {
    const w = await wordFor(await shabbatOf()), text = opts.note != null ? opts.note : w.approved ? w.text : '';
    return composeEmail(X(lang), { base, upcoming, giving, now: now(), ...opts, word: wordIn(lang, text, w) });
  };

  // Send to everyone (or a list). opts: { kind: 'auto'|'shabbat'|'holiday'|'message', note, joke, subject, message, auto }.
  // Each person gets it once per edition and day (email_log), in their language.
  async function sendAll(opts, list) {
    await ensure();
    const day = Z.ymd(Z.todayLocal(now())), byLang = {};
    const first = await compose('en', opts);
    const camp = (await q('INSERT INTO email_campaigns (kind, subject, note, auto, total) VALUES ($1,$2,$3,$4,$5) RETURNING id', [first.edition, first.subject, String(opts.note || opts.message || '').slice(0, 4000), !!opts.auto, list.length])).rows[0].id;
    const tagName = `${first.edition}-${day}`;
    const run = async () => {
      let sent = 0;
      for (const r of list) {
        const key = opts.kind === 'message' ? `email:${camp}:${r.email}` : `weekly:${day}:${r.email}`;
        if ((await q('INSERT INTO email_log (key) VALUES ($1) ON CONFLICT DO NOTHING', [key])).rowCount !== 1) continue; // never twice
        const m = byLang[r.lang] || (byLang[r.lang] = r.lang === 'en' ? first : await compose(r.lang, opts));
        const id = crypto.randomBytes(12).toString('base64url'), pz = personalize(m, id, r.email, tagName);
        await q('INSERT INTO email_sends (id, campaign_id, email, lang) VALUES ($1,$2,$3,$4)', [id, camp, r.email, r.lang]);
        try {
          await mailer.send({ to: r.email, subject: m.subject, text: pz.text, html: pz.html, headers: { 'List-Unsubscribe': `<${unsubUrl(r.email)}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } });
          sent++; await q('UPDATE email_campaigns SET sent=sent+1 WHERE id=$1', [camp]);
        } catch (e) { log.error('weekly email:', e && e.message); await q('UPDATE email_sends SET error=$2 WHERE id=$1', [id, String((e && e.message) || e).slice(0, 300)]); }
        if (delayMs && list.length > 1) await new Promise((ok) => setTimeout(ok, delayMs)); // gentle on the mail server
      }
      await q('UPDATE email_campaigns SET done_at=now() WHERE id=$1', [camp]);
      return sent;
    };
    // A short list is sent while the Rabbi waits; a long one carries on in the background (see "Sent emails").
    if (list.length <= 30) return { id: camp, sent: await run(), total: list.length };
    run().catch((e) => log.error('weekly email run:', e && e.message));
    return { id: camp, sent: 0, total: list.length, background: true };
  }

  // Sending by itself, every week at the Rabbi's chosen day and hour (Lafayette time), when he turned it on.
  const AUTO_KEY = 'email-auto', autoDefault = { on: false, day: 4, hour: 10 };
  const getAuto = async () => ({ ...autoDefault, ...((store && store.getKv && await store.getKv(AUTO_KEY, null).catch(() => null)) || {}) });
  async function autoTick() {
    if (!pool || !mailer) return;
    const s = await getAuto(); if (!s.on) return;
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: Z.TZ, weekday: 'long', hour: 'numeric', hourCycle: 'h23' }).formatToParts(now()).map((x) => [x.type, x.value]));
    if (DAYS.indexOf(p.weekday) !== s.day || Number(p.hour) < s.hour) return;
    const sun = Z.todayLocal(now()); sun.setDate(sun.getDate() - sun.getDay());
    // The Rabbi reviews his word first: until he approves this week's draft, the email waits and he gets one reminder.
    const w = await wordFor(await shabbatOf());
    if (w.draft && !w.approved) {
      const to = lower(notifyTo) || lower(content().org.email);
      if (to && (await q('INSERT INTO email_log (key) VALUES ($1) ON CONFLICT DO NOTHING', ['word-review:' + w.week])).rowCount === 1) {
        await mailer.send({ to, subject: 'The weekly email is waiting for your word', text: `Your word for this Shabbat is ready for you to read:\n\n${w.draft.text}\n\nApprove it (or change it) in the Rabbi area: ${base}/admin/community#email\nThe weekly email goes out as soon as you approve it.` }).catch((e) => log.error('word review:', e && e.message));
      }
      return;
    }
    if ((await q('INSERT INTO email_log (key) VALUES ($1) ON CONFLICT DO NOTHING', ['weekly-auto:' + Z.ymd(sun)])).rowCount !== 1) return;
    await sendAll({ kind: 'auto', auto: true }, await recipients());
  }
  if (auto && pool) setInterval(() => autoTick().catch((e) => log.error('weekly auto:', e && e.message)), 10 * 60e3).unref();

  // ---- Public pages and links ----
  const page = (X2, title, body) => `<!doctype html><html lang="${X2.lang}"${X2.lang === 'he' ? ' dir="rtl"' : ''}><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><body style="font:18px/1.5 system-ui;max-width:560px;margin:10vh auto;padding:0 20px;color:#1f2433;background:#fbf7ef"><h1 style="font-family:Georgia,serif;color:#14284b">${esc(title)}</h1>${body}<p><a href="${base}${X2.lang === 'en' ? '' : '/' + X2.lang}/" style="color:#14284b">${esc(X2.C.org.name)} →</a></p></body></html>`;

  app.get(['/newsletter/confirm', '/he/newsletter/confirm', '/ru/newsletter/confirm'], async (req, res) => {
    const email = lower(req.query.e), ok = !!email && sigOk(req.query.t || '', csig(email));
    const lang = (/^\/(he|ru)\//.exec(req.originalUrl) || [])[1] || 'en', X2 = X(lang), t = X2.t;
    if (ok && pool) {
      await ensure();
      await q("UPDATE form_responses SET status='confirmed' WHERE form_id='newsletter' AND lower(email)=$1", [email]);
      await q(`INSERT INTO email_subscribers (email, lang, source, status, confirmed_at) VALUES ($1,$2,'form','confirmed',now())
        ON CONFLICT (email) DO UPDATE SET status='confirmed', confirmed_at=now(), lang=$2`, [email, lang]);
      await q('DELETE FROM email_unsubscribes WHERE email=$1', [email]);
    }
    res.type('html').send(page(X2, t('Weekly email'), ok ? `<p>${esc(t('You are signed up. The weekly email will come every week, with Shabbat times, events and more.'))}</p>` : `<p>${esc(t('This link is not valid.'))}</p>`));
  });

  const unsubscribe = async (email) => { await ensure(); await q('INSERT INTO email_unsubscribes (email) VALUES ($1) ON CONFLICT DO NOTHING', [email]); await q('UPDATE members SET news=FALSE WHERE lower(email)=$1 OR lower(verified_email)=$1', [email]); await q("UPDATE email_subscribers SET status='unsubscribed' WHERE email=$1", [email]); };
  app.get('/unsubscribe', async (req, res) => {
    const email = lower(req.query.e), ok = !!email && sigOk(String(req.query.t || ''), sig(email));
    if (ok && pool) await unsubscribe(email);
    res.type('html').send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribed</title><body style="font:18px/1.5 system-ui;max-width:560px;margin:10vh auto;padding:0 20px"><h1>${ok ? 'You are unsubscribed' : 'This link is not valid'}</h1><p>${ok ? 'You will not get the weekly email any more. Changed your mind? Sign up again any time on our website.' : 'Please use the link at the bottom of the email.'}</p><p><a href="${base}/">${esc(content().org.name)}</a></p></body>`);
  });
  // One-click unsubscribe from the email program's own button (List-Unsubscribe-Post).
  app.post('/unsubscribe', express.urlencoded({ extended: false, limit: '2kb' }), async (req, res) => {
    const email = lower(req.query.e), ok = !!email && sigOk(String(req.query.t || ''), sig(email));
    if (ok && pool) await unsubscribe(email);
    res.status(ok ? 200 : 400).type('text').send(ok ? 'Unsubscribed' : 'Invalid link');
  });
  // Choose the email's language.
  app.get('/email/prefs', async (req, res) => {
    const email = lower(req.query.e), ok = !!email && sigOk(String(req.query.t || ''), sig(email)), set = LANGS.includes(req.query.lang) ? req.query.lang : null;
    if (ok && set && pool) { await ensure(); await q(`INSERT INTO email_subscribers (email, lang, source, status, confirmed_at) VALUES ($1,$2,'prefs','confirmed',now()) ON CONFLICT (email) DO UPDATE SET lang=$2`, [email, set]); await q('UPDATE members SET lang=$2 WHERE lower(verified_email)=$1', [email, set]); }
    const X2 = X(set || 'en'), names = { en: 'English', he: 'עברית', ru: 'Русский' }, link = (l) => `${base}/email/prefs?e=${encodeURIComponent(email)}&t=${encodeURIComponent(req.query.t || '')}&lang=${l}`;
    res.type('html').send(page(X2, X2.t('Email language'), !ok ? `<p>${esc(X2.t('This link is not valid.'))}</p>` : `${set ? `<p><strong>${esc(X2.t('Saved.'))}</strong></p>` : ''}<p>${LANGS.map((l) => `<a href="${esc(link(l))}" style="display:inline-block;margin:4px 6px 4px 0;padding:10px 18px;border-radius:999px;border:1px solid #14284b;color:#14284b;text-decoration:none">${names[l]}</a>`).join('')}</p><p><a href="${esc(unsubUrl(email))}" style="color:#5f6470">${esc(X2.t('Unsubscribe'))}</a></p>`));
  });

  // Tracking: the picture that tells us the email was opened, and every link through /e/c/.
  app.get('/e/o/:id.gif', async (req, res) => {
    res.set({ 'Content-Type': 'image/gif', 'Cache-Control': 'no-store, private' }).send(GIF);
    if (!pool) return;
    try {
      const r = await q('UPDATE email_sends SET opens=opens+1, opened_at=COALESCE(opened_at, now()) WHERE id=$1 RETURNING email', [String(req.params.id).slice(0, 40)]);
      if (r.rows[0]) await q('UPDATE email_subscribers SET last_open=now() WHERE email=$1', [r.rows[0].email]);
    } catch (e) { log.error('email open:', e && e.message); }
  });
  app.get('/e/c/:id', async (req, res) => {
    const id = String(req.params.id).slice(0, 40), to = String(req.query.u || '');
    if (!/^https?:\/\//.test(to) || !sigOk(String(req.query.s || ''), hmac('click', id + to))) return res.redirect(302, base + '/');
    res.redirect(302, to);
    if (!pool) return;
    try {
      const r = await q('UPDATE email_sends SET clicks=clicks+1, clicked_at=COALESCE(clicked_at, now()), opened_at=COALESCE(opened_at, now()) WHERE id=$1 RETURNING email', [id]);
      if (r.rows[0]) { await q('INSERT INTO email_clicks (send_id, url) VALUES ($1,$2)', [id, to.replace(/[?&]utm_[^&]+/g, '').slice(0, 500)]); await q('UPDATE email_subscribers SET last_click=now(), last_open=COALESCE(last_open, now()) WHERE email=$1', [r.rows[0].email]); }
    } catch (e) { log.error('email click:', e && e.message); }
  });

  // Sign up from the website (the box at the bottom of every page, the pop-up and /subscribe).
  app.post('/api/site/subscribe', limit('site-subscribe', 10, 60 * 60 * 1000), express.json({ limit: '2kb' }), async (req, res) => {
    const b = req.body || {}, email = lower(b.email), L = LANGS.includes(b.lang) ? b.lang : 'en', t = X(L).t;
    if (!validEmail(email)) return res.status(400).json({ code: 'invalid_email', error: t('Please enter a valid email address.') });
    if (!pool) return res.status(503).json({ code: 'unavailable', error: t('Something went wrong. Please try again.') });
    try { res.json({ ok: true, ...(await subscribe({ email, name: String(b.name || '').trim(), lang: L, source: String(b.source || 'site') })) }); } catch (e) { log.error('subscribe:', e && e.message); res.status(500).json({ error: t('Something went wrong. Please try again.') }); }
  });

  // The same week as a short WhatsApp message (for the community groups), in English, Hebrew or Russian.
  async function composeWhatsApp(lang = 'en') {
    const L = LANGS.includes(lang) ? lang : 'en', X2 = X(L), t = X2.t, C = X2.C;
    const site = (p) => base + (L === 'en' ? '' : '/' + L) + p, sh = await Z.thisShabbat(), hols = await Z.upcomingHolidays(45), evs = upcoming(C).slice(0, 4);
    const lines = [`*${t('Shabbat Shalom from Chabad of Lamorinda!')}*`, ''];
    if (sh.candles) lines.push(`*${t('Candle lighting, {date}', { date: X2.shortDate(sh.candles.date) })}: ${X2.tm(sh.candles)}*${sh.havdalah ? ' · ' + t('Shabbat ends {time}, {date}', { time: X2.tm(sh.havdalah), date: X2.shortDate(sh.havdalah.date) }) : ''}`, '');
    if (sh.parsha) { const ps = portionsOf(sh.parsha.title); lines.push(`*${X2.hc(sh.parsha)}*: ${site('/parsha')}`, ...(ps[0] ? [(ps[0][L] || ps[0].en).lesson] : []), ''); }
    if (evs.length) { lines.push(`*${t('Coming up')}*`); for (const e of evs) lines.push(`• ${(e[L] && e[L].title) || e.title}: ${X2.when(e)}`, `  ${site('/events/' + e.slug)}`); lines.push(''); }
    if (hols[0]) { const h = C.holidays.find((x) => x.slug === hols[0].slug); lines.push(`*${t('Next holiday')}*: ${h ? h.title : X2.hc(hols[0])}, ${X2.longDate(hols[0].date)}`, ''); }
    lines.push(`${t('This week in Jewish Lamorinda')}: ${site('/this-week')}`, `${t('Get the weekly email')}: ${site('/subscribe')}`);
    return lines.join('\n');
  }

  const optsOf = (src) => ({ kind: ['auto', 'shabbat', 'holiday', 'message'].includes(src.kind) ? src.kind : 'auto', note: src.note == null ? undefined : String(src.note).slice(0, 4000), joke: String(src.joke || '').slice(0, 600), subject: String(src.subject || '').slice(0, 150), message: String(src.message || '').slice(0, 8000) });

  return {
    compose, composeWhatsApp, recipients, unsubUrl, confirmUrl, subscribe, sendAll, autoTick,
    mountAdmin(r2, { authed, wrap }) {
      if (!pool) return;
      const J = express.json({ limit: '32kb' });
      // Preview (text and counts) and the full designed email (for the preview frame).
      r2.get('/api/site/weekly', authed, wrap(async (req, res) => {
        const m = await compose(LANGS.includes(req.query.lang) ? req.query.lang : 'en', optsOf(req.query)), list = await recipients();
        res.json({ subject: m.subject, edition: m.edition, text: m.text, word: await wordFor(await shabbatOf()), recipients: list.length, byLang: list.reduce((a, r) => ({ ...a, [r.lang]: (a[r.lang] || 0) + 1 }), {}), email: !!mailer, auto: await getAuto() });
      }));
      r2.get('/api/site/weekly/preview', authed, wrap(async (req, res) => {
        const m = await compose(LANGS.includes(req.query.lang) ? req.query.lang : 'en', optsOf(req.query));
        res.set('Content-Security-Policy', "default-src 'none'; img-src * data:; style-src 'unsafe-inline'").type('html').send(m.html.replace('{{open}}', '').replace(/\{\{(unsub|prefs)\}\}/g, '#'));
      }));
      r2.get('/api/site/weekly/whatsapp', authed, wrap(async (req, res) => res.json({ text: await composeWhatsApp(String(req.query.lang || 'en')) })));
      r2.post('/api/site/weekly/send', authed, J, wrap(async (req, res) => {
        if (!mailer) return res.status(503).json({ code: 'not_configured', error: 'Email is not set up yet (SMTP_URL and MAIL_FROM in Render).' });
        if (!req.body || req.body.confirm !== true) return res.status(400).json({ code: 'confirm', error: 'Please confirm before sending.' });
        const o = optsOf(req.body); if (o.kind === 'message' && !o.message.trim()) return res.status(400).json({ code: 'empty', error: 'Please write the message.' });
        if (o.note != null) { const week = await shabbatOf(); if (week) await store.setKv('email-word:' + week, { text: o.note, approvedAt: new Date().toISOString() }); } // sending is approving
        const r = await sendAll(o, await recipients());
        res.json({ ok: true, ...r });
      }));
      // A test copy to the Rabbi (or any address he types), not counted and not logged as sent.
      r2.post('/api/site/weekly/test', authed, J, wrap(async (req, res) => {
        if (!mailer) return res.status(503).json({ code: 'not_configured', error: 'Email is not set up yet (SMTP_URL and MAIL_FROM in Render).' });
        const to = lower(req.body && req.body.to) || lower(notifyTo) || lower(content().org.email);
        if (!validEmail(to)) return res.status(400).json({ error: 'Which address?' });
        const m = await compose(LANGS.includes(req.body.lang) ? req.body.lang : 'en', optsOf(req.body || {})), pz = personalize(m, 'test', to, 'test');
        await mailer.send({ to, subject: '[Test] ' + m.subject, text: pz.text, html: pz.html });
        res.json({ ok: true, to });
      }));
      // This week's word and whether it is approved (the Rabbi's desk shows it under "Waiting for you").
      r2.get('/api/site/weekly/word', authed, wrap(async (req, res) => res.json(await wordFor(await shabbatOf()))));
      // The Rabbi approves this week's word (as written, or with his changes).
      r2.post('/api/site/weekly/word', authed, J, wrap(async (req, res) => {
        const week = await shabbatOf(), text = String((req.body && req.body.text) || '').slice(0, 4000);
        if (!week) return res.status(400).json({ error: 'No Shabbat found.' });
        await store.setKv('email-word:' + week, { text, approvedAt: new Date().toISOString() });
        res.json({ ok: true, week });
      }));
      r2.get('/api/site/weekly/auto', authed, wrap(async (req, res) => res.json(await getAuto())));
      r2.post('/api/site/weekly/auto', authed, J, wrap(async (req, res) => {
        const b = req.body || {}, s = { on: !!b.on, day: Math.min(6, Math.max(0, Math.trunc(Number(b.day)) || 0)), hour: Math.min(22, Math.max(5, Math.trunc(Number(b.hour)) || 10)) };
        await store.setKv(AUTO_KEY, s); res.json({ ok: true, ...s });
      }));
      // Sent emails, with how many opened and clicked, and the most clicked links.
      r2.get('/api/site/email/campaigns', authed, wrap(async (req, res) => {
        await ensure();
        const camps = (await q(`SELECT c.id, c.kind, c.subject, c.auto, c.total, c.sent, c.created_at, c.done_at,
          count(s.id) FILTER (WHERE s.opened_at IS NOT NULL)::int AS opened, count(s.id) FILTER (WHERE s.clicked_at IS NOT NULL)::int AS clicked, count(s.id) FILTER (WHERE s.error<>'')::int AS failed
          FROM email_campaigns c LEFT JOIN email_sends s ON s.campaign_id=c.id GROUP BY c.id ORDER BY c.id DESC LIMIT 30`)).rows;
        const links = (await q(`SELECT s.campaign_id, k.url, count(*)::int AS n FROM email_clicks k JOIN email_sends s ON s.id=k.send_id
          WHERE s.campaign_id = ANY($1) GROUP BY 1, 2 ORDER BY n DESC`, [camps.map((c) => c.id)])).rows;
        res.json({ items: camps.map((c) => ({ ...c, links: links.filter((l) => l.campaign_id === c.id).slice(0, 5).map((l) => ({ url: l.url.replace(base, '') || '/', n: l.n })) })) });
      }));
      // Subscribers: everyone, with where they signed up, their language and when they last opened or clicked.
      const subscribers = async () => {
        await ensure();
        const subs = (await q('SELECT email, name, lang, source, status, created_at, confirmed_at, last_open, last_click FROM email_subscribers ORDER BY created_at DESC')).rows;
        const have = new Set(subs.map((s) => s.email)), list = await recipients(), unsub = new Set((await q('SELECT email FROM email_unsubscribes')).rows.map((r) => r.email));
        for (const r of list) if (!have.has(r.email)) subs.push({ email: r.email, name: '', lang: r.lang, source: 'account or form', status: 'confirmed', created_at: null });
        const stats = (await q(`SELECT email, count(*)::int AS got, count(opened_at)::int AS opened, count(clicked_at)::int AS clicked FROM email_sends GROUP BY email`)).rows;
        const st = new Map(stats.map((s) => [s.email, s]));
        return subs.map((s) => ({ ...s, status: unsub.has(s.email) ? 'unsubscribed' : s.status, got: (st.get(s.email) || {}).got || 0, opened: (st.get(s.email) || {}).opened || 0, clicked: (st.get(s.email) || {}).clicked || 0 }));
      };
      r2.get('/api/site/email/subscribers', authed, wrap(async (req, res) => {
        const items = await subscribers(), count = (k) => items.filter((s) => s.status === k).length;
        res.json({ items, confirmed: count('confirmed'), pending: count('pending'), unsubscribed: count('unsubscribed'), email: !!mailer });
      }));
      r2.get('/api/site/email/subscribers.csv', authed, wrap(async (req, res) => {
        const c = (v) => `"${String(v == null ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : v).replace(/"/g, '""')}"`;
        const rows = [['Email', 'Name', 'Language', 'Signed up from', 'Status', 'Signed up', 'Emails received', 'Opened', 'Clicked', 'Last opened'], ...(await subscribers()).map((s) => [s.email, s.name, s.lang, s.source, s.status, s.created_at, s.got, s.opened, s.clicked, s.last_open])];
        res.type('text/csv').attachment('subscribers.csv').send(rows.map((r) => r.map(c).join(',')).join('\n'));
      }));
      // The Rabbi adds someone who asked him in person (they are counted as confirmed), or removes someone.
      r2.post('/api/site/email/subscribers', authed, J, wrap(async (req, res) => {
        const b = req.body || {}, email = lower(b.email);
        if (!validEmail(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
        await ensure();
        await q(`INSERT INTO email_subscribers (email, name, lang, source, status, confirmed_at) VALUES ($1,$2,$3,'added by the Rabbi','confirmed',now())
          ON CONFLICT (email) DO UPDATE SET status='confirmed', confirmed_at=now(), name=COALESCE(NULLIF($2,''), email_subscribers.name), lang=$3`, [email, String(b.name || '').slice(0, 100), LANGS.includes(b.lang) ? b.lang : 'en']);
        await q('DELETE FROM email_unsubscribes WHERE email=$1', [email]);
        res.json({ ok: true });
      }));
      r2.delete('/api/site/email/subscribers/:email', authed, wrap(async (req, res) => { await unsubscribe(lower(req.params.email)); res.json({ ok: true }); }));
      // Sign-ups that never confirmed (for example from before email sending was switched on): ask them again.
      r2.post('/api/site/email/subscribers/remind', authed, J, wrap(async (req, res) => {
        if (!mailer) return res.status(503).json({ code: 'not_configured', error: 'Email is not set up yet (SMTP_URL and MAIL_FROM in Render).' });
        await ensure();
        const list = (await q("SELECT email, lang FROM email_subscribers WHERE status='pending'")).rows;
        for (const s of list) if ((await q('INSERT INTO email_log (key) VALUES ($1) ON CONFLICT DO NOTHING', ['confirm-remind:' + Z.ymd(Z.todayLocal(now())) + ':' + s.email])).rowCount === 1) await sendConfirm(s.email, s.lang);
        res.json({ ok: true, sent: list.length });
      }));
    },
  };
}
module.exports = { mountWeekly };
