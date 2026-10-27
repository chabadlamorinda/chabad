// Runs the whole website on this computer for trying out changes: a throwaway database (deleted on exit), the Rabbi
// area with the password "dev-password-123", and emails printed here instead of sent.
//   npm run dev   ->  http://localhost:3000  and  http://localhost:3000/admin/
'use strict';
const { createApp } = require('../server/index.js');
const { createStore } = require('../server/store.js');
const { startPg } = require('../server/pg-test-helper.js');

(async () => {
  const port = Number(process.env.PORT) || 3000, pg = await startPg(), store = createStore(pg.url);
  await store.migrate();
  const app = createApp({
    stripe: null, sessionSecret: 'dev-'.repeat(8), store, adminPassword: 'dev-password-123',
    siteEnv: { PUBLIC_URL: 'http://localhost:' + port, SITE_HOME: '1' },
    mailer: { send: async (m) => console.log(`\n--- email to ${m.to}: ${m.subject}\n${m.text}\n---`) },
  });
  const server = app.listen(port, () => console.log(`Website: http://localhost:${port}   Rabbi area: http://localhost:${port}/admin/ (password dev-password-123)`));
  const stop = async () => { server.close(); await store.close(); await pg.stop(); process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
})().catch((e) => { console.error(e); process.exit(1); });
