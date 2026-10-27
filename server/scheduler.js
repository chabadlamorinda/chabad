// Sends push reminders (candle lighting, daily coin, yahrzeits). Runs every minute inside the server.
// Needs an always-on server: on a sleeping free plan no reminders go out.
'use strict';
const H = require('../pushka/hebdate.js');
const PT = 'America/Los_Angeles'; // Lafayette, CA

function ptParts(date, tz = PT) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' }).formatToParts(date);
  const g = (t) => p.find((x) => x.type === t).value;
  return { ymd: g('year') + '-' + g('month') + '-' + g('day'), hour: +g('hour'), minute: +g('minute'), dow: g('weekday') };
}

const MSG = {
  en: {
    candle: (m) => ({ title: 'Candle lighting soon', body: `Candle lighting is in ${m} minutes. It’s customary to give tzedakah first.` }),
    streak: (n) => ({ title: 'Keep your streak alive', body: n >= 3 ? `Drop a coin today to keep your ${n}-day streak.` : 'Drop a coin in your pushka today.' }),
    week: (c, sum) => c > 0 ? { title: 'Your week of giving', body: `You dropped ${c} ${c === 1 ? 'coin' : 'coins'} ($${sum.toFixed(2)}) this week. Start the new week with a coin.` } : { title: 'A fresh week', body: 'Start the week with a coin in your pushka.' },
    date: (name, kind, lead) => ({ title: lead === 0 ? `Today: ${name}’s ${kind}` : `${name}’s ${kind} is in ${lead} days`, body: 'Tap to give tzedakah in their honor.' }),
    yz: (name, lead, label) => lead === 0 ? { title: `Yahrzeit of ${name}`, body: `Today is the yahrzeit (${label}). Tap to give in their memory.` }
      : lead === 1 ? { title: `Yahrzeit of ${name}`, body: `The yahrzeit begins this evening (${label}).` }
      : lead === 30 ? { title: `Yahrzeit of ${name}`, body: `In about a month (${label}). Tap to give in their memory.` }
      : { title: `Yahrzeit of ${name}`, body: `In ${lead} days (${label}). Tap to give in their memory.` },
  },
  he: {
    candle: (m) => ({ title: 'הדלקת נרות בקרוב', body: `הדלקת נרות בעוד ${m} דקות. נהוג לתת צדקה לפני כן.` }),
    streak: (n) => ({ title: 'שמרו על הרצף', body: n >= 3 ? `הטילו היום מטבע כדי לשמור על רצף של ${n} ימים.` : 'הטילו היום מטבע לקופה.' }),
    week: (c, sum) => c > 0 ? { title: 'שבוע הנתינה שלכם', body: `הטלתם ${c} מטבעות ($${sum.toFixed(2)}) השבוע. התחילו את השבוע החדש במטבע.` } : { title: 'שבוע חדש', body: 'התחילו את השבוע במטבע בקופה.' },
    date: (name, kind, lead) => ({ title: lead === 0 ? `היום: ${kind} של ${name}` : `${kind} של ${name} בעוד ${lead} ימים`, body: 'הקישו כדי לתרום לכבודם.' }),
    yz: (name, lead, label) => lead === 0 ? { title: `יארצייט של ${name}`, body: `היום יארצייט (${label}). הקישו כדי לתרום לעילוי נשמת ${name}.` }
      : lead === 1 ? { title: `יארצייט של ${name}`, body: `היארצייט מתחיל הערב (${label}).` }
      : lead === 30 ? { title: `יארצייט של ${name}`, body: `בעוד כחודש (${label}). הקישו כדי לתרום לעילוי נשמת ${name}.` }
      : { title: `יארצייט של ${name}`, body: `בעוד ${lead} ימים (${label}). הקישו כדי לתרום לעילוי נשמת ${name}.` },
  },
};

const validTz = (z) => { try { new Intl.DateTimeFormat('en-US', { timeZone: z }); return typeof z === 'string' && z.length < 60; } catch (e) { return false; } };

function hebcalCandles(zip = '94549') {
  let cache = { at: 0, items: [] };
  return async () => {
    if (Date.now() - cache.at < 6 * 3600e3) return cache.items;
    try {
      const j = await (await fetch(`https://www.hebcal.com/shabbat?cfg=json&zip=${zip}&M=on`)).json();
      cache = { at: Date.now(), items: (j.items || []).filter((i) => i.category === 'candles').map((i) => i.date) };
    } catch (e) { cache.at = Date.now() - 5 * 3600e3; } // try again in an hour
    return cache.items;
  };
}

