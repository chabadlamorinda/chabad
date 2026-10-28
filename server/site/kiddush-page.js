// Sponsor a Kiddush on the website (/sponsor-a-kiddush): the same Kiddush calendar and checkout as /kiddush/ (the
// shul's TV board and its own phone page), shown inside the website with the site's header, footer and languages.
// The Kiddush scripts run unchanged; their styles are scoped to the .kd box so they never touch the rest of the page.
'use strict';
const fs = require('fs');
const path = require('path');
const { esc } = require('./md.js');

const DIR = path.join(__dirname, '..', '..', 'kiddush');

// Every phrase the Kiddush page shows, so the website can hand it the Russian (Hebrew is built into the Kiddush page).
function phrases() {
  const sp = fs.readFileSync(path.join(DIR, 'sponsor.js'), 'utf8'), ht = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8'), set = new Set();
  for (const m of sp.matchAll(/T\('((?:[^'\\]|\\.)*)'/g)) set.add(m[1]);
  for (const m of sp.matchAll(/\[\s*'\w+',\s*'([^']+)',\s*'([^']+)'\s*\]/g)) { set.add(m[1]); set.add(m[2]); }
  for (const m of ht.matchAll(/data-t="([^"]+)"/g)) set.add(m[1]);
  for (const s of ['Anonymous', 'In honor of', 'In loving memory of', 'For the speedy recovery of', 'In celebration of', 'In the merit of']) set.add(s);
  return [...set];
}

// Put every rule of the Kiddush stylesheet inside .kd (html/body/:root become the box itself).
function scopeCss(css, scope = '.kd') {
  const sel = (head) => head.split(',').map((x) => x.trim()).filter(Boolean).map((x) => {
    x = x.replace(/^html\.he\s+body\b/, scope + '.he').replace(/^html\.he\b/, scope + '.he').replace(/^(:root|html|body)\b/, scope);
    return x.startsWith(scope) ? x : scope + ' ' + x;
  }).join(',');
  const block = (src, open) => { let d = 1, j = open + 1; while (d && j < src.length) { if (src[j] === '{') d++; else if (src[j] === '}') d--; j++; } return j; };
  const walk = (src) => {
    let out = '', i = 0;
    for (;;) {
      const open = src.indexOf('{', i); if (open < 0) break;
      const head = src.slice(i, open).trim();
      if (/^@(media|supports)/.test(head)) { const j = block(src, open); out += head + '{' + walk(src.slice(open + 1, j - 1)) + '}'; i = j; continue; }
      if (head.startsWith('@')) { const j = block(src, open); out += src.slice(i, j).trim(); i = j; continue; }
      const close = src.indexOf('}', open); out += sel(head) + '{' + src.slice(open + 1, close) + '}'; i = close + 1;
    }
    return out;
  };
  return walk(css.replace(/\/\*[\s\S]*?\*\//g, ''));
}
// Inside the website: no full-screen sizing, no sticky top, no hidden staff corner, colors kept in the light parchment.
const EXTRA = '.kd{min-height:0;border:1px solid var(--line);border-radius:18px;padding:14px 0 4px;margin:8px 0 24px;overflow:hidden;color-scheme:light}'
  + '.kd .top{position:static;box-shadow:none;background:transparent;padding-top:0}.kd .staff-hot,.kd .staff-link{display:none!important}'
  + '.kd label{display:block;font-weight:inherit;font-size:inherit}.kd input,.kd select,.kd textarea{min-height:0}.kd .sheet{z-index:1000}';

function mountKiddushPage(r, { render, wrap, ctxOf }) {
  let css = null;
  r.get('/assets/kiddush-embed.css', (req, res) => {
    if (!css) css = scopeCss(fs.readFileSync(path.join(DIR, 'sponsor.css'), 'utf8')).replace(/\.kd main\b/g, '.kd .kd-main') + EXTRA; // one <main> per page: the Kiddush list is a div here
    res.type('css').set('Cache-Control', 'public, max-age=3600').send(css);
  });
  let list = null;
  r.get('/sponsor-a-kiddush', wrap(async (req, res) => {
    const X = ctxOf(req), { t } = X, lang = X.lang;
    if (!list) list = phrases();
    const embed = { lang, s: lang === 'ru' ? Object.fromEntries(list.map((s) => [s, t(s)]).filter(([a, b]) => a !== b)) : {} };
    const T = (s) => esc(lang === 'ru' ? t(s) : s); // the Kiddush script translates [data-t] itself
    const body = `<section class="wrap sec narrow"><h1>${esc(t('Sponsor a Kiddush'))}</h1>
<p class="lead-d">${esc(t('Dedicate the Shabbat Kiddush in honor or in memory of someone dear. Your name and dedication are shown on our Kiddush board, and the whole community joins in the merit.'))}</p>
<div class="kd${lang === 'he' ? ' he' : ''}">
<div class="top" id="top"><div class="thisweek" id="thisWeek" aria-live="polite" hidden></div></div>
<div class="kd-main"><div id="notice" role="status" aria-live="polite"></div>
<div class="bar"><div class="tabs" id="years" role="tablist" aria-label="Year"></div>
<label class="chk"><input type="checkbox" id="onlyOpen"> <span data-t="Show weeks without a sponsor yet">${T('Show weeks without a sponsor yet')}</span></label></div>
<div id="list" aria-live="polite"><p class="muted center">${esc(t('Loading…'))}</p></div></div>
<section id="boardCard" class="board-card" hidden></section>
<footer><p class="blessing" id="blessing"></p><p class="muted" id="contact"></p></footer>
<div id="sheet" class="sheet" hidden role="dialog" aria-modal="true" aria-labelledby="sheetTitle"><div class="sheet-bg" data-close></div><div class="sheet-card" id="sheetCard"></div></div>
<button id="staffHot" class="staff-hot" type="button" hidden aria-hidden="true" tabindex="-1"></button><a id="staffLink" class="staff-link" href="/admin/" hidden></a>
</div></section>
<script type="application/json" id="kiddush-embed">${JSON.stringify(embed).replace(/</g, '\\u003c')}</script>
<link rel="stylesheet" href="/kiddush/fonts.css"><link rel="stylesheet" href="/assets/kiddush-embed.css">
<script src="/kiddush/i18n.js" defer></script><script src="/kiddush/sponsor.js" defer></script>`;
    await render(res, { path: '/sponsor-a-kiddush', title: t('Sponsor a Kiddush at Chabad of Lamorinda'), description: t('Sponsor the Shabbat Kiddush at Chabad of Lamorinda in Lafayette in honor or in memory of someone dear: pick a week, add your dedication and pay securely online.'), body });
  }));
}
module.exports = { mountKiddushPage, phrases, scopeCss };
