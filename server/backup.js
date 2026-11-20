// A full copy of everything the website keeps in its database (members and families, yahrzeits, RSVPs, forms, Kaddish
// and prayer-list requests, subscribers, donors and the books, Kiddush sponsorships, campaigns...), as one compressed
// JSON file. The Rabbi can download it any time (Rabbi's desk → "Download a full backup", /admin/api/backup) and it is
// emailed to him every Sunday morning (reminders.js), so a copy always exists outside the database.
// Left out: the page-view log (visitor_views) and the email log, which are large and can be rebuilt.
// The content itself (guides, events, pages) lives in GitHub, which keeps every version.
'use strict';
const zlib = require('zlib');
const SKIP = new Set(['visitor_views', 'visitor_sources', 'visitor_hits', 'email_log']);

async function snapshot(pool) {
  const tables = (await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name")).rows.map((r) => r.table_name).filter((t) => !SKIP.has(t));
  const out = { made_at: new Date().toISOString(), site: 'Chabad of Lamorinda', tables: {} };
  for (const t of tables) out.tables[t] = (await pool.query(`SELECT * FROM "${t.replace(/"/g, '')}"`)).rows;
  return out;
}
async function backupFile(pool) {
  const data = await snapshot(pool), day = data.made_at.slice(0, 10);
  const counts = Object.fromEntries(Object.entries(data.tables).map(([k, v]) => [k, v.length]));
  return { name: `chabad-lamorinda-backup-${day}.json.gz`, content: zlib.gzipSync(JSON.stringify(data)), counts };
}
// The Rabbi keeps his own copy: every 4 weeks the desk ("Waiting for you") and an email on Sunday ask him to download one
// (a copy on the same machine does not survive losing the machine). Downloading it from the desk ticks it off.
const REMIND_DAYS = 28;
async function backupStatus(store, now = new Date()) {
  const last = await store.getKv('backup-downloaded', null).catch(() => null);
  let since = await store.getKv('backup-since', null).catch(() => null);
  if (!since) { since = { at: now.toISOString() }; await store.setKv('backup-since', since).catch(() => {}); } // the clock starts the first time anyone asks
  const days = Math.floor((now - new Date((last && last.at) || since.at)) / 864e5);
  return { lastAt: last ? last.at : null, days, due: days >= REMIND_DAYS };
}
function mountBackupAdmin(r2, { authed, wrap }, { store }) {
  r2.get('/api/backup', authed, wrap(async (req, res) => {
    if (!store || !store.pool) return res.status(503).json({ code: 'not_configured', error: 'Needs the database.' });
    const f = await backupFile(store.pool);
    await store.setKv('backup-downloaded', { at: new Date().toISOString() }).catch(() => {});
    res.set('Cache-Control', 'no-store').type('application/gzip').attachment(f.name).send(f.content);
  }));
  r2.get('/api/backup/status', authed, wrap(async (req, res) => {
    if (!store || !store.pool) return res.status(503).json({ code: 'not_configured', error: 'Needs the database.' });
    res.json(await backupStatus(store));
  }));
}
module.exports = { snapshot, backupFile, mountBackupAdmin, backupStatus, REMIND_DAYS };
