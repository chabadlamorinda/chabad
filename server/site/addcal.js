// "Add to my calendar" for everything that happens at the center, and a way to send it to someone else.
//  * One-time events: Google Calendar, Outlook and the .ics file (Apple Calendar and most others); the .ics itself is
//    served by seo.js (/events/<slug>.ics).
//  * Weekly classes, Hebrew School and services (org.json "weekly"): /weekly/<id>.ics repeats every week, so one tap
//    puts the class in the calendar for good. Kabbalat Shabbat changes with the season ("seasonal": true), so its file
//    holds the next several Fridays at their real times instead of one repeating time.
//  * "Send to someone": the existing share buttons (WhatsApp, text, email, copy link) with the calendar link in the message.
'use strict';
const { esc } = require('./md.js');
const { fullAddress } = require('./content.js');
const Z = require('./zmanim.js');
const { shareBar } = require('./share.js');

const TZ = 'America/Los_Angeles';
const DAY = { Sunday: 'SU', Monday: 'MO', Tuesday: 'TU', Wednesday: 'WE', Thursday: 'TH', Friday: 'FR', Saturday: 'SA' };
const DAY_NUM = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };

const icsText = (s) => String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const fold = (line) => { const out = []; let s = line; while (Buffer.byteLength(s) > 74) { let n = 74; while (Buffer.byteLength(s.slice(0, n)) > 74) n--; out.push(s.slice(0, n)); s = ' ' + s.slice(n); } out.push(s); return out.join('\r\n'); };
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const weeklyId = (w) => slug(w.name);
const compact = (local) => local.replace(/[-:]/g, '').slice(0, 13) + '00'; // 2026-11-15T10:00 -> 20261115T100000

// Today in Lafayette: { date: 'YYYY-MM-DD', day: 0-6, mins: minutes since midnight }
function laNow(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday), mins: Number(p.hour) * 60 + Number(p.minute) };
}
const addDays = (date, n) => { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const minutes = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + (m || 0); };
const clock = (mins) => String(Math.floor(mins / 60) % 24).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0');

// The next time a weekly item happens: { start: 'YYYY-MM-DDTHH:MM', end }. No end time given: one hour.
function nextOccurrence(w, now = new Date(), time = w.startTime) {
  const n = laNow(now), want = DAY_NUM[w.byDay], st = minutes(time);
  for (let i = 0; i < 8; i++) {
    const day = (n.day + i) % 7;
    if (day !== want || (i === 0 && st <= n.mins)) continue;
    const date = addDays(n.date, i), len = w.endTime && minutes(w.endTime) > st ? minutes(w.endTime) - st : 60;
    return { start: `${date}T${time}`, end: `${date}T${clock(st + len)}` };
  }
  return null;
}

// "-08:00" or "-07:00" for a local Lafayette time (for the Outlook link)
function offsetFor(local) {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'shortOffset' }).formatToParts(new Date(local.slice(0, 16) + ':00Z')).find((x) => x.type === 'timeZoneName');
  const m = /GMT([+-])(\d+)/.exec(part ? part.value : '') || [0, '-', '8'];
  return m[1] + String(m[2]).padStart(2, '0') + ':00';
}

function links(base, { title, start, end, loc, details, ics, recur }) {
  const g = new URLSearchParams({ action: 'TEMPLATE', text: title, dates: `${compact(start)}/${compact(end)}`, ctz: TZ, details: details || '', location: loc || '' });
  if (recur) g.set('recur', 'RRULE:' + recur);
  const o = new URLSearchParams({ path: '/calendar/action/compose', rru: 'addevent', subject: title, startdt: start.slice(0, 16) + ':00' + offsetFor(start), enddt: end.slice(0, 16) + ':00' + offsetFor(end), location: loc || '', body: details || '' });
  return { google: 'https://calendar.google.com/calendar/render?' + g, outlook: 'https://outlook.live.com/calendar/0/deeplink/compose?' + o, ics: ics.startsWith('http') ? ics : base + ics };
}

// The two small menus: choose a calendar, or send the calendar link to someone.
function menu(X, base, item) {
  const t = X.t, L = links(base, item);
  const text = item.when ? `${item.title}, ${item.when}. ${t('Add it to your calendar:')}` : `${item.title}. ${t('Add it to your calendar:')}`;
  return `<div class="addcal"><details class="addcal-pick"><summary class="btn ghost sm">${esc(t('Add to calendar'))}</summary><div class="addcal-links">
<a href="${esc(L.google)}" rel="noopener" target="_blank">${esc(t('Google Calendar'))}</a>
<a href="${esc(L.outlook)}" rel="noopener" target="_blank">${esc(t('Outlook'))}</a>
<a href="${esc(X.path ? X.path(item.icsPath) : item.icsPath)}">${esc(t('Apple Calendar and others (.ics file)'))}</a>
</div></details><details class="addcal-send"><summary class="btn ghost sm">${esc(t('Send to someone'))}</summary>${shareBar(X, L.ics, text).replace(`<p class="share-h">${esc(t('Share with a friend'))}</p>`, '')}</details></div>`;
}

