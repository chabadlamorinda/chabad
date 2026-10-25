// Pictures for everything: small vector illustrations (site/assets/art/*.svg, about 1-2 KB each, cached for a year)
// chosen for every guide, holiday, program, help page, form, event and town. Lightweight, so pages stay fast.
'use strict';
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', '..', 'site', 'assets', 'art');
let have = null;
const exists = (name) => { if (!have) { try { have = new Set(fs.readdirSync(DIR).map((f) => f.replace(/\.svg$/, ''))); } catch (e) { have = new Set(); } } return have.has(name); };

// First matching rule wins: [pattern on the slug or title, illustration].
const RULES = [
  [/dreidel/, 'dreidel'], [/chanukah|menorah|gelt/, 'menorah'], [/rosh-hashanah|simanim|apple|honey|elul|selichot/, 'apple-honey'],
  [/shofar|tashlich/, 'shofar'], [/yom-kippur|kol-nidre|teshuvah|fast/, 'candle-flame'], [/sukk|ushpizin|hoshana/, 'sukkah'], [/four-kinds|lulav|etrog/, 'lulav-etrog'],
  [/simchat-torah|hakafot|torah-reading|aliyah|torah|haftarah|weekly-parsha|chumash|bar-mitzvah|bat-mitzvah/, 'torah-scroll'], [/purim|megillah|costume/, 'megillah'], [/mishloach|hamantash/, 'hamantash'],
  [/passover|pesach|seder|matzah|chametz|afikoman|four-questions|exodus/, 'matzah'], [/seder-plate/, 'seder-plate'], [/omer|shavuot|ten-commandments|sinai/, 'mountain-sinai'], [/tablets|613|mitzv/, 'tablets'],
  [/lag-baomer|bonfire/, 'bonfire'], [/tu-bishvat|tree/, 'tree'], [/tisha|three-weeks|temple|holy-temple/, 'temple'], [/western-wall|jerusalem|israel/, 'western-wall'],
  [/havdalah|melave/, 'havdalah'], [/kiddush(?!-levana)|wine|grapes/, 'kiddush-cup'], [/challah|jewish-foods|shabbat-meals|birkat-hamazon/, 'challah'], [/candle|shabbat/, 'shabbat-candles'],
  [/kiddush-levana|rosh-chodesh|birkat-hachodesh|calendar|moon/, 'moon'], [/eruv|melachot/, 'house'],
  [/mezuzah|chanukat-habayit|home|house|shalom-bayit/, 'mezuzah'], [/tefillin|mitzvah-tanks/, 'tefillin'], [/tallit|tzitzit/, 'tallit'], [/kippah/, 'kippah'],
  [/kosher|meat|milk|insects|tevilat|kelim/, 'kosher-pot'], [/star-of-david|jewish-pride|symbols|who-is-a-jew|identity|converting|chai-symbol/, 'star-of-david'],
  [/wedding|chuppah|sheva-brachot|dating|getting-married|mikvah|eishet/, 'chuppah'], [/divorce/, 'rings'], [/brit|baby|naming|pidyon|pregnancy|new-baby|upsherin/, 'baby'],
  [/yahrzeit|yizkor|kaddish|shiva|aninut|sheloshim|mourning|unveiling|grave|funeral|passed-away|cremation|holocaust|end-of-life|comforting/, 'broken-heart-candle'],
  [/sick|refuah|mi-sheberach|health|caring/, 'hands-heart'], [/tzedakah|maaser|chesed|charity|hachnasat|honoring|kindness|lashon/, 'hands-heart'], [/pushka|donate|chai-club|giving/, 'pushka'],
  [/tehillim|psalm|prayer|amidah|shema|modeh|blessing|shehecheyanu|siddur|minyan|bedtime|tefilat|synagogue|shul/, 'open-book'],
  [/talmud|mishnah|rambam|maimonides|tanya|chassidus|kabbalah|study|library|hebrew|learn/, 'scroll-quill'], [/rebbe|chabad|baal-shem-tov|moshiach|niggun|music/, 'music-note'],
  [/soul|afterlife|free-will|belief|g-d|why-mitzvot|meditation|noahide/, 'sparkles'], [/parent|grandparent|family|kids|children|interfaith/, 'family'],
  [/business|ethic|dispute/, 'hands-heart'], [/college|student|school/, 'school'], [/preschool|camp|ckids|playground/, 'playground'], [/grief|hard-times/, 'dove'],
  [/talk|ask|rabbi/, 'chat-bubble'], [/volunteer|involved/, 'hands-heart'], [/newsletter|email/, 'envelope'], [/zmanim|times|clock/, 'clock'], [/birthday/, 'gift'],
  [/lamorinda|lafayette|moraga|orinda/, 'map-pin'],
];
const CATEGORY = { Lamorinda: 'map-pin', 'Shabbat & holidays': 'shabbat-candles', 'Jewish home': 'mezuzah', Kosher: 'kosher-pot', 'Prayer & Torah': 'torah-scroll', 'Life cycle': 'chuppah', 'Mourning & remembrance': 'broken-heart-candle', 'Jewish ideas': 'sparkles' };
const FIXED = {
  'learn:choosing-a-jewish-preschool': 'playground', 'learn:hebrew-school-in-lamorinda': 'school', 'learn:israelis-in-lamorinda': 'western-wall', 'learn:jewish-kids-in-lamorinda': 'playground', 'learn:jewish-students-in-lamorinda': 'school', 'learn:jewish-teens-in-lamorinda': 'sparkles', 'learn:jewish-women-in-lamorinda': 'candle-pair-gold', 'learn:jewish-year-in-lamorinda': 'calendar', 'learn:life-events-in-lamorinda': 'chuppah', 'learn:moving-to-lamorinda': 'house', 'learn:russian-speaking-jews-in-lamorinda': 'family', 'learn:supporting-chabad-of-lamorinda': 'pushka', 'learn:volunteering-in-lamorinda': 'hands-heart', 'learn:jewish-home-in-lamorinda': 'mezuzah',
  'program:jewish-preschool': 'playground', 'program:hebrew-school': 'school', 'program:ckids-afterschool': 'playground', 'program:summer-camp': 'sparkles', 'program:adult-education': 'open-book',
  'program:womens-circle': 'candle-pair-gold', 'program:mens-club': 'tefillin', 'program:kids-and-teens': 'dreidel', 'program:bar-bat-mitzvah': 'torah-scroll', 'program:bay-kosher': 'kosher-pot', 'program:chai-club': 'pushka',
  'holiday:yom-kippur': 'candle-flame', 'holiday:simchat-torah': 'torah-scroll', 'holiday:purim': 'hamantash', 'holiday:shavuot': 'mountain-sinai', 'holiday:tisha-bav': 'candle-flame',
  'help:disputes': 'hands-heart', 'help:end-of-life': 'dove', 'help:planning-a-jewish-funeral': 'candle-flame', 'help:jewish-identity': 'star-of-david', 'help:shalom-bayit': 'house',
  'form:preschool': 'playground', 'form:hebrew-school': 'school', 'form:ckids': 'playground', 'form:summer-camp': 'sparkles', 'form:high-holidays': 'shofar', 'form:yizkor': 'broken-heart-candle',
  'form:lulav-etrog': 'lulav-etrog', 'form:matzah': 'matzah', 'form:sell-chametz': 'matzah', 'form:mezuzah-tefillin': 'mezuzah', 'form:shabbat-meal': 'challah', 'form:volunteer': 'hands-heart', 'form:newsletter': 'envelope',
};

