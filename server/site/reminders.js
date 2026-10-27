// Personal emails from the data people save on the website (needs email set up):
//  * yahrzeit reminders 7 days and 1 day before, with the candle-lighting evening;
//  * a Hebrew birthday greeting the day before a family member's Hebrew birthday.
// Runs once a day after 9 AM Lafayette time. Each email is logged so it is never sent twice.
'use strict';
const H = require('../../pushka/hebdate.js');
const { fmtClock } = require('./content.js');

const ptNow = (d) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value])); return { ymd: `${p.year}-${p.month}-${p.day}`, hour: +p.hour }; };

function createReminders({ store, mailer, base, org, log = console, now = () => new Date(), i18n = null, townsOf = null }) {
  if (!store || !mailer) return null;
  const q = (t, p) => store.pool.query(t, p);
  const T = (lang) => (i18n ? i18n.makeT(lang) : (x, v) => (v ? x.replace(/\{(\w+)\}/g, (m, k) => v[k]) : x));
  const LOC = { en: 'en-US', he: 'he-IL', ru: 'ru-RU' };
  const day = (ymd, lang) => new Date(ymd + 'T12:00:00Z').toLocaleDateString(LOC[lang] || 'en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
  const site = (lang, p) => base + (lang === 'he' || lang === 'ru' ? '/' + lang : '') + p;
  const once = async (key) => (await q('INSERT INTO email_log (key) VALUES ($1) ON CONFLICT DO NOTHING', [key])).rowCount === 1;

  async function run() {
    // Each email is logged by a stable key (who, which person, which date), so editing the family never re-sends it.
    // A failed send releases its key so it is tried again next hour, and never stops the other emails.
    let sent = 0, key = '';
    const send = async (k, msg) => { try { await mailer.send(msg); sent++; } catch (e) { await q('DELETE FROM email_log WHERE key=$1', [k]).catch(() => {}); log.error('reminder email:', e && e.message); } };
    const { ymd: today, hour } = ptNow(now());
    if (hour < 9) return 0;
    // Website members (signed in at least once) get email; app-only members get the app's push reminders.
    const ys = (await q(`SELECT y.*, m.name AS member_name, m.email, m.lang FROM yahrzeits y JOIN members m ON m.id=y.member_id WHERE m.last_login IS NOT NULL AND m.email <> ''`)).rows;
    for (const y of ys) {
      const n = H.next({ day: y.h_day, month: y.h_month, year: y.h_year }, today); if (!n) continue;
      const left = H.daysBetween(today, n.date);
      if (left !== 7 && left !== 1) continue;
      if (!(await once(key = `yz:${y.member_id}:${y.name}:${n.date}:${left}`))) continue;
      const eve = H.addDays(n.date, -1);
      const t = T(y.lang), L = y.lang, heb = L === 'he' ? H.label({ day: y.h_day, month: y.h_month }, true) : L === 'ru' ? `${y.h_day} ${t(y.h_month)}` : H.label({ day: y.h_day, month: y.h_month });
      await send(key, { to: y.email, subject: t(left === 1 ? 'Yahrzeit of {name}: tomorrow' : 'Yahrzeit of {name}: in one week', { name: y.name }), text: [
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
    }
    const fam = (await q(`SELECT f.*, m.name AS member_name, m.email, m.lang FROM family f JOIN members m ON m.id=f.member_id WHERE f.birthday IS NOT NULL AND m.news AND m.last_login IS NOT NULL`)).rows;
    for (const f of fam) {
      const b = f.birthday instanceof Date ? f.birthday.toISOString().slice(0, 10) : String(f.birthday).slice(0, 10);
      const p = H.hebrewOf(b, f.birth_after_sunset), n = H.next({ day: p.day, month: p.month }, today);
      if (!n || H.daysBetween(today, n.date) !== 1) continue;
      if (!(await once(key = `hb:${f.member_id}:${f.name}:${n.date}`))) continue;
      const t = T(f.lang), L = f.lang, heb = L === 'he' ? H.label(p, true) : L === 'ru' ? `${p.day} ${t(p.month)}` : H.label(p);
      await send(key, { to: f.email, subject: t("{name}'s Hebrew birthday is tomorrow", { name: f.name }), text: [
        t('Dear {name},', { name: f.member_name || t('friend') }), '',
        t("Tomorrow, {date}, is {name}'s Hebrew birthday ({hebrew}).", { date: day(n.date, L), name: f.name, hebrew: heb }),
        t('A Hebrew birthday is a personal Rosh Hashanah: a special day to give some charity, learn a little Torah, say your Tehillim chapter, and celebrate.'), '',
        t('Mark it with the community: sponsor a Kiddush in their honor.') + ' ' + site(L, '/sponsor?o=birthday&name=' + encodeURIComponent(f.name)),
        t('Their Tehillim chapter:') + ' ' + site(L, '/tehillim#birthday'), '',
        t('Mazal Tov!'), org.name,
      ].join('\n') });
    }
    // Friday morning: candle lighting for the family's own town (for those who asked for it in My account).
    if (new Date(today + 'T12:00:00Z').getUTCDay() === 5) {
      const Z = require('./zmanim.js');
      const fri = (await q("SELECT id, name, verified_email AS email, lang, town FROM members WHERE shabbat_email AND verified_email IS NOT NULL AND last_login IS NOT NULL")).rows;
      for (const m of fri) {
        const towns = townsOf ? townsOf(['he', 'ru'].includes(m.lang) ? m.lang : 'en') : [], tw = towns.find((x) => x.slug === m.town) || towns.find((x) => x.slug === 'lafayette') || null;
        const where = tw ? { lat: tw.lat, lng: tw.lng, name: tw.slug } : undefined, sh = await Z.thisShabbat(new Date(today + 'T20:00:00Z'), where);
        if (!sh.candles || sh.candles.date !== today || !(await once(key = `shabbat:${m.id}:${today}`))) continue;
        const ks = org.kabbalatShabbat ? await Z.kabbalatShabbat(org.kabbalatShabbat, new Date(today + 'T20:00:00Z')) : null;
        const t = T(m.lang), L = m.lang, loc = { en: 'en-US', he: 'he-IL', ru: 'ru-RU' }[L] || 'en-US', tm = (e) => Z.fmtTime(e.time, loc), town = tw ? tw.name : 'Lafayette';
        await send(key, { to: m.email, subject: t('Shabbat candle lighting today: {time} in {town}', { time: tm(sh.candles), town }), text: [
          t('Dear {name},', { name: m.name || t('friend') }), '',
          t('Candle lighting today in {town}: {time}.', { town, time: tm(sh.candles) }) + (sh.havdalah ? ' ' + t('Shabbat ends tomorrow at {time}.', { time: tm(sh.havdalah) }) : ''),
          ks ? t('Kabbalat Shabbat at Chabad of Lamorinda: {time}', { time: fmtClock(ks, L === 'en' || !L ? 'en' : L) }) : null,
          sh.parsha ? t("This week's Torah portion:") + ' ' + (L === 'he' ? sh.parsha.titleHe : t(sh.parsha.title)) + ' ' + site(L, '/parsha') : '', '',
          t('Shabbat services and Kiddush:') + ' ' + site(L, '/shabbat'), t('Shabbat dinner:') + ' ' + site(L, '/forms/shabbat-meal'), '',
          t('Shabbat Shalom!'), org.name, '', t('Manage reminders:') + ' ' + site(L, '/account'),
        ].filter((x) => x !== null).join('\n') });
      }
    }
    // Welcome series for families new to the website: a welcome the day after they join, a Shabbat dinner
    // invitation a few days later, and what fits their family after about ten days. Each email once.
    const fresh = (await q(`SELECT id, name, email, lang, ((now() AT TIME ZONE 'America/Los_Angeles')::date - (first_login AT TIME ZONE 'America/Los_Angeles')::date) AS days FROM members
      WHERE first_login > now() - interval '15 days' AND email <> '' AND news`)).rows;
    for (const m of fresh) {
      const step = m.days >= 10 ? 3 : m.days >= 4 ? 2 : m.days >= 1 ? 1 : 0;
      if (!step || !(await once(key = `welcome:${m.id}:${step}`))) continue;
      const t = T(m.lang), L = m.lang, hi = t('Dear {name},', { name: m.name || t('friend') });
      const mail = {
        1: [t('Welcome to Chabad of Lamorinda!'), [hi, '', t('Thank you for joining us. Chabad of Lamorinda is a warm Jewish home for every Jew in Lafayette, Moraga, Orinda and nearby: no membership, no dues, and everyone is welcome.'), '',
          t('Add your family, birthdays and yahrzeits in your account and we will remind you of the important dates:') + ' ' + site(L, '/account'),
          t('Shabbat times for your town:') + ' ' + site(L, '/shabbat-times'), t('What is coming up:') + ' ' + site(L, '/events'), '', t('Call or reply:') + ' ' + org.phone, '', org.name]],
        2: [t('Join us for Shabbat'), [hi, '', t('We would love to have you for Shabbat. Come to services on Saturday morning with a Kiddush lunch, or join the Rabbi\'s family for a Shabbat dinner. Just let us know you are coming.'), '',
          t('Shabbat dinner:') + ' ' + site(L, '/forms/shabbat-meal'), t('Shabbat services and Kiddush:') + ' ' + site(L, '/shabbat'), '', org.name]],
        3: [t('Something for everyone in your family'), [hi, '', t('Here is what Chabad of Lamorinda offers, for every age:'),
          t('Children: preschool, Hebrew School, CKids afterschool and camp:') + ' ' + site(L, '/programs'), t('Adults: weekly Torah classes:') + ' ' + site(L, '/programs/adult-education'),
          t('Guides to Jewish life in Lamorinda:') + ' ' + site(L, '/learn'), t('Here for you in every life situation:') + ' ' + site(L, '/help'), '', t('Call or reply:') + ' ' + org.phone, '', org.name]],
      }[step];
      await send(key, { to: m.email, subject: mail[0], text: [...mail[1], '', t('Manage reminders:') + ' ' + site(L, '/account')].join('\n') });
    }
    // Bar/Bat Mitzvah: one warm invitation about 18 months ahead, so there is time to prepare together.
    const Z = require('./zmanim.js');
    const kids = (await q(`SELECT f.id, f.member_id, f.name, f.gender, to_char(f.birthday,'YYYY-MM-DD') AS b, f.birth_after_sunset, m.name AS member_name, m.email, m.lang FROM family f JOIN members m ON m.id=f.member_id
      WHERE f.relation='child' AND f.gender IN ('m','f') AND f.birthday IS NOT NULL AND m.news AND m.last_login IS NOT NULL AND m.email <> ''`)).rows;
    for (const k of kids) {
      const [y, mo, d] = k.b.split('-').map(Number), md = await Z.mitzvahDate(new Date(y, mo - 1, d), k.birth_after_sunset, k.gender === 'f');
      const left = H.daysBetween(today, md.date);
      if (left < 60 || left > 548 || !(await once(key = `mitzvah:${k.member_id}:${k.name}`))) continue;
      const t = T(k.lang), L = k.lang, bat = k.gender === 'f';
      await send(key, { to: k.email, subject: t(bat ? "{name}'s Bat Mitzvah is coming up" : "{name}'s Bar Mitzvah is coming up", { name: k.name }), text: [
        t('Dear {name},', { name: k.member_name || t('friend') }), '',
        t(bat ? "{name}'s Bat Mitzvah, by the Jewish calendar, is on {date}. Mazal Tov!" : "{name}'s Bar Mitzvah, by the Jewish calendar, is on {date}. Mazal Tov!", { name: k.name, date: day(md.date, L) }),
        t('Now is a wonderful time to start preparing together: learning, mitzvahs and a celebration that fits your family. The Rabbi would love to help.'), '',
        t('Bar and Bat Mitzvah at Chabad of Lamorinda:') + ' ' + site(L, '/programs/bar-bat-mitzvah'),
        t('Talk to the Rabbi:') + ' ' + site(L, '/help/bar-bat-mitzvah'),
        t('Call or reply:') + ' ' + org.phone, '',
        org.name,
      ].join('\n') });
    }
    // Mezuzah and tefillin checking (twice in seven years): one email when 3.5 years have passed since the last check.
    const { checkDue } = require('./community.js');
    const ms = (await q(`SELECT id, name, email, lang, to_char(mezuzahs_checked,'YYYY-MM-DD') AS mez, to_char(tefillin_checked,'YYYY-MM-DD') AS tef FROM members WHERE last_login IS NOT NULL AND email <> '' AND (mezuzahs_checked IS NOT NULL OR tefillin_checked IS NOT NULL)`)).rows;
    for (const m of ms) {
      for (const [what, last] of [['mezuzahs', m.mez], ['tefillin', m.tef]]) {
        const due = checkDue(last);
        if (!due || due > today || !(await once(key = `check:${what}:${m.id}:${due}`))) continue;
        const t = T(m.lang), L = m.lang;
        await send(key, { to: m.email, subject: t(what === 'mezuzahs' ? 'Time to have your mezuzahs checked' : 'Time to have your tefillin checked'), text: [
          t('Dear {name},', { name: m.name || t('friend') }), '',
          t(what === 'mezuzahs' ? 'Your mezuzahs were last checked on {date}. Mezuzahs should be checked by a scribe twice in seven years, so it is time again.' : 'Your tefillin were last checked on {date}. Tefillin should be checked by a scribe twice in seven years, so it is time again.', { date: day(last, L) }),
          t('We can send them to a scribe for you. Ask here:') + ' ' + site(L, '/forms/mezuzah-tefillin'),
          t('Call or reply:') + ' ' + org.phone, '',
          org.name, '', t('Manage reminders:') + ' ' + site(L, '/account'),
        ].join('\n') });
        }
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
