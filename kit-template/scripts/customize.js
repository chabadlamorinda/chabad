#!/usr/bin/env node
// Makes this app yours. Edit chabad.config.json, then run:   node scripts/customize.js
// It rewrites the names, address, phone, funds and so on everywhere in the app, and can be run again after any change.
// It remembers what it applied last time in .kit-state.json, so running it twice is safe.
'use strict';
const fs = require('fs');
const path = require('path');

const TEXT_EXT = new Set(['.js', '.json', '.html', '.css', '.md', '.txt', '.yaml', '.yml', '.svg', '.webmanifest']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist']);
const SKIP_FILES = new Set(['.kit-state.json', 'chabad.config.json', 'package-lock.json']);

// ---- the values the replacement works on ----------------------------------------------------------------
function valuesOf(c) {
  const o = c.organization || {}, k = c.contact || {}, l = c.location || {}, p = c.payments || {}, a = c.android || {}, w = c.website || {};
  const v = {
    name: o.name, nameUp: String(o.name || '').toUpperCase(), nameHe: o.nameHe, region: o.region, regionUp: String(o.region || '').toUpperCase(), regionHe: o.regionHe,
    towns: o.towns, city: o.city, cityHe: o.cityHe, state: o.state, slug: o.slug,
    street: k.street, zip: k.zip, email: k.email, phone: k.phone, ein: k.ein, domain: k.domain, website: w.url,
    venmo: p.venmo, tz: l.timezone, candleZip: l.candleZip, androidPkg: a.packageId,
  };
  v.venmoAlt = String(v.venmo || '').toLowerCase().replace(/(^|-)([a-z])/g, (m, a, b) => a + b.toUpperCase());
  v.cityState = `${v.city}, ${v.state}`; v.cityStateNoComma = `${v.city} ${v.state}`; v.address = `${v.street}, ${v.city}, ${v.state} ${v.zip}`; v.lCityHe = 'ל' + v.cityHe;
  return v;
}
// order matters: longer and more specific pieces first
const ORDER = ['address', 'street', 'towns', 'nameUp', 'name', 'nameHe', 'regionHe', 'lCityHe', 'cityHe', 'cityState', 'cityStateNoComma', 'venmo', 'venmoAlt', 'androidPkg', 'email', 'website', 'domain', 'phone', 'ein', 'candleZip', 'tz', 'regionUp', 'region', 'slug', 'city'];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name), out); }
    else if (TEXT_EXT.has(path.extname(e.name)) && !SKIP_FILES.has(e.name)) out.push(path.join(dir, e.name));
  }
  return out;
}

// Replace every piece of the old values with the new ones. Two passes (old -> marker -> new) so a new value can never be replaced again by mistake.
function swapValues(root, from, to) {
  const pairs = ORDER.filter((key) => from[key] && to[key] && from[key] !== to[key]).map((key, i) => ({ f: from[key], t: to[key], m: `\u0001${i}\u0002` }));
  if (!pairs.length) return 0;
  let changed = 0;
  for (const file of walk(root)) {
    let s = fs.readFileSync(file, 'utf8'), o = s;
    for (const p of pairs) s = s.split(p.f).join(p.m);
    for (const p of pairs) s = s.split(p.m).join(p.t);
    if (s !== o) { fs.writeFileSync(file, s); changed++; }
  }
  return changed;
}

// ---- parts that are lists or switches, not single values -------------------------------------------------
const q = (x) => JSON.stringify(String(x == null ? '' : x));
const qs = (x) => "'" + String(x == null ? '' : x).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";

function block(s, name, body) { // replace the text between // <KIT:name> and // </KIT:name>
  const a = `// <KIT:${name}>`, b = `// </KIT:${name}>`, i = s.indexOf(a), j = s.indexOf(b);
  if (i < 0 || j < 0) throw new Error('marker missing: ' + name);
  return s.slice(0, i + a.length) + '\n' + body + '\n' + s.slice(j);
}
function editFile(root, rel, fn) {
  const f = path.join(root, rel); if (!fs.existsSync(f)) return;
  const s = fs.readFileSync(f, 'utf8'), n = fn(s); if (n !== s) fs.writeFileSync(f, n);
}

