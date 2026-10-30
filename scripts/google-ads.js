// Builds Google Ads Editor import files from store/google-ads/campaigns.json and checks every ad against
// Google's limits (headline 30 characters, description 90, 3-15 headlines, 2-4 descriptions).
// Usage: node scripts/google-ads.js   ->  store/google-ads/ads.csv and keywords.csv
'use strict';
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'store', 'google-ads');
function build(data, year = new Date().getFullYear()) {
  const errors = [], ads = [], kws = [];
  const csv = (row) => row.map((v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`).join(',');
  for (const c of data.campaigns) {
    if (c.groups.length < 2) errors.push(`${c.name}: Ad Grants needs at least 2 ad groups`);
    for (const g of c.groups) {
      const where = `${c.name} / ${g.name}`;
      const heads = [...new Set([...g.headlines, ...data.common.headlines])].slice(0, 15), descs = [...g.descriptions, ...data.common.descriptions].slice(0, 4);
      for (const h of heads) if (h.length > 30) errors.push(`${where}: headline over 30 characters: ${h}`);
      for (const d of descs) if (d.length > 90) errors.push(`${where}: description over 90 characters: ${d}`);
      if (heads.length < 3 || descs.length < 2) errors.push(`${where}: needs 3+ headlines and 2+ descriptions`);
      for (const k of g.keywords) if (!/\s/.test(k)) errors.push(`${where}: single-word keyword not allowed: ${k}`);
      const url = data.site + g.url.replace('{year}', year);
      ads.push(csv([c.name, g.name, 'Responsive search ad', url, ...Array.from({ length: 15 }, (_, i) => heads[i] || ''), ...Array.from({ length: 4 }, (_, i) => descs[i] || '')]));
      for (const k of g.keywords) kws.push(csv([c.name, g.name, k, 'Phrase', url]));
    }
  }
  const adHead = csv(['Campaign', 'Ad group', 'Ad type', 'Final URL', ...Array.from({ length: 15 }, (_, i) => 'Headline ' + (i + 1)), ...Array.from({ length: 4 }, (_, i) => 'Description ' + (i + 1))]);
  return { errors, ads: [adHead, ...ads].join('\n') + '\n', keywords: [csv(['Campaign', 'Ad group', 'Keyword', 'Criterion Type', 'Final URL']), ...kws].join('\n') + '\n' };
}
if (require.main === module) {
  const out = build(JSON.parse(fs.readFileSync(path.join(DIR, 'campaigns.json'), 'utf8')));
  if (out.errors.length) { console.error(out.errors.join('\n')); process.exit(1); }
  fs.writeFileSync(path.join(DIR, 'ads.csv'), out.ads); fs.writeFileSync(path.join(DIR, 'keywords.csv'), out.keywords);
  console.log('Wrote store/google-ads/ads.csv and keywords.csv');
}
module.exports = { build };
