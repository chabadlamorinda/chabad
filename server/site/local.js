// Local and learning pages:
//  * a page for each town we serve (/jewish-lafayette, /jewish-moraga, ...) with that town's own Shabbat times,
//    distance, neighborhoods and local questions, so people searching in their own town find us;
//  * /learn: guides to every Jewish topic, each tied back to how we help locally.
'use strict';
const { md, esc, plain } = require('./md.js');
const { fullAddress, LEARN_CATEGORIES } = require('./content.js');
const Z = require('./zmanim.js');

const townPath = (t) => '/jewish-' + t.slug;
const shortDate = (ymd) => new Date(ymd + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });

function townFaq(C, t, sh) {
  const o = C.org, far = t.tier === 'home' ? (t.slug === 'lafayette' ? 'right here in Lafayette' : `in neighboring Lafayette, about ${t.miles} miles away`) : `in Lafayette, about ${t.miles} miles away`;
  const svc = (o.services || []).find((s) => /Shabbat morning/i.test(s.name));
  return [
    { q: `Is there a synagogue in ${t.name}?`, a: `${o.name} is the Chabad synagogue serving ${t.name}, ${far} at ${fullAddress(o)}. Everyone is welcome and no membership is required.` },
    { q: `Where are Shabbat services near ${t.name}?`, a: `At ${o.name}${svc ? `: ${svc.time}, followed by a hot Kiddush lunch` : ''}. Friday night Kabbalat Shabbat and weekday morning minyan too. See [Shabbat times](/shabbat).` },
    sh && sh.candles ? { q: `When is candle lighting in ${t.name} this week?`, a: `This Friday, ${shortDate(sh.candles.date)}, light Shabbat candles in ${t.name} at ${sh.candles.timeStr}.${sh.havdalah ? ` Shabbat ends at ${sh.havdalah.timeStr} on ${shortDate(sh.havdalah.date)}.` : ''}` } : null,
    { q: `Is there a Hebrew school for kids in ${t.name}?`, a: `[Lamorinda Hebrew School](/programs/hebrew-school) meets Sundays 10 AM to 12 PM in Lafayette for ages 3 to 13. It is open to all, no synagogue membership required, and no child is turned away for lack of funds.` },
    { q: `Is there a Jewish preschool near ${t.name}?`, a: `[Lamorinda Jewish Preschool](/programs/jewish-preschool) in Lafayette serves children from 12 months to 4 years.` },
    { q: `Where can I get kosher food in ${t.name}?`, a: `Order kosher meat, poultry, groceries and Judaica online from [Bay Kosher](https://baykosher.com), a project of ${o.name}. Ask us about delivery to ${t.name}.` },
    { q: `Where can I find High Holiday services near ${t.name}?`, a: `${o.name} holds Rosh Hashanah and Yom Kippur services every year, open to all with no tickets or membership. See [Rosh Hashanah](/holidays/rosh-hashanah) and [Yom Kippur](/holidays/yom-kippur).` },
    { q: `Can a rabbi help with a bar mitzvah, wedding or funeral in ${t.name}?`, a: `Yes. Rabbi Yisroel Labkowski helps families in ${t.name} with every life event: a bris or baby naming, bar and bat mitzvah, weddings, and funerals. Call ${o.phone}.` },
  ].filter(Boolean);
}

