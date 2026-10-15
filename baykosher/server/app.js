// Wires everything together. All outside services are injected so tests can run with fakes.
'use strict';
const express = require('express');
const path = require('path');
const { createDb } = require('./db');
const { createSettings } = require('./settings');
const { createCore, esc, httpErr } = require('./core');
const { createBackoffice } = require('./backoffice');
const { createPages } = require('./pages');
const { createApi } = require('./api');
const { createAuth, rateLimiter } = require('./auth');
const { createJobs } = require('./jobs');
const { createUpcLookup } = require('./upc');
const { createGeocoder } = require('./delivery');
const { seedDepartments } = require('./seed');
const notifyRef = require('./notifyRef');

async function createApp(deps) {
  const env = deps.env || process.env;
  const db = deps.db || createDb(env.DATABASE_URL);
  await db.migrate();
  await seedDepartments(db);
  const settings = createSettings(db);
  const publicUrl = (env.PUBLIC_URL || '').replace(/\/$/, '');
  const notifier = deps.notifier; notifyRef.set(notifier);
  const core = createCore({ db, settings, payments: deps.payments, notifier, geocoder: deps.geocoder || createGeocoder(), uber: deps.uber, clover: deps.clover, publicUrl });
  const upc = deps.upc || createUpcLookup();
  const back = createBackoffice({ db, settings, core, notifier, upc, publicUrl });
  const jobs = createJobs({ db, settings, core, notifier, publicUrl });
  const secret = env.SESSION_SECRET || (env.NODE_ENV === 'production' ? null : 'dev-secret-change-me');
  if (!secret) throw new Error('SESSION_SECRET is required in production');
  const auth = createAuth(secret);
  const limiter = { login: rateLimiter(8, 10 * 60000), staff: rateLimiter(10, 10 * 60000), checkout: rateLimiter(15, 60000), geo: rateLimiter(40, 60000) };
  const { pages, sitemap, robots } = createPages({ core, settings, db, publicUrl });

  const syncCloverNow = async (direction) => {
    const { syncClover } = require('./clover');
    const r = await syncClover({ db, clover: deps.clover, direction: direction || env.CLOVER_DIRECTION || 'clover_wins' });
    core.dirty(); return r;
  };

  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'SAMEORIGIN',
      'Content-Security-Policy': "default-src 'self'; script-src 'self' https://js.stripe.com; frame-src https://js.stripe.com https://hooks.stripe.com; connect-src 'self' https://api.stripe.com; img-src * data: blob:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; form-action 'self'" });
    next();
  });
  app.get('/healthz', async (req, res) => { await db.q('SELECT 1'); res.send('ok'); });

  // Stripe webhook: places the order even if the customer closes the tab right after paying.
  let stripeWebhook = null;
  if (deps.stripeEvents) {
    stripeWebhook = async (req, res) => {
      let ev;
      try { ev = deps.stripeEvents(req.body, req.headers['stripe-signature']); } catch { return res.status(400).send('bad signature'); }
      if (ev.type === 'payment_intent.amount_capturable_updated') {
        const o = await db.one('SELECT id FROM orders WHERE payment_intent_id=$1', [ev.data.object.id]);
        if (o) await core.confirmPaid(o.id).catch(() => {});
      }
      res.json({ received: true });
    };
  }
  app.use('/api', createApi({ db, settings, core, back, auth, limiter, env, stripeWebhook, clover: deps.clover, syncCloverNow }));
  if (deps.payments.kind === 'fake') { // lets you click through checkout without Stripe
    app.post('/api/dev/pay/:id', express.json(), async (req, res) => { const o = await db.one('SELECT payment_intent_id FROM orders WHERE id=$1', [req.params.id]); deps.payments.confirm(o.payment_intent_id); res.json({ ok: true }); });
  }

  const pub = path.join(__dirname, '..', 'public');
  app.use('/static', express.static(pub, { maxAge: env.NODE_ENV === 'production' ? '1h' : 0 }));
  const send = (f) => (req, res) => res.sendFile(path.join(pub, f));
  app.get('/admin', send('admin.html'));
  app.get('/pick', send('pick.html'));
  app.get('/manifest.webmanifest', (req, res) => res.json({ name: 'Bay Kosher', short_name: 'Bay Kosher', start_url: '/', display: 'standalone', background_color: '#ffffff', theme_color: '#00209f', icons: [{ src: '/static/icon.svg', sizes: 'any', type: 'image/svg+xml' }] }));
  app.get('/sitemap.xml', async (req, res) => res.type('application/xml').send(await sitemap()));
  app.get('/robots.txt', (req, res) => res.type('text/plain').send(robots()));
  const html = (fn) => async (req, res) => { res.set('Cache-Control', 'public, max-age=60').type('html').send(await fn(req)); };
  app.get('/', html(pages.home));
  app.get('/c/:slug', html(pages.category));
  app.get('/p/:idslug', html(pages.product));
  app.get('/sale', html(pages.sale));
  app.get('/search', html(pages.search));
  app.get('/store', html(pages.store));
  for (const [route, title] of [['/cart', 'Cart'], ['/checkout', 'Checkout'], ['/account', 'Account'], ['/order/:id', 'Order']]) app.get(route, async (req, res) => res.set('Cache-Control', 'no-store').type('html').send(await pages.app(title)(req)));
  app.get('/cart/resume/:id', async (req, res) => {
    const c = await db.one('SELECT id FROM carts WHERE id=$1', [req.params.id]);
    res.type('html').send(c ? `<!doctype html><meta charset="utf-8"><script>try{localStorage.setItem('bk_cartid',${JSON.stringify(c.id)});localStorage.removeItem('bk_cart')}catch(e){}location.replace('/cart')</script>` : '<meta http-equiv="refresh" content="0;url=/cart">');
  });
  app.get('/unsubscribe/:token', async (req, res) => {
    const s = await db.one('UPDATE subscribers SET subscribed=FALSE WHERE token=$1 RETURNING email', [req.params.token]);
    if (s) await db.q('UPDATE customers SET email_ok=FALSE WHERE email=$1', [s.email]);
    res.type('html').send('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:sans-serif;padding:2em"><h2>You are unsubscribed</h2><p>You will no longer receive our weekly email. <a href="/">Back to Bay Kosher</a></p>');
  });

  app.use((req, res) => { if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' }); res.status(404).type('html').send('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:sans-serif;padding:2em"><h2>Page not found</h2><p><a href="/">Back to Bay Kosher</a></p>'); });
  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    const status = err.status || (err.code === '22P02' ? 400 : 500);
    if (status >= 500) console.error(err);
    const msg = status >= 500 ? 'Something went wrong. Please try again.' : err.message;
    if (req.path.startsWith('/api/')) return res.status(status).json({ error: msg });
    res.status(status).type('html').send(`<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;padding:2em"><h2>${esc(msg)}</h2><p><a href="/">Back to Bay Kosher</a></p>`);
  });

  return { app, db, core, back, jobs, settings, auth, syncClover: deps.clover ? syncCloverNow : null, close: async () => { jobs.stop(); await db.close(); } };
}

module.exports = { createApp };
