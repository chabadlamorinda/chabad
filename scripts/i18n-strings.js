// Lists every interface phrase the website translates, and which ones a language is missing:
//   node scripts/i18n-strings.js            -> writes site/content/i18n/strings-en.json (all phrases)
//   node scripts/i18n-strings.js he         -> prints the phrases missing from he.json
// Phrases are the English text inside t('...') / tr('...') / T('...') calls, plus names that come from data
// (Hebrew months, Torah portions and holidays from the calendar, guide categories, submission kinds).
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const files = [...fs.readdirSync(path.join(ROOT, 'server/site')).map((f) => 'server/site/' + f), 'site/assets/site.js'].filter((f) => f.endsWith('.js'));
const out = new Set();
const re = /\b(?:t|tr|T|X\.t)\(\s*(['"])((?:\\.|(?!\1).)+)\1/g;
for (const f of files) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  let m; while ((m = re.exec(src))) out.add(m[2].replace(/\\'/g, "'").replace(/\\"/g, '"'));
  const re2 = /\b(?:a|tile)\(\s*'[^']*',\s*(['"])((?:\\.|(?!\1).)+)\1(?:,\s*(['"])((?:\\.|(?!\3).)+)\3)?/g;
  while ((m = re2.exec(src))) { out.add(m[2].replace(/\\'/g, "'")); if (m[4]) out.add(m[4].replace(/\\'/g, "'")); }
}
const { CLIENT, NAV } = require('../server/site/layout.js');
for (const s of CLIENT) out.add(s);
for (const [, s] of NAV) out.add(s);
for (const s of require('../server/site/content.js').LEARN_CATEGORIES) out.add(s);
for (const s of Object.values({ name: 'Name', hebrewName: 'Hebrew name', birthday: 'Birthday', grade: 'Grade', school: 'School', allergies: 'Allergies or medical notes' })) out.add(s);
for (const [n] of require('../site/content/giving.json').building.levels) out.add(n);
for (const b of ['Chumash', 'Tehillim', 'Tanya', 'Rambam: 1 chapter', 'Rambam: 3 chapters', 'Sefer HaMitzvot', 'Daf Yomi', 'Mishnah Yomi', 'Nach Yomi', 'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy']) out.add(b);
for (const p of require('../server/site/parsha.js').all()) out.add('Parashat ' + p.name);
for (const [, label] of [['', 'Dawn (Alot HaShachar)'], ['', 'Earliest tallit and tefillin'], ['', 'Sunrise'], ['', 'Latest Shema'], ['', 'Latest Shacharit (morning prayer)'], ['', 'Midday (Chatzot)'], ['', 'Earliest Mincha'], ['', 'Mincha Ketanah'], ['', 'Plag HaMincha'], ['', 'Sunset'], ['', 'Nightfall (Tzeit HaKochavim)']]) out.add(label);
for (const k of Object.values(require('../server/site/board.js').KINDS)) out.add(k.label);
for (const s of ['Shabbat', 'Holidays', 'Classes', 'Kids', 'Teens', 'Women', 'Men', 'Community', 'Seniors', 'Family', 'Volunteer', 'Mazal Tov', 'Condolences', 'News']) out.add(s);
for (const s of ['Tishrei', 'Cheshvan', 'Kislev', 'Tevet', "Sh'vat", 'Adar', 'Adar I', 'Adar II', 'Nisan', 'Iyyar', 'Sivan', 'Tamuz', 'Av', 'Elul', 'Tishri', 'Heshvan', 'Shevat', 'Iyar']) out.add(s);

(async () => {
  const Z = require('../server/site/zmanim.js');
  const start = new Date(); const end = new Date(start); end.setDate(end.getDate() + 800);
  for (const e of await Z.events(start, end)) if (['parashat', 'holiday', 'roshchodesh'].includes(e.cat) || /Chanukah|Rosh|Pesach|Sukkot|Shavuot|Purim|Yom/.test(e.title)) out.add(e.title);
  const all = [...out].filter((s) => /[a-z]/i.test(s)).sort();
  const lang = process.argv[2];
  if (!lang) { fs.writeFileSync(path.join(ROOT, 'site/content/i18n/strings-en.json'), JSON.stringify(all, null, 1) + '\n'); console.log(all.length + ' phrases written to site/content/i18n/strings-en.json'); return; }
  let have = {}; try { have = JSON.parse(fs.readFileSync(path.join(ROOT, `site/content/i18n/${lang}.json`), 'utf8')); } catch (e) {}
  const missing = all.filter((s) => !have[s]);
  console.log(JSON.stringify(missing, null, 1)); console.error(missing.length + ' missing of ' + all.length);
})();
