// One-time import of the sponsors that were already on the original Kiddush board (the Firebase site).
// Names, dedications, amounts and paid status only (no contact details). Runs once, on the first start after
// this version is deployed, and never again (so anything the Rabbi later edits or removes stays that way).
'use strict';
const cal = require('./kiddush-calendar.js');
const seed = require('./seed/kiddush-5787-sponsors.json');
const FLAG = 'legacyImported5787';

async function importLegacy(store, log = console) {
  const settings = await store.getSettings();
  if (settings[FLAG]) return 0;
  const byDate = new Map((await cal.buildYear(5787)).map((s) => [s.date, s.key]));
  let n = 0;
  for (let i = 0; i < seed.length; i++) {
    const e = seed[i], key = byDate.get(e.weekId);
    if (!key) { log.error('kiddush import: no week for', e.weekId); continue; }
    try {
      await store.createSponsorship({
        slotKey: key, status: e.status, method: e.method, name: e.name, anonymous: e.anonymous, dedicationKind: e.kind, dedication: e.dedication,
        amountCents: Math.round(e.amount * 100), source: 'admin', idem: 'legacy5787-' + i + '-' + e.weekId, note: 'Imported from the original Kiddush board',
      });
      n++;
    } catch (err) { if (!(err && err.code === '23505')) throw err; } // already there
  }
  await store.saveSettings({ [FLAG]: true });
  return n;
}
module.exports = { importLegacy };