function weeklyItem(C, id) { return (C.org.weekly || []).find((w) => w.byDay && w.startTime && weeklyId(w) === id); }

// The calendar menu for one weekly item (class, Hebrew School, service)
function weeklyMenu(X, base, w) {
  const C = X.C, o = C.org, now = new Date(), occ = nextOccurrence(w, now);
  if (!occ) return '';
  const rule = w.seasonal ? null : `FREQ=WEEKLY;BYDAY=${DAY[w.byDay]}`;
  return menu(X, base, { title: w.name, when: `${w.day} ${w.time}`, start: occ.start, end: occ.end, loc: `${o.name}, ${fullAddress(o)}`, details: `${base}${w.link || '/events'}`, icsPath: `/weekly/${weeklyId(w)}.ics`, ics: `${base}/weekly/${weeklyId(w)}.ics`, recur: rule });
}

function mountAddCal(r, { content, base }) {
  r.get('/weekly/:id.ics', async (req, res, next) => {
    try {
      const C = content(), w = weeklyItem(C, req.params.id);
      if (!w) return next();
      const o = C.org, loc = `${o.name}, ${fullAddress(o)}`, stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
      const head = (st) => ['BEGIN:VEVENT', `DTSTAMP:${stamp}`, `SUMMARY:${icsText(w.name)}`, `LOCATION:${icsText(loc)}`, `DESCRIPTION:${icsText((w.time ? w.time + '. ' : '') + base + (w.link || '/events'))}`, `URL:${base}${w.link || '/events'}`, ...st];
      const alarm = ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(w.name)}`, 'TRIGGER:-PT30M', 'END:VALARM', 'END:VEVENT'];
      let ev = [];
      if (w.seasonal) { // the time moves with the season: the next 8 Fridays, each at its own time
        const n = laNow(); let friday = addDays(n.date, ((5 - n.day) + 7) % 7);
        for (let i = 0; i < 8; i++, friday = addDays(friday, 7)) {
          const { candles } = await Z.thisShabbat(new Date(friday + 'T12:00:00-08:00')).catch(() => ({}));
          const time = candles && Z.kabbalatFor(o.kabbalatShabbat || {}, candles);
          if (!time) continue;
          ev.push(...head([`UID:${weeklyId(w)}-${friday}@chabadoflamorinda`, `DTSTART;TZID=${TZ}:${compact(friday + 'T' + time)}`, `DTEND;TZID=${TZ}:${compact(friday + 'T' + clock(minutes(time) + 60))}`]), ...alarm);
        }
      } else {
        const occ = nextOccurrence(w, new Date(Date.now() - 864e5));
        ev = [...head([`UID:${weeklyId(w)}@chabadoflamorinda`, `DTSTART;TZID=${TZ}:${compact(occ.start)}`, `DTEND;TZID=${TZ}:${compact(occ.end)}`, `RRULE:FREQ=WEEKLY;BYDAY=${DAY[w.byDay]}`]), ...alarm];
      }
      if (!ev.length) return next();
      const TZ_BLOCK = ['BEGIN:VTIMEZONE', `TZID:${TZ}`, 'BEGIN:DAYLIGHT', 'TZOFFSETFROM:-0800', 'TZOFFSETTO:-0700', 'TZNAME:PDT', 'DTSTART:19700308T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU', 'END:DAYLIGHT', 'BEGIN:STANDARD', 'TZOFFSETFROM:-0700', 'TZOFFSETTO:-0800', 'TZNAME:PST', 'DTSTART:19701101T020000', 'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU', 'END:STANDARD', 'END:VTIMEZONE'];
      res.type('text/calendar; charset=utf-8').set('Content-Disposition', `attachment; filename="${weeklyId(w)}.ics"`).set('Cache-Control', 'public, max-age=900')
        .send(['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Chabad of Lamorinda//Weekly//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${icsText(w.name)}`, ...TZ_BLOCK, ...ev, 'END:VCALENDAR'].map(fold).join('\r\n') + '\r\n');
    } catch (e) { next(e); }
  });
}

module.exports = { mountAddCal, menu, weeklyMenu, weeklyId, nextOccurrence, links };