function createScheduler({ store, send, getCandles = hebcalCandles(), log = console }) {
  async function deliver(sub, payload) {
    try { await send(sub, payload); return 1; }
    catch (e) { if (e && (e.statusCode === 404 || e.statusCode === 410)) await store.deletePushSub(sub.endpoint); else log.error('push error:', e && (e.statusCode || e.message)); return 0; }
  }
  async function tick(now = new Date()) {
    const subs = await store.listPushSubs(); if (!subs.length) return 0;
    const t0 = ptParts(now), candles = (await getCandles()) || [], candleToday = candles.some((c) => ptParts(new Date(c)).ymd === t0.ymd);
    const yzByMember = {}; for (const y of await store.allYahrzeitsWithPush()) (yzByMember[y.member_id] = yzByMember[y.member_id] || []).push(y);
    let sent = 0;
    for (const sub of subs) {
      const p = sub.prefs || {}, M = MSG[p.lang === 'he' ? 'he' : 'en'], t = ptParts(now, validTz(p.tz) ? p.tz : PT);
      if (p.streak && p.streak.on && p.lastCoin !== t.ymd && t.dow !== 'Sat') {
        const early = t.dow === 'Fri' || candleToday, weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(t.dow);
        if ((weekday || candleToday) && t.hour === (early ? 13 : 20) && t.minute < 10 && await store.logOnce(sub.id, 'st:' + t.ymd)) sent += await deliver(sub, { ...M.streak(p.streakN || 0), url: '/pushka/', tag: 'streak' });
      }
      if (p.candle && p.candle.on) for (const c of candles) {
        const mins = p.candle.mins || 15, at = new Date(c).getTime() - mins * 60e3;
        if (now.getTime() >= at && now.getTime() < at + 10 * 60e3 && await store.logOnce(sub.id, `cd:${c}:${mins}`)) sent += await deliver(sub, { ...M.candle(mins), url: '/pushka/', tag: 'candle' });
      }
      if (p.weekly && p.weekly.on && t.dow === 'Sun' && t.hour === 10 && t.minute < 10 && await store.logOnce(sub.id, 'wk:' + t.ymd)) sent += await deliver(sub, { ...M.week((p.week && p.week.coins) || 0, (p.week && p.week.sum) || 0), url: '/pushka/', tag: 'week' });
      for (const c of Array.isArray(p.custom) ? p.custom : []) {
        const [hh, mm] = String(c.time || '').split(':').map(Number); if (!(hh >= 0) || !(mm >= 0)) continue;
        const mins = t.hour * 60 + t.minute, at = hh * 60 + mm;
        if (mins >= at && mins < at + 10 && (c.days === 'once' ? c.date === t.ymd : H.dayType(c.days, t.ymd)) && await store.logOnce(sub.id, `cu:${c.id}:${t.ymd}`)) sent += await deliver(sub, { title: p.lang === 'he' ? 'קופת הצדקה שלי' : 'My Pushka', body: c.text || (p.lang === 'he' ? 'הגיע הזמן לתת צדקה!' : 'Time to give tzedakah!'), url: '/pushka/', tag: 'cu-' + c.id });
      }
      if (t.hour === 8 && t.minute < 10) for (const d of Array.isArray(p.dates) ? p.dates : []) {
        for (const lead of [7, 0]) { const day = H.addDays(t.ymd, lead), [, mo, da] = day.split('-').map(Number); if (mo === d.m && da === d.d && await store.logOnce(sub.id, `dt:${d.id}:${day}:${lead}`)) sent += await deliver(sub, { ...M.date(d.name, d.kind, lead), url: '/pushka/?go=occasions', tag: 'dt-' + d.id }); }
      }
      if (p.yahrzeit && p.yahrzeit.on && sub.member_id && t.hour === 8 && t.minute < 10) {
        const leads = p.yahrzeit.leads && p.yahrzeit.leads.length ? p.yahrzeit.leads : [30, 7, 1];
        for (const e of yzByMember[sub.member_id] || []) {
          const occ = H.next({ day: e.h_day, month: e.h_month, year: e.h_year }, t.ymd); if (!occ) continue;
          const days = H.daysBetween(t.ymd, occ.date);
          if (leads.includes(days) && await store.logOnce(sub.id, `yz:${e.id}:${occ.date}:${days}`)) sent += await deliver(sub, { ...M.yz(e.name, days, H.label({ day: e.h_day, month: e.h_month }, p.lang === 'he')), url: '/pushka/?go=yahrzeit', tag: 'yz-' + e.id });
        }
      }
    }
    return sent;
  }
  let timer = null;
  return { tick, deliver, start() { timer = setInterval(() => tick().catch((e) => log.error('scheduler error:', e.message)), 60000); }, stop() { clearInterval(timer); } };
}
module.exports = { createScheduler, ptParts, hebcalCandles, MSG, validTz };
