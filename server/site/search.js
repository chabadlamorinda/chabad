// Site search (/search?q=...): guides, help, programs, holidays, events, forms, questions and answers, tools and towns,
// in the visitor's language. The same page list also feeds the free "Ask us" chat answers.
'use strict';
const { plain, esc } = require('./md.js');

const norm = (x) => String(x || '').toLowerCase().normalize('NFKD').replace(/[֑-ׇ̀-ͯ]/g, '');
const STOP = new Set(['the', 'and', 'for', 'how', 'what', 'when', 'where', 'who', 'why', 'can', 'does', 'are', 'you', 'your', 'our', 'with', 'about', 'there', 'this', 'that', 'have', 'need', 'want', 'from', 'into', 'some', 'any', 'יש', 'מה', 'איך', 'מתי', 'איפה', 'של', 'את', 'עם', 'как', 'что', 'где', 'когда', 'для', 'это']);
// Common spellings of the same Jewish word: all find the same pages ("tehlim", "tfilin", "hanukkah", "shabbos"...).
const SPELL = {
  tehillim: 'tehlim tehilim tehilem tehillem thilim tilim tillim tehilim psalm psalms tehillim',
  mezuzah: 'mezuza mezzuzah mezuzzah mezzuza mezuzot mezuzos mezuzahs mezuzas mzuzah mezouza',
  tefillin: 'tefilin tfilin tfillin tefilen tephillin tefillen phylacteries',
  chanukah: 'hanukkah hanukah chanuka chanukka chanukkah hannukah hannukkah hanuka',
  shabbat: 'shabbos shabos shabat sabbath shobbos shabbes',
  kaddish: 'kadish kaddesh kadesh',
  yahrzeit: 'yartzeit yahrtzeit yortzeit jahrzeit yarzeit yartzheit yahrzeit',
  pesach: 'pessach passover pesah',
  sukkot: 'sukkos succot succos sukot',
  'rosh hashanah': 'roshhashanah roshhashana',
  hashanah: 'hashana hashonah',
  'yom kippur': 'yomkippur', kippur: 'kipur',
  'bar mitzvah': 'barmitzvah barmitzva', 'bat mitzvah': 'batmitzvah batmitzva basmitzvah', mitzvah: 'mitzva mitsvah',
  tallit: 'talit tallis talis tallith', siddur: 'sidur', challah: 'chala challa hallah halla', kosher: 'kasher koshar',
  bris: 'brit bris milah', shiva: 'shivah', purim: 'purrim', shavuot: 'shavuos', simchat: 'simchas', judaica: 'judaika',
};
const ALIAS = {}; for (const [to, from] of Object.entries(SPELL)) for (const w of from.split(' ')) if (w !== to) ALIAS[w] = to;
const wordsOf = (q) => norm(q).split(/[^\p{L}\p{N}]+/u).flatMap((w) => (ALIAS[w] || w).split(' ')).filter((w) => w.length > 2 && !STOP.has(w));
// Closest known word for a typo ("tehlim" → "tehillim"), from page titles and addresses: one letter off, two for long words.
function near(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) { const cur = [i]; for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  return prev[b.length];
}

