// The public website pages, in English, Hebrew and Russian. Everything is rendered on the server from site/content/
// plus live data (Shabbat times, holidays, RSVP counts, Facebook photos), so every page is complete for Google and AI.
'use strict';
const { homeBody } = require('./home.js');
const express = require('express');
const path = require('path');
const { md, esc, plain } = require('./md.js');
const { layout } = require('./layout.js');
const { fullAddress, fmtClock } = require('./content.js');
const Z = require('./zmanim.js');
const { googleCalendarUrl } = require('./social.js');
const { withShare } = require('./share.js');
const { withGuides, friendlyLinks } = require('./links.js');
const { withContact } = require('./leads.js');
const { parseLocal } = require('./ctx.js');
const { decorate, artImg, artFor, artForPath } = require('./art.js');
const artImgFor = (p) => artImg(artForPath(p), 'lg');

const ROOT = path.join(__dirname, '..', '..');

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

function eventCard(e, counts, X) {
  const a = parseLocal(e.start), going = counts && counts[e.slug], t = X.t;
  return `<article class="ev">
  <a class="ev-date" href="/events/${e.slug}" aria-hidden="true" tabindex="-1"><span>${esc(X.mon(a.m))}</span><b>${a.d}</b></a>
  ${artImg(artFor('event', e.holiday || e.category || e.slug, e.title))}
  <div class="ev-body">
    <h3><a href="/events/${e.slug}">${esc(e.title)}</a></h3>
    <p class="muted">${esc(X.when(e))} · ${esc(e.loc.name)}</p>
    ${e.summary ? `<p>${esc(e.summary)}</p>` : ''}
    <p class="ev-act">${e.rsvp ? `<a class="btn sm" href="/events/${e.slug}#rsvp">${esc(t('RSVP'))}</a>` : ''}${going ? `<span class="muted"> ${esc(t('{n} going', { n: going }))}</span>` : ''}</p>
  </div>
</article>`;
}
const crumbs = (base, list) => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: list.map(([name, p], i) => ({ '@type': 'ListItem', position: i + 1, name, item: base + p })) });
const faqLd = (items) => ({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: items.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: plain(f.a) } })) });
const faqHtml = (items) => items.map((f) => `<details class="qa"><summary>${esc(f.q)}</summary><div>${md(f.a)}</div></details>`).join('');

