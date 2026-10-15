// Sends push reminders (candle lighting, daily coin, yahrzeits). Runs every minute inside the server.
// Needs an always-on server: on a sleeping free plan no reminders go out.
'use strict';
const H = require('../pushka/hebdate.js');
const PT = 'America/Los_Angeles'; // Lafayette, CA

function ptParts(date) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: PT, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' }).formatToParts(date);
  const g = (t) => p.find((x) => x.type === t).value;
  return { ymd: g('year') + '-' + g('month') + '-' + g('day'), hour: +g('hour'), minute: +g('minute'), dow: g('weekday') };
}

const MSG = {
  en: {
    candle: (m) => ({ title: 'Candle lighting soon', body: `Candle lighting is in ${m} minutes. It’s customary to give tzedakah first.` }),
    streak: () => ({ title: 'Keep your streak alive', body: 'Drop a coin in your pushka today.' }),
    yz: (name, lead, label) => lead === 0 ? { title: `Yahrzeit of ${name}`, body: `Today is the yahrzeit (${label}). Tap to give in their memory.` }
      : lead === 1 ? { title: `Yahrzeit of ${name}`, body: `The yahrzeit begins this evening (${label}).` }
      : lead === 30 ? { title: `Yahrzeit of ${name}`, body: `In about a month (${label}). Tap to give in their memory.` }
      : { title: `Yahrzeit of ${name}`, body: `In ${lead} days (${label}). Tap to give in their memory.` },
  },
  he: {
    candle: (m) => ({ title: 'הדלקת נרות בקרוב', body: `הדלקת נרות בעוד ${m} דקות. נהוג לתת צדקה לפני כן.` }),
    streak: () => ({ title: 'שמרו על הרצף', body: 'הטילו היום מטבע לקופה.' }),
    yz: (name, lead, label) => lead === 0 ? { title: `יארצייט של ${name}`, body: `היום יארצייט (${label}). הקישו כדי לתרום לעילוי נשמת ${name}.` }
      : lead === 1 ? { title: `יארצייט של ${name}`, body: `היארצייט מתחיל הערב (${label}).` }
      : lead === 30 ? { title: `יארצייט של ${name}`, body: `בעוד כחודש (${label}). הקישו כדי לתרום לעילוי נשמת ${name}.` }
      : { title: `יארצייט של ${name}`, body: `בעוד ${lead} ימים (${label}). הקישו כדי לתרום לעילוי נשמת ${name}.` },
  },
};

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
    const t = ptParts(now), candles = (await getCandles()) || [], candleToday = candles.some((c) => ptParts(new Date(c)).ymd === t.ymd);
    const yzByMember = {}; for (const y of await store.allYahrzeitsWithPush()) (yzByMember[y.member_id] = yzByMember[y.member_id] || []).push(y);
    let sent = 0;
    for (const sub of subs) {
      const p = sub.prefs || {}, M = MSG[p.lang === 'he' ? 'he' : 'en'];
      if (p.streak && p.streak.on && p.lastCoin !== t.ymd && t.dow !== 'Sat') {
        const early = t.dow === 'Fri' || candleToday, weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(t.dow);
        if ((weekday || candleToday) && t.hour === (early ? 13 : 20) && t.minute < 10 && await store.logOnce(sub.id, 'st:' + t.ymd)) sent += await deliver(sub, { ...M.streak(), url: '/pushka/', tag: 'streak' });
      }
      if (p.candle && p.candle.on) for (const c of candles) {
        const mins = p.candle.mins || 15, at = new Date(c).getTime() - mins * 60e3;
        if (now.getTime() >= at && now.getTime() < at + 10 * 60e3 && await store.logOnce(sub.id, `cd:${c}:${mins}`)) sent += await deliver(sub, { ...M.candle(mins), url: '/pushka/', tag: 'candle' });
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
module.exports = { createScheduler, ptParts, hebcalCandles, MSG };
