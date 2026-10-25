// Page shell for the website: <head> with full search/social metadata, structured data (JSON-LD) that
// Google and AI assistants read, hreflang links between the English, Hebrew and Russian versions, the header
// (with the language switch) and the footer. Pages are plain server-rendered HTML: no framework, one small CSS
// file and one small script, so they load almost instantly.
'use strict';
const { esc } = require('./md.js');
const { fullAddress } = require('./content.js');
const { LANGS, RTL, withLang } = require('./i18n.js');

const NAV = [
  ['/events', 'Events'], ['/shabbat', 'Shabbat'], ['/holidays', 'Holidays'], ['/programs', 'Programs'],
  ['/learn', 'Learn'], ['/jewish-lamorinda', 'Jewish Lamorinda'], ['/community', 'Community'], ['/help', 'Help'],
];

// Organization + place of worship, on every page (Google knowledge panel, maps, AI answers).
function orgLd(c, base) {
  const o = c.org;
  return {
    '@context': 'https://schema.org',
    '@type': ['Synagogue', 'NGO'],
    '@id': base + '/#org',
    name: o.name,
    alternateName: o.alternateNames || undefined,
    description: o.description,
    url: base + '/',
    logo: base + '/assets/logo.svg',
    image: o.image ? base + o.image : base + '/assets/og.png',
    telephone: o.phone || undefined,
    email: o.email || undefined,
    address: { '@type': 'PostalAddress', streetAddress: o.address.street, addressLocality: o.address.city, addressRegion: o.address.region, postalCode: o.address.postal, addressCountry: 'US' },
    geo: { '@type': 'GeoCoordinates', latitude: o.geo.lat, longitude: o.geo.lng },
    areaServed: (c.towns || []).map((t) => ({ '@type': 'City', name: (t.name_en || t.name) + ', CA' })),
    hasMap: 'https://maps.google.com/?q=' + encodeURIComponent(fullAddress(o)),
    isAccessibleForFree: true,
    publicAccess: true,
    availableLanguage: ['English', 'Hebrew', 'Russian'],
    employee: (o.staff || []).map((p) => ({ '@type': 'Person', name: p.name, jobTitle: p.role })),
    sameAs: Object.values(o.social || {}).filter((v) => /^https?:/.test(v)),
    parentOrganization: { '@type': 'Organization', name: 'Chabad-Lubavitch', url: 'https://www.chabad.org' },
    knowsAbout: ['Judaism', 'Shabbat', 'Jewish holidays', 'Torah study', 'Hebrew school', 'Bar Mitzvah', 'Bat Mitzvah', 'Kosher', 'Kaddish', 'Jewish funerals', 'Jewish weddings', 'Tehillim', 'Jewish life in Lafayette, Moraga and Orinda'],
  };
}

