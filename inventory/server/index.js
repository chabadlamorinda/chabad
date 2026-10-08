// Bay Kosher Market inventory server.
//
// Environment (set these in Render -> Environment; never commit them):
//   APP_PASSWORD              password to sign in to the app
//   SESSION_SECRET            long random string (Render can generate it)
//   DATA_DIR                  where the database lives (a persistent disk, e.g. /var/data)
//   CLOVER_MERCHANT_ID, CLOVER_API_TOKEN, CLOVER_REGION (us)
//   CLOUDGROCER_API_URL (https://baykosher.com/api), CLOUDGROCER_API_USER, CLOUDGROCER_API_PASSWORD
//   CLOUDGROCER_FTP_HOST (ftp.mycloudgrocer.com), CLOUDGROCER_FTP_PORT (1175), CLOUDGROCER_FTP_USER, CLOUDGROCER_FTP_PASSWORD
//   IMAP_HOST (imap.gmail.com), IMAP_USER, IMAP_PASSWORD (an app password)
//   ANTHROPIC_API_KEY         reads invoices
'use strict';

if (!process.env.TZ) process.env.TZ = 'America/Los_Angeles';

const path = require('path');
const fs = require('fs');
const { openDb } = require('./db');
const { createSync } = require('./sync');
const { createApp } = require('./app');
const { claudeExtractor } = require('./invoices');

const demo = process.argv.includes('--demo');
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = openDb(demo ? ':memory:' : path.join(dataDir, 'inventory.db'));

let password = process.env.APP_PASSWORD, secret = process.env.SESSION_SECRET;
if (demo) { password = password || 'demo1234'; secret = secret || require('crypto').randomBytes(32).toString('hex'); require('./demo').loadDemo(db); }
if (!password || password.length < 6) { console.error('Set APP_PASSWORD (6+ characters).'); process.exit(1); }
if (!secret || secret.length < 16) { console.error('Set SESSION_SECRET (16+ characters).'); process.exit(1); }

const extract = claudeExtractor();
const sync = createSync(db, { extract, ...(demo ? { config: { clover: null, webOrders: null, webFtp: null, email: null, claude: false } } : {}) });
const app = createApp({ db, sync, password, sessionSecret: secret, extract });
const port = process.env.PORT || 3100;
app.listen(port, () => {
  const c = sync.status().connected;
  console.log(`Inventory app on port ${port}${demo ? ' (demo data, password "' + password + '")' : ''}`);
  console.log('Connections:', Object.entries(c).map(([k, v]) => k + (v ? ' ✓' : ' –')).join('  '));
  if (!demo) sync.start({ stockMin: Number(process.env.SYNC_EVERY_MIN) || 10 });
});

const shutdown = () => { sync.stop(); try { db.raw.close(); } catch {} process.exit(0); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
