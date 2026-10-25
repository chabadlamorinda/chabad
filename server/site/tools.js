// Free Jewish calendar tools (work without JavaScript; answers are in the page, so search engines and AI can use them):
// Hebrew date converter, yahrzeit calculator, Bar/Bat Mitzvah date. Every tool page is in all three languages.
'use strict';
const H = require('../../pushka/hebdate.js');
const Z = require('./zmanim.js');
const { esc } = require('./md.js');

const validYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(new Date(s + 'T12:00:00Z')) && s >= '1900-01-01' && s <= '2100-12-31';
const local = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(y, m - 1, d); };
const form = (X, action, d, sunset, extra = '') => `<form class="card tool" method="get" action="${action}">
  <label>${esc(X.t('Date'))} <input type="date" name="d" value="${esc(d || '')}" required></label>
  <label class="check"><input type="checkbox" name="night" value="1"${sunset ? ' checked' : ''}> ${esc(X.t('After sunset (the Hebrew day starts at nightfall)'))}</label>
  ${extra}<button class="btn gold" type="submit">${esc(X.t('Calculate'))}</button></form>`;

function mountTools(r, { render, wrap, ctxOf }) {
  r.get('/tools/hebrew-date', wrap(async (req, res) => {
    const X = ctxOf(req), t = X.t, d = String(req.query.d || ''), night = req.query.night === '1';
    let out = '';
    if (validYmd(d)) {
      const h = await Z.hebrewDate(local(d), night);
      out = `<div class="card answer"><p>${esc(X.longDate(d))}${night ? ' ' + esc(t('(after sunset)')) : ''} =</p><p class="big">${esc(X.lang === 'he' ? h.he : X.lang === 'ru' ? `${h.day} ${t(h.month)} ${h.year}` : h.en)}</p>${X.lang !== 'he' ? `<p class="he" lang="he">${esc(h.he)}</p>` : ''}</div>`;
    }
    const today = await X.hebrewDate(Z.todayLocal());
    await render(res, { path: '/tools/hebrew-date', noindex: !!d, title: t('Hebrew date converter'), description: t('Convert any date to the Hebrew (Jewish) calendar. Today is {date}.', { date: today }),
      body: `<section class="wrap sec narrow"><h1>${esc(t('Hebrew date converter'))}</h1><p class="lead-d">${esc(t('Today is {date}.', { date: today }))}</p>${form(X, '/tools/hebrew-date', d, night)}${out}
<p class="muted"><a href="/tools/yahrzeit">${esc(t('Yahrzeit calculator'))}</a> · <a href="/tools/bar-bat-mitzvah">${esc(t('Bar & Bat Mitzvah date'))}</a> · <a href="/tehillim">${esc(t('Tehillim: your birthday chapter'))}</a></p></section>` });
  }));

  r.get('/tools/yahrzeit', wrap(async (req, res) => {
    const X = ctxOf(req), t = X.t, d = String(req.query.d || ''), night = req.query.night === '1';
    let out = '';
    if (validYmd(d)) {
      const p = H.hebrewOf(d, night), entry = { day: p.day, month: p.month, year: p.year }, rows = [];
      let from = Z.ymd(Z.todayLocal());
      for (let i = 0; i < 10; i++) { const n = H.next(entry, from); if (!n) break; rows.push(n); from = H.addDays(n.date, 1); }
      const heb = X.lang === 'he' ? H.label(entry, true) : X.lang === 'ru' ? `${p.day} ${t(p.month)}` : H.label(entry);
      out = `<div class="card answer"><p>${esc(t('Passing on {date}: Hebrew date {hebrew} {year}.', { date: X.longDate(d), hebrew: heb, year: p.year }))}</p>
<table class="tbl"><thead><tr><th>${esc(t('Yahrzeit'))}</th><th>${esc(t('Light the candle the evening before'))}</th></tr></thead><tbody>${rows.map((n) => `<tr><td>${esc(X.longDate(n.date))}</td><td>${esc(X.longDate(H.addDays(n.date, -1)))}</td></tr>`).join('')}</tbody></table>
<p class="btns"><a class="btn gold" href="/account#yahrzeits">${esc(t('Save this yahrzeit and get a reminder every year'))}</a><a class="btn ghost" href="/sponsor?o=yahrzeit">${esc(t('Sponsor a Kiddush in their memory'))}</a><a class="btn ghost" href="/kaddish">${esc(t('Kaddish'))}</a><a class="btn ghost" href="/tehillim#yahrzeit">${esc(t('Tehillim for a yahrzeit'))}</a></p></div>`;
    }
    await render(res, { path: '/tools/yahrzeit', noindex: !!d, title: t('Yahrzeit calculator'), description: t('Find the yahrzeit (Jewish anniversary of passing) for the next 10 years, with reminders, from Chabad of Lamorinda.'),
      body: `<section class="wrap sec narrow"><h1>${esc(t('Yahrzeit calculator'))}</h1><p class="lead-d">${esc(t('Enter the date of passing to see the yahrzeit for the next ten years. The yahrzeit begins the evening before, when a 24-hour memorial candle is lit and Kaddish is said.'))}</p>${form(X, '/tools/yahrzeit', d, night)}${out}
<p class="muted"><a href="/kaddish">${esc(t('Would you like Kaddish said or a memorial plaque? Contact the Rabbi.'))}</a></p></section>` });
  }));

  r.get('/tools/bar-bat-mitzvah', wrap(async (req, res) => {
    const X = ctxOf(req), t = X.t, d = String(req.query.d || ''), night = req.query.night === '1', girl = req.query.g === 'girl';
    let out = '';
    if (validYmd(d)) {
      const m = await Z.mitzvahDate(local(d), night, girl);
      out = `<div class="card answer"><p>${esc(girl ? t('Bat Mitzvah (age 12)') : t('Bar Mitzvah (age 13)'))}:</p><p class="big">${esc(X.longDate(m.date))}</p><p><span class="he" lang="he">${esc(m.he)}</span></p><p class="muted">${esc(t('It begins the evening before at sunset.'))}</p><p class="btns"><a class="btn gold" href="/help/bar-bat-mitzvah">${esc(t('Plan the Bar or Bat Mitzvah with the Rabbi'))}</a></p></div>`;
    }
    const extra = `<fieldset class="radios"><legend>${esc(t('For'))}</legend><label><input type="radio" name="g" value="boy"${girl ? '' : ' checked'}> ${esc(t('Boy (Bar Mitzvah, 13)'))}</label><label><input type="radio" name="g" value="girl"${girl ? ' checked' : ''}> ${esc(t('Girl (Bat Mitzvah, 12)'))}</label></fieldset>`;
    await render(res, { path: '/tools/bar-bat-mitzvah', noindex: !!d, title: t('Bar & Bat Mitzvah date calculator'), description: t('Find the Hebrew date of a Bar Mitzvah (13) or Bat Mitzvah (12) from the birth date.'),
      body: `<section class="wrap sec narrow"><h1>${esc(t('Bar & Bat Mitzvah date calculator'))}</h1><p class="lead-d">${esc(t('A boy becomes Bar Mitzvah on his 13th Hebrew birthday, a girl becomes Bat Mitzvah on her 12th. Enter the birth date:'))}</p>${form(X, '/tools/bar-bat-mitzvah', d, night, extra)}${out}</section>` });
  }));
}
module.exports = { mountTools, validYmd };
