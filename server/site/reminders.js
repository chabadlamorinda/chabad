// Personal emails from the data people save on the website (needs email set up):
//  * yahrzeit reminders 7 days and 1 day before, with the candle-lighting evening;
//  * a Hebrew birthday greeting the day before a family member's Hebrew birthday.
// Runs once a day after 9 AM Lafayette time. Each email is logged so it is never sent twice.
'use strict';
const H = require('../../pushka/hebdate.js');

const ptNow = (d) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value])); return { ymd: `${p.year}-${p.month}-${p.day}`, hour: +p.hour }; };

function createReminders({ store, mailer, base, org, log = console, now = () => new Date(), i18n = null }) {
  if (!store || !mailer) return null;
  const q = (t, p) => store.pool.query(t, p);
  const T = (lang) => (i18n ? i18n.makeT(lang) : (x, v) => (v ? x.replace(/\{(\w+)\}/g, (m, k) => v[k]) : x));
  const LOC = { en: 'en-US', he: 'he-IL', ru: 'ru-RU' };
  const day = (ymd, lang) => new Date(ymd + 'T12:00:00Z').toLocaleDateString(LOC[lang] || 'en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
  const site = (lang, p) => base + (lang === 'he' || lang === 'ru' ? '/' + lang : '') + p;
  const once = async (key) => (await q('INSERT INTO email_log (key) VALUES ($1) ON CONFLICT DO NOTHING', [key])).rowCount === 1;

  async function run() {
    const { ymd: today, hour } = ptNow(now());
    if (hour < 9) return 0;
    let sent = 0;
    // Website members (signed in at least once) get email; app-only members get the app's push reminders.
    const ys = (await q(`SELECT y.*, m.name AS member_name, m.email, m.lang FROM yahrzeits y JOIN members m ON m.id=y.member_id WHERE m.last_login IS NOT NULL AND m.email <> ''`)).rows;
    for (const y of ys) {
      const n = H.next({ day: y.h_day, month: y.h_month, year: y.h_year }, today); if (!n) continue;
      const left = H.daysBetween(today, n.date);
      if (left !== 7 && left !== 1) continue;
      if (!(await once(`yz:${y.id}:${n.date}:${left}`))) continue;
      const eve = H.addDays(n.date, -1);
      const t = T(y.lang), L = y.lang, heb = L === 'he' ? H.label({ day: y.h_day, month: y.h_month }, true) : L === 'ru' ? `${y.h_day} ${t(y.h_month)}` : H.label({ day: y.h_day, month: y.h_month });
      await mailer.send({ to: y.email, subject: t(left === 1 ? 'Yahrzeit of {name}: tomorrow' : 'Yahrzeit of {name}: in one week', { name: y.name }), text: [
        t('Dear {name},', { name: y.member_name || t('friend') }), '',
        t('The yahrzeit of {name} ({hebrew}) is on {date}.', { name: y.name, hebrew: heb, date: day(n.date, L) }),
        t('Light a 24-hour memorial candle on {date} before sunset.', { date: day(eve, L) }), '',
        t('Mark the day: sponsor the Kiddush or a Torah class in their memory, give tzedakah in their merit, and say Kaddish.'),
        t('Sponsor in their memory:') + ' ' + site(L, '/sponsor?o=yahrzeit&name=' + encodeURIComponent(y.name)),
        t('Kaddish (join the minyan, or have it said for you):') + ' ' + site(L, '/kaddish'),
        t('Tehillim for a yahrzeit:') + ' ' + site(L, '/tehillim#yahrzeit'),
        t('Call or reply:') + ' ' + org.phone, '',
        t('May their soul be bound up in the bond of eternal life.'), org.name, '',
        t('Manage reminders:') + ' ' + site(L, '/account'),
      ].join('\n') });
      sent++;
    }
    const fam = (await q(`SELECT f.*, m.name AS member_name, m.email, m.lang FROM family f JOIN members m ON m.id=f.member_id WHERE f.birthday IS NOT NULL AND m.news AND m.last_login IS NOT NULL`)).rows;
    for (const f of fam) {
      const b = f.birthday instanceof Date ? f.birthday.toISOString().slice(0, 10) : String(f.birthday).slice(0, 10);
      const p = H.hebrewOf(b, f.birth_after_sunset), n = H.next({ day: p.day, month: p.month }, today);
      if (!n || H.daysBetween(today, n.date) !== 1) continue;
      if (!(await once(`hb:${f.id}:${n.date}`))) continue;
      const t = T(f.lang), L = f.lang, heb = L === 'he' ? H.label(p, true) : L === 'ru' ? `${p.day} ${t(p.month)}` : H.label(p);
      await mailer.send({ to: f.email, subject: t("{name}'s Hebrew birthday is tomorrow", { name: f.name }), text: [
        t('Dear {name},', { name: f.member_name || t('friend') }), '',
        t("Tomorrow, {date}, is {name}'s Hebrew birthday ({hebrew}).", { date: day(n.date, L), name: f.name, hebrew: heb }),
        t('A Hebrew birthday is a personal Rosh Hashanah: a special day to give some charity, learn a little Torah, say your Tehillim chapter, and celebrate.'), '',
        t('Mark it with the community: sponsor a Kiddush in their honor.') + ' ' + site(L, '/sponsor?o=birthday&name=' + encodeURIComponent(f.name)),
        t('Their Tehillim chapter:') + ' ' + site(L, '/tehillim#birthday'), '',
        t('Mazal Tov!'), org.name,
      ].join('\n') });
      sent++;
    }
    return sent;
  }
  let timer = null;
  return {
    run,
    start() { const tick = () => run().catch((e) => log.error('reminder emails:', e && e.message)); timer = setInterval(tick, 3600e3); timer.unref(); setTimeout(tick, 60e3).unref(); },
    stop() { if (timer) clearInterval(timer); },
  };
}
module.exports = { createReminders };
