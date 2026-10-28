// The home page: large banners for the big events and the next holiday (then the standing banners in home.json),
// smaller banners for other events and the programs people see every week, what Chabad of Lamorinda has built,
// ways to get involved, photos from Facebook, and a few things to try. Words live in site/content/home.json.
'use strict';
const { esc } = require('./md.js');
const { artFor, artImg } = require('./art.js');
const { fmtClock } = require('./content.js');

const THEMES = new Set(['navy', 'blue', 'green', 'gold', 'burgundy']);
const themeOf = (x, fallback = 'navy') => (THEMES.has(x) ? x : fallback);
const CAT_THEME = { holiday: 'gold', shabbat: 'navy', kids: 'green', family: 'green', teens: 'green', women: 'burgundy', men: 'blue', class: 'blue', community: 'navy', seniors: 'burgundy' };
const picture = (e) => e.image || (e.flyer && /\.(jpe?g|png|webp)$/i.test(e.flyer) ? e.flyer : '');

// A program's name and summary fill in a banner or tile that points at it.
function fromProgram(C, x) {
  const p = x.program && C.programs.find((y) => y.slug === x.program);
  return { ...x, title: x.title || (p && p.name) || '', text: x.text || (p && p.summary) || '', url: x.url || (p ? '/programs/' + p.slug : '/') };
}

function banner(b, i) {
  const img = b.image ? `<img class="bn-img" src="${esc(b.image)}" alt="" ${i ? 'loading="lazy" ' : 'fetchpriority="high" '}decoding="async">` : '';
  return `<article class="bn theme-${themeOf(b.theme)}${img ? ' has-img' : ''}" aria-roledescription="slide" aria-label="${esc(b.title)}">${img}
<div class="bn-in">${b.eyebrow ? `<p class="bn-eyebrow">${esc(b.eyebrow)}</p>` : ''}<h2>${esc(b.title)}</h2>${b.text ? `<p class="bn-text">${esc(b.text)}</p>` : ''}
<p class="btns">${b.url ? `<a class="btn gold" href="${esc(b.url)}">${esc(b.button || 'More')}</a>` : ''}${b.url2 ? `<a class="btn ghost-l" href="${esc(b.url2)}">${esc(b.button2)}</a>` : ''}</p></div>
${!img && b.art ? `<div class="bn-art" aria-hidden="true">${artImg(b.art, 'lg')}</div>` : ''}</article>`;
}

function tile(x) {
  return `<a class="sb theme-${themeOf(x.theme, 'blue')}" href="${esc(x.url)}">${x.image ? `<img class="sb-img" src="${esc(x.image)}" alt="" loading="lazy" decoding="async">` : `<span class="sb-art" aria-hidden="true">${artImg(x.art || 'star-of-david')}</span>`}
<span class="sb-t">${x.eyebrow ? `<span class="sb-eyebrow">${esc(x.eyebrow)}</span>` : ''}<strong>${esc(x.title)}</strong>${x.text ? `<span>${esc(x.text)}</span>` : ''}</span></a>`;
}

