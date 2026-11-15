#!/usr/bin/env node
// Builds website-kit.zip: a working copy of this website for another Chabad house to make their own.
// Leaves out private files (store/, the Rabbi's to-do lists, other shareable kits, Play Store files, git history),
// our event and flyer, and puts in the setup guide. Run:  node scripts/make-website-kit.js
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, 'dist', 'website-kit');
const SKIP = /^(\.git|node_modules|dist|ideas|android|kit-template|kiddush-kit|HANDOFF\.md|kiddush-kit\.zip|pushka-kit\.zip|website-kit\.zip|rebrand\.json|index\.html|chai-club\.html|styles\.css|\.env)(\/|$)|^store\/(?!google-ads(\/|$))|\.log$/;
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
let n = 0;
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name), rel = path.relative(ROOT, full);
    if (SKIP.test(rel)) continue;
    if (e.isDirectory()) { walk(full); continue; }
    const to = path.join(OUT, rel); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(full, to); n++;
  }
})(ROOT);
const read = (r) => fs.readFileSync(path.join(OUT, r), 'utf8'), write = (r, t) => fs.writeFileSync(path.join(OUT, r), t);
// One service only (the old static website is not part of the kit).
write('render.yaml', read('render.yaml').replace(/# The original static website[\s\S]*?buildCommand: ""\n\n/, '').replace('name: chabad-lamorinda-app', 'name: my-chabad-website').replace(/Chabad of Lamorinda/g, 'Your Chabad').replace(/# Website \+ My Pushka app.*\n/, '# The website, the Rabbi area and Stripe payments (one small Node server).\n'));
write('README.md', fs.readFileSync(path.join(ROOT, 'scripts', 'website-kit-README.md'), 'utf8'));
const zip = path.join(ROOT, 'website-kit.zip'); fs.rmSync(zip, { force: true });
cp.execSync(`cd "${path.join(ROOT, 'dist')}" && zip -qr "${zip}" website-kit`, { stdio: 'inherit' });
console.log(`${n} files -> ${zip} (${(fs.statSync(zip).size / 1048576).toFixed(1)} MB)`);
