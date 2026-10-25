// Files for search engines, AI assistants and calendars:
// sitemap.xml, robots.txt, llms.txt / llms-full.txt (a plain-text summary AI assistants read),
// events.ics (subscribe in any calendar app), per-event .ics, feed.xml (RSS), and the web app manifest.
'use strict';
const { plain } = require('./md.js');
const { fullAddress } = require('./content.js');
const Z = require('./zmanim.js');
const { LANGS, withLang } = require('./i18n.js');

const STATIC = ['/', '/events', '/shabbat', '/holidays', '/programs', '/jewish-lamorinda', '/learn', '/our-area', '/community', '/get-involved', '/help', '/kaddish', '/tehillim', '/sponsor', '/donate', '/forms', '/photos', '/tools/hebrew-date', '/tools/yahrzeit', '/tools/bar-bat-mitzvah'];
// AI and search crawlers we explicitly welcome (being cited by assistants is a goal of this site).
const BOTS = ['Googlebot', 'Bingbot', 'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-User', 'Claude-SearchBot', 'anthropic-ai', 'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot', 'Applebot-Extended', 'meta-externalagent', 'FacebookBot', 'DuckDuckBot', 'YandexBot', 'cohere-ai', 'MistralAI-User'];

const xml = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const icsText = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const fold = (line) => { const out = []; let s = line; while (Buffer.byteLength(s) > 74) { let n = 74; while (Buffer.byteLength(s.slice(0, n)) > 74) n--; out.push(s.slice(0, n)); s = ' ' + s.slice(n); } out.push(s); return out.join('\r\n'); };
const icsLocal = (s) => s.replace(/[-:]/g, '') + '00';

