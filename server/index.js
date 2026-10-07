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
const FEE_RATE = 0.035;      // optional "cover the processing fee" add-on
const MIN_CENTS = 100;       // $1
const MAX_CENTS = 1000000;   // $10,000 per gift

class HttpError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

/**
 * @param {{ stripe: import('stripe').Stripe | null, publishableKey?: string, sessionSecret: string, log?: Pick<Console, 'error'> }} opts
 */
function createApp({ stripe: maybeStripe, publishableKey, sessionSecret, log = console }) {
  const stripe = /** @type {import('stripe').Stripe} */ (maybeStripe);
  const app = express();
  app.disable('x-powered-by');
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

  // ---------- API ----------
  const api = express.Router();
  api.use(express.json({ limit: '10kb' }));
  api.use(limit('api', 120, 10 * 60 * 1000));
  api.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

  api.get('/config', (req, res) => {
    res.json({ enabled: !!stripe, publishableKey: stripe ? publishableKey : '', livemode: /^pk_live_/.test(publishableKey || '') });
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
    if (err instanceof HttpError) return res.status(err.status).json({ code: err.code, error: err.message });
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
    const sub = await stripe.subscriptions.create({
      customer: req.customerId, default_payment_method: pm.id,
      items: [{ price_data: { currency: 'usd', product, unit_amount: g.total, recurring: { interval: 'month' } } }],
      off_session: true, payment_behavior: 'error_if_incomplete',
      description: 'My Pushka monthly gift: ' + FUND_NAMES[g.fund],
      metadata: { source: 'pushka', fund: g.fund, dedication: g.dedication, fee_covered: g.fee ? 'yes' : 'no', gift_cents: String(g.cents) },
      expand: ['latest_invoice'],
    }, { idempotencyKey: 'pushka-sub-' + g.idem });
    res.json({ status: sub.status, id: sub.id, receiptUrl: typeof sub.latest_invoice === 'object' && sub.latest_invoice ? sub.latest_invoice.hosted_invoice_url || '' : '' });
  }));

  const subView = (s) => {
    const item = s.items && s.items.data && s.items.data[0];
    const end = s.current_period_end || (item && item.current_period_end) || null;
    return { id: s.id, amount: item && item.price ? item.price.unit_amount / 100 : 0, fund: (s.metadata && s.metadata.fund) || 'general', next: end ? end * 1000 : null };
  };
  async function activeSubs(customer) {
    const list = await stripe.subscriptions.list({ customer, status: 'active', limit: 20 });
    return list.data.filter((s) => s.metadata && s.metadata.source === 'pushka');
  }
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

  api.use((req, res) => res.status(404).json({ code: 'not_found', error: 'Not found.' }));
  app.use('/api', api);

  // ---------- website (only the public files are served) ----------
  const send = (file) => (req, res) => res.sendFile(path.join(ROOT, file));
  app.get('/', send('index.html'));
  app.get('/index.html', send('index.html'));
  app.get('/styles.css', send('styles.css'));
  app.use('/pushka', express.static(path.join(ROOT, 'pushka'), { dotfiles: 'ignore', maxAge: 0, etag: true }));
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
  } else {
    console.log('Stripe keys not set: running without card payments.');
  }
  const port = process.env.PORT || 3000;
  createApp({ stripe, publishableKey: pk, sessionSecret }).listen(port, () => console.log('Listening on ' + port));
}

module.exports = { createApp, FUND_NAMES };
