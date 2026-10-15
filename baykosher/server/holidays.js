// Jewish holidays computed from the Hebrew calendar (Node's built-in ICU), so dates are right every year.
// A holiday is "in season" from `lead` days before it starts until it ends; the site promotes it then.
'use strict';

// month names as ICU spells them (Adar changes in leap years; Purim is in the last Adar)
const HOLIDAYS = [
  { slug: 'rosh-hashana', name: 'Rosh Hashana', he: 'ראש השנה', months: ['Tishri'], day: 1, days: 2, lead: 35 },
  { slug: 'sukkot', name: 'Sukkot', he: 'סוכות', months: ['Tishri'], day: 15, days: 9, lead: 21 },
  { slug: 'chanukah', name: 'Chanukah', he: 'חנוכה', months: ['Kislev'], day: 25, days: 8, lead: 30 },
  { slug: 'tu-bishvat', name: 'Tu BiShvat', he: 'ט"ו בשבט', months: ['Shevat'], day: 15, days: 1, lead: 14 },
  { slug: 'purim', name: 'Purim', he: 'פורים', months: ['Adar', 'Adar II'], day: 14, days: 2, lead: 21 },
  { slug: 'pesach', name: 'Passover (Pesach)', he: 'פסח', months: ['Nisan'], day: 15, days: 8, lead: 45 },
  { slug: 'shavuot', name: 'Shavuot', he: 'שבועות', months: ['Sivan'], day: 6, days: 2, lead: 21 },
];

const fmt = new Intl.DateTimeFormat('en-u-ca-hebrew', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' });
const DAY = 86400000;
const hebrew = (d) => { const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value])); return { month: p.month, day: Number(p.day), year: p.relatedYear || p.year }; };

// next occurrence whose last day is not before `from`: { start, end } as UTC-midnight dates
function nextOccurrence(h, from = new Date()) {
  const base = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  for (let i = -(h.days + 1); i < 430; i++) {
    const d = new Date(base + i * DAY), x = hebrew(d);
    if (x.day === h.day && h.months.includes(x.month)) {
      const end = new Date(d.getTime() + (h.days - 1) * DAY);
      if (end.getTime() >= base) return { start: d, end, hebrewYear: x.year };
    }
  }
  return null;
}

function holidayInfo(slug, now = new Date()) {
  const h = HOLIDAYS.find((x) => x.slug === slug);
  if (!h) return null;
  const o = nextOccurrence(h, now);
  if (!o) return { ...h, inSeason: false };
  const base = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const seasonStart = new Date(o.start.getTime() - h.lead * DAY);
  return { ...h, ...o, seasonStart, inSeason: base >= seasonStart.getTime() && base <= o.end.getTime(), daysUntil: Math.round((o.start.getTime() - base) / DAY) };
}
const inSeason = (now = new Date()) => HOLIDAYS.map((h) => holidayInfo(h.slug, now)).filter((h) => h && h.inSeason);
const slugs = () => HOLIDAYS.map((h) => h.slug);

module.exports = { HOLIDAYS, holidayInfo, inSeason, nextOccurrence, slugs };
