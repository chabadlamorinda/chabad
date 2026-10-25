// The public website pages. Everything is rendered on the server from site/content/ plus live data
// (Shabbat times, holidays, RSVP counts, Facebook photos), so every page is complete for Google and AI crawlers.
'use strict';
const express = require('express');
const path = require('path');
const { md, esc, plain } = require('./md.js');
const { layout } = require('./layout.js');
const { fullAddress } = require('./content.js');
const Z = require('./zmanim.js');

const ROOT = path.join(__dirname, '..', '..');
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const parseLocal = (s) => { const [d, t = '00:00'] = s.split('T'); const [y, m, da] = d.split('-').map(Number); const [h, mi] = t.split(':').map(Number); return { y, m, d: da, h, mi }; };
const dayName = (s) => new Date(s.slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
const clock = (h, mi) => `${h % 12 || 12}${mi ? ':' + String(mi).padStart(2, '0') : ''} ${h < 12 ? 'AM' : 'PM'}`;
function when(e) {
  const a = parseLocal(e.start), b = e.end ? parseLocal(e.end) : null;
  const date = `${dayName(e.start)}, ${MONTH[a.m - 1]} ${a.d}, ${a.y}`;
  if (!b) return `${date} · ${clock(a.h, a.mi)}`;
  if (e.end.slice(0, 10) === e.start.slice(0, 10)) return `${date} · ${clock(a.h, a.mi)} – ${clock(b.h, b.mi)}`;
  return `${date} ${clock(a.h, a.mi)} – ${dayName(e.end)}, ${MONTH[b.m - 1]} ${b.d} ${clock(b.h, b.mi)}`;
}
const longDate = (ymd) => new Date(ymd + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const shortDate = (ymd) => new Date(ymd + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

function eventLd(c, base, e) {
  const o = c.org;
  return {
    '@context': 'https://schema.org', '@type': 'Event', name: e.title, description: plain(e.summary || e.details || ''),
    startDate: e.startIso, endDate: e.endIso || undefined, eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: e.online ? 'https://schema.org/OnlineEventAttendanceMode' : 'https://schema.org/OfflineEventAttendanceMode',
    location: e.online ? { '@type': 'VirtualLocation', url: e.online } : { '@type': 'Place', name: e.loc.name, address: e.loc.address || fullAddress(o) },
    image: [base + (e.image || '/assets/og.png')], url: base + '/events/' + e.slug,
    organizer: { '@type': 'Organization', name: o.name, url: base + '/' },
    offers: { '@type': 'Offer', price: e.priceAmount || 0, priceCurrency: 'USD', availability: 'https://schema.org/InStock', url: base + '/events/' + e.slug, validFrom: e.startIso.slice(0, 10) },
    isAccessibleForFree: !e.priceAmount,
  };
}

function eventCard(e, counts) {
  const a = parseLocal(e.start), going = counts && counts[e.slug];
  return `<article class="ev">
  <a class="ev-date" href="/events/${e.slug}" aria-hidden="true" tabindex="-1"><span>${MONTH[a.m - 1]}</span><b>${a.d}</b></a>
  <div class="ev-body">
    <h3><a href="/events/${e.slug}">${esc(e.title)}</a></h3>
    <p class="muted">${esc(when(e))} · ${esc(e.loc.name)}</p>
    ${e.summary ? `<p>${esc(e.summary)}</p>` : ''}
    <p class="ev-act">${e.rsvp ? `<a class="btn sm" href="/events/${e.slug}#rsvp">RSVP</a>` : ''}${going ? `<span class="muted"> ${going} going</span>` : ''}</p>
  </div>
</article>`;
}
const crumbs = (base, list) => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: list.map(([name, p], i) => ({ '@type': 'ListItem', position: i + 1, name, item: base + p })) });
const faqLd = (items) => ({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: items.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: plain(f.a) } })) });
const faqHtml = (items) => items.map((f) => `<details class="qa"><summary>${esc(f.q)}</summary><div>${md(f.a)}</div></details>`).join('');

