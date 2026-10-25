// The new chabadoflamorinda.com website, served by the same server as My Pushka and the Kiddush board,
// so accounts, yahrzeits, donations and RSVPs are all one shared system.
//
// Settings (all optional):
//   PUBLIC_URL      the site's public address (default https://www.chabadoflamorinda.com); used for links, sitemap, emails
//   SITE_HOME=1     open the website at "/" on every address (otherwise "/" opens it only on PUBLIC_URL's host)
//   SITE_INDEXABLE=1  let Google and AI crawlers index the site. Leave unset on the preview until launch day.
//   GA_ID           Google Analytics 4 / Google Ads tag id (G-... or AW-...)
//   FB_PAGE_ID, FB_PAGE_TOKEN   Facebook Page connection (photos in, event posts out); IG_USER_ID adds Instagram
//   GOOGLE_SITE_VERIFICATION, BING_SITE_VERIFICATION   ownership tags for Google Search Console / Bing Webmaster Tools
//   INDEXNOW_KEY    tells Bing (which powers ChatGPT search), Yandex and others about new pages right away
//   ADMIN_EMAIL     where "new submission" notices go (default: the site's email)
'use strict';
const express = require('express');
const { load } = require('./content.js');
const { mountPages } = require('./pages.js');
const { mountSeo } = require('./seo.js');
const { mountTools } = require('./tools.js');
const { mountCommunity, mountCommunityAdmin } = require('./community.js');
const { createFacebook } = require('./facebook.js');
const { mountLocal } = require('./local.js');
const { mountBoard } = require('./board.js');
const { mountSocialAdmin } = require('./social.js');
const { createReminders } = require('./reminders.js');
const { esc } = require('./md.js');

function mountSite(app, { store = null, mailer = null, secret, limit, log = console, env = process.env, contentDir, facebook = undefined, reminders = false, fetchImpl = fetch }) {
  const base = (env.PUBLIC_URL || 'https://www.chabadoflamorinda.com').replace(/\/+$/, '');
  const host = new URL(base).hostname.replace(/^www\./, '');
  const indexable = env.SITE_INDEXABLE === '1', siteHome = env.SITE_HOME === '1';
  const tag = (v) => (/^[A-Za-z0-9_-]{8,100}$/.test(v || '') ? v : '');
  const analytics = { ga: /^(G|AW)-[A-Z0-9]+$/.test(env.GA_ID || '') ? env.GA_ID : '', google: tag(env.GOOGLE_SITE_VERIFICATION), bing: tag(env.BING_SITE_VERIFICATION) };
  // Any secret value works (Render's generated ones contain + and /): it is turned into a 32-letter hex key.
  const indexNowKey = env.INDEXNOW_KEY ? require('crypto').createHash('sha256').update(env.INDEXNOW_KEY).digest('hex').slice(0, 32) : '';
  let data = load(contentDir); // throws with a clear list if a content file is wrong
  const content = () => data;
  const fb = facebook !== undefined ? facebook : createFacebook({ pageId: env.FB_PAGE_ID, token: env.FB_PAGE_TOKEN, igUserId: env.IG_USER_ID, base, log });

  // The site's own security policy: our scripts only (plus Google's tag if GA_ID is set), images from Facebook's CDN.
  const gtag = analytics.ga ? ' https://www.googletagmanager.com' : '';
  const csp = ["default-src 'self'", `script-src 'self'${gtag}`, "style-src 'self' 'unsafe-inline'", "img-src 'self' data: https://*.fbcdn.net https://w2.chabad.org" + (analytics.ga ? ' https://www.google-analytics.com https://www.googletagmanager.com' : ''),
    "connect-src 'self'" + (analytics.ga ? ' https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com' : ''), "font-src 'self'", "frame-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'"].join('; ');
  const SITE_PATHS = /^\/(?:$|home$|events|shabbat|holidays|programs|jewish-|learn|photos|tools\/|account|assets\/|media\/|robots\.txt|sitemap\.xml|llms|feed\.xml|site\.webmanifest|[a-z0-9-]+(\.txt)?$)/;
  app.use((req, res, next) => { if (SITE_PATHS.test(req.path)) res.setHeader('Content-Security-Policy', csp); next(); });

  // Old Chabad.org addresses (/3186196, /templates/.../aid/3186196/..., /article.asp?aid=3186196) keep working.
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const R = data.redirects, aid = (/\/aid\/(\d+)/.exec(req.path) || [])[1] || (/^\/article\.asp$/i.test(req.path) && /^\d+$/.test(req.query.aid || '') ? req.query.aid : null);
    const to = R[req.path.replace(/\/+$/, '') || '/'] || (aid && R['/' + aid]);
    return to ? res.redirect(301, to) : next();
  });
  const community = mountCommunity(app, { store, mailer, secret, base, limit, log, content });
  // pushka.* and kiddush.* addresses keep opening their apps.
  const isHome = (req) => !/^(pushka|kiddush)\./i.test(req.hostname) && (siteHome || req.hostname.replace(/^www\./, '') === host);
  const pages = mountPages(app, { content, base, indexable, isHome, analytics, rsvpCounts: community.counts, photos: fb ? fb.photos : null });
  const r = express.Router();
  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  mountSeo(r, { content, base, indexable, upcoming: pages.upcoming });
  mountTools(r, { render: pages.render, wrap });
  mountLocal(r, { content, base, wrap, ...pages });
  const board = mountBoard(r, { base, store, mailer, content, render: pages.render, wrap, limit, readMember: community.readMember, log, notifyTo: env.ADMIN_EMAIL || '' });
  pages.setNews(board.approved);
  if (indexNowKey) {
    r.get('/' + indexNowKey + '.txt', (req, res) => res.type('text').send(indexNowKey));
    if (indexable) setTimeout(() => {
      const urls = [base + '/', base + '/events', ...data.events.filter((e) => e.published).map((e) => base + '/events/' + e.slug), ...data.towns.map((t) => base + '/jewish-' + t.slug), ...data.learn.map((a) => base + '/learn/' + a.slug)].slice(0, 10000);
      fetchImpl('https://api.indexnow.org/indexnow', { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify({ host: new URL(base).hostname, key: indexNowKey, keyLocation: base + '/' + indexNowKey + '.txt', urlList: urls }) })
        .then((x) => { if (!x.ok && x.status !== 202) log.error('IndexNow: HTTP ' + x.status); }, (e) => log.error('IndexNow:', e && e.message));
    }, 30e3).unref();
  }
  const mail = createReminders({ store, mailer, base, org: data.org, log });
  if (reminders && mail) mail.start();
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
    content, base, notFound, facebook: fb, upcoming: pages.upcoming, when: pages.when, reminders: mail,
    reload() { data = load(contentDir); return data; },
    // Rabbi area extras (RSVP lists, birthdays, post an event to Facebook).
    mountAdmin(r2, ctx) {
      mountCommunityAdmin(r2, ctx, { cs: community.cs, content, store });
      mountSocialAdmin(r2, ctx, { store, content, fb, base, when: pages.when });
      board.mountAdmin(r2, ctx);
      r2.get('/community', (req, res) => res.sendFile(require('path').join(__dirname, '..', 'admin', 'community.html')));
      r2.get('/community.js', (req, res) => res.sendFile(require('path').join(__dirname, '..', 'admin', 'community.js')));
    },
  };
}
module.exports = { mountSite };
