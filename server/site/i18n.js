// Hebrew and Russian versions of the whole website.
//
// * Every page exists in English (/events), Hebrew (/he/events) and Russian (/ru/events).
// * Visitors are sent to their phone's language automatically (from the browser's Accept-Language) the first time;
//   the language buttons in the header remember a choice in a cookie. Search engines get all three, linked with hreflang.
// * Interface words come from site/content/i18n/he.json and ru.json ({ "English text": "translation" }).
// * Content is translated in site/content/i18n/<lang>/: Markdown files mirror pages/, learn/, holidays/, help/;
//   JSON files mirror org.json, programs.json, faq.json, directory.json, towns.json, sponsor.json, tehillim.json, forms.json and giving.json (same
//   shape, text translated). Events carry their translations inline: "he": { "title": ..., "summary": ..., "details": ... }.
// Anything not yet translated falls back to English, so the site never breaks.
'use strict';
const fs = require('fs');
const path = require('path');
const { frontMatter, plain } = require('./md.js');
const { fillTimes } = require('./content.js');

const LANGS = ['en', 'he', 'ru'];
const NAMES = { en: 'English', he: 'עברית', ru: 'Русский' };
const LOCALE = { en: 'en-US', he: 'he-IL', ru: 'ru-RU' };
const RTL = new Set(['he']);
const FAQ_HEADING = { en: 'Common questions', he: 'שאלות נפוצות', ru: 'Частые вопросы' };
// Fields that are keys or data, never translated (a translator's copy of these is ignored).
const KEEP = new Set(['album', 'photos', 'slug', 'id', 'url', 'link', 'lat', 'lng', 'tier', 'start', 'end', 'category', 'holiday', 'program', 'image', 'flyer', 'rsvp', 'status', 'geo', 'phone', 'email', 'social', 'donateUrl', 'chapters', 'fund', 'amount', 'kind', 'related', 'order', 'urgent', 'icon', 'online', 'priceAmount', 'miles', 'address', 'staff', 'areaServed', 'alternateNames', 'name_en', 'type', 'required', 'rows', 'columns', 'min', 'max', 'amountEach', 'perChild', 'optional', 'levels', 'amounts', 'program', 'byDay', 'startTime', 'endTime', 'kabbalatShabbat']);

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return null; throw new Error(`${f}: ${e.message}`); } };

// Overlay translated text onto the English structure. Arrays match by slug/id, otherwise by position.
function overlay(en, tr) {
  if (tr == null) return en;
  if (Array.isArray(en)) {
    if (!Array.isArray(tr)) return en;
    return en.map((x, i) => {
      const key = x && typeof x === 'object' ? (x.slug != null ? 'slug' : x.id != null ? 'id' : null) : null;
      const match = key ? tr.find((y) => y && y[key] === x[key]) : tr[i];
      return overlay(x, match);
    });
  }
  if (en && typeof en === 'object') {
    const out = {};
    for (const k of Object.keys(en)) out[k] = KEEP.has(k) ? en[k] : overlay(en[k], tr[k]);
    return out;
  }
  if (typeof en === 'string') return typeof tr === 'string' && tr.trim() ? tr : en;
  return en;
}

function createI18n(dir) {
  const root = path.join(dir, 'i18n');
  const strings = { en: {} };
  for (const l of LANGS.slice(1)) strings[l] = readJson(path.join(root, l + '.json')) || {};
  const missing = new Set();
  function makeT(lang) {
    const d = strings[lang] || {};
    return (s, vars) => {
      let out = lang === 'en' ? s : d[s];
      if (out == null || out === '') { if (lang !== 'en') missing.add(s); out = s; }
      if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
      return out;
    };
  }

  const cache = new Map();
  // en: the loaded English content object. Returns the same shape with this language's text.
  function localize(en, lang, splitFaq) {
    if (lang === 'en') return en;
    if (cache.has(lang) && cache.get(lang).src === en) return cache.get(lang).data;
    const L = path.join(root, lang), j = (f) => readJson(path.join(L, f));
    const md = (sub, list) => list.map((p) => {
      const f = path.join(L, sub, p.slug + '.md');
      if (!fs.existsSync(f)) return { ...p, translated: false };
      const { meta, body } = frontMatter(fs.readFileSync(f, 'utf8'));
      const t = { ...p, translated: true };
      for (const k of ['title', 'description', 'local', 'hebrew']) if (meta[k]) t[k] = meta[k];
      if (splitFaq && p.faq) { const s = splitFaq(body, FAQ_HEADING[lang]); t.body = s.body; t.faq = s.faq.length ? s.faq : p.faq; } else t.body = body;
      t.text = plain(t.body);
      return t;
    });
    const data = {
      ...en,
      lang,
      org: overlay(en.org, j('org.json')),
      programs: overlay(en.programs, j('programs.json')),
      faq: overlay(en.faq, j('faq.json')),
      directory: overlay(en.directory, j('directory.json')),
      towns: overlay(en.towns, j('towns.json')),
      sponsor: overlay(en.sponsor, j('sponsor.json')),
      tehillim: overlay(en.tehillim, j('tehillim.json')),
      forms: overlay(en.forms || [], j('forms.json')),
      giving: overlay(en.giving || {}, j('giving.json')),
      events: en.events.map((e) => (e[lang] ? { ...e, ...Object.fromEntries(Object.entries(e[lang]).filter(([k, v]) => ['title', 'summary', 'details', 'price'].includes(k) && typeof v === 'string' && v.trim())) } : e)),
      pages: md('pages', en.pages),
      holidays: md('holidays', en.holidays),
      learn: md('learn', en.learn),
      help: md('help', en.help || []),
    };
    // Event locations follow the translated org name when they are "at the center".
    for (const e of data.events) if (!e.location) e.loc = { ...e.loc, name: data.org.name };
    fillTimes(data, en.kabbalat, lang);
    cache.set(lang, { src: en, data });
    return data;
  }
  return { makeT, localize, strings, missing };
}

// Which language does this visitor want? A saved choice wins; otherwise the phone/browser language.
function preferred(req) {
  const m = /(?:^|; )lang=(en|he|ru)\b/.exec(req.get('cookie') || '');
  if (m) return m[1];
  if (/bot|crawl|spider|slurp|facebookexternalhit|preview/i.test(req.get('user-agent') || '')) return 'en';
  const al = (req.get('accept-language') || '').toLowerCase().split(',').map((x) => x.trim().split(';')[0]).filter(Boolean);
  for (const tag of al) { const l = tag.slice(0, 2); if (l === 'en') return 'en'; if (l === 'he' || l === 'iw') return 'he'; if (l === 'ru') return 'ru'; }
  return 'en';
}
const withLang = (lang, p) => (lang === 'en' ? p : '/' + lang + (p === '/' ? '' : p)) || '/';

// Point internal links in a page at the same language (/events -> /he/events). Files, the app and the API are left alone.
const SKIP = /^\/(?:he|ru|assets|media|api|pushka|kiddush|board|admin|account\/verify)(?:[/?#]|$)|\.(?:ics|xml|txt|pdf|png|jpe?g|svg|webmanifest)(?:[?#]|$)/;
function localizeLinks(html, lang) {
  if (lang === 'en') return html;
  return html.replace(/(\s(?:href|action)=")(\/[^"]*)"/g, (m, a, url) => (SKIP.test(url) || url.startsWith('//') ? m : `${a}${withLang(lang, url)}"`));
}

module.exports = { createI18n, overlay, preferred, withLang, localizeLinks, LANGS, NAMES, LOCALE, RTL, FAQ_HEADING };
