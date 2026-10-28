// Free Jewish calendar tools (work without JavaScript; answers are in the page, so search engines and AI can use them):
// Hebrew date converter, yahrzeit calculator, Bar/Bat Mitzvah date. Every tool page is in all three languages.
'use strict';
const H = require('../../pushka/hebdate.js');
const Z = require('./zmanim.js');
const { esc } = require('./md.js');

const validYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(new Date(s + 'T12:00:00Z')) && new Date(s + 'T12:00:00Z').toISOString().slice(0, 10) === s && s >= '1900-01-01' && s <= '2100-12-31';
const local = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(y, m - 1, d); };
const form = (X, action, d, sunset, extra = '') => `<form class="card tool" method="get" action="${action}#answer">
  <label>${esc(X.t('Date'))} <input type="date" name="d" value="${esc(d || '')}" required></label>
  <label class="check"><input type="checkbox" name="night" value="1"${sunset ? ' checked' : ''}> ${esc(X.t('After sunset (the Hebrew day starts at nightfall)'))}</label>
  ${extra}<button class="btn gold" type="submit">${esc(X.t('Calculate'))}</button></form>`;

function mountTools(r, { render, wrap, ctxOf }) {
  // ---------- daily times (zmanim) for Lafayette or any of our towns ----------
  r.get('/tools/zmanim', wrap(async (req, res) => {
    const X = ctxOf(req), t = X.t, C = X.C, d = validYmd(String(req.query.d || '')) ? String(req.query.d) : Z.ymd(Z.todayLocal());
    const town = C.towns.find((x) => x.slug === req.query.town) || C.towns.find((x) => x.slug === 'lafayette') || null;
    const where = town ? { lat: town.lat, lng: town.lng, name: town.slug } : undefined;
    const list = await Z.dayTimes(local(d), where), hd = await Z.hebrewDate(local(d));
    const next = (n) => { const x = local(d); x.setDate(x.getDate() + n); return Z.ymd(x); };
    const body = `<section class="wrap sec narrow"><h1>${esc(t('Daily prayer times (zmanim)'))}</h1>
<p class="lead-d">${esc(X.longDate(d))} · ${esc(X.lang === 'he' ? hd.he : X.lang === 'ru' ? `${hd.day} ${t(hd.month)} ${hd.year}` : hd.en)}${town ? ' · ' + esc(town.name) : ''}</p>
<form class="card tool" method="get" action="/tools/zmanim"><div class="fields"><label>${esc(t('Date'))} <input type="date" name="d" value="${esc(d)}"></label>
<label>${esc(t('Town'))} <select name="town">${C.towns.map((x) => `<option value="${x.slug}"${town && town.slug === x.slug ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label></div><button class="btn ghost" type="submit">${esc(t('Show times'))}</button></form>
<table class="tbl"><tbody>${list.map(([, label, time]) => `<tr><td>${esc(t(label))}</td><td><strong>${esc(Z.fmtTime(time, { en: 'en-US', he: 'he-IL', ru: 'ru-RU' }[X.lang]))}</strong></td></tr>`).join('')}</tbody></table>
<p class="btns"><a class="btn ghost" href="/tools/zmanim?d=${next(-1)}${town ? '&town=' + town.slug : ''}">← ${esc(t('Previous day'))}</a><a class="btn ghost" href="/tools/zmanim?d=${next(1)}${town ? '&town=' + town.slug : ''}">${esc(t('Next day'))} →</a></p>
<p class="muted">${esc(t('Times follow the Chabad custom (the Alter Rebbe, author of the Tanya). Give yourself a few minutes of margin.'))} <a href="/shabbat">${esc(t('Shabbat times'))}</a></p></section>`;
    await render(res, { path: '/tools/zmanim', noindex: !!(req.query.d || req.query.town), title: t('Zmanim: daily prayer times for Lafayette, Moraga and Orinda'), description: t('Today\'s Jewish prayer times for Lafayette, Moraga and Orinda: dawn, sunrise, latest Shema, midday, Mincha, sunset and nightfall, by the Chabad custom.'), body });
  }));

  // ---------- Hebrew birthday ----------
  r.get('/tools/hebrew-birthday', wrap(async (req, res) => {
    const X = ctxOf(req), t = X.t, d = String(req.query.d || ''), night = req.query.night === '1';
    let out = '';
    if (validYmd(d)) {
      const p = H.hebrewOf(d, night), rows = []; let from = Z.ymd(Z.todayLocal());
      for (let i = 0; i < 5; i++) { const n = H.next({ day: p.day, month: p.month }, from); if (!n) break; rows.push(n); from = H.addDays(n.date, 1); }
      const heb = X.lang === 'he' ? H.label(p, true) : X.lang === 'ru' ? `${p.day} ${t(p.month)}` : H.label(p);
      out = `<div class="card answer" id="answer"><p>${esc(t('Your Hebrew birthday is'))}</p><p class="big">${esc(heb)}</p>
<table class="tbl"><tbody>${rows.map((n) => `<tr><td>${esc(X.longDate(n.date))}</td></tr>`).join('')}</tbody></table>
<p class="btns"><a class="btn gold" href="/tehillim?b=${esc(d)}${night ? '&night=1' : ''}#birthday">${esc(t('Your Tehillim chapter'))}</a><a class="btn ghost" href="/sponsor?o=birthday">${esc(t('Sponsor a Kiddush for your birthday'))}</a><a class="btn ghost" href="/account">${esc(t('Save it and get a reminder every year'))}</a></p></div>`;
    }
    await render(res, { path: '/tools/hebrew-birthday', noindex: !!d, title: t('Hebrew birthday calculator'), description: t('Find your Hebrew birthday and when it falls in the next five years, your birthday Tehillim chapter, and how to celebrate it.'),
      body: `<section class="wrap sec narrow"><h1>${esc(t('Hebrew birthday calculator'))}</h1><p class="lead-d">${esc(t('Your Hebrew birthday is a personal Rosh Hashanah, a day of blessing. Enter your date of birth:'))}</p>${form(X, '/tools/hebrew-birthday', d, night)}${out}
<p class="muted"><a href="/learn/hebrew-birthday">${esc(t('How to celebrate a Hebrew birthday'))}</a></p></section>` });
  }));

  r.get('/tools/hebrew-date', wrap(async (req, res) => {
    const X = ctxOf(req), t = X.t, d = String(req.query.d || ''), night = req.query.night === '1';
    let out = '';
    if (validYmd(d)) {
      const h = await Z.hebrewDate(local(d), night);
      out = `<div class="card answer" id="answer"><p>${esc(X.longDate(d))}${night ? ' ' + esc(t('(after sunset)')) : ''} =</p><p class="big">${esc(X.lang === 'he' ? h.he : X.lang === 'ru' ? `${h.day} ${t(h.month)} ${h.year}` : h.en)}</p>${X.lang !== 'he' ? `<p class="he" lang="he">${esc(h.he)}</p>` : ''}</div>`;
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
      out = `<div class="card answer" id="answer"><p>${esc(t('Passing on {date}: Hebrew date {hebrew} {year}.', { date: X.longDate(d), hebrew: heb, year: p.year }))}</p>
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
      // The Torah portion read on the Shabbat on or right after the Bar/Bat Mitzvah (the one the boy reads or is called up for).
      const sh = await Z.thisShabbat(new Date(m.date + 'T20:00:00Z')).catch(() => ({})), ps = sh.parsha, P = require('./parsha.js');
      const first = ps ? (P.portionsOf(ps.title)[0] || null) : null, psName = ps ? (X.lang === 'he' ? ps.titleHe : t(ps.title)) : '';
      out = `<div class="card answer" id="answer"><p>${esc(girl ? t('Bat Mitzvah (age 12)') : t('Bar Mitzvah (age 13)'))}:</p><p class="big">${esc(X.longDate(m.date))}</p><p><span class="he" lang="he">${esc(m.he)}</span></p><p class="muted">${esc(t('It begins the evening before at sunset.'))}</p>
${ps ? `<div class="parsha-answer"><p class="hand">${esc(t('Your Torah portion'))}</p><p class="big">${esc(psName)}</p><p class="muted">${esc(t('Read on Shabbat, {date}', { date: X.longDate(sh.parsha.date || (sh.havdalah && sh.havdalah.date) || m.date) }))}</p>${first ? `<p><a href="/parsha/${P.slugOf(first.name)}">${esc(t('What this portion is about'))} →</a></p>` : ''}</div>` : ''}<p class="btns"><a class="btn gold" href="#start">${esc(t('Start preparing with the Rabbi'))}</a></p></div>`;
      // Straight on to the sign-up, on this page, with the birthday and Bar or Bat Mitzvah already filled in.
      const f = (X.C.forms || []).find((x) => x.id === 'bar-bat-mitzvah');
      if (f) out += `<section class="start-prep" id="start"><p class="hand">${esc(t('Ready to begin?'))}</p><h2>${esc(t('Start preparing with the Rabbi'))}</h2><p>${esc(f.intro)}</p>
${require('./forms.js').formHtml(X, f, { 'children.0.birthday': d, type: girl ? '1' : '0', message: night ? t('Born after sunset.') : '' })}
<p class="muted">${esc(t('Questions? Call {phone}.', { phone: X.C.org.phone }))}</p></section>`;
    }
    const extra = `<fieldset class="radios"><legend>${esc(t('For'))}</legend><label><input type="radio" name="g" value="boy"${girl ? '' : ' checked'}> ${esc(t('Boy (Bar Mitzvah, 13)'))}</label><label><input type="radio" name="g" value="girl"${girl ? ' checked' : ''}> ${esc(t('Girl (Bat Mitzvah, 12)'))}</label></fieldset>`;
    await render(res, { path: '/tools/bar-bat-mitzvah', noindex: !!d, title: t('Bar & Bat Mitzvah date and Torah portion'), description: t('Find the Hebrew date and the Torah portion (parshah) of a Bar Mitzvah (13) or Bat Mitzvah (12) from the birth date, past or future.'),
      body: `<section class="wrap sec narrow"><h1>${esc(t('Find your Bar or Bat Mitzvah parshah'))}</h1><p class="lead-d">${esc(t('A boy becomes Bar Mitzvah on his 13th Hebrew birthday, a girl becomes Bat Mitzvah on her 12th. Enter the birth date to see the date and the Torah portion. It works for a past Bar Mitzvah too: find the parshah of your own.'))}</p>${form(X, '/tools/bar-bat-mitzvah', d, night, extra)}${out}</section>` });
  }));
}
module.exports = { mountTools, validYmd };