function vevent(c, base, e) {
  const end = e.end || (() => { const d = new Date(e.start + ':00Z'); d.setUTCHours(d.getUTCHours() + 2); return d.toISOString().slice(0, 16); })();
  return ['BEGIN:VEVENT', `UID:${e.slug}@chabadoflamorinda`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART;TZID=America/Los_Angeles:${icsLocal(e.start)}`, `DTEND;TZID=America/Los_Angeles:${icsLocal(end)}`,
    `SUMMARY:${icsText(e.title)}`, `DESCRIPTION:${icsText((e.summary || plain(e.details || '')) + '\n' + base + '/events/' + e.slug)}`,
    `LOCATION:${icsText(e.loc.name + (e.loc.address ? ', ' + e.loc.address : ', ' + fullAddress(c.org)))}`, `URL:${base}/events/${e.slug}`, 'END:VEVENT'];
}
const TZ_BLOCK = ['BEGIN:VTIMEZONE', 'TZID:America/Los_Angeles', 'BEGIN:DAYLIGHT', 'TZOFFSETFROM:-0800', 'TZOFFSETTO:-0700', 'TZNAME:PDT', 'DTSTART:19700308T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU', 'END:DAYLIGHT', 'BEGIN:STANDARD', 'TZOFFSETFROM:-0700', 'TZOFFSETTO:-0800', 'TZNAME:PST', 'DTSTART:19701101T020000', 'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU', 'END:STANDARD', 'END:VTIMEZONE'];
const calendar = (c, base, list) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Chabad of Lamorinda//Website//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${icsText(c.org.name)}`, 'X-WR-TIMEZONE:America/Los_Angeles', ...TZ_BLOCK, ...list.flatMap((e) => vevent(c, base, e)), 'END:VCALENDAR'].map(fold).join('\r\n') + '\r\n';

async function llmsText(c, base, upcoming, full) {
  const o = c.org, sh = await Z.thisShabbat().catch(() => null), lines = [];
  lines.push(`# ${o.name}`, '', `> ${o.description}`, '');
  lines.push(`${o.name} is the Chabad-Lubavitch center and synagogue serving the Jewish community of Lafayette, Moraga and Orinda ("Lamorinda"), and nearby Pleasant Hill and Martinez, in Contra Costa County in the San Francisco Bay Area, California. Every Jew is welcome regardless of affiliation, background or knowledge; no membership is required.`, '');
  lines.push('## Key facts', `- Address: ${fullAddress(o)}`);
  if (o.phone) lines.push(`- Phone: ${o.phone}`);
  if (o.email) lines.push(`- Email: ${o.email}`);
  for (const p of o.staff || []) lines.push(`- ${p.role}: ${p.name}`);
  lines.push(`- Website: ${base}/`, `- Serves: ${(o.areaServed || []).join(', ')}`);
  for (const [k, v] of Object.entries(o.social || {})) if (v && /^https?:/.test(v)) lines.push(`- ${k[0].toUpperCase() + k.slice(1)}: ${v}`);
  if (sh && sh.candles) lines.push(`- This week: candle lighting ${sh.candles.timeStr} on ${sh.candles.date}${sh.havdalah ? `, Shabbat ends ${sh.havdalah.timeStr}` : ''} (Lafayette, CA)`);
  lines.push('', '## Services');
  for (const s of o.services || []) lines.push(`- ${s.name}: ${s.time}${s.note ? ' (' + s.note + ')' : ''}`);
  lines.push('', '## Programs');
  for (const p of c.programs) lines.push(`- [${p.name}](${base}/programs/${p.slug}): ${p.summary}`);
  lines.push('', '## Upcoming events');
  for (const e of upcoming().slice(0, full ? 50 : 15)) lines.push(`- [${e.title}](${base}/events/${e.slug}): ${e.start.replace('T', ' ')}${e.summary ? ' - ' + e.summary : ''}`);
  lines.push('', '## Pages', `- [Shabbat times and services](${base}/shabbat)`, `- [Jewish holidays with dates](${base}/holidays)`, `- [Everything Jewish in Lamorinda](${base}/jewish-lamorinda)`, `- [Questions and answers](${base}/faq)`, `- [Hebrew date converter](${base}/tools/hebrew-date)`, `- [Yahrzeit calculator](${base}/tools/yahrzeit)`, `- [Calendar feed (iCal)](${base}/events.ics)`);
  for (const h of c.holidays) lines.push(`- [${h.title}](${base}/holidays/${h.slug})`);
  lines.push('', '## Towns served (local pages)');
  for (const t of c.towns || []) lines.push(`- [Jewish ${t.name}, CA](${base}/jewish-${t.slug})${t.miles ? `: ${t.miles} miles from the center` : ': home of the center'}`);
  lines.push('', '## Help with life situations (call the Rabbi first)');
  for (const h of c.help || []) lines.push(`- [${h.title}](${base}/help/${h.slug}): ${h.description}`);
  lines.push(`- [Kaddish: join the minyan or have Kaddish said for a loved one](${base}/kaddish)`, `- [Tehillim (Psalms) for every occasion](${base}/tehillim)`, `- [Sponsor a Kiddush or program in honor or memory](${base}/sponsor)`);
  lines.push('', 'The whole site is also available in Hebrew (' + base + '/he/) and Russian (' + base + '/ru/).');
  lines.push('', '## Guides to Jewish life');
  for (const a of c.learn || []) lines.push(`- [${a.title}](${base}/learn/${a.slug}): ${a.description}`);
  lines.push('', '## Questions and answers');
  for (const f of c.faq) lines.push(`### ${f.q}`, plain(f.a), '');
  if (full) {
    lines.push('## Everything Jewish in Lamorinda');
    for (const g of c.directory) { lines.push(`### ${g.group}`); for (const i of g.items) lines.push(`- ${i.name}: ${plain(i.text)}`); }
    for (const p of c.pages.filter((x) => !['privacy', 'accessibility'].includes(x.slug))) lines.push('', `## ${p.title || p.slug}`, p.text);
    for (const h of c.holidays) lines.push('', `## ${h.title}`, h.text);
    for (const a of c.learn || []) { lines.push('', `## ${a.title}`, plain(a.body)); for (const f of a.faq) lines.push(`Q: ${f.q}`, `A: ${plain(f.a)}`); if (a.local) lines.push(`In Lamorinda: ${a.local}`); }
  }
  return lines.join('\n') + '\n';
}

function mountSeo(r, { content, base, indexable, upcoming }) {
  const c = () => content();
  r.get('/robots.txt', (req, res) => {
    res.type('text').set('Cache-Control', 'public, max-age=3600');
    if (!indexable) return res.send('# Preview site: not yet open to search engines.\nUser-agent: *\nDisallow: /\n');
    res.send(BOTS.map((b) => `User-agent: ${b}\nAllow: /\nDisallow: /admin/\nDisallow: /api/\nDisallow: /account\n`).join('\n') + `\nUser-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\nDisallow: /account\n\nSitemap: ${base}/sitemap.xml\n`);
  });
  r.get('/sitemap.xml', (req, res) => {
    const C = c(), today = new Date().toISOString().slice(0, 10);
    const paths = [...STATIC, ...C.pages.map((p) => '/' + p.slug), ...C.programs.map((p) => '/programs/' + p.slug), ...C.holidays.map((h) => '/holidays/' + h.slug), ...C.towns.map((t) => '/jewish-' + t.slug), ...C.learn.map((a) => '/learn/' + a.slug), ...(C.help || []).map((h) => '/help/' + h.slug), ...(C.forms || []).map((f) => '/forms/' + f.id), ...upcoming().map((e) => '/events/' + e.slug)];
    // Every page in English, Hebrew and Russian, each listing its other language versions (hreflang).
    const alt = (p) => LANGS.map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${xml(base + withLang(l, p))}"/>`).join('');
    res.type('application/xml').set('Cache-Control', 'public, max-age=3600').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${paths.flatMap((p) => LANGS.map((l) => `<url><loc>${xml(base + withLang(l, p))}</loc><lastmod>${today}</lastmod>${alt(p)}</url>`)).join('\n')}\n</urlset>\n`);
  });
  r.get('/llms.txt', async (req, res, next) => { try { res.type('text/plain; charset=utf-8').set('Cache-Control', 'public, max-age=3600').send(await llmsText(c(), base, upcoming, false)); } catch (e) { next(e); } });
  r.get('/llms-full.txt', async (req, res, next) => { try { res.type('text/plain; charset=utf-8').set('Cache-Control', 'public, max-age=3600').send(await llmsText(c(), base, upcoming, true)); } catch (e) { next(e); } });
  r.get('/events.ics', (req, res) => res.type('text/calendar; charset=utf-8').set('Cache-Control', 'public, max-age=900').send(calendar(c(), base, upcoming())));
  r.get('/events/:slug.ics', (req, res, next) => {
    const e = c().events.find((x) => x.slug === req.params.slug && x.published);
    if (!e) return next();
    res.type('text/calendar; charset=utf-8').set('Content-Disposition', `attachment; filename="${e.slug}.ics"`).send(calendar(c(), base, [e]));
  });
  r.get('/feed.xml', (req, res) => {
    const C = c(), items = upcoming().slice(0, 30);
    res.type('application/rss+xml').set('Cache-Control', 'public, max-age=900').send(`<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>${xml(C.org.name)} events</title><link>${base}/events</link><description>${xml(C.org.description)}</description>\n${items.map((e) => `<item><title>${xml(e.title)}</title><link>${base}/events/${e.slug}</link><guid>${base}/events/${e.slug}</guid><description>${xml(e.summary || plain(e.details || ''))}</description></item>`).join('\n')}\n</channel></rss>\n`);
  });
  r.get('/site.webmanifest', (req, res) => res.type('application/manifest+json').json({ name: c().org.name, short_name: c().org.shortName || 'Chabad', start_url: '/', display: 'standalone', background_color: '#ffffff', theme_color: '#14284b', icons: [{ src: '/pushka/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/pushka/icon-512.png', sizes: '512x512', type: 'image/png' }] }));
}
module.exports = { mountSeo, calendar, llmsText, BOTS };