function layout(c, { base, indexable, path, title, description, body, ld = [], image, noindex = false, hebrewDate = '', shabbat = null, analytics = {}, lang = 'en', t = (s) => s, fmtDay = (d) => d, tm = (e) => e.timeStr }) {
  const o = c.org, url = (l) => base + withLang(l, path), canonical = url(lang);
  const fullTitle = path === '/' ? `${o.name} | ${t('Jewish Lafayette, Moraga & Orinda')}` : `${title} | ${o.name}`;
  const desc = String(description || o.description).slice(0, 300);
  const img = image ? (image.startsWith('http') ? image : base + image) : base + '/assets/og.png';
  const robots = !indexable || noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large, max-snippet:-1';
  const nav = NAV.map(([href, label]) => `<a href="${href}"${path.startsWith(href) ? ' aria-current="page"' : ''}>${esc(t(label))}</a>`).join('');
  const lds = [orgLd(c, base), ...ld].map((x) => `<script type="application/ld+json">${JSON.stringify(x).replace(/</g, '\\u003c')}</script>`).join('\n');
  const parsha = shabbat && shabbat.parsha ? (lang === 'he' ? shabbat.parsha.titleHe : t(shabbat.parsha.title)) : '';
  const strip = shabbat && shabbat.candles ? `<a class="topstrip" href="/shabbat">${esc(hebrewDate)} · ${esc(t('Shabbat candles'))} ${esc(fmtDay(shabbat.candles.date))} ${esc(tm(shabbat.candles))}${parsha ? ' · ' + esc(parsha) : ''}</a>` : '';
  const ga = analytics.ga ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${esc(analytics.ga)}"></script><script src="/assets/gtag.js" data-id="${esc(analytics.ga)}"></script>` : '';
  // Language switch: /lang/he?to=/events remembers the choice and opens that page in Hebrew.
  const langs = LANGS.map((l) => `<a href="/lang/${l}?to=${encodeURIComponent(path)}" hreflang="${l}" lang="${l}"${l === lang ? ' aria-current="true"' : ''}>${l === 'en' ? 'EN' : l === 'he' ? 'עב' : 'RU'}</a>`).join('');
  return `<!doctype html>
<html lang="${lang}" dir="${RTL.has(lang) ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="${robots}">
<link rel="canonical" href="${esc(canonical)}">
${LANGS.map((l) => `<link rel="alternate" hreflang="${l}" href="${esc(url(l))}">`).join('')}<link rel="alternate" hreflang="x-default" href="${esc(url('en'))}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(o.name)}">
<meta property="og:locale" content="${lang === 'he' ? 'he_IL' : lang === 'ru' ? 'ru_RU' : 'en_US'}">
<meta property="og:title" content="${esc(title || o.name)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(img)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#14284b">
${analytics.google ? `<meta name="google-site-verification" content="${esc(analytics.google)}">` : ''}${analytics.bing ? `<meta name="msvalidate.01" content="${esc(analytics.bing)}">` : ''}
<meta name="geo.region" content="US-CA"><meta name="geo.placename" content="Lafayette, California"><meta name="geo.position" content="${o.geo.lat};${o.geo.lng}"><meta name="ICBM" content="${o.geo.lat}, ${o.geo.lng}">
<link rel="icon" href="/assets/logo.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/pushka/icon-180.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="alternate" type="application/rss+xml" title="${esc(o.name)}" href="/feed.xml">
<link rel="alternate" type="text/calendar" title="${esc(o.name)}" href="/events.ics">
<link rel="stylesheet" href="/assets/site.css?v=${ASSET_V}">
${lds}
${ga}
</head>
<body>
<a class="skip" href="#main">${esc(t('Skip to content'))}</a>
${strip}
<header class="hdr">
  <div class="wrap hdr-in">
    <a class="brand" href="/" aria-label="${esc(o.name)}"><img src="/assets/logo.svg" alt="" width="40" height="26"><span>${esc(o.shortName || o.name)}</span></a>
    <details class="menu"><summary aria-label="${esc(t('Menu'))}"><span></span></summary><nav aria-label="${esc(t('Main'))}">${nav}<p class="langs">${langs}</p></nav></details>
    <nav class="nav-wide" aria-label="${esc(t('Main'))}">${nav}</nav>
    <div class="hdr-cta"><p class="langs wide" aria-label="${esc(t('Language'))}">${langs}</p><a class="btn sm ghost" href="/account" data-account>${esc(t('Sign in'))}</a><a class="btn sm gold" href="/donate">${esc(t('Donate'))}</a></div>
  </div>
</header>
<main id="main">
${body}
</main>
${footer(c, t)}
<button class="chat-fab" type="button" data-chat-open aria-haspopup="dialog">${esc(t('Ask us'))}</button>
<script type="application/json" id="i18n">${JSON.stringify({ lang, s: clientStrings(t) }).replace(/</g, '\\u003c')}</script>
<script src="/assets/site.js?v=${ASSET_V}" defer></script>
</body>
</html>`;
}

