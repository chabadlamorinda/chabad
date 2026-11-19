// Campaign settings: the Rabbi sets up, edits, starts and stops fundraising campaigns in the Rabbi area (no file editing).
// A campaign saved here is stored in the database (kv "campaign-settings") and merged over the campaigns in
// site/content/campaigns.json (same slug: the saved one wins; new slug: a new campaign). Pictures uploaded here are kept
// in the database too (table site_uploads, served at /uploads/<id>.jpg). The page and the money side are
// server/site/campaign-page.js and server/campaign.js.
'use strict';
const crypto = require('crypto');
const express = require('express');
const { withOffset } = require('../time.js');

const KEY = 'campaign-settings';
const WHEN = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;
const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, n);
const slugify = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'campaign';
const nums = (v, lo, hi, max = 10) => (Array.isArray(v) ? v : String(v == null ? '' : v).split(/[,\s]+/)).map((x) => Number(String(x).replace(/[$,]/g, ''))).filter((n) => Number.isFinite(n) && n >= lo && n <= hi).slice(0, max);
const picture = (v) => { const s = str(v, 300); return /^\/(media|uploads)\/[A-Za-z0-9._/-]+$/.test(s) && !s.includes('..') ? s : ''; };
// Lafayette time now, like "2026-12-01T09:30"
const ptNow = (d = new Date()) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value])); return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`; };
const at = (s, end) => Date.parse(withOffset(s.length === 10 ? s + (end ? 'T23:59' : 'T00:00') : s));

// What the Rabbi typed (text boxes) becomes a campaign object. Returns { campaign } or { error }.
function normalize(b, { funds = [], taken = [], existing = null } = {}) {
  b = b || {};
  const title = str(b.title, 120);
  if (!title) return { error: 'Please give the campaign a name.' };
  const goal = Number(String(b.goal == null ? '' : b.goal).replace(/[$,\s]/g, ''));
  if (!(goal > 0 && goal <= 1e9)) return { error: 'Please enter the goal in dollars (for example 1000000).' };
  const start = str(b.start, 16), end = str(b.end, 16);
  if (!WHEN.test(start) || !WHEN.test(end)) return { error: 'Please choose a start date and an end date.' };
  if (!(at(start) < at(end, true))) return { error: 'The end date must come after the start date.' };
  let slug = existing ? existing.slug : slugify(b.slug || title);
  if (!existing) { let n = 2, base = slug; while (taken.includes(slug)) slug = base + '-' + n++; }
  const fund = funds.includes(b.fund) ? b.fund : (funds.includes('building') ? 'building' : funds[0] || 'general');
  const matchers = (Array.isArray(b.matching && b.matching.matchers) ? b.matching.matchers : String((b.matching && b.matching.matchers) || '').split(/\n|;/)).map((x) => str(x, 80)).filter(Boolean).slice(0, 12);
  const mult = Number(b.matching && b.matching.multiplier);
  const matching = mult >= 2 && mult <= 10 ? { multiplier: Math.round(mult), cap: Math.max(0, Number(String((b.matching && b.matching.cap) || 0).replace(/[$,\s]/g, '')) || 0), text: str(b.matching.text, 400), matchers } : null;
  // Naming opportunities, one per line: "A classroom | 54000 | 4 | Name it for someone you love"
  const lines = Array.isArray(b.levels) ? b.levels.map((l) => [l.title, l.amount, l.quantity, l.text].join(' | ')) : String(b.levels || '').split('\n');
  const levels = []; const ids = new Set();
  for (const ln of lines) {
    const [t, a, q, ...rest] = ln.split('|').map((x) => x.trim()); const amount = Number(String(a || '').replace(/[$,\s]/g, ''));
    if (!t || !(amount > 0)) continue;
    let id = slugify(t), k = 2; while (ids.has(id)) id = slugify(t) + '-' + k++; ids.add(id);
    levels.push({ id, title: str(t, 80), amount, quantity: Math.max(1, Math.min(500, parseInt(q, 10) || 1)), text: str(rest.join(' | '), 300) });
  }
  const tr = (o) => { const x = { title: str(o && o.title, 120), tagline: str(o && o.tagline, 200), eyebrow: str(o && o.eyebrow, 60), story: str(o && o.story, 20000) }; return Object.values(x).some(Boolean) ? x : null; };
  const gallery = (Array.isArray(b.gallery) ? b.gallery : String(b.gallery || '').split('\n')).map((g) => { const src = picture(typeof g === 'string' ? g.split('|')[0].trim() : g && g.src); const cap = typeof g === 'string' ? str(g.split('|').slice(1).join('|'), 140) : str(g && g.caption, 140); return src ? { src, caption: cap } : null; }).filter(Boolean).slice(0, 12);
  const video = str(b.video, 200);
  const c = {
    slug, status: b.status === 'draft' ? 'draft' : 'live', eyebrow: str(b.eyebrow, 60) || 'Campaign', title, tagline: str(b.tagline, 200), fund, goal,
    ...(Number(b.bonusGoal) > goal ? { bonusGoal: Number(b.bonusGoal) } : {}), start, end, image: picture(b.image), gallery, ...(/^https:\/\/(www\.)?(youtube\.com|youtu\.be|vimeo\.com)\//.test(video) ? { video } : {}),
    story: str(b.story, 20000), amounts: nums(b.amounts, 5, 250000, 8).length ? nums(b.amounts, 5, 250000, 8) : [180, 360, 1000, 1800, 3600, 10000],
    months: nums(b.months, 2, 60, 6).length ? nums(b.months, 2, 60, 6) : [12, 24, 36], years: nums(b.years, 2, 10, 5), ambassadorGoal: Math.max(0, Number(b.ambassadorGoal) || 1800),
    ambassadors: b.ambassadors !== false && b.ambassadors !== 'off', featured: b.featured !== false && b.featured !== 'off', levels, ...(matching ? { matching } : {}), teams: (existing && existing.teams) || [],
  };
  const he = tr(b.he), ru = tr(b.ru); if (he) c.he = he; if (ru) c.ru = ru;
  return { campaign: c };
}

const finish = (c) => ({ ...c, startIso: withOffset(c.start.length === 10 ? c.start + 'T00:00' : c.start), endIso: withOffset(c.end.length === 10 ? c.end + 'T23:59' : c.end) });
// The campaigns of the website: the file's, with the Rabbi's saved ones over them (and his new ones added).
function mergeCampaigns(fileList, items) {
  items = items || {}; const out = [], seen = new Set();
  for (const c of fileList || []) { seen.add(c.slug); out.push(items[c.slug] ? finish({ ...c, ...items[c.slug] }) : c); }
  for (const [slug, o] of Object.entries(items)) if (!seen.has(slug)) out.push(finish(o));
  return out;
}
const stateOf = (c, now = new Date()) => (c.status === 'draft' ? 'draft' : at(c.start) > now.getTime() ? 'scheduled' : at(c.end, true) <= now.getTime() ? 'ended' : 'live');

// ---- the pictures ----
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const magic = (buf) => (buf[0] === 0xff && buf[1] === 0xd8 ? 'image/jpeg' : buf.slice(0, 8).toString('hex') === '89504e470d0a1a0a' ? 'image/png' : buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP' ? 'image/webp' : '');
function mountPublic(r, { store, wrap }) {
  const pool = store && store.pool;
  r.get('/uploads/:file', wrap(async (req, res, next) => {
    const m = /^([a-f0-9]{24})\.(jpg|png|webp)$/.exec(req.params.file); if (!m || !pool) return next();
    const row = (await pool.query('SELECT mime, data FROM site_uploads WHERE id=$1', [m[1]]).catch(() => ({ rows: [] }))).rows[0]; if (!row) return next();
    res.set({ 'Content-Type': row.mime, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' }).send(row.data);
  }));
}

function mountAdmin(r2, ctx, { store, content, getItems, setItems, funds, log = console }) {
  const pool = store && store.pool, J = express.json({ limit: '8mb' });
  if (!pool) return;
  const taken = () => (content().campaigns || []).map((c) => c.slug);
  const fundIds = () => (typeof funds === 'function' ? funds() : funds) || [];
  const view = (c) => ({ slug: c.slug, title: c.title, state: stateOf(c), start: c.start, end: c.end, goal: c.goal, image: c.image || '', saved: !!getItems()[c.slug] });
  r2.get('/api/site/campaign-settings', ctx.authed, ctx.wrap(async (req, res) => res.json({ items: (content().campaigns || []).map(view), funds: fundIds(), now: ptNow() })));
  r2.get('/api/site/campaign-settings/:slug', ctx.authed, ctx.wrap(async (req, res) => {
    const c = (content().campaigns || []).find((x) => x.slug === req.params.slug); if (!c) return res.status(404).json({ error: 'Not found.' });
    res.json({ campaign: c, funds: fundIds(), saved: !!getItems()[c.slug] });
  }));
  const save = async (c) => { const items = { ...getItems(), [c.slug]: c }; await store.setKv(KEY, items); setItems(items); };
  r2.post('/api/site/campaign-settings', ctx.authed, J, ctx.wrap(async (req, res) => {
    const b = req.body || {}, existing = b.slug ? (content().campaigns || []).find((x) => x.slug === String(b.slug)) : null;
    const r = normalize(b, { funds: fundIds(), taken: taken(), existing });
    if (r.error) return res.status(400).json({ code: 'invalid', error: r.error });
    await save(r.campaign); res.json({ ok: true, slug: r.campaign.slug, state: stateOf(r.campaign) });
  }));
  // Start (go live now), stop (end it now), hide (back to draft), or remove the Rabbi's saved version.
  r2.post('/api/site/campaign-settings/:slug/:action', ctx.authed, J, ctx.wrap(async (req, res) => {
    const c = (content().campaigns || []).find((x) => x.slug === req.params.slug); if (!c) return res.status(404).json({ error: 'Not found.' });
    const { action } = req.params, now = new Date();
    if (action === 'delete') { const items = { ...getItems() }; delete items[c.slug]; await store.setKv(KEY, items); setItems(items); return res.json({ ok: true }); }
    const next = { ...c };
    if (action === 'live') {
      next.status = 'live'; if (at(next.start) > now.getTime()) next.start = ptNow(now);
      if (at(next.end, true) <= now.getTime()) return res.status(400).json({ code: 'ended', error: 'The end date has passed. Choose a later end date first, then start it.' });
    } else if (action === 'stop') { next.status = 'live'; next.end = ptNow(now); if (at(next.start) >= at(next.end)) next.start = next.end.slice(0, 10) + 'T00:00'; }
    else if (action === 'draft') next.status = 'draft';
    else return res.status(400).json({ error: 'Unknown action.' });
    delete next.startIso; delete next.endIso; await save(next); res.json({ ok: true, state: stateOf(next) });
  }));
  // A picture for a campaign (the page shrinks it first): kept in the database, answered at /uploads/<id>.jpg
  r2.post('/api/site/uploads', ctx.authed, J, ctx.wrap(async (req, res) => {
    let buf; try { buf = Buffer.from(String((req.body && req.body.data) || '').replace(/^data:[^,]*,/, ''), 'base64'); } catch (e) { buf = Buffer.alloc(0); }
    const mime = buf.length > 100 ? magic(buf) : '';
    if (!mime) return res.status(400).json({ code: 'invalid', error: 'Please choose a JPG, PNG or WebP picture.' });
    if (buf.length > 5 * 1024 * 1024) return res.status(400).json({ code: 'too_big', error: 'That picture is too large (the limit is 5 MB).' });
    const id = crypto.randomBytes(12).toString('hex');
    await pool.query('INSERT INTO site_uploads (id, mime, data) VALUES ($1,$2,$3)', [id, mime, buf]);
    res.json({ ok: true, url: `/uploads/${id}.${TYPES[mime]}` });
  }));
}
const SCHEMA = 'CREATE TABLE IF NOT EXISTS site_uploads (id TEXT PRIMARY KEY, mime TEXT NOT NULL, data BYTEA NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())';
module.exports = { normalize, mergeCampaigns, stateOf, mountAdmin, mountPublic, ptNow, SCHEMA, KEY };
