// The list of Kiddush "slots" for a Hebrew year: every Shabbat (by parshah) and every holiday day
// people sponsor (Rosh Hashanah 1-2, Yom Kippur break-fast, Sukkot 1-2, Shabbos Chol Hamoed,
// Shemini Atzeret, Simchat Torah, Pesach 1-2 and 7-8, Shavuot 1-2, Purim).
// Dates come from @hebcal/core (an ES module, so it is loaded with import()). Diaspora schedule.
'use strict';

let hc = null;
const load = async () => hc || (hc = await import('@hebcal/core'));

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const HEB_MONTH = { Tishrei: 'Tishrei', Cheshvan: 'Cheshvan', Kislev: 'Kislev', Tevet: 'Tevet', "Sh'vat": 'Shevat', Adar: 'Adar', 'Adar I': 'Adar I', 'Adar II': 'Adar II', Nisan: 'Nisan', Iyyar: 'Iyar', Sivan: 'Sivan', Tamuz: 'Tammuz', Av: 'Av', Elul: 'Elul' };

// Hebcal's transliterations -> the spellings used on our board.
const PARSHA = {
  bereshit: 'Bereishis', noach: 'Noach', lechlecha: 'Lech Lecha', vayera: 'Vayeira', chayeisara: 'Chayei Sara', toldot: 'Toldot', vayetzei: 'Vayeitzei', vayishlach: 'Vayishlach',
  vayeshev: 'Vayeishev', miketz: 'Mikeitz', vayigash: 'Vayigash', vayechi: 'Vayechi', shemot: 'Shemos', vaera: 'Vaeira', bo: 'Bo', beshalach: 'Beshalach', yitro: 'Yitro',
  mishpatim: 'Mishpatim', terumah: 'Terumah', tetzaveh: 'Tetzaveh', kitisa: 'Ki Tisa', vayakhel: 'Vayakhel', pekudei: 'Pekudei', vayikra: 'Vayikra', tzav: 'Tzav', shmini: 'Shemini',
  tazria: 'Tazria', metzora: 'Metzora', achreimot: 'Acharei', kedoshim: 'Kedoshim', emor: 'Emor', behar: 'Behar', bechukotai: 'Bechukotai', bamidbar: 'Bamidbar', nasso: 'Naso',
  behaalotcha: 'Behaalotecha', shlach: 'Shelach', korach: 'Korach', chukat: 'Chukas', balak: 'Balak', pinchas: 'Pinchas', matot: 'Matot', masei: 'Masei', devarim: 'Devarim',
  vaetchanan: 'Vaetchanan', eikev: 'Eikev', reeh: "Re'eh", shoftim: 'Shoftim', kiteitzei: 'Ki Teitzei', kitavo: 'Ki Tavo', nitzavim: 'Nitzavim', vayeilech: 'Vayelech', haazinu: 'Haazinu',
  vezothaberakhah: 'Vezos Haberacha',
};
const pname = (n) => PARSHA[String(n).toLowerCase().replace(/[^a-z]/g, '')] || n;

const SPECIAL = new Set(['Shabbat Shuva', 'Shabbat Shekalim', 'Shabbat Zachor', 'Shabbat Parah', 'Shabbat HaChodesh', 'Shabbat HaGadol', 'Shabbat Chazon', 'Shabbat Nachamu', 'Shabbat Shirah']);

const ymd = (g) => g.getFullYear() + '-' + String(g.getMonth() + 1).padStart(2, '0') + '-' + String(g.getDate()).padStart(2, '0');

// Holiday description -> [code, title]. Chol Hamoed days only count when they fall on Shabbat.
function holidayOf(desc, isSat) {
  if (/^Rosh Hashana( \d+)?$/.test(desc)) return ['rh1', 'Rosh Hashanah – Day 1'];
  if (desc === 'Rosh Hashana II') return ['rh2', 'Rosh Hashanah – Day 2'];
  if (desc === 'Yom Kippur') return ['yk', 'Yom Kippur – Break-Fast'];
  if (desc === 'Sukkot I') return ['suk1', 'Sukkot – Day 1'];
  if (desc === 'Sukkot II') return ['suk2', 'Sukkot – Day 2'];
  if (isSat && /^Sukkot (III|IV|V|VI) \(CH''M\)$/.test(desc)) return ['sukcm', 'Shabbos Chol Hamoed Sukkot'];
  if (desc === 'Shmini Atzeret') return ['sha', 'Shemini Atzeret'];
  if (desc === 'Simchat Torah') return ['simt', 'Simchat Torah'];
  if (desc === 'Pesach I') return ['pes1', 'Pesach – Day 1'];
  if (desc === 'Pesach II') return ['pes2', 'Pesach – Day 2'];
  if (isSat && /^Pesach (III|IV|V|VI) \(CH''M\)$/.test(desc)) return ['pescm', 'Shabbos Chol Hamoed Pesach'];
  if (desc === 'Pesach VII') return ['pes7', 'Pesach – Day 7'];
  if (desc === 'Pesach VIII') return ['pes8', 'Pesach – Day 8'];
  if (desc === 'Shavuot I') return ['shav1', 'Shavuos – Day 1'];
  if (desc === 'Shavuot II') return ['shav2', 'Shavuos – Day 2'];
  if (desc === 'Purim') return ['purim', 'Purim'];
  return null;
}

