// Page shell for the website: <head> with full search/social metadata, structured data (JSON-LD) that
// Google and AI assistants read, the header/nav, and the footer. Pages are plain server-rendered HTML:
// no framework, one small CSS file and one small script, so they load almost instantly.
'use strict';
const { esc } = require('./md.js');
const { fullAddress } = require('./content.js');

const NAV = [
  ['/events', 'Events'], ['/shabbat', 'Shabbat'], ['/holidays', 'Holidays'], ['/programs', 'Programs'],
  ['/learn', 'Learn'], ['/jewish-lamorinda', 'Jewish Lamorinda'], ['/community', 'Community'], ['/about', 'About'],
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
    areaServed: (c.towns && c.towns.length ? c.towns.map((t) => t.name) : o.areaServed || []).map((n) => ({ '@type': 'City', name: n + ', CA' })),
    hasMap: 'https://maps.google.com/?q=' + encodeURIComponent(fullAddress(o)),
    isAccessibleForFree: true,
    publicAccess: true,
    employee: (o.staff || []).map((p) => ({ '@type': 'Person', name: p.name, jobTitle: p.role })),
    sameAs: Object.values(o.social || {}).filter(Boolean),
    parentOrganization: { '@type': 'Organization', name: 'Chabad-Lubavitch', url: 'https://www.chabad.org' },
    knowsAbout: ['Judaism', 'Shabbat', 'Jewish holidays', 'Torah study', 'Hebrew school', 'Bar Mitzvah', 'Bat Mitzvah', 'Kosher', 'Jewish life in Lafayette, Moraga and Orinda'],
  };
}