function mountLocal(r, { content, base, render, upcoming, eventCard, faqHtml, faqLd, crumbs, counts, wrap }) {
  const c = () => content();

  r.get('/our-area', wrap(async (req, res) => {
    const C = c(), home = C.towns.filter((t) => t.tier === 'home'), near = C.towns.filter((t) => t.tier === 'near');
    const li = (t) => `<a class="card tile" href="${townPath(t)}"><h3>Jewish ${esc(t.name)}</h3><p>${t.miles ? `${t.miles} miles from us` : 'Our home town'}</p></a>`;
    await render(res, { path: '/our-area', title: 'Jewish life in Lafayette, Moraga, Orinda and nearby', description: 'Synagogue, Shabbat services, Hebrew school, preschool, kosher food and Jewish holidays for Lafayette, Moraga, Orinda, Walnut Creek, Pleasant Hill, Martinez and nearby towns.',
      body: `<section class="wrap sec"><h1>Our area</h1><p class="lead-d">Chabad of Lamorinda is the Jewish home for Lafayette, Moraga and Orinda, and welcomes Jews from all the nearby towns of Contra Costa County.</p>
<h2>Lamorinda</h2><div class="grid">${home.map(li).join('')}</div><h2>Nearby</h2><div class="grid">${near.map(li).join('')}</div></section>` });
  }));

  r.get('/jewish-:town', wrap(async (req, res, next) => {
    const C = c(), t = C.towns.find((x) => x.slug === req.params.town);
    if (!t) return next();
    const o = C.org, [sh, cnt] = await Promise.all([Z.thisShabbat(new Date(), { lat: t.lat, lng: t.lng, name: t.name + ', CA' }), counts()]);
    const evs = upcoming().slice(0, 4), faqs = townFaq(C, t, sh), others = C.towns.filter((x) => x.slug !== t.slug);
    const body = `<section class="hero town"><div class="wrap hero-in"><div>
  <p class="eyebrow">${t.tier === 'home' ? 'Lamorinda' : 'Contra Costa County'} · ${t.miles ? `${t.miles} miles from us` : 'Our home town'}</p>
  <h1>Jewish ${esc(t.name)}</h1>
  <p class="lead">${esc(t.intro)}</p>
  <p class="btns"><a class="btn gold" href="/events">Upcoming events</a><a class="btn ghost-l" href="https://maps.google.com/?saddr=${encodeURIComponent(t.name + ', CA')}&daddr=${encodeURIComponent(fullAddress(o))}" rel="noopener" target="_blank">Directions from ${esc(t.name)}</a></p></div>
  <aside class="card shabbat-card"><p class="eyebrow">Shabbat in ${esc(t.name)}</p>${sh.candles ? `<p class="big">${esc(sh.candles.timeStr)}</p><p>Candle lighting, ${esc(shortDate(sh.candles.date))}</p>` : ''}${sh.havdalah ? `<p>Shabbat ends ${esc(sh.havdalah.timeStr)}</p>` : ''}<p><a href="/shabbat">Services &amp; Shabbat dinners →</a></p></aside>
</div></section>
<section class="wrap sec narrow">
  ${t.places && t.places.length ? `<p>We welcome Jewish families from every part of ${esc(t.name)}: ${esc(t.places.join(', '))}.</p>` : ''}
  ${t.local ? `<p>${esc(t.local)}</p>` : ''}${t.schools ? `<p>${esc(t.schools)}</p>` : ''}
  <h2>For ${esc(t.name)} families</h2>
  <ul class="list">
    <li><a href="/shabbat">Shabbat services</a> and a hot Kiddush lunch every Saturday, plus Shabbat dinners with the Rabbi's family</li>
    <li><a href="/programs/jewish-preschool">Lamorinda Jewish Preschool</a> (12 months to 4 years) and <a href="/programs/summer-camp">summer camp</a></li>
    <li><a href="/programs/hebrew-school">Lamorinda Hebrew School</a> on Sundays and <a href="/programs/ckids-afterschool">CKids afterschool</a></li>
    <li><a href="/programs/adult-education">Torah classes</a>, the <a href="/programs/womens-circle">Jewish Women's Circle</a> and the <a href="/programs/mens-club">Men's Club</a></li>
    <li><a href="/holidays">Holiday celebrations</a> all year, and help with every <a href="/jewish-lamorinda#life-events">life event</a></li>
  </ul>
</section>
<section class="wrap sec"><div class="sec-h"><h2>Coming up</h2><a href="/events">Full calendar →</a></div>${evs.length ? `<div class="evs">${evs.map((e) => eventCard(e, cnt)).join('')}</div>` : '<p class="muted">New events are posted here first.</p>'}</section>
<section class="wrap sec narrow"><h2>Questions from ${esc(t.name)}</h2>${faqHtml(faqs)}
<p class="muted">Also serving: ${others.map((x) => `<a href="${townPath(x)}">${esc(x.name)}</a>`).join(' · ')}</p></section>`;
    await render(res, { path: townPath(t), title: `Jewish ${t.name}, CA: synagogue, Shabbat, Hebrew school & more`, description: `Jewish life in ${t.name}, CA: Shabbat services, candle lighting times, Hebrew school, preschool, kosher food and holidays at Chabad of Lamorinda${t.miles ? `, ${t.miles} miles away` : ''}.`, body,
      ld: [faqLd(faqs), crumbs(base, [['Our area', '/our-area'], ['Jewish ' + t.name, townPath(t)]]), { '@context': 'https://schema.org', '@type': 'Place', name: t.name + ', California', geo: { '@type': 'GeoCoordinates', latitude: t.lat, longitude: t.lng } }] });
  }));

  r.get('/learn', wrap(async (req, res) => {
    const C = c();
    const groups = LEARN_CATEGORIES.map((cat) => [cat, C.learn.filter((a) => a.category === cat)]).filter(([, l]) => l.length);
    await render(res, { path: '/learn', title: 'Learn about Judaism: guides to every Jewish topic', description: 'Plain-English guides to Shabbat, kosher, mezuzah, tefillin, prayer, life events, mourning, the Jewish calendar, Torah and Jewish ideas, from Chabad of Lamorinda.',
      body: `<section class="wrap sec"><h1>Learn about Judaism</h1><p class="lead-d">Clear, friendly guides to Jewish life, from lighting Shabbat candles to saying Kaddish. Have a question that is not here? <a href="/contact">Ask the Rabbi</a>.</p>
<p class="chips">${groups.map(([cat]) => `<a class="chip" href="#${cat.toLowerCase().replace(/[^a-z]+/g, '-')}">${esc(cat)}</a>`).join('')}<a class="chip" href="/holidays">Holidays</a></p>
${groups.map(([cat, list]) => `<h2 id="${cat.toLowerCase().replace(/[^a-z]+/g, '-')}">${esc(cat)}</h2><div class="grid">${list.map((a) => `<a class="card tile" href="/learn/${a.slug}"><h3>${esc(a.title)}</h3><p>${esc(a.description)}</p></a>`).join('')}</div>`).join('')}</section>`,
      ld: [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Learn about Judaism', url: base + '/learn', hasPart: C.learn.map((a) => ({ '@type': 'Article', headline: a.title, url: base + '/learn/' + a.slug })) }] });
  }));

  r.get('/learn/:slug', wrap(async (req, res, next) => {
    const C = c(), a = C.learn.find((x) => x.slug === req.params.slug);
    if (!a) return next();
    const rel = a.related.map((s) => C.learn.find((x) => x.slug === s)).filter(Boolean);
    const body = `<article class="wrap sec narrow learn">
<p class="crumbs"><a href="/learn">Learn</a> › ${esc(a.category)}</p>
<h1>${esc(a.title)}</h1>
${md(a.body)}
${a.local ? `<aside class="card local"><p class="eyebrow">In Lamorinda</p><p>${esc(a.local)}</p><p class="btns"><a class="btn gold" href="/contact">Contact the Rabbi</a><a class="btn ghost" href="/events">Upcoming events</a></p></aside>` : ''}
${a.faq.length ? `<h2>Common questions</h2>${faqHtml(a.faq)}` : ''}
${rel.length ? `<h2>Keep learning</h2><div class="grid">${rel.map((x) => `<a class="card tile" href="/learn/${x.slug}"><h3>${esc(x.title)}</h3><p>${esc(x.description)}</p></a>`).join('')}</div>` : ''}
<aside class="card support"><p>These guides are free for everyone, thanks to our partners. <a href="/donate">Become a partner</a> or <a href="/programs/chai-club">join the Chai Club</a> to keep Jewish learning open to all.</p></aside>
</article>`;
    await render(res, { path: '/learn/' + a.slug, title: a.title, description: a.description, body,
      ld: [{ '@context': 'https://schema.org', '@type': 'Article', headline: a.title, description: a.description, articleBody: plain(a.body).slice(0, 5000), author: { '@type': 'Organization', name: C.org.name, url: base + '/' }, publisher: { '@id': base + '/#org' }, mainEntityOfPage: base + '/learn/' + a.slug, image: base + '/assets/og.png', inLanguage: 'en-US' },
        crumbs(base, [['Learn', '/learn'], [a.title, '/learn/' + a.slug]]), ...(a.faq.length ? [faqLd(a.faq)] : [])] });
  }));
}
module.exports = { mountLocal, townPath, townFaq };
