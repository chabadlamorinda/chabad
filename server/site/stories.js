// Jewish stories and jokes (/stories): the Rabbi's own collection ("The Story Treasury") and stories from reputable
// sources, sorted into sections; every story has its own page (/stories/<slug>) with its source, sharing and more to read.
// Content: site/content/stories.json (+ i18n/he|ru/stories.json with title, text and source by slug). Each item:
// { slug, kind: "joke"|"story", section, title, text (Markdown), source, sourceUrl?, tags: [], family }
// Sections and lists put what visitors open most first (popular.js).
'use strict';
const { esc, md, plain } = require('./md.js');
const { byPopularity, views } = require('./popular.js');
const { guideCards } = require('./links.js');

const SECTIONS = [
  ['jokes', 'Jewish jokes'],
  ['rebbe', 'Stories of the Rebbe'],
  ['chassidic', 'Chassidic stories'],
  ['talmud-midrash', 'From the Talmud and Midrash'],
  ['inspirational', 'Inspiring true stories'],
  ['courage', 'Faith and courage'],
  ['parable', 'Parables and teaching tales'],
];
// A story's topic → the guide to read next.
const TAG_GUIDE = { shabbat: 'shabbat', chanukah: 'chanukah-story', purim: 'the-four-mitzvahs-of-purim', passover: 'passover-seder', 'rosh-hashanah': 'rosh-hashanah-for-beginners',
  'yom-kippur': 'yom-kippur-for-beginners', sukkot: 'sukkot-for-beginners', shavuot: 'shavuot-night-learning', prayer: 'prayer', tzedakah: 'tzedakah', kindness: 'chesed',
  faith: 'bitachon', teshuvah: 'teshuvah', 'torah-study': 'daily-torah-study', marriage: 'shalom-bayit', parents: 'honoring-parents', children: 'jewish-parenting',
  mourning: 'comforting-mourners', kosher: 'kosher', mezuzah: 'mezuzah', tefillin: 'tefillin', honesty: 'honesty-and-truth', humility: 'humility', joy: 'simcha',
  israel: 'israel-and-the-jewish-people', holocaust: 'holocaust-remembrance', 'the-rebbe': 'the-rebbe', 'baal-shem-tov': 'baal-shem-tov', money: 'jewish-view-on-wealth', health: 'jewish-health-and-body' };

const excerpt = (s, n = 150) => { const p = plain(s).replace(/\s+/g, ' ').trim(); return p.length > n ? p.slice(0, n).replace(/\s+\S*$/, '') + '…' : p; };

// Short jokes are gathered by topic into collections of about 14 (/stories/jokes/money-1...), not one thin page each.
const THEMES = [['money', ['money']], ['marriage', ['marriage']], ['children', ['children']], ['parents', ['parents']], ['prayer', ['prayer', 'faith']], ['israel', ['israel']], ['health', ['health']], ['torah', ['torah-study']], ['joy', ['joy', 'shabbat', 'purim', 'passover', 'chanukah', 'rosh-hashanah', 'yom-kippur', 'sukkot']], ['kindness', ['honesty', 'tzedakah', 'kindness']]];
const THEME_NAME = { money: 'Money', marriage: 'Marriage', children: 'Children', parents: 'Parents and grandparents', prayer: 'Prayer and the synagogue', israel: 'Israel', health: 'Health', torah: 'Torah study', joy: 'Joy and holidays', kindness: 'Honesty and charity', more: 'More jokes' };
const PER_PAGE = 14;
function jokeCollections(C) {
  const jokes = (C.stories || []).filter((x) => x.kind === 'joke'), by = {};
  for (const j of jokes) { const th = (THEMES.find(([, tags]) => (j.tags || []).some((g) => tags.includes(g))) || ['more'])[0]; (by[th] = by[th] || []).push(j); }
  const out = [];
  for (const th of [...THEMES.map(([id]) => id), 'more']) { const list = by[th] || []; for (let i = 0; i * PER_PAGE < list.length; i++) out.push({ id: th + '-' + (i + 1), theme: th, n: i + 1, total: Math.ceil(list.length / PER_PAGE), jokes: list.slice(i * PER_PAGE, (i + 1) * PER_PAGE) }); }
  // a last page with only one or two jokes joins the page before it
  for (let i = out.length - 1; i > 0; i--) if (out[i].jokes.length < 4 && out[i].theme === out[i - 1].theme) { out[i - 1].jokes.push(...out[i].jokes); out.splice(i, 1); }
  for (const c of out) c.total = out.filter((x) => x.theme === c.theme).length;
  return out;
}
const jokeHome = (C, slug) => { const c = jokeCollections(C).find((x) => x.jokes.some((j) => j.slug === slug)); return c ? '/stories/jokes/' + c.id + '#' + slug : null; };

