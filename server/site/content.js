// Loads the website's content from site/content/ (JSON + Markdown files that Claude edits by conversation),
// checks it, and links everything together: events <-> programs <-> holiday pages <-> FAQ.
// A content mistake fails loudly at startup and in `npm test`, so a bad edit never reaches the live site.
'use strict';
const { withOffset } = require('../time.js');
const fs = require('fs');
const path = require('path');
const { frontMatter, plain } = require('./md.js');

const DIR = path.join(__dirname, '..', '..', 'site', 'content');
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const CATEGORIES = ['shabbat', 'holiday', 'class', 'kids', 'teens', 'women', 'men', 'community', 'seniors', 'family', 'volunteer'];
const LEARN_CATEGORIES = ['Lamorinda', 'Shabbat & holidays', 'Jewish home', 'Kosher', 'Prayer & Torah', 'Life cycle', 'Mourning & remembrance', 'Jewish ideas'];
// The Kabbalat Shabbat time changes every week with the season (the rule is in org.json, worked out in zmanim.js);
// every text that says {kabbalat-shabbat} shows this week's time: "5:45 PM" in English, "17:45" in Hebrew and Russian.
const TIME_TOKEN = /\{kabbalat-shabbat\}/g;
function fmtClock(hhmm, lang) {
  const [h, m] = hhmm.split(':').map(Number);
  return lang === 'en' ? `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}` : hhmm;
}
// The website's address written in the text ("see chabadoflamorinda.com/holidays") follows the address the site
// actually runs on (PUBLIC_URL), so it is right wherever it lives. Email addresses (info@...) are left alone.
const SITE_IN_TEXT = /(?<![@\w.-])(?:www\.)?chabadoflamorinda\.com/g;
function fillTimes(data, hhmm, lang, siteHost = '') {
  if (!hhmm && !siteHost) return data;
  const time = hhmm ? fmtClock(hhmm, lang) : null, seen = new Set();
  const fix = (s) => { if (time) s = s.replace(TIME_TOKEN, time); if (siteHost) s = s.replace(SITE_IN_TEXT, siteHost); return s; };
  const walk = (x) => {
    if (!x || typeof x !== 'object' || seen.has(x)) return; seen.add(x);
    for (const k of Object.keys(x)) { if (typeof x[k] === 'string') x[k] = fix(x[k]); else walk(x[k]); }
  };
  walk(data);
  return data;
}
const optJson = (dir, f, dflt) => (fs.existsSync(path.join(dir, f)) ? JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) : dflt);

