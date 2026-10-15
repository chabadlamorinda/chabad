// `npm run dev`: a throwaway local database with demo products, fake payments, and the real app. Nothing is charged or sent.
'use strict';
const { startPg } = require('./pg-test-helper');
const { createApp } = require('./app');
const { createDb } = require('./db');
const { fakePayments } = require('./payments');
const { fakeUber } = require('./delivery');
const { seedDemo } = require('./seed');

(async () => {
  const pg = await startPg();
  const db = createDb(pg.url);
  await db.migrate(); await seedDemo(db);
  const notifier = { live: { email: false, sms: false }, async email(to, subject) { console.log('[email]', to, subject); return true; }, async sms(to, text) { console.log('[sms]', to, text); return true; } };
  const geocoder = { async geocode() { return { lat: 37.9, lng: -122.12 }; } };
  const env = { ADMIN_PASSWORD: 'demo-password-123', PICKER_PIN: '1234', SESSION_SECRET: 'dev', PUBLIC_URL: process.env.PUBLIC_URL || '' };
  const a = await createApp({ env, db, payments: fakePayments(), notifier, geocoder, uber: fakeUber() });
  const port = Number(process.env.PORT) || 3000;
  const server = a.app.listen(port, () => console.log(`Bay Kosher demo on http://localhost:${port}\n  admin:  /admin  password: ${env.ADMIN_PASSWORD}\n  picker: /pick   PIN: ${env.PICKER_PIN}`));
  const stop = async () => { server.close(); await a.close(); await pg.stop(); process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
})();