// Every page worth finding: [title, short text, body words, address, weight, kind].
function siteDocs(C, t) {
  const year = new Date().getFullYear();
  const page = (title, text, body, url, boost = 2, kind = 'page') => ({ title, text, body, url, boost, kind });
  return [
    ...(C.help || []).map((h) => page(h.title, h.description, h.text, '/help/' + h.slug, 2, 'help')),
    ...C.programs.map((p) => page(p.name, p.summary, plain(p.details || ''), '/programs/' + p.slug, 2, 'program')),
    ...(C.forms || []).map((f) => page(f.title, f.intro, '', '/forms/' + f.id, 2, 'form')),
    ...C.holidays.map((h) => page(h.title, h.description || '', h.text, '/holidays/' + h.slug, 1.5, 'holiday')),
    ...C.learn.map((a) => page(a.title, a.description, a.text, '/learn/' + a.slug, a.category === 'Lamorinda' ? 1.3 : 1, 'guide')),
    ...C.events.filter((e) => e.published && (e.end || e.start).slice(0, 10) >= new Date().toISOString().slice(0, 10)).map((e) => page(e.title, e.summary || '', plain(e.details || ''), '/events/' + e.slug, 2.5, 'event')),
    ...C.towns.map((x) => page(t('Jewish {town}', { town: x.name }), t('Shabbat times, synagogue and Jewish life in {town}', { town: x.name }), [x.name, x.name_en, 'synagogue chabad jewish shabbat'].join(' '), '/jewish-' + x.slug, 1.5, 'page')),
    page(t('Shabbat times and services in Lafayette'), t('Shabbat candle lighting times for Lafayette, Moraga and Orinda, Shabbat services, Kiddush and Shabbat dinners at Chabad of Lamorinda.'), 'shabbat services candle lighting times minyan kiddush dinner friday saturday', '/shabbat'),
    page(t('Shabbat times for the whole year'), '', 'shabbat candle lighting havdalah times year calendar', '/shabbat-times'),
    page(t('Jewish holidays {year}', { year }), '', 'jewish holidays dates calendar year rosh hashanah yom kippur sukkot chanukah purim passover shavuot', '/jewish-holidays-' + year),
    page(t('This week in Jewish Lamorinda'), '', 'this week shabbat parsha events', '/this-week'),
    page(t('Kaddish'), '', 'kaddish minyan mourner yahrzeit', '/kaddish'),
    page(t('Tehillim for every occasion'), '', 'tehillim psalms sick refuah prayer list birthday chapter', '/tehillim'),
    page(t('Sponsor in honor or memory of a loved one'), '', 'sponsor kiddush yahrzeit birthday memory honor dedication', '/sponsor'),
    page(t('Donate'), '', 'donate donation give charity tzedakah venmo zelle check stock', '/donate'),
    page(t('Upcoming events'), '', 'events calendar rsvp upcoming', '/events'),
    page(t('Daily prayer times (zmanim)'), '', 'zmanim sunrise sunset shema mincha times today', '/tools/zmanim', 2, 'tool'),
    page(t('Hebrew date converter'), '', 'hebrew date converter calendar', '/tools/hebrew-date', 2, 'tool'),
    page(t('Hebrew birthday calculator'), '', 'hebrew birthday calculator', '/tools/hebrew-birthday', 2, 'tool'),
    page(t('Yahrzeit calculator'), '', 'yahrzeit calculator date anniversary passing', '/tools/yahrzeit', 2, 'tool'),
    page(t('Bar & Bat Mitzvah date'), '', 'bar bat mitzvah date calculator', '/tools/bar-bat-mitzvah', 2, 'tool'),
    page(t("This week's Torah portion"), '', 'parsha torah portion weekly', '/parsha'),
    page(t('Ask the Rabbi'), '', 'ask rabbi question answer', '/ask'),
    page(t('My account'), '', 'account sign in family yahrzeit birthday reminders', '/account'),
  ];
}
function score(words, title, text, body) {
  let s = 0; const T = norm(title), X = norm(text), B = norm(body);
  for (const w of words) { if (T.includes(w)) s += 4; if (X.includes(w)) s += 2; if (B.includes(w)) s += 0.5; }
  // Every word in the title: a strong match.
  if (words.length > 1 && words.every((w) => T.includes(w))) s += 4;
  return s;
}
function search(C, q, t, limit = 30) {
  const words = wordsOf(q);
  if (!words.length) return { words, results: [], answers: [] };
  const docs = siteDocs(C, t);
  // The page address counts too, so an English word finds the page on the Hebrew and Russian site ("mezuzah" → /he/learn/mezuzah).
  const find = (ws) => docs.map((d) => ({ ...d, s: score(ws, d.title, d.text, d.body + ' ' + d.url.replace(/[/-]/g, ' ')) * d.boost + (d.url.endsWith('/' + ws.join('-')) ? 30 : 0) })).filter((d) => d.s > 0).sort((a, b) => b.s - a.s).slice(0, limit);
  let results = find(words), fixed = null;
  if (!results.length) { // a typo: try the closest known words
    const vocab = new Set(); for (const d of docs) for (const w of norm(d.title + ' ' + d.url.replace(/[/-]/g, ' ')).split(/[^\p{L}\p{N}]+/u)) if (w.length > 3) vocab.add(w);
    const better = words.map((w) => { if (vocab.has(w) || w.length < 4) return w; let best = w, bd = w.length >= 7 ? 3 : 2; for (const v of vocab) { const d = near(w, v); if (d < bd) { bd = d; best = v; } } return best; });
    if (better.some((w, i) => w !== words[i])) { results = find(better); if (results.length) fixed = better.join(' '); }
  }
  const qa = [...C.faq.map((f) => ({ q: f.q, a: f.a, url: '/faq' })), ...C.learn.flatMap((a) => a.faq.map((f) => ({ q: f.q, a: f.a, url: '/learn/' + a.slug })))];
  const answers = qa.map((x) => ({ ...x, s: score(words, x.q, '', x.a) })).filter((x) => x.s >= Math.max(4, words.length * 2.5) && words.filter((w) => norm(x.q).includes(w)).length >= Math.ceil(words.length / 2)).sort((a, b) => b.s - a.s).slice(0, 2);
  return { words, results, answers, fixed };
}

