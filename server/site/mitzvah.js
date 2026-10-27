// "Do a mitzvah this week" (/mitzvah): visitors tap "I'll do it" on a mitzvah, the community counter for the month goes
// up, and they get a link to share with a friend. Tefillin and mezuzah also offer Call / Text / WhatsApp the Rabbi.
// Anonymous: only which mitzvah and the language are kept.
'use strict';
const express = require('express');
const { esc } = require('./md.js');
const { contactBox } = require('./leads.js');

const MITZVAHS = [
  { id: 'candles', title: 'Light Shabbat candles this Friday', why: 'Bring light and peace into your home before sunset on Friday.', link: '/learn/shabbat-candles' },
  { id: 'tefillin', title: 'Put on tefillin', why: 'A few minutes that connect head and heart to G-d. The Rabbi will gladly help.', link: '/learn/tefillin', lead: 'tefillin' },
  { id: 'tzedakah', title: 'Give tzedakah every day', why: 'A coin a day in a pushka makes giving a habit for the whole family.', link: '/learn/tzedakah' },
  { id: 'shema', title: 'Say the Shema at bedtime', why: 'Six words that have accompanied Jews for 3,000 years.', link: '/learn/bedtime-shema' },
  { id: 'mezuzah', title: 'Put up or check a mezuzah', why: 'Protection and blessing on your door. Mezuzahs should be checked twice in seven years.', link: '/learn/mezuzah', lead: 'mezuzah' },
  { id: 'parents', title: 'Call a parent or grandparent', why: 'Honoring parents is one of the Ten Commandments.', link: '/learn/honoring-parents' },
  { id: 'visit', title: 'Visit or call someone sick or lonely', why: 'Bikur cholim: a visit lifts a person more than you know.', link: '/learn/bikur-cholim' },
  { id: 'guest', title: 'Invite a guest for a Shabbat meal', why: 'Hachnasat orchim, welcoming guests, was Abraham\'s special mitzvah.', link: '/learn/hachnasat-orchim' },
  { id: 'learn', title: 'Learn something Jewish', why: 'Ten minutes a day: a guide, the parsha or a class.', link: '/learn' },
  { id: 'peace', title: 'Make peace with someone', why: 'Be a student of Aaron: love peace and pursue peace.', link: '/learn/forgiveness-and-making-peace' },
];
const IDS = new Set(MITZVAHS.map((m) => m.id));

function mountMitzvah(app, r, { store, render, wrap, ctxOf, limit, base = '', log = console }) {
  const pool = store && store.pool, mem = new Map();
  let cache = { at: 0, month: '', counts: {} };
  const month = () => new Date().toISOString().slice(0, 7);
  async function counts() {
    if (Date.now() - cache.at < 30e3 && cache.month === month()) return cache.counts;
    let c = {};
    if (pool) {
      try { for (const row of (await pool.query("SELECT mitzvah, count(*)::int AS n FROM mitzvah_pledges WHERE created_at >= date_trunc('month', now()) GROUP BY mitzvah")).rows) c[row.mitzvah] = row.n; } catch (e) { log.error('mitzvah counts:', e && e.message); }
    } else for (const [k, v] of mem) if (k.startsWith(month() + ':')) c[k.split(':')[1]] = v;
    cache = { at: Date.now(), month: month(), counts: c };
    return c;
  }

  app.post('/api/site/mitzvah', limit('site-mitzvah', 20, 60 * 60 * 1000), express.json({ limit: '1kb' }), async (req, res) => {
    if (req.get('x-site') !== '1') return res.status(403).json({ code: 'forbidden' });
    const id = String((req.body && req.body.id) || ''), lang = ['he', 'ru'].includes(req.body && req.body.lang) ? req.body.lang : 'en';
    if (!IDS.has(id)) return res.status(400).json({ code: 'invalid' });
    if (pool) await pool.query('INSERT INTO mitzvah_pledges (mitzvah, lang) VALUES ($1,$2)', [id, lang]).catch((e) => log.error('mitzvah:', e && e.message));
    else mem.set(month() + ':' + id, (mem.get(month() + ':' + id) || 0) + 1);
    cache.at = 0;
    const c = await counts();
    res.json({ ok: true, count: c[id] || 0, total: Object.values(c).reduce((a, b) => a + b, 0) });
  });

  r.get('/mitzvah', wrap(async (req, res) => {
    const X = ctxOf(req), t = X.t, c = await counts(), total = Object.values(c).reduce((a, b) => a + b, 0);
    const card = (m) => `<div class="card mitzvah" data-mitzvah="${m.id}"><h3><a href="${m.link}">${esc(t(m.title))}</a></h3><p>${esc(t(m.why))}</p>
<p class="mz-row"><button type="button" class="btn gold sm" data-mitzvah-do>${esc(t("I'll do it"))}</button><span class="muted" data-mitzvah-count>${esc(t('{n} this month', { n: c[m.id] || 0 }))}</span></p>
<div class="mz-done" hidden><p><strong>${esc(t('Thank you! Every mitzvah adds light to the world.'))}</strong> <a href="${m.link}">${esc(t('How to do it'))} →</a></p>${m.lead ? contactBox(X, m.lead) : ''}</div></div>`;
    const body = `<section class="wrap sec"><h1>${esc(t('Do a mitzvah this week'))}</h1>
<p class="lead-d">${esc(t('Pick one mitzvah, tap "I\'ll do it", and join everyone in Lafayette, Moraga, Orinda and nearby who is adding light this month. One good deed leads to another.'))}</p>
<p class="mz-total"><strong data-mitzvah-total>${total}</strong> ${esc(t('mitzvahs pledged in our community this month'))}</p>
<div class="grid mitzvahs">${MITZVAHS.map(card).join('')}</div>
<p>${esc(t('The Lubavitcher Rebbe taught that one more mitzvah can tip the scales for the whole world. Invite a friend to join you.'))}</p></section>`;
    await render(res, { path: '/mitzvah', title: t('Do a mitzvah this week'), description: t('Pick a mitzvah, tap "I\'ll do it" and join the Jewish community of Lafayette, Moraga and Orinda: Shabbat candles, tefillin, tzedakah, a mezuzah and more.'), body });
  }));
}
module.exports = { mountMitzvah, MITZVAHS };
