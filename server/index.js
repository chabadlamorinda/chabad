// Chabad of Lamorinda — website + "My Pushka" app + Stripe payment API.
//
// Design: stateless. A donor's browser holds a signed token that names their Stripe
// customer (cus_...). Card details never touch this server: Stripe.js collects them and
// Stripe stores them. This server only creates customers, SetupIntents (to save a card),
// and charges the saved card (one-time PaymentIntents and monthly Subscriptions).
//
// Required environment variables:
//   STRIPE_SECRET_KEY       sk_test_... (testing) or sk_live_... (real money)
//   STRIPE_PUBLISHABLE_KEY  pk_test_... or pk_live_...
//   SESSION_SECRET          long random string (Render generates one)
'use strict';

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { mountMembers } = require('./members.js');
const { mountAdmin } = require('./admin.js');
const { createKiddush } = require('./kiddush.js');
const { mountSite } = require('./site/index.js');

const ROOT = path.join(__dirname, '..');
const FUND_NAMES = {
  general: 'General Fund',
  chai: 'Chai Club',
  preschool: 'Jewish Preschool Scholarships',
  market: 'Bay Kosher Market',
  building: 'Building Campaign',
  holidays: 'Holiday Programs',
  synagogue: 'Synagogue',
  endyear: 'End of Year Campaign',
  children: 'Children Events',
  pledge: 'Pledge',
};
// Chai Club (monthly donors). A gift of exactly a boundary amount belongs to the higher level.
const CLUB_LEVELS = [['platinum', 72000], ['gold', 36000], ['silver', 18000], ['bronze', 7200]];
const clubLevel = (cents) => { const l = CLUB_LEVELS.find(([, min]) => cents >= min); return l ? l[0] : null; };
const FEE_RATE = 0.035;      // optional "cover the processing fee" add-on
const MIN_CENTS = 100;       // $1
const MAX_CENTS = 1000000;   // $10,000 per gift

class HttpError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

/**
 * @param {{ stripe: import('stripe').Stripe | null, publishableKey?: string, sessionSecret: string, log?: Pick<Console, 'error'> }} opts
 */
