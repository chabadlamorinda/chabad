// The new chabadoflamorinda.com website, served by the same server as My Pushka and the Kiddush board,
// so accounts, yahrzeits, donations and RSVPs are all one shared system.
//
// Settings (all optional):
//   PUBLIC_URL      the site's public address (default https://www.chabadoflamorinda.com); used for links, sitemap, emails
//   SITE_HOME=1     open the website at "/" on every address (otherwise "/" opens it only on PUBLIC_URL's host)
//   SITE_INDEXABLE=1  let Google and AI crawlers index the site. Leave unset on the preview until launch day.
//   GA_ID           Google Analytics 4 / Google Ads tag id (G-... or AW-...)
//   FB_PAGE_ID, FB_PAGE_TOKEN   Facebook Page connection (photos in, event posts out)
'use strict';
const express = require('express');
const { load } = require('./content.js');
const { mountPages } = require('./pages.js');
const { mountSeo } = require('./seo.js');
const { mountTools } = require('./tools.js');
const { mountCommunity, mountCommunityAdmin } = require('./community.js');
const { createFacebook } = require('./facebook.js');
const { esc } = require('./md.js');

function mountSite(app, { store = null, mailer = null, secret, limit, log = console, env = process.env, contentDir, facebook = undefined }) {
  const base = (env.PUBLIC_URL || 'https://www.chabadoflamorinda.com').replace(/\/+$/, '');
  const host = new URL(base).hostname.replace(/^www\./, '');
  const indexable = env.SITE_INDEXABLE === '1', siteHome = env.SITE_HOME === '1';
  const analytics = { ga: /^(G|AW)-[A-Z0-9]+$/.test(env.GA_ID || '') ? env.GA_ID : '' };
  let data = load(contentDir); // throws with a clear list if a content file is wrong
  const content = () => data;
  const fb = facebook !== undefined ? facebook : createFacebook({ pageId: env.FB_PAGE_ID, token: env.FB_PAGE_TOKEN, base, log });

  // The site's own security policy: our scripts only (plus Google's tag if GA_ID is set), images from Facebook's CDN.
  const gtag = analytics.ga ? ' https://www.googletagmanager.com' : '';
  const csp = ["default-src 'self'", `script-src 'self'${gtag}`, "style-src 'self' 'unsafe-inline'", "img-src 'self' data: https://*.fbcdn.net https://w2.chabad.org" + (analytics.ga ? ' https://www.google-analytics.com https://www.googletagmanager.com' : ''),
    "connect-src 'self'" + (analytics.ga ? ' https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com' : ''), "font-src 'self'", "frame-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'"].join('; ');
  const SITE_PATHS = /^\/(?:$|home$|events|shabbat|holidays|programs|jewish-lamorinda|photos|tools\/|account|assets\/|media\/|robots\.txt|sitemap\.xml|llms|feed\.xml|site\.webmanifest|[a-z0-9-]+$)/;
  app.use((req, res, next) => { if (SITE_PATHS.test(req.path)) res.setHeader('Content-Security-Policy', csp); next(); });

  const community = mountCommunity(app, { store, mailer, secret, base, limit, log, content });
  // pushka.* and kiddush.* addresses keep opening their apps.
  const isHome = (req) => !/^(pushka|kiddush)\./i.test(req.hostname) && (siteHome || req.hostname.replace(/^www\./, '') === host);
  const pages = mountPages(app, { content, base, indexable, isHome, analytics, rsvpCounts: community.counts, photos: fb ? fb.photos : null });
  const r = express.Router();
  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  mountSeo(r, { content, base, indexable, upcoming: pages.upcoming });
  mountTools(r, { render: pages.render, wrap });
  // Account page: the form is drawn by site.js from /api/site/me.
  r.get('/account', wrap(async (req, res) => {
    await pages.render(res, { path: '/account', noindex: true, title: 'My account', description: 'Your family, yahrzeits, birthdays and RSVPs at Chabad of Lamorinda.',
      body: `<section class="wrap sec narrow"><h1>My account</h1><div id="account" class="account"><p class="muted">Loading…</p></div>
<noscript><p>Please turn on JavaScript to sign in, or email <a href="mailto:${esc(data.org.email)}">${esc(data.org.email)}</a>.</p></noscript></section>` });
  }));
  r.get('/donate', (req, res) => res.redirect(302, data.org.donateUrl || '/pushka/'));
  app.use(r);

  // Site pages that do not exist get a friendly page instead of a bare "Not found".
  const notFound = (req, res, next) => {
    if (req.method !== 'GET' || !req.accepts('html') || /^\/(api|admin|pushka|kiddush|board)\b/.test(req.path)) return next();
    pages.render(res, { path: req.path, noindex: true, title: 'Page not found', body: '<section class="wrap sec narrow"><h1>We could not find that page</h1><p>It may have moved. Try the <a href="/events">events calendar</a>, <a href="/shabbat">Shabbat times</a> or the <a href="/">home page</a>.</p></section>' }, 404).catch(next);
  };
  return {
    content, base, notFound, facebook: fb, upcoming: pages.upcoming, when: pages.when,
    reload() { data = load(contentDir); return data; },
    // Rabbi area extras (RSVP lists, birthdays, post an event to Facebook).
    mountAdmin(r2, ctx) {
      mountCommunityAdmin(r2, ctx, { cs: community.cs, content, store });
      r2.post('/api/site/facebook/:slug', ctx.authed, ctx.wrap(async (req, res) => {
        if (!fb) return res.status(503).json({ code: 'not_configured', error: 'Facebook is not connected yet (FB_PAGE_ID and FB_PAGE_TOKEN).' });
        const e = data.events.find((x) => x.slug === req.params.slug && x.published);
        if (!e) return res.status(404).json({ code: 'not_found', error: 'Event not found.' });
        const out = await fb.postEvent(e, pages.when(e));
        res.json({ ok: true, id: out.id });
      }));
      r2.get('/community', (req, res) => res.sendFile(require('path').join(__dirname, '..', 'admin', 'community.html')));
      r2.get('/community.js', (req, res) => res.sendFile(require('path').join(__dirname, '..', 'admin', 'community.js')));
    },
  };
}
module.exports = { mountSite };
