// Free Jewish calendar tools (work without JavaScript; answers are in the page, so search engines and AI can use them):
// Hebrew date converter, yahrzeit calculator, Bar/Bat Mitzvah date.
'use strict';
const H = require('../../pushka/hebdate.js');
const Z = require('./zmanim.js');
const { esc } = require('./md.js');

const validYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(new Date(s + 'T12:00:00Z')) && s >= '1900-01-01' && s <= '2100-12-31';
const nice = (ymd) => new Date(ymd + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const local = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(y, m - 1, d); };
const form = (action, d, sunset, extra = '') => `<form class="card tool" method="get" action="${action}">
  <label>Date <input type="date" name="d" value="${esc(d || '')}" required></label>
  <label class="check"><input type="checkbox" name="night" value="1"${sunset ? ' checked' : ''}> After sunset (the Hebrew day starts at nightfall)</label>
  ${extra}<button class="btn gold" type="submit">Calculate</button></form>`;

function mountTools(r, { render, wrap }) {
  r.get('/tools/hebrew-date', wrap(async (req, res) => {
    const d = String(req.query.d || ''), night = req.query.night === '1';
    let out = '';
    if (validYmd(d)) { const h = await Z.hebrewDate(local(d), night); out = `<div class="card answer"><p>${esc(nice(d))}${night ? ' (after sunset)' : ''} is</p><p class="big">${esc(h.en)}</p><p class="he" lang="he">${esc(h.he)}</p></div>`; }
    const today = await Z.hebrewDate(Z.todayLocal());
    await render(res, { path: '/tools/hebrew-date', noindex: !!d, title: 'Hebrew date converter', description: `Convert any date to the Hebrew (Jewish) calendar. Today is ${today.en}.`,
      body: `<section class="wrap sec narrow"><h1>Hebrew date converter</h1><p class="lead-d">Today is <strong>${esc(today.en)}</strong> <span class="he" lang="he">${esc(today.he)}</span>.</p>${form('/tools/hebrew-date', d, night)}${out}
<p class="muted">Need a yahrzeit or a Bar/Bat Mitzvah date? Try the <a href="/tools/yahrzeit">yahrzeit calculator</a> or the <a href="/tools/bar-bat-mitzvah">Bar/Bat Mitzvah date</a> tool.</p></section>` });
  }));

  r.get('/tools/yahrzeit', wrap(async (req, res) => {
    const d = String(req.query.d || ''), night = req.query.night === '1';
    let out = '';
    if (validYmd(d)) {
      const p = H.hebrewOf(d, night), entry = { day: p.day, month: p.month, year: p.year }, rows = [];
      let from = Z.ymd(Z.todayLocal());
      for (let i = 0; i < 10; i++) { const n = H.next(entry, from); if (!n) break; rows.push(n); from = H.addDays(n.date, 1); }
      out = `<div class="card answer"><p>Passing on ${esc(nice(d))}${night ? ' (after sunset)' : ''}: Hebrew date <strong>${esc(H.label(entry))} ${p.year}</strong>.</p>
<table class="tbl"><thead><tr><th>Yahrzeit</th><th>Light the candle the evening before</th></tr></thead><tbody>${rows.map((n) => `<tr><td>${esc(nice(n.date))}</td><td>${esc(nice(H.addDays(n.date, -1)))} at sunset</td></tr>`).join('')}</tbody></table>
<p><a class="btn gold" href="/account#yahrzeits">Save this yahrzeit and get a reminder every year</a></p></div>`;
    }
    await render(res, { path: '/tools/yahrzeit', noindex: !!d, title: 'Yahrzeit calculator', description: 'Find the yahrzeit (Jewish anniversary of passing) for the next 10 years, with reminders, from Chabad of Lamorinda.',
      body: `<section class="wrap sec narrow"><h1>Yahrzeit calculator</h1><p class="lead-d">Enter the date of passing to see the yahrzeit for the next ten years. The yahrzeit begins the evening before, when a 24-hour memorial candle is lit and Kaddish is said.</p>${form('/tools/yahrzeit', d, night)}${out}
<p class="muted">Would you like Kaddish said or a memorial plaque? <a href="/contact">Contact the Rabbi</a>.</p></section>` });
  }));

  r.get('/tools/bar-bat-mitzvah', wrap(async (req, res) => {
    const d = String(req.query.d || ''), night = req.query.night === '1', girl = req.query.g === 'girl';
    let out = '';
    if (validYmd(d)) {
      const m = await Z.mitzvahDate(local(d), night, girl);
      out = `<div class="card answer"><p>${girl ? 'Bat Mitzvah (age 12)' : 'Bar Mitzvah (age 13)'}:</p><p class="big">${esc(nice(m.date))}</p><p>${esc(m.en)} · <span class="he" lang="he">${esc(m.he)}</span></p><p class="muted">It begins the evening before at sunset.</p><p><a class="btn gold" href="/programs">Ask about Bar/Bat Mitzvah preparation</a></p></div>`;
    }
    const extra = `<fieldset class="radios"><legend>For</legend><label><input type="radio" name="g" value="boy"${girl ? '' : ' checked'}> Boy (Bar Mitzvah, 13)</label><label><input type="radio" name="g" value="girl"${girl ? ' checked' : ''}> Girl (Bat Mitzvah, 12)</label></fieldset>`;
    await render(res, { path: '/tools/bar-bat-mitzvah', noindex: !!d, title: 'Bar & Bat Mitzvah date calculator', description: 'Find the Hebrew date of a Bar Mitzvah (13) or Bat Mitzvah (12) from the birth date.',
      body: `<section class="wrap sec narrow"><h1>Bar &amp; Bat Mitzvah date calculator</h1><p class="lead-d">A boy becomes Bar Mitzvah on his 13th Hebrew birthday, a girl becomes Bat Mitzvah on her 12th. Enter the birth date:</p>${form('/tools/bar-bat-mitzvah', d, night, extra)}${out}</section>` });
  }));
}
module.exports = { mountTools, validYmd };