function mountSearch(r, { render, wrap, ctxOf, logSearch = null }) {
  r.get('/search', wrap(async (req, res) => {
    const X0 = ctxOf(req), q = String(req.query.q || '').slice(0, 100).trim();
    // Typed in Hebrew or Russian: search that language's pages.
    const script = /[\u0590-\u05ff]/.test(q) ? 'he' : /[\u0400-\u04ff]/.test(q) ? 'ru' : null;
    if (script && script !== X0.lang) return res.redirect(302, '/' + script + '/search?q=' + encodeURIComponent(q));
    const X = X0, t = X.t, { results, answers, fixed } = search(X.C, q, t);
    if (q && logSearch) logSearch(q, X.lang, results.length + answers.length); // what people look for (see reading.js)
    const KIND = { guide: t('Guide'), help: t("We're here for you"), program: t('Program'), holiday: t('Holiday'), event: t('Event'), form: t('Sign up'), tool: t('Tool'), page: '' };
    const body = `<section class="wrap sec narrow"><h1>${esc(t('Search'))}</h1>
<form class="searchbar" action="/search" role="search"><input type="search" name="q" value="${esc(q)}" placeholder="${esc(t('Search the website'))}" aria-label="${esc(t('Search the website'))}" autofocus><button class="btn gold" type="submit">${esc(t('Search'))}</button></form>
${q ? `${answers.length ? `<div class="answers">${answers.map((a) => `<div class="card answer-card"><h2>${esc(a.q)}</h2><p>${esc(plain(a.a))}</p><p><a href="${a.url}">${esc(t('Read more'))} →</a></p></div>`).join('')}</div>` : ''}
${results.length ? `<p class="muted">${esc(t('{n} results for "{q}"', { n: results.length, q: fixed || q }))}</p>${(() => { // the first 10 results, the rest one tap away
  const card = (d) => `<a class="card tile result" href="${d.url}">${KIND[d.kind] ? `<p class="eyebrow">${esc(KIND[d.kind])}</p>` : ''}<h3>${esc(d.title)}</h3>${d.text ? `<p>${esc(String(d.text).slice(0, 160))}</p>` : ''}</a>`;
  return `<div class="results">${results.slice(0, 10).map(card).join('')}</div>${results.length > 10 ? `<details class="more-results"><summary class="btn ghost">${esc(t('Show more results'))}</summary><div class="results">${results.slice(10).map(card).join('')}</div></details>` : ''}`; })()}`
    : `<p>${esc(t('Nothing found for "{q}".', { q }))}</p><p class="btns"><button type="button" class="btn gold" data-chat-open>${esc(t('Ask us'))}</button><a class="btn ghost" href="/help/talk-to-the-rabbi">${esc(t('Ask the Rabbi'))}</a></p>`}` : `<p class="chips">${['Shabbat', 'Kaddish', 'Bar Mitzvah', 'Hebrew School', 'Mezuzah', 'Kosher', 'Chanukah', 'Yahrzeit'].map((w) => `<a class="chip" href="/search?q=${encodeURIComponent(t(w))}">${esc(t(w))}</a>`).join('')}</p>`}
</section>`;
    await render(res, { path: '/search', noindex: true, title: q ? t('Search: {q}', { q }) : t('Search'), description: t('Search the Chabad of Lamorinda website.'), body });
  }));
}
// Does this search still find nothing today? (Old searches are re-checked, so a word a new guide or spelling now finds drops off the writing list.)
const stillMissing = (C, q) => { const r = search(C, q, (s, o) => String(s).replace(/\{(\w+)\}/g, (m, k) => (o && o[k] != null ? o[k] : m)), 5); return !r.results.length && !r.answers.length; };
module.exports = { mountSearch, search, siteDocs, wordsOf, norm, score, stillMissing };
