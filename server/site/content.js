// Loads the website's content from site/content/ (JSON + Markdown files that Claude edits by conversation),
// checks it, and links everything together: events <-> programs <-> holiday pages <-> FAQ.
// A content mistake fails loudly at startup and in `npm test`, so a bad edit never reaches the live site.
'use strict';
const fs = require('fs');
const path = require('path');
const { frontMatter, plain } = require('./md.js');

const DIR = path.join(__dirname, '..', '..', 'site', 'content');
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const CATEGORIES = ['shabbat', 'holiday', 'class', 'kids', 'teens', 'women', 'men', 'community', 'seniors', 'family', 'volunteer'];
const LEARN_CATEGORIES = ['Shabbat & holidays', 'Jewish home', 'Kosher', 'Prayer & Torah', 'Life cycle', 'Mourning & remembrance', 'Jewish ideas'];
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
function withOffset(local) {
  const [d, t] = local.split('T'), [y, mo, da] = d.split('-').map(Number), [h, mi] = t.split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, da, h, mi);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(guess)).map((x) => [x.type, x.value]));
  const asLocal = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  const off = Math.round((asLocal - guess) / 60000), sign = off < 0 ? '-' : '+', a = Math.abs(off);
  return `${local}:00${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}

function load(dir = DIR) {
  const rj = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const org = rj('org.json'), programs = rj('programs.json'), events = rj('events.json'), faq = rj('faq.json'), directory = rj('directory.json');
  const pages = readPagesIn(dir, 'pages'), holidays = readPagesIn(dir, 'holidays'), learn = readPagesIn(dir, 'learn'), help = readPagesIn(dir, 'help');
  const sponsor = optJson(dir, 'sponsor.json', { occasions: [], options: [] }), tehillim = optJson(dir, 'tehillim.json', { situations: [] });
  const towns = optJson(dir, 'towns.json', []), redirects = optJson(dir, 'redirects.json', {});
  const errors = [];
  const need = (cond, msg) => { if (!cond) errors.push(msg); };

  need(org.name && org.address && org.address.street, 'org.json: name and address are required');
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
    if (e.rsvp) need(!e.rsvp.capacity || (Number.isInteger(e.rsvp.capacity) && e.rsvp.capacity > 0), `event ${e.slug}: rsvp.capacity must be a whole number`);
  }
  for (const f of faq) need(f.q && f.a, 'faq.json: every entry needs q and a');
  for (const h of help) { uniq('help', h.slug); need(h.title && h.description, `help ${h.slug}: title and description are required`); }
  for (const o of sponsor.occasions.concat(sponsor.options)) need(o.id && o.title, 'sponsor.json: every occasion and option needs id and title');
  for (const x of tehillim.situations) need(x.id && x.title && Array.isArray(x.chapters) && x.chapters.every((n) => Number.isInteger(n) && n >= 1 && n <= 150), `tehillim.json ${x.id}: chapters must be numbers 1 to 150`);
  for (const t of towns) { uniq('town', t.slug); need(t.name && t.intro && Number.isFinite(t.lat) && Number.isFinite(t.lng) && ['home', 'near'].includes(t.tier), `town ${t.slug}: name, intro, lat, lng and tier (home or near) are required`); }
  for (const a of learn) { uniq('learn', a.slug); need(a.title && a.description, `learn ${a.slug}: title and description are required`); need(LEARN_CATEGORIES.includes(a.category), `learn ${a.slug}: category must be one of ${LEARN_CATEGORIES.join(', ')}`); }
  for (const [from, to] of Object.entries(redirects)) need(/^\/[^\s]*$/.test(from) && /^(\/|https?:\/\/)/.test(to), `redirects.json: "${from}" -> "${to}" must both be paths`);
  for (const g of directory) { need(g.group && Array.isArray(g.items), 'directory.json: every group needs group and items'); for (const i of g.items || []) need(i.name && i.text, `directory ${g.group}: every item needs name and text`); }
  if (errors.length) { const e = new Error('Website content has problems:\n- ' + errors.join('\n- ')); e.errors = errors; throw e; }

  for (const e of events) {
    e.startIso = withOffset(e.start); e.endIso = e.end ? withOffset(e.end) : null;
    e.loc = typeof e.location === 'object' && e.location ? e.location : { name: e.location || org.name, address: e.location ? '' : fullAddress(org) };
    e.published = e.status !== 'draft';
  }
  events.sort((a, b) => a.start.localeCompare(b.start));
  const learnSlugs = new Set(learn.map((a) => a.slug));
  for (const a of learn) {
    const { body, faq: qa } = splitFaq(a.body);
    a.body = body; a.faq = qa;
    a.related = String(a.related || '').split(',').map((x) => x.trim()).filter((x) => learnSlugs.has(x) && x !== a.slug);
  }
  for (const t of towns) t.miles = Math.round(miles(org.geo, t) * 10) / 10;
  for (const h of help) { const { body, faq: qa } = splitFaq(h.body); h.body = body; h.faq = qa; h.order = Number(h.order) || 99; h.related = String(h.related || '').split(',').map((x) => x.trim()).filter(Boolean); }
  help.sort((a, b) => a.order - b.order);
  return { org, programs, events, faq, directory, pages, holidays, learn, towns, redirects, help, sponsor, tehillim, loadedAt: new Date() };
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

module.exports = { load, withOffset, fullAddress, CATEGORIES, LEARN_CATEGORIES, DIR, splitFaq };
