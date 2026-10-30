// Page shell for the website: <head> with full search/social metadata, structured data (JSON-LD) that
// Google and AI assistants read, hreflang links between the English, Hebrew and Russian versions, the header
// (with the language switch) and the footer. Pages are plain server-rendered HTML: no framework, one small CSS
// file and one small script, so they load almost instantly.
'use strict';
const { esc } = require('./md.js');
const { fullAddress } = require('./content.js');
const { LANGS, RTL, withLang } = require('./i18n.js');
const { campaignBar } = require('./campaign-page.js');

const NAV = [
  ['/events', 'Events'], ['/calendar', 'Calendar'], ['/shabbat', 'Shabbat'], ['/holidays', 'Holidays'], ['/programs', 'Programs'],
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
  // Google shows about 60 characters of a title and 160 of a description: add our name only when it fits, and end
  // long descriptions at a word.
  const fullTitle = path === '/' ? `${o.name} | ${t('Jewish Lafayette, Moraga & Orinda')}` : (title.length + o.name.length + 3 <= 65 ? `${title} | ${o.name}` : title);
  const d0 = String(description || o.description).replace(/\s+/g, ' ').trim(), desc = d0.length <= 160 ? d0 : d0.slice(0, 157).replace(/\s+\S*$/, '') + '…';
  const img = image ? (image.startsWith('http') ? image : base + image) : base + '/assets/og.png';
  const robots = !indexable || noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large, max-snippet:-1';
  const nav = NAV.map(([href, label]) => `<a href="${href}"${path.startsWith(href) ? ' aria-current="page"' : ''}>${esc(t(label))}</a>`).join('');
  const lds = [orgLd(c, base), ...(path === '/' ? [{ '@context': 'https://schema.org', '@type': 'WebSite', name: c.org.name, url: base + '/', inLanguage: lang, potentialAction: { '@type': 'SearchAction', target: base + '/search?q={search_term_string}', 'query-input': 'required name=search_term_string' } }] : []), ...ld].map((x) => `<script type="application/ld+json">${JSON.stringify(x).replace(/</g, '\\u003c')}</script>`).join('\n');
  const parsha = shabbat && shabbat.parsha ? (lang === 'he' ? shabbat.parsha.titleHe : t(shabbat.parsha.title)) : '';
  const strip = shabbat && shabbat.candles ? `<div role="region" aria-label="${esc(t('This Shabbat'))}"><a class="topstrip" href="/shabbat">${esc(hebrewDate)} · ${esc(t('Shabbat candles'))} ${esc(fmtDay(shabbat.candles.date))} ${esc(tm(shabbat.candles))}${parsha ? ' · ' + esc(parsha) : ''}</a></div>` : '';
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
${campaignBar(c, t, path)}
<header class="hdr">
  <div class="wrap hdr-in">
    <a class="brand" href="/" aria-label="${esc(o.name)}"><img src="/assets/logo.svg" alt="" width="40" height="26"><span>${esc(o.shortName || o.name)}</span></a>
    <details class="menu"><summary aria-label="${esc(t('Menu'))}"><span></span></summary><nav aria-label="${esc(t('Main'))}"><a href="/search">${esc(t('Search'))}</a>${nav}<p class="langs">${langs}</p></nav></details>
    <nav class="nav-wide" aria-label="${esc(t('Main'))}">${nav}</nav>
    <div class="hdr-cta"><a class="search-btn" href="/search" aria-label="${esc(t('Search'))}"><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15.5 15.5 21 21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></a><p class="langs wide" aria-label="${esc(t('Language'))}">${langs}</p><a class="btn sm ghost" href="/account" data-account>${esc(t('Sign in'))}</a><a class="btn sm gold" href="/donate">${esc(t('Donate'))}</a></div>
  </div>
</header>
<main id="main">
${body}
</main>
${signUp(t, path)}${footer(c, t)}
<button class="chat-fab" type="button" data-chat-open aria-haspopup="dialog">${esc(t('Ask us'))}</button>
<script type="application/json" id="i18n">${JSON.stringify({ lang, s: clientStrings(t) }).replace(/</g, '\\u003c')}</script>
<script src="/assets/site.js?v=${ASSET_V}" defer></script>
</body>
</html>`;
}

// Getting the weekly email: a band above the footer of every page, and a small pop-up for visitors who have been
// reading for a while (site.js decides when; never on sign-up, giving or account pages, never twice in three weeks).
const NO_SIGNUP = /^\/(subscribe|donate|chai-club|sponsor|campaign|account|forms|admin|newsletter|unsubscribe|kiddush|pushka)/;
function signUp(t, path) {
  if (NO_SIGNUP.test(path)) return '';
  const form = (src, cls) => `<form class="nl-form ${cls}" data-subscribe="${src}" novalidate><label class="sr-only" for="nl-${src}">${esc(t('Email'))}</label><input id="nl-${src}" type="email" name="email" autocomplete="email" required placeholder="${esc(t('Your email'))}"><button class="btn gold" type="submit">${esc(t('Sign me up'))}</button><p class="nl-msg" role="status" aria-live="polite"></p></form>`;
  return `<section class="nl-band" aria-labelledby="nl-h"><div class="wrap nl-in"><div><p class="eyebrow hand">${esc(t('Every week, free'))}</p><h2 id="nl-h">${esc(t('Get the weekly email'))}</h2><p>${esc(t('Shabbat times, upcoming events, the Torah portion in two minutes, a guide to read, a mitzvah and a smile. Unsubscribe any time.'))}</p></div>${form('band', '')}</div></section>
<aside class="nl-pop" data-nl-pop hidden aria-labelledby="nl-pop-h"><button type="button" class="nl-x" data-nl-close aria-label="${esc(t('Close'))}">×</button><p class="eyebrow hand">${esc(t('Shabbat Shalom!'))}</p><h2 id="nl-pop-h">${esc(t('Get the weekly email'))}</h2><p>${esc(t('Candle lighting, events and a little Torah, once a week, in your language.'))}</p>${form('popup', 'stack')}<p class="nl-small">${esc(t('We never share your email.'))}</p></aside>`;
}
function footer(c, t) {
  const o = c.org, s = o.social || {};
  const social = [['facebook', 'Facebook'], ['instagram', 'Instagram'], ['youtube', 'YouTube'], ['whatsapp', 'WhatsApp']].filter(([k]) => s[k]).map(([k, n]) => `<a href="${esc(s[k])}" rel="noopener" target="_blank">${n}</a>`).join('');
  const a = (href, label) => `<a href="${href}">${esc(t(label))}</a>`;
  return `<footer class="ftr">
  <div class="wrap ftr-grid">
    <div>
      <p class="ftr-name">${esc(o.name)}</p>
      <p><bdi dir="ltr">${esc(fullAddress(o))}</bdi></p>
      ${o.phone ? `<p><a href="tel:${esc(o.phone.replace(/[^0-9+]/g, ''))}" dir="ltr">${esc(o.phone)}</a></p>` : ''}
      ${o.email ? `<p><a href="mailto:${esc(o.email)}">${esc(o.email)}</a></p>` : ''}
      <p class="social">${social}</p>
      <p>${a('/about', 'About us')} ${a('/contact', 'Contact')}</p>
    </div>
    <details class="ftr-col" open>
      <summary class="ftr-h">${esc(t('Community'))}</summary><div class="ftr-links">
      ${a('/calendar', 'Calendar')}${a('/events', 'Upcoming events')}${a('/shabbat', 'Shabbat times')}${a('/holidays', 'Jewish holidays')}${a('/programs', 'Programs')}${a('/photos', 'Photos')}${a('/community', 'Community board')}
    </div></details>
    <details class="ftr-col" open>
      <summary class="ftr-h">${esc(t("We're here for you"))}</summary><div class="ftr-links">
      ${a('/help/someone-passed-away', 'When someone passes away')}${a('/help/someone-is-sick', 'When someone is sick')}${a('/kaddish', 'Kaddish')}${a('/tehillim', 'Tehillim for every occasion')}${a('/help', 'All life situations')}${a('/ask', 'Ask the Rabbi')}${a('/help/talk-to-the-rabbi', 'Talk to the Rabbi')}
    </div></details>
    <details class="ftr-col" open>
      <summary class="ftr-h">${esc(t('Jewish life'))}</summary><div class="ftr-links">
      ${a('/jewish-lamorinda', 'Everything Jewish in Lamorinda')}${a('/learn', 'Learn about Judaism')}${a('/parsha', "This week's Torah portion")}${a('/this-week', 'This week in Jewish Lamorinda')}${a('/shabbat-times', 'Shabbat times')}${a('/jewish-holidays-' + new Date().getFullYear(), 'Jewish holidays this year')}${a('/tools/zmanim', 'Daily prayer times (zmanim)')}${a('/tools/hebrew-date', 'Hebrew date converter')}${a('/tools/hebrew-birthday', 'Hebrew birthday calculator')}${a('/tools/yahrzeit', 'Yahrzeit calculator')}${a('/tools/bar-bat-mitzvah', 'Bar & Bat Mitzvah date')}${a('/faq', 'Questions & answers')}
    </div></details>
    <details class="ftr-col" open>
      <summary class="ftr-h">${esc(t('Our area'))}</summary><div class="ftr-links">
      ${(c.towns || []).filter((x) => x.tier !== 'near').map((x) => `<a href="/jewish-${x.slug}">${esc(t('Jewish {town}', { town: x.name }))}</a>`).join('')}
    </div></details>
    <details class="ftr-col" open>
      <summary class="ftr-h">${esc(t('Get involved'))}</summary><div class="ftr-links">
      ${a('/account', 'My account & family')}${a('/forms', 'Sign-ups and orders')}${a('/subscribe', 'Get our weekly email')}${a('/sponsor', 'Sponsor in honor or memory of a loved one')}${a('/mitzvah', 'Do a mitzvah this week')}${a('/get-involved', 'Get involved')}${a('/welcome', 'New to the area?')}${a('/donate', 'Donate')}<a href="/pushka/">${esc(t('My Pushka app'))}</a><a href="/sponsor-a-kiddush">${esc(t('Sponsor a Kiddush'))}</a><a href="/board/">${esc(t('Chai Club'))}</a>
    </div></details>
  </div>
  <div class="wrap ftr-base"><p>&copy; ${new Date().getFullYear()} ${esc(o.name)}. ${esc(o.legal || '')} ${esc(t('Part of the worldwide Chabad-Lubavitch movement.'))}</p><p>${a('/privacy', 'Privacy')} · ${a('/accessibility', 'Accessibility')}</p></div>
</footer>`;
}

// Words the browser script needs (RSVP, account, forms), passed in the page so it works in every language.
const CLIENT = ['You are already signed up. Thank you!', 'Thank you! Please check your email and tap the link to confirm.', "I'm going to {title} ({when}) at Chabad of Lamorinda. Come with me! {url}", 'Bring a friend', 'Everything is better together. Send a friend your personal invitation:', 'Copy link', 'Link copied', 'Text message', 'Email', '{n} available', 'All taken: thank you!', '{amount} a month', '{amount} a year', 'With matching, your {gift} becomes {total}!', 'Please enter an amount.', 'Please enter your name.', 'Please enter a valid email address.', 'Each payment needs to be at least $5.', 'Thank you for your pledge of {amount}! We will be in touch soon with the details.', "I'm in!", '1 partner', '{n} partners', 'and {n} who give quietly', 'Out of coins! Play again?', '30 coins: you win! A freilichen Chanukah!', 'Ready? Tap Spin!', 'Please enter an amount between $1 and $10,000.', 'Please enter the name for the board.', 'Opening secure checkout…', 'Online giving is opening soon. Please call 925-384-7242, or see other ways to give below.', 'Something went wrong. Please try again.', 'Continue to secure payment', 'Platinum', 'Gold', 'Silver', 'Bronze', '{n} partners in all', 'Be the first to join!', '{n} this month', 'My account', 'Online RSVP is coming soon. Please call or email us to RSVP.', 'Could not load the RSVP form. Please refresh the page.', 'Adults', 'Children', 'Name', 'Email', 'Phone (optional)', 'Note', 'Anything we should know? (optional)', 'Update my RSVP', "I'm coming", 'RSVP', 'You are coming.', 'RSVP as {name}.', 'Tip:', 'sign in', 'once and next time RSVP is a single tap.', 'Thank you! You are on the list. See you there.', 'Something went wrong.', 'Something went wrong. Please refresh the page.', 'Accounts are being set up and will open soon.', 'Email me a sign-in code', 'That sign-in link has expired. Please ask for a new one.', 'Sign in or create your free account with your email. No password: we email you a 6-digit code.', 'We sent a code to {email}. Enter it here, or tap the link in the email.', '6-digit code', 'Sign in', 'Full name', 'Hebrew name (e.g. Moshe ben Avraham)', 'Phone', 'Address', 'Birthday', 'Wedding anniversary', 'Born after sunset', 'Email me about events and holidays', 'Share my yahrzeits with the Rabbi (so he can remember them with you)', 'Me', 'Save', 'Saved.', 'Spouse', 'Child', 'Parent', 'Sibling', 'Grandchild', 'Grandparent', 'Other', 'Male', 'Female', 'Hebrew name', 'Relation', 'Gender', 'Remove', 'My family', 'Add your spouse and children. We will remember Hebrew birthdays and Bar/Bat Mitzvah dates, and your RSVPs count the family for you.', '+ Add a family member', 'Save family', 'Relation (e.g. father)', 'Date of passing', 'Passed after sunset', 'Notes', 'Hebrew date: {date}', 'next yahrzeit {date}', 'Enter a date only to change it.', 'Yahrzeits', 'We work out the Hebrew date and remind you every year.', '(from the My Pushka app)', '+ Add a yahrzeit', 'Save yahrzeits', 'Sign out', 'Delete my account', 'Delete your account, family and yahrzeits? This cannot be undone.', 'My RSVPs', '{n} people', 'Thank you! The Rabbi will review it and post it soon.', 'Thank you! We received it and the Rabbi will be in touch.', 'Sponsor in their memory', 'Mark the occasion: sponsor a Kiddush or give in their honor', 'Tehillim for this', 'Total: ${amount}', 'Ask us', 'Close', 'Ask a question about Judaism or our community', 'Send', 'Send to the Rabbi', 'Hello! I can help with Shabbat times, programs, registration, holidays, Jewish questions, and anything you need from Chabad of Lamorinda. What would you like to know?', 'When is Shabbat this week?', 'How do I register for Hebrew School?', 'Someone in my family passed away', 'How do I put up a mezuzah?', 'Thinking…', 'Sorry, something went wrong. Please call 925-384-7242.', 'Your name', 'Your email', 'The Rabbi will see this conversation and get back to you.', 'Sent. The Rabbi will be in touch.', 'Answers come from our website and may not be perfect. For anything important, call the Rabbi.', 'New conversation', 'My upcoming Jewish dates', 'Yahrzeit', 'Hebrew birthday', 'Bar Mitzvah', 'Bat Mitzvah', 'Wedding anniversary', 'Plan the Bar or Bat Mitzvah with the Rabbi', 'Mezuzahs last checked', 'Tefillin last checked', 'Mezuzahs and tefillin should be checked by a scribe twice in seven years. We will remind you when it is time.', 'Mezuzahs due for checking', 'Tefillin due for checking', 'Have them checked by a scribe', 'Allergies or dietary needs (optional)', 'Add my Jewish dates to my phone calendar', 'For your family', "Name for prayer (Hebrew name and mother's name, if you know them)", 'on the list since {date}', 'no longer on the list', 'Renew', 'My prayer list', 'Names for a refuah shleimah (complete recovery). The Rabbi and the community say Tehillim for them. Names stay on the list for 90 days; renew with one tap.', 'Add to the prayer list', 'Added. May they have a complete recovery.', "Save your family's details so next time is one tap:", 'Create your free family account', 'Add your family', 'Add your Hebrew name', 'Choose your town', 'Get the Friday candle-lighting email', 'Add a yahrzeit to remember', 'Add a phone number', 'Get started', '{done} of {all} done', 'Email me the candle-lighting time every Friday', 'My town', 'People', "We're coming", 'Wonderful! The Rabbi\'s family is expecting you. Shabbat Shalom!', 'Shabbat dinner with the Rabbi\'s family, {day}?', 'RSVP in one tap', 'Suggest events and classes that fit my family (based on what we come to and read here)', 'Allergies and dietary needs are shared only with our staff, so meals and children\'s programs are safe for everyone.'];
const clientStrings = (t) => Object.fromEntries(CLIENT.map((s) => [s, t(s)]).filter(([a, b]) => a !== b));

// Bumped when site.css/site.js change, so browsers can cache them for a long time.
const ASSET_V = require('crypto').createHash('sha1').update(['site.css', 'site.js'].map((f) => { try { return require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'site', 'assets', f)); } catch (e) { return ''; } }).join('|')).digest('hex').slice(0, 10);

module.exports = { layout, orgLd, NAV, ASSET_V, CLIENT };