function mountPages(app, ctx) {
  const { base, indexable, rsvpCounts, photos, analytics, ctxOf } = ctx;
  const upcoming = (now = new Date(), C = ctx.content()) => { const today = Z.ymd(Z.todayLocal(now)); return C.events.filter((e) => e.published && (e.end || e.start).slice(0, 10) >= today); };
  // Every page gets the Hebrew date and this week's candle lighting in the top strip, in the visitor's language.
  async function render(res, opts, status = 200) {
    const X = ctxOf(res.req), to = status === 200 && !opts.noRedirect && X.redirectTo();
    if (to) return res.set('Vary', 'Accept-Language, Cookie').redirect(302, to);
    const [hd, sh] = await Promise.all([X.hebrewDate(Z.todayLocal()).catch(() => ''), Z.thisShabbat().catch(() => null)]);
    const html = layout(X.C, { base, indexable, analytics, hebrewDate: hd, shabbat: sh, lang: X.lang, t: X.t, fmtDay: X.shortDate, tm: X.tm, ...opts, body: opts.path === '/' ? opts.body : decorate(status === 200 ? withShare(X, withContact(X, withGuides(X, friendlyLinks(X, opts.body), opts.path), opts.path), opts.path, opts.title, base) : opts.body, opts.path) });
    res.status(status).set('Cache-Control', 'public, max-age=60, stale-while-revalidate=600').set('Vary', 'Accept-Language, Cookie').type('html').send(X.links(html));
  }
  const counts = async () => { try { return rsvpCounts ? await rsvpCounts() : {}; } catch (e) { return {}; } };
  let news = async () => [];
  const setNews = (fn) => { news = fn; };
  const r = express.Router();
  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  const cat = (X, k) => X.t({ shabbat: 'Shabbat', holiday: 'Holidays', class: 'Classes', kids: 'Kids', teens: 'Teens', women: 'Women', men: 'Men', community: 'Community', seniors: 'Seniors', family: 'Family', volunteer: 'Volunteer' }[k] || k);

  // ---------- home ----------
  r.get(['/', '/home'], wrap(async (req, res, next) => {
    if (req.path === '/' && !ctx.isHome(req)) return next(); // the app's own address still opens My Pushka
    const X = ctxOf(req), { t, C } = X, o = C.org;
    const [sh, hols, cnt, pics, posts] = await Promise.all([Z.thisShabbat(), Z.upcomingHolidays(200), counts(), photos ? photos(14).catch(() => []) : [], news(3).catch(() => [])]);
    const ks = o.kabbalatShabbat ? Z.kabbalatFor(o.kabbalatShabbat, sh.candles) : null;
    const nextHol = hols[0], holPage = nextHol && C.holidays.find((h) => h.slug === nextHol.slug);
    const body = homeBody(X, { sh, ks, hols, evs: upcoming(new Date(), C), cnt, pics, posts, holPage, today: Z.ymd(Z.todayLocal()) }) + `
<section class="wrap sec narrow">
  <h2>${esc(t('Questions people ask'))}</h2>
  ${faqHtml(C.faq.slice(0, 5))}
  <p><a href="/faq">${esc(t('All questions'))} →</a></p>
</section>`;
    await render(res, { path: '/', title: o.name, description: o.description, body: decorate(body, '/__home'), ld: [faqLd(C.faq.slice(0, 5)), { '@context': 'https://schema.org', '@type': 'WebSite', name: o.name, url: base + '/', inLanguage: X.lang }] });
  }));

  // ---------- events ----------
  r.get('/events', wrap(async (req, res) => {
    const X = ctxOf(req), { t, C } = X, evs = upcoming(new Date(), C), cnt = await counts();
    const c = String(req.query.c || ''), list = c ? evs.filter((e) => e.category === c) : evs;
    const cats = [...new Set(evs.map((e) => e.category).filter(Boolean))];
    const body = `<section class="wrap sec"><h1>${esc(t('Upcoming events'))}</h1>
<p class="lead-d">${esc(t('Shabbat dinners, holiday celebrations, classes and family programs in Lafayette, Moraga and Orinda. Everyone is welcome.'))}</p>
<p class="chips"><a class="chip${c ? '' : ' on'}" href="/events">${esc(t('All'))}</a>${cats.map((k) => `<a class="chip${k === c ? ' on' : ''}" href="/events?c=${k}">${esc(cat(X, k))}</a>`).join('')}<a class="chip" href="/calendar">${esc(t('Calendar'))}</a><a class="chip" href="/events.ics">${esc(t('Add calendar to my phone'))}</a></p>
<h2 class="sr-only">${esc(t('Upcoming events'))}</h2>${list.length ? `<div class="evs">${list.map((e) => eventCard(e, cnt, X)).join('')}</div>` : `<p class="muted">${esc(t('No events in this list yet. Please check back soon.'))}</p>`}
${c ? '' : weeklyHtml(C.org, X)}
</section>`;
    await render(res, { path: '/events', title: t('Upcoming Jewish events in Lamorinda'), description: t('Upcoming Jewish events, holiday celebrations, Shabbat dinners and classes at Chabad of Lamorinda in Lafayette, Moraga and Orinda.'), body, ld: [...list.map((e) => eventLd(C, base, e)), ...seriesLd(ctx.content(), base)], noindex: !!c });
  }));
  r.get('/events/:slug', wrap(async (req, res, next) => {
    const X = ctxOf(req), { t, C } = X, e = C.events.find((x) => x.slug === req.params.slug && x.published);
    if (!e) return next();
    const prog = e.program && C.programs.find((p) => p.slug === e.program), hol = e.holiday && C.holidays.find((h) => h.slug === e.holiday);
    const cnt = (await counts())[e.slug] || 0, cap = e.rsvp && e.rsvp.capacity, past = (e.end || e.start) < Z.ymd(Z.todayLocal()) + 'T00:00';
    const body = `<article class="wrap sec narrow event">
<p class="crumbs"><a href="/events">${esc(t('Events'))}</a> ›</p>
<h1>${esc(e.title)}</h1>
<div class="facts">
<div><p class="eyebrow">${esc(t('When'))}</p><p class="when">${esc(X.when(e))}</p></div>
<div><p class="eyebrow">${esc(t('Where'))}</p><p>${esc(e.loc.name)}${e.loc.address ? '<br><bdi dir="ltr">' + esc(e.loc.address) + '</bdi>' : ''}<br><a href="https://maps.google.com/?q=${encodeURIComponent(e.loc.address || fullAddress(C.org))}" rel="noopener" target="_blank">${esc(t('Map'))}</a></p></div>
${e.price ? `<div><p class="eyebrow">${esc(t('Cost'))}</p><p>${esc(e.price)}</p></div>` : ''}
${e.rsvp && !past ? `<div><p class="eyebrow">${esc(t('RSVP'))}</p><p><a class="btn sm gold" href="#rsvp">${esc(t('RSVP in one tap'))}</a></p></div>` : ''}
</div>
${e.image ? `<img class="hero-img" src="${esc(e.image)}" alt="${esc(e.title)}" decoding="async">` : ''}
${e.summary ? `<p class="lead-d">${esc(e.summary)}</p>` : ''}
${md(e.details || '')}
${e.flyer ? `<p><a class="btn ghost" href="${esc(e.flyer)}">${esc(t('Download the flyer'))}</a></p>` : ''}
${e.photos && e.photos.length ? `<h2>${esc(t('Photos'))}</h2><div class="pics big">${e.photos.map((p) => `<a href="${esc(p)}"><img src="${esc(p)}" alt="${esc(e.title)}" loading="lazy" decoding="async" width="300" height="300"></a>`).join('')}</div>` : ''}
${e.album ? `<p><a class="btn gold" href="${esc(e.album)}" rel="noopener" target="_blank">${esc(t('See all the photos'))}</a></p>` : ''}
${e.rsvp && !past ? `<section id="rsvp" class="card rsvp" data-rsvp="${e.slug}" data-kids="${e.rsvp.kids === false ? 0 : 1}" data-title="${esc(e.title)}" data-when="${esc(X.when(e))}">
  <h2>${esc(t('RSVP'))}</h2>
  ${cap ? `<p class="muted">${esc(t('{left} of {cap} places left', { left: Math.max(cap - cnt, 0), cap }))}</p>` : cnt ? `<p class="muted">${esc(t('{n} people are coming', { n: cnt }))}</p>` : ''}
  <noscript><p>${esc(t('Please RSVP by email:'))} <a href="mailto:${esc(C.org.email || '')}?subject=${encodeURIComponent('RSVP: ' + e.title)}">${esc(C.org.email || '')}</a></p></noscript>
  <div class="rsvp-ui" hidden></div>
</section>` : ''}
<p class="btns"><a class="btn ghost" href="/events/${e.slug}.ics">${esc(t('Add to my calendar'))}</a>${past ? '' : `<a class="btn ghost" href="/events/${e.slug}/flyer" rel="nofollow">${esc(t('Print a flyer'))}</a>`}<a class="btn ghost" href="${esc(googleCalendarUrl(e, base))}" rel="noopener" target="_blank">${esc(t('Add to Google Calendar'))}</a><a class="btn ghost" href="https://wa.me/?text=${encodeURIComponent(t('Join me at {title}, {when}:', { title: e.title, when: X.when(e) }) + ' ' + base + X.path('/events/' + e.slug))}" rel="noopener" target="_blank">${esc(t('Invite a friend on WhatsApp'))}</a></p>
${prog ? `<p>${esc(t('Part of'))} <a href="/programs/${prog.slug}">${esc(prog.name)}</a>.</p>` : ''}${hol ? `<p>${esc(t('Learn more about'))} <a href="/holidays/${hol.slug}">${esc(hol.title)}</a>.</p>` : ''}
</article>`;
    await render(res, { path: '/events/' + e.slug, title: e.title, description: `${X.when(e)}. ${e.summary || plain(e.details || '')}`, image: e.image, body, ld: [eventLd(C, base, e), crumbs(base, [[t('Events'), '/events'], [e.title, '/events/' + e.slug]])] });
  }));

  // ---------- Shabbat ----------
  // What Shabbat with us feels like: always a seat at the Friday night table, services open to all, Kiddush with cholent.
  // Only this week's times here; the full list is on /shabbat-times and the calendar.
  r.get('/shabbat', wrap(async (req, res) => {
    const X = ctxOf(req), { t, C } = X, sh = await Z.thisShabbat(), rule = C.org.kabbalatShabbat || null, ks = rule && sh.candles ? Z.kabbalatFor(rule, sh.candles) : null;
    const body = `<section class="wrap sec narrow shabbat-page"><h1>${esc(t('Shabbat at Chabad of Lamorinda'))}</h1>
<p class="lead-d">${esc(t('Put the phone away, light the candles and let the week fall away. For 25 hours, from Friday before sunset until Saturday night, there is time for family, friends, good food and a little soul. At Chabad of Lamorinda you always have a place at the table.'))}</p>
${sh.candles ? `<div class="card this-shabbat"><p class="hand">${esc(t('This Shabbat'))}${sh.parsha ? ' · ' + esc(X.hc(sh.parsha)) : ''}</p>
<p>${esc(t('Candle lighting'))} <b>${esc(X.tm(sh.candles))}</b> · ${ks ? `${esc(t('Kabbalat Shabbat'))} <b>${esc(fmtClock(ks, X.lang))}</b> · ` : ''}${esc(t('Services'))} <b>${esc(t('Saturday 10 AM'))}</b>${sh.havdalah ? ` · ${esc(t('Shabbat ends'))} <b>${esc(X.tm(sh.havdalah))}</b>` : ''}</p>
<p class="btns"><a class="btn gold sm" href="/forms/shabbat-meal">${esc(t('Come for a Shabbat meal'))}</a></p>
<p class="muted"><a href="/shabbat-times">${esc(t('Shabbat times for the whole year'))}</a> · <a href="/calendar">${esc(t('Jewish calendar'))}</a></p></div>
<div class="card quick" data-shabbat-quick data-date="${sh.candles.date}" data-day="${esc(X.shortDate(sh.candles.date))}" hidden></div>` : ''}
${md(C.org.shabbatText || '')}
<p class="btns"><a class="btn gold" href="/forms/shabbat-meal">${esc(t('Come for a Shabbat meal'))}</a><a class="btn ghost" href="/learn/shabbat-for-beginners">${esc(t('New to Shabbat? Start here'))}</a></p>
</section>`;
    await render(res, { path: '/shabbat', title: t('Shabbat at Chabad of Lamorinda in Lafayette'), description: t('Friday night dinner with the Rabbi\'s family, Shabbat services open to all and a hot Kiddush with cholent at Chabad of Lamorinda in Lafayette, for Lafayette, Moraga and Orinda.'), body });
  }));

  // ---------- holidays ----------
  r.get('/holidays', wrap(async (req, res) => {
    const X = ctxOf(req), { t, C } = X, hols = await Z.upcomingHolidays(400), y = new Date().getFullYear();
    const body = `<section class="wrap sec narrow"><h1>${esc(t('Jewish holidays {years}', { years: y + '–' + (y + 1) }))}</h1>
<p class="lead-d">${esc(t('Dates, candle lighting times for Lamorinda, what each holiday is about, and how to celebrate with us.'))}</p>
<table class="tbl"><thead><tr><th>${esc(t('Holiday'))}</th><th>${esc(t('Begins'))}</th></tr></thead><tbody>
${hols.map((h) => { const p = C.holidays.find((x) => x.slug === h.slug); return `<tr><td><a href="/holidays/${h.slug}">${esc(p ? p.title : X.hc(h))}</a></td><td>${esc(X.longDate(h.date))}${h.time ? `<br><span class="muted">${esc(t('candle lighting {time}', { time: X.tm(h) }))}</span>` : ''}</td></tr>`; }).join('')}
</tbody></table></section>`;
    await render(res, { path: '/holidays', title: t('Jewish holiday dates and celebrations'), description: t('Dates of every Jewish holiday this year with candle lighting times for Lafayette, Moraga and Orinda, and holiday events at Chabad of Lamorinda.'), body });
  }));
  r.get('/holidays/:slug', wrap(async (req, res, next) => {
    const X = ctxOf(req), { t, C } = X, h = C.holidays.find((x) => x.slug === req.params.slug);
    if (!h) return next();
    const nextDate = await Z.nextDateOf(h.slug), evs = upcoming(new Date(), C).filter((e) => e.holiday === h.slug), cnt = await counts();
    const faqs = C.faq.filter((f) => f.holiday === h.slug);
    const times = await require('./yearly.js').holidayTimes(h.slug).catch(() => null), ZMAN = require('./yearly.js').ZMAN;
    const body = `<article class="wrap sec narrow">
<p class="crumbs"><a href="/holidays">${esc(t('Holidays'))}</a> ›</p>
<h1>${esc(h.title)}${h.hebrew && X.lang !== 'he' ? ` <span class="he" lang="he">${esc(h.hebrew)}</span>` : ''}</h1>
${nextDate ? `<p class="when">${esc(t('Next: {date}', { date: X.longDate(nextDate.date) }))} · <a href="/jewish-holidays-${nextDate.date.slice(0, 4)}">${esc(t('All holiday dates'))}</a></p>` : ''}
${evs.length ? `<h2>${esc(t('Celebrate with us'))}</h2><div class="evs">${evs.map((e) => eventCard(e, cnt, X)).join('')}</div>` : ''}
${(() => { const fm = (C.forms || []).filter((f) => f.holiday === h.slug || (h.slug === 'yom-kippur' && f.holiday === 'rosh-hashanah')); return fm.length ? `<p class="btns">${fm.map((f) => `<a class="btn gold" href="/forms/${f.id}">${esc(f.title)}</a>`).join('')}</p>` : ''; })()}
${md(h.body)}
${h.slug === 'chanukah' ? `<a class="card play-cta" href="/menorah"><span class="hand">${esc(t('Tap to light'))}</span><strong>${esc(t('Light the menorah'))}</strong><span>${esc(t('Tonight’s candles, the order and the blessings.'))}</span></a>` : ''}
${h.slug === 'chanukah' ? `<a class="card play-cta" href="/dreidel"><span class="hand">${esc(t('Play!'))}</span><strong>${esc(t('Spin the dreidel'))}</strong><span>${esc(t('Nun, Gimmel, Hei, Shin: try to win the pot.'))}</span></a>` : ''}
${times && times.rows.length ? `<h2>${esc(t('Times for {holiday} {year} in Lafayette', { holiday: h.title, year: times.year }))}</h2><div class="tbl-wrap"><table class="tbl"><tbody>${times.rows.filter((e) => h.slug !== 'chanukah' || /^Chanukah: \d/.test(e.desc)).map((e) => { const n = /^Chanukah: (\d)/.exec(e.desc); const wd = n ? new Date(e.date + 'T12:00:00').getDay() : -1, note = wd === 5 ? t('Friday: light before the Shabbat candles') : wd === 6 ? t('After Shabbat: Havdalah first, then the menorah') : '';
return `<tr><td>${esc(X.shortDate(e.date))}</td><td>${esc(n ? (n[1] === '1' ? t('Night 1: light 1 candle') : t('Night {n}: light {n} candles', { n: n[1] })) : e.cat === 'candles' ? t('Candle lighting') : e.cat === 'havdalah' ? t('Ends') : t(ZMAN[e.desc]))}${note ? `<br><a class="muted" href="/learn/chanukah-on-shabbat">${esc(note)}</a>` : ''}</td><td><strong>${esc(X.tm(e))}</strong></td></tr>`; }).join('')}</tbody></table></div><p class="btns"><a class="btn gold sm" href="/holidays/${h.slug}.ics" download>${esc(t('Add these times to my calendar'))}</a></p><p class="muted">${h.slug === 'purim' ? esc(t('The Fast of Esther is the day before Purim.')) + ' ' : ''}${esc(t('Times for other towns:'))} <a href="/shabbat-times">${esc(t('Shabbat times'))}</a> · <a href="/tools/zmanim">${esc(t('Daily prayer times (zmanim)'))}</a></p>` : ''}
${faqs.length ? `<h2>${esc(t('Questions'))}</h2>${faqHtml(faqs)}` : ''}
</article>`;
    await render(res, { path: '/holidays/' + h.slug, title: t('{holiday} in Lafayette, Moraga & Orinda', { holiday: h.title + (nextDate ? ' ' + nextDate.date.slice(0, 4) : '') }), description: h.description || h.text.slice(0, 160), body, ld: [crumbs(base, [[t('Holidays'), '/holidays'], [h.title, '/holidays/' + h.slug]]), ...(faqs.length ? [faqLd(faqs)] : []), ...evs.map((e) => eventLd(C, base, e))] });
  }));

  // ---------- programs ----------
  r.get('/programs', wrap(async (req, res) => {
    const X = ctxOf(req), { t, C } = X;
    const body = `<section class="wrap sec"><h1>${esc(t('Programs'))}</h1><p class="lead-d">${esc(t('Something for every age and stage, from toddlers to seniors.'))}</p>
<div class="grid">${C.programs.map((p) => `<a class="card tile" href="/programs/${p.slug}"><p class="eyebrow">${esc(p.audience || '')}</p><h3>${esc(p.name)}</h3><p>${esc(p.summary)}</p></a>`).join('')}</div></section>`;
    await render(res, { path: '/programs', title: t('Jewish programs for kids, teens and adults'), description: t("Hebrew school, adult classes, teen and kids programs, women's circle and more at Chabad of Lamorinda."), body });
  }));
  r.get('/programs/:slug', wrap(async (req, res, next) => {
    const X = ctxOf(req), { t, C } = X, p = C.programs.find((x) => x.slug === req.params.slug);
    if (!p) return next();
    const evs = upcoming(new Date(), C).filter((e) => e.program === p.slug), cnt = await counts();
    const body = `<article class="wrap sec narrow"><p class="crumbs"><a href="/programs">${esc(t('Programs'))}</a> ›</p>
<h1>${esc(p.name)}</h1>${p.audience ? `<p class="eyebrow">${esc(p.audience)}</p>` : ''}<p class="lead-d">${esc(p.summary)}</p>
${(() => { // how to join comes first: when it meets, the sign-up form and a way to ask, then the details
  const fm = (C.forms || []).filter((f) => f.program === p.slug), main = fm[0] ? { href: '/forms/' + fm[0].id, label: fm[0].button || t('Sign up') } : p.url ? { href: p.url, label: p.cta || t('Learn more') } : null;
  return `<div class="card action-top program-join">${p.schedule ? `<p><strong>${esc(t('When:'))}</strong> ${esc(p.schedule)}</p>` : ''}<p class="btns">${fm.map((f, i) => `<a class="btn ${i ? 'ghost' : 'gold'}" href="/forms/${f.id}">${esc(f.button || t('Sign up'))}${fm.length > 1 ? ': ' + esc(f.title) : ''}</a>`).join('')}${p.url && fm.length ? `<a class="btn ghost" href="${esc(p.url)}">${esc(p.cta || t('Learn more'))}</a>` : ''}${!fm.length && p.url ? `<a class="btn gold" href="${esc(p.url)}">${esc(p.cta || t('Learn more'))}</a>` : ''}<a class="btn ghost" href="/contact?about=${encodeURIComponent(p.name)}">${esc(t('Ask about {name}', { name: p.name }))}</a></p></div>
${md(p.details || '')}
${main ? `<p class="btns join-again"><a class="btn gold" href="${esc(main.href)}">${esc(main.label)}</a></p>` : ''}`; })()}
${evs.length ? `<h2>${esc(t('Coming up'))}</h2><div class="evs">${evs.map((e) => eventCard(e, cnt, X)).join('')}</div>` : ''}
</article>`;
    await render(res, { path: '/programs/' + p.slug, title: p.name, description: p.summary, body, ld: [crumbs(base, [[t('Programs'), '/programs'], [p.name, '/programs/' + p.slug]])] });
  }));

  // ---------- Everything Jewish in Lamorinda ----------
  r.get('/jewish-lamorinda', wrap(async (req, res) => {
    const X = ctxOf(req), { t, C } = X;
    const body = `<section class="wrap sec narrow"><h1>${esc(t('Everything Jewish in Lamorinda'))}</h1>
<p class="lead-d">${esc(t('Your guide to Jewish life in Lafayette, Moraga and Orinda: what you need, where to find it, and who to call.'))} <a href="/contact">${esc(t('Something missing? Tell us.'))}</a></p>
<nav class="chips">${C.directory.map((g) => `<a class="chip" href="#${g.id}">${esc(g.group)}</a>`).join('')}</nav>
${C.directory.map((g) => `<h2 id="${g.id}">${esc(g.group)}</h2><div class="dir">${g.items.map((i) => `<div class="card dir-i"><h3>${i.url ? `<a href="${esc(i.url)}">${esc(i.name)}</a>` : esc(i.name)}</h3>${md(i.text)}</div>`).join('')}</div>`).join('')}
</section>`;
    await render(res, { path: '/jewish-lamorinda', title: t('Everything Jewish in Lafayette, Moraga & Orinda'), description: t('The complete guide to Jewish life in Lamorinda: Shabbat, kosher food, mezuzahs, tefillin, Hebrew school, life events, yahrzeits, Jewish burial and more.'), body });
  }));

  // ---------- photos (from the Facebook page) ----------
  r.get('/photos', wrap(async (req, res) => {
    const X = ctxOf(req), { t, C } = X, pics = photos ? await photos(60).catch(() => []) : [];
    const fb = C.org.social && C.org.social.facebook;
    const body = `<section class="wrap sec"><h1>${esc(t('Photos'))}</h1><p class="lead-d">${esc(t('Moments from our community, straight from our Facebook page.'))}${fb ? ` <a href="${esc(fb)}" rel="noopener" target="_blank">${esc(t('Follow us'))}</a>` : ''}</p>
${pics.length ? `<div class="pics big">${pics.map((p) => `<a href="${esc(p.link)}" rel="noopener" target="_blank"><img src="${esc(p.src)}" alt="${esc(p.alt)}" loading="lazy" decoding="async" width="300" height="300"></a>`).join('')}</div>` : `<p class="muted">${esc(t('Photos will appear here once the Facebook page is connected.'))}</p>`}</section>`;
    await render(res, { path: '/photos', title: t('Photos'), description: t('Photos from Shabbat, holidays and community events at Chabad of Lamorinda.'), body });
  }));

  r.use('/assets', express.static(path.join(ROOT, 'site', 'assets'), { maxAge: '365d', immutable: true }));
  r.use('/media', express.static(path.join(ROOT, 'site', 'media'), { maxAge: '7d' }));
  app.use(r);

  // Simple Markdown pages (about, contact, privacy...). Mounted last by the site so specific pages win.
  const pagesRoute = wrap(async (req, res, next) => {
    const X = ctxOf(req), { t, C } = X, p = C.pages.find((x) => x.slug === req.params.slug);
    if (!p) return next();
    const faqs = p.slug === 'faq' ? C.faq : [];
    const body = `<article class="wrap sec narrow"><h1>${esc(p.title || p.slug)}</h1>${md(p.body)}${faqs.length ? faqHtml(faqs) : ''}${p.slug === 'contact' ? contactBlock(C, X) : ''}</article>`;
    await render(res, { path: '/' + p.slug, title: p.title || p.slug, description: p.description || p.text.slice(0, 160), body, ld: faqs.length ? [faqLd(faqs)] : [] });
  });
  return { render, upcoming, eventLd, eventCard, faqHtml, faqLd, crumbs, counts, setNews, pagesRoute, when: (e) => ctxOf({ lang: 'en' }).when(e) };
}

