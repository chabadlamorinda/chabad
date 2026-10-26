// "Share with a friend" on every page worth sharing: the phone's own share menu (Messages, WhatsApp, Facebook,
// Instagram, email...), plus direct WhatsApp, text message, email, Facebook, Telegram and copy-link buttons.
// Plain links (no tracking scripts, nothing to load); the share menu and copy buttons need site.js.
'use strict';
const { esc } = require('./md.js');

const SHAREABLE = /^\/(learn|events|holidays|programs|help|parsha|ask|jewish-[a-z-]+|shabbat-times|this-week|shabbat|kaddish|tehillim|sponsor|welcome|tools)(\/|$)/;

function shareBar(X, url, title) {
  const t = X.t, u = encodeURIComponent(url), msg = encodeURIComponent(title + ' ' + url), sub = encodeURIComponent(title);
  const a = (cls, href, label) => `<a class="sh ${cls}" href="${href}" rel="noopener" target="_blank">${esc(label)}</a>`;
  return `<div class="share" data-share data-url="${esc(url)}" data-title="${esc(title)}"><p class="share-h">${esc(t('Share with a friend'))}</p><div class="share-btns">
<button type="button" class="sh native" data-share-native hidden>${esc(t('Share'))}</button>
${a('wa', `https://wa.me/?text=${msg}`, 'WhatsApp')}
<a class="sh sms" href="sms:?&amp;body=${msg}">${esc(t('Text message'))}</a>
<a class="sh mail" href="mailto:?subject=${sub}&amp;body=${msg}">${esc(t('Email'))}</a>
${a('fb', `https://www.facebook.com/sharer/sharer.php?u=${u}`, 'Facebook')}
${a('tg', `https://t.me/share/url?url=${u}&amp;text=${sub}`, 'Telegram')}
<button type="button" class="sh copy" data-copy="${esc(url)}" data-done="${esc(t('Link copied'))}">${esc(t('Copy link'))}</button>
</div></div>`;
}
// Put the share bar at the end of the page's main section or article.
function withShare(X, body, path, title, base) {
  if (!SHAREABLE.test(path) || /data-share/.test(body)) return body;
  const bar = shareBar(X, base + X.path(path), title), i = Math.max(body.lastIndexOf('</article>'), body.lastIndexOf('</section>'));
  return i < 0 ? body + bar : body.slice(0, i) + bar + body.slice(i);
}
module.exports = { shareBar, withShare, SHAREABLE };
