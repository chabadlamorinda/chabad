// The public website pages, in English, Hebrew and Russian. Everything is rendered on the server from site/content/
// plus live data (Shabbat times, holidays, RSVP counts, Facebook photos), so every page is complete for Google and AI.
'use strict';
const express = require('express');
const path = require('path');
const { md, esc, plain } = require('./md.js');
const { layout } = require('./layout.js');
const { fullAddress } = require('./content.js');
const Z = require('./zmanim.js');
const { googleCalendarUrl } = require('./social.js');
const { parseLocal } = require('./ctx.js');

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
    const html = layout(X.C, { base, indexable, analytics, hebrewDate: hd, shabbat: sh, lang: X.lang, t: X.t, fmtDay: X.shortDate, tm: X.tm, ...opts });
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
    const mosaic = pics.slice(0, 6), strip = pics.slice(6, 14);
    const evs = upcoming(new Date(), C).slice(0, 4), nextHol = hols[0], holPage = nextHol && C.holidays.find((h) => h.slug === nextHol.slug);
    const help = C.help.slice(0, 6);
    const body = `
<section class="hero${mosaic.length ? ' photo' : ''}">
  ${mosaic.length ? `<div class="mosaic" aria-hidden="true">${mosaic.map((p) => `<img src="${esc(p.big || p.src)}" alt="" decoding="async">`).join('')}</div>` : ''}
  <div class="wrap hero-in">
    <div>
      <p class="eyebrow">${esc(t('Lafayette · Moraga · Orinda'))}</p>
      <h1>${esc(o.tagline)}</h1>
      <p class="lead">${esc(o.description)}</p>
      <p class="btns"><a class="btn gold" href="/events">${esc(t('See upcoming events'))}</a><a class="btn ghost-l" href="/account">${esc(t('Join our community'))}</a></p>
    </div>
    <aside class="card shabbat-card" aria-label="${esc(t('This Shabbat'))}">
      <p class="eyebrow">${esc(t('This Shabbat'))}${sh.parsha ? ' · ' + esc(X.hc(sh.parsha)) : ''}</p>
      ${sh.candles ? `<p class="big">${esc(X.tm(sh.candles))}</p><p>${esc(t('Candle lighting, {date}', { date: X.shortDate(sh.candles.date) }))}</p>` : ''}
      ${sh.havdalah ? `<p>${esc(t('Shabbat ends {time}, {date}', { time: X.tm(sh.havdalah), date: X.shortDate(sh.havdalah.date) }))}</p>` : ''}
      <p><a href="/shabbat">${esc(t('Services & Shabbat meals'))} →</a></p>
      <p><a href="/parsha">${esc(t("This week's Torah portion"))} →</a> · <a href="/tools/zmanim">${esc(t('Daily prayer times (zmanim)'))}</a></p>
    </aside>
  </div>
</section>
<section class="wrap sec">
  <div class="sec-h"><h2>${esc(t('Coming up'))}</h2><a href="/events">${esc(t('Full calendar'))} →</a></div>
  ${evs.length ? `<div class="evs">${evs.map((e) => eventCard(e, cnt, X)).join('')}</div>` : `<p class="muted">${esc(t('New events are posted here first.'))} <a href="/account">${esc(t('Sign in'))}</a></p>`}
${weeklyHtml(o, X)}
</section>
<section class="band help-band"><div class="wrap">
  <div class="sec-h"><h2>${esc(t("We're here for you"))}</h2><a href="/help">${esc(t('All life situations'))} →</a></div>
  <p>${esc(t('Illness, a loss, a new baby, a wedding, a hard time at home or at work: call the Rabbi first. We help with everything, from beginning to end.'))} <a href="tel:${esc(o.phone.replace(/[^0-9+]/g, ''))}" dir="ltr"><strong>${esc(o.phone)}</strong></a></p>
  <div class="chips">${help.map((h) => `<a class="chip${h.urgent === 'yes' ? ' urgent' : ''}" href="/help/${h.slug}">${esc(h.title)}</a>`).join('')}<a class="chip" href="/kaddish">${esc(t('Kaddish'))}</a><a class="chip" href="/tehillim">${esc(t('Tehillim for every occasion'))}</a></div>
</div></section>
${nextHol ? `<section class="wrap sec band-in"><div><p class="eyebrow">${esc(t('Next holiday'))}</p><h2>${esc(holPage ? holPage.title : X.hc(nextHol))}</h2><p>${esc(X.longDate(nextHol.date))}${nextHol.time ? ' · ' + esc(t('candle lighting {time}', { time: X.tm(nextHol) })) : ''}</p></div><a class="btn gold" href="/holidays/${nextHol.slug}">${esc(t('Celebrate with us'))}</a></section>` : ''}
<section class="wrap sec">
  <div class="sec-h"><h2>${esc(t('Programs for every age'))}</h2><a href="/programs">${esc(t('All programs'))} →</a></div>
  <div class="grid">${C.programs.slice(0, 8).map((p) => `<a class="card tile" href="/programs/${p.slug}"><h3>${esc(p.name)}</h3><p>${esc(p.summary)}</p></a>`).join('')}</div>
</section>
<section class="wrap sec">
  <div class="sec-h"><h2>${esc(t('Mark a yahrzeit, birthday or simcha'))}</h2><a href="/sponsor">${esc(t('Sponsor in honor or memory'))} →</a></div>
  <p>${esc(t('Sponsor a Kiddush, a Shabbat dinner or a class in honor or in memory of someone you love. Your dedication is shared with the community.'))}</p>
  <div class="chips">${(C.sponsor.occasions || []).map((x) => `<a class="chip" href="/sponsor?o=${x.id}">${esc(x.title)}</a>`).join('')}</div>
</section>
<section class="wrap sec">
  <div class="sec-h"><h2>${esc(t('Every day'))}</h2></div>
  <div class="grid">
    <a class="card tile" href="/tools/zmanim"><h3>${esc(t('Daily prayer times (zmanim)'))}</h3><p>${esc(t('Sunrise, latest Shema, Mincha and nightfall for your town.'))}</p></a>
    <a class="card tile" href="/daily-study"><h3>${esc(t("Today's daily study"))}</h3><p>${esc(t('Chumash, Tehillim, Tanya and Rambam for today.'))}</p></a>
    <a class="card tile" href="/parsha"><h3>${esc(t("This week's Torah portion"))}</h3><p>${esc(t('A short summary and a lesson for this week.'))}</p></a>
    <a class="card tile" href="/calendar"><h3>${esc(t('Jewish calendar'))}</h3><p>${esc(t('Holidays, Rosh Chodesh, fasts and Shabbat times, month by month.'))}</p></a>
    <a class="card tile" href="/ask"><h3>${esc(t('Ask the Rabbi'))}</h3><p>${esc(t('Real questions, answered by Rabbi Labkowski.'))}</p></a>
    <a class="card tile" href="/tools/hebrew-birthday"><h3>${esc(t('Hebrew birthday calculator'))}</h3><p>${esc(t('Find your Hebrew birthday and your Tehillim chapter.'))}</p></a>
  </div>
</section>
<section class="wrap sec">
  <div class="sec-h"><h2>${esc(t('Everything Jewish in Lamorinda'))}</h2><a href="/jewish-lamorinda">${esc(t('The full guide'))} →</a></div>
  <div class="chips">${C.directory.map((g) => `<a class="chip" href="/jewish-lamorinda#${g.id || ''}">${esc(g.group)}</a>`).join('')}<a class="chip" href="/tools/hebrew-date">${esc(t('Hebrew date converter'))}</a><a class="chip" href="/tools/yahrzeit">${esc(t('Yahrzeit calculator'))}</a><a class="chip" href="/tools/bar-bat-mitzvah">${esc(t('Bar & Bat Mitzvah date'))}</a></div>
</section>
${strip.length ? `<section class="wrap sec"><div class="sec-h"><h2>${esc(t('Moments from our community'))}</h2><a href="/photos">${esc(t('More photos'))} →</a></div><div class="pics">${strip.map((p) => `<a href="${esc(p.link)}" rel="noopener" target="_blank"><img src="${esc(p.src)}" alt="${esc(p.alt)}" loading="lazy" decoding="async" width="300" height="300"></a>`).join('')}</div></section>` : ''}
<section class="band"><div class="wrap"><div class="sec-h"><h2>${esc(t('Your Jewish home in your town'))}</h2><a href="/our-area">${esc(t('Our area'))} →</a></div>
  <p class="chips">${C.towns.map((x) => `<a class="chip" href="/jewish-${x.slug}">${esc(t('Jewish {town}', { town: x.name }))}</a>`).join('')}</p></div></section>
<section class="wrap sec">
  <div class="sec-h"><h2>${esc(t('Learn about Judaism'))}</h2><a href="/learn">${esc(t('All guides'))} →</a></div>
  <div class="grid">${['shabbat', 'kosher', 'mezuzah', 'bar-mitzvah', 'jewish-wedding', 'shiva', 'yahrzeit', 'tefillin'].map((s) => C.learn.find((a) => a.slug === s)).filter(Boolean).map((a) => `<a class="card tile" href="/learn/${a.slug}"><h3>${esc(a.title)}</h3><p>${esc(a.description)}</p></a>`).join('')}</div>
</section>
${posts.length ? `<section class="wrap sec"><div class="sec-h"><h2>${esc(t('Community news'))}</h2><a href="/community">${esc(t('Community board'))} →</a></div><div class="grid">${posts.map((i) => `<a class="card tile" href="/community"><p class="eyebrow">${esc(t(i.kind === 'mazal-tov' ? 'Mazal Tov' : i.kind === 'shiva' ? 'Condolences' : 'News'))}</p><h3>${esc(i.title)}</h3></a>`).join('')}</div></section>` : ''}
<section class="wrap sec join">
  <div class="card join-card">
    <h2>${esc(t('One sign-in for everything'))}</h2>
    <p>${esc(t('Save your family once: names, Hebrew names, birthdays and yahrzeits. Then RSVP to any event in one tap, get reminders for yahrzeits and Hebrew birthdays, and hear about what is coming up.'))}</p>
    <p class="btns"><a class="btn gold" href="/account">${esc(t('Create my free account'))}</a><a class="btn ghost" href="/get-involved">${esc(t('More ways to get involved'))}</a></p>
  </div>
</section>
<section class="wrap sec narrow">
  <h2>${esc(t('Questions people ask'))}</h2>
  ${faqHtml(C.faq.slice(0, 6))}
  <p><a href="/faq">${esc(t('All questions'))} →</a></p>
</section>`;
    await render(res, { path: '/', title: o.name, description: o.description, body, ld: [faqLd(C.faq.slice(0, 6)), { '@context': 'https://schema.org', '@type': 'WebSite', name: o.name, url: base + '/', inLanguage: X.lang }] });
  }));

  // ---------- events ----------
  r.get('/events', wrap(async (req, res) => {
    const X = ctxOf(req), { t, C } = X, evs = upcoming(new Date(), C), cnt = await counts();
    const c = String(req.query.c || ''), list = c ? evs.filter((e) => e.category === c) : evs;
    const cats = [...new Set(evs.map((e) => e.category).filter(Boolean))];
    const body = `<section class="wrap sec"><h1>${esc(t('Upcoming events'))}</h1>
<p class="lead-d">${esc(t('Shabbat dinners, holiday celebrations, classes and family programs in Lafayette, Moraga and Orinda. Everyone is welcome.'))}</p>
<p class="chips"><a class="chip${c ? '' : ' on'}" href="/events">${esc(t('All'))}</a>${cats.map((k) => `<a class="chip${k === c ? ' on' : ''}" href="/events?c=${k}">${esc(cat(X, k))}</a>`).join('')}<a class="chip" href="/calendar">${esc(t('Jewish calendar'))}</a><a class="chip" href="/events.ics">${esc(t('Add calendar to my phone'))}</a></p>
${list.length ? `<div class="evs">${list.map((e) => eventCard(e, cnt, X)).join('')}</div>` : `<p class="muted">${esc(t('No events in this list yet. Please check back soon.'))}</p>`}
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
<p class="when">${esc(X.when(e))}</p>
<p class="muted">${esc(e.loc.name)}${e.loc.address ? ' · ' + esc(e.loc.address) : ''} · <a href="https://maps.google.com/?q=${encodeURIComponent(e.loc.address || fullAddress(C.org))}" rel="noopener" target="_blank">${esc(t('Map'))}</a></p>
${e.image ? `<img class="hero-img" src="${esc(e.image)}" alt="${esc(e.title)}" decoding="async">` : ''}
${e.summary ? `<p class="lead-d">${esc(e.summary)}</p>` : ''}
${md(e.details || '')}
${e.price ? `<p><strong>${esc(t('Cost:'))}</strong> ${esc(e.price)}</p>` : ''}
${e.flyer ? `<p><a class="btn ghost" href="${esc(e.flyer)}">${esc(t('Download the flyer'))}</a></p>` : ''}
${e.rsvp && !past ? `<section id="rsvp" class="card rsvp" data-rsvp="${e.slug}" data-kids="${e.rsvp.kids === false ? 0 : 1}">
  <h2>${esc(t('RSVP'))}</h2>
  ${cap ? `<p class="muted">${esc(t('{left} of {cap} places left', { left: Math.max(cap - cnt, 0), cap }))}</p>` : cnt ? `<p class="muted">${esc(t('{n} people are coming', { n: cnt }))}</p>` : ''}
  <noscript><p>${esc(t('Please RSVP by email:'))} <a href="mailto:${esc(C.org.email || '')}?subject=${encodeURIComponent('RSVP: ' + e.title)}">${esc(C.org.email || '')}</a></p></noscript>
  <div class="rsvp-ui" hidden></div>
</section>` : ''}
<p class="btns"><a class="btn ghost" href="/events/${e.slug}.ics">${esc(t('Add to my calendar'))}</a><a class="btn ghost" href="${esc(googleCalendarUrl(e, base))}" rel="noopener" target="_blank">${esc(t('Add to Google Calendar'))}</a><a class="btn ghost" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(base + X.path('/events/' + e.slug))}" rel="noopener" target="_blank">${esc(t('Share on Facebook'))}</a><a class="btn ghost" href="https://wa.me/?text=${encodeURIComponent(e.title + ' ' + base + X.path('/events/' + e.slug))}" rel="noopener" target="_blank">${esc(t('Share on WhatsApp'))}</a></p>
${prog ? `<p>${esc(t('Part of'))} <a href="/programs/${prog.slug}">${esc(prog.name)}</a>.</p>` : ''}${hol ? `<p>${esc(t('Learn more about'))} <a href="/holidays/${hol.slug}">${esc(hol.title)}</a>.</p>` : ''}
</article>`;
    await render(res, { path: '/events/' + e.slug, title: e.title, description: `${X.when(e)}. ${e.summary || plain(e.details || '')}`, image: e.image, body, ld: [eventLd(C, base, e), crumbs(base, [[t('Events'), '/events'], [e.title, '/events/' + e.slug]])] });
  }));

  // ---------- Shabbat ----------
  r.get('/shabbat', wrap(async (req, res) => {
    const X = ctxOf(req), { t, C } = X, today = Z.todayLocal(), end = new Date(today); end.setDate(end.getDate() + 70);
    const list = await Z.events(today, end), weeks = [];
    for (const e of list) {
      if (e.cat === 'candles') weeks.push({ candles: e });
      else if (weeks.length && e.cat === 'parashat') weeks[weeks.length - 1].parsha = e;
      else if (weeks.length && e.cat === 'havdalah' && !weeks[weeks.length - 1].havdalah) weeks[weeks.length - 1].havdalah = e;
    }
    const svc = C.org.services || [];
    const body = `<section class="wrap sec narrow"><h1>${esc(t('Shabbat in Lamorinda'))}</h1>
<p class="lead-d">${esc(t('Shabbat is a gift: 25 hours to slow down, connect and recharge. Join us for services, a warm Kiddush and Shabbat dinners. No membership needed, no Hebrew needed.'))}</p>
${svc.length ? `<h2>${esc(t('Services'))}</h2><ul class="list">${svc.map((s) => `<li><strong>${esc(s.name)}</strong> ${esc(s.time)}${s.note ? ` <span class="muted">· ${esc(s.note)}</span>` : ''}</li>`).join('')}</ul>` : ''}
<h2>${esc(t('Candle lighting times for Lafayette, Moraga and Orinda'))}</h2>
<table class="tbl"><thead><tr><th>${esc(t('Shabbat'))}</th><th>${esc(t('Candle lighting'))}</th><th>${esc(t('Shabbat ends'))}</th></tr></thead><tbody>
${weeks.map((w) => `<tr><td>${w.parsha ? esc(X.hc(w.parsha)) : ''}<br><span class="muted">${esc(X.shortDate(w.candles.date))}</span></td><td>${esc(X.tm(w.candles))}</td><td>${w.havdalah ? esc(X.tm(w.havdalah)) : ''}</td></tr>`).join('')}
</tbody></table>
<p class="muted">${esc(t('Candle lighting is 18 minutes before sunset. Shabbat ends at nightfall.'))} <a href="/holidays">${esc(t('Holiday times'))}</a></p>
${md(C.org.shabbatText || '')}
<p class="btns"><a class="btn gold" href="/events?c=shabbat">${esc(t('Shabbat dinners and events'))}</a><a class="btn ghost" href="/contact">${esc(t('Host or be hosted for a meal'))}</a></p>
</section>`;
    await render(res, { path: '/shabbat', title: t('Shabbat times and services in Lafayette'), description: t('Shabbat candle lighting times for Lafayette, Moraga and Orinda, Shabbat services, Kiddush and Shabbat dinners at Chabad of Lamorinda.'), body });
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
    const body = `<article class="wrap sec narrow">
<p class="crumbs"><a href="/holidays">${esc(t('Holidays'))}</a> ›</p>
<h1>${esc(h.title)}${h.hebrew && X.lang !== 'he' ? ` <span class="he" lang="he">${esc(h.hebrew)}</span>` : ''}</h1>
${nextDate ? `<p class="when">${esc(t('Next: {date}', { date: X.longDate(nextDate.date) }))}</p>` : ''}
${evs.length ? `<h2>${esc(t('Celebrate with us'))}</h2><div class="evs">${evs.map((e) => eventCard(e, cnt, X)).join('')}</div>` : ''}
${(() => { const fm = (C.forms || []).filter((f) => f.holiday === h.slug || (h.slug === 'yom-kippur' && f.holiday === 'rosh-hashanah')); return fm.length ? `<p class="btns">${fm.map((f) => `<a class="btn gold" href="/forms/${f.id}">${esc(f.title)}</a>`).join('')}</p>` : ''; })()}
${md(h.body)}
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
${p.schedule ? `<p><strong>${esc(t('When:'))}</strong> ${esc(p.schedule)}</p>` : ''}
${md(p.details || '')}
${(() => { const fm = (C.forms || []).filter((f) => f.program === p.slug); return `<p class="btns">${fm.map((f) => `<a class="btn gold" href="/forms/${f.id}">${esc(f.button || t('Sign up'))}: ${esc(f.title)}</a>`).join('')}${p.url ? `<a class="btn ${fm.length ? 'ghost' : 'gold'}" href="${esc(p.url)}">${esc(p.cta || t('Learn more'))}</a>` : ''}<a class="btn ghost" href="/contact?about=${encodeURIComponent(p.name)}">${esc(t('Ask about {name}', { name: p.name }))}</a></p>`; })()}
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
  return `<div class="card"><p><strong>${esc(o.name)}</strong><br>${esc(fullAddress(o))}</p>
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