const baseOf = (hd) => {
  const g = hd.greg();
  return {
    date: ymd(g), dow: g.getDay(), dateLabel: MONTHS[g.getMonth()] + ' ' + g.getDate(),
    heb: hd.getDate() + ' ' + (HEB_MONTH[hd.getMonthName()] || hd.getMonthName()),
    hebHe: hd.renderGematriya(true).replace(/\s*[\u05d0-\u05ea"״׳']+$/, ''), // day and month, without the year
  };
};

const cache = new Map();

/** Slots of Hebrew year `hy` (5787 ...) in date order. Pure data, safe to cache. */
async function buildYear(hy) {
  if (cache.has(hy)) return cache.get(hy);
  const { HebrewCalendar, flags } = await load();
  const events = HebrewCalendar.calendar({ year: hy, isHebrewYear: true, sedrot: true, il: false, noMinorFast: true, noModern: true, noRoshChodesh: true, noSpecialShabbat: false });
  const specials = new Map();
  for (const e of events) if (SPECIAL.has(e.getDesc())) specials.set(ymd(e.getDate().greg()), e.getDesc());
  // Shabbat Mevarchim (blessing of the new month) and that month's molad.
  const mevarchim = new Map();
  const mv = HebrewCalendar.calendar({ year: hy, isHebrewYear: true, sedrot: false, il: false, noHolidays: true, molad: true, shabbatMevarchim: true });
  for (const e of mv) {
    const d = ymd(e.getDate().greg()), cur = mevarchim.get(d) || {};
    const desc = e.getDesc();
    if (/^Shabbat Mevarchim Chodesh /.test(desc)) { const m = desc.replace(/^Shabbat Mevarchim Chodesh /, ''); cur.month = HEB_MONTH[m] || m; }
    else if (/^Molad /.test(desc)) cur.molad = e.render('en').replace(/^Molad [^:]+:\s*/, '').replace(/(\d)(am|pm)/i, (x, n, ap) => n + ' ' + ap.toUpperCase());
    mevarchim.set(d, cur);
  }
  const slots = [];
  for (const e of events) {
    const hd = e.getDate(), base = baseOf(hd), date = base.date, dow = base.dow;
    if (e.getFlags() & flags.PARSHA_HASHAVUA) {
      const names = (e.parsha || []).map(pname);
      slots.push({ ...base, year: hy, key: date + '|shabbat', kind: 'shabbat', title: names.join('-'), titleHe: e.render('he-x-NoNikud').replace(/^פרשת /, ''), note: specials.get(date) || '' });
      continue;
    }
    const h = holidayOf(e.getDesc(), dow === 6);
    if (h) slots.push({ ...base, year: hy, key: date + '|' + h[0], kind: h[0] === 'purim' ? 'purim' : 'holiday', title: h[1], titleHe: e.render('he-x-NoNikud').replace(/\s*\(.*\)$/, '').replace(/\s*\d+$/, ''), note: '' });
  }
  for (const sl of slots) { const m = mevarchim.get(sl.date); if (m && m.month) { sl.mevarchim = m.month; sl.molad = m.molad || ''; } }
  slots.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  cache.set(hy, slots);
  return slots;
}

/** Hebrew year (e.g. 5787) that a Gregorian yyyy-mm-dd date falls in. */
async function hebrewYearOf(ymdStr) {
  const { HDate } = await load();
  const [y, m, d] = ymdStr.split('-').map(Number);
  return new HDate(new Date(y, m - 1, d, 12)).getFullYear();
}

/** Weekday, short date and Hebrew date for any yyyy-mm-dd (used for custom events). */
async function describeDate(ymdStr) {
  const { HDate } = await load();
  const [y, m, d] = ymdStr.split('-').map(Number);
  return baseOf(new HDate(new Date(y, m - 1, d, 12)));
}

/** "5787" -> Hebrew letters without the thousands, e.g. תשפ״ז */
async function yearHe(hy) { return (await load()).gematriya(hy); }

module.exports = { buildYear, hebrewYearOf, yearHe, describeDate };