function homeBody(X, { sh, ks, hols, evs, cnt, pics, posts, holPage, today }) {
  const { t, C } = X, o = C.org, H = C.home || {};
  // Large banners: featured events and holiday events coming in the next two months, then the next holiday, then home.json.
  const soon = (e) => (e.start.slice(0, 10) <= new Date(Date.parse(today + 'T12:00:00Z') + 60 * 864e5).toISOString().slice(0, 10));
  const big = evs.filter((e) => (e.featured || e.category === 'holiday') && soon(e)).slice(0, 3);
  const evBanner = (e) => ({ title: e.title, text: e.summary, eyebrow: X.when(e), url: '/events/' + e.slug + (e.rsvp ? '#rsvp' : ''), button: e.rsvp ? t('RSVP') : t('Details'),
    url2: e.rsvp ? '/events/' + e.slug : '', button2: t('Details'), image: picture(e), art: artFor('event', e.slug, e.holiday || e.category), theme: CAT_THEME[e.category] || 'blue' });
  const slides = big.map(evBanner);
  const nh = hols[0], days = nh ? Math.round((Date.parse(nh.date + 'T12:00:00Z') - Date.parse(today + 'T12:00:00Z')) / 864e5) : 99;
  if (nh && days <= 45 && !big.some((e) => e.holiday === nh.slug)) {
    slides.push({ eyebrow: t('Next holiday') + (days > 1 ? ' · ' + t('in {n} days', { n: days }) : ''), title: holPage ? holPage.title : X.hc(nh), text: X.longDate(nh.date) + (nh.time ? ' · ' + t('candle lighting {time}', { time: X.tm(nh) }) : ''),
      url: '/holidays/' + nh.slug, button: t('Celebrate with us'), art: artFor('holiday', nh.slug), theme: 'gold' });
  }
  for (const b of H.banners || []) slides.push(fromProgram(C, b));
  // Smaller banners: the other events coming up, then the programs people see every week.
  const small = evs.filter((e) => !big.includes(e)).slice(0, 4).map((e) => ({ title: e.title, eyebrow: X.when(e), url: '/events/' + e.slug, image: picture(e), art: artFor('event', e.slug, e.holiday || e.category), theme: CAT_THEME[e.category] || 'blue' }))
    .concat((H.tiles || []).map((x) => fromProgram(C, x))).slice(0, 8);
  const stats = (H.stats || []).filter((s) => s.number && s.label);
  const involved = [
    ['challah', 'Come for a Shabbat meal', 'Join the Rabbi\'s family for Friday night dinner, or we will match you with a host.', '/forms/shabbat-meal'],
    ['open-book', 'Join a class', 'Torah, Tanya and Hebrew classes every week, for every level.', '/programs/adult-education'],
    ['hands-heart', 'Volunteer', 'Cook, drive, set up, visit: lend a hand at events and for families in need.', '/forms/volunteer'],
    ['envelope', 'Get the weekly email', 'Shabbat times, events and a short Torah thought, once a week.', '/forms/newsletter'],
    ['coin', 'Join the Chai Club', 'Become a monthly partner and carry Jewish life in Lamorinda.', '/chai-club'],
    ['sparkles', 'Do a mitzvah this week', 'Pick one good deed and join the community count.', '/mitzvah'],
  ];
  const phone = o.phone.replace(/[^0-9+]/g, '');
  return `<h1 class="sr-only">${esc(o.name)}: ${esc(o.tagline)}</h1>
<section class="hero-banners" aria-roledescription="carousel" aria-label="${esc(t('Featured'))}">
  <div class="bn-track" data-carousel tabindex="0">${slides.map(banner).join('')}</div>
  ${slides.length > 1 ? `<div class="bn-nav"><button type="button" class="bn-prev" aria-label="${esc(t('Previous'))}">‹</button><div class="bn-dots" role="tablist">${slides.map((s, i) => `<button type="button" role="tab" aria-label="${esc(s.title)}"${i ? '' : ' aria-selected="true"'}></button>`).join('')}</div><button type="button" class="bn-next" aria-label="${esc(t('Next'))}">›</button></div>` : ''}
</section>
<section class="shabbat-strip" aria-label="${esc(t('Shabbat at Chabad'))}"><div class="wrap">
  <span class="ss-h">${artImg('shabbat-candles')}<strong>${esc(t('This Shabbat'))}</strong>${sh.parsha ? `<span class="muted">${esc(X.hc(sh.parsha))}</span>` : ''}</span>
  ${sh.candles ? `<span><small>${esc(t('Candle lighting'))}</small><b>${esc(X.tm(sh.candles))}</b></span>` : ''}
  ${ks ? `<span><small>${esc(t('Kabbalat Shabbat'))}</small><b>${esc(fmtClock(ks, X.lang))}</b></span>` : ''}
  <span><small>${esc(t('Services'))}</small><b>${esc(t('Saturday 10 AM'))}</b></span>
  ${sh.havdalah ? `<span><small>${esc(t('Shabbat ends'))}</small><b>${esc(X.tm(sh.havdalah))}</b></span>` : ''}
  <a class="btn sm ghost" href="/shabbat">${esc(t('Shabbat at Chabad'))} →</a>
  <div class="quick" data-shabbat-quick data-date="${sh.candles ? sh.candles.date : ''}" data-day="${sh.candles ? esc(X.shortDate(sh.candles.date)) : ''}" hidden></div>
</div></section>
<section class="wrap sec" data-for-you hidden></section>
<section class="wrap sec">
  <div class="sec-h"><h2>${esc(t('Coming up and every week'))}</h2><a href="/events">${esc(t('Full calendar'))} →</a></div>
  <div class="sbs">${small.map(tile).join('')}</div>
  ${(o.weekly || []).length ? `<ul class="week-strip">${o.weekly.map((w) => `<li><a href="${esc(w.link || '/events')}"><b>${esc(w.day)}</b> ${esc(w.name)} <span class="muted">${esc(w.time)}</span></a></li>`).join('')}</ul>` : ''}
</section>
<section class="band built"><div class="wrap">
  <div class="sec-h"><h2>${esc(t('What we have built together'))}</h2><a href="/about">${esc(t('About us'))} →</a></div>
  <p class="lead-d">${esc(t('Rabbi Yisroel and Rebbetzin Tzipora Labkowski, emissaries of the Lubavitcher Rebbe, and a community that keeps growing. Thank you to everyone who makes it happen.'))}</p>
  ${stats.length ? `<div class="stats">${stats.map((s) => `<div class="stat"><b>${esc(s.number)}</b><span>${esc(s.label)}</span></div>`).join('')}</div>` : ''}
  <div class="hl">${(H.highlights || []).map((h) => `<a class="hl-i" href="${esc(h.url || '/about')}">${artImg(h.art || 'star-of-david')}<strong>${esc(h.title)}</strong><span>${esc(h.text)}</span></a>`).join('')}
    <a class="hl-i" href="/learn">${artImg('open-book')}<strong>${esc(t('{n} guides to Jewish life', { n: C.learn.length }))}</strong><span>${esc(t('Free, friendly answers in English, Hebrew and Russian, from Shabbat candles to Kaddish.'))}</span></a></div>
</div></section>
<section class="wrap sec">
  <div class="sec-h"><h2>${esc(t('Get involved'))}</h2><a href="/get-involved">${esc(t('More ways'))} →</a></div>
  <div class="gi">${involved.map(([a, h, p, u]) => `<a class="gi-i" href="${u}">${artImg(a)}<strong>${esc(t(h))}</strong><span>${esc(t(p))}</span></a>`).join('')}</div>
</section>
<section class="wrap sec photos-sec">
  <div class="sec-h"><h2>${esc(t('Moments from our community'))}</h2>${pics.length ? `<a href="/photos">${esc(t('More photos'))} →</a>` : ''}</div>
  ${pics.length ? `<div class="pics">${pics.slice(0, 8).map((p) => `<a href="${esc(p.link)}" rel="noopener" target="_blank"><img src="${esc(p.src)}" alt="${esc(p.alt)}" loading="lazy" decoding="async" width="300" height="300"></a>`).join('')}</div>` : ''}
  ${o.social && o.social.facebook ? `<p class="follow"><a class="btn ghost" href="${esc(o.social.facebook)}" rel="noopener" target="_blank">${esc(t('Follow us on Facebook'))}</a>${o.social.instagram ? ` <a class="btn ghost" href="${esc(o.social.instagram)}" rel="noopener" target="_blank">${esc(t('Follow us on Instagram'))}</a>` : ''}</p>` : ''}
</section>
<section class="band help-band"><div class="wrap here">
  <div><h2>${esc(t("We're here for you"))}</h2><p>${esc(t('Illness, a loss, a new baby, a wedding, a hard time at home or at work: call the Rabbi first. We help with everything, from beginning to end.'))}</p></div>
  <p class="btns"><a class="btn gold" href="tel:${esc(phone)}" dir="ltr">${esc(t('Call {phone}', { phone: o.phone }))}</a><a class="btn ghost" href="/help">${esc(t('All life situations'))}</a></p>
</div></section>
<section class="wrap sec">
  <div class="sec-h"><h2>${esc(t('Try this'))}</h2></div>
  <div class="try">
    <a href="/tools/hebrew-birthday">${artImg('gift')}<span>${esc(t('Find your Hebrew birthday'))}</span></a>
    <a href="/shabbat-times">${artImg('candle-flame')}<span>${esc(t('Shabbat times for your town'))}</span></a>
    <a href="/parsha">${artImg('torah-scroll')}<span>${esc(t("This week's Torah portion"))}</span></a>
    <a href="/jewish-holidays-${today.slice(0, 4)}">${artImg('calendar')}<span>${esc(t('Jewish holidays this year'))}</span></a>
    <button type="button" data-chat-open>${artImg('chat-bubble')}<span>${esc(t('Ask us anything'))}</span></button>
    <a href="/learn">${artImg('open-book')}<span>${esc(t('Learn about Judaism'))}</span></a>
  </div>
</section>
${posts.length ? `<section class="wrap sec"><div class="sec-h"><h2>${esc(t('Community news'))}</h2><a href="/community">${esc(t('Community board'))} →</a></div><div class="grid">${posts.map((i) => `<a class="card tile" href="/community"><p class="eyebrow">${esc(t(i.kind === 'mazal-tov' ? 'Mazal Tov' : i.kind === 'shiva' ? 'Condolences' : 'News'))}</p><h3>${esc(i.title)}</h3></a>`).join('')}</div></section>` : ''}`;
}
module.exports = { homeBody, fromProgram };
