// Server-rendered pages in English and Hebrew (fast, crawlable, good for Google): home, departments, products,
// sale, search, store info, plus sitemap.xml, robots.txt and structured data. Hebrew lives under /he/ with hreflang links.
'use strict';
const { esc, money, slugify, httpErr } = require('./core');
const { t: tr } = require('./i18n');

const DAYS = [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']];
const t12 = (t, lang) => { const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; };
const jsonLd = (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;

function createPages({ core, settings, db, publicUrl = '' }) {
  const abs = (p) => publicUrl + p;

  async function layout(req, { title, description, body, canonical, path, ld = [], image, noindex }) {
    const lang = req.lang, t = (k, v) => tr(lang, k, v), pre = lang === 'he' ? '/he' : '';
    const s = await settings.all();
    const cats = (await core.categories(lang)).filter((c) => !c.parent_id && c.product_count > 0);
    const other = lang === 'he' ? '' : '/he';
    const here = path || req.path || '/';
    const alt = canonical && !noindex ? `<link rel="alternate" hreflang="en" href="${esc(abs(canonical.replace(/^\/he/, '') || '/'))}"><link rel="alternate" hreflang="he" href="${esc(abs('/he' + (canonical.replace(/^\/he/, '') === '/' ? '' : canonical.replace(/^\/he/, ''))))}"><link rel="alternate" hreflang="x-default" href="${esc(abs(canonical.replace(/^\/he/, '') || '/'))}">` : '';
    const switchTo = other + (here === '/' ? '' : here) || '/';
    const nm = lang === 'he' ? 'בייקושר' : s.store.name;
    return `<!doctype html><html lang="${lang}" dir="${lang === 'he' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}">
${canonical ? `<link rel="canonical" href="${esc(abs(canonical))}">` : ''}${alt}${noindex ? '<meta name="robots" content="noindex">' : ''}
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:type" content="website"><meta property="og:locale" content="${lang === 'he' ? 'he_IL' : 'en_US'}">${image ? `<meta property="og:image" content="${esc(image)}">` : ''}
<meta name="theme-color" content="#00209f"><link rel="manifest" href="/manifest.webmanifest"><link rel="stylesheet" href="/static/app.css">${ld.map(jsonLd).join('')}</head><body>
<header class="top"><div class="wrap bar"><a class="logo" href="${pre || '/'}" aria-label="${esc(nm)}"><b>BAY</b><span>KOSHER</span><small>Chabad of Lamorinda</small></a>
<form class="search" action="${pre}/search" role="search" autocomplete="off"><input name="q" id="q" type="search" placeholder="${esc(t('What can we help you find?'))}" aria-label="${esc(t('Search products'))}" value="${esc(req.query.q || '')}"><button aria-label="${esc(t('Search'))}">&#128269;</button><div id="suggest" class="suggest" hidden></div></form>
<a class="btn small langsw" href="${switchTo}" hreflang="${lang === 'he' ? 'en' : 'he'}" data-setlang="${lang === 'he' ? 'en' : 'he'}">${lang === 'he' ? 'English' : 'עברית'}</a>
<a class="btn small" id="acct" href="${pre}/account">${esc(t('Sign in'))}</a><a class="cartbtn" href="${pre}/cart" aria-label="${esc(t('Cart'))}">&#128722;<span id="cartcount" hidden>0</span></a></div>
<nav class="wrap nav"><a href="#" id="deptbtn">&#9776; ${esc(t('Departments'))}</a><a href="${pre}/sale">${esc(t('Specials'))}</a><a href="${pre}/account#buyagain">${esc(t('Buy again'))}</a><a href="${pre}/store">${esc(t('Store & hours'))}</a></nav>
<div id="dept" class="dept" hidden><div class="wrap">${cats.map((c) => `<a href="${pre}/c/${esc(c.slug)}">${c.image_url ? `<img src="${esc(c.image_url)}" alt="" loading="lazy">` : ''}<span>${esc(c.name)}</span></a>`).join('')}</div></div></header>
<main class="wrap">${body}</main>
<footer><div class="wrap foot"><div><b>${esc(nm)}</b><br>${esc(s.store.address)}<br><a href="tel:${esc(s.store.phone.replace(/[^\d+]/g, ''))}" dir="ltr">${esc(s.store.phone)}</a><br>${esc(s.store.email)}</div>
<div><b>${esc(t('Hours'))}</b><br>${DAYS.map(([k, n]) => `${esc(t(n))}: <span dir="ltr">${s.hours[k] ? t12(s.hours[k][0]) + ' - ' + t12(s.hours[k][1]) : esc(t('Closed'))}</span>`).join('<br>')}</div>
<form id="subform"><b>${esc(t('Weekly specials by email'))}</b><br><input type="email" name="email" placeholder="you@example.com" required aria-label="Email" dir="ltr"> <button class="btn small">${esc(t('Join'))}</button><div id="submsg" role="status"></div></form></div></footer>
<script src="/static/i18n.js" defer></script><script src="/static/app.js" defer></script></body></html>`;
  }

  // one product card; pack-weight meat shows the pack price and the per-lb price
  const card = (p, lang) => {
    const t = (k, v) => tr(lang, k, v), pre = lang === 'he' ? '/he' : '';
    const href = `${pre}/p/${p.id}-${esc(p.slug)}`;
    const per = p.est_weight_lb ? `<small>/ ${esc(t('pack'))} &middot; <span dir="ltr">${money(p.price_cents)}/${esc(t('lb'))}</span></small>` : p.sold_by === 'lb' ? `<small>/ ${esc(t('lb'))}</small>` : '';
    const main = p.est_weight_lb ? p.pack_price_cents : p.price_cents;
    return `<article class="card${p.stock_status === 'out' ? ' out' : ''}" data-id="${p.id}">
<a href="${href}" class="img">${p.percent_off ? `<span class="badge">${p.percent_off}% ${esc(t('OFF'))}</span>` : ''}<img src="${esc(p.image_url || '/static/noimage.svg')}" alt="${esc(p.name)}" loading="lazy" width="200" height="200"></a>
<a href="${href}" class="nm">${esc(p.name)}</a><div class="sz">${esc(p.size)}${p.est_weight_lb ? ` ${esc(t('about {w} lb per pack', { w: p.est_weight_lb }))}` : ''}</div>
<div class="pr">${p.was_cents ? `<b class="sale">${money(main)}</b> <s>${money(Math.round(p.was_cents * (p.est_weight_lb || 1)))}</s>` : `<b>${money(main)}</b>`} ${per}</div>
${p.stock_status === 'low' ? `<div class="warn">${esc(t('Low stock'))}${p.stock != null ? ` (${esc(t('{n} left', { n: p.stock }))})` : ''}</div>` : ''}
${p.stock_status === 'out' ? `<div class="warn">${esc(t('Out of stock'))}</div><button class="btn add" disabled>${esc(t('Unavailable'))}</button>` : `<button class="btn add" data-add="${p.id}" data-by="${p.sold_by}" data-pack="${p.est_weight_lb ? 1 : 0}" data-name="${esc(p.name)}">${esc(t(p.sold_by === 'lb' && !p.est_weight_lb ? 'Add (1 lb)' : 'Add'))}</button>`}</article>`;
  };
  const grid = (items, lang) => items.length ? `<div class="grid">${items.map((p) => card(p, lang)).join('')}</div>` : `<p class="empty">${esc(tr(lang, 'Nothing here yet.'))}</p>`;
  const crumbs = (list) => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: list.map(([name, url], i) => ({ '@type': 'ListItem', position: i + 1, name, item: abs(url) })) });

  async function storeLd(lang) {
    const s = await settings.all();
    const spec = DAYS.filter(([k]) => s.hours[k]).map(([k, n]) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: n, opens: s.hours[k][0], closes: s.hours[k][1] }));
    return { '@context': 'https://schema.org', '@type': 'GroceryStore', name: s.store.name, alternateName: 'בייקושר', url: abs(lang === 'he' ? '/he' : '/'), telephone: s.store.phone, email: s.store.email, priceRange: '$$', servesCuisine: 'Kosher', inLanguage: lang,
      address: { '@type': 'PostalAddress', streetAddress: '3477 Golden Gate Way', addressLocality: 'Lafayette', addressRegion: 'CA', postalCode: '94549', addressCountry: 'US' },
      geo: { '@type': 'GeoCoordinates', latitude: s.store.lat, longitude: s.store.lng }, openingHoursSpecification: spec,
      areaServed: ['Lafayette', 'Orinda', 'Moraga', 'Walnut Creek', 'Danville', 'San Ramon', 'Oakland', 'Berkeley', 'San Francisco', 'Bay Area'].map((n) => ({ '@type': 'City', name: n })) };
  }

  const pages = {
    async home(req) {
      const lang = req.lang, t = (k, v) => tr(lang, k, v), pre = lang === 'he' ? '/he' : '';
      const cats = (await core.categories(lang)).filter((c) => !c.parent_id && c.product_count > 0);
      const sale = (await core.listProducts({ sale: true, sort: 'discount', limit: 12, inStockOnly: true, lang })).items;
      let featured = (await core.listProducts({ featured: true, limit: 12, lang, inStockOnly: true })).items;
      if (!featured.length) {
        const feat = (await db.rows(`SELECT id FROM products WHERE active AND image_url <> '' AND (NOT track_stock OR stock > 0) ORDER BY (SELECT count(*) FROM order_items oi WHERE oi.product_id = products.id) DESC, id DESC LIMIT 12`)).map((r) => r.id);
        featured = feat.length ? (await core.listProducts({ ids: feat, lang })).items : [];
      }
      const banners = await db.rows(`SELECT * FROM banners WHERE active AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at >= now()) ORDER BY sort, id`);
      const dBan = banners.filter((b) => b.device !== 'mobile'), mBan = banners.filter((b) => b.device === 'mobile');
      const slide = (b, cls) => `<a class="slide ${cls}" href="${esc(b.link || '#')}"><img src="${esc(b.image_url)}" alt="${esc(lang === 'he' && b.alt_he ? b.alt_he : b.alt)}"></a>`;
      const hero = banners.length ? `<div class="slider">${dBan.map((b) => slide(b, 'dsk')).join('')}${mBan.map((b) => slide(b, 'mob')).join('')}</div>` : '';
      const body = `${hero}<section class="hero"><h1>${esc(t('Kosher groceries in Lafayette, delivered or ready for pickup across the Bay Area'))}</h1><p>${esc(t('Glatt kosher meat, dairy, deli, Judaica, baked goods and Israeli favorites. Order online and pick up in about 3 hours, or get it delivered.'))}</p><a class="btn" href="${pre}/c/${esc(cats[0] ? cats[0].slug : '')}">${esc(t('Start shopping'))}</a></section>
<h2>${esc(t('Shop by department'))}</h2><div class="depts">${cats.map((c) => `<a href="${pre}/c/${esc(c.slug)}">${c.image_url ? `<img src="${esc(c.image_url)}" alt="" loading="lazy">` : ''}<span>${esc(c.name)}</span></a>`).join('')}</div>
${sale.length ? `<h2>${esc(t("This week's specials"))}</h2>${grid(sale, lang)}<p><a href="${pre}/sale">${esc(t('See all specials'))}</a></p>` : ''}${featured.length ? `<h2>${esc(t('Featured products'))}</h2>${grid(featured, lang)}` : ''}
<section class="seo"><h2>${esc(t("The Bay Area's online kosher grocery"))}</h2><p>${esc(t('Bay Kosher, run by Chabad of Lamorinda, serves families in Lafayette, Orinda, Moraga, Walnut Creek, Danville, San Ramon, Oakland, Berkeley and San Francisco with kosher meat, chicken, dairy, frozen foods, baked goods, Judaica, baby food and more.'))}</p></section>`;
      return layout(req, { title: t('Bay Kosher | Kosher Grocery Store in Lafayette, CA | Online Ordering, Pickup & Delivery'), description: t('Order kosher groceries online from Bay Kosher in Lafayette, CA: kosher meat, dairy, frozen, baked goods and Judaica. Pickup in about 3 hours or delivery across the Bay Area.'), body, canonical: pre || '/', path: '/', ld: [await storeLd(lang), { '@context': 'https://schema.org', '@type': 'WebSite', name: 'Bay Kosher', url: abs(pre || '/'), inLanguage: lang, potentialAction: { '@type': 'SearchAction', target: abs(pre + '/search?q={q}'), 'query-input': 'required name=q' } }] });
    },
    async category(req) {
      const lang = req.lang, t = (k, v) => tr(lang, k, v), pre = lang === 'he' ? '/he' : '';
      const all = await core.categories(lang);
      const cat = all.find((c) => c.slug === req.params.slug);
      if (!cat) throw httpErr(404, t('Department not found'));
      const sort = ['price_asc', 'price_desc', 'discount'].includes(req.query.sort) ? req.query.sort : '';
      const subs = all.filter((c) => c.parent_id === cat.id);
      const { items } = await core.listProducts({ category: cat.slug, limit: 100, sort, lang });
      const body = `<nav class="crumbs"><a href="${pre || '/'}">${esc(t('Home'))}</a> / ${esc(cat.name)}</nav><h1>${esc(t('Kosher {name}', { name: cat.name }))}</h1>${subs.length ? `<div class="chips">${subs.map((c) => `<a href="${pre}/c/${esc(c.slug)}">${esc(c.name)}</a>`).join('')}</div>` : ''}
<form class="sortbar"><label>${esc(t('Sort'))} <select name="sort" data-autosubmit><option value="">${esc(t('Featured'))}</option><option value="price_asc"${sort === 'price_asc' ? ' selected' : ''}>${esc(t('Price: low to high'))}</option><option value="price_desc"${sort === 'price_desc' ? ' selected' : ''}>${esc(t('Price: high to low'))}</option><option value="discount"${sort === 'discount' ? ' selected' : ''}>${esc(t('Biggest discount'))}</option></select></label></form>${grid(items, lang)}`;
      return layout(req, { title: t('Kosher {name} | Buy Online in the Bay Area | Bay Kosher', { name: cat.name }), description: t('Shop kosher {name} online at Bay Kosher in Lafayette, CA. Pickup or delivery across the Bay Area.', { name: cat.name }), body, canonical: `${pre}/c/${cat.slug}`, path: `/c/${cat.slug}`, ld: [crumbs([[t('Home'), pre || '/'], [cat.name, `${pre}/c/${cat.slug}`]]), { '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: items.slice(0, 30).map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: abs(`${pre}/p/${p.id}-${p.slug}`), name: p.name })) }] });
    },
    async product(req) {
      const lang = req.lang, t = (k, v) => tr(lang, k, v), pre = lang === 'he' ? '/he' : '';
      const id = parseInt(req.params.idslug, 10);
      const p = await core.getProduct(id, lang);
      if (!p) throw httpErr(404, t('Product not found'));
      const sim = await core.similar(id, 8, lang), tog = await core.boughtTogether(id, 6, lang);
      const n = p.nutrition || {};
      const nutRows = [['Serving', n.serving], ['Calories', n.calories], ['Total fat', n.fat_g != null ? n.fat_g + ' g' : null], ['Saturated fat', n.sat_fat_g != null ? n.sat_fat_g + ' g' : null], ['Sodium', n.sodium_mg != null ? n.sodium_mg + ' mg' : null], ['Carbohydrates', n.carbs_g != null ? n.carbs_g + ' g' : null], ['Sugars', n.sugars_g != null ? n.sugars_g + ' g' : null], ['Fiber', n.fiber_g != null ? n.fiber_g + ' g' : null], ['Protein', n.protein_g != null ? n.protein_g + ' g' : null]].filter(([, v]) => v != null && v !== '');
      const avail = p.stock_status === 'out' ? 'https://schema.org/OutOfStock' : p.stock_status === 'low' ? 'https://schema.org/LimitedAvailability' : 'https://schema.org/InStock';
      const url = `${pre}/p/${p.id}-${p.slug}`;
      const pack = p.est_weight_lb;
      const priceHtml = p.was_cents ? `<b class="sale">${money(pack ? p.pack_price_cents : p.price_cents)}</b> <s>${money(Math.round(p.was_cents * (pack || 1)))}</s> <span class="badge">${p.percent_off}% ${esc(t('OFF'))}</span>` : `<b>${money(pack ? p.pack_price_cents : p.price_cents)}</b>`;
      const body = `<nav class="crumbs"><a href="${pre || '/'}">${esc(t('Home'))}</a> / ${p.category_slug ? `<a href="${pre}/c/${esc(p.category_slug)}">${esc(p.category_name)}</a> / ` : ''}${esc(p.name)}</nav>
<div class="pdp"><div class="pimg"><img src="${esc(p.image_url || '/static/noimage.svg')}" alt="${esc(p.name)}" width="480" height="480"></div>
<div class="pinfo"><h1>${esc(p.name)}</h1>${p.brand ? `<div class="sz">${esc(p.brand)}</div>` : ''}<div class="sz">${esc(p.size)}</div>
<div class="bigpr">${priceHtml} <small>${pack ? `${esc(t('per pack'))} &middot; <span dir="ltr">${money(p.price_cents)} / ${esc(t('lb'))}</span>` : p.sold_by === 'lb' ? esc(t('per lb')) : ''}</small></div>${pack ? `<div class="hint">${esc(t('about {w} lb per pack', { w: pack }))}</div>` : ''}
${p.stock_status === 'low' ? `<div class="warn">${esc(t('Low stock'))}${p.stock != null ? `: ${esc(t('only {n} left', { n: p.stock }))}` : ''}</div>` : ''}
${p.stock_status === 'out' ? `<div class="warn">${esc(t('Currently out of stock'))}</div>` : `<div class="addrow" data-id="${p.id}"><button class="btn add" data-add="${p.id}" data-by="${p.sold_by}" data-pack="${pack ? 1 : 0}" data-name="${esc(p.name)}">${esc(t('Add to cart'))}</button></div>${p.sold_by === 'lb' ? `<p class="hint">${esc(t('Priced by weight. You are charged for the exact weight we pack.'))}</p>` : ''}`}
${p.kosher_cert ? `<p><b>${esc(t('Kosher supervision:'))}</b> ${esc(p.kosher_cert)}</p>` : ''}${p.description ? `<h2>${esc(t('About this product'))}</h2><p>${esc(p.description)}</p>` : ''}${p.ingredients ? `<h2>${esc(t('Ingredients'))}</h2><p dir="auto">${esc(p.ingredients)}</p>` : ''}
${nutRows.length ? `<h2>${esc(t('Nutrition'))}</h2><table class="nut">${nutRows.map(([k, v]) => `<tr><th>${esc(t(k))}</th><td>${esc(v)}</td></tr>`).join('')}</table>` : ''}</div></div>
${tog.length ? `<h2>${esc(t('Frequently bought together'))}</h2>${grid(tog, lang)}` : ''}${sim.length ? `<h2>${esc(t('Similar items'))}</h2>${grid(sim, lang)}` : ''}`;
      const ld = [crumbs([[t('Home'), pre || '/'], ...(p.category_slug ? [[p.category_name, `${pre}/c/${p.category_slug}`]] : []), [p.name, url]]),
        { '@context': 'https://schema.org', '@type': 'Product', name: p.name, inLanguage: lang, image: p.image_url ? [p.image_url] : undefined, description: p.description || undefined, brand: p.brand ? { '@type': 'Brand', name: p.brand } : undefined, gtin: p.upc || undefined, sku: String(p.id),
          offers: { '@type': 'Offer', url: abs(url), priceCurrency: 'USD', price: ((pack ? p.pack_price_cents : p.price_cents) / 100).toFixed(2), availability: avail, seller: { '@type': 'GroceryStore', name: 'Bay Kosher' } } }];
      return layout(req, { title: `${p.name}${p.size ? ' ' + p.size : ''} | ${t('Kosher {name}', { name: p.category_name || t('Grocery') })} | Bay Kosher`, description: (p.description || t('Buy {name} online from Bay Kosher in Lafayette, CA. Pickup or delivery across the Bay Area.', { name: p.name })).slice(0, 155), body, canonical: url, path: `/p/${p.id}-${p.slug}`, ld, image: p.image_url });
    },
    async sale(req) {
      const lang = req.lang, t = (k, v) => tr(lang, k, v), pre = lang === 'he' ? '/he' : '';
      const { items } = await core.listProducts({ sale: true, sort: 'discount', limit: 200, lang });
      return layout(req, { title: t('Kosher Grocery Specials & Weekly Sales | Bay Kosher'), description: t("This week's kosher grocery specials at Bay Kosher in Lafayette, CA."), body: `<h1>${esc(t('Specials'))}</h1>${grid(items, lang)}`, canonical: pre + '/sale', path: '/sale' });
    },
    async search(req) {
      const lang = req.lang, t = (k, v) => tr(lang, k, v);
      const q = String(req.query.q || '').slice(0, 80);
      const { items, total } = q ? await core.listProducts({ q, limit: 60, lang }) : { items: [], total: 0 };
      return layout(req, { title: `${t('Search')}: ${q} | Bay Kosher`, description: t('Search Bay Kosher products'), noindex: true, body: `<h1>${q ? esc(t('Results for "{q}"', { q })) : esc(t('Search'))}</h1>${q ? `<p>${esc(t('{n} products', { n: total }))}</p>` : ''}${q && !total ? `<p class="empty">${esc(t('No matches. Try fewer words or a different spelling. Questions? Call us.'))}</p>` : ''}${grid(items, lang)}` });
    },
    async store(req) {
      const lang = req.lang, t = (k, v) => tr(lang, k, v), pre = lang === 'he' ? '/he' : '';
      const s = await settings.all();
      return layout(req, { title: t('Store Location & Hours | Bay Kosher, Lafayette CA'), description: t('Visit Bay Kosher at {address}. Open Sunday to Friday.', { address: s.store.address }), canonical: pre + '/store', path: '/store', ld: [await storeLd(lang)],
        body: `<h1>${esc(t('Our location'))}</h1><p>${esc(s.store.address)}<br><a href="tel:${esc(s.store.phone.replace(/[^\d+]/g, ''))}" dir="ltr">${esc(s.store.phone)}</a><br>${esc(s.store.email)}</p><h2>${esc(t('Hours'))}</h2><table class="nut">${DAYS.map(([k, n]) => `<tr><th>${esc(t(n))}</th><td dir="ltr">${s.hours[k] ? t12(s.hours[k][0]) + ' - ' + t12(s.hours[k][1]) : esc(t('Closed'))}</td></tr>`).join('')}</table><p><a href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(s.store.address)}">${esc(t('Get directions'))}</a></p>` });
    },
    app: (title) => async (req) => layout(req, { title: tr(req.lang, title) + ' | Bay Kosher', description: tr(req.lang, title), noindex: true, body: `<div id="app" data-page="${esc(title.toLowerCase())}"><p>${esc(tr(req.lang, 'Loading...'))}</p></div>` }),
  };

  async function sitemap() {
    const prods = await db.rows('SELECT id, name, updated_at FROM products WHERE active ORDER BY id');
    const cats = await core.categories();
    const entry = (loc, mod) => {
      const en = abs(loc), he = abs('/he' + (loc === '/' ? '' : loc));
      const alt = `<xhtml:link rel="alternate" hreflang="en" href="${esc(en)}"/><xhtml:link rel="alternate" hreflang="he" href="${esc(he)}"/>`;
      const lm = mod ? `<lastmod>${new Date(mod).toISOString().slice(0, 10)}</lastmod>` : '';
      return `<url><loc>${esc(en)}</loc>${lm}${alt}</url><url><loc>${esc(he)}</loc>${lm}${alt}</url>`;
    };
    return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${entry('/')}${entry('/sale')}${entry('/store')}${cats.filter((c) => c.product_count > 0).map((c) => entry('/c/' + c.slug)).join('')}${prods.map((p) => entry(`/p/${p.id}-${slugify(p.name)}`, p.updated_at)).join('')}</urlset>`;
  }
  const robots = () => `User-agent: *\nDisallow: /api/\nDisallow: /admin\nDisallow: /pick\nDisallow: /cart\nDisallow: /checkout\nDisallow: /account\nDisallow: /search\nDisallow: /he/cart\nDisallow: /he/checkout\nDisallow: /he/account\nDisallow: /he/search\nSitemap: ${abs('/sitemap.xml')}\n`;

  return { pages, sitemap, robots, layout };
}

module.exports = { createPages };
