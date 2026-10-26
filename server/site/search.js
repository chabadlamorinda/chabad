// Site search (/search?q=...): guides, help, programs, holidays, events, forms, questions and answers, tools and towns,
// in the visitor's language. The same page list also feeds the free "Ask us" chat answers.
'use strict';
const { plain, esc } = require('./md.js');

const norm = (x) => String(x || '').toLowerCase().normalize('NFKD').replace(/[֑-ׇ̀-ͯ]/g, '');
const STOP = new Set(['the', 'and', 'for', 'how', 'what', 'when', 'where', 'who', 'why', 'can', 'does', 'are', 'you', 'your', 'our', 'with', 'about', 'there', 'this', 'that', 'have', 'need', 'want', 'from', 'into', 'some', 'any', 'יש', 'מה', 'איך', 'מתי', 'איפה', 'של', 'את', 'עם', 'как', 'что', 'где', 'когда', 'для', 'это']);
const wordsOf = (q) => norm(q).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2 && !STOP.has(w));

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
    page(t('Sponsor in honor or memory'), '', 'sponsor kiddush yahrzeit birthday memory honor dedication', '/sponsor'),
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
  const results = siteDocs(C, t).map((d) => ({ ...d, s: score(words, d.title, d.text, d.body) * d.boost })).filter((d) => d.s > 0).sort((a, b) => b.s - a.s).slice(0, limit);
  const qa = [...C.faq.map((f) => ({ q: f.q, a: f.a, url: '/faq' })), ...C.learn.flatMap((a) => a.faq.map((f) => ({ q: f.q, a: f.a, url: '/learn/' + a.slug })))];
  const answers = qa.map((x) => ({ ...x, s: score(words, x.q, '', x.a) })).filter((x) => x.s >= Math.max(4, words.length * 2.5) && words.filter((w) => norm(x.q).includes(w)).length >= Math.ceil(words.length / 2)).sort((a, b) => b.s - a.s).slice(0, 2);
  return { words, results, answers };
}

function mountSearch(r, { render, wrap, ctxOf }) {
  r.get('/search', wrap(async (req, res) => {
    const X0 = ctxOf(req), q = String(req.query.q || '').slice(0, 100).trim();
    // Typed in Hebrew or Russian: search that language's pages.
    const script = /[\u0590-\u05ff]/.test(q) ? 'he' : /[\u0400-\u04ff]/.test(q) ? 'ru' : null;
    if (script && script !== X0.lang) return res.redirect(302, '/' + script + '/search?q=' + encodeURIComponent(q));
    const X = X0, t = X.t, { results, answers } = search(X.C, q, t);
    const KIND = { guide: t('Guide'), help: t("We're here for you"), program: t('Program'), holiday: t('Holiday'), event: t('Event'), form: t('Sign up'), tool: t('Tool'), page: '' };
    const body = `<section class="wrap sec narrow"><h1>${esc(t('Search'))}</h1>
<form class="searchbar" action="/search" role="search"><input type="search" name="q" value="${esc(q)}" placeholder="${esc(t('Search the website'))}" aria-label="${esc(t('Search the website'))}" autofocus><button class="btn gold" type="submit">${esc(t('Search'))}</button></form>
${q ? `${answers.length ? `<div class="answers">${answers.map((a) => `<div class="card answer-card"><h2>${esc(a.q)}</h2><p>${esc(plain(a.a))}</p><p><a href="${a.url}">${esc(t('Read more'))} →</a></p></div>`).join('')}</div>` : ''}
${results.length ? `<p class="muted">${esc(t('{n} results for "{q}"', { n: results.length, q }))}</p><div class="results">${results.map((d) => `<a class="card tile result" href="${d.url}">${KIND[d.kind] ? `<p class="eyebrow">${esc(KIND[d.kind])}</p>` : ''}<h3>${esc(d.title)}</h3>${d.text ? `<p>${esc(String(d.text).slice(0, 160))}</p>` : ''}</a>`).join('')}</div>`
    : `<p>${esc(t('Nothing found for "{q}".', { q }))} <a href="/help/talk-to-the-rabbi">${esc(t('Ask the Rabbi'))}</a></p>`}` : `<p class="chips">${['Shabbat', 'Kaddish', 'Bar Mitzvah', 'Hebrew School', 'Mezuzah', 'Kosher', 'Chanukah', 'Yahrzeit'].map((w) => `<a class="chip" href="/search?q=${encodeURIComponent(t(w))}">${esc(t(w))}</a>`).join('')}</p>`}
</section>`;
    await render(res, { path: '/search', noindex: true, title: q ? t('Search: {q}', { q }) : t('Search'), description: t('Search the Chabad of Lamorinda website.'), body });
  }));
}
module.exports = { mountSearch, search, siteDocs, wordsOf, norm, score };