function createApp({ stripe: maybeStripe, publishableKey, sessionSecret, log = console, androidPackage = 'com.chabadoflamorinda.pushka', androidSha256 = '', store = null, sendPush = null, vapidPublicKey = '', webhookSecret = '', adminPassword = '', applePayAssoc = '', now = () => new Date(), mailer = null, reminders = false, siteEnv = process.env, facebook = undefined, chatClient = undefined }) {
  const stripe = /** @type {import('stripe').Stripe} */ (maybeStripe);
  const kiddush = createKiddush({ store, stripe, log, now, mailer });
  if (reminders) kiddush.startReminders(); // emails unpaid sponsors a reminder after a few days (needs email set up)
  const app = express();
  app.locals.kiddush = kiddush; // (used by tests)
  app.disable('x-powered-by');
  // Compress pages, styles and scripts (about 4x smaller). The chat's live stream is left alone.
  app.use(require('compression')({ filter: (req, res) => !/text\/event-stream/.test(String(res.getHeader('Content-Type') || '')) && require('compression').filter(req, res) }));
  app.set('trust proxy', 1);

  // ---------- tokens ----------
  const mac = (cus) => crypto.createHmac('sha256', sessionSecret).update(cus).digest('base64url');
  const sign = (cus) => cus + '.' + mac(cus);
  const verify = (tok) => {
    if (typeof tok !== 'string' || tok.length > 200) return null;
    const i = tok.lastIndexOf('.');
    if (i < 1) return null;
    const cus = tok.slice(0, i);
    const a = Buffer.from(tok.slice(i + 1)), b = Buffer.from(mac(cus));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    return /^cus_[A-Za-z0-9]+$/.test(cus) ? cus : null;
  };
  // Member tokens (m_...) are a separate namespace so they can never be mistaken for a Stripe customer token.
  const mmac = (id) => crypto.createHmac('sha256', sessionSecret + ':member').update(id).digest('base64url');
  const tokens = {
    verifyCustomer: verify,
    signMember: (id) => id + '.' + mmac(id),
    verifyMember(tok) {
      if (typeof tok !== 'string' || tok.length > 100) return null;
      const i = tok.lastIndexOf('.'); if (i < 1) return null;
      const id = tok.slice(0, i), a = Buffer.from(tok.slice(i + 1)), b = Buffer.from(mmac(id));
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
      return /^m_[0-9a-f]{24}$/.test(id) ? id : null;
    },
  };

  // ---------- security headers ----------
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Content-Security-Policy', [
      "default-src 'self'",
      "script-src 'self' https://js.stripe.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https://*.stripe.com",
      "connect-src 'self' https://api.stripe.com https://www.hebcal.com",
      "frame-src https://js.stripe.com https://hooks.stripe.com",
      "worker-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '));
    next();
  });

  // ---------- tiny in-memory rate limiter ----------
  const hits = new Map();
  const limit = (id, max, windowMs) => (req, res, next) => {
    const key = id + '|' + req.ip;
    const now = Date.now();
    const e = hits.get(key);
    if (!e || now > e.reset) hits.set(key, { n: 1, reset: now + windowMs });
    else if (++e.n > max) return res.status(429).json({ code: 'rate_limited', error: 'Too many requests. Please wait a moment.' });
    next();
  };
  setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (now > v.reset) hits.delete(k); }, 60000).unref();

  app.get('/healthz', (req, res) => res.type('text').send('ok'));

  // ---------- Stripe webhook (needs the raw request body to check Stripe's signature) ----------
  app.post('/api/stripe/webhook', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
    if (!stripe || !webhookSecret) return res.status(503).json({ code: 'not_configured', error: 'Webhook is not set up.' });
    let event;
    try { event = stripe.webhooks.constructEvent(req.body, req.get('stripe-signature') || '', webhookSecret); }
    catch (e) { return res.status(400).json({ code: 'bad_signature', error: 'Invalid signature.' }); }
    try { await handleStripeEvent(event); res.json({ received: true }); }
    catch (e) { log.error('webhook error:', event.type, e && e.message); res.status(500).json({ code: 'server_error', error: 'Webhook failed.' }); }
  });
  async function handleStripeEvent(event) {
    if (!store) return;
    if (await kiddush.onStripeEvent(event)) return; // Kiddush sponsorship checkouts
    const o = event.data && event.data.object || {};
    const cus = typeof o.customer === 'string' ? o.customer : (o.customer && o.customer.id) || null;
    switch (event.type) {
      case 'invoice.payment_failed':
      case 'payment_intent.payment_failed': {
        if (event.type === 'payment_intent.payment_failed' && !(o.metadata && o.metadata.source === 'pushka')) return;
        const msg = event.type === 'invoice.payment_failed' ? 'Monthly gift could not be charged' : ((o.last_payment_error && o.last_payment_error.message) || 'Payment failed');
        const fresh = await store.recordPaymentEvent({ id: event.id, type: event.type, customerId: cus, email: o.customer_email || o.receipt_email || '', amount: o.amount_due || o.amount || 0, message: msg });
        if (fresh && cus) await store.flagCardIssue(cus, msg);
        return;
      }
      case 'invoice.payment_succeeded':
      case 'invoice.paid':
      case 'payment_intent.succeeded':
        if (cus && (event.type !== 'payment_intent.succeeded' || (o.metadata && o.metadata.source === 'pushka'))) { await store.clearCardIssue(cus); await store.resolveCustomerPayments(cus); }
        return;
      case 'charge.refunded':
      case 'customer.subscription.deleted':
        await store.recordPaymentEvent({ id: event.id, type: event.type, customerId: cus, email: o.billing_details && o.billing_details.email || '', amount: o.amount_refunded || o.amount || 0, message: event.type === 'charge.refunded' ? 'Gift refunded' : 'Monthly gift ended' });
        // These are informational: mark resolved right away so they do not look like open problems.
        await store.resolvePayment(event.id);
        return;
      default:
    }
  }
  // Apple Pay domain verification file (paste its contents into the APPLE_PAY_ASSOC setting).
  app.get('/.well-known/apple-developer-merchantid-domain-association', (req, res) => (applePayAssoc ? res.type('text').send(applePayAssoc) : res.status(404).type('text').send('Not found')));

  // The website (pages, accounts, RSVPs, SEO files). Mounted before the app's own "/" redirect below
  // and before /api, whose catch-all would otherwise answer /api/site.
  const site = mountSite(app, { store, mailer, secret: sessionSecret, limit, log, env: siteEnv, facebook, reminders, chatClient });
  app.locals.site = site;

  // ---------- API ----------
  const api = express.Router();
  api.use(express.json({ limit: '64kb' }));
  api.use(limit('api', 120, 10 * 60 * 1000));
  api.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

  api.get('/config', (req, res) => {
    res.json({ enabled: !!stripe, publishableKey: stripe ? publishableKey : '', livemode: /^pk_live_/.test(publishableKey || ''), members: !!store, vapidPublicKey: store && sendPush ? vapidPublicKey : '' });
  });

  const needStripe = (req, res, next) => (stripe ? next() : res.status(503).json({ code: 'not_configured', error: 'Card payments are not set up yet.' }));
  const auth = (req, res, next) => {
    const m = /^Bearer (.+)$/.exec(req.get('authorization') || '');
    const cus = m && verify(m[1]);
    if (!cus) return res.status(401).json({ code: 'unauthorized', error: 'Please add your details again.' });
    req.customerId = cus;
    next();
  };
  const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((err) => handleError(err, res));
  function handleError(err, res) {
    if (err instanceof HttpError || err instanceof kiddush.HttpError) return res.status(err.status).json({ code: err.code, error: err.message });
    if (err && err.type === 'StripeCardError') {
      return res.status(402).json({ code: err.code === 'authentication_required' ? 'authentication_required' : 'card_error', error: err.message || 'Your card was declined.' });
    }
    log.error('payment error:', err && err.type, err && err.code, err && err.message);
    return res.status(500).json({ code: 'server_error', error: 'Something went wrong. Please try again.' });
  }

  const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
  const validEmail = (e) => /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(e) && e.length <= 254;
  function readGift(body) {
    const cents = Math.round(Number(body && body.amount) * 100);
    if (!Number.isFinite(cents) || cents < MIN_CENTS || cents > MAX_CENTS) throw new HttpError(400, 'invalid_amount', 'Please enter an amount between $1 and $10,000.');
    const fund = body.fund;
    if (!Object.prototype.hasOwnProperty.call(FUND_NAMES, fund)) throw new HttpError(400, 'invalid_fund', 'Please choose a fund.');
    const idem = clean(body.idem, 80);
    if (idem.length < 16) throw new HttpError(400, 'invalid_request', 'Missing request id.');
    const fee = body.fee === true;
    const total = fee ? Math.round(cents * (1 + FEE_RATE)) : cents;
    return { cents, total, fee, fund, dedication: clean(body.dedication, 80), idem };
  }
  async function savedCard(customer) {
    const list = await stripe.paymentMethods.list({ customer, type: 'card', limit: 1 });
    return list.data[0] || null;
  }
  const receiptOf = (charge) => (charge && typeof charge === 'object' && charge.receipt_url) || '';
  const cardInfo = (pm) => (pm ? { id: pm.id, brand: pm.card.brand, last4: pm.card.last4, expMonth: pm.card.exp_month, expYear: pm.card.exp_year } : null);

  // Create (or update) the Stripe customer. Returns the signed token the browser keeps.
  api.post('/customer', needStripe, wrap(async (req, res) => {
    const name = clean(req.body && req.body.name, 100), email = clean(req.body && req.body.email, 254).toLowerCase();
    if (!name) throw new HttpError(400, 'invalid_name', 'Please enter your name.');
    if (!validEmail(email)) throw new HttpError(400, 'invalid_email', 'Please enter a valid email address.');
    const phone = clean(req.body && req.body.phone, 30), address = clean(req.body && req.body.address, 200);
    const m = /^Bearer (.+)$/.exec(req.get('authorization') || ''), existing = m && verify(m[1]);
    let id;
    if (existing) { await stripe.customers.update(existing, { name, email, ...(phone ? { phone } : {}), metadata: { address } }); id = existing; }
    else { id = (await stripe.customers.create({ name, email, ...(phone ? { phone } : {}), metadata: { source: 'pushka', address } })).id; }
    res.json({ token: sign(id) });
  }));

  api.post('/setup-intent', needStripe, auth, wrap(async (req, res) => {
    const si = await stripe.setupIntents.create({ customer: req.customerId, allowed_payment_method_types: ['card'], usage: 'off_session', metadata: { source: 'pushka' } });
    res.json({ clientSecret: si.client_secret });
  }));

  api.get('/payment-method', needStripe, auth, wrap(async (req, res) => {
    res.json({ card: cardInfo(await savedCard(req.customerId)) });
  }));

  api.delete('/payment-method', needStripe, auth, wrap(async (req, res) => {
    const list = await stripe.paymentMethods.list({ customer: req.customerId, type: 'card', limit: 20 });
    for (const pm of list.data) await stripe.paymentMethods.detach(pm.id);
    res.json({ ok: true });
  }));

  // After a new card is saved: make it THE card. Monthly gifts switch to it and older cards are removed,
  // so "change card" really changes what gets charged.
  api.post('/payment-method/default', needStripe, auth, wrap(async (req, res) => {
    const list = await stripe.paymentMethods.list({ customer: req.customerId, type: 'card', limit: 20 });
    const newest = list.data.slice().sort((x, y) => (y.created || 0) - (x.created || 0))[0];
    if (!newest) throw new HttpError(400, 'no_card', 'Please add a card first.');
    await stripe.customers.update(req.customerId, { invoice_settings: { default_payment_method: newest.id } });
    for (const sub of await activeSubs(req.customerId)) await stripe.subscriptions.update(sub.id, { default_payment_method: newest.id });
    for (const pm of list.data) if (pm.id !== newest.id) await stripe.paymentMethods.detach(pm.id);
    res.json({ card: cardInfo(newest) });
  }));

  // One-time gift: charge the saved card right away (no redirect).
  api.post('/donate', limit('donate', 30, 10 * 60 * 1000), needStripe, auth, wrap(async (req, res) => {
    const g = readGift(req.body);
    const pm = await savedCard(req.customerId);
    if (!pm) throw new HttpError(400, 'no_card', 'Please add a card first.');
    const customer = /** @type {any} */ (await stripe.customers.retrieve(req.customerId));
    try {
      const pi = await stripe.paymentIntents.create({
        amount: g.total, currency: 'usd', customer: req.customerId, payment_method: pm.id,
        off_session: true, confirm: true,
        description: 'My Pushka gift: ' + FUND_NAMES[g.fund],
        receipt_email: customer && !customer.deleted && customer.email ? customer.email : undefined,
        metadata: { source: 'pushka', fund: g.fund, dedication: g.dedication, fee_covered: g.fee ? 'yes' : 'no', gift_cents: String(g.cents) },
        expand: ['latest_charge'],
      }, { idempotencyKey: 'pushka-donate-' + g.idem });
      return res.json({ status: pi.status, id: pi.id, receiptUrl: receiptOf(pi.latest_charge) });
    } catch (err) {
      const pi = err && (err.payment_intent || (err.raw && err.raw.payment_intent));
      if (err && err.code === 'authentication_required' && pi && pi.client_secret) {
        return res.json({ status: 'requires_action', id: pi.id, clientSecret: pi.client_secret, paymentMethodId: pm.id });
      }
      throw err;
    }
  }));

  // After the donor completes bank authentication in the browser.
  api.get('/payment/:id', needStripe, auth, wrap(async (req, res) => {
    const pi = await stripe.paymentIntents.retrieve(req.params.id, { expand: ['latest_charge'] });
    if (pi.customer !== req.customerId) throw new HttpError(403, 'forbidden', 'Not allowed.');
    res.json({ status: pi.status, receiptUrl: receiptOf(pi.latest_charge) });
  }));

  async function ensureProduct(fund) {
    const id = 'pushka-monthly-' + fund;
    try { await stripe.products.retrieve(id); }
    catch (e) {
      if (!(e && (e.code === 'resource_missing' || e.statusCode === 404))) throw e;
      try { await stripe.products.create({ id, name: 'Monthly gift: ' + FUND_NAMES[fund], metadata: { source: 'pushka' } }); }
      catch (e2) { if (!(e2 && e2.code === 'resource_already_exists')) throw e2; }
    }
    return id;
  }

  // Monthly gift: a Stripe subscription on the saved card.
  api.post('/subscribe', limit('subscribe', 15, 10 * 60 * 1000), needStripe, auth, wrap(async (req, res) => {
    const g = readGift(req.body);
    const pm = await savedCard(req.customerId);
    if (!pm) throw new HttpError(400, 'no_card', 'Please add a card first.');
    const product = await ensureProduct(g.fund);
    let club = null;
    if (req.body.club) {
      if (g.fund !== 'chai') throw new HttpError(400, 'invalid_fund', 'Please choose a fund.');
      // Any monthly amount is welcome; gifts under $72 simply have no level, so they are not put on the board.
      club = { name: clean(req.body.club.name, 60), show: req.body.club.show === true && !!clubLevel(g.cents) };
      if (club.show && !club.name) throw new HttpError(400, 'invalid_name', 'Please enter the name for the board.');
    }
    const sub = await stripe.subscriptions.create({
      customer: req.customerId, default_payment_method: pm.id,
      items: [{ price_data: { currency: 'usd', product, unit_amount: g.total, recurring: { interval: 'month' } } }],
      off_session: true, payment_behavior: 'error_if_incomplete',
      description: 'My Pushka monthly gift: ' + FUND_NAMES[g.fund],
      metadata: { source: 'pushka', fund: g.fund, dedication: g.dedication, fee_covered: g.fee ? 'yes' : 'no', gift_cents: String(g.cents), ...(club ? { club: 'yes', board_show: club.show ? 'yes' : 'no', board_name: club.show ? club.name : '' } : {}) },
      expand: ['latest_invoice'],
    }, { idempotencyKey: 'pushka-sub-' + g.idem });
    if (club && req.body.replace === true) { // changing level: stop the earlier Chai Club gift(s)
      for (const old of await activeSubs(req.customerId)) if (old.id !== sub.id && old.metadata && old.metadata.club === 'yes') await stripe.subscriptions.cancel(old.id);
    }
    clubCache = { at: 0, data: null };
    res.json({ status: sub.status, id: sub.id, receiptUrl: typeof sub.latest_invoice === 'object' && sub.latest_invoice ? sub.latest_invoice.hosted_invoice_url || '' : '' });
  }));

  const subView = (s) => {
    const item = s.items && s.items.data && s.items.data[0];
    const end = s.current_period_end || (item && item.current_period_end) || null;
    return { id: s.id, amount: item && item.price ? item.price.unit_amount / 100 : 0, fund: (s.metadata && s.metadata.fund) || 'general', next: end ? end * 1000 : null, club: !!(s.metadata && s.metadata.club === 'yes'), gift: s.metadata && s.metadata.gift_cents ? Number(s.metadata.gift_cents) / 100 : null, boardName: (s.metadata && s.metadata.board_name) || '', boardShow: !!(s.metadata && s.metadata.board_show === 'yes') };
  };
  async function activeSubs(customer) {
    const list = await stripe.subscriptions.list({ customer, status: 'active', limit: 20 });
    return list.data.filter((s) => s.metadata && s.metadata.source === 'pushka');
  }
  // Public honor board: first names the donor chose to show, grouped by level. Amounts are never shown.
  let clubCache = { at: 0, data: null };
  api.get('/club', limit('club', 60, 10 * 60 * 1000), wrap(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (!stripe) return res.json({ members: [], counts: {}, total: 0 });
    if (!clubCache.data || Date.now() - clubCache.at > 5 * 60 * 1000) {
      const members = [], counts = { platinum: 0, gold: 0, silver: 0, bronze: 0 }; let after;
      for (let page = 0; page < 50; page++) {
        const list = await stripe.subscriptions.list({ status: 'active', limit: 100, ...(after ? { starting_after: after } : {}) });
        for (const sb of list.data) {
          const m = sb.metadata || {}; if (m.source !== 'pushka' || m.club !== 'yes') continue;
          const level = clubLevel(Number(m.gift_cents)); if (!level) continue;
          counts[level]++;
          if (m.board_show === 'yes' && m.board_name) members.push({ name: m.board_name, level, since: (sb.created || 0) * 1000 });
        }
        if (!list.has_more || !list.data.length) break; after = list.data[list.data.length - 1].id;
      }
      const rank = (l) => CLUB_LEVELS.findIndex(([id]) => id === l);
      members.sort((a, b) => rank(a.level) - rank(b.level) || a.since - b.since);
      clubCache = { at: Date.now(), data: { members, counts, total: Object.values(counts).reduce((a, b) => a + b, 0) } };
    }
    res.json(clubCache.data);
  }));
  api.get('/subscriptions', needStripe, auth, wrap(async (req, res) => {
    res.json({ subscriptions: (await activeSubs(req.customerId)).map(subView) });
  }));
  api.delete('/subscriptions/:id', needStripe, auth, wrap(async (req, res) => {
    const s = await stripe.subscriptions.retrieve(req.params.id);
    if (s.customer !== req.customerId) throw new HttpError(403, 'forbidden', 'Not allowed.');
    await stripe.subscriptions.cancel(s.id);
    res.json({ ok: true });
  }));

  // "Delete account": stop monthly gifts and remove saved cards. Giving history stays with Stripe.
  api.delete('/account', needStripe, auth, wrap(async (req, res) => {
    for (const s of await activeSubs(req.customerId)) await stripe.subscriptions.cancel(s.id);
    const list = await stripe.paymentMethods.list({ customer: req.customerId, type: 'card', limit: 20 });
    for (const pm of list.data) await stripe.paymentMethods.detach(pm.id);
    res.json({ ok: true });
  }));

  mountMembers(api, { store, tokens, wrap, HttpError, vapidPublicKey, limit });
  // Kiddush board API (its own router so the shared per-IP limit above does not throttle a room full of phones).
  const kapi = express.Router();
  kapi.use(express.json({ limit: '16kb' }));
  kapi.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  kiddush.mountPublic(kapi, { wrap, limit });
  kapi.use((req, res) => res.status(404).json({ code: 'not_found', error: 'Not found.' }));
  app.use('/api/kiddush', kapi);
  api.use((req, res) => res.status(404).json({ code: 'not_found', error: 'Not found.' }));
  app.use('/api', api);
  const adminOn = mountAdmin(app, { store, password: adminPassword, secret: sessionSecret, limit, send: sendPush, log, extend: (r, ctx) => { kiddush.mountAdmin(r, ctx); site.mountAdmin(r, ctx); } });
  if (!adminOn) { // explain instead of a bare "Not found" when the staff area has not been switched on yet
    app.get(/^\/admin(\/.*)?$/, (req, res) => res.status(404).type('html').send('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Staff area not set up yet</title><body style="font:18px/1.5 Georgia,serif;max-width:560px;margin:8vh auto;padding:0 20px;color:#3b2412"><h1 style="font-weight:400">Staff area not set up yet</h1><p>The staff page switches on once two settings are added in Render (your hosting account):</p><ol><li><b>DATABASE_URL</b>: the address of your database (for example a free one from neon.com)</li><li><b>ADMIN_PASSWORD</b>: a password of 12 or more characters</li></ol><p>After you save them, Render restarts and this page becomes your sign-in page. Step-by-step: <code>store/rabbi-setup.md</code>.</p>'));
  }

  // ---------- website (only the public files are served) ----------
  // Google Play "Trusted Web Activity" verification: proves this site and the Android app belong together.
  app.get('/.well-known/assetlinks.json', (req, res) => {
    const fps = (androidSha256 || '').split(',').map((x) => x.trim().toUpperCase()).filter((x) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(x));
    res.json(fps.length ? [{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: androidPackage, sha256_cert_fingerprints: fps } }] : []);
  });
  // The app is the front door: any address pointed at this server (for example pushka.chabadoflamorinda.com) opens it.
  // (an address starting with "kiddush." opens the Kiddush sponsor page instead)
  app.get(['/', '/index.html'], (req, res) => res.redirect(302, /^kiddush\./i.test(req.hostname) ? '/kiddush/' : '/pushka/'));
  // Kiddush board: /kiddush/ is the phone sponsor page, /kiddush/tv/ is the TV display.
  app.use('/kiddush', express.static(path.join(ROOT, 'kiddush'), { dotfiles: 'ignore', maxAge: 0, etag: true }));
  // The honor board page can be embedded (iframe) on the organisation's own website.
  const frameOk = (process.env.BOARD_FRAME_ANCESTORS || "https://www.chabadoflamorinda.com https://chabadoflamorinda.com https://*.chabadoflamorinda.com https://chabad-lamorinda.onrender.com").trim();
  app.use('/board', (req, res, next) => {
    res.setHeader('Content-Security-Policy', ["default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", "font-src 'self' https://fonts.gstatic.com", "img-src 'self' data:", "connect-src 'self'", "base-uri 'self'", "frame-ancestors 'self' " + frameOk].join('; '));
    next();
  }, express.static(path.join(ROOT, 'board'), { dotfiles: 'ignore', maxAge: 0, etag: true }));
  app.use('/pushka', express.static(path.join(ROOT, 'pushka'), { dotfiles: 'ignore', maxAge: 0, etag: true }));
  app.use(site.notFound);
  app.use((req, res) => res.status(404).type('text').send('Not found'));
  // Last stop for errors: a short message, never the server's code (bad JSON or a broken address is the visitor's 4xx).
  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    const status = err && (err.status || err.statusCode) >= 400 && (err.status || err.statusCode) < 500 ? (err.status || err.statusCode) : 500;
    if (status === 500) log.error('server error:', err && err.message);
    if (res.headersSent) return res.end();
    if (/^\/(api|admin\/api)\//.test(req.path)) return res.status(status).json({ code: status === 500 ? 'server_error' : 'bad_request', error: status === 500 ? 'Something went wrong. Please try again.' : 'Bad request.' });
    res.status(status === 400 ? 404 : status).type('text').send(status === 500 ? 'Something went wrong. Please try again, or call 925-384-7242.' : 'Not found');
  });
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
  } else {
    console.log('Stripe keys not set: running without card payments.');
  }
  const port = process.env.PORT || 3000;
  (async () => {
    let store = null, sendPush = null;
    const vapidPub = process.env.VAPID_PUBLIC_KEY || '', vapidPriv = process.env.VAPID_PRIVATE_KEY || '';
    if (process.env.DATABASE_URL) {
      store = require('./store.js').createStore(process.env.DATABASE_URL);
      await store.migrate();
      try { const n = await require('./kiddush-legacy.js').importLegacy(store); if (n) console.log('Imported ' + n + ' sponsors from the original Kiddush board.'); } catch (e) { console.error('Kiddush import skipped:', e.message); }
      console.log('Database connected: members, yahrzeits and reminders are on.');
    } else console.log('DATABASE_URL not set: yahrzeit sharing, reminders and the Rabbi area are off.');
    if (vapidPub && vapidPriv) {
      const webpush = require('web-push');
      webpush.setVapidDetails('mailto:rabbi@chabadoflamorinda.com', vapidPub, vapidPriv);
      sendPush = (sub, payload) => webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 6 * 3600 });
    }
    if (store && sendPush) { require('./scheduler.js').createScheduler({ store, send: sendPush }).start(); console.log('Reminder scheduler started.'); }
    createApp({
      stripe, publishableKey: pk, sessionSecret, androidPackage: process.env.ANDROID_PACKAGE || undefined, androidSha256: process.env.ANDROID_SHA256 || '',
      store, sendPush, mailer: require('./mailer.js').createMailer({ url: process.env.SMTP_URL, from: process.env.MAIL_FROM }), reminders: true, vapidPublicKey: vapidPub, webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '', adminPassword: process.env.ADMIN_PASSWORD || '', applePayAssoc: process.env.APPLE_PAY_ASSOC || '',
    }).listen(port, () => console.log('Listening on ' + port));
    // Render's free plan puts the server to sleep after 15 minutes without visitors; the next visitor then waits up to
    // a minute, and no reminder emails go out while it sleeps. Visiting our own public address every 10 minutes keeps
    // it awake (one always-on service fits in the free plan's 750 hours a month). KEEP_AWAKE=0 turns this off.
    const self = process.env.RENDER_EXTERNAL_URL || '';
    if (process.env.RENDER && self && process.env.KEEP_AWAKE !== '0') {
      setInterval(() => { fetch(self.replace(/\/$/, '') + '/healthz').catch(() => {}); }, 10 * 60 * 1000).unref();
      console.log('Keeping the server awake: ' + self);
    }
  })().catch((e) => { console.error('Startup failed:', e.message); process.exit(1); });
}

module.exports = { createApp, FUND_NAMES };
