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
[/business-disputes|neighbor-disputes|family-feuds/, 'hands-heart'], [/marriage-arguments|in-laws/, 'house'], [/parents-and-teenagers|sibling-rivalry|difficult-relationships/, 'family'], [/forgiveness/, 'dove'], [/muktzeh|electricity-on-shabbat/, 'shabbat-candles'], [/cooking-on-yom-tov/, 'kosher-pot'], [/kapparot/, 'candle-flame'], [/blessings-after-food|asher-yatzar/, 'open-book'], [/ribbit/, 'coin'], [/simchat-bat/, 'baby'], [/hachnasat-sefer-torah|letter-in-a-torah/, 'torah-scroll'], [/buying-tefillin/, 'tefillin'], [/choosing-a-mezuzah/, 'mezuzah'], [/judaica/, 'kiddush-cup'], [/genetic-screening/, 'family'], [/suicide/, 'dove'], [/making-aliyah/, 'western-wall'], [/pikuach-nefesh|shabbat-in-the-hospital/, 'hands-heart'], [/kiddush-hashem|honesty-and-truth/, 'sparkles'], [/holidays-with-toddlers/, 'family'], [/traveling-on-shabbat/, 'shabbat-candles'], [/torah-study-for-women/, 'open-book'], [/tzedakah-priorities/, 'pushka'], [/bar-mitzvah-speech|bat-mitzvah-projects/, 'torah-scroll'], [/baby-shower/, 'baby'], [/talking-to-kids-about-death/, 'dove'], [/retirement/, 'tree'], [/working-parents/, 'shabbat-candles'], [/wedding-on-a-budget/, 'chuppah'], [/kosher-on-campus/, 'kosher-pot'], [/kallah|chosson|jewish-engagement|wedding-date|first-year-of-marriage/, 'chuppah'], [/family-purity/, 'chuppah'], [/setting-up-a-jewish-home/, 'mezuzah'], [/head-covering/, 'candle-pair-gold'], [/shiva-house|kriah|mourning-journey/, 'broken-heart-candle'], [/daily-prayers|birkat-kohanim/, 'open-book'], [/pirkei-avot|tanach|what-is-halacha/, 'scroll-quill'], [/why-bad-things/, 'dove'], [/ayin-hara|angels|dreams-jewish|reincarnation/, 'sparkles'], [/anger-jewish|humility/, 'hands-heart'], [/chabad-calendar/, 'calendar'], [/pregnancy-loss/, 'dove'], [/caregiver/, 'hands-heart'], [/feeling-lonely/, 'chat-bubble'], [/view-on-wealth/, 'coin'], [/bullying/, 'school'], [/addiction/, 'dove'], [/infertility/, 'baby'], [/adoption/, 'family'], [/halachic-will/, 'scroll-quill'], [/starting-jewish/, 'sparkles'], [/al-hanissim|jewish-in-december|chanukah-on-shabbat/, 'menorah'], [/chanukah-for-kids/, 'dreidel'], [/chanukah-foods/, 'kosher-pot'], [/yud-tes-kislev/, 'scroll-quill'], [/^kislev(\s|$)/, 'moon'], [/thanksgiving/, 'wheat'], [/hamotzi|hafrashat|shabbat-guest/, 'challah'], [/bikur-cholim/, 'hands-heart'], [/chanukah-at-work/, 'menorah'], [/budget|chalav|shavuot-dairy/, 'kosher-pot'], [/shemot|hashgacha|bitachon/, 'sparkles'], [/bal-tashchit|tzaar/, 'tree'], [/tzniut|shatnez|jewelry/, 'star-of-david'], [/purim-seudah/, 'hamantash'], [/genealogy/, 'family'], [/identity-for-teens/, 'star-of-david'], [/simcha|hakarat/, 'music-note'], [/shabbat-practical/, 'shabbat-candles'], [/eruv-tavshilin/, 'challah'], [/netilat/, 'kiddush-cup'], [/ketubah/, 'chuppah'], [/baby-names/, 'baby'], [/organ-donation|tattoos/, 'hands-heart'], [/greetings/, 'envelope'], [/loss-of-a-pet/, 'dove'], [/yahrzeit-candle/, 'broken-heart-candle'], [/campaigns/, 'tefillin'], [/gift-ideas|birthday-customs/, 'gift'], [/what-is-a-synagogue/, 'synagogue'],
    [/dreidel/, 'dreidel'], [/chanukah|menorah|gelt/, 'menorah'], [/rosh-hashanah|simanim|apple|honey|elul|selichot/, 'apple-honey'],
  [/shofar|tashlich/, 'shofar'], [/yom-kippur|kol-nidre|teshuvah|fast/, 'candle-flame'], [/sukk|ushpizin|hoshana/, 'lulav-etrog'], [/four-kinds|lulav|etrog/, 'lulav-etrog'],
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
// A real photo at the top of a page (free photos in site/media/photos, see CREDITS.md). Pages without one keep the drawing.
const PHOTOS = {
  '/programs/jewish-preschool': 'preschool-play', '/programs/hebrew-school': 'kids-crafts', '/programs/ckids-afterschool': 'kids-learning', '/programs/adult-education': 'torah-study',
  '/programs/womens-circle': 'challah-hands', '/programs/mens-club': 'tefillin', '/programs/kids-and-teens': 'challah-kid', '/programs/bar-bat-mitzvah': 'torah-yad', '/programs/bay-kosher': 'kosher-delivery',
  '/holidays/chanukah': 'chanukah-lighting', '/holidays/rosh-hashanah': 'apples-honey', '/holidays/yom-kippur': 'tallit-siddur', '/holidays/passover': 'seder-plate', '/holidays/shavuot': 'torah-yad', '/holidays/simchat-torah': 'torah-ark',
  '/shabbat': 'shabbat-table', '/legacy': 'tree-nature', '/about': 'diablo-hills', '/welcome': 'shabbat-dinner', '/our-area': 'diablo-hills', '/sponsor-a-kiddush': 'kiddush-cup', '/sponsor': 'kiddush-cup',
  '/learn/mezuzah': 'mezuzah', '/learn/shabbat': 'shabbat-table', '/learn/challah': 'challah-close', '/learn/tefillin': 'tefillin', '/learn/shofar': 'shofar', '/learn/passover-seder': 'seder-plate', '/learn/matzah': 'matzah',
  '/learn/chanukah-menorah': 'menorah-glow', '/learn/torah': 'torah-scroll', '/learn/bar-mitzvah': 'torah-yad', '/learn/kiddush': 'kiddush-cup', '/learn/shabbat-candles': 'shabbat-table', '/learn/hebrew-school-in-lamorinda': 'kids-crafts',
  '/learn/shabbat-in-lamorinda': 'shabbat-dinner', '/learn/moving-to-lamorinda': 'lamorinda-hills', '/learn/chanukah-for-kids': 'family-menorah', '/learn/chanukah-foods': 'sufganiyot', '/learn/dreidel': 'dreidel-kids',
};
// A photo for every guide: the page's own photo if it has one (PHOTOS), otherwise the first rule here that matches
// its address, otherwise its subject's photo. Photos missing from site/media/photos are skipped (the drawing is used).
const GUIDE_PHOTOS = [
  [/hosting-your-first-shabbat/, ['shabbat-dinner', 'challah-breaking']], [/jewish-morning-routine/, ['sunrise-sky', 'tallit-siddur']], [/giving-to-people-who-ask/, ['tzedakah-coins', 'volunteers-food']], [/being-a-good-neighbor/, ['lamorinda-hills', 'family-table']],
  [/keeping-kosher-with-family/, ['family-table', 'cooking-kitchen']], [/shabbat-alone/, ['shabbat-table', 'challah-close']], [/^patience$/, ['walking-path', 'grandparents']], [/giving-criticism/, ['couple-talking', 'walking-path']],
  [/blessing-your-children/, ['family-table', 'shabbat-dinner']], [/blessings-on-nature/, ['tree-nature', 'sunrise-sky', 'water-ripples']], [/birkat-hagomel/, ['sunrise-sky', 'caring-hands']], [/making-every-day-count/, ['walking-path', 'sunrise-sky']],
  [/chanukah-foods|sufganiyot/, 'sufganiyot'], [/dreidel/, 'dreidel-kids'], [/chanukah-for-kids|hosting-a-chanukah/, 'family-menorah'], [/chanukah|menorah|gelt|al-hanissim|kislev/, ['menorah-glow', 'chanukah-lighting', 'family-menorah', 'chanukah-donuts']],
  [/rosh-hashanah-simanim/, 'pomegranate'], [/shofar/, 'shofar'], [/rosh-hashanah|elul|selichot|tashlich/, ['apples-honey', 'pomegranate', 'shofar']],
  [/teshuvah|forgiveness|starting-jewish-observance|success-and-failure|not-religious/, 'walking-path'], [/yom-kippur|kol-nidre|kapparot/, ['tallit-siddur', 'memorial-candle', 'walking-path']],
  [/four-kinds/, 'lulav-etrog'], [/sukk|ushpizin|hoshana/, 'lulav-etrog'], [/simchat-torah|hakafot|hachnasat-sefer-torah|letter-in-a-torah/, 'torah-ark'],
  [/mishloach/, 'hamantaschen'], [/purim|megillah/, ['purim-costumes', 'hamantaschen']],
  [/seder|four-questions|afikoman|exodus|passover/, ['seder-plate', 'matzah']], [/matzah|chametz|pesach/, ['matzah', 'seder-plate']],
  [/shavuot|ten-commandments|counting-the-omer/, 'mountain'], [/tu-bishvat|bal-tashchit/, 'tree-nature'],
  [/tu-bav|jewish-dating|jewish-engagement|choosing-a-wedding-date/, 'wedding-rings'],
  [/three-weeks|tisha|holy-temple|western-wall/, 'western-wall'], [/jerusalem|israel|making-aliyah|first-trip/, 'western-wall'],
  [/havdalah|melave-malka/, 'havdalah'], [/kiddush(?!-levana)|kosher-wine/, 'kiddush-cup'],
  [/challah/, 'challah-hands'], [/hamotzi|netilat|birkat-hamazon|blessings-after-food/, 'challah-breaking'],
  [/shabbat-meals|shabbat-guest|shalom-aleichem|zemirot|cholent|eishet-chayil|shabbat-with-kids|shabbat-for-working|shabbat-in-lamorinda|hachnasat-orchim/, ['shabbat-dinner', 'family-table', 'challah-breaking']],
  [/shabbat|kabbalat|muktzeh|melachot|eruv(?!-tavshilin)|electricity|traveling-on/, ['shabbat-table', 'shabbat-dinner', 'challah-close', 'kiddush-cup', 'family-table']],
  [/kiddush-levana|rosh-chodesh|birkat-hachodesh|calendar|cheshvan|tevet|pesach-sheni/, 'moon-night'],
  [/mezuzah|chanukat-habayit/, 'mezuzah'], [/tefillin|mitzvah-tanks/, 'tefillin'], [/tallit|tzitzit|kippah|shatnez/, 'tallit-siddur'],
  [/kosher|meat-and-milk|checking-for-insects|tevilat-kelim|chalav|cooking-on|eruv-tavshilin|shavuot-dairy/, ['cooking-kitchen', 'kosher-delivery']],
  [/pregnancy-loss|loss-of-a-pet/, 'memorial-candle'],
  [/wedding|chuppah|ketubah|sheva-brachot|kallah|chosson|first-year-of-marriage/, ['wedding-chuppah', 'wedding-rings', 'couple-talking']], [/mikvah|family-purity/, 'water-ripples'],
  [/marriage|shalom-bayit|in-laws|divorce|blended/, 'couple-talking'],
  [/brit|baby|naming|pidyon|pregnancy|simchat-bat|new-parents|adoption|infertility|genetic/, ['baby-newborn', 'reading-child', 'family-table']],
  [/grandparent|seniors|aging|retirement|dementia/, 'grandparents'],
  [/teens|college|students|young-professionals|campus|bat-mitzvah-projects/, 'teens-friends'],
  [/upsherin|kids|children|parenting|sibling|preschool|hebrew-school|toddlers|talking-to-kids|bedtime/, ['reading-child', 'kids-crafts', 'kids-learning', 'challah-kid']],
  [/unveiling|visiting-a-grave|jewish-funeral|cremation|kriah|halachic-will/, 'grave-stones'],
  [/yahrzeit|yizkor|kaddish|aninut|sheloshim|mourning|shiva|grief|suicide|ethical-will|holocaust|comforting/, ['memorial-candle', 'grave-stones', 'caring-hands']],
  [/bikur-cholim|caregiver|caring-for|loved-one-is-dying|surgery|hospital|mi-sheberach|organ|health|mental-health|addiction/, 'caring-hands'],
  [/tzedakah|maaser|pushka|supporting|ribbit/, 'tzedakah-coins'], [/chesed|volunteering|kindness/, 'volunteers-food'],
  [/hebrew-alphabet|hebrew-reading|hebrew-phrases|hebrew-names|baby-names|shemot/, 'hebrew-letters'],
  [/talmud|mishnah|daily-torah|home-library|torah-study|torah-classes|chassidus|tanya|rambam|maimonides|pirkei|halacha|hey-teves|judaica/, 'seforim-shelf'],
  [/bar-mitzvah|bat-mitzvah/, 'torah-yad'], [/torah|parsha|haftarah|tanach|aliyah/, ['torah-scroll', 'torah-yad', 'torah-ark', 'torah-study']],
  [/prayer|amidah|shema|siddur|daily-prayers|minyan|modeh|tehillim|talking-to-g-d|blessings|asher-yatzar|tefilat|synagogue|rabbi|shehecheyanu/, ['tallit-siddur', 'western-wall', 'seforim-shelf', 'torah-ark']],
  [/star-of-david|symbols|jewish-pride|who-is-a-jew|identity|jewelry|chai-symbol|antisemitism|converting|noahide/, 'star-of-david'],
  [/moving-to|lamorinda|visiting-lamorinda/, 'lamorinda-hills'],
  [/613|why-mitzvot|ten-mitzvah|history|genealogy/, 'quill-writing'], [/rebbe|baal-shem-tov|chabad(?!-of)/, 'seforim-shelf'],
  [/business|parnassah|wealth/, 'tzedakah-coins'], [/disputes/, 'caring-hands'], [/anger|lashon-hara|jealousy|humility|honesty|ayin-hara/, 'walking-path'],
  [/tzaar-baalei-chayim/, 'tree-nature'], [/thanksgiving|technology/, 'family-table'], [/halloween|jewish-in-december|tattoos/, 'star-of-david'], [/jewish-women$/, 'challah-hands'],
  [/family|friendship|lonely|honoring-parents|feuds/, 'family-table'],
];
const CATEGORY_PHOTO = { 'Shabbat & holidays': 'shabbat-table', 'Jewish home': 'family-table', Kosher: 'cooking-kitchen', 'Prayer & Torah': 'torah-scroll', 'Life cycle': 'family-table', 'Mourning & remembrance': 'memorial-candle', 'Jewish ideas': 'sunrise-sky', Lamorinda: 'lamorinda-hills' };
const PHOTO_DIR = path.join(__dirname, '..', '..', 'site', 'media', 'photos');
let photos = null;
const hasPhoto = (name) => { if (!photos) { try { photos = new Set(fs.readdirSync(PHOTO_DIR).map((f) => f.replace(/\.jpg$/, ''))); } catch (e) { photos = new Set(); } } return photos.has(name); };
// The photo's name (no folder or .jpg) for a guide, or '' when there is none.
function guidePhoto(slug, category = '') {
  return guidePhotos(slug, category)[0] || '';
}
// Every photo that fits a guide, best first (a rule may give a few, so cards side by side can each show a different one).
function guidePhotos(slug, category = '') {
  const out = [], add = (n) => { if (n && hasPhoto(n) && !out.includes(n)) out.push(n); };
  add(PHOTOS['/learn/' + slug]);
  for (const [re, names] of GUIDE_PHOTOS) if (re.test(slug)) [].concat(names).forEach(add);
  add(CATEGORY_PHOTO[category]);
  return out;
}
// The photo for a page address: a fixed one, or (for a guide) its guide photo. small: the card version (-sm.jpg).
let learnCategory = () => '';
let learnList = null;
const setLearn = (list) => { if (!list || list === learnList) return; learnList = list; const m = new Map(list.map((a) => [a.slug, a.category])); learnCategory = (s) => m.get(s) || ''; };
function photoName(p) {
  if (PHOTOS[p]) return PHOTOS[p];
  const m = /^\/learn\/([a-z0-9-]+)$/.exec(p);
  return m ? guidePhoto(m[1], learnCategory(m[1])) : '';
}
const photoForPath = (p, small = false) => { const n = photoName(p); return !n ? '' : small && hasPhoto(n + '-sm') ? '/media/photos/' + n + '-sm.jpg' : '/media/photos/' + n + '.jpg'; };
// Add pictures to a finished page: every card tile, and a large one at the top of the page (a photo when there is one).
function decorate(html, pagePath) {
  const used = new Set();
  html = html.replace(/<a class="card tile([^"]*)" href="(\/[^"]*)"([^>]*)>(\s*(?:<p class="eyebrow">[^<]*<\/p>)?\s*<h3>)([^<]*)/g, (m, cls, href, rest, before, title) => {
    const p = href.split(/[?#]/)[0], g = /^\/learn\/([a-z0-9-]+)$/.exec(p);
    // Guide cards on one page each get a different photo where they can (the first fitting one not used yet).
    const n = g && (guidePhotos(g[1], learnCategory(g[1])).find((x) => !used.has(x)) || guidePhoto(g[1], learnCategory(g[1])));
    const ph = n && '/media/photos/' + n + (hasPhoto(n + '-sm') ? '-sm' : '') + '.jpg';
    if (n) used.add(n);
    if (ph) return `<a class="card tile has-photo${cls}" href="${href}"${rest}><img class="tile-photo" src="${ph}" alt="" loading="lazy" decoding="async" width="560" height="380">${before}${title}`;
    const name = artForPath(p, title);
    return name ? `<a class="card tile has-art${cls}" href="${href}"${rest}>${artImg(name)}${before}${title}` : m;
  });
  const photo = photoForPath(pagePath);
  if (photo && /<h1>/.test(html)) return html.replace(/<h1>/, `<figure class="page-photo"><img src="${photo}" alt="" fetchpriority="high" decoding="async"></figure><h1>`);
  const top = artForPath(pagePath);
  return top ? html.replace(/<h1>/, `<div class="page-art" aria-hidden="true">${artImg(top, 'lg')}</div><h1>`) : html;
}

const artImg = (name, size = 'sm') => (name ? `<img class="art art-${size}" src="/assets/art/${name}.svg" alt="" width="${size === 'lg' ? 96 : 56}" height="${size === 'lg' ? 96 : 56}"${size === 'lg' ? '' : ' loading="lazy"'} decoding="async">` : ''); // the big one at the top shows at once
const art = (kind, slug, extra, size) => artImg(artFor(kind, slug, extra), size);

module.exports = { art, artFor, artForPath, artImg, decorate, photoForPath, guidePhoto, guidePhotos, setLearn, PHOTOS, GUIDE_PHOTOS, reset: () => { have = null; photos = null; } };