// Weekly classes and services as recurring events (schema.org EventSeries with a weekly schedule).
function seriesLd(C, base) {
  const o = C.org;
  return (o.weekly || []).filter((w) => w.byDay && w.startTime).map((w) => ({
    '@context': 'https://schema.org', '@type': 'EventSeries', name: w.name, url: base + (w.link || '/events'),
    location: { '@type': 'Place', name: o.name, address: fullAddress(o) }, organizer: { '@type': 'Organization', name: o.name, url: base + '/' },
    eventSchedule: { '@type': 'Schedule', byDay: 'https://schema.org/' + w.byDay, startTime: w.startTime, endTime: w.endTime || undefined, repeatFrequency: 'P1W', scheduleTimezone: 'America/Los_Angeles' },
    isAccessibleForFree: true,
  }));
}

function weeklyHtml(o, X) {
  if (!(o.weekly || []).length) return '';
  return `<h2>${esc(X.t('Every week'))}</h2><ul class="weekly">${o.weekly.map((w) => `<li><b>${esc(w.day)}</b><span>${w.link ? `<a href="${esc(w.link)}">${esc(w.name)}</a>` : esc(w.name)}<br><span class="muted">${esc(w.time)}</span></span></li>`).join('')}</ul>`;
}

function contactBlock(C, X) {
  const o = C.org, t = X.t;
  return `<div class="card"><p><strong>${esc(o.name)}</strong><br><bdi dir="ltr">${esc(fullAddress(o))}</bdi></p>
${o.phone ? `<p>${esc(t('Phone'))}: <a href="tel:${esc(o.phone.replace(/[^0-9+]/g, ''))}" dir="ltr">${esc(o.phone)}</a></p>` : ''}
${o.email ? `<p>${esc(t('Email'))}: <a href="mailto:${esc(o.email)}">${esc(o.email)}</a></p>` : ''}
<p><a class="btn ghost" href="https://maps.google.com/?q=${encodeURIComponent(fullAddress(o))}" rel="noopener" target="_blank">${esc(t('Directions'))}</a></p></div>
<h2 id="message">${esc(t('Send the Rabbi a message'))}</h2>
<form class="card tool" data-submit data-kind="rabbi">
  <p class="muted">${esc(t('Private and confidential: only the Rabbi reads it.'))}</p>
  <label>${esc(t('Subject'))} <input name="title" maxlength="120" required value="${esc(String((X.req && X.req.query && X.req.query.about) || ''))}"></label>
  <label>${esc(t('Your message'))} <textarea name="body" rows="6" maxlength="2000" required></textarea></label>
  <div class="fields"><label>${esc(t('Your name'))} <input name="name" autocomplete="name" required></label><label>${esc(t('Your email'))} <input name="email" type="email" autocomplete="email" required></label><label>${esc(t('Phone (optional)'))} <input name="phone" type="tel" autocomplete="tel" data-extra="Phone"></label></div>
  <button class="btn gold" type="submit">${esc(t('Send'))}</button><p class="msg" hidden></p>
</form>`;
}

module.exports = { mountPages, eventLd, parseLocal };
