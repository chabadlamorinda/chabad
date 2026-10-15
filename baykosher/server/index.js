// Production entry: real Stripe, Resend/Twilio, Clover and Uber when their keys are set.
'use strict';
const { createApp } = require('./app');
const { createNotifier } = require('./notify');
const { createDb } = require('./db');
const { stripePayments, fakePayments } = require('./payments');
const { createClover } = require('./clover');
const { createUber } = require('./delivery');

(async () => {
  const env = process.env;
  if (!env.DATABASE_URL) { console.error('DATABASE_URL is required'); process.exit(1); }
  const db = createDb(env.DATABASE_URL);
  const notifier = createNotifier(db, env);
  let payments, stripeEvents = null;
  if (env.STRIPE_SECRET_KEY) {
    payments = stripePayments(env.STRIPE_SECRET_KEY);
    if (env.STRIPE_WEBHOOK_SECRET) { const Stripe = require('stripe'); const s = new Stripe(env.STRIPE_SECRET_KEY); stripeEvents = (raw, sig) => s.webhooks.constructEvent(raw, sig, env.STRIPE_WEBHOOK_SECRET); }
  } else if (env.NODE_ENV !== 'production' || env.ALLOW_FAKE_PAYMENTS === '1') { payments = fakePayments(); console.warn('No STRIPE_SECRET_KEY: using fake payments (nothing is charged).'); }
  else { console.error('STRIPE_SECRET_KEY is required in production'); process.exit(1); }
  const clover = env.CLOVER_MERCHANT_ID && env.CLOVER_TOKEN ? createClover({ merchantId: env.CLOVER_MERCHANT_ID, token: env.CLOVER_TOKEN, base: env.CLOVER_BASE || 'https://api.clover.com' }) : null;
  const uber = env.UBER_CLIENT_ID && env.UBER_CLIENT_SECRET && env.UBER_CUSTOMER_ID ? createUber({ clientId: env.UBER_CLIENT_ID, clientSecret: env.UBER_CLIENT_SECRET, customerId: env.UBER_CUSTOMER_ID }) : null;
  if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 12) console.warn('Set ADMIN_PASSWORD (12+ characters) to use /admin.');
  const a = await createApp({ env, db, payments, notifier, clover, uber, stripeEvents });
  a.jobs.start();
  if (clover && env.CLOVER_SYNC_MINUTES !== '0') {
    const every = Math.max(5, Number(env.CLOVER_SYNC_MINUTES) || 15) * 60000;
    setInterval(() => a.syncClover && a.syncClover().catch((e) => console.error('clover sync', e.message)), every).unref();
  }
  const port = Number(env.PORT) || 3000;
  a.app.listen(port, () => console.log(`Bay Kosher running on :${port}`));
})().catch((e) => { console.error(e); process.exit(1); });
