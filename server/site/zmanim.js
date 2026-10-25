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

module.exports = { events, thisShabbat, upcomingHolidays, nextDateOf, hebrewDate, mitzvahDate, todayLocal, ymd, fmtTime, TZ, HOLIDAY_PAGES };
