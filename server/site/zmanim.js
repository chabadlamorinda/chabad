// Jewish calendar for Lafayette, CA: Shabbat times, parsha, holidays, Hebrew dates (from @hebcal/core, an ES module).
// Candle lighting is 18 minutes before sunset; Shabbat/Yom Tov ends when the sun is 8.5 degrees below the horizon,
// plus one minute as a safety margin (the same rule as the Kiddush TV board).
'use strict';

let hc = null;
const load = async () => hc || (hc = await import('@hebcal/core'));

const TZ = 'America/Los_Angeles';
const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
const fmtTime = (d, locale = 'en-US') => (locale === 'en-US' ? timeFmt : new Intl.DateTimeFormat(locale, { timeZone: TZ, hour: 'numeric', minute: '2-digit' })).format(d);
// Today's civil date in Lafayette, as a local-midnight Date (Hebcal works on civil dates).
function todayLocal(now = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const [y, m, d] = p.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Major holidays get their own guide page; the key is the page slug.
const HOLIDAY_PAGES = [
  ['rosh-hashanah', /^Rosh Hashana( \d+)?$/], ['yom-kippur', /^Yom Kippur$/], ['sukkot', /^Sukkot I$/], ['simchat-torah', /^Shmini Atzeret$/],
  ['chanukah', /^Chanukah: 1 Candle$/], ['tu-bishvat', /^Tu BiShvat$/], ['purim', /^Purim$/], ['passover', /^Pesach I$/],
  ['lag-baomer', /^Lag BaOmer$/], ['shavuot', /^Shavuot I$/], ['tisha-bav', /^Tish'a B'Av$/],
];
const holidaySlug = (desc) => { const h = HOLIDAY_PAGES.find(([, re]) => re.test(desc)); return h ? h[0] : null; };

const cache = new Map();
const HOME = { lat: 37.8858, lng: -122.118, name: 'Lafayette, CA' };
async function events(start, end, where = HOME) {
  const key = ymd(start) + ':' + ymd(end) + ':' + where.lat + ',' + where.lng;
  if (cache.has(key)) return cache.get(key);
  const { HebrewCalendar, Location } = await load();
  const location = new Location(where.lat, where.lng, false, TZ, where.name || 'Lafayette, CA', 'US');
  const list = HebrewCalendar.calendar({ location, candlelighting: true, havdalahDeg: 8.5, start, end, sedrot: true, il: false }).map((e) => {
    const cats = e.getCategories ? e.getCategories() : [];
    let time = e.eventTime || null;
    if (time && cats[0] === 'havdalah') time = new Date(time.getTime() + 60e3);
    return { date: ymd(e.getDate().greg()), desc: e.getDesc(), title: e.render('en').replace(/^(Candle lighting|Havdalah): .*$/, '$1'), titleHe: e.render('he-x-NoNikud').replace(/:\s*\d.*$/, ''), cat: cats[0] || '', minor: cats.includes('minor') || cats.includes('modern'), time, timeStr: time ? fmtTime(time) : '' };
  });
  if (cache.size > 50) cache.clear();
  cache.set(key, list);
  return list;
}

// The coming (or current) Shabbat: candle lighting, parsha, Havdalah.
async function thisShabbat(now = new Date(), where = HOME) {
  const today = todayLocal(now), end = new Date(today); end.setDate(end.getDate() + 8);
  const list = await events(today, end, where);
  const candles = list.find((e) => e.cat === 'candles'), parsha = list.find((e) => e.cat === 'parashat');
  const havdalah = list.find((e) => e.cat === 'havdalah' && (!candles || e.date > candles.date));
  return { candles, parsha, havdalah };
}

// Upcoming holidays (one entry per holiday, major first-days only unless minor=true).
async function upcomingHolidays(days = 365, now = new Date()) {
  const today = todayLocal(now), end = new Date(today); end.setDate(end.getDate() + days);
  const list = await events(today, end), out = [], seen = new Set();
  for (const e of list) {
    const slug = holidaySlug(e.desc);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug); out.push({ ...e, slug });
  }
  return out;
}
async function nextDateOf(slug, now = new Date()) { return (await upcomingHolidays(400, now)).find((h) => h.slug === slug) || null; }