function layout(c, { base, indexable, path, title, description, body, ld = [], image, noindex = false, hebrewDate = '', shabbat = null, analytics = {} }) {
  const o = c.org, canonical = base + (path === '/' ? '/' : path);
  const fullTitle = path === '/' ? `${o.name} | Jewish Lafayette, Moraga & Orinda` : `${title} | ${o.name}`;
  const desc = String(description || o.description).slice(0, 300);
  const img = image ? (image.startsWith('http') ? image : base + image) : base + '/assets/og.png';
  const robots = !indexable || noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large, max-snippet:-1';
  const nav = NAV.map(([href, label]) => `<a href="${href}"${path.startsWith(href) ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  const lds = [orgLd(c, base), ...ld].map((x) => `<script type="application/ld+json">${JSON.stringify(x).replace(/</g, '\\u003c')}</script>`).join('\n');
  const strip = shabbat && shabbat.candles ? `<a class="topstrip" href="/shabbat">${esc(hebrewDate)} · Shabbat candles ${esc(shabbatDay(shabbat.candles.date))} ${esc(shabbat.candles.timeStr)}${shabbat.parsha ? ' · ' + esc(shabbat.parsha.title) : ''}</a>` : '';
  const ga = analytics.ga ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${esc(analytics.ga)}"></script><script src="/assets/gtag.js" data-id="${esc(analytics.ga)}"></script>` : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="${robots}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(o.name)}">
<meta property="og:title" content="${esc(title || o.name)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(img)}">
<meta name="twitter:card" content="summary_large_image">
${o.social && o.social.facebookAppId ? `<meta property="fb:app_id" content="${esc(o.social.facebookAppId)}">` : ''}
<meta name="theme-color" content="#14284b">
${analytics.google ? `<meta name="google-site-verification" content="${esc(analytics.google)}">` : ''}${analytics.bing ? `<meta name="msvalidate.01" content="${esc(analytics.bing)}">` : ''}
<meta name="geo.region" content="US-CA"><meta name="geo.placename" content="Lafayette, California"><meta name="geo.position" content="${o.geo.lat};${o.geo.lng}"><meta name="ICBM" content="${o.geo.lat}, ${o.geo.lng}">
<link rel="icon" href="/assets/logo.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/pushka/icon-180.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="alternate" type="application/rss+xml" title="${esc(o.name)} events" href="/feed.xml">
<link rel="alternate" type="text/calendar" title="${esc(o.name)} calendar" href="/events.ics">
<link rel="stylesheet" href="/assets/site.css?v=${ASSET_V}">
${lds}
${ga}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
${strip}
<header class="hdr">
  <div class="wrap hdr-in">
    <a class="brand" href="/" aria-label="${esc(o.name)} home"><img src="/assets/logo.svg" alt="" width="40" height="26"><span>${esc(o.shortName || o.name)}</span></a>
    <details class="menu"><summary aria-label="Menu"><span></span></summary><nav aria-label="Main">${nav}</nav></details>
    <nav class="nav-wide" aria-label="Main">${nav}</nav>
    <div class="hdr-cta"><a class="btn sm ghost" href="/account" data-account>Sign in</a><a class="btn sm gold" href="/donate">Donate</a></div>
  </div>
</header>
<main id="main">
${body}
</main>
${footer(c)}
<script src="/assets/site.js?v=${ASSET_V}" defer></script>
</body>
</html>`;
}

const shabbatDay = (ymd) => new Date(ymd + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

function footer(c) {
  const o = c.org, s = o.social || {};
  const social = [['facebook', 'Facebook'], ['instagram', 'Instagram'], ['youtube', 'YouTube'], ['whatsapp', 'WhatsApp']].filter(([k]) => s[k]).map(([k, n]) => `<a href="${esc(s[k])}" rel="noopener" target="_blank">${n}</a>`).join('');
  return `<footer class="ftr">
  <div class="wrap ftr-grid">
    <div>
      <p class="ftr-name">${esc(o.name)}</p>
      <p>${esc(fullAddress(o))}</p>
      ${o.phone ? `<p><a href="tel:${esc(o.phone.replace(/[^0-9+]/g, ''))}">${esc(o.phone)}</a></p>` : ''}
      ${o.email ? `<p><a href="mailto:${esc(o.email)}">${esc(o.email)}</a></p>` : ''}
      <p class="social">${social}</p>
    </div>
    <div>
      <p class="ftr-h">Community</p>
      <a href="/events">Events calendar</a><a href="/shabbat">Shabbat times</a><a href="/holidays">Jewish holidays</a><a href="/programs">Programs</a><a href="/photos">Photos</a>
    </div>
    <div>
      <p class="ftr-h">Jewish life</p>
      <a href="/jewish-lamorinda">Everything Jewish in Lamorinda</a><a href="/learn">Learn about Judaism</a><a href="/tools/hebrew-date">Hebrew date converter</a><a href="/tools/yahrzeit">Yahrzeit calculator</a><a href="/tools/bar-bat-mitzvah">Bar &amp; Bat Mitzvah date</a><a href="/faq">Questions &amp; answers</a>
    </div>
    <div>
      <p class="ftr-h">Our area</p>
      ${(c.towns || []).map((t) => `<a href="/jewish-${t.slug}">Jewish ${esc(t.name)}</a>`).join('')}
    </div>
    <div>
      <p class="ftr-h">Get involved</p>
      <a href="/account">My account &amp; family</a><a href="/get-involved">Get involved</a><a href="/community">Community board</a><a href="/welcome">New to the area?</a><a href="/donate">Donate</a><a href="/pushka/">My Pushka app</a><a href="/kiddush/">Sponsor a Kiddush</a><a href="/board/">Chai Club</a>
    </div>
  </div>
  <div class="wrap ftr-base"><p>&copy; ${new Date().getFullYear()} ${esc(o.name)}. ${esc(o.legal || '')} Part of the worldwide Chabad-Lubavitch movement.</p><p><a href="/privacy">Privacy</a> · <a href="/accessibility">Accessibility</a></p></div>
</footer>`;
}

// Bumped when site.css/site.js change, so browsers can cache them for a long time.
const ASSET_V = require('crypto').createHash('sha1').update(['site.css', 'site.js'].map((f) => { try { return require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'site', 'assets', f)); } catch (e) { return ''; } }).join('|')).digest('hex').slice(0, 10);

module.exports = { layout, orgLd, NAV, ASSET_V };