function mountPages(app, ctx) {
  const { content, base, indexable, rsvpCounts, photos, analytics } = ctx;
  const c = () => content();
  const upcoming = (now = new Date()) => { const today = Z.ymd(Z.todayLocal(now)); return c().events.filter((e) => e.published && (e.end || e.start).slice(0, 10) >= today); };
  // Every page gets the Hebrew date and this week's candle lighting in the top strip.
  async function render(res, opts, status = 200) {
    const [hd, sh] = await Promise.all([Z.hebrewDate(Z.todayLocal()).catch(() => null), Z.thisShabbat().catch(() => null)]);
    res.status(status).set('Cache-Control', 'public, max-age=60, stale-while-revalidate=600').type('html')
      .send(layout(c(), { base, indexable, analytics, hebrewDate: hd ? hd.en : '', shabbat: sh, ...opts }));
  }
  const counts = async () => { try { return rsvpCounts ? await rsvpCounts() : {}; } catch (e) { return {}; } };
  const r = express.Router();
  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

  // ---------- home ----------
  r.get(['/', '/home'], wrap(async (req, res, next) => {
    if (req.path === '/' && !ctx.isHome(req)) return next(); // the app's own address still opens My Pushka
    const C = c(), o = C.org, [sh, hols, cnt, pics] = await Promise.all([Z.thisShabbat(), Z.upcomingHolidays(200), counts(), photos ? photos(8).catch(() => []) : []]);
    const evs = upcoming().slice(0, 4), nextHol = hols[0], holPage = nextHol && C.holidays.find((h) => h.slug === nextHol.slug);
    const body = `
<section class="hero">
  <div class="wrap hero-in">
    <div>
      <p class="eyebrow">Lafayette · Moraga · Orinda</p>
      <h1>${esc(o.tagline || 'A Jewish home for every Jew in Lamorinda')}</h1>
      <p class="lead">${esc(o.description)}</p>
      <p class="btns"><a class="btn gold" href="/events">See upcoming events</a><a class="btn ghost-l" href="/account">Join our community</a></p>
    </div>
    <aside class="card shabbat-card" aria-label="This Shabbat">
      <p class="eyebrow">This Shabbat${sh.parsha ? ' · ' + esc(sh.parsha.title.replace('Parashat ', '')) : ''}</p>
      ${sh.candles ? `<p class="big">${esc(sh.candles.timeStr)}</p><p>Candle lighting, ${esc(shortDate(sh.candles.date))}</p>` : ''}
      ${sh.havdalah ? `<p>Shabbat ends ${esc(sh.havdalah.timeStr)}, ${esc(shortDate(sh.havdalah.date))}</p>` : ''}
      <p><a href="/shabbat">Services &amp; Shabbat meals →</a></p>
    </aside>
  </div>
</section>
<section class="wrap sec">
  <div class="sec-h"><h2>Coming up</h2><a href="/events">Full calendar →</a></div>
  ${evs.length ? `<div class="evs">${evs.map((e) => eventCard(e, cnt)).join('')}</div>` : `<p class="muted">New events are posted here first. <a href="/account">Sign in</a> to get them by email.</p>`}
${weeklyHtml(o)}
</section>
${nextHol ? `<section class="band"><div class="wrap band-in"><div><p class="eyebrow">Next holiday</p><h2>${esc(holPage ? holPage.title : nextHol.title)}</h2><p>${esc(longDate(nextHol.date))}${nextHol.timeStr ? ' · candle lighting ' + esc(nextHol.timeStr) : ''}</p></div><a class="btn gold" href="/holidays/${nextHol.slug}">Celebrate with us</a></div></section>` : ''}
<section class="wrap sec">
  <div class="sec-h"><h2>Programs for every age</h2><a href="/programs">All programs →</a></div>
  <div class="grid">${C.programs.slice(0, 8).map((p) => `<a class="card tile" href="/programs/${p.slug}"><h3>${esc(p.name)}</h3><p>${esc(p.summary)}</p></a>`).join('')}</div>
</section>
<section class="wrap sec">
  <div class="sec-h"><h2>Everything Jewish in Lamorinda</h2><a href="/jewish-lamorinda">The full guide →</a></div>
  <div class="chips">${C.directory.map((g) => `<a class="chip" href="/jewish-lamorinda#${g.id || ''}">${esc(g.group)}</a>`).join('')}<a class="chip" href="/tools/hebrew-date">Hebrew date converter</a><a class="chip" href="/tools/yahrzeit">Yahrzeit calculator</a><a class="chip" href="/tools/bar-bat-mitzvah">Bar/Bat Mitzvah date</a></div>
</section>
${pics.length ? `<section class="wrap sec"><div class="sec-h"><h2>Moments from our community</h2><a href="/photos">More photos →</a></div><div class="pics">${pics.map((p) => `<a href="${esc(p.link)}" rel="noopener" target="_blank"><img src="${esc(p.src)}" alt="${esc(p.alt)}" loading="lazy" decoding="async" width="300" height="300"></a>`).join('')}</div></section>` : ''}
<section class="wrap sec join">
  <div class="card join-card">
    <h2>One sign-in for everything</h2>
    <p>Save your family once: names, Hebrew names, birthdays and yahrzeits. Then RSVP to any event in one tap, get reminders for yahrzeits and Hebrew birthdays, and hear about what is coming up.</p>
    <p class="btns"><a class="btn gold" href="/account">Create my free account</a></p>
  </div>
</section>
<section class="wrap sec narrow">
  <h2>Questions people ask</h2>
  ${faqHtml(C.faq.slice(0, 6))}
  <p><a href="/faq">All questions →</a></p>
</section>`;
    await render(res, { path: '/', title: o.name, description: o.description, body, ld: [faqLd(C.faq.slice(0, 6)), { '@context': 'https://schema.org', '@type': 'WebSite', name: o.name, url: base + '/' }] });
  }));

  // ---------- events ----------
  r.get('/events', wrap(async (req, res) => {
    const evs = upcoming(), cnt = await counts();
    const cat = String(req.query.c || ''), list = cat ? evs.filter((e) => e.category === cat) : evs;
    const cats = [...new Set(evs.map((e) => e.category).filter(Boolean))];
    const body = `<section class="wrap sec"><h1>Upcoming events</h1>
<p class="lead-d">Shabbat dinners, holiday celebrations, classes and family programs in Lafayette, Moraga and Orinda. Everyone is welcome.</p>
<p class="chips"><a class="chip${cat ? '' : ' on'}" href="/events">All</a>${cats.map((k) => `<a class="chip${k === cat ? ' on' : ''}" href="/events?c=${k}">${esc(k[0].toUpperCase() + k.slice(1))}</a>`).join('')}<a class="chip" href="/events.ics">Add calendar to my phone</a></p>
${list.length ? `<div class="evs">${list.map((e) => eventCard(e, cnt)).join('')}</div>` : '<p class="muted">No events in this list yet. Please check back soon.</p>'}
${cat ? '' : weeklyHtml(c().org)}
</section>`;
    await render(res, { path: '/events', title: 'Upcoming Jewish events in Lamorinda', description: 'Upcoming Jewish events, holiday celebrations, Shabbat dinners and classes at Chabad of Lamorinda in Lafayette, Moraga and Orinda.', body, ld: list.map((e) => eventLd(c(), base, e)), noindex: !!cat });
  }));
  r.get('/events/:slug', wrap(async (req, res, next) => {
    const C = c(), e = C.events.find((x) => x.slug === req.params.slug && x.published);
    if (!e) return next();
    const prog = e.program && C.programs.find((p) => p.slug === e.program), hol = e.holiday && C.holidays.find((h) => h.slug === e.holiday);
    const cnt = (await counts())[e.slug] || 0, cap = e.rsvp && e.rsvp.capacity, past = (e.end || e.start) < Z.ymd(Z.todayLocal()) + 'T00:00';
    const body = `<article class="wrap sec narrow event">
<p class="crumbs"><a href="/events">Events</a> ›</p>
<h1>${esc(e.title)}</h1>
<p class="when">${esc(when(e))}</p>
<p class="muted">${esc(e.loc.name)}${e.loc.address ? ' · ' + esc(e.loc.address) : ''} · <a href="https://maps.google.com/?q=${encodeURIComponent(e.loc.address || fullAddress(C.org))}" rel="noopener" target="_blank">Map</a></p>
${e.image ? `<img class="hero-img" src="${esc(e.image)}" alt="${esc(e.title)}" decoding="async">` : ''}
${e.summary ? `<p class="lead-d">${esc(e.summary)}</p>` : ''}
${md(e.details || '')}
${e.price ? `<p><strong>Cost:</strong> ${esc(e.price)}</p>` : ''}
${e.flyer ? `<p><a class="btn ghost" href="${esc(e.flyer)}">Download the flyer</a></p>` : ''}
${e.rsvp && !past ? `<section id="rsvp" class="card rsvp" data-rsvp="${e.slug}" data-kids="${e.rsvp.kids === false ? 0 : 1}">
  <h2>RSVP</h2>
  ${cap ? `<p class="muted">${Math.max(cap - cnt, 0)} of ${cap} places left</p>` : cnt ? `<p class="muted">${cnt} people are coming</p>` : ''}
  <noscript><p>Please RSVP by email: <a href="mailto:${esc(C.org.email || '')}?subject=${encodeURIComponent('RSVP: ' + e.title)}">${esc(C.org.email || '')}</a></p></noscript>
  <div class="rsvp-ui" hidden></div>
</section>` : ''}
<p class="btns"><a class="btn ghost" href="/events/${e.slug}.ics">Add to my calendar</a><a class="btn ghost" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(base + '/events/' + e.slug)}" rel="noopener" target="_blank">Share on Facebook</a><a class="btn ghost" href="https://wa.me/?text=${encodeURIComponent(e.title + ' ' + base + '/events/' + e.slug)}" rel="noopener" target="_blank">Share on WhatsApp</a></p>
${prog ? `<p>Part of <a href="/programs/${prog.slug}">${esc(prog.name)}</a>.</p>` : ''}${hol ? `<p>Learn more about <a href="/holidays/${hol.slug}">${esc(hol.title)}</a>.</p>` : ''}
</article>`;
    await render(res, { path: '/events/' + e.slug, title: e.title, description: `${when(e)}. ${e.summary || plain(e.details || '')}`, image: e.image, body, ld: [eventLd(C, base, e), crumbs(base, [['Events', '/events'], [e.title, '/events/' + e.slug]])] });
  }));

  // ---------- Shabbat ----------
  r.get('/shabbat', wrap(async (req, res) => {
    const C = c(), today = Z.todayLocal(), end = new Date(today); end.setDate(end.getDate() + 70);
    const list = await Z.events(today, end), weeks = [];
    for (const e of list) {
      if (e.cat === 'candles') weeks.push({ candles: e });
      else if (weeks.length && e.cat === 'parashat') weeks[weeks.length - 1].parsha = e;
      else if (weeks.length && e.cat === 'havdalah' && !weeks[weeks.length - 1].havdalah) weeks[weeks.length - 1].havdalah = e;
    }
    const svc = C.org.services || [];
    const body = `<section class="wrap sec narrow"><h1>Shabbat in Lamorinda</h1>
<p class="lead-d">Shabbat is a gift: 25 hours to slow down, connect and recharge. Join us for services, a warm Kiddush and Shabbat dinners. No membership needed, no Hebrew needed.</p>
${svc.length ? `<h2>Services</h2><ul class="list">${svc.map((s) => `<li><strong>${esc(s.name)}</strong> ${esc(s.time)}${s.note ? ` <span class="muted">· ${esc(s.note)}</span>` : ''}</li>`).join('')}</ul>` : ''}
<h2>Candle lighting times for Lafayette, Moraga and Orinda</h2>
<table class="tbl"><thead><tr><th>Shabbat</th><th>Candle lighting</th><th>Shabbat ends</th></tr></thead><tbody>
${weeks.map((w) => `<tr><td>${w.parsha ? esc(w.parsha.title.replace('Parashat ', '')) : ''}<br><span class="muted">${esc(shortDate(w.candles.date))}</span></td><td>${esc(w.candles.timeStr)}</td><td>${w.havdalah ? esc(w.havdalah.timeStr) : ''}</td></tr>`).join('')}
</tbody></table>
<p class="muted">Candle lighting is 18 minutes before sunset. Shabbat ends at nightfall. Holiday candle lighting times are on the <a href="/holidays">holidays page</a>.</p>
${md(C.org.shabbatText || '')}
<p class="btns"><a class="btn gold" href="/events?c=shabbat">Shabbat dinners and events</a><a class="btn ghost" href="/contact">Host or be hosted for a meal</a></p>
</section>`;
    await render(res, { path: '/shabbat', title: 'Shabbat times and services in Lafayette', description: 'Shabbat candle lighting times for Lafayette, Moraga and Orinda, Shabbat services, Kiddush and Shabbat dinners at Chabad of Lamorinda.', body });
  }));

  // ---------- holidays ----------
  r.get('/holidays', wrap(async (req, res) => {
    const C = c(), hols = await Z.upcomingHolidays(400);
    const body = `<section class="wrap sec narrow"><h1>Jewish holidays ${new Date().getFullYear()}–${new Date().getFullYear() + 1}</h1>
<p class="lead-d">Dates, candle lighting times for Lamorinda, what each holiday is about, and how to celebrate with us.</p>
<table class="tbl"><thead><tr><th>Holiday</th><th>Begins</th></tr></thead><tbody>
${hols.map((h) => { const p = C.holidays.find((x) => x.slug === h.slug); return `<tr><td><a href="/holidays/${h.slug}">${esc(p ? p.title : h.title)}</a></td><td>${esc(longDate(h.date))}${h.timeStr ? `<br><span class="muted">candle lighting ${esc(h.timeStr)} the evening before or that evening</span>` : ''}</td></tr>`; }).join('')}
</tbody></table></section>`;
    await render(res, { path: '/holidays', title: 'Jewish holiday dates and celebrations', description: 'Dates of every Jewish holiday this year with candle lighting times for Lafayette, Moraga and Orinda, and holiday events at Chabad of Lamorinda.', body });
  }));
  r.get('/holidays/:slug', wrap(async (req, res, next) => {
    const C = c(), h = C.holidays.find((x) => x.slug === req.params.slug);
    if (!h) return next();
    const nextDate = await Z.nextDateOf(h.slug), evs = upcoming().filter((e) => e.holiday === h.slug), cnt = await counts();
    const faqs = C.faq.filter((f) => f.holiday === h.slug);
    const body = `<article class="wrap sec narrow">
<p class="crumbs"><a href="/holidays">Holidays</a> ›</p>
<h1>${esc(h.title)}${h.hebrew ? ` <span class="he" lang="he">${esc(h.hebrew)}</span>` : ''}</h1>
${nextDate ? `<p class="when">Next: ${esc(longDate(nextDate.date))}</p>` : ''}
${evs.length ? `<h2>Celebrate with us</h2><div class="evs">${evs.map((e) => eventCard(e, cnt)).join('')}</div>` : ''}
${md(h.body)}
${faqs.length ? `<h2>Questions</h2>${faqHtml(faqs)}` : ''}
</article>`;
    await render(res, { path: '/holidays/' + h.slug, title: `${h.title}${nextDate ? ' ' + nextDate.date.slice(0, 4) : ''} in Lafayette, Moraga & Orinda`, description: h.description || h.text.slice(0, 160), body, ld: [crumbs(base, [['Holidays', '/holidays'], [h.title, '/holidays/' + h.slug]]), ...(faqs.length ? [faqLd(faqs)] : []), ...evs.map((e) => eventLd(C, base, e))] });
  }));

  // ---------- programs ----------
  r.get('/programs', wrap(async (req, res) => {
    const C = c();
    const body = `<section class="wrap sec"><h1>Programs</h1><p class="lead-d">Something for every age and stage, from toddlers to seniors.</p>
<div class="grid">${C.programs.map((p) => `<a class="card tile" href="/programs/${p.slug}"><p class="eyebrow">${esc(p.audience || '')}</p><h3>${esc(p.name)}</h3><p>${esc(p.summary)}</p></a>`).join('')}</div></section>`;
    await render(res, { path: '/programs', title: 'Jewish programs for kids, teens and adults', description: 'Hebrew school, adult classes, teen and kids programs, women\'s circle and more at Chabad of Lamorinda.', body });
  }));
  r.get('/programs/:slug', wrap(async (req, res, next) => {
    const C = c(), p = C.programs.find((x) => x.slug === req.params.slug);
    if (!p) return next();
    const evs = upcoming().filter((e) => e.program === p.slug), cnt = await counts();
    const body = `<article class="wrap sec narrow"><p class="crumbs"><a href="/programs">Programs</a> ›</p>
<h1>${esc(p.name)}</h1>${p.audience ? `<p class="eyebrow">${esc(p.audience)}</p>` : ''}<p class="lead-d">${esc(p.summary)}</p>
${p.schedule ? `<p><strong>When:</strong> ${esc(p.schedule)}</p>` : ''}
${md(p.details || '')}
${p.url ? `<p><a class="btn gold" href="${esc(p.url)}">${esc(p.cta || 'Learn more')}</a></p>` : `<p><a class="btn gold" href="/contact?about=${encodeURIComponent(p.name)}">Ask about ${esc(p.name)}</a></p>`}
${evs.length ? `<h2>Coming up</h2><div class="evs">${evs.map((e) => eventCard(e, cnt)).join('')}</div>` : ''}
</article>`;
    await render(res, { path: '/programs/' + p.slug, title: p.name, description: p.summary, body, ld: [crumbs(base, [['Programs', '/programs'], [p.name, '/programs/' + p.slug]])] });
  }));

  // ---------- Everything Jewish in Lamorinda ----------
  r.get('/jewish-lamorinda', wrap(async (req, res) => {
    const C = c();
    const body = `<section class="wrap sec narrow"><h1>Everything Jewish in Lamorinda</h1>
<p class="lead-d">Your guide to Jewish life in Lafayette, Moraga and Orinda: what you need, where to find it, and who to call. Something missing? <a href="/contact">Tell us</a>.</p>
<nav class="chips">${C.directory.map((g) => `<a class="chip" href="#${g.id}">${esc(g.group)}</a>`).join('')}</nav>
${C.directory.map((g) => `<h2 id="${g.id}">${esc(g.group)}</h2><div class="dir">${g.items.map((i) => `<div class="card dir-i"><h3>${i.url ? `<a href="${esc(i.url)}">${esc(i.name)}</a>` : esc(i.name)}</h3>${md(i.text)}</div>`).join('')}</div>`).join('')}
</section>`;
    await render(res, { path: '/jewish-lamorinda', title: 'Everything Jewish in Lafayette, Moraga & Orinda', description: 'The complete guide to Jewish life in Lamorinda: Shabbat, kosher food, mezuzahs, tefillin, Hebrew school, life events, yahrzeits, Jewish burial and more.', body });
  }));

  // ---------- simple Markdown pages (about, contact, privacy...) ----------
  r.get('/:slug', wrap(async (req, res, next) => {
    const C = c(), p = C.pages.find((x) => x.slug === req.params.slug);
    if (!p) return next();
    const faqs = p.slug === 'faq' ? C.faq : [];
    const body = `<article class="wrap sec narrow"><h1>${esc(p.title || p.slug)}</h1>${md(p.body)}${faqs.length ? faqHtml(faqs) : ''}${p.slug === 'contact' ? contactBlock(C) : ''}</article>`;
    await render(res, { path: '/' + p.slug, title: p.title || p.slug, description: p.description || p.text.slice(0, 160), body, ld: faqs.length ? [faqLd(faqs)] : [] });
  }));

  // ---------- photos (from the Facebook page) ----------
  r.get('/photos', wrap(async (req, res) => {
    const pics = photos ? await photos(60).catch(() => []) : [];
    const fb = c().org.social && c().org.social.facebook;
    const body = `<section class="wrap sec"><h1>Photos</h1><p class="lead-d">Moments from our community, straight from our Facebook page${fb ? ` (<a href="${esc(fb)}" rel="noopener" target="_blank">follow us</a>)` : ''}.</p>
${pics.length ? `<div class="pics big">${pics.map((p) => `<a href="${esc(p.link)}" rel="noopener" target="_blank"><img src="${esc(p.src)}" alt="${esc(p.alt)}" loading="lazy" decoding="async" width="300" height="300"></a>`).join('')}</div>` : '<p class="muted">Photos will appear here once the Facebook page is connected.</p>'}</section>`;
    await render(res, { path: '/photos', title: 'Photos', description: 'Photos from Shabbat, holidays and community events at Chabad of Lamorinda.', body });
  }));

  r.use('/assets', express.static(path.join(ROOT, 'site', 'assets'), { maxAge: '365d', immutable: true }));
  r.use('/media', express.static(path.join(ROOT, 'site', 'media'), { maxAge: '7d' }));
  app.use(r);
  return { render, upcoming, eventLd, when };
}

function weeklyHtml(o) {
  if (!(o.weekly || []).length) return '';
  return `<h2>Every week</h2><ul class="weekly">${o.weekly.map((w) => `<li><b>${esc(w.day)}</b><span>${w.link ? `<a href="${esc(w.link)}">${esc(w.name)}</a>` : esc(w.name)}<br><span class="muted">${esc(w.time)}</span></span></li>`).join('')}</ul>`;
}

function contactBlock(C) {
  const o = C.org;
  return `<div class="card"><p><strong>${esc(o.name)}</strong><br>${esc(fullAddress(o))}</p>
${o.phone ? `<p>Phone: <a href="tel:${esc(o.phone.replace(/[^0-9+]/g, ''))}">${esc(o.phone)}</a></p>` : ''}
${o.email ? `<p>Email: <a href="mailto:${esc(o.email)}">${esc(o.email)}</a></p>` : ''}
<p><a class="btn ghost" href="https://maps.google.com/?q=${encodeURIComponent(fullAddress(o))}" rel="noopener" target="_blank">Directions</a></p></div>`;
}

module.exports = { mountPages, when, eventLd, parseLocal, longDate };
