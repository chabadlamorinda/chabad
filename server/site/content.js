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
const CATEGORIES = ['shabbat', 'holiday', 'class', 'kids', 'teens', 'women', 'men', 'community', 'seniors', 'family'];

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
  const pages = readPagesIn(dir, 'pages'), holidays = readPagesIn(dir, 'holidays');
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
  for (const g of directory) { need(g.group && Array.isArray(g.items), 'directory.json: every group needs group and items'); for (const i of g.items || []) need(i.name && i.text, `directory ${g.group}: every item needs name and text`); }
  if (errors.length) { const e = new Error('Website content has problems:\n- ' + errors.join('\n- ')); e.errors = errors; throw e; }

  for (const e of events) {
    e.startIso = withOffset(e.start); e.endIso = e.end ? withOffset(e.end) : null;
    e.loc = typeof e.location === 'object' && e.location ? e.location : { name: e.location || org.name, address: e.location ? '' : fullAddress(org) };
    e.published = e.status !== 'draft';
  }
  events.sort((a, b) => a.start.localeCompare(b.start));
  return { org, programs, events, faq, directory, pages, holidays, loadedAt: new Date() };
}
function readPagesIn(dir, sub) {
  const d = path.join(dir, sub);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter((f) => f.endsWith('.md')).sort().map((f) => {
    const { meta, body } = frontMatter(fs.readFileSync(path.join(d, f), 'utf8'));
    return { slug: f.replace(/\.md$/, ''), ...meta, body, text: plain(body) };
  });
}
const fullAddress = (org) => `${org.address.street}, ${org.address.city}, ${org.address.region} ${org.address.postal}`;

module.exports = { load, withOffset, fullAddress, CATEGORIES, DIR };