function structured(root, c) {
  const funds = c.funds || [], f = c.features || {}, links = c.links || {}, site = (c.website && c.website.url) || '';
  editFile(root, 'pushka/pushka.js', (s) => {
    s = block(s, 'FEATURES', `const FEATURES = { building: ${!!f.buildingCampaign}, kiddush: ${!!f.kiddushBoard} };`);
    s = block(s, 'FUNDS', 'const FUNDS = [\n' + funds.map((x) => `  { id: ${q(x.id)}, name: ${q(x.name)}, desc: ${q(x.desc || '')}, long: ${q(x.long || '')} },`).join('\n') + '\n];');
    s = block(s, 'LEGACY', 'const LEGACY = {};');
    s = s.replace(/const ZELLE_EMAIL = "[^"]*";/, `const ZELLE_EMAIL = ${q((c.payments || {}).zelle || '')};`);
    s = s.replace(/const DONATE_URL = "[^"]*";/, `const DONATE_URL = ${q(links.donate || site + '/donate')};`);
    s = s.replace(/const STOCK_URL = [^,]*, CRYPTO_URL = [^,]*, BUILD_URL = [^;]*;/, `const STOCK_URL = ${q(links.stock || site)}, CRYPTO_URL = ${q(links.crypto || site)}, BUILD_URL = ${q(links.building || site)};`);
    return s;
  });
  editFile(root, 'server/index.js', (s) => block(s, 'FUNDS', 'const FUND_NAMES = {\n' + funds.map((x) => `  ${x.id}: ${qs(x.name)},`).join('\n') + '\n};'));
  editFile(root, 'pushka/i18n.js', (s) => { // Hebrew for the fund names, written between markers just before the end of the dictionary
    const lines = [];
    for (const x of funds) for (const [en, he] of [[x.name, x.nameHe], [x.desc, x.descHe], [x.long, x.longHe]]) if (en && he) lines.push(`  ${q(en)}: ${q(he)},`);
    const body = `/* <KIT:HE> */\n${lines.join('\n')}\n/* </KIT:HE> */\n`;
    s = s.replace(/\/\* <KIT:HE> \*\/[\s\S]*?\/\* <\/KIT:HE> \*\/\n/, '');
    const i = s.lastIndexOf('};'); return s.slice(0, i) + body + s.slice(i);
  });
}

// ---- checks ---------------------------------------------------------------------------------------------
function validate(c) {
  const bad = [], need = (cond, msg) => { if (!cond) bad.push(msg); }, v = valuesOf(c);
  for (const [key, label] of [['name', 'organization.name'], ['nameHe', 'organization.nameHe'], ['region', 'organization.region'], ['regionHe', 'organization.regionHe'], ['towns', 'organization.towns'], ['city', 'organization.city'], ['cityHe', 'organization.cityHe'], ['state', 'organization.state'], ['slug', 'organization.slug'], ['street', 'contact.street'], ['zip', 'contact.zip'], ['phone', 'contact.phone'], ['domain', 'contact.domain'], ['venmo', 'payments.venmo'], ['candleZip', 'location.candleZip'], ['androidPkg', 'android.packageId']]) need(v[key] && String(v[key]).trim(), `${label} is empty`);
  need(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email || ''), 'contact.email is not a valid email address');
  need(/^\d{2}-\d{7}$/.test(v.ein || ''), 'contact.ein should look like 12-3456789');
  need(/^https:\/\/[^\s/]+\.[^\s/]+$/.test(v.website || ''), 'website.url should look like https://www.example.org (no slash at the end)');
  need(/^[a-z0-9-]+$/.test(v.slug || ''), 'organization.slug may only use small letters, numbers and dashes');
  need(/^[a-z][a-z0-9]*(\.[a-z][a-z0-9_]*)+$/.test(v.androidPkg || ''), 'android.packageId should look like org.example.pushka');
  try { new Intl.DateTimeFormat('en', { timeZone: v.tz }); } catch (e) { bad.push('location.timezone is not a valid time zone name, for example America/New_York'); }
  const ids = new Set();
  for (const x of c.funds || []) { need(/^[a-z][a-z0-9]*$/.test(x.id || ''), `fund id "${x.id}" may only use small letters and numbers`); need(x.name, `fund "${x.id}" needs a name`); need(!ids.has(x.id), `fund id "${x.id}" is used twice`); ids.add(x.id); }
  need(ids.has('chai'), 'the funds list must include a fund with id "chai" (the Chai Club monthly donors use it)');
  need(ids.has('general'), 'the funds list should include a fund with id "general"');
  return bad;
}

function customize(root, config, log = console.log) {
  const statePath = path.join(root, '.kit-state.json');
  const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : null;
  const problems = validate(config);
  if (problems.length) { const e = new Error('Please fix these in chabad.config.json:\n - ' + problems.join('\n - ')); e.problems = problems; throw e; }
  const changed = state ? swapValues(root, valuesOf(state.config), valuesOf(config)) : 0;
  structured(root, config);
  fs.writeFileSync(statePath, JSON.stringify({ note: 'What customize.js applied last. Do not edit.', config }, null, 2));
  log(changed ? `Updated ${changed} files.` : 'Done.');
  return changed;
}

module.exports = { customize, swapValues, valuesOf, validate, structured, walk };

if (require.main === module) {
  const root = path.join(__dirname, '..');
  let config;
  try { config = JSON.parse(fs.readFileSync(path.join(root, 'chabad.config.json'), 'utf8')); }
  catch (e) { console.error('Could not read chabad.config.json: ' + e.message + '\nCheck the quote marks and commas.'); process.exit(1); }
  try { customize(root, config); console.log('Your app now uses the details in chabad.config.json.'); }
  catch (e) { console.error(e.message); process.exit(1); }
}
