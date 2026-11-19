'use strict';
// Prints the read-only GitHub key the Rabbi saved in the Rabbi area (Keys and settings, "GitHub key for the CRM and Invitations apps":
// GITHUB_APPS_TOKEN). It is kept encrypted in the website's database; this decrypts it for update-apps.sh, which runs as root on the
// server. Prints nothing (and exits 0) when no key was saved. ENV_FILE and APP_DIR are only changed by the tests.
const fs = require('fs');
const env = {};
for (const l of fs.readFileSync(process.env.ENV_FILE || '/etc/kiddush.env', 'utf8').split('\n')) { const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(l); if (m) env[m[1]] = m[2]; }
const APP = process.env.APP_DIR || '/opt/kiddush';
const { Pool } = require(APP + '/node_modules/pg');
const { unseal } = require(APP + '/server/site/secure-settings.js');
(async () => {
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  try {
    const r = await pool.query("SELECT value FROM kv WHERE key='secure-settings'");
    let saved = r.rows[0] && r.rows[0].value; if (typeof saved === 'string') saved = JSON.parse(saved);
    const sealed = saved && saved.GITHUB_APPS_TOKEN;
    if (sealed) process.stdout.write(unseal(sealed, env.SESSION_SECRET));
  } finally { await pool.end(); }
})().catch(() => process.exit(1));