function footer(c, t) {
  const o = c.org, s = o.social || {};
  const social = [['facebook', 'Facebook'], ['instagram', 'Instagram'], ['youtube', 'YouTube'], ['whatsapp', 'WhatsApp']].filter(([k]) => s[k]).map(([k, n]) => `<a href="${esc(s[k])}" rel="noopener" target="_blank">${n}</a>`).join('');
  const a = (href, label) => `<a href="${href}">${esc(t(label))}</a>`;
  return `<footer class="ftr">
  <div class="wrap ftr-grid">
    <div>
      <p class="ftr-name">${esc(o.name)}</p>
      <p>${esc(fullAddress(o))}</p>
      ${o.phone ? `<p><a href="tel:${esc(o.phone.replace(/[^0-9+]/g, ''))}" dir="ltr">${esc(o.phone)}</a></p>` : ''}
      ${o.email ? `<p><a href="mailto:${esc(o.email)}">${esc(o.email)}</a></p>` : ''}
      <p class="social">${social}</p>
      <p>${a('/about', 'About us')} ${a('/contact', 'Contact')}</p>
    </div>
    <div>
      <p class="ftr-h">${esc(t('Community'))}</p>
      ${a('/events', 'Events calendar')}${a('/calendar', 'Jewish calendar')}${a('/shabbat', 'Shabbat times')}${a('/holidays', 'Jewish holidays')}${a('/programs', 'Programs')}${a('/photos', 'Photos')}${a('/community', 'Community board')}
    </div>
    <div>
      <p class="ftr-h">${esc(t("We're here for you"))}</p>
      ${a('/help/someone-passed-away', 'When someone passes away')}${a('/help/someone-is-sick', 'When someone is sick')}${a('/kaddish', 'Kaddish')}${a('/tehillim', 'Tehillim for every occasion')}${a('/help', 'All life situations')}${a('/ask', 'Ask the Rabbi')}${a('/help/talk-to-the-rabbi', 'Talk to the Rabbi')}
    </div>
    <div>
      <p class="ftr-h">${esc(t('Jewish life'))}</p>
      ${a('/jewish-lamorinda', 'Everything Jewish in Lamorinda')}${a('/learn', 'Learn about Judaism')}${a('/parsha', "This week's Torah portion")}${a('/tools/zmanim', 'Daily prayer times (zmanim)')}${a('/tools/hebrew-date', 'Hebrew date converter')}${a('/tools/hebrew-birthday', 'Hebrew birthday calculator')}${a('/tools/yahrzeit', 'Yahrzeit calculator')}${a('/tools/bar-bat-mitzvah', 'Bar & Bat Mitzvah date')}${a('/faq', 'Questions & answers')}
    </div>
    <div>
      <p class="ftr-h">${esc(t('Our area'))}</p>
      ${(c.towns || []).map((x) => `<a href="/jewish-${x.slug}">${esc(t('Jewish {town}', { town: x.name }))}</a>`).join('')}
    </div>
    <div>
      <p class="ftr-h">${esc(t('Get involved'))}</p>
      ${a('/account', 'My account & family')}${a('/forms', 'Sign-ups and orders')}${a('/forms/newsletter', 'Get our weekly email')}${a('/sponsor', 'Sponsor in honor or memory')}${a('/get-involved', 'Get involved')}${a('/welcome', 'New to the area?')}${a('/donate', 'Donate')}<a href="/pushka/">${esc(t('My Pushka app'))}</a><a href="/kiddush/">${esc(t('Sponsor a Kiddush'))}</a><a href="/board/">${esc(t('Chai Club'))}</a>
    </div>
  </div>
  <div class="wrap ftr-base"><p>&copy; ${new Date().getFullYear()} ${esc(o.name)}. ${esc(o.legal || '')} ${esc(t('Part of the worldwide Chabad-Lubavitch movement.'))}</p><p>${a('/privacy', 'Privacy')} · ${a('/accessibility', 'Accessibility')}</p></div>
</footer>`;
}

