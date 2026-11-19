// Two separate phone apps, each with its own icon and its own install page:
//   /app         the Chabad of Lamorinda app (the website: Shabbat times, events, guides, giving), Chabad logo
//   /pushka-app  the My Pushka app (the tzedakah box at /pushka/), the picture of a pushka
// Each page shows its icon, an install button, the steps for iPhone and Android, and a QR code for people on a computer.
'use strict';
const { qrSvg } = require('./flyer.js');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function mountGetApp(r, { render, wrap, ctxOf, base }) {
  const steps = (t, items) => `<ol class="app-steps">${items.map((s) => `<li>${esc(t(s))}</li>`).join('')}</ol>`;
  const phones = (t, ios, android) => `<div class="card" id="how"><h2>${esc(t('On an iPhone or iPad'))}</h2>${steps(t, ios)}</div>
<div class="card"><h2>${esc(t('On an Android phone'))}</h2>${steps(t, android)}</div>`;
  const SHARE = 'Tap the Share button (the square with an arrow).', ADD = 'Choose “Add to Home Screen,” then tap Add.';
  const qr = (t, url) => `<h2>${esc(t('On a computer?'))}</h2><p>${esc(t('Scan this code with your phone’s camera to open it on your phone.'))}</p><div class="app-qr" role="img" aria-label="${esc(t('QR code'))}">${qrSvg(url)}</div>`;

  r.get('/app', wrap(async (req, res) => {
    const { t } = ctxOf(req);
    const body = `<section class="wrap sec narrow fun app-page">
<img class="app-icon" src="/assets/app-icon-192.png" width="96" height="96" alt="" loading="lazy">
<h1>${esc(t('Get the Chabad of Lamorinda app'))}</h1>
<p class="lead-d">${esc(t('Shabbat times, events, holidays, guides to Jewish life and ways to give, one tap away on your phone. It is free, and there is nothing to download from an app store.'))}</p>
<p class="btns"><button type="button" class="btn gold" data-install>${esc(t('Install Chabad of Lamorinda'))}</button><a class="btn ghost" href="/pushka-app">${esc(t('Get the My Pushka app'))}</a></p>
${phones(t, ['Open this page in Safari.', SHARE, ADD], ['Open this page in Chrome.', 'Tap “Install Chabad of Lamorinda” above, or open the menu (three dots) and choose “Install app.”', 'Open the app from your home screen.'])}
<h2>${esc(t('What you get'))}</h2>
<ul>
<li>${esc(t('This week’s Shabbat candle lighting and Havdalah times for Lafayette, Moraga and Orinda.'))}</li>
<li>${esc(t('Upcoming events, with RSVP.'))}</li>
<li>${esc(t('Jewish holidays and guides to Jewish life, in English, Hebrew and Russian.'))}</li>
<li>${esc(t('Quick buttons for Donate, Shabbat times, Events and Contact.'))}</li>
</ul>
${qr(t, base + '/app')}
</section>`;
    await render(res, { path: '/app', title: t('Get the Chabad of Lamorinda app'), description: t('Install the Chabad of Lamorinda app on your iPhone or Android phone: Shabbat times, events, holidays, guides to Jewish life and ways to give.'), body });
  }));

  r.get('/pushka-app', wrap(async (req, res) => {
    const { t, lang } = ctxOf(req), appUrl = base + '/pushka/' + (lang === 'he' ? '?lang=he' : '');
    const body = `<section class="wrap sec narrow fun app-page">
<img class="app-icon" src="/pushka/icon-192.png" width="96" height="96" alt="" loading="lazy">
<h1>${esc(t('Get the My Pushka app'))}</h1>
<p class="lead-d">${esc(t('A coin a day for tzedakah, right on your phone. It is free, and there is nothing to download from an app store.'))}</p>
<p class="btns"><a class="btn gold" href="/pushka/?install=1">${esc(t('Install My Pushka'))}</a><a class="btn ghost" href="/pushka/">${esc(t('Open My Pushka'))}</a><a class="btn ghost" href="/pushka/?signin=1">${esc(t('Sign in to your pushka'))}</a></p>
${phones(t, ['Tap “Open My Pushka” above.', 'In My Pushka, tap the Share button (the square with an arrow).', ADD], ['Tap “Install My Pushka” above.', 'Tap Install when your phone asks.', 'Open My Pushka from your home screen.'])}
<h2>${esc(t('What you get'))}</h2>
<ul>
<li>${esc(t('A pushka on your phone: drop a coin each day, and empty it into a gift to Chabad of Lamorinda whenever you like.'))}</li>
<li>${esc(t('Optional reminders before Shabbat, and for yahrzeits.'))}</li>
<li>${esc(t('Sign in with your email to keep your own pushka on every phone and computer. No password.'))}</li>
<li>${esc(t('In English and Hebrew.'))}</li>
</ul>
${qr(t, appUrl)}
<p><a href="/app">${esc(t('Looking for the Chabad of Lamorinda app instead?'))}</a></p>
</section>`;
    await render(res, { path: '/pushka-app', title: t('Get the My Pushka app'), description: t('Install My Pushka, the free tzedakah app from Chabad of Lamorinda, on your iPhone or Android phone: give a coin a day and keep your pushka on every device.'), body });
  }));
}
module.exports = { mountGetApp };
