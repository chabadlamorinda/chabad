// "Print a flyer" for every event (/events/<slug>/flyer, in all three languages): one clean printable page with the
// event's picture, when and where, a few words, and a QR code to its page (and RSVP), for libraries, coffee shops,
// school boards and the front door. The QR code is drawn here (kiddush/vendor/qrcode.js), so it prints sharply.
'use strict';
const { esc } = require('./md.js');
const { RTL } = require('./i18n.js');
const qrcode = require('../../kiddush/vendor/qrcode.js');

function qrSvg(text) {
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  return q.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
}

function mountFlyer(r, { wrap, ctxOf, base }) {
  r.get('/events/:slug/flyer', wrap(async (req, res, next) => {
    const X = ctxOf(req), { t, C } = X, o = C.org, e = C.events.find((x) => x.slug === req.params.slug && x.published);
    if (!e) return next();
    const url = base + X.path('/events/' + e.slug) + (e.rsvp ? '#rsvp' : ''), shown = (base + X.path('/events/' + e.slug)).replace(/^https?:\/\//, '');
    const dir = RTL.has(X.lang) ? 'rtl' : 'ltr';
    res.type('html').set('Cache-Control', 'public, max-age=300').send(`<!doctype html>
<html lang="${X.lang}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(e.title)}: ${esc(t('Flyer'))}</title><link rel="stylesheet" href="/assets/site.css"></head>
<body class="flyer-page"><p class="flyer-tools"><button type="button" class="btn gold" data-print>${esc(t('Print'))}</button> <a class="btn ghost" href="${esc(X.path('/events/' + e.slug))}">${esc(t('Back to the event'))}</a></p>
<main class="flyer">
<header class="fl-head"><img src="/assets/logo.svg" alt="" width="54" height="35"><span>${esc(o.name)}</span></header>
<p class="hand fl-invite">${esc(t('You are invited!'))}</p>
<h1>${esc(e.title)}</h1>
${e.image ? `<img class="fl-img" src="${esc(e.image)}" alt="">` : ''}
<div class="fl-facts"><p><b>${esc(t('When'))}</b><span>${esc(X.when(e))}</span></p><p><b>${esc(t('Where'))}</b><span>${esc(e.loc.name)}${e.loc.address ? ', <bdi dir="ltr">' + esc(e.loc.address) + '</bdi>' : ''}</span></p>${e.price ? `<p><b>${esc(t('Cost'))}</b><span>${esc(e.price)}</span></p>` : ''}</div>
${e.summary ? `<p class="fl-sum">${esc(e.summary)}</p>` : ''}
<div class="fl-qr"><div class="fl-code">${qrSvg(url)}</div><div><p class="fl-scan">${esc(e.rsvp ? t('Scan to RSVP') : t('Scan for details'))}</p><p class="fl-url" dir="ltr">${esc(shown)}</p></div></div>
<footer class="fl-foot"><p>${esc(t('Bring a friend. Every Jew is welcome.'))}</p><p dir="ltr">${esc(o.phone)} · ${esc(base.replace(/^https?:\/\//, ''))}</p></footer>
</main><script src="/assets/flyer.js" defer></script></body></html>`);
  }));
}
module.exports = { mountFlyer, qrSvg };
