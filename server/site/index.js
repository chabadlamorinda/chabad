// The new chabadoflamorinda.com website, served by the same server as My Pushka and the Kiddush board,
// so accounts, yahrzeits, donations and RSVPs are all one shared system.
//
// Settings (all optional):
//   PUBLIC_URL      the site's public address (default https://www.chabadoflamorinda.com); used for links, sitemap, emails
//   SITE_HOME=1     open the website at "/" on every address (otherwise "/" opens it only on PUBLIC_URL's host)
//   SITE_INDEXABLE=1  let Google and AI crawlers index the site (0 = never). Unset: indexed once PUBLIC_URL is a real
//                   domain (jewishlamorinda.com), never on the onrender.com preview.
//   GA_ID           Google Analytics 4 / Google Ads tag id (G-... or AW-...)
//   FB_PAGE_ID, FB_PAGE_TOKEN   Facebook Page connection (photos in, event posts out); IG_USER_ID adds Instagram
//   GOOGLE_SITE_VERIFICATION, BING_SITE_VERIFICATION   ownership tags for Google Search Console / Bing Webmaster Tools
//   INDEXNOW_KEY    tells Bing (which powers ChatGPT search), Yandex and others about new pages right away
//   ADMIN_EMAIL     where "new submission" notices go (default: the site's email)
//   ANTHROPIC_API_KEY  turns on Claude answers in the "Ask us" chat (always the cheapest model, Claude Haiku 5.5); without it the chat searches the site
// Languages: every page is also served at /he/... (Hebrew, right to left) and /ru/... (Russian); see i18n.js.
'use strict';
const express = require('express');
const { load } = require('./content.js');
const { kabbalatShabbat } = require('./zmanim.js');
const { mountPages } = require('./pages.js');
const { mountSeo } = require('./seo.js');
const { mountTools } = require('./tools.js');
const { mountYearly } = require('./yearly.js');
const { mountSearch } = require('./search.js');
const { mountCommunity, mountCommunityAdmin } = require('./community.js');
const { mountOutreach } = require('./outreach.js');
const { createFacebook } = require('./facebook.js');
const { mountLocal } = require('./local.js');
const { mountBoard } = require('./board.js');
const { mountSocialAdmin } = require('./social.js');
const { createReminders } = require('./reminders.js');
const { esc } = require('./md.js');
const { createI18n, LANGS, withLang } = require('./i18n.js');
const { makeCtx } = require('./ctx.js');
const { mountLife } = require('./life.js');
const { mountForms } = require('./forms.js');
const { mountGive } = require('./give.js');
const { mountKiddushPage } = require('./kiddush-page.js');
const { mountFun } = require('./fun.js');
const { mountCampaignPages } = require('./campaign-page.js');
const { mountFlyer } = require('./flyer.js');
const { mountChat } = require('./chat.js');
const { mountParsha, mountCalendar, mountDaily } = require('./parsha.js');
const { mountWeekly } = require('./weekly.js');
const { mountAsk } = require('./ask.js');
const { DIR } = require('./content.js');
const { mountLeads } = require('./leads.js');
const { mountVisitors } = require('./visitors.js');
const { mountMitzvah } = require('./mitzvah.js');