async function hebrewDate(d = new Date(), afterSunset = false) {
  const { HDate } = await load();
  const g = new Date(d); if (afterSunset) g.setDate(g.getDate() + 1);
  const h = new HDate(g);
  return { en: h.render('en'), he: h.renderGematriya(), day: h.getDate(), month: h.getMonthName(), year: h.getFullYear() };
}
// 13th (boy) or 12th (girl) Hebrew birthday.
async function mitzvahDate(birth, afterSunset, girl) {
  const { HDate, months } = await load();
  const g = new Date(birth); if (afterSunset) g.setDate(g.getDate() + 1);
  const h = new HDate(g), age = girl ? 12 : 13;
  let month = h.getMonth();
  // Adar in a regular year -> Adar II in a leap year (the custom for bar/bat mitzvah).
  if (month === months.ADAR_I && !HDate.isLeapYear(h.getFullYear()) && HDate.isLeapYear(h.getFullYear() + age)) month = months.ADAR_II;
  if (month === months.ADAR_II && !HDate.isLeapYear(h.getFullYear() + age)) month = months.ADAR_I;
  const day = Math.min(h.getDate(), HDate.daysInMonth(month, h.getFullYear() + age));
  const m = new HDate(day, month, h.getFullYear() + age);
  return { date: ymd(m.greg()), en: m.render('en'), he: m.renderGematriya() };
}

// Daily times (zmanim) by the Chabad custom (the Alter Rebbe, Baal HaTanya), as on Chabad.org.
async function dayTimes(day, where = HOME) {
  const { Zmanim, GeoLocation } = await load();
  const z = new Zmanim(new GeoLocation(null, where.lat, where.lng, 0, TZ), day, false);
  const t = (fn) => { try { const d = fn(); return d && !isNaN(d) ? d : null; } catch (e) { return null; } };
  return [
    ['dawn', 'Dawn (Alot HaShachar)', t(() => z.alosBaalHatanya())],
    ['tallit', 'Earliest tallit and tefillin', t(() => z.misheyakir())],
    ['sunrise', 'Sunrise', t(() => z.getSunriseBaalHatanya())],
    ['shema', 'Latest Shema', t(() => z.sofZmanShmaBaalHatanya())],
    ['tefillah', 'Latest Shacharit (morning prayer)', t(() => z.sofZmanTfilaBaalHatanya())],
    ['chatzot', 'Midday (Chatzot)', t(() => z.chatzot())],
    ['minchaG', 'Earliest Mincha', t(() => z.minchaGedolaBaalHatanya())],
    ['minchaK', 'Mincha Ketanah', t(() => z.minchaKetanaBaalHatanya())],
    ['plag', 'Plag HaMincha', t(() => z.plagHaminchaBaalHatanya())],
    ['sunset', 'Sunset', t(() => z.getSunsetBaalHatanya())],
    ['tzeit', 'Nightfall (Tzeit HaKochavim)', t(() => z.tzaisBaalHatanya())],
  ].filter((x) => x[2]);
}

// Daily study, Chabad style: Chitas (Chumash, Tehillim, Tanya), Rambam (1 or 3 chapters), Sefer HaMitzvot,
// plus Daf Yomi, Mishnah and Nach for those who learn them.
let learningLoaded = null;
async function dailyStudy(day) {
  const { DailyLearning, HDate } = await load();
  if (!learningLoaded) learningLoaded = import('@hebcal/learning');
  await learningLoaded;
  const Y = await import('@hebcal/leyning');
  const hd = new HDate(day), out = [];
  // Chumash: this week's portion, one aliyah a day (Sunday = first aliyah ... Shabbat = seventh).
  const sat = new Date(day); sat.setDate(sat.getDate() + ((6 - sat.getDay() + 7) % 7));
  const sh = (await events(sat, sat)).find((e) => e.cat === 'parashat');
  if (sh) {
    try {
      const name = sh.desc.replace(/^Parashat\s+/, ''), ley = Y.getLeyningForParsha(name), a = ley && ley.fullkriyah && ley.fullkriyah[String(day.getDay() + 1)];
      if (a) out.push({ key: 'chumash', label: 'Chumash', text: `${sh.title}: ${a.k} ${a.b}-${a.e}`, textHe: `${sh.titleHe}: ${a.k} ${a.b}-${a.e}`, url: `https://www.sefaria.org/${a.k}.${a.b.replace(':', '.')}-${a.e.replace(':', '.')}?lang=bi` });
    } catch (e) { /* holiday readings have no weekday aliyah */ }
  }
  for (const [key, label] of [['psalms', 'Tehillim'], ['tanyayomi', 'Tanya'], ['rambam1', 'Rambam: 1 chapter'], ['rambam3', 'Rambam: 3 chapters'], ['seferhamitzvot', 'Sefer HaMitzvot'], ['dafyomi', 'Daf Yomi'], ['mishnayomi', 'Mishnah Yomi'], ['nachyomi', 'Nach Yomi']]) {
    try { const ev = DailyLearning.lookup(key, hd); if (ev) out.push({ key, label, text: ev.render('en'), textHe: ev.render('he-x-NoNikud'), url: ev.url ? ev.url() : '' }); } catch (e) { /* not scheduled today */ }
  }
  return out;
}

module.exports = { dailyStudy, dayTimes, events, thisShabbat, upcomingHolidays, nextDateOf, hebrewDate, mitzvahDate, todayLocal, ymd, fmtTime, TZ, HOLIDAY_PAGES };
