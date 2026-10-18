// Kiddush board server: TV display, phone sponsor page, Stripe card payments and the staff page.
//
// Environment variables (see .env.example):
//   SESSION_SECRET          long random string (16+ characters). Render can generate one for you.
//   DATABASE_URL            Postgres connection string (without it the TV shows the calendar but nobody can sponsor)
//   ADMIN_PASSWORD          12+ characters; opens the staff page at /admin/kiddush/
//   STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET   optional, for card payments
//   SMTP_URL, MAIL_FROM     optional, for emailing payment reminders
'use strict';

const path = require('path');
const express = require('express');
const { mountAdmin } = require('./admin.js');
const { createKiddush } = require('./kiddush.js');
const { loadConfig } = require('./config.js');

const ROOT = path.join(__dirname, '..');

/** @param {{ stripe?: any, publishableKey?: string, sessionSecret: string, log?: Pick<Console,'error'>, store?: any, adminPassword?: string, mailer?: any, reminders?: boolean, webhookSecret?: string, now?: () => Date, config?: object }} opts */
function createApp({ stripe = null, sessionSecret, log = console, store = null, adminPassword = '', mailer = null, reminders = false, webhookSecret = '', now = () => new Date(), config = loadConfig() }) {
  const kiddush = createKiddush({ store, stripe, log, now, mailer, config });
  if (reminders) kiddush.startReminders(); // emails unpaid sponsors a reminder after a few days (needs email set up)
  const app = express();
  app.locals.kiddush = kiddush; // (used by tests)
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Content-Security-Policy', [
      "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "font-src 'self'", "img-src 'self' data:",
      "connect-src 'self' https://www.hebcal.com", "object-src 'none'", "base-uri 'self'", "form-action 'self' https://checkout.stripe.com", "frame-ancestors 'none'",
    ].join('; '));
    next();
  });

  // tiny in-memory rate limiter
  const hits = new Map();
  const limit = (id, max, windowMs) => (req, res, next) => {
    const key = id + '|' + req.ip, t = Date.now(), e = hits.get(key);
    if (!e || t > e.reset) hits.set(key, { n: 1, reset: t + windowMs });
    else if (++e.n > max) return res.status(429).json({ code: 'rate_limited', error: 'Too many requests. Please wait a moment.' });
    next();
  };
  setInterval(() => { const t = Date.now(); for (const [k, v] of hits) if (t > v.reset) hits.delete(k); }, 60000).unref();

  app.get('/healthz', (req, res) => res.type('text').send('ok'));

  // Stripe tells us when a card checkout was paid or expired (needs the raw body to check the signature).
  app.post('/api/stripe/webhook', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
    if (!stripe || !webhookSecret) return res.status(503).json({ code: 'not_configured', error: 'Webhook is not set up.' });
    let event;
    try { event = stripe.webhooks.constructEvent(req.body, req.get('stripe-signature') || '', webhookSecret); }
    catch (e) { return res.status(400).json({ code: 'bad_signature', error: 'Invalid signature.' }); }
    try { if (store) await kiddush.onStripeEvent(event); res.json({ received: true }); }
    catch (e) { log.error('webhook error:', event.type, e && e.message); res.status(500).json({ code: 'server_error', error: 'Webhook failed.' }); }
  });

  const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((err) => {
    if (err instanceof kiddush.HttpError) return res.status(err.status).json({ code: err.code, error: err.message });
    log.error('error:', err && err.type, err && err.code, err && err.message);
    return res.status(500).json({ code: 'server_error', error: 'Something went wrong. Please try again.' });
  });
  const kapi = express.Router();
  kapi.use(express.json({ limit: '16kb' }));
  kapi.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  kiddush.mountPublic(kapi, { wrap, limit });
  kapi.use((req, res) => res.status(404).json({ code: 'not_found', error: 'Not found.' }));
  app.use('/api/kiddush', kapi);

  const adminOn = mountAdmin(app, { store, password: adminPassword, secret: sessionSecret, limit, log, extend: kiddush.mountAdmin });
  if (!adminOn) { // explain instead of a bare "Not found" when the staff area has not been switched on yet
    app.get(/^\/admin(\/.*)?$/, (req, res) => res.status(404).type('html').send('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Staff area not set up yet</title><body style="font:18px/1.5 Georgia,serif;max-width:34em;margin:40px auto;padding:0 16px"><h1>Staff area not set up yet</h1><p>To switch it on, set two things in your hosting settings: <b>DATABASE_URL</b> and <b>ADMIN_PASSWORD</b> (at least 12 characters). See SETUP-GUIDE.md, then reload this page.</p></body>'));
  }

  // The site: the phone page is the front door, the TV page lives at /kiddush/tv/.
  app.get(['/', '/index.html'], (req, res) => res.redirect(302, '/kiddush/'));
  app.use('/kiddush', express.static(path.join(ROOT, 'kiddush'), { dotfiles: 'ignore', maxAge: 0, etag: true }));
  app.use((req, res) => res.status(404).type('text').send('Not found'));
  return app;
}

if (require.main === module) {
  const secret = process.env.STRIPE_SECRET_KEY, pk = process.env.STRIPE_PUBLISHABLE_KEY, sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret || sessionSecret.length < 16) { console.error('SESSION_SECRET must be set (16+ characters).'); process.exit(1); }
  let stripe = null;
  if (secret && pk) {
    const Stripe = require('stripe');
    stripe = new Stripe(secret);
    console.log('Stripe enabled in ' + (/^sk_live_/.test(secret) ? 'LIVE' : 'TEST') + ' mode.');
    if (/^sk_live_/.test(secret) !== /^pk_live_/.test(pk)) { console.error('Stripe keys mix live and test modes.'); process.exit(1); }
  } else console.log('Stripe keys not set: running without card payments.');
  const port = process.env.PORT || 3000;
  (async () => {
    const config = loadConfig();
    let store = null;
    if (process.env.DATABASE_URL) {
      store = require('./store.js').createStore(process.env.DATABASE_URL);
      await store.migrate();
      console.log('Database connected.');
    } else console.log('DATABASE_URL not set: the TV shows the calendar, but sponsoring and the staff page are off.');
    createApp({
      stripe, sessionSecret, store, config, adminPassword: process.env.ADMIN_PASSWORD || '', webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
      mailer: require('./mailer.js').createMailer({ url: process.env.SMTP_URL, from: process.env.MAIL_FROM }), reminders: true,
    }).listen(port, () => console.log('Listening on ' + port));
  })().catch((e) => { console.error('Startup failed:', e.message); process.exit(1); });
}

module.exports = { createApp };
