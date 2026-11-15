#!/usr/bin/env node
// Tells Bing, Yandex and other IndexNow search engines about every page (and every changed page) in the sitemap.
//   INDEXNOW_KEY=<the key set in Render> PUBLIC_URL=https://jewishlamorinda.com node scripts/indexnow.js
// Run it after publishing new guides or events. Google uses Search Console instead (see store/seo-playbook.md).
'use strict';
const key = process.env.INDEXNOW_KEY, base = (process.env.PUBLIC_URL || 'https://jewishlamorinda.com').replace(/\/$/, '');
if (!key) { console.error('Set INDEXNOW_KEY (16 to 64 letters and numbers; the same value in Render).'); process.exit(1); }
(async () => {
  const xml = await (await fetch(base + '/sitemap.xml')).text();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  console.log(urls.length + ' addresses in the sitemap');
  for (let i = 0; i < urls.length; i += 9000) {
    const r = await fetch('https://api.indexnow.org/indexnow', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ host: new URL(base).host, key, keyLocation: `${base}/${key}.txt`, urlList: urls.slice(i, i + 9000) }) });
    console.log('IndexNow answered', r.status);
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
