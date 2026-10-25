// Personal emails from the data people save on the website (needs email set up):
//  * yahrzeit reminders 7 days and 1 day before, with the candle-lighting evening;
//  * a Hebrew birthday greeting the day before a family member's Hebrew birthday.
// Runs once a day after 9 AM Lafayette time. Each email is logged so it is never sent twice.
'use strict';
const H = require('../../pushka/hebdate.js');

const ptNow = (d) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value])); return { ymd: `${p.year}-${p.month}-${p.day}`, hour: +p.hour }; };
const nice = (ymd) => new Date(ymd + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });

function createReminders({ store, mailer, base, org, log = console, now = () => new Date() }) {
  if (!store || !mailer) return null;
  const q = (t, p) => store.pool.query(t, p);
  const once = async (key) => (await q('INSERT INTO email_log (key) VALUES ($1) ON CONFLICT DO NOTHING', [key])).rowCount === 1;

  async function run() {
    const { ymd: today, hour } = ptNow(now());
    if (hour < 9) return 0;
    let sent = 0;
    // Website members (signed in at least once) get email; app-only members get the app's push reminders.
    const ys = (await q(`SELECT y.*, m.name AS member_name, m.email FROM yahrzeits y JOIN members m ON m.id=y.member_id WHERE m.last_login IS NOT NULL AND m.email <> ''`)).rows;
    for (const y of ys) {
      const n = H.next({ day: y.h_day, month: y.h_month, year: y.h_year }, today); if (!n) continue;
      const left = H.daysBetween(today, n.date);
      if (left !== 7 && left !== 1) continue;
      if (!(await once(`yz:${y.id}:${n.date}:${left}`))) continue;
      const eve = H.addDays(n.date, -1);
      await mailer.send({ to: y.email, subject: `Yahrzeit of ${y.name}: ${left === 1 ? 'tomorrow' : 'in one week'}`, text:
        `Dear ${y.member_name || 'friend'},\n\nThe yahrzeit of ${y.name} (${H.label({ day: y.h_day, month: y.h_month })}) is on ${nice(n.date)}.\nLight a 24-hour memorial candle on ${nice(eve)} before sunset.\n\nWould you like Kaddish said, an aliyah, or to sponsor the Kiddush in their memory?\nSponsor a Kiddush: ${base}/kiddush/\nCall or reply: ${org.phone}\n\nMay their soul be bound up in the bond of eternal life.\n${org.name}\n\nManage reminders: ${base}/account` });
      sent++;
    }
    const fam = (await q(`SELECT f.*, m.name AS member_name, m.email FROM family f JOIN members m ON m.id=f.member_id WHERE f.birthday IS NOT NULL AND m.news AND m.last_login IS NOT NULL`)).rows;
    for (const f of fam) {
      const b = f.birthday instanceof Date ? f.birthday.toISOString().slice(0, 10) : String(f.birthday).slice(0, 10);
      const p = H.hebrewOf(b, f.birth_after_sunset), n = H.next({ day: p.day, month: p.month }, today);
      if (!n || H.daysBetween(today, n.date) !== 1) continue;
      if (!(await once(`hb:${f.id}:${n.date}`))) continue;
      await mailer.send({ to: f.email, subject: `${f.name}'s Hebrew birthday is tomorrow`, text:
        `Dear ${f.member_name || 'friend'},\n\nTomorrow, ${nice(n.date)}, is ${f.name}'s Hebrew birthday (${H.label(p)}).\nA Hebrew birthday is a personal Rosh Hashanah: a special day to give some charity, learn a little Torah, and celebrate.\n\nMazal Tov!\n${org.name}\n${base}` });
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