// Words the browser script needs (RSVP, account, forms), passed in the page so it works in every language.
const CLIENT = ['My account', 'Online RSVP is coming soon. Please call or email us to RSVP.', 'Could not load the RSVP form. Please refresh the page.', 'Adults', 'Children', 'Name', 'Email', 'Phone (optional)', 'Note', 'Anything we should know? (optional)', 'Update my RSVP', "I'm coming", 'RSVP', 'You are coming.', 'RSVP as {name}.', 'Tip:', 'sign in', 'once and next time RSVP is a single tap.', 'Thank you! You are on the list. See you there.', 'Something went wrong.', 'Something went wrong. Please refresh the page.', 'Accounts are being set up and will open soon.', 'Email me a sign-in code', 'That sign-in link has expired. Please ask for a new one.', 'Sign in or create your free account with your email. No password: we email you a 6-digit code.', 'We sent a code to {email}. Enter it here, or tap the link in the email.', '6-digit code', 'Sign in', 'Full name', 'Hebrew name (e.g. Moshe ben Avraham)', 'Phone', 'Address', 'Birthday', 'Wedding anniversary', 'Born after sunset', 'Email me about events and holidays', 'Share my yahrzeits with the Rabbi (so he can remember them with you)', 'Me', 'Save', 'Saved.', 'Spouse', 'Child', 'Parent', 'Sibling', 'Grandchild', 'Grandparent', 'Other', 'Male', 'Female', 'Hebrew name', 'Relation', 'Gender', 'Remove', 'My family', 'Add your spouse and children. We will remember Hebrew birthdays and Bar/Bat Mitzvah dates, and your RSVPs count the family for you.', '+ Add a family member', 'Save family', 'Relation (e.g. father)', 'Date of passing', 'Passed after sunset', 'Notes', 'Hebrew date: {date}', 'next yahrzeit {date}', 'Enter a date only to change it.', 'Yahrzeits', 'We work out the Hebrew date and remind you every year.', '(from the My Pushka app)', '+ Add a yahrzeit', 'Save yahrzeits', 'Sign out', 'Delete my account', 'Delete your account, family and yahrzeits? This cannot be undone.', 'My RSVPs', '{n} people', 'Thank you! The Rabbi will review it and post it soon.', 'Thank you! We received it and the Rabbi will be in touch.', 'Sponsor in their memory', 'Mark the occasion: sponsor a Kiddush or give in their honor', 'Tehillim for this', 'Total: ${amount}', 'Ask us', 'Close', 'Ask a question about Judaism or our community', 'Send', 'Send to the Rabbi', 'Hello! I can help with Shabbat times, programs, registration, holidays, Jewish questions, and anything you need from Chabad of Lamorinda. What would you like to know?', 'When is Shabbat this week?', 'How do I register for Hebrew School?', 'Someone in my family passed away', 'How do I put up a mezuzah?', 'Thinking…', 'Sorry, something went wrong. Please call 925-384-7242.', 'Your name', 'Your email', 'The Rabbi will see this conversation and get back to you.', 'Sent. The Rabbi will be in touch.', 'Answers come from our website and may not be perfect. For anything important, call the Rabbi.', 'New conversation', 'My upcoming Jewish dates', 'Yahrzeit', 'Hebrew birthday', 'Bar Mitzvah', 'Bat Mitzvah', 'Wedding anniversary', 'Plan the Bar or Bat Mitzvah with the Rabbi'];
const clientStrings = (t) => Object.fromEntries(CLIENT.map((s) => [s, t(s)]).filter(([a, b]) => a !== b));

// Bumped when site.css/site.js change, so browsers can cache them for a long time.
const ASSET_V = require('crypto').createHash('sha1').update(['site.css', 'site.js'].map((f) => { try { return require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'site', 'assets', f)); } catch (e) { return ''; } }).join('|')).digest('hex').slice(0, 10);

module.exports = { layout, orgLd, NAV, ASSET_V, CLIENT };
