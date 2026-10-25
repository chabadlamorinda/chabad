// Local and learning pages (in every language):
//  * a page for each town we serve (/jewish-lafayette, /jewish-moraga, ...) with that town's own Shabbat times,
//    distance, neighborhoods and local questions, so people searching in their own town find us;
//  * /learn: guides to every Jewish topic, each tied back to how we help locally.
'use strict';
const { md, esc, plain } = require('./md.js');
const { fullAddress, LEARN_CATEGORIES } = require('./content.js');
const Z = require('./zmanim.js');

const townPath = (t) => '/jewish-' + t.slug;

function townFaq(X, t, sh) {
  const { C } = X, tr = X.t, o = C.org, v = { town: t.name, miles: t.miles, address: fullAddress(o), org: o.name, phone: o.phone };
  const svc = (o.services || [])[2];
  return [
    { q: tr('Is there a synagogue in {town}?', v), a: t.slug === 'lafayette' ? tr('{org} is the Chabad synagogue right here in Lafayette, at {address}. Everyone is welcome and no membership is required.', v) : tr('{org} is the Chabad synagogue serving {town}, about {miles} miles away at {address}. Everyone is welcome and no membership is required.', v) },
    { q: tr('Where are Shabbat services near {town}?', v), a: tr('At {org}: {time}, followed by a hot Kiddush lunch. Friday night Kabbalat Shabbat and weekday morning minyan too. See [Shabbat times](/shabbat).', { ...v, time: svc ? svc.time : '' }) },
    sh && sh.candles ? { q: tr('When is candle lighting in {town} this week?', v), a: tr('This Friday, {date}, light Shabbat candles in {town} at {time}.', { ...v, date: X.shortDate(sh.candles.date), time: X.tm(sh.candles) }) + (sh.havdalah ? ' ' + tr('Shabbat ends at {time}.', { time: X.tm(sh.havdalah) }) : '') } : null,
    { q: tr('Is there a Hebrew school for kids in {town}?', v), a: tr('[Lamorinda Hebrew School](/programs/hebrew-school) meets Sundays 10 AM to 12 PM in Lafayette for ages 3 to 13. It is open to all, no synagogue membership required, and no child is turned away for lack of funds.', v) },
    { q: tr('Is there a Jewish preschool near {town}?', v), a: tr('[Lamorinda Jewish Preschool](/programs/jewish-preschool) in Lafayette serves children from 12 months to 4 years.', v) },
    { q: tr('Where can I get kosher food in {town}?', v), a: tr('Order kosher meat, poultry, groceries and Judaica online from [Bay Kosher](https://baykosher.com), a project of {org}. Ask us about delivery to {town}.', v) },
    { q: tr('Where can I find High Holiday services near {town}?', v), a: tr('{org} holds Rosh Hashanah and Yom Kippur services every year, open to all with no tickets or membership. See [Rosh Hashanah](/holidays/rosh-hashanah) and [Yom Kippur](/holidays/yom-kippur).', v) },
    { q: tr('Who do I call when someone passes away in {town}?', v), a: tr('Call Rabbi Yisroel Labkowski at {phone} first. We guide the family through everything: the Chevra Kadisha, a Jewish burial, the funeral, shiva and Kaddish. See [when a loved one passes away](/help/someone-passed-away).', v) },
    { q: tr('Can a rabbi help with a bar mitzvah, wedding or funeral in {town}?', v), a: tr('Yes. Rabbi Yisroel Labkowski helps families in {town} with every life event: a bris or baby naming, bar and bat mitzvah, weddings, and funerals. Call {phone}.', v) },
  ].filter(Boolean);
}

