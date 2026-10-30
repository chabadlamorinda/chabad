// The weekly Torah portion: /parsha shows this Shabbat's portion (summary and a lesson for today, in the visitor's
// language) with this week's Shabbat times; /parsha/<name> has a page for each of the 54 portions.
// Summaries live in site/content/parshiot.json (English, Hebrew and Russian in one file).
'use strict';
const fs = require('fs');
const path = require('path');
const { esc } = require('./md.js');
const Z = require('./zmanim.js');
const { guideCards, guidesForDays } = require('./links.js');
// Guides about the Torah reading, under every Torah portion.
const TORAH_GUIDES = ['weekly-parsha', 'torah-reading', 'haftarah'];
const torahGuides = (C) => TORAH_GUIDES.map((s) => C.learn.find((a) => a.slug === s)).filter(Boolean);

const FILE = path.join(__dirname, '..', '..', 'site', 'content', 'parshiot.json');
const slugOf = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
let cache = null;
function all() {
  if (cache) return cache;
  try { cache = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { cache = []; }
  return cache;
}
// "Parashat Matot-Masei" -> [Matot, Masei]; "Parashat Lech-Lecha" -> [Lech-Lecha].
function portionsOf(title) {
  const name = String(title || '').replace(/^Parashat\s+/, ''), list = all();
  const one = list.find((p) => p.name === name);
  if (one) return [one];
  const parts = name.split('-'), out = [];
  for (let i = 1; i < parts.length; i++) {
    const a = list.find((p) => p.name === parts.slice(0, i).join('-')), b = list.find((p) => p.name === parts.slice(i).join('-'));
    if (a && b) return [a, b];
  }
  return out;
}

function mountParsha(r, { render, wrap, ctxOf, base }) {
  const block = (X, p) => {
    const L = p[X.lang] || p.en, t = X.t;
    return `<section class="card parsha"><p class="eyebrow">${esc(t(p.book))} · <span dir="ltr">${esc(p.verses)}</span></p>
<h2>${esc(X.lang === 'he' ? 'פרשת ' + p.hebrew : t('Parashat ' + p.name))}${X.lang === 'he' ? '' : ` <span class="he" lang="he">${esc(p.hebrew)}</span>`}</h2>
<p>${esc(L.summary)}</p><h3>${esc(t('A lesson for today'))}</h3><p>${esc(L.lesson)}</p></section>`;
  };
  r.get('/parsha', wrap(async (req, res) => {
    const X = ctxOf(req), t = X.t, sh = await Z.thisShabbat(), ps = sh.parsha ? portionsOf(sh.parsha.title) : [];
    const today = Z.todayLocal(), end = new Date(today); end.setDate(end.getDate() + 7);
    const guides = [...new Set([...torahGuides(X.C), ...guidesForDays(X.C, await Z.events(today, end))])].slice(0, 6);
    const body = `<section class="wrap sec narrow"><h1>${esc(t("This week's Torah portion"))}</h1>
${sh.parsha ? `<p class="lead-d">${esc(X.hc(sh.parsha))} · ${esc(X.longDate(sh.parsha.date))}</p>` : `<p class="lead-d">${esc(t('This Shabbat is a holiday, with a special Torah reading.'))}</p>`}
${ps.map((p) => block(X, p)).join('')}
${sh.candles ? `<p class="card">${esc(t('Candle lighting, {date}', { date: X.shortDate(sh.candles.date) }))}: <strong>${esc(X.tm(sh.candles))}</strong>${sh.havdalah ? ` · ${esc(t('Shabbat ends {time}, {date}', { time: X.tm(sh.havdalah), date: X.shortDate(sh.havdalah.date) }))}` : ''}</p>` : ''}
<p class="btns"><a class="btn gold" href="/shabbat">${esc(t('Shabbat services and Kiddush'))}</a><a class="btn ghost" href="/programs/adult-education">${esc(t('Torah classes'))}</a><a class="btn ghost" href="/subscribe">${esc(t('Get it by email every week'))}</a></p>
${guideCards(X, guides, t('Learn more'))}
<h2>${esc(t('All the Torah portions'))}</h2><p class="chips">${all().map((p) => `<a class="chip" href="/parsha/${slugOf(p.name)}">${esc(X.lang === 'he' ? p.hebrew : t('Parashat ' + p.name).replace(/^(Parashat|Недельная глава)\s+/, ''))}</a>`).join('')}</p></section>`;
    await render(res, { path: '/parsha', title: t("This week's Torah portion (parsha)"), description: t('The weekly Torah portion: a short summary, a lesson for today, and this week\'s Shabbat candle lighting times in Lafayette, from Chabad of Lamorinda.'), body });
  }));
  r.get('/parsha/:slug', wrap(async (req, res, next) => {
    const X = ctxOf(req), t = X.t, p = all().find((x) => slugOf(x.name) === req.params.slug);
    if (!p) return next();
    const i = all().indexOf(p), prev = all()[i - 1], nxt = all()[i + 1];
    const body = `<article class="wrap sec narrow"><p class="crumbs"><a href="/parsha">${esc(t("This week's Torah portion"))}</a> ›</p>
<h1>${esc(X.lang === 'he' ? 'פרשת ' + p.hebrew : t('Parashat ' + p.name))}</h1>${block(X, p)}
${guideCards(X, torahGuides(X.C), t('Learn more'))}
<p class="btns">${prev ? `<a class="btn ghost" href="/parsha/${slugOf(prev.name)}">← ${esc(X.lang === 'he' ? prev.hebrew : prev.name)}</a>` : ''}${nxt ? `<a class="btn ghost" href="/parsha/${slugOf(nxt.name)}">${esc(X.lang === 'he' ? nxt.hebrew : nxt.name)} →</a>` : ''}</p></article>`;
    const L = p[X.lang] || p.en;
    await render(res, { path: '/parsha/' + slugOf(p.name), title: t('Parashat {name}: summary and lesson', { name: X.lang === 'he' ? p.hebrew : p.name }), description: L.summary.slice(0, 155), body,
      ld: [{ '@context': 'https://schema.org', '@type': 'Article', headline: 'Parashat ' + p.name, inLanguage: X.lang, articleBody: L.summary + ' ' + L.lesson, publisher: { '@id': base + '/#org' } }] });
  }));
}
// Daily study: today's Chitas (Chumash, Tehillim, Tanya), Rambam and more, with links to the text.
function mountDaily(r, { render, wrap, ctxOf }) {
  r.get('/daily-study', wrap(async (req, res) => {
    const X = ctxOf(req), t = X.t, day = Z.todayLocal(), list = await Z.dailyStudy(day), hd = await X.hebrewDate(day);
    const row = (x) => `<tr><td>${esc(t(x.label))}</td><td>${x.url ? `<a href="${esc(X.lang === 'he' ? x.url.replace('lang=bi', 'lang=he') : x.url)}" rel="noopener" target="_blank">${esc(X.lang === 'he' ? x.textHe : x.text)}</a>` : esc(x.text)}</td></tr>`;
    const chitas = list.filter((x) => ['chumash', 'psalms', 'tanyayomi'].includes(x.key)), rambam = list.filter((x) => /^rambam|seferhamitzvot/.test(x.key)), more = list.filter((x) => ['dafyomi', 'mishnayomi', 'nachyomi'].includes(x.key));
    const body = `<section class="wrap sec narrow"><h1>${esc(t("Today's daily study"))}</h1><p class="lead-d">${esc(X.longDate(Z.ymd(day)))} · ${esc(hd)}</p>
<p>${esc(t('The Lubavitcher Rebbe encouraged every Jew to learn a little every day. Chitas (Chumash, Tehillim and Tanya) and Rambam keep Jews around the world learning the same thing on the same day.'))}</p>
<h2>${esc(t('Chitas'))}</h2><table class="tbl"><tbody>${chitas.map(row).join('')}</tbody></table>
<h2>${esc(t('Rambam'))}</h2><table class="tbl"><tbody>${rambam.map(row).join('')}</tbody></table>
<h2>${esc(t('More daily learning'))}</h2><table class="tbl"><tbody>${more.map(row).join('')}</tbody></table>
<p class="btns"><a class="btn gold" href="/programs/adult-education">${esc(t('Learn with us: Torah classes'))}</a><a class="btn ghost" href="/learn/daily-torah-study">${esc(t('How to start a daily study habit'))}</a></p></section>`;
    await render(res, { path: '/daily-study', title: t("Today's daily study: Chitas, Rambam, Daf Yomi"), description: t("Today's Chumash, Tehillim, Tanya, Rambam, Sefer HaMitzvot and Daf Yomi, with links to the text. From Chabad of Lamorinda."), body });
  }));
}

// Monthly Jewish calendar: holidays, Rosh Chodesh, fasts, Shabbat times and our events, day by day.
// The calendar (/calendar): a month of everything at Chabad of Lamorinda. Every event (with its page and a direct RSVP or
// sign-up link), the weekly schedule (Hebrew School, classes, Kabbalat Shabbat at that week's time, Shabbat services,
// with the program's registration form), holidays, candle lighting and the parsha. A grid on computers, a list on phones.
const DAYS = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
function mountCalendar(r, { render, wrap, ctxOf }) {
  const { fmtClock } = require('./content.js');
  r.get('/calendar', wrap(async (req, res) => {
    const X = ctxOf(req), t = X.t, C = X.C, today = Z.todayLocal(), todayYmd = Z.ymd(today);
    const m = /^(\d{4})-(\d{2})$/.exec(String(req.query.m || '')), y = m ? +m[1] : today.getFullYear(), mo = m ? +m[2] : today.getMonth() + 1;
    if (y < 2000 || y > 2100 || mo < 1 || mo > 12) return res.redirect(302, X.path('/calendar'));
    const ym = `${y}-${String(mo).padStart(2, '0')}`, last = new Date(y, mo, 0).getDate(), list = await Z.events(new Date(y, mo - 1, 1), new Date(y, mo - 1, last));
    const day = (d) => `${ym}-${String(d).padStart(2, '0')}`, items = new Map();
    const add = (d, it) => { if (!items.has(d)) items.set(d, []); items.get(d).push(it); };
    const formFor = (link) => { const pm = /^\/programs\/([a-z-]+)/.exec(link || ''); const f = pm && (C.forms || []).find((x) => x.program === pm[1]); return f ? { href: '/forms/' + f.id, label: f.button || t('Sign up') } : null; };
    // events (a multi-day event shows on each of its days)
    for (const e of C.events.filter((x) => x.published)) {
      const from = e.start.slice(0, 10), to = (e.end || e.start).slice(0, 10);
      for (let d = 1; d <= last; d++) if (day(d) >= from && day(d) <= to) add(day(d), { kind: 'ev', cat: e.category || '', sort: day(d) === from ? e.start.slice(11, 16) : '00:00', time: day(d) === from ? fmtClock(e.start.slice(11, 16), X.lang) : '', title: e.title, href: '/events/' + e.slug,
        place: e.loc && e.loc.name, act: e.rsvp ? { href: '/events/' + e.slug + '#rsvp', label: t('RSVP') } : null });
    }
    // the weekly schedule
    const rule = C.org.kabbalatShabbat || null, fridays = new Map(list.filter((e) => e.cat === 'candles').map((e) => [e.date, e]));
    // Yom Tov days (no weekly classes or Hebrew School then; the holiday page has its own schedule).
    const YOMTOV = /^(Rosh Hashana( \d+| II)|Yom Kippur|Sukkot I{1,2}$|Shmini Atzeret|Simchat Torah|Pesach (I|II|VII|VIII)$|Shavuot (I|II)$)/;
    const yomtov = new Set(list.filter((e) => e.cat === 'holiday' && YOMTOV.test(e.desc)).map((e) => e.date));
    for (const w of C.org.weekly || []) {
      const dow = DAYS[w.byDay]; if (dow == null) continue;
      for (let d = 1; d <= last; d++) {
        if (new Date(y, mo - 1, d).getDay() !== dow || yomtov.has(day(d))) continue;
        let hhmm = w.startTime || '';
        if (w.byDay === 'Friday' && rule && w.link === '/shabbat') { /* Kabbalat Shabbat moves with sunset */ const k = fridays.get(day(d)) && Z.kabbalatFor(rule, fridays.get(day(d))); if (k) hhmm = k; }
        add(day(d), { kind: 'wk', sort: hhmm || '99', time: hhmm ? fmtClock(hhmm, X.lang) : '', title: w.name, href: w.link || '/events', act: formFor(w.link) });
      }
    }
    // holidays, Shabbat times and the parsha
    for (const e of list) {
      if (e.cat === 'candles') add(e.date, { kind: 'sh', sort: '98', text: t('Candle lighting') + ' ' + X.tm(e) });
      else if (e.cat === 'havdalah') add(e.date, { kind: 'sh', sort: '99', text: (new Date(e.date + 'T12:00:00').getDay() === 6 ? t('Shabbat ends') : t('Ends')) + ' ' + X.tm(e) });
      else if (e.cat === 'parashat') add(e.date, { kind: 'pa', sort: '00:01', title: X.hc(e), href: '/parsha' });
      else if (/^Chanukah: \d/.test(e.desc)) { const n = /^Chanukah: (\d)/.exec(e.desc)[1]; add(e.date, { kind: 'hol', sort: '00:00', title: t('Chanukah: night {n}', { n }), href: '/holidays/chanukah' }); }
      else if (!/^Omer/.test(e.desc)) { const hs = Z.holidaySlug(e.desc); add(e.date, { kind: 'hol', sort: '00:00', title: X.hc(e), href: hs ? '/holidays/' + hs : '' }); }
    }
    for (const v of items.values()) v.sort((a, b) => (a.kind === 'hol' ? -1 : 0) - (b.kind === 'hol' ? -1 : 0) || String(a.sort).localeCompare(String(b.sort)));
    const chip = (it, full) => {
      if (it.kind === 'sh') return `<span class="ce sh">${esc(it.text)}</span>`;
      const name = `${it.time ? `<b>${esc(it.time)}</b> ` : ''}${esc(it.title)}`;
      const main = it.href ? `<a class="ce ${it.kind}${it.cat ? ' c-' + it.cat : ''}" href="${esc(it.href)}">${name}</a>` : `<span class="ce ${it.kind}">${name}</span>`;
      if (!full) return main + (it.act ? `<a class="ce-act" href="${esc(it.act.href)}">${esc(it.act.label)}</a>` : '');
      return `<div class="cl-item ${it.kind}">${main}${it.place && it.kind === 'ev' ? `<span class="muted">${esc(it.place)}</span>` : ''}${it.act ? `<a class="btn sm gold" href="${esc(it.act.href)}">${esc(it.act.label)}</a>` : ''}</div>`;
    };
    const loc = { en: 'en-US', he: 'he-IL', ru: 'ru-RU' }[X.lang];
    const wd = [...Array(7)].map((_, i) => new Intl.DateTimeFormat(loc, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 2, 1 + i))));
    const lead = new Date(y, mo - 1, 1).getDay(), cells = [];
    for (let i = 0; i < lead; i++) cells.push('<div class="cal-d out" aria-hidden="true"></div>');
    for (let d = 1; d <= last; d++) cells.push(`<div class="cal-d${day(d) === todayYmd ? ' today' : ''}"><span class="cal-n">${d}</span>${(items.get(day(d)) || []).map((it) => chip(it, false)).join('')}</div>`);
    while (cells.length % 7) cells.push('<div class="cal-d out" aria-hidden="true"></div>');
    const listView = [...items.keys()].sort().filter((d) => d >= (ym === todayYmd.slice(0, 7) ? todayYmd : '')).map((d) => `<div class="cl-day${d === todayYmd ? ' today' : ''}"><h3>${esc(X.shortDate(d))}</h3>${items.get(d).map((it) => chip(it, true)).join('')}</div>`).join('');
    const prev = mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`, next = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
    const monthName = new Intl.DateTimeFormat(loc, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, mo - 1, 15)));
    const body = `<section class="wrap sec cal-page"><h1>${esc(t('Calendar'))}</h1>
<p class="lead-d">${esc(t('Everything at Chabad of Lamorinda this month: events, classes, Shabbat and the holidays. Tap anything to see more or sign up.'))}</p>
<div class="cal-bar"><a class="btn ghost sm" href="/calendar?m=${prev}" aria-label="${esc(t('Previous month'))}">‹</a><h2>${esc(monthName)}</h2><a class="btn ghost sm" href="/calendar?m=${next}" aria-label="${esc(t('Next month'))}">›</a>
<span class="cal-legend"><span class="ce ev">${esc(t('Events'))}</span><span class="ce wk">${esc(t('Every week'))}</span><span class="ce hol">${esc(t('Holidays'))}</span></span></div>
<div class="cal-grid" role="grid" aria-label="${esc(monthName)}">${wd.map((w) => `<div class="cal-h" role="columnheader">${esc(w)}</div>`).join('')}${cells.join('')}</div>
<div class="cal-list">${listView || `<p class="muted">${esc(t('Nothing more this month.'))}</p>`}</div>
<p class="btns"><a class="btn ghost" href="/events">${esc(t('Upcoming events'))}</a><a class="btn ghost" href="/events.ics">${esc(t('Add calendar to my phone'))}</a><a class="btn ghost" href="/shabbat-times">${esc(t('Shabbat times for the whole year'))}</a></p></section>`;
    await render(res, { path: '/calendar', noindex: !!req.query.m, title: t('Calendar: events, classes and holidays in Lafayette, Moraga and Orinda'), description: t('The Chabad of Lamorinda calendar: events, weekly classes, Shabbat and Jewish holidays in Lafayette, Moraga and Orinda, with links to sign up.'), body });
  }));
}

module.exports = { mountParsha, mountCalendar, mountDaily, portionsOf, slugOf, all };
