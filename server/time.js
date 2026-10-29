// Lafayette (Pacific) local time "YYYY-MM-DDTHH:MM" -> ISO with the right offset (daylight saving included).
// Shared by the website content (events, campaigns) and the campaign money side, which also runs in the kit.
'use strict';
function withOffset(local) {
  const [d, t] = local.split('T'), [y, mo, da] = d.split('-').map(Number), [h, mi] = t.split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, da, h, mi);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(guess)).map((x) => [x.type, x.value]));
  const asLocal = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  const off = Math.round((asLocal - guess) / 60000), sign = off < 0 ? '-' : '+', a = Math.abs(off);
  return `${local}:00${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}
module.exports = { withOffset };
