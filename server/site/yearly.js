// Pages people search for every year, computed from the Jewish calendar (nothing typed by hand):
// /jewish-holidays-<year>: every holiday with its date, Hebrew date, when it begins and candle lighting in Lafayette;
// /shabbat-times (Lafayette) and /shabbat-times/<town>: candle lighting and Shabbat ending for the next 12 months.
'use strict';
const { esc } = require('./md.js');
const Z = require('./zmanim.js');
const { fmtClock } = require('./content.js');

// [name shown, first day, last day, guide page, how it begins]
const HOLIDAYS = [
  ['Tu BiShvat', /^Tu BiShvat$/, null, 'tu-bishvat', 'eve'],
  ['Fast of Esther', /^Ta'anit Esther$/, null, null, 'dawn'],
  ['Purim', /^Purim$/, null, 'purim', 'eve'],
  ['Shushan Purim', /^Shushan Purim$/, null, 'purim', 'eve'],
  ['Passover', /^Pesach I$/, /^Pesach VIII$/, 'passover', 'eve'],
  ['Yom HaShoah (Holocaust Remembrance Day)', /^Yom HaShoah$/, null, null, 'eve'],
  ['Yom HaAtzmaut (Israel Independence Day)', /^Yom HaAtzma'ut$/, null, null, 'eve'],
  ['Pesach Sheni', /^Pesach Sheni$/, null, null, 'eve'],
  ['Lag BaOmer', /^Lag BaOmer$/, null, 'lag-baomer', 'eve'],
  ['Shavuot', /^Shavuot I$/, /^Shavuot II$/, 'shavuot', 'eve'],
  ['Fast of the 17th of Tammuz', /^Tzom Tammuz$/, null, null, 'dawn'],
  ["Tisha B'Av", /^Tish'a B'Av$/, null, 'tisha-bav', 'eve'],
  ["Tu B'Av", /^Tu B'Av$/, null, null, 'eve'],
  ['Rosh Hashanah', /^Rosh Hashana \d+$/, /^Rosh Hashana II$/, 'rosh-hashanah', 'eve'],
  ['Fast of Gedaliah', /^Tzom Gedaliah$/, null, null, 'dawn'],
  ['Yom Kippur', /^Yom Kippur$/, null, 'yom-kippur', 'eve'],
  ['Sukkot', /^Sukkot I$/, /^Sukkot VII \(Hoshana Raba\)$/, 'sukkot', 'eve'],
  ['Shemini Atzeret', /^Shmini Atzeret$/, null, 'simchat-torah', 'eve'],
  ['Simchat Torah', /^Simchat Torah$/, null, 'simchat-torah', 'eve'],
  ['Chanukah', /^Chanukah: 1 Candle$/, /^Chanukah: 8th Day$/, 'chanukah', 'night'],
  ['Fast of the 10th of Tevet', /^Asara B'Tevet$/, null, null, 'dawn'],
];
// The guide of the week: every other week one of the local Lamorinda guides, otherwise any guide.
function guideOfWeek(C, now = Date.now()) {
  const week = Math.floor(now / (7 * 864e5)), local = C.learn.filter((a) => a.category === 'Lamorinda');
  const list = week % 2 === 0 && local.length ? local : C.learn;
  return list.length ? list[Math.floor(week / 2) % list.length] : null;
}
const day = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const minus1 = (s) => { const d = day(s); d.setDate(d.getDate() - 1); return Z.ymd(d); };

async function holidaysOf(year) {
  // Look a little past December so Chanukah's last days and a late-December start are complete.
  const list = await Z.events(new Date(year, 0, 1), new Date(year + 1, 0, 10));
  const out = [];
  for (const [name, startRe, endRe, page, begins] of HOLIDAYS) {
    for (const s of list.filter((e) => startRe.test(e.desc) && e.date.startsWith(String(year)))) {
      const end = endRe ? list.find((e) => endRe.test(e.desc) && e.date >= s.date) : null;
      const eve = begins === 'night' ? s.date : minus1(s.date);
      const candles = begins === 'eve' ? list.find((e) => e.cat === 'candles' && e.date === eve) : null;
      out.push({ name, page, begins, date: s.date, end: end ? end.date : null, eve, candles, hd: await Z.hebrewDate(begins === 'night' ? new Date(day(s.date).getTime() + 864e5) : day(s.date)) });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// Every time for the next time a holiday comes: candle lighting each evening, when it ends, the Chanukah nights,
// fast and chametz times (for Lafayette).
const ZMAN = { 'Fast begins': 'Fast begins', 'Fast ends': 'Fast ends', 'Finish eating chametz': 'Finish eating chametz', 'Biur Chametz': 'Burn the chametz by' };
async function holidayTimes(slug, today = Z.ymd(Z.todayLocal())) {
  const y = +today.slice(0, 4), list = [...await holidaysOf(y), ...await holidaysOf(y + 1)].filter((h) => h.page === slug && (h.end || h.date) >= today);
  if (!list.length) return null;
  const first = list[0], same = list.filter((h) => h.date <= Z.ymd(new Date(day(first.date).getTime() + 10 * 864e5)));
  const from = minus1(first.date) < first.eve ? minus1(first.date) : first.eve, to = same.map((h) => h.end || h.date).sort().pop();
  const evs = await Z.events(day(from), new Date(day(to).getTime() + 864e5));
  const rows = evs.filter((e) => e.time && e.date >= from && e.date <= to && (e.cat === 'candles' || e.cat === 'havdalah' || /^Chanukah: \d/.test(e.desc) || (ZMAN[e.desc] && !(slug === 'passover' && /^Fast/.test(e.desc)))));
  return { year: first.date.slice(0, 4), rows };
}

function mountYearly(r, { render, wrap, ctxOf, base, upcoming = () => [] }) {
  const thisYear = () => Z.todayLocal().getFullYear();
  r.get('/jewish-holidays', (req, res) => res.redirect(302, ctxOf(req).path('/jewish-holidays-' + thisYear())));
  r.get('/jewish-holidays-:year', wrap(async (req, res, next) => {
    const year = Number(req.params.year), now = thisYear();
    if (!/^\d{4}$/.test(req.params.year) || year < now - 1 || year > now + 2) return next();
    const X = ctxOf(req), t = X.t, C = X.C, list = await holidaysOf(year);
    const hdText = (hd) => (X.lang === 'he' ? hd.he : X.lang === 'ru' ? `${hd.day} ${t(hd.month)} ${hd.year}` : hd.en);
    const evs = (h) => C.events.filter((e) => e.published && e.holiday === h.page && e.start.slice(0, 4) === String(year));
    const rows = list.map((h) => `<tr><td><strong>${h.page ? `<a href="/holidays/${h.page}">${esc(t(h.name))}</a>` : esc(t(h.name))}</strong><br><span class="muted">${esc(hdText(h.hd))}</span></td>
<td>${esc(X.shortDate(h.date))}${h.end && h.end !== h.date ? ` – ${esc(X.shortDate(h.end))}` : ''}</td>
<td>${h.begins === 'dawn' ? esc(t('Fast begins at dawn')) : h.begins === 'night' ? esc(t('First candle the evening of {date}', { date: X.shortDate(h.eve) })) : esc(t('Begins at sundown, {date}', { date: X.shortDate(h.eve) }))}${h.candles ? `<br>${esc(t('Candle lighting'))} <strong>${esc(X.tm(h.candles))}</strong>` : ''}</td>
<td>${evs(h).map((e) => `<a href="/events/${e.slug}">${esc(e.title)}</a>`).join('<br>')}</td></tr>`).join('');
    const body = `<section class="wrap sec"><h1>${esc(t('Jewish holidays {year}', { year }))}</h1>
<p class="lead-d">${esc(t('Every Jewish holiday in {year} with its date, Hebrew date and candle lighting time for Lafayette, Moraga and Orinda. Jewish holidays begin at sundown the evening before.', { year }))}</p>
<p class="btns">${year > now - 1 ? `<a class="btn ghost" href="/jewish-holidays-${year - 1}">← ${year - 1}</a>` : ''}${year < now + 2 ? `<a class="btn ghost" href="/jewish-holidays-${year + 1}">${year + 1} →</a>` : ''}<a class="btn ghost" href="/shabbat-times">${esc(t('Shabbat times'))}</a><a class="btn ghost" href="/events.ics">${esc(t('Add calendar to my phone'))}</a></p>
<div class="tbl-wrap"><table class="tbl"><thead><tr><th>${esc(t('Holiday'))}</th><th>${esc(t('Date'))}</th><th>${esc(t('Begins'))}</th><th>${esc(t('Celebrate with us'))}</th></tr></thead><tbody>${rows}</tbody></table></div>
<p>${esc(t('Celebrate every holiday with Chabad of Lamorinda in Lafayette. No membership is needed and everyone is welcome.'))} <a href="/holidays">${esc(t('Holiday guides'))}</a> · <a href="/events">${esc(t('Upcoming events'))}</a> · <a href="/learn/jewish-year-in-lamorinda">${esc(t('The Jewish year in Lamorinda'))}</a></p></section>`;
    await render(res, { path: '/jewish-holidays-' + year, title: t('Jewish holidays {year}: dates and candle lighting times in Lafayette', { year }), description: t('Dates of every Jewish holiday in {year}: Rosh Hashanah, Yom Kippur, Sukkot, Chanukah, Purim, Passover, Shavuot and more, with candle lighting in Lafayette, Moraga and Orinda.', { year }), body,
      ld: [{ '@context': 'https://schema.org', '@type': 'ItemList', name: 'Jewish holidays ' + year, itemListElement: list.map((h, i) => ({ '@type': 'ListItem', position: i + 1, name: `${h.name}: ${h.date}${h.end && h.end !== h.date ? ' to ' + h.end : ''}`, ...(h.page ? { url: base + X.path('/holidays/' + h.page) } : {}) })) }] });
  }));

  const timesPage = (town) => wrap(async (req, res, next) => {
    const X = ctxOf(req), t = X.t, C = X.C, slug = town || req.params.town, tw = C.towns.find((x) => x.slug === slug);
    if (!tw) return next();
    if (!town && slug === 'lafayette') return res.redirect(301, X.path('/shabbat-times'));
    const today = Z.todayLocal(), end = new Date(today); end.setDate(end.getDate() + 372);
    const list = await Z.events(today, end, { lat: tw.lat, lng: tw.lng, name: tw.slug });
    const rows = list.filter((e) => e.cat === 'candles').map((c) => {
      const h = list.find((e) => e.cat === 'havdalah' && e.date > c.date);
      const p = list.find((e) => e.cat === 'parashat' && e.date > c.date && e.date <= Z.ymd(new Date(day(c.date).getTime() + 2 * 864e5)));
      const hol = list.find((e) => e.date > c.date && e.date <= Z.ymd(new Date(day(c.date).getTime() + 864e5)) && /holiday/.test(e.cat) && !/^Erev/.test(e.desc));
      const what = p && day(c.date).getDay() === 5 ? `<a href="/parsha">${esc(X.hc(p))}</a>` : hol ? esc(X.hc(hol)) : '';
      return `<tr><td>${esc(X.shortDate(c.date))}</td><td>${what}</td><td><strong>${esc(X.tm(c))}</strong></td><td>${h ? `${esc(X.tm(h))} <span class="muted">(${esc(X.shortDate(h.date))})</span>` : ''}</td></tr>`;
    }).join('');
    const others = C.towns.filter((x) => x.slug !== tw.slug).map((x) => `<a class="chip" href="${x.slug === 'lafayette' ? '/shabbat-times' : '/shabbat-times/' + x.slug}">${esc(x.name)}</a>`).join('');
    const name = tw.name, path = town ? '/shabbat-times' : '/shabbat-times/' + tw.slug;
    const body = `<section class="wrap sec narrow"><h1>${esc(t('Shabbat candle lighting times in {town}', { town: name }))}</h1>
<p class="lead-d">${esc(t('Candle lighting (18 minutes before sunset) and the time Shabbat and holidays end in {town}, California, for the next twelve months.', { town: name }))}</p>
<p class="chips">${others}</p>
<div class="tbl-wrap"><table class="tbl"><thead><tr><th>${esc(t('Date'))}</th><th>${esc(t('Shabbat or holiday'))}</th><th>${esc(t('Candle lighting'))}</th><th>${esc(t('Ends'))}</th></tr></thead><tbody>${rows}</tbody></table></div>
<p>${esc(t('Join us for Shabbat at Chabad of Lamorinda, 3477 Golden Gate Way, Lafayette: Kabbalat Shabbat on Friday evening and services with a Kiddush lunch on Saturday.'))}</p>
<p class="btns"><a class="btn gold" href="/shabbat">${esc(t('Shabbat services and Kiddush'))}</a><a class="btn ghost" href="/forms/shabbat-meal">${esc(t('Shabbat dinner with the Rabbi'))}</a><a class="btn ghost" href="/learn/shabbat-candles">${esc(t('How to light Shabbat candles'))}</a></p></section>`;
    await render(res, { path, title: t('Shabbat times {town}: candle lighting and Havdalah', { town: name }), description: t('Shabbat candle lighting and Havdalah times for {town}, CA for the next twelve months, from Chabad of Lamorinda in Lafayette.', { town: name }), body });
  });
  // This week in Jewish Lamorinda: a page that renews itself every week (fresh content, easy to share).
  r.get('/this-week', wrap(async (req, res) => {
    const X = ctxOf(req), t = X.t, C = X.C, today = Z.todayLocal(), end = new Date(today); end.setDate(end.getDate() + 7);
    const { portionsOf } = require('./parsha.js');
    const towns = await Promise.all(C.towns.map(async (tw) => [tw, await Z.thisShabbat(new Date(), { lat: tw.lat, lng: tw.lng, name: tw.slug })]));
    const sh = towns.length ? towns[0][1] : await Z.thisShabbat(), ps = sh.parsha ? portionsOf(sh.parsha.title) : [];
    const cal = (await Z.events(today, end)).filter((e) => !['candles', 'havdalah', 'parashat'].includes(e.cat) && !/^(Chanukah: \d|Omer)/.test(e.desc) || /Chanukah: 1 Candle/.test(e.desc));
    const evs = upcoming(new Date(), C).filter((e) => e.start.slice(0, 10) <= Z.ymd(end));
    const L = (p) => p[X.lang] || p.en, guide = guideOfWeek(C), ks = C.org.kabbalatShabbat ? await Z.kabbalatShabbat(C.org.kabbalatShabbat) : null;
    const body = `<section class="wrap sec narrow"><h1>${esc(t('This week in Jewish Lamorinda'))}</h1>
<p class="lead-d">${esc(t('Shabbat times, the Torah portion, events and Jewish dates for Lafayette, Moraga, Orinda and nearby, updated every week.'))}</p>
<h2>${esc(t('Shabbat'))}${sh.parsha ? ': ' + esc(X.hc(sh.parsha)) : ''}</h2>
<div class="tbl-wrap"><table class="tbl"><thead><tr><th>${esc(t('Town'))}</th><th>${esc(t('Candle lighting'))}</th><th>${esc(t('Ends'))}</th></tr></thead><tbody>${towns.map(([tw, s]) => `<tr><td><a href="/jewish-${tw.slug}">${esc(tw.name)}</a></td><td><strong>${s.candles ? esc(X.tm(s.candles)) : ''}</strong>${s.candles ? ` <span class="muted">${esc(X.shortDate(s.candles.date))}</span>` : ''}</td><td>${s.havdalah ? esc(X.tm(s.havdalah)) : ''}</td></tr>`).join('')}</tbody></table></div>
${ps.map((p) => `<div class="card"><h3><a href="/parsha">${esc(X.lang === 'he' ? 'פרשת ' + p.hebrew : t('Parashat ' + p.name))}</a></h3><p>${esc(L(p).summary)}</p><p><strong>${esc(t('A lesson for today'))}:</strong> ${esc(L(p).lesson)}</p></div>`).join('')}
${ks ? `<p class="lead-d"><strong>${esc(t('Kabbalat Shabbat at Chabad of Lamorinda: {time}', { time: fmtClock(ks, X.lang) }))}</strong></p>` : ''}
<p class="btns"><a class="btn gold" href="/shabbat">${esc(t('Shabbat services and Kiddush'))}</a><a class="btn ghost" href="/forms/shabbat-meal">${esc(t('Shabbat dinner with the Rabbi'))}</a></p>
<h2>${esc(t('Coming up at Chabad of Lamorinda'))}</h2>
${evs.length ? `<ul class="list">${evs.map((e) => `<li><a href="/events/${e.slug}"><strong>${esc(e.title)}</strong></a><br><span class="muted">${esc(X.when(e))}</span></li>`).join('')}</ul>` : ''}
<ul class="list">${C.org.weekly.map((w) => `<li><strong>${esc(w.day)}</strong>: ${w.link ? `<a href="${esc(w.link)}">${esc(w.name)}</a>` : esc(w.name)} <span class="muted">${esc(w.time)}</span></li>`).join('')}</ul>
${cal.length ? `<h2>${esc(t('Jewish dates this week'))}</h2><ul class="list">${cal.map((e) => `<li><strong>${esc(X.shortDate(e.date))}</strong>: ${esc(X.hc(e))}</li>`).join('')}</ul>` : ''}
${guide ? `<h2>${esc(t('Guide of the week'))}</h2><a class="card tile" href="/learn/${guide.slug}"><h3>${esc(guide.title)}</h3><p>${esc(guide.description)}</p></a>` : ''}
<p class="btns"><a class="btn gold" href="/mitzvah">${esc(t('Do a mitzvah this week'))}</a><a class="btn ghost" href="/forms/newsletter">${esc(t('Get it by email every week'))}</a><a class="btn ghost" href="/sponsor">${esc(t('Sponsor in honor or memory'))}</a><a class="btn ghost" href="/shabbat-times">${esc(t('Shabbat times for the whole year'))}</a></p></section>`;
    await render(res, { path: '/this-week', title: t('This week in Jewish Lamorinda: Shabbat times, parsha and events'), description: t('This week\'s Shabbat candle lighting in Lafayette, Moraga and Orinda, the Torah portion, Jewish dates and events at Chabad of Lamorinda.'), body });
  }));
  r.get('/shabbat-times', timesPage('lafayette'));
  r.get('/shabbat-times/:town', timesPage(null));
  return { paths: (C) => ['/this-week', '/shabbat-times', ...C.towns.filter((x) => x.slug !== 'lafayette').map((x) => '/shabbat-times/' + x.slug), '/jewish-holidays-' + thisYear(), '/jewish-holidays-' + (thisYear() + 1)] };
}
module.exports = { mountYearly, holidaysOf, guideOfWeek, holidayTimes, ZMAN };
