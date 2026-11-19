#!/usr/bin/env node
// Turns this website into YOUR Chabad's website: replaces the names, phone, email, address and web address everywhere
// (pages, guides, code, tests) in English, and tells you what is left to localize.
//   1. copy rebrand.example.json to rebrand.json and fill it in
//   2. node scripts/rebrand.js            (add --dry to only count)
//   3. npm test
// Hebrew and Russian: add pairs to "replacements", for example ["חב\"ד למורינדה", "חב\"ד של ספרינגפילד"].
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), DRY = process.argv.includes('--dry');
const cfgPath = path.join(ROOT, 'rebrand.json');
if (!fs.existsSync(cfgPath)) { console.error('Copy rebrand.example.json to rebrand.json and fill it in first.'); process.exit(1); }
const c = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const pairs = [];
const add = (from, to) => { if (from && to && from !== to) pairs.push([from, to]); };
// Longest first, so "Chabad of Lamorinda" is replaced before "Lamorinda".
add('Chabad of Lamorinda', c.name);
add('Rabbi Yisroel Labkowski', c.rabbi && 'Rabbi ' + c.rabbi);
add('Yisroel Labkowski', c.rabbi);
add('Tzipora Labkowski', c.rebbetzin);
add('Rabbi Labkowski', c.rabbi && 'Rabbi ' + c.rabbi.split(' ').slice(-1)[0]);
add('the Labkowski family', c.rabbi && 'the ' + c.rabbi.split(' ').slice(-1)[0] + ' family');
add('Labkowski', c.rabbi && c.rabbi.split(' ').slice(-1)[0]);
add('3477 Golden Gate Way', c.street);
add('925-384-7242', c.phone);
add('925-384-7241', c.rebbetzinPhone || c.phone);
add('9253847242', c.phone && c.phone.replace(/\D/g, ''));
add('9253847241', (c.rebbetzinPhone || c.phone || '').replace(/\D/g, ''));
add('info@chabadoflamorinda.com', c.email);
add('rabbi@chabadoflamorinda.com', c.email);
add('jewishlamorinda.com', c.domain);
add('jewishlamorinda.org', c.extraDomain || c.domain);
add('chabadoflamorinda.com', c.domain);
add('47-4642750', c.taxId);
add('Lamorinda', c.area);
for (const [a, b] of c.replacements || []) add(a, b);
const SKIP = /(^|\/)(node_modules|\.git|dist|media)(\/|$)|\.(jpg|jpeg|png|gif|webp|pdf|zip|woff2?|ico|mp3|mp4)$|rebrand\.(example\.)?json$|rebrand\.js$/;
let files = 0, changed = 0;
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name), rel = path.relative(ROOT, full);
    if (SKIP.test(rel)) continue;
    if (e.isDirectory()) { walk(full); continue; }
    let s; try { s = fs.readFileSync(full, 'utf8'); } catch (x) { continue; }
    files++; let n = s;
    for (const [a, b] of pairs) n = n.split(a).join(b);
    if (n !== s) { changed++; if (!DRY) fs.writeFileSync(full, n); }
  }
})(ROOT);
console.log(`${DRY ? 'Would change' : 'Changed'} ${changed} of ${files} files.`);
// What still speaks about us or our towns: this is the list to localize (ask Claude: "localize every guide to <your area>").
const LEFT = /Lamorinda|Lafayette|Moraga|Orinda|Labkowski|Walnut Creek|Contra Costa|Bay Kosher/g, by = {};
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name), rel = path.relative(ROOT, full);
    if (SKIP.test(rel)) continue;
    if (e.isDirectory()) { walk(full); continue; }
    let s; try { s = fs.readFileSync(full, 'utf8'); } catch (x) { continue; }
    const m = s.match(LEFT); if (m) { const k = rel.split('/').slice(0, 3).join('/'); by[k] = (by[k] || 0) + m.length; }
  }
})(ROOT);
const top = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 12);
console.log(top.length ? 'Still mention the old name or area (localize these):\n' + top.map(([k, n]) => `  ${String(n).padStart(5)}  ${k}`).join('\n') : 'Nothing left to localize.');
