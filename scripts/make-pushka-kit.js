#!/usr/bin/env node
// Builds the shareable "My Pushka Kit" from this repository: removes this organization's details and private data,
// puts in sample values and the setup instructions, checks that the tests pass, and writes pushka-kit.zip.
// Run:  node scripts/make-pushka-kit.js
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.join(__dirname, '..'), TPL = path.join(ROOT, 'kit-template'), OUT = path.join(ROOT, 'dist', 'pushka-kit');
const K = require(path.join(TPL, 'scripts', 'customize.js'));

const cp_ = (rel, to = rel) => { const s = path.join(ROOT, rel), d = path.join(OUT, to); fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(s, d); };
function copyDir(rel, skip = () => false) {
  const base = path.join(ROOT, rel);
  (function go(dir) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, e.name), r = path.relative(ROOT, full); if (skip(r, e)) continue; if (e.isDirectory()) go(full); else cp_(r); } })(base);
}
const write = (rel, text) => { const f = path.join(OUT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
const read = (rel) => fs.readFileSync(path.join(OUT, rel), 'utf8');

fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });

// 1. what goes in
for (const f of ['package.json', 'package-lock.json', '.gitignore']) cp_(f);
copyDir('server', (r) => /server\/(seed|site)(\/|$)|server\/site\.test\.js$/.test(r)); // the website (server/site) is not part of the kit
copyDir('pushka', (r) => /pushka\/(icon[^/]*|logo[^/]*)$/.test(r));
copyDir('board'); copyDir('kiddush');
cp_('android/twa-manifest.json');
for (const f of ['rabbi-setup.md', 'kiddush-setup.md', 'board-embed.md', 'ideas.md', 'android-guide.md']) cp_('store/' + f);

// 2. private data out
write('server/site/index.js', "// (The original organisation's website is not part of the kit.)\n'use strict';\nfunction mountSite() { return { mountAdmin() {}, notFound: (req, res, next) => next() }; }\nmodule.exports = { mountSite };\n");
// the app's own tables get the same extra columns the website adds (the app code reads them)
for (const f of ['community', 'outreach']) write(`server/site/${f}.js`, "'use strict';\nmodule.exports = { SCHEMA: " + JSON.stringify(fs.readFileSync(path.join(ROOT, `server/site/${f}.js`), "utf8").split('\n').filter((l) => /^ALTER TABLE (members|yahrzeits) /.test(l)).join('\n')) + ' };\n');
write('server/calendar-notes.json', '[]\n');
write('server/kiddush-legacy.js', "// (The original organisation's one-time import is not part of the kit.)\n'use strict';\nasync function importLegacy() { return 0; }\nmodule.exports = { importLegacy };\n");
{ // remove the tests that belong to that private data
  let t = read('server/kiddush.test.js');
  for (const title of ["test('legacy import:", "test('notes kept in the code file"]) {
    const i = t.indexOf(title); if (i < 0) throw new Error('kit builder: test not found: ' + title);
    const j = t.indexOf('\ntest(', i + 5); t = t.slice(0, i) + (j < 0 ? '' : t.slice(j + 1));
  }
  t = t.replace('assert.match(r.json.instructions.address, /Golden Gate/)', 'assert.ok(r.json.instructions.address)');
  write('server/kiddush.test.js', t);
}

// 3. this organisation's details -> sample values
const lam = JSON.parse(fs.readFileSync(path.join(TPL, 'lamorinda.values.json'), 'utf8')), base = JSON.parse(fs.readFileSync(path.join(TPL, 'chabad.config.json'), 'utf8'));
const changed = K.swapValues(OUT, K.valuesOf(lam), K.valuesOf(base));
K.structured(OUT, base);
fs.writeFileSync(path.join(OUT, '.kit-state.json'), JSON.stringify({ note: 'What customize.js applied last. Do not edit.', config: base }, null, 2));