function mountSite(app, { store = null, mailer = null, secret, limit, log = console, env = process.env, contentDir, facebook = undefined, reminders = false, fetchImpl = fetch, chatClient = undefined, giving = {} }) {
  const base = (env.PUBLIC_URL || 'https://www.chabadoflamorinda.com').replace(/\/+$/, '');
  const host = new URL(base).hostname.replace(/^www\./, '');
  const realDomain = !!env.PUBLIC_URL && !/onrender\.com$|localhost|127\.0\.0\.1/.test(host);
  const indexable = env.SITE_INDEXABLE ? env.SITE_INDEXABLE === '1' : realDomain, siteHome = env.SITE_HOME === '1';
  const tag = (v) => (/^[A-Za-z0-9_-]{8,100}$/.test(v || '') ? v : '');
  const analytics = { ga: /^(G|AW)-[A-Z0-9]+$/.test(env.GA_ID || '') ? env.GA_ID : '', google: tag(env.GOOGLE_SITE_VERIFICATION), bing: tag(env.BING_SITE_VERIFICATION) };
  // Any secret value works (Render's generated ones contain + and /): it is turned into a 32-letter hex key.
  const indexNowKey = env.INDEXNOW_KEY ? require('crypto').createHash('sha256').update(env.INDEXNOW_KEY).digest('hex').slice(0, 32) : '';
  const siteHost = /onrender\.com$|localhost|127\.0\.0\.1|site\.test/.test(host) ? '' : new URL(base).hostname; // text addresses follow the real domain
  let data = load(contentDir, { siteHost }); // throws with a clear list if a content file is wrong
  const content = () => data;
  // Kabbalat Shabbat moves with sunset: work out this week's time, and again every hour.
  const refreshKabbalat = async () => {
    try { const k = await kabbalatShabbat(data.org.kabbalatShabbat); if (k && k !== data.kabbalat) data = load(contentDir, { kabbalat: k, siteHost }); } catch (e) { log.error('kabbalat shabbat time:', e && e.message); }
  };
  const kabbalatReady = data.org.kabbalatShabbat ? refreshKabbalat() : Promise.resolve();
  if (data.org.kabbalatShabbat) setInterval(refreshKabbalat, 3600e3).unref();
  app.use((req, res, next) => kabbalatReady.then(() => next(), () => next()));
  const i18n = createI18n(contentDir || DIR), ctxOf = makeCtx({ content, i18n });
  const langOf = (req) => (LANGS.includes(req.get('x-lang')) ? req.get('x-lang') : 'en');
  const tOf = (req) => i18n.makeT(langOf(req));

  // /he/... and /ru/...: remember the language and route the rest of the address as usual.
  app.use((req, res, next) => {
    const m = /^\/(he|ru)(?=\/|$|\?)/.exec(req.url);
    if (m) { req.lang = m[1]; req.url = req.url.slice(3) || '/'; if (req.url[0] !== '/') req.url = '/' + req.url; }
    next();
  });
  // The language buttons: /lang/he?to=/events saves the choice for a year and opens the page in that language.
  app.get('/lang/:l', (req, res, next) => {
    if (!LANGS.includes(req.params.l)) return next();
    const to = /^\/[^/\\]/.test(String(req.query.to || '')) || req.query.to === '/' ? String(req.query.to) : '/';
    res.setHeader('Set-Cookie', `lang=${req.params.l}; Path=/; Max-Age=${365 * 86400}; SameSite=Lax${/^https:/.test(base) ? '; Secure' : ''}`);
    res.redirect(302, withLang(req.params.l, to));
  });
  const fb = facebook !== undefined ? facebook : createFacebook({ pageId: env.FB_PAGE_ID, token: env.FB_PAGE_TOKEN, igUserId: env.IG_USER_ID, base, log });

  // The site's own security policy: our scripts only (plus Google's tag if GA_ID is set), images from Facebook's CDN.
  const gtag = analytics.ga ? ' https://www.googletagmanager.com' : '';
  const csp = ["default-src 'self'", `script-src 'self'${gtag}`, "style-src 'self' 'unsafe-inline'", "img-src 'self' data: https://*.fbcdn.net https://w2.chabad.org" + (analytics.ga ? ' https://www.google-analytics.com https://www.googletagmanager.com' : ''),
    "connect-src 'self'" + (analytics.ga ? ' https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com' : ''), "font-src 'self'", "frame-src 'self' https://www.youtube-nocookie.com", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'"].join('; ');
  app.use((req, res, next) => { if (!/^\/(?:pushka|kiddush|board|admin|api)(?:\/|$)/.test(req.path)) res.setHeader('Content-Security-Policy', csp); next(); });

  // Extra domains (jewishlamorinda.org...) forward to the main address, keeping the page.
  const forward = new Set(String(env.FORWARD_DOMAINS || 'jewishlamorinda.org').split(',').map((d) => d.trim().toLowerCase().replace(/^www\./, '')).filter(Boolean));
  forward.delete(host);
  app.use((req, res, next) => (forward.has(String(req.hostname || '').toLowerCase().replace(/^www\./, '')) ? res.redirect(301, base + req.originalUrl) : next()));
  // Old Chabad.org addresses (/3186196, /templates/.../aid/3186196/..., /article.asp?aid=3186196) keep working.
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const R = data.redirects, aid = (/\/aid\/(\d+)/.exec(req.path) || [])[1] || (/^\/article\.asp$/i.test(req.path) && /^\d+$/.test(req.query.aid || '') ? req.query.aid : null);
    const to = R[req.path.replace(/\/+$/, '') || '/'] || (aid && R['/' + aid]);
    return to ? res.redirect(301, to) : next();
  });
  let community = null; // set just below; visitors links signed-in members through it
  const visitors = mountVisitors(app, { store, mailer, notifyTo: env.ADMIN_EMAIL || '', content, base, limit, log, readMember: (req) => (community ? community.readMember(req) : null) });
  const leads = mountLeads(app, { store, mailer, notifyTo: env.ADMIN_EMAIL || '', content, base, limit, log });
  const chat = mountChat(app, { env, client: chatClient, content, ctxOf, limit, store, log, leads });
  community = mountCommunity(app, { store, mailer, secret, base, limit, log, content, tOf, langOf, townsOf: (l) => ctxOf({ lang: l, method: 'GET', originalUrl: '/', query: {}, get: () => '' }).C.towns });
  // pushka.* and kiddush.* addresses keep opening their apps.
  const isHome = (req) => !/^(pushka|kiddush)\./i.test(req.hostname) && (siteHome || req.hostname.replace(/^www\./, '') === host);
  const pages = mountPages(app, { content, base, indexable, isHome, analytics, ctxOf, rsvpCounts: community.counts, photos: fb ? fb.photos : null });
  const outreach = mountOutreach(app, { store, readMember: community.readMember, content, base, ctxOf, upcoming: pages.upcoming });
  const r = express.Router();
  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  let ask = null, yearly = null;
  mountSeo(r, { content, base, indexable, upcoming: pages.upcoming, more: async () => [...(yearly ? yearly.paths(content()) : []), ...(ask ? (await ask.published()).map((x) => '/ask/' + encodeURIComponent(x.slug)) : [])] });
  mountTools(r, { render: pages.render, wrap, ctxOf });
  const reading = require('./reading.js').mountReading({ store, content, log });
  mountSearch(r, { render: pages.render, wrap, ctxOf, logSearch: reading.logSearch });
  yearly = mountYearly(r, { render: pages.render, wrap, ctxOf, base, upcoming: pages.upcoming });
  mountLocal(r, { content, base, wrap, ctxOf, ...pages });
  const board = mountBoard(r, { base, store, mailer, content, render: pages.render, wrap, limit, readMember: community.readMember, log, notifyTo: env.ADMIN_EMAIL || '', ctxOf, tOf });
  mountGive(r, { render: pages.render, wrap, ctxOf });
  mountKiddushPage(r, { render: pages.render, wrap, ctxOf });
  mountFun(r, { render: pages.render, wrap, ctxOf, base });
  mountCampaignPages(r, { render: pages.render, wrap, ctxOf, base, store });
  mountFlyer(r, { wrap, ctxOf, base });
  const forms = mountForms(r, { base, store, mailer, content, render: pages.render, wrap, limit, readMember: community.readMember, ctxOf, tOf, log, notifyTo: env.ADMIN_EMAIL || '', confirmNews: (email, lang) => weekly.confirmUrl(email, lang) });
  mountParsha(r, { render: pages.render, wrap, ctxOf, base });
  mountMitzvah(app, r, { store, render: pages.render, wrap, ctxOf, limit, base, log });
  ask = mountAsk(r, { store, render: pages.render, wrap, ctxOf, base, faqLd: pages.faqLd, crumbs: pages.crumbs });
  mountDaily(r, { render: pages.render, wrap, ctxOf });
  mountCalendar(r, { render: pages.render, wrap, ctxOf, upcoming: pages.upcoming });
  mountLife(r, { render: pages.render, wrap, ctxOf, faqHtml: pages.faqHtml, faqLd: pages.faqLd, crumbs: pages.crumbs, base, prayerList: board.prayerList });
  pages.setNews(board.approved);
  if (indexNowKey) {
    r.get('/' + indexNowKey + '.txt', (req, res) => res.type('text').send(indexNowKey));
    if (indexable) setTimeout(() => {
      const urls = [base + '/', base + '/events', ...data.events.filter((e) => e.published).map((e) => base + '/events/' + e.slug), ...data.towns.map((t) => base + '/jewish-' + t.slug), ...data.learn.map((a) => base + '/learn/' + a.slug)].slice(0, 10000);
      fetchImpl('https://api.indexnow.org/indexnow', { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify({ host: new URL(base).hostname, key: indexNowKey, keyLocation: base + '/' + indexNowKey + '.txt', urlList: urls }) })
        .then((x) => { if (!x.ok && x.status !== 202) log.error('IndexNow: HTTP ' + x.status); }, (e) => log.error('IndexNow:', e && e.message));
    }, 30e3).unref();
  }
  const weekly = mountWeekly(app, { store, mailer, content, base, secret, ctxOf, log, limit, notifyTo: env.ADMIN_EMAIL || '', auto: !!reminders, giving, upcoming: (C) => pages.upcoming(new Date(), C) });
  // /subscribe: what the weekly email brings, and the sign-up box.
  r.get('/subscribe', wrap(async (req, res) => {
    const X = ctxOf(req), t = X.t, items = [['shabbat-candles', 'Shabbat times', 'Candle lighting and Havdalah for Lafayette, Moraga and Orinda.'], ['torah-scroll', "This week's Torah portion", 'The parsha in two minutes, with a lesson for today.'], ['calendar', 'Upcoming events', 'Shabbat dinners, holidays, classes and programs, with one-tap RSVP.'], ['open-book', 'Something to read', 'Guides for the week\'s holidays and Jewish dates, and more.'], ['hands-heart', 'A mitzvah and a smile', 'One good deed to try, the question of the week and a joke.'], ['menorah', 'Holiday editions', 'Before every holiday: the dates, times, events and how to celebrate.']];
    await pages.render(res, { path: '/subscribe', title: t('Get the weekly email'), description: t('The free weekly email from Chabad of Lamorinda: Shabbat times for Lafayette, Moraga and Orinda, events, the Torah portion and more, in English, Hebrew or Russian.'),
      body: `<section class="wrap sec narrow"><p class="eyebrow hand">${esc(t('Every week, free'))}</p><h1>${esc(t('Get the weekly email'))}</h1><p class="lead-d">${esc(t('Everything Jewish in Lamorinda, once a week, in your language. Unsubscribe any time.'))}</p>
<form class="nl-form big" data-subscribe="page" novalidate><label for="nl-page-name">${esc(t('Your name'))}</label><input id="nl-page-name" name="name" autocomplete="name"><label for="nl-page">${esc(t('Email'))}</label><input id="nl-page" type="email" name="email" autocomplete="email" required><button class="btn gold" type="submit">${esc(t('Sign me up'))}</button><p class="nl-msg" role="status" aria-live="polite"></p></form>
<h2>${esc(t('What you get'))}</h2><div class="grid">${items.map(([a, h, d]) => `<div class="card tile has-art">${require('./art.js').artImg(a)}<h3>${esc(t(h))}</h3><p>${esc(t(d))}</p></div>`).join('')}</div>
<p class="muted">${esc(t('We never share your email.'))} <a href="/privacy">${esc(t('Privacy'))}</a> · <a href="/this-week">${esc(t('See this week'))}</a></p></section>` });
  }));
  const mail = createReminders({ store, mailer, base, org: data.org, log, i18n, notifyTo: env.ADMIN_EMAIL || '', townsOf: (l) => ctxOf({ lang: l, method: 'GET', originalUrl: '/', query: {}, get: () => '' }).C.towns });
  if (reminders && mail) mail.start();
  // Account page: the form is drawn by site.js from /api/site/me.
  r.get('/account', wrap(async (req, res) => {
    const X = ctxOf(req), t = X.t;
    await pages.render(res, { path: '/account', noindex: true, title: t('My account'), description: t('Your family, yahrzeits, birthdays and RSVPs at Chabad of Lamorinda.'),
      body: `<section class="wrap sec narrow"><h1>${esc(t('My account'))}</h1><div id="account" class="account"><p class="muted">${esc(t('Loading…'))}</p></div>
<div class="perks" data-perks><h2>${esc(t('Why join? It is free'))}</h2><div class="grid">${[['calendar', 'RSVP to any event in one tap', 'Your details and family are filled in for you.'], ['broken-heart-candle', 'Never miss a yahrzeit', 'We work out the Hebrew date and remind you a week and a day before.'], ['gift', 'Hebrew birthdays and Bar/Bat Mitzvah dates', 'For everyone in your family, with a reminder on the day.'], ['challah', 'Shabbat dinner in one tap', 'Tell us you are coming, with your family size and any allergies.'], ['mezuzah', 'Mezuzah and tefillin checks', 'A reminder when it is time to have them checked again.'], ['envelope', 'Your Jewish dates on your phone', 'Add them all to your phone calendar with one button.'], ['shabbat-candles', 'Candle lighting every Friday', 'The time for your own town, in your inbox on Friday morning.'], ['open-book', 'Your prayer list', 'Add names for Tehillim, and renew them with one tap.'], ['torah-scroll', 'Your child\'s Torah portion', 'See the Bar or Bat Mitzvah date and its Torah portion years ahead.']].map(([art, h, p]) => `<div class="card tile has-art">${require('./art.js').artImg(art)}<h3>${esc(t(h))}</h3><p>${esc(t(p))}</p></div>`).join('')}</div>
<p class="muted">${esc(t('No password: sign in with a code we email you. We never share your information.'))} <a href="/privacy">${esc(t('Privacy'))}</a></p></div>
<noscript><p>${esc(t('Please turn on JavaScript to sign in, or email us:'))} <a href="mailto:${esc(data.org.email)}">${esc(data.org.email)}</a></p></noscript></section>` });
  }));
  app.use(r);
  app.get('/:slug', pages.pagesRoute); // about, contact, privacy... (after every specific page)

  // Site pages that do not exist get a friendly page instead of a bare "Not found".
  const notFound = (req, res, next) => {
    if (req.method !== 'GET' || !req.accepts('html') || /^\/(api|admin|pushka|kiddush|board)\b/.test(req.path)) return next();
    const t = ctxOf(req).t;
    pages.render(res, { path: req.path, noindex: true, title: t('Page not found'), body: `<section class="wrap sec narrow"><h1>${esc(t('We could not find that page'))}</h1><form class="searchbar" action="/search" role="search"><input type="search" name="q" value="${esc((() => { try { return decodeURIComponent(req.path); } catch (e) { return ''; } })().replace(/^\/(he|ru)\//, '/').split('/').pop().replace(/[-_]+/g, ' ').replace(/\.\w+$/, '').slice(0, 60))}" aria-label="${esc(t('Search the website'))}"><button class="btn gold" type="submit">${esc(t('Search'))}</button></form><p>${esc(t('It may have moved. Try these:'))} <a href="/events">${esc(t('Events calendar'))}</a> · <a href="/shabbat">${esc(t('Shabbat times'))}</a> · <a href="/">${esc(t('Home'))}</a></p></section>` }, 404).catch(next);
  };
  return {
    content, base, notFound, facebook: fb, upcoming: pages.upcoming, when: pages.when, reminders: mail, i18n, ctxOf,
    reload() { data = load(contentDir, { kabbalat: data.kabbalat, siteHost }); refreshKabbalat(); return data; },
    // Rabbi area extras (RSVP lists, birthdays, post an event to Facebook).
    mountAdmin(r2, ctx) {
      // Which settings are in place (yes/no only, never the values), matching store/rabbi-todo.md.
      r2.get('/api/site/setup', ctx.authed, (req, res) => res.json({ items: [
        { label: 'Database (sign-in, RSVPs, lists)', done: !!store, todo: 1 },
        { label: 'Email sending', done: !!env.SMTP_URL, todo: 3 },
        { label: 'Where requests are emailed', done: !!env.ADMIN_EMAIL, todo: 4 },
        { label: 'AI answers in the chat (optional, costs a little)', done: !!env.ANTHROPIC_API_KEY, todo: 5, optional: true },
        { label: 'Facebook page', done: !!(env.FB_PAGE_ID && env.FB_PAGE_TOKEN), todo: 6 },
        { label: 'Instagram', done: !!env.IG_USER_ID, todo: 6, optional: true },
        { label: 'Google Analytics', done: !!env.GA_ID, todo: 8, optional: true },
        { label: 'Website address (jewishlamorinda.com) connected', done: !!env.PUBLIC_URL && !/onrender\.com/.test(env.PUBLIC_URL), todo: 20 },
        { label: 'Google Search Console', done: !!env.GOOGLE_SITE_VERIFICATION, todo: 10 },
        { label: 'Phone notifications for the app', done: !!(env.VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY), todo: 11, optional: true },
      ] }));
      mountCommunityAdmin(r2, ctx, { cs: community.cs, content, store });
      mountSocialAdmin(r2, ctx, { store, content, fb, base, when: pages.when });
      board.mountAdmin(r2, ctx);
      forms.mountAdmin(r2, ctx);
      chat.mountAdmin(r2, ctx);
      leads.mountAdmin(r2, ctx);
      visitors.mountAdmin(r2, ctx);
      weekly.mountAdmin(r2, ctx);
      reading.mountAdmin(r2, ctx);
      ask.mountAdmin(r2, ctx);
      outreach.mountAdmin(r2, ctx);
      r2.get('/community', (req, res) => res.sendFile(require('path').join(__dirname, '..', 'admin', 'community.html')));
      r2.get('/community.js', (req, res) => res.sendFile(require('path').join(__dirname, '..', 'admin', 'community.js')));
    },
  };
}
module.exports = { mountSite };
