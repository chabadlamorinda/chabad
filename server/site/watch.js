// "Tell me when there is an event": a program page with nothing coming up lets a visitor leave a name and an email address.
// When an event for that program is published, each person who asked gets one email about it (in their language), with a
// one-tap link to stop. The Rabbi is emailed about every new request, like everything people send on the website.
'use strict';
const express = require('express');
const crypto = require('crypto');
const { esc } = require('./md.js');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS event_watch (
  id SERIAL PRIMARY KEY, email TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', topic TEXT NOT NULL, lang TEXT NOT NULL DEFAULT 'en',
  token TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), stopped_at TIMESTAMPTZ, UNIQUE (email, topic));
CREATE TABLE IF NOT EXISTS event_watch_sent (email TEXT NOT NULL, event_slug TEXT NOT NULL, sent_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (email, event_slug));`;

const WORDS = {
  en: { subject: 'Coming up at Chabad of Lamorinda: {title}', hi: 'Hello{name},', intro: 'You asked us to let you know when there is a {program} event. Here it is:', more: 'Details and RSVP', stop: 'No more of these emails', thanks: 'Thank you! We will email you when there is a {program} event.', confirm: 'We will let you know about {program}', confirmText: 'Thank you! As soon as there is a {program} event, we will email you about it.' },
  he: { subject: 'בקרוב בחב״ד למורינדה: {title}', hi: 'שלום{name},', intro: 'ביקשתם שנודיע לכם כשיהיה אירוע של {program}. הנה הוא:', more: 'פרטים והרשמה', stop: 'לא לשלוח לי עוד מיילים כאלה', thanks: 'תודה! נשלח לכם מייל כשיהיה אירוע של {program}.', confirm: 'נעדכן אתכם על {program}', confirmText: 'תודה! ברגע שיהיה אירוע של {program}, נשלח לכם על כך מייל.' },
  ru: { subject: 'Скоро в Хабаде Ламоринды: {title}', hi: 'Здравствуйте{name},', intro: 'Вы просили сообщить, когда будет мероприятие «{program}». Вот оно:', more: 'Подробности и регистрация', stop: 'Больше не присылать такие письма', thanks: 'Спасибо! Мы напишем вам, когда будет мероприятие «{program}».', confirm: 'Мы сообщим вам о «{program}»', confirmText: 'Спасибо! Как только будет мероприятие «{program}», мы напишем вам.' },
};
const fill = (s, o) => s.replace(/\{(\w+)\}/g, (m, k) => (o[k] != null ? o[k] : m));
const validEmail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

function mountWatch(app, { store, mailer, notifyTo = '', content, ctxOf = null, upcoming, base = '', limit, log = console, jobs = false }) {
  const pool = store && store.pool;
  const ready = pool ? pool.query(SCHEMA).catch((e) => log.error('event watch schema:', e && e.message)) : Promise.resolve();
  const q = async (sql, p) => { await ready; return pool.query(sql, p); };
  const X = (L) => (ctxOf ? ctxOf({ lang: L, method: 'GET', originalUrl: '/', query: {}, get: () => '' }) : null);
  const C = (L) => (X(L) ? X(L).C : content());
  const programName = (slug, L) => { const p = (C(L).programs || []).find((x) => x.slug === slug); return p ? p.name : slug; };

  app.post('/api/site/watch', limit('site-watch', 20, 10 * 60 * 1000), express.json({ limit: '2kb' }), async (req, res, next) => {
    try {
      if (req.get('x-site') !== '1') return res.status(403).json({ code: 'forbidden' });
      const b = req.body || {}, topic = String(b.topic || ''), email = String(b.email || '').trim().toLowerCase().slice(0, 200), name = String(b.name || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 100);
      const L = ['he', 'ru'].includes(b.lang) ? b.lang : 'en';
      if (!(content().programs || []).some((p) => p.slug === topic)) return res.status(400).json({ code: 'invalid_topic' });
      if (!validEmail(email)) return res.status(400).json({ code: 'invalid_email', error: 'Please enter a valid email address.' });
      if (!pool) return res.json({ ok: true });
      await q(`INSERT INTO event_watch (email, name, topic, lang, token) VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (email, topic) DO UPDATE SET name = COALESCE(NULLIF(EXCLUDED.name,''), event_watch.name), lang = EXCLUDED.lang, stopped_at = NULL`, [email, name, topic, L, crypto.randomBytes(18).toString('hex')]);
      const W = WORDS[L], prog = programName(topic, L), to = notifyTo || content().org.email;
      res.json({ ok: true, message: fill(W.thanks, { program: prog }) });
      if (mailer && to) mailer.send({ to, subject: `Website: ${name || email} wants to hear about ${programName(topic, 'en')} events`, text: `${name || '(no name)'} <${email}> asked to be told when there is a ${programName(topic, 'en')} event (there is none on the website right now).\n\nLanguage: ${L}\n\nThis may be a good moment to plan one, or to reach out.\n\nRabbi area: ${base}/admin/community` }).catch((e) => log.error('watch notify:', e && e.message));
      if (mailer) mailer.send({ to: email, subject: fill(W.confirm, { program: prog }), text: `${fill(W.confirmText, { program: prog })}\n\n${content().org.name} · ${content().org.phone}` }).catch((e) => log.error('watch confirm:', e && e.message));
    } catch (e) { next(e); }
  });

  app.get('/watch/stop', async (req, res) => {
    const t = String(req.query.t || '');
    if (pool && /^[a-f0-9]{36}$/.test(t)) await q('UPDATE event_watch SET stopped_at = now() WHERE token = $1 AND stopped_at IS NULL', [t]).catch(() => {});
    res.type('html').send('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Done</title><body style="font:18px system-ui;max-width:520px;margin:60px auto;padding:0 16px;text-align:center"><p>Done. You will not get these emails any more.</p><p><a href="/">Chabad of Lamorinda</a></p>');
  });

  // Email everyone waiting for a program's events about each new one (once per person and event).
  async function send() {
    if (!pool || !mailer) return 0;
    const watching = (await q('SELECT email, name, topic, lang, token FROM event_watch WHERE stopped_at IS NULL')).rows;
    if (!watching.length) return 0;
    const evs = upcoming(new Date(), content()).filter((e) => e.program);
    let n = 0;
    for (const w of watching) {
      for (const e of evs.filter((x) => x.program === w.topic)) {
        if (!(await q('INSERT INTO event_watch_sent (email, event_slug) VALUES ($1,$2) ON CONFLICT DO NOTHING', [w.email, e.slug])).rowCount) continue;
        const W = WORDS[w.lang] || WORDS.en, tr = (e[w.lang] || {}), title = tr.title || e.title, summary = tr.summary || e.summary || '';
        const pre = w.lang === 'en' ? '' : '/' + w.lang, at = X(w.lang) && X(w.lang).when ? X(w.lang).when(e) : e.start.replace('T', ' ');
        const text = [fill(W.hi, { name: w.name ? ' ' + w.name : '' }), '', fill(W.intro, { program: programName(w.topic, w.lang) }), '', title, at, summary, '', `${W.more}: ${base}${pre}/events/${e.slug}?src=watch`, '', `${content().org.name} · ${content().org.phone}`, '', `${W.stop}: ${base}/watch/stop?t=${w.token}`].join('\n');
        await mailer.send({ to: w.email, subject: fill(W.subject, { title }), text, headers: { 'List-Unsubscribe': `<${base}/watch/stop?t=${w.token}>` } }).then(() => n++).catch((e2) => log.error('watch send:', e2 && e2.message));
      }
    }
    return n;
  }
  if (jobs) setInterval(() => send().catch((e) => log.error('event watch:', e && e.message)), 60 * 60 * 1000).unref();
  return { send };
}

// The box on a program page with nothing coming up.
function watchBox(X, p) {
  const { t } = X;
  return `<div class="card watch-box" data-watch="${esc(p.slug)}"><h2>${esc(t('Nothing on the calendar yet'))}</h2>
<p>${esc(t('Want to hear first? Leave your email and we will let you know as soon as there is a {name} event.', { name: p.name }))}</p>
<form class="watch-form" novalidate><label>${esc(t('Your name'))} <input type="text" name="name" maxlength="100" autocomplete="name"></label>
<label>${esc(t('Your email'))} <input type="email" name="email" maxlength="200" autocomplete="email" inputmode="email" required></label>
<p class="msg err" role="alert" hidden></p><button type="submit" class="btn gold">${esc(t('Let me know'))}</button></form></div>`;
}

module.exports = { mountWatch, watchBox };
