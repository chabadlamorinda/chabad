// The weekly email, written automatically from the website: this Shabbat's times and Torah portion, upcoming events,
// the next holiday, and a guide to read. The Rabbi previews it in the Rabbi area, adds a personal note if he likes,
// and sends it with one button to everyone who signed up for the weekly email and every member who opted in.
// Every email has a one-click unsubscribe link.
'use strict';
const crypto = require('crypto');
const express = require('express');
const Z = require('./zmanim.js');
const { portionsOf } = require('./parsha.js');

function mountWeekly(app, { store, mailer, content, base, secret, ctxOf, log = console, upcoming }) {
  const pool = store && store.pool, q = (t, p) => pool.query(t, p);
  const sig = (email) => crypto.createHmac('sha256', secret + ':unsub').update(email).digest('base64url').slice(0, 24);
  const unsubUrl = (email) => `${base}/unsubscribe?e=${encodeURIComponent(email)}&t=${sig(email)}`;
  // The weekly email goes only to addresses that confirmed (double opt-in), so no one can sign up someone else.
  const csig = (email) => crypto.createHmac('sha256', secret + ':news-confirm').update(email).digest('base64url').slice(0, 24);
  const confirmUrl = (email, lang = 'en') => `${base}${lang === 'he' || lang === 'ru' ? '/' + lang : ''}/newsletter/confirm?e=${encodeURIComponent(email)}&t=${csig(email)}`;
  const sigOk = (got, want) => { const a = Buffer.from(String(got)), b = Buffer.from(want); return a.length === b.length && crypto.timingSafeEqual(a, b); };

  async function recipients() {
    if (!pool) return [];
    const rows = (await q(`SELECT lower(email) AS email FROM form_responses WHERE form_id='newsletter' AND status='confirmed'
      UNION SELECT lower(verified_email) FROM members WHERE news AND verified_email IS NOT NULL AND last_login IS NOT NULL
      EXCEPT SELECT email FROM email_unsubscribes`)).rows;
    return [...new Set(rows.map((r) => r.email))].filter((e) => /@/.test(e));
  }
  async function compose(note = '') {
    const X = ctxOf({ lang: 'en', method: 'GET', originalUrl: '/', query: {}, get: () => '' }), C = content();
    const sh = await Z.thisShabbat(), ps = sh.parsha ? portionsOf(sh.parsha.title) : [], hols = await Z.upcomingHolidays(45);
    const evs = upcoming().slice(0, 6), guide = require('./yearly.js').guideOfWeek(C);
    const lines = [];
    if (note.trim()) lines.push(note.trim(), '');
    if (sh.candles) lines.push(`SHABBAT${sh.parsha ? ': ' + sh.parsha.title.toUpperCase() : ''}`, `Candle lighting ${X.shortDate(sh.candles.date)} at ${sh.candles.timeStr}${sh.havdalah ? `, Shabbat ends ${sh.havdalah.timeStr}` : ''} (Lafayette).`, `Services and Kiddush: ${base}/shabbat`, '');
    for (const p of ps) lines.push(`THE TORAH PORTION: ${p.name}`, p.en.summary, '', `A lesson for today: ${p.en.lesson}`, `${base}/parsha`, '');
    if (evs.length) { lines.push('COMING UP'); for (const e of evs) lines.push(`* ${e.title}: ${X.when(e)}${e.rsvp ? ' (RSVP in one tap)' : ''}`, `  ${base}/events/${e.slug}`); lines.push(''); }
    if (hols[0]) { const h = C.holidays.find((x) => x.slug === hols[0].slug); lines.push(`NEXT HOLIDAY: ${h ? h.title : hols[0].title}, ${X.longDate(hols[0].date)}`, `${base}/holidays/${hols[0].slug}`, ''); }
    if (guide) lines.push(`LEARN SOMETHING NEW: ${guide.title}`, guide.description, `${base}/learn/${guide.slug}`, '');
    lines.push(`Mark a yahrzeit, birthday or simcha: ${base}/sponsor`, `Support our community: ${base}/donate`, '', `${C.org.name} · ${C.org.phone} · ${base}`);
    const subject = sh.parsha ? `Shabbat ${sh.parsha.title.replace('Parashat ', '')}: candles ${sh.candles ? sh.candles.timeStr : ''}` : `This week at ${C.org.name}`;
    return { subject, text: lines.join('\n') };
  }

  // The same week as a short WhatsApp message (for the community groups), in English, Hebrew or Russian.
  async function composeWhatsApp(lang = 'en') {
    const L = ['he', 'ru'].includes(lang) ? lang : 'en', X = ctxOf({ lang: L, method: 'GET', originalUrl: '/', query: {}, get: () => '' }), t = X.t, C = X.C;
    const site = (p) => base + (L === 'en' ? '' : '/' + L) + p, sh = await Z.thisShabbat(), hols = await Z.upcomingHolidays(45), evs = upcoming().slice(0, 4);
    const lines = [`*${t('Shabbat Shalom from Chabad of Lamorinda!')}*`, ''];
    if (sh.candles) lines.push(`*${t('Candle lighting, {date}', { date: X.shortDate(sh.candles.date) })}: ${X.tm(sh.candles)}*${sh.havdalah ? ' · ' + t('Shabbat ends {time}, {date}', { time: X.tm(sh.havdalah), date: X.shortDate(sh.havdalah.date) }) : ''}`, `${t('Shabbat services and Kiddush')}: ${site('/shabbat')}`, '');
    if (sh.parsha) lines.push(`*${X.hc(sh.parsha)}*: ${site('/parsha')}`, '');
    if (evs.length) { lines.push(`*${t('Coming up')}*`); for (const e of evs) lines.push(`• ${(e[L] && e[L].title) || e.title}: ${X.when(e)}`, `  ${site('/events/' + e.slug)}`); lines.push(''); }
    if (hols[0]) { const h = C.holidays.find((x) => x.slug === hols[0].slug); lines.push(`*${t('Next holiday')}*: ${h ? h.title : X.hc(hols[0])}, ${X.longDate(hols[0].date)}`, ''); }
    lines.push(`${t('This week in Jewish Lamorinda')}: ${site('/this-week')}`);
    return lines.join('\n');
  }

  app.get(['/newsletter/confirm', '/he/newsletter/confirm', '/ru/newsletter/confirm'], async (req, res) => {
    const email = String(req.query.e || '').toLowerCase().slice(0, 254), ok = !!email && sigOk(req.query.t || '', csig(email));
    if (ok && pool) await q("UPDATE form_responses SET status='confirmed' WHERE form_id='newsletter' AND lower(email)=$1", [email]);
    const lang = /^\/(he|ru)\//.exec(req.path), X = ctxOf({ lang: lang ? lang[1] : 'en', method: 'GET', originalUrl: '/', query: {}, get: () => '' }), t = X.t;
    res.type('html').send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${t('Weekly email')}</title><body style="font:18px/1.5 system-ui;max-width:560px;margin:10vh auto;padding:0 20px"${lang && lang[1] === 'he' ? ' dir="rtl"' : ''}><h1>${ok ? t('You are signed up. Thank you!') : t('This link is not valid')}</h1><p>${ok ? t('The weekly email from Chabad of Lamorinda will come every week. You can unsubscribe with one click from any email.') : t('Please use the link from the email, or contact us.')}</p><p><a href="${lang ? '/' + lang[1] : ''}/">${t('Back to the website')}</a></p>`);
  });

  app.get('/unsubscribe', async (req, res) => {
    const email = String(req.query.e || '').toLowerCase().slice(0, 254), tok = String(req.query.t || '');
    const ok = !!email && sigOk(tok, sig(email));
    if (ok && pool) { await q('INSERT INTO email_unsubscribes (email) VALUES ($1) ON CONFLICT DO NOTHING', [email]); await q('UPDATE members SET news=FALSE WHERE lower(email)=$1', [email]); }
    res.type('html').send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribed</title><body style="font:18px/1.5 system-ui;max-width:560px;margin:10vh auto;padding:0 20px"><h1>${ok ? 'You are unsubscribed' : 'This link is not valid'}</h1><p>${ok ? 'You will no longer receive the weekly email. Reminders you set up in your account (yahrzeits, birthdays) still come.' : 'Please use the link from the email, or contact us.'}</p><p><a href="/">Back to the website</a></p>`);
  });

  return {
    compose, composeWhatsApp, recipients, unsubUrl, confirmUrl,
    mountAdmin(r2, { authed, wrap }) {
      if (!pool) return;
      r2.get('/api/site/weekly', authed, wrap(async (req, res) => { const m = await compose(String(req.query.note || '')); res.json({ ...m, recipients: (await recipients()).length, email: !!mailer }); }));
      r2.get('/api/site/weekly/whatsapp', authed, wrap(async (req, res) => res.json({ text: await composeWhatsApp(String(req.query.lang || 'en')) })));
      r2.post('/api/site/weekly/send', authed, express.json({ limit: '16kb' }), wrap(async (req, res) => {
        if (!mailer) return res.status(503).json({ code: 'not_configured', error: 'Email is not set up yet (SMTP_URL and MAIL_FROM in Render).' });
        if (!req.body || req.body.confirm !== true) return res.status(400).json({ code: 'confirm', error: 'Please confirm before sending.' });
        const week = Z.ymd(Z.todayLocal()).slice(0, 10), m = await compose(String(req.body.note || '').slice(0, 2000)), list = await recipients();
        let sent = 0;
        for (const to of list) {
          const key = `weekly:${week}:${to}`;
          if ((await q('INSERT INTO email_log (key) VALUES ($1) ON CONFLICT DO NOTHING', [key])).rowCount !== 1) continue; // never twice in a day
          try { await mailer.send({ to, subject: m.subject, text: `${m.text}\n\nUnsubscribe: ${unsubUrl(to)}` }); sent++; } catch (e) { log.error('weekly email:', e && e.message); }
        }
        res.json({ ok: true, sent, total: list.length });
      }));
    },
  };
}
module.exports = { mountWeekly };
