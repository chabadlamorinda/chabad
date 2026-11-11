// Starts a throwaway real Postgres for tests (via the embedded-postgres dev dependency).
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
// Asks the system for a port nobody is using (the test files start their own databases at the same time, so a random
// number could clash), and tries again with a new port if the database does not start.
const net = require('net');
const freePort = () => new Promise((resolve, reject) => { const s = net.createServer(); s.once('error', reject); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
async function startPg() {
  if (process.env.TEST_DATABASE_URL) return { url: process.env.TEST_DATABASE_URL, stop: async () => {} };
  const EmbeddedPostgres = require('embedded-postgres').default;
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-'));
    const port = await freePort();
    try {
      if (process.getuid && process.getuid() === 0) cp.execSync(`chown -R postgres:postgres ${dir} && chmod 700 ${dir}`);
      const pg = new EmbeddedPostgres({ databaseDir: dir, port, user: 'u', password: 'p', persistent: false, onLog() {}, onError() {} });
      await pg.initialise(); await pg.start();
      return { url: `postgres://u:p@127.0.0.1:${port}/postgres`, stop: async () => { await pg.stop(); fs.rmSync(dir, { recursive: true, force: true }); } };
    } catch (e) {
      lastError = e; fs.rmSync(dir, { recursive: true, force: true });
      console.error(`test database: attempt ${attempt} on port ${port} failed: ${e && e.message}`);
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  throw lastError;
}
module.exports = { startPg };
