// Starts a throwaway real Postgres for tests (via the embedded-postgres dev dependency).
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
async function startPg() {
  if (process.env.TEST_DATABASE_URL) return { url: process.env.TEST_DATABASE_URL, stop: async () => {} };
  const EmbeddedPostgres = require('embedded-postgres').default;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-'));
  const port = 54000 + Math.floor(Math.random() * 1000);
  if (process.getuid && process.getuid() === 0) cp.execSync(`chown -R postgres:postgres ${dir} && chmod 700 ${dir}`);
  const pg = new EmbeddedPostgres({ databaseDir: dir, port, user: 'u', password: 'p', persistent: false, onLog() {}, onError() {} });
  await pg.initialise(); await pg.start();
  return { url: `postgres://u:p@127.0.0.1:${port}/postgres`, stop: async () => { await pg.stop(); fs.rmSync(dir, { recursive: true, force: true }); } };
}
module.exports = { startPg };