// 4. logo and icons: neutral placeholders; docs; config; scripts
for (const f of fs.readdirSync(path.join(TPL, 'assets'))) cp_('kit-template/assets/' + f, 'pushka/' + f);
cp_('kit-template/assets/logo.svg', 'kiddush/img/logo.svg');
for (const f of fs.readdirSync(path.join(TPL, 'docs'))) cp_('kit-template/docs/' + f, f);
cp_('kit-template/chabad.config.json', 'chabad.config.json');
cp_('kit-template/scripts/customize.js', 'scripts/customize.js');
write('render.yaml', `# Render settings: one small web service that serves the app, the card payments and the staff page.
services:
  - type: web
    name: chabad-samplehouse-app
    runtime: node
    plan: starter            # about $7/month; "free" works for trying it but falls asleep (no reminders)
    buildCommand: npm install --omit=dev
    startCommand: node server/index.js
    healthCheckPath: /healthz
    envVars:
      - key: NODE_VERSION
        value: "22"
      - key: SESSION_SECRET            # created for you
        generateValue: true
      - key: STRIPE_PUBLISHABLE_KEY    # pk_test_... first, then pk_live_...   (type it in Render, never in a chat)
        sync: false
      - key: STRIPE_SECRET_KEY         # sk_test_... first, then sk_live_...
        sync: false
      - key: STRIPE_WEBHOOK_SECRET     # whsec_...
        sync: false
      - key: DATABASE_URL              # optional, from neon.com
        sync: false
      - key: ADMIN_PASSWORD            # optional, 12+ characters
        sync: false
      - key: VAPID_PUBLIC_KEY          # optional, reminders on closed apps
        sync: false
      - key: VAPID_PRIVATE_KEY
        sync: false
      - key: APPLE_PAY_ASSOC           # optional
        sync: false
      - key: ANDROID_PACKAGE           # optional, Google Play
        value: org.samplechabad.pushka
      - key: ANDROID_SHA256            # optional, Google Play
        sync: false
`);
write('store/listing-template.md', `# Google Play store text (fill in, then paste into the Play Console)

Privacy policy URL: https://<your-address>/pushka/privacy.html

**App name (max 30):** My Pushka · Chabad of Sampleton
**Short description (max 80):** Drop coins daily, watch your pushka fill, then give to Chabad of Sampleton.
**Full description:** Ask Claude to write this from your finished app (what it does, your funds, English and Hebrew), in the same plain style as the app.

Play Console answers (check each against Google's current wording):
- Data safety: collects name, email, optional phone and mailing address, payment info (entered into Stripe's secure form; you never see the card number), the gift amount, and only if the user opts in: yahrzeit names/dates and a push-notification address. Not sold. Encrypted in transit. Users can delete their data in the app (More → Profile → Delete account).
- Ads: none. In-app purchases: none (donations to a nonprofit are not purchases of digital goods). Target audience: 18 and over.
`);
const pj = JSON.parse(read('package.json')); pj.scripts = Object.assign({ customize: 'node scripts/customize.js' }, pj.scripts); pj.scripts.test = pj.scripts.test.replace(' server/site.test.js', ''); delete pj.scripts.dev; delete pj.scripts['facebook:post']; pj.description = 'My Pushka: a tzedakah app for your Chabad house'; write('package.json', JSON.stringify(pj, null, 2) + '\n');

// 5. checks: nothing of the original organisation may remain
const leftovers = [];
for (const f of K.walk(OUT)) {
  const s = fs.readFileSync(f, 'utf8');
  for (const pat of [/lamorinda/i, /lafayette/i, /chabadoflamorinda/i, /47-4642750/, /925-384/, /golden gate/i, /לאמורינדה/, /לפייט/, /moraga/i, /orinda/i, /labkowski/i]) if (pat.test(s)) leftovers.push(path.relative(OUT, f) + '  ' + pat);
}
const allowed = (l) => /^NOTICE\.md/.test(l) || /^README\.md/.test(l) || /^package-lock\.json/.test(l);
const bad = leftovers.filter((l) => !allowed(l));
if (bad.length) { console.error('Still contains the original organisation:\n' + bad.join('\n')); process.exit(1); }

// 6. the kit must pass its own tests (after a fresh install)
console.log('Installing and testing the kit...');
cp.execSync('npm install --no-audit --no-fund', { cwd: OUT, stdio: 'inherit' });
cp.execSync('npm test', { cwd: OUT, stdio: 'inherit', env: Object.assign({}, process.env) });
fs.rmSync(path.join(OUT, 'node_modules'), { recursive: true, force: true });

// 7. zip
const zip = path.join(ROOT, 'pushka-kit.zip'); fs.rmSync(zip, { force: true });
cp.execSync(`python3 -c "import shutil;shutil.make_archive('${path.join(ROOT, 'pushka-kit')}','zip','${path.join(ROOT, 'dist')}','pushka-kit')"`);
console.log('Wrote ' + zip + ' (' + Math.round(fs.statSync(zip).size / 1024) + ' KB, ' + changed + ' files had the original details replaced).');