function artFor(kind, slug, extra = '') {
  const fixed = FIXED[kind + ':' + slug];
  if (fixed && exists(fixed)) return fixed;
  const key = (slug + ' ' + extra).toLowerCase();
  for (const [re, name] of RULES) if (re.test(key) && exists(name)) return name;
  if (kind === 'town' && exists('map-pin')) return 'map-pin';
  if (kind === 'event' && exists('sparkles')) return 'sparkles';
  const cat = CATEGORY[extra];
  return cat && exists(cat) ? cat : exists('star-of-david') ? 'star-of-david' : '';
}
// <img> for cards (small) and page headers (large). Decorative, so alt="".
// Which picture a site address gets (cards link to these addresses).
function artForPath(p, title = '') {
  const m = /^\/(learn|programs|holidays|help|forms|events|parsha)\/([^/?#]+)/.exec(p);
  if (m) return artFor({ learn: 'learn', programs: 'program', holidays: 'holiday', help: 'help', forms: 'form', events: 'event', parsha: 'learn' }[m[1]], m[1] === 'parsha' ? 'weekly-parsha' : decodeURIComponent(m[2]), title);
  if (/^\/jewish-holidays-\d{4}$/.test(p)) return exists('calendar') ? 'calendar' : '';
  if (/^\/shabbat-times(\/|$)/.test(p)) return exists('shabbat-candles') ? 'shabbat-candles' : '';
  const t = /^\/jewish-([a-z-]+)$/.exec(p);
  if (t && t[1] !== 'lamorinda') return artFor('town', t[1]);
  const PAGES = { '/tools/zmanim': 'clock', '/daily-study': 'scroll-quill', '/parsha': 'torah-scroll', '/calendar': 'calendar', '/ask': 'chat-bubble', '/tools/hebrew-birthday': 'gift', '/tools/hebrew-date': 'calendar', '/tools/yahrzeit': 'broken-heart-candle', '/tools/bar-bat-mitzvah': 'torah-scroll',
    '/kaddish': 'broken-heart-candle', '/this-week': 'calendar', '/tehillim': 'open-book', '/sponsor': 'kiddush-cup', '/donate': 'pushka', '/account': 'family', '/community': 'chat-bubble', '/get-involved': 'hands-heart', '/shabbat': 'shabbat-candles',
    '/events': 'calendar', '/holidays': 'menorah', '/programs': 'school', '/learn': 'open-book', '/help': 'hands-heart', '/our-area': 'map-pin', '/jewish-lamorinda': 'star-of-david', '/photos': 'sparkles', '/forms': 'envelope', '/welcome': 'house', '/about': 'synagogue', '/contact': 'phone', '/faq': 'chat-bubble' };
  const name = PAGES[p];
  return name && exists(name) ? name : '';
}
// Add pictures to a finished page: every card tile, and a large one at the top of the page.
function decorate(html, pagePath) {
  html = html.replace(/<a class="card tile([^"]*)" href="(\/[^"]*)"([^>]*)>(\s*(?:<p class="eyebrow">[^<]*<\/p>)?\s*<h3>)([^<]*)/g, (m, cls, href, rest, before, title) => {
    const name = artForPath(href.split(/[?#]/)[0], title);
    return name ? `<a class="card tile has-art${cls}" href="${href}"${rest}>${artImg(name)}${before}${title}` : m;
  });
  const top = artForPath(pagePath);
  return top ? html.replace(/<h1>/, `<div class="page-art" aria-hidden="true">${artImg(top, 'lg')}</div><h1>`) : html;
}

const artImg = (name, size = 'sm') => (name ? `<img class="art art-${size}" src="/assets/art/${name}.svg" alt="" width="${size === 'lg' ? 96 : 56}" height="${size === 'lg' ? 96 : 56}" loading="lazy" decoding="async">` : '');
const art = (kind, slug, extra, size) => artImg(artFor(kind, slug, extra), size);

module.exports = { art, artFor, artForPath, artImg, decorate, reset: () => { have = null; } };
