// The weekly Torah portion: /parsha shows this Shabbat's portion (summary and a lesson for today, in the visitor's
// language) with this week's Shabbat times; /parsha/<name> has a page for each of the 54 portions.
// Summaries live in site/content/parshiot.json (English, Hebrew and Russian in one file).
'use strict';
const fs = require('fs');
const path = require('path');
const { esc } = require('./md.js');
const Z = require('./zmanim.js');

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
    const body = `<section class="wrap sec narrow"><h1>${esc(t("This week's Torah portion"))}</h1>
${sh.parsha ? `<p class="lead-d">${esc(X.hc(sh.parsha))} · ${esc(X.longDate(sh.parsha.date))}</p>` : `<p class="lead-d">${esc(t('This Shabbat is a holiday, with a special Torah reading.'))}</p>`}
${ps.map((p) => block(X, p)).join('')}
${sh.candles ? `<p class="card">${esc(t('Candle lighting, {date}', { date: X.shortDate(sh.candles.date) }))}: <strong>${esc(X.tm(sh.candles))}</strong>${sh.havdalah ? ` · ${esc(t('Shabbat ends {time}, {date}', { time: X.tm(sh.havdalah), date: X.shortDate(sh.havdalah.date) }))}` : ''}</p>` : ''}
<p class="btns"><a class="btn gold" href="/shabbat">${esc(t('Shabbat services and Kiddush'))}</a><a class="btn ghost" href="/programs/adult-education">${esc(t('Torah classes'))}</a><a class="btn ghost" href="/forms/newsletter">${esc(t('Get it by email every week'))}</a></p>
<h2>${esc(t('All the Torah portions'))}</h2><p class="chips">${all().map((p) => `<a class="chip" href="/parsha/${slugOf(p.name)}">${esc(X.lang === 'he' ? p.hebrew : t('Parashat ' + p.name).replace(/^(Parashat|Недельная глава)\s+/, ''))}</a>`).join('')}</p></section>`;
    await render(res, { path: '/parsha', title: t("This week's Torah portion (parsha)"), description: t('The weekly Torah portion: a short summary, a lesson for today, and this week\'s Shabbat candle lighting times in Lafayette, from Chabad of Lamorinda.'), body });
  }));
  r.get('/parsha/:slug', wrap(async (req, res, next) => {
    const X = ctxOf(req), t = X.t, p = all().find((x) => slugOf(x.name) === req.params.slug);
    if (!p) return next();
    const i = all().indexOf(p), prev = all()[i - 1], nxt = all()[i + 1];
    const body = `<article class="wrap sec narrow"><p class="crumbs"><a href="/parsha">${esc(t("This week's Torah portion"))}</a> ›</p>
<h1>${esc(X.lang === 'he' ? 'פרשת ' + p.hebrew : t('Parashat ' + p.name))}</h1>${block(X, p)}
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
function mountCalendar(r, { render, wrap, ctxOf, upcoming }) {
  r.get('/calendar', wrap(async (req, res) => {
    const X = ctxOf(req), t = X.t, today = Z.todayLocal();
    const m = /^(\d{4})-(\d{2})$/.exec(String(req.query.m || '')), y = m ? +m[1] : today.getFullYear(), mo = m ? +m[2] : today.getMonth() + 1;
    if (y < 2000 || y > 2100 || mo < 1 || mo > 12) return res.redirect(302, X.path('/calendar'));
    const start = new Date(y, mo - 1, 1), end = new Date(y, mo, 0), list = await Z.events(start, end);
    const evs = X.C.events.filter((e) => e.published && e.start.slice(0, 7) === `${y}-${String(mo).padStart(2, '0')}`);
    const days = new Map();
    const add = (d, html) => { if (!days.has(d)) days.set(d, []); days.get(d).push(html); };
    for (const e of list) {
      if (e.cat === 'candles' || e.cat === 'havdalah') add(e.date, `<span class="muted">${esc(t(e.cat === 'candles' ? 'Candle lighting' : 'Shabbat ends'))} ${esc(X.tm(e))}</span>`);
      else if (e.cat === 'parashat') add(e.date, `<a href="/parsha">${esc(X.hc(e))}</a>`);
      else if (!/^(Chanukah: \d|Omer)/.test(e.desc) || /Chanukah: 1 Candle/.test(e.desc)) add(e.date, `<strong>${esc(X.hc(e))}</strong>`);
    }
    for (const e of evs) add(e.start.slice(0, 10), `<a class="ev-link" href="/events/${e.slug}">${esc(e.title)}</a>`);
    const prev = mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`, next = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
    const monthName = new Intl.DateTimeFormat({ en: 'en-US', he: 'he-IL', ru: 'ru-RU' }[X.lang], { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, mo - 1, 15)));
    const rows = [...days.keys()].sort().map((d) => `<tr><td><strong>${esc(X.shortDate(d))}</strong></td><td>${days.get(d).join('<br>')}</td></tr>`).join('');
    const body = `<section class="wrap sec narrow"><h1>${esc(t('Jewish calendar: {month}', { month: monthName }))}</h1>
<p class="lead-d">${esc(t('Holidays, Rosh Chodesh, fast days, Shabbat times for Lafayette, and our events.'))}</p>
<p class="btns"><a class="btn ghost" href="/calendar?m=${prev}">← ${esc(t('Previous month'))}</a><a class="btn ghost" href="/calendar?m=${next}">${esc(t('Next month'))} →</a><a class="btn ghost" href="/events.ics">${esc(t('Add calendar to my phone'))}</a></p>
<table class="tbl"><tbody>${rows}</tbody></table></section>`;
    await render(res, { path: '/calendar', noindex: !!req.query.m, title: t('Jewish calendar for Lafayette, Moraga and Orinda'), description: t('This month\'s Jewish holidays, Rosh Chodesh, fast days, Shabbat candle lighting times for Lafayette and Chabad of Lamorinda events.'), body });
  }));
}

module.exports = { mountParsha, mountCalendar, mountDaily, portionsOf, slugOf, all };
