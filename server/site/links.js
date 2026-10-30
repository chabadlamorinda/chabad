// Links between pages, so readers (and Google) always find the next useful page: every holiday page lists its guides,
// every program page the guides for that program, every town page the local Lamorinda guides, every event the guides
// about what it celebrates, and the weekly pages the guides for that week's Jewish dates. Shown as picture cards.
'use strict';
const { esc } = require('./md.js');
const { artForPath, artImg, photoForPath } = require('./art.js');

const HOLIDAY = {
  'rosh-hashanah': /rosh-hashanah|shofar|tashlich|elul|selichot|teshuvah/, 'yom-kippur': /yom-kippur|kol-nidre|yizkor|teshuvah/,
  sukkot: /sukk|four-kinds|ushpizin|hoshana/, 'simchat-torah': /hakafot|torah-reading|simchat/, chanukah: /chanukah|dreidel|al-hanissim|kislev|jewish-in-december/,
  'tu-bishvat': /tu-bishvat/, purim: /purim|megillah|mishloach/, passover: /passover|seder-plate|afikoman|four-questions|matzah|chametz|exodus|pesach/,
  'lag-baomer': /omer|lag-baomer/, shavuot: /shavuot|ten-commandments|omer/, 'tisha-bav': /three-weeks|tisha|holy-temple|western-wall/,
};
const PROGRAM = {
  'jewish-preschool': /preschool|kids-in|new-parents|parenting/, 'hebrew-school': /hebrew-school|kids-in|hebrew-alphabet|bar-bat-mitzvah-in/,
  'ckids-afterschool': /kids-in|parenting/, 'summer-camp': /kids-in|parenting/, 'adult-education': /torah-classes|tanya|weekly-parsha|daily-torah|talmud/,
  'womens-circle': /women|challah|shabbat-candles|mikvah/, 'mens-club': /jewish-men-in|tefillin|minyan/, 'kids-and-teens': /teens|kids-in/,
  'bar-bat-mitzvah': /bar-mitzvah|bat-mitzvah|bar-bat|tefillin/, 'bay-kosher': /kosher/, 'chai-club': /supporting|tzedakah|pushka|maaser/,
};
// Events: guides named in the event's address or title first ("kabbalat-shabbat-and-dinner" -> Kabbalat Shabbat),
// then its holiday's and program's guides, then guides for its audience.
const AUDIENCE = {
  shabbat: ['shabbat-guest-guide', 'shabbat-for-beginners', 'shabbat-meals'], class: ['torah-classes-in-lamorinda', 'daily-torah-study'], kids: ['jewish-kids-in-lamorinda', 'jewish-parenting'],
  teens: ['jewish-teens-in-lamorinda', 'jewish-identity-for-teens'], women: ['jewish-women-in-lamorinda', 'jewish-women'], men: ['jewish-men-in-lamorinda', 'tefillin'],
  seniors: ['jewish-seniors-in-lamorinda'], family: ['jewish-parenting', 'shabbat-with-kids'], community: ['first-time-at-synagogue', 'not-religious-welcome'], volunteer: ['volunteering-in-lamorinda', 'chesed'],
};
function guidesForEvent(C, e) {
  const key = (e.slug + ' ').replace(/-\d{4}(-\d{2}){0,2}\b/g, ''), text = ((e.title || '') + ' ' + (e.summary || '')).toLowerCase();
  const named = C.learn.filter((a) => (a.slug.includes('-') && key.includes(a.slug)) || (a.title.split(':')[0].trim().length >= 6 && text.includes(a.title.split(':')[0].trim().toLowerCase())))
    .sort((a, b) => b.slug.length - a.slug.length);
  const hol = e.holiday && HOLIDAY[e.holiday] ? C.learn.filter((a) => HOLIDAY[e.holiday].test(a.slug)) : [];
  const prog = e.program && PROGRAM[e.program] ? C.learn.filter((a) => PROGRAM[e.program].test(a.slug)) : [];
  const aud = (AUDIENCE[e.category] || []).map((s) => C.learn.find((a) => a.slug === s)).filter(Boolean);
  return [...new Set([...named, ...hol, ...prog, ...aud])].slice(0, 4);
}
// Jewish dates (from the calendar, zmanim.js events) -> guides: Rosh Chodesh to its month, fasts, holidays, the parsha.
const DAYS = [
  [/^Rosh Chodesh /, (e) => [e.desc.replace(/^Rosh Chodesh /, '').toLowerCase().replace(/[^a-z]/g, ''), 'rosh-chodesh']],
  [/^Erev Rosh Hashana|^Rosh Hashana \d/, ['rosh-hashanah-simanim', 'shofar', 'tashlich']], [/^Leil Selichot/, ['selichot']], [/^Shabbat Shuva/, ['teshuvah']],
  [/^Tzom Gedaliah|^Asara B'Tevet|^Ta'anit Esther|^Ta'anit Bechorot/, ['minor-fast-days', 'fast-days']],
  [/^Erev Yom Kippur/, ['kapparot', 'kol-nidre']], [/^Yom Kippur/, ['yom-kippur-fast', 'yizkor']],
  [/^Erev Sukkot|^Sukkot/, ['sukkah', 'four-kinds', 'ushpizin']], [/^Hoshana Raba/, ['hoshana-rabbah']], [/^Shmini Atzeret|^Simchat Torah/, ['hakafot', 'yizkor']],
  [/^Chanukah: 8th Day/, ['zot-chanukah']], [/^Chanukah/, ['chanukah-menorah', 'chanukah-story', 'chanukah-foods']],
  [/^Tu BiShvat/, ['tu-bishvat-seder']], [/^Shabbat Zachor|^Purim|^Shushan Purim/, ['megillah', 'mishloach-manot', 'purim-seudah']],
  [/^Shabbat HaGadol|^Erev Pesach|^Pesach I$/, ['passover-seder', 'chametz', 'matzah']], [/^Pesach Sheni/, ['pesach-sheni']],
  [/^Yom HaShoah/, ['holocaust-remembrance']], [/^Yom HaZikaron|^Yom HaAtzma/, ['israel-and-the-jewish-people']], [/^Yom Yerushalayim/, ['jerusalem']],
  [/^Lag BaOmer|^Omer 1$/, ['counting-the-omer']], [/^Erev Shavuot|^Shavuot I$/, ['ten-commandments', 'shavuot-dairy-foods']],
  [/^Tzom Tammuz|^Shabbat Chazon|^Tish'a B'Av/, ['three-weeks', 'the-holy-temple', 'western-wall']], [/^Tu B'Av/, ['tu-bav']],
];
function guidesForDays(C, cal) {
  const out = [];
  for (const e of cal) {
    const rule = e.cat === 'parashat' ? ['weekly-parsha'] : (DAYS.find(([re]) => re.test(e.desc)) || [])[1];
    for (const s of (typeof rule === 'function' ? rule(e) : rule || [])) { const a = C.learn.find((x) => x.slug === s); if (a && !out.includes(a)) out.push(a); }
  }
  return out;
}
// Other pages and the guides that belong with them.
const PAGES = {
  '/shabbat': ['shabbat-for-beginners', 'shabbat-candles', 'kabbalat-shabbat', 'shabbat-guest-guide', 'havdalah', 'kiddush'],
  '/shabbat-times': ['shabbat-candles', 'shabbat-for-beginners', 'havdalah', 'shabbat-in-winter'], '/kaddish': ['kaddish', 'yahrzeit', 'year-of-mourning', 'yizkor'],
  '/tehillim': ['tehillim', 'talking-to-g-d-in-your-own-words', 'mi-sheberach', 'prayer'], '/donate': ['tzedakah', 'maaser', 'supporting-chabad-of-lamorinda'],
  '/sponsor': ['sponsoring-a-kiddush', 'yahrzeit', 'kiddush'], '/mitzvah': ['why-mitzvot', 'ten-mitzvah-campaigns', 'starting-jewish-observance'],
  '/daily-study': ['daily-torah-study', 'tanya', 'rambam', 'weekly-parsha'], '/tools/yahrzeit': ['yahrzeit', 'yahrzeit-candle', 'kaddish'],
  '/tools/hebrew-birthday': ['hebrew-birthday', 'jewish-birthday-customs'], '/tools/bar-bat-mitzvah': ['bar-mitzvah', 'bat-mitzvah', 'bar-mitzvah-speech'],
  '/tools/hebrew-date': ['jewish-calendar', 'rosh-chodesh'], '/tools/zmanim': ['daily-prayers', 'shema', 'jewish-calendar'],
  '/menorah': ['chanukah-menorah', 'chanukah-on-shabbat', 'zot-chanukah'], '/dreidel': ['dreidel', 'chanukah-gelt', 'chanukah-for-kids'], '/chanukah-quiz': ['chanukah-story', 'chanukah-menorah', 'hosting-a-chanukah-party'],
};
// How many guides list each guide in their "related" (worked out once per content version).
const counted = new WeakMap();
function linkedCount(C) {
  if (!counted.has(C.learn)) { const n = new Map(); for (const a of C.learn) for (const s of a.related) n.set(s, (n.get(s) || 0) + 1); counted.set(C.learn, n); }
  return counted.get(C.learn);
}
function guidesFor(C, path) {
  let m, list = [];
  if (PAGES[path]) return PAGES[path].map((s) => C.learn.find((a) => a.slug === s)).filter(Boolean);
  if ((m = /^\/events\/([a-z0-9-]+)$/.exec(path))) { const e = C.events.find((x) => x.slug === m[1]); return e ? guidesForEvent(C, e) : []; }
  if ((m = /^\/holidays\/([a-z-]+)$/.exec(path)) && HOLIDAY[m[1]]) list = C.learn.filter((a) => HOLIDAY[m[1]].test(a.slug));
  else if ((m = /^\/programs\/([a-z-]+)$/.exec(path)) && PROGRAM[m[1]]) list = C.learn.filter((a) => PROGRAM[m[1]].test(a.slug));
  else if ((m = /^\/jewish-([a-z-]+)$/.exec(path)) && C.towns.some((x) => x.slug === m[1])) {
    const local = C.learn.filter((a) => a.category === 'Lamorinda'), i = C.towns.findIndex((x) => x.slug === m[1]) * 3;
    list = [...local.slice(i % local.length), ...local.slice(0, i % local.length)];
  }
  // Local guides first, then the ones named after the holiday or program itself.
  // Then the most central guides: the ones other guides point to most often.
  const pop = linkedCount(C), rank = (a) => (a.category === 'Lamorinda' ? 0 : 1);
  return /^\/jewish-/.test(path) ? list.slice(0, 6) : list.sort((a, b) => rank(a) - rank(b) || (pop.get(b.slug) || 0) - (pop.get(a.slug) || 0) || a.slug.localeCompare(b.slug)).slice(0, 8);
}
// "Read next": one inviting card (picture, title, why it is worth reading) and a few short links, instead of a long grid.
// items: [{ href, title, description }]
function readNext(X, items, heading) {
  const list = items.filter(Boolean);
  if (!list.length) return '';
  const [first, ...more] = list;
  return `<section class="read-next"><p class="eyebrow">${esc(heading || X.t('Read next'))}</p>
<a class="card rn-main" href="${esc(first.href)}">${picture(first.href, first.title, 'lg')}<span class="rn-t"><strong>${esc(first.title)}</strong>${first.description ? `<span>${esc(first.description)}</span>` : ''}<span class="rn-go">${esc(X.t('Read next'))} →</span></span></a>
${more.length ? `<ul class="rn-more">${more.slice(0, 3).map((x) => `<li><a href="${esc(x.href)}">${esc(x.title)}</a></li>`).join('')}</ul>` : ''}</section>`;
}
const asItem = (a) => ({ href: '/learn/' + a.slug, title: a.title, description: a.description });
// A guide's picture: its photo (small card version) when it has one, otherwise its drawing.
function picture(href, title, size) {
  const p = href.split(/[?#]/)[0], ph = photoForPath(p, true);
  return ph ? `<img class="gc-img" src="${ph}" alt="" loading="lazy" decoding="async" width="560" height="380">` : artImg(artForPath(p, title), size);
}
// Picture cards for a few guides: a photo, the title and one line on what it covers.
function guideCards(X, guides, heading) {
  const list = guides.filter(Boolean);
  if (!list.length) return '';
  return `<section class="guide-cards">${heading ? `<h2>${esc(heading)}</h2>` : ''}<div class="gc-grid">${list.map((a) => `<a class="gcard" href="/learn/${a.slug}">${picture('/learn/' + a.slug, a.title)}<span class="gc-t"><strong>${esc(a.title)}</strong><span>${esc(a.description)}</span></span></a>`).join('')}</div></section>`;
}
function withGuides(X, body, path) {
  const list = guidesFor(X.C, path);
  if (!list.length) return body;
  const html = guideCards(X, list.slice(0, /^\/events\//.test(path) ? 4 : 6), X.t(/^\/jewish-/.test(path) ? 'Guides to Jewish life in Lamorinda' : /^\/events\//.test(path) ? 'Learn more before you come' : 'Guides to read'));
  const i = Math.max(body.lastIndexOf('</article>'), body.lastIndexOf('</section>'));
  return i < 0 ? body + html : body.slice(0, i) + html + body.slice(i);
}
// Links written as a bare address ("[/kaddish](/kaddish)") show the page's name instead.
function friendlyLinks(X, html) {
  const C = X.C, t = X.t, name = (p) => {
    const m = /^\/(learn|help|holidays|programs|forms)\/([a-z0-9-]+)$/.exec(p);
    if (m) { const list = { learn: C.learn, help: C.help || [], holidays: C.holidays, programs: C.programs, forms: C.forms || [] }[m[1]], x = list.find((y) => (y.slug || y.id) === m[2]); return x && (x.title || x.name); }
    const FIXED = { '/kaddish': 'Kaddish', '/tehillim': 'Tehillim for every occasion', '/sponsor': 'Sponsor in honor or memory of a loved one', '/parsha': "This week's Torah portion", '/contact': 'Contact', '/events': 'Upcoming events', '/shabbat': 'Shabbat times and services in Lafayette', '/donate': 'Donate', '/account': 'My account', '/help': "We're here for you", '/learn': 'Learn about Judaism', '/calendar': 'Jewish calendar', '/community': 'Community board', '/welcome': 'New to the area?', '/sponsor-a-kiddush': 'Sponsor a Kiddush', '/chai-club': 'Chai Club', '/pushka/': 'My Pushka app' };
    return FIXED[p] && t(FIXED[p]);
  };
  return html.replace(/<a href="(\/[a-z0-9/-]*)">\1<\/a>/g, (m, p) => { const n = name(p); return n ? `<a href="${p}">${esc(n)}</a>` : m; });
}
module.exports = { guidesFor, guidesForEvent, guidesForDays, guideCards, withGuides, friendlyLinks, readNext, asItem };