function mountLocal(r, { base, render, upcoming, eventCard, faqHtml, faqLd, crumbs, counts, wrap, ctxOf }) {
  r.get('/our-area', wrap(async (req, res) => {
    const X = ctxOf(req), { t, C } = X, home = C.towns.filter((x) => x.tier === 'home'), near = C.towns.filter((x) => x.tier === 'near');
    const li = (x) => `<a class="card tile" href="${townPath(x)}"><h3>${esc(t('Jewish {town}', { town: x.name }))}</h3><p>${esc(x.miles ? t('{miles} miles from us', { miles: x.miles }) : t('Our home town'))}</p></a>`;
    await render(res, { path: '/our-area', title: t('Jewish life in Lafayette, Moraga, Orinda and nearby'), description: t('Synagogue, Shabbat services, Hebrew school, preschool, kosher food and Jewish holidays for Lafayette, Moraga, Orinda, Walnut Creek, Pleasant Hill, Martinez and nearby towns.'),
      body: `<section class="wrap sec"><h1>${esc(t('Our area'))}</h1><p class="lead-d">${esc(t('Chabad of Lamorinda is the Jewish home for Lafayette, Moraga and Orinda, and welcomes Jews from all the nearby towns of Contra Costa County.'))}</p>
<h2>${esc(t('Lamorinda'))}</h2><div class="grid">${home.map(li).join('')}</div><h2>${esc(t('Nearby'))}</h2><div class="grid">${near.map(li).join('')}</div></section>` });
  }));

  r.get('/jewish-:town', wrap(async (req, res, next) => {
    const X = ctxOf(req), { t: tr, C } = X, t = C.towns.find((x) => x.slug === req.params.town);
    if (!t) return next();
    const o = C.org, [sh, cnt] = await Promise.all([Z.thisShabbat(new Date(), { lat: t.lat, lng: t.lng, name: t.slug }), counts()]);
    const evs = upcoming(new Date(), C).slice(0, 4), faqs = townFaq(X, t, sh), others = C.towns.filter((x) => x.slug !== t.slug), v = { town: t.name };
    const body = `<section class="hero town"><div class="wrap hero-in"><div>
  <p class="eyebrow">${esc(t.tier === 'home' ? tr('Lamorinda') : tr('Contra Costa County'))} · ${esc(t.miles ? tr('{miles} miles from us', { miles: t.miles }) : tr('Our home town'))}</p>
  <h1>${esc(tr('Jewish {town}', v))}</h1>
  <p class="lead">${esc(t.intro)}</p>
  <p class="btns"><a class="btn gold" href="/events">${esc(tr('Upcoming events'))}</a><a class="btn ghost-l" href="https://maps.google.com/?saddr=${encodeURIComponent((t.name_en || t.slug) + ', CA')}&daddr=${encodeURIComponent(fullAddress(o))}" rel="noopener" target="_blank">${esc(tr('Directions from {town}', v))}</a></p></div>
  <aside class="card shabbat-card"><p class="eyebrow">${esc(tr('Shabbat in {town}', v))}</p>${sh.candles ? `<p class="big">${esc(X.tm(sh.candles))}</p><p>${esc(tr('Candle lighting, {date}', { date: X.shortDate(sh.candles.date) }))}</p>` : ''}${sh.havdalah ? `<p>${esc(tr('Shabbat ends {time}, {date}', { time: X.tm(sh.havdalah), date: X.shortDate(sh.havdalah.date) }))}</p>` : ''}<p><a href="/shabbat">${esc(tr('Services & Shabbat meals'))} →</a></p></aside>
</div></section>
<section class="wrap sec narrow">
  ${t.places && t.places.length ? `<p>${esc(tr('We welcome Jewish families from every part of {town}:', v))} ${esc(t.places.join(', '))}.</p>` : ''}
  ${t.local ? `<p>${esc(t.local)}</p>` : ''}${t.schools ? `<p>${esc(t.schools)}</p>` : ''}
  <h2>${esc(tr('For {town} families', v))}</h2>
  <ul class="list">
    <li><a href="/shabbat">${esc(tr('Shabbat services'))}</a> · ${esc(tr('a hot Kiddush lunch every Saturday, and Shabbat dinners with the Rabbi\'s family'))}</li>
    <li><a href="/programs/jewish-preschool">${esc(tr('Lamorinda Jewish Preschool'))}</a> · <a href="/programs/summer-camp">${esc(tr('Summer camp'))}</a></li>
    <li><a href="/programs/hebrew-school">${esc(tr('Lamorinda Hebrew School'))}</a> · <a href="/programs/ckids-afterschool">${esc(tr('CKids afterschool'))}</a></li>
    <li><a href="/programs/adult-education">${esc(tr('Torah classes'))}</a> · <a href="/programs/womens-circle">${esc(tr("Jewish Women's Circle"))}</a> · <a href="/programs/mens-club">${esc(tr("Men's Club"))}</a></li>
    <li><a href="/holidays">${esc(tr('Holiday celebrations'))}</a> · <a href="/help">${esc(tr('Help with every life event'))}</a> · <a href="/kaddish">${esc(tr('Kaddish'))}</a></li>
  </ul>
</section>
<section class="wrap sec"><div class="sec-h"><h2>${esc(tr('Coming up'))}</h2><a href="/events">${esc(tr('Full calendar'))} →</a></div>${evs.length ? `<div class="evs">${evs.map((e) => eventCard(e, cnt, X)).join('')}</div>` : `<p class="muted">${esc(tr('New events are posted here first.'))}</p>`}</section>
<section class="wrap sec narrow"><h2>${esc(tr('Questions from {town}', v))}</h2>${faqHtml(faqs)}
<p class="muted">${esc(tr('Also serving:'))} ${others.map((x) => `<a href="${townPath(x)}">${esc(x.name)}</a>`).join(' · ')}</p></section>`;
    await render(res, { path: townPath(t), title: tr('Jewish {town}, CA: synagogue, Shabbat, Hebrew school & more', v), description: tr('Jewish life in {town}, CA: Shabbat services, candle lighting times, Hebrew school, preschool, kosher food and holidays at Chabad of Lamorinda.', v), body,
      ld: [faqLd(faqs), crumbs(base, [[tr('Our area'), '/our-area'], [tr('Jewish {town}', v), townPath(t)]]), { '@context': 'https://schema.org', '@type': 'Place', name: (t.name_en || t.name) + ', California', geo: { '@type': 'GeoCoordinates', latitude: t.lat, longitude: t.lng } }] });
  }));

  r.get('/learn', wrap(async (req, res) => {
    const X = ctxOf(req), { t, C } = X;
    const id = (cat) => cat.toLowerCase().replace(/[^a-z]+/g, '-');
    const groups = LEARN_CATEGORIES.map((cat) => [cat, C.learn.filter((a) => a.category === cat)]).filter(([, l]) => l.length);
    await render(res, { path: '/learn', title: t('Learn about Judaism: guides to every Jewish topic'), description: t('Plain-language guides to Shabbat, kosher, mezuzah, tefillin, prayer, life events, mourning, the Jewish calendar, Torah and Jewish ideas, from Chabad of Lamorinda.'),
      body: `<section class="wrap sec"><h1>${esc(t('Learn about Judaism'))}</h1><p class="lead-d">${esc(t('Clear, friendly guides to Jewish life, from lighting Shabbat candles to saying Kaddish.'))} <a href="/help/talk-to-the-rabbi">${esc(t('Have a question that is not here? Ask the Rabbi.'))}</a></p>
<p class="chips">${groups.map(([cat]) => `<a class="chip" href="#${id(cat)}">${esc(t(cat))}</a>`).join('')}<a class="chip" href="/holidays">${esc(t('Holidays'))}</a><a class="chip" href="/tehillim">${esc(t('Tehillim'))}</a></p>
${groups.map(([cat, list]) => `<h2 id="${id(cat)}">${esc(t(cat))}</h2><div class="grid">${list.map((a) => `<a class="card tile" href="/learn/${a.slug}"><h3>${esc(a.title)}</h3><p>${esc(a.description)}</p></a>`).join('')}</div>`).join('')}</section>`,
      ld: [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: t('Learn about Judaism'), url: base + X.path('/learn'), inLanguage: X.lang, hasPart: C.learn.map((a) => ({ '@type': 'Article', headline: a.title, url: base + X.path('/learn/' + a.slug) })) }] });
  }));

  // Guides connected to an occasion get a "mark it" box (sponsor / Tehillim / Kaddish).
  const OCCASION = { yahrzeit: 'yahrzeit', yizkor: 'yahrzeit', kaddish: 'yahrzeit', shiva: 'yahrzeit', unveiling: 'yahrzeit', 'jewish-funeral': 'yahrzeit', 'brit-milah': 'new-baby', 'baby-naming': 'new-baby', 'bar-mitzvah': 'bar-bat-mitzvah', 'bat-mitzvah': 'bar-bat-mitzvah', 'jewish-wedding': 'anniversary', tehillim: 'refuah', tzedakah: 'honor' };
  r.get('/learn/:slug', wrap(async (req, res, next) => {
    const X = ctxOf(req), { t, C } = X, a = C.learn.find((x) => x.slug === req.params.slug);
    if (!a) return next();
    const rel = a.related.map((s) => C.learn.find((x) => x.slug === s)).filter(Boolean), occ = OCCASION[a.slug];
    const body = `<article class="wrap sec narrow learn">
<p class="crumbs"><a href="/learn">${esc(t('Learn'))}</a> › ${esc(t(a.category))}</p>
<h1>${esc(a.title)}</h1>
${md(a.body)}
${a.local ? `<aside class="card local"><p class="eyebrow">${esc(t('In Lamorinda'))}</p><p>${esc(a.local)}</p><p class="btns"><a class="btn gold" href="/help/talk-to-the-rabbi">${esc(t('Contact the Rabbi'))}</a><a class="btn ghost" href="/events">${esc(t('Upcoming events'))}</a></p></aside>` : ''}
${occ ? `<aside class="card occasion"><p>${esc(t('Mark the occasion: sponsor a Kiddush or give in their honor'))}</p><p class="btns"><a class="btn gold" href="/sponsor?o=${occ}">${esc(t('Sponsor in honor or memory'))}</a><a class="btn ghost" href="/tehillim">${esc(t('Tehillim for this'))}</a>${occ === 'yahrzeit' ? `<a class="btn ghost" href="/kaddish">${esc(t('Kaddish'))}</a>` : ''}</p></aside>` : ''}
${a.faq.length ? `<h2>${esc(t('Common questions'))}</h2>${faqHtml(a.faq)}` : ''}
${rel.length ? `<h2>${esc(t('Keep learning'))}</h2><div class="grid">${rel.map((x) => `<a class="card tile" href="/learn/${x.slug}"><h3>${esc(x.title)}</h3><p>${esc(x.description)}</p></a>`).join('')}</div>` : ''}
<aside class="card support"><p>${esc(t('These guides are free for everyone, thanks to our partners.'))} <a href="/donate">${esc(t('Become a partner'))}</a> · <a href="/programs/chai-club">${esc(t('Join the Chai Club'))}</a></p></aside>
</article>`;
    await render(res, { path: '/learn/' + a.slug, title: a.title, description: a.description, body,
      ld: [{ '@context': 'https://schema.org', '@type': 'Article', headline: a.title, description: a.description, articleBody: plain(a.body).slice(0, 5000), inLanguage: X.lang, author: { '@type': 'Organization', name: C.org.name, url: base + '/' }, publisher: { '@id': base + '/#org' }, mainEntityOfPage: base + X.path('/learn/' + a.slug), image: base + '/assets/og.png' },
        crumbs(base, [[t('Learn'), '/learn'], [a.title, '/learn/' + a.slug]]), ...(a.faq.length ? [faqLd(a.faq)] : [])] });
  }));
}
module.exports = { mountLocal, townPath, townFaq };
