// /app: how to put the My Pushka app on a phone (iPhone, Android), with a button that opens the app's own install
// offer and a QR code for people who are on a computer. The app itself lives at /pushka/.
'use strict';
const { qrSvg } = require('./flyer.js');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function mountGetApp(r, { render, wrap, ctxOf, base }) {
  r.get('/app', wrap(async (req, res) => {
    const { t, lang } = ctxOf(req), appUrl = base + '/pushka/' + (lang === 'he' ? '?lang=he' : '');
    const steps = (items) => `<ol class="app-steps">${items.map((s) => `<li>${esc(t(s))}</li>`).join('')}</ol>`;
    const body = `<section class="wrap sec narrow fun app-page">
<h1>${esc(t('Get the My Pushka app'))}</h1>
<p class="lead-d">${esc(t('A coin a day for tzedakah, right on your phone. It is free, and there is nothing to download from an app store.'))}</p>
<p class="btns"><a class="btn gold" href="/pushka/?install=1">${esc(t('Install My Pushka'))}</a><a class="btn ghost" href="/pushka/">${esc(t('Open My Pushka'))}</a><a class="btn ghost" href="/pushka/?signin=1">${esc(t('Sign in to your pushka'))}</a></p>
<div class="card"><h2>${esc(t('On an iPhone or iPad'))}</h2>${steps(['Open this page in Safari.', 'Tap the Share button (the square with an arrow).', 'Choose “Add to Home Screen,” then tap Add.'])}</div>
<div class="card"><h2>${esc(t('On an Android phone'))}</h2>${steps(['Open this page in Chrome.', 'Tap “Install My Pushka” above, or open the menu (three dots) and choose “Install app.”', 'Open My Pushka from your home screen.'])}</div>
<h2>${esc(t('What you get'))}</h2>
<ul>
<li>${esc(t('A pushka on your phone: drop a coin each day, and empty it into a gift to Chabad of Lamorinda whenever you like.'))}</li>
<li>${esc(t('Optional reminders before Shabbat, and for yahrzeits.'))}</li>
<li>${esc(t('Sign in with your email to keep your own pushka on every phone and computer. No password.'))}</li>
<li>${esc(t('In English and Hebrew.'))}</li>
</ul>
<h2>${esc(t('On a computer?'))}</h2>
<p>${esc(t('Scan this code with your phone’s camera to open My Pushka on your phone.'))}</p>
<div class="app-qr" role="img" aria-label="${esc(t('QR code for My Pushka'))}">${qrSvg(appUrl)}</div>
</section>`;
    await render(res, { path: '/app', title: t('Get the My Pushka app'), description: t('Install My Pushka, the free tzedakah app from Chabad of Lamorinda, on your iPhone or Android phone: give a coin a day and keep your pushka on every device.'), body });
  }));
}
module.exports = { mountGetApp };