function mountStories(r, { render, wrap, ctxOf }) {
  const list = (C) => (C.stories || []);
  // A different joke each day, the same for everyone that day.
  // A different short joke each day, the same for everyone that day (long ones would fill a phone screen).
  const jokeOfDay = (C) => { const j = list(C).filter((x) => x.kind === 'joke' && plain(x.text).length <= 420); return j.length ? j[Math.floor(Date.now() / 864e5) % j.length] : null; };

  r.get('/stories', wrap(async (req, res) => {
    const X = ctxOf(req), { t, C } = X, all = list(C), jd = jokeOfDay(C);
    const sections = byPopularity(SECTIONS.filter(([id]) => all.some((x) => x.section === id)), () => '', { score: ([id]) => all.filter((x) => x.section === id).reduce((n, x) => n + views('/stories/' + x.slug), 0) });
    const card = (x) => x.kind === 'joke'
      ? `<div class="card joke tile"><p>${esc(plain(x.text))}</p><p class="small"><a href="${jokeHome(C, x.slug) || '/stories'}">${esc(t('Share this joke'))} →</a></p></div>`
      : `<a class="card tile story-card" href="/stories/${x.slug}"><h3>${esc(x.title)}</h3><p>${esc(excerpt(x.text))}</p></a>`;
    const block = ([id, name]) => {
      const items = byPopularity(all.filter((x) => x.section === id), (x) => '/stories/' + x.slug), first = id === 'jokes' ? 8 : 6;
      return `<h2 id="${id}">${esc(t(name))} <small>${items.length}</small></h2><div class="grid">${items.slice(0, first).map(card).join('')}</div>${items.length > first ? `<details class="more-wrap"><summary class="btn ghost sm">${esc(t('Show all {n}', { n: items.length }))}</summary><div class="grid">${items.slice(first).map(card).join('')}</div></details>` : ''}`;
    };
    const body = `<section class="wrap sec stories"><h1>${esc(t('Jewish stories and jokes'))}</h1>
<p class="lead-d">${esc(t('Stories that warm the heart and jokes that make you smile: from the Talmud and Midrash, the Baal Shem Tov and the Rebbe, and true stories of faith and kindness.'))}</p>
${jd ? `<div class="card joke-of-day"><p class="hand">${esc(t('Joke of the day'))}</p><p>${esc(plain(jd.text))}</p></div>` : ''}
<p><input type="search" class="search" data-filter=".stories .tile" placeholder="${esc(t('Search the stories and jokes'))}" aria-label="${esc(t('Search the stories and jokes'))}"></p>
<p class="chips">${sections.map(([id, name]) => `<a class="chip" href="#${id}">${esc(t(name))}</a>`).join('')}</p>
<h2>${esc(t('Jokes by topic'))}</h2><p class="chips">${jokeCollections(C).filter((c) => c.n === 1).map((c) => `<a class="chip" href="/stories/jokes/${c.id}">${esc(t(THEME_NAME[c.theme]))}</a>`).join('')}</p>
${sections.map(block).join('\n')}
<p class="muted" data-filter-empty hidden>${esc(t('Nothing found. Try another word, or ask us.'))}</p></section>`;
    await render(res, { path: '/stories', title: t('Jewish stories and jokes'), description: t('Jewish jokes, Chassidic stories, stories of the Rebbe and from the Talmud and Midrash, and true stories of faith and kindness.'), body });
  }));

  r.get('/stories/jokes/:id', wrap(async (req, res, next) => {
    const X = ctxOf(req), { t, C } = X, all = jokeCollections(C), i = all.findIndex((c) => c.id === req.params.id);
    if (i < 0) return next();
    const c = all[i], topic = t(THEME_NAME[c.theme]), name = t('Jewish jokes: {topic}', { topic }) + (c.total > 1 ? ' · ' + t('Part {n} of {total}', { n: c.n, total: c.total }) : '');
    const same = all.filter((x) => x.theme === c.theme), prev = all[i - 1], next_ = all[i + 1];
    const lab = (x) => t(THEME_NAME[x.theme]) + (x.total > 1 ? ' ' + x.n : '');
    const body = `<article class="wrap sec narrow story jokes-page"><p class="crumbs"><a href="/stories">${esc(t('Stories and jokes'))}</a> › <a href="/stories#jokes">${esc(t('Jewish jokes'))}</a> ›</p>
<h1>${esc(name)}</h1><p class="lead-d">${esc(t('Short, family-friendly Jewish jokes, gathered by topic.'))}</p>
${c.jokes.map((j) => `<section class="card joke" id="${j.slug}"><div class="story-text">${md(j.text)}</div><p class="small"><a href="#${j.slug}">${esc(t('Share this joke'))} #</a></p></section>`).join('\n')}
<p class="btns">${prev ? `<a class="btn ghost" href="/stories/jokes/${prev.id}">← ${esc(lab(prev))}</a>` : ''}${next_ ? `<a class="btn ghost" href="/stories/jokes/${next_.id}">${esc(lab(next_))} →</a>` : ''}</p>
<p class="btns"><a class="btn ghost" href="/stories">${esc(t('All the stories and jokes'))}</a></p></article>`;
    await render(res, { path: '/stories/jokes/' + c.id, title: name, description: excerpt(c.jokes.slice(0, 2).map((j) => j.text).join(' '), 150), body });
  }));

  r.get('/stories/:slug', wrap(async (req, res, next) => {
    const X = ctxOf(req), { t, C } = X, x = list(C).find((y) => y.slug === req.params.slug);
    if (!x) return next();
    if (x.kind === 'joke') { const home = jokeHome(C, x.slug); if (home) return res.redirect(301, X.path(home)); }   // old and shared links to a single joke land on its collection
    const sec = SECTIONS.find(([id]) => id === x.section) || ['', ''];
    const more = byPopularity(list(C).filter((y) => y.section === x.section && y.slug !== x.slug), (y) => '/stories/' + y.slug).slice(0, 4);
    const guides = (x.tags || []).map((g) => TAG_GUIDE[g]).filter(Boolean).map((s) => C.learn.find((a) => a.slug === s)).filter(Boolean).slice(0, 2);
    const body = `<article class="wrap sec narrow story"><p class="crumbs"><a href="/stories">${esc(t('Stories and jokes'))}</a> › <a href="/stories#${sec[0]}">${esc(t(sec[1]))}</a></p>
<h1>${esc(x.title)}</h1>
<div class="story-text">${md(x.text)}</div>
${x.source ? `<p class="muted small story-source">${esc(t('Source'))}: ${x.sourceUrl ? `<a href="${esc(x.sourceUrl)}" rel="noopener" target="_blank">${esc(x.source)}</a>` : esc(x.source)}</p>` : ''}
${more.length ? `<h2>${esc(t('More {section}', { section: t(sec[1]).toLowerCase() }))}</h2><ul class="list">${more.map((y) => `<li><a href="/stories/${y.slug}">${esc(y.kind === 'joke' ? excerpt(y.text, 90) : y.title)}</a></li>`).join('')}</ul>` : ''}
${guides.length ? guideCards(X, guides, t('Read more about it')) : ''}
<p class="btns"><a class="btn ghost" href="/stories">${esc(t('All the stories and jokes'))}</a></p></article>`;
    await render(res, { path: '/stories/' + x.slug, title: x.kind === 'joke' ? t('A Jewish joke') + ': ' + x.title : x.title, description: excerpt(x.text, 150), body });
  }));
}

module.exports = { mountStories, SECTIONS, TAG_GUIDE, jokeCollections, jokeHome };