// A guide's "## Common questions" section becomes Q&A (shown as such and marked up for Google).
function splitFaq(body, heading = 'Common questions') {
  const i = body.search(new RegExp('^## ' + heading + '\\s*$', 'm'));
  if (i < 0) return { body, faq: [] };
  const faq = [], rest = body.slice(i).split('\n').slice(1).join('\n');
  for (const part of rest.split(/^### /m).slice(1)) { const [q, ...a] = part.split('\n'); if (q.trim() && a.join('\n').trim()) faq.push({ q: q.trim(), a: a.join('\n').trim() }); }
  return { body: body.slice(0, i).trim(), faq };
}

// "2026-12-06T16:00" in Lafayette -> "2026-12-06T16:00:00-08:00" (handles daylight saving).

function load(dir = DIR, opts = {}) {
  const rj = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const org = rj('org.json'), programs = rj('programs.json'), events = rj('events.json'), faq = rj('faq.json'), directory = rj('directory.json');
  const pages = readPagesIn(dir, 'pages'), holidays = readPagesIn(dir, 'holidays'), learn = readPagesIn(dir, 'learn'), help = readPagesIn(dir, 'help');
  const sponsor = optJson(dir, 'sponsor.json', { occasions: [], options: [] }), tehillim = optJson(dir, 'tehillim.json', { situations: [] });
  const forms = optJson(dir, 'forms.json', []), giving = optJson(dir, 'giving.json', {}), home = optJson(dir, 'home.json', {});
  const towns = optJson(dir, 'towns.json', []), redirects = optJson(dir, 'redirects.json', {});
  const campaigns = optJson(dir, 'campaigns.json', []);
  const jokes = optJson(dir, 'jokes.json', []); // the weekly email's joke of the week
  const errors = [];
  const need = (cond, msg) => { if (!cond) errors.push(msg); };

  need(org.name && org.address && org.address.street, 'org.json: name and address are required');
  const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/, ks = org.kabbalatShabbat || {};
  need(!org.kabbalatShabbat || (HHMM.test(ks.latest || '') && Object.entries(ks.dates || {}).every(([d, t]) => /^\d{4}-\d{2}-\d{2}$/.test(d) && HHMM.test(t))), 'org.json: kabbalatShabbat needs "latest" like 18:45, and "dates" like { "2026-11-06": "16:45" } (24-hour times)');
  const kabbalat = opts.kabbalat || ks.latest;
  const seen = new Set();
  const uniq = (kind, slug) => { need(SLUG.test(slug || ''), `${kind}: bad slug "${slug}" (use lowercase-words-with-dashes)`); need(!seen.has(kind + slug), `${kind}: duplicate slug "${slug}"`); seen.add(kind + slug); };
  for (const p of programs) { uniq('program', p.slug); need(p.name && p.summary, `program ${p.slug}: name and summary are required`); }
  for (const p of pages) uniq('page', p.slug);
  for (const h of holidays) { uniq('holiday', h.slug); need(h.title, `holiday ${h.slug}: title is required`); }
  const programSlugs = new Set(programs.map((p) => p.slug)), holidaySlugs = new Set(holidays.map((h) => h.slug));
  for (const e of events) {
    uniq('event', e.slug);
    need(e.title, `event ${e.slug}: title is required`);
    need(LOCAL.test(e.start || ''), `event ${e.slug}: start must look like 2026-12-06T16:00`);
    need(!e.end || (LOCAL.test(e.end) && e.end > e.start), `event ${e.slug}: end must look like 2026-12-06T18:00 and come after start`);
    need(!e.category || CATEGORIES.includes(e.category), `event ${e.slug}: category must be one of ${CATEGORIES.join(', ')}`);
    need(!e.program || programSlugs.has(e.program), `event ${e.slug}: unknown program "${e.program}"`);
    need(!e.holiday || holidaySlugs.has(e.holiday), `event ${e.slug}: unknown holiday "${e.holiday}"`);
    need(!e.album || /^https:\/\//.test(e.album), `event ${e.slug}: album must be a full link starting with https:// (for example a Facebook album)`);
    need(!e.photos || (Array.isArray(e.photos) && e.photos.every((p) => /^\/media\/|^https:\/\//.test(p))), `event ${e.slug}: photos must be a list of /media/... pictures`);
    if (e.rsvp) need(!e.rsvp.capacity || (Number.isInteger(e.rsvp.capacity) && e.rsvp.capacity > 0), `event ${e.slug}: rsvp.capacity must be a whole number`);
  }
  for (const f of faq) need(f.q && f.a, 'faq.json: every entry needs q and a');
  const TYPES = ['text', 'email', 'tel', 'date', 'number', 'select', 'checkbox', 'checkboxes', 'textarea', 'children'];
  for (const f of forms) {
    uniq('form', f.id); need(f.title && Array.isArray(f.fields) && f.fields.length, `form ${f.id}: title and fields are required`);
    for (const x of f.fields || []) need(x.id && x.label && TYPES.includes(x.type) && (!['select', 'checkboxes'].includes(x.type) || (Array.isArray(x.options) && x.options.length)), `form ${f.id}: field ${x.id} needs id, label, a type (${TYPES.join(', ')}) and options for lists`);
    need(!f.program || programs.some((p) => p.slug === f.program), `form ${f.id}: unknown program "${f.program}"`);
  }
  for (const h of help) { uniq('help', h.slug); need(h.title && h.description, `help ${h.slug}: title and description are required`); }
  for (const o of sponsor.occasions.concat(sponsor.options)) need(o.id && o.title, 'sponsor.json: every occasion and option needs id and title');
  for (const x of tehillim.situations) need(x.id && x.title && Array.isArray(x.chapters) && x.chapters.every((n) => Number.isInteger(n) && n >= 1 && n <= 150), `tehillim.json ${x.id}: chapters must be numbers 1 to 150`);
  for (const t of towns) { uniq('town', t.slug); need(t.name && t.intro && Number.isFinite(t.lat) && Number.isFinite(t.lng) && ['home', 'near'].includes(t.tier), `town ${t.slug}: name, intro, lat, lng and tier (home or near) are required`); }
  for (const a of learn) { uniq('learn', a.slug); need(a.title && a.description, `learn ${a.slug}: title and description are required`); need(LEARN_CATEGORIES.includes(a.category), `learn ${a.slug}: category must be one of ${LEARN_CATEGORIES.join(', ')}`); }
  for (const [from, to] of Object.entries(redirects)) need(/^\/[^\s]*$/.test(from) && /^(\/|https?:\/\/)/.test(to), `redirects.json: "${from}" -> "${to}" must both be paths`);
  for (const g of directory) { need(g.group && Array.isArray(g.items), 'directory.json: every group needs group and items'); for (const i of g.items || []) need(i.name && i.text, `directory ${g.group}: every item needs name and text`); }
  // Fundraising campaigns (campaigns.json): see server/campaign.js and server/site/campaign-page.js.
  const WHEN = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;
  for (const c of campaigns) {
    uniq('campaign', c.slug);
    need(c.title && Number(c.goal) > 0, `campaign ${c.slug}: title and goal (a number of dollars) are required`);
    need(WHEN.test(c.start || '') && WHEN.test(c.end || '') && c.start < c.end, `campaign ${c.slug}: start and end are required, like "2026-11-01" or "2026-12-31T23:59", and end comes after start`);
    need(!c.months || (Array.isArray(c.months) && c.months.every((m) => Number.isInteger(m) && m > 1 && m <= 60)), `campaign ${c.slug}: months must be a list like [12, 24, 36]`);
    need(!c.years || (Array.isArray(c.years) && c.years.every((m) => Number.isInteger(m) && m > 1 && m <= 10)), `campaign ${c.slug}: years must be a list like [2, 3, 5]`);
    need(!c.gallery || (Array.isArray(c.gallery) && c.gallery.every((g) => /^\/media\//.test((g && g.src) || g))), `campaign ${c.slug}: gallery pictures must be in site/media ("/media/...")`);
    need(!c.image || /^\/media\//.test(c.image), `campaign ${c.slug}: image must be in site/media ("/media/...")`);
    for (const t of c.teams || []) { uniq('campaign team ' + c.slug, t.slug); need(t.name, `campaign ${c.slug}: every team needs a name`); }
    for (const l of c.levels || []) need(l.id && l.title && Number(l.amount) > 0, `campaign ${c.slug}: every giving level needs id, title and amount`);
    need(!c.matching || Number(c.matching.multiplier) >= 1, `campaign ${c.slug}: matching.multiplier must be a number like 2`);
  }
  if (errors.length) { const e = new Error('Website content has problems:\n- ' + errors.join('\n- ')); e.errors = errors; throw e; }

  for (const e of events) {
    e.startIso = withOffset(e.start); e.endIso = e.end ? withOffset(e.end) : null;
    e.loc = typeof e.location === 'object' && e.location ? e.location : { name: e.location || org.name, address: e.location ? '' : fullAddress(org) };
    e.published = e.status !== 'draft';
  }
  events.sort((a, b) => a.start.localeCompare(b.start));
  for (const c of campaigns) { c.startIso = withOffset(c.start.length === 10 ? c.start + 'T00:00' : c.start); c.endIso = withOffset(c.end.length === 10 ? c.end + 'T23:59' : c.end); }
  const learnSlugs = new Set(learn.map((a) => a.slug));
  for (const a of learn) {
    const { body, faq: qa } = splitFaq(a.body);
    a.body = body; a.faq = qa;
    a.related = String(a.related || '').split(',').map((x) => x.trim()).filter((x) => learnSlugs.has(x) && x !== a.slug);
  }
  for (const t of towns) t.miles = Math.round(miles(org.geo, t) * 10) / 10;
  for (const h of help) { const { body, faq: qa } = splitFaq(h.body); h.body = body; h.faq = qa; h.order = Number(h.order) || 99; h.related = String(h.related || '').split(',').map((x) => x.trim()).filter(Boolean); }
  help.sort((a, b) => a.order - b.order);
  for (const w of org.weekly || []) if (kabbalat && /\{kabbalat-shabbat\}/.test(w.time || '')) w.startTime = kabbalat;
  return fillTimes({ org, programs, events, faq, directory, pages, holidays, learn, towns, redirects, help, sponsor, tehillim, forms, giving, home, campaigns, jokes, kabbalat, siteHost: opts.siteHost || '', loadedAt: new Date() }, kabbalat, 'en', opts.siteHost || '');
}
function readPagesIn(dir, sub) {
  const d = path.join(dir, sub);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter((f) => f.endsWith('.md')).sort().map((f) => {
    const { meta, body } = frontMatter(fs.readFileSync(path.join(d, f), 'utf8'));
    return { slug: f.replace(/\.md$/, ''), ...meta, body, text: plain(body) };
  });
}
// Straight-line distance in miles.
function miles(a, b) {
  const R = 3958.8, r = (d) => (d * Math.PI) / 180, dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const fullAddress = (org) => `${org.address.street}, ${org.address.city}, ${org.address.region} ${org.address.postal}`;

module.exports = { load, fillTimes, fmtClock, withOffset, fullAddress, CATEGORIES, LEARN_CATEGORIES, DIR, splitFaq };
