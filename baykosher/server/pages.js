// Server-rendered pages (fast, crawlable, good for Google): home, departments, products, sale, search, store info,
// plus sitemap.xml, robots.txt and structured data (Schema.org GroceryStore / Product / BreadcrumbList / ItemList).
'use strict';
const { esc, money, slugify, httpErr } = require('./core');

const DAYS = [['mon', 'Monday', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']];
const t12 = (t) => { const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; };
const jsonLd = (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;

function createPages({ core, settings, db, publicUrl = '' }) {
  const abs = (p) => publicUrl + p;

  async function layout(req, { title, description, body, canonical, ld = [], image, noindex }) {
    const s = await settings.all();
    const cats = (await core.categories()).filter((c) => !c.parent_id && c.product_count > 0);
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}">
${canonical ? `<link rel="canonical" href="${esc(abs(canonical))}">` : ''}${noindex ? '<meta name="robots" content="noindex">' : ''}
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:type" content="website">${image ? `<meta property="og:image" content="${esc(image)}">` : ''}
<meta name="theme-color" content="#00209f"><link rel="manifest" href="/manifest.webmanifest"><link rel="stylesheet" href="/static/app.css">${ld.map(jsonLd).join('')}</head><body>
<header class="top"><div class="wrap bar"><a class="logo" href="/" aria-label="${esc(s.store.name)} home"><b>BAY</b><span>KOSHER</span><small>Chabad of Lamorinda</small></a>
<form class="search" action="/search" role="search" autocomplete="off"><input name="q" id="q" type="search" placeholder="What can we help you find?" aria-label="Search products" value="${esc(req.query.q || '')}"><button aria-label="Search">&#128269;</button><div id="suggest" class="suggest" hidden></div></form>
<a class="btn small" id="acct" href="/account">Sign in</a><a class="cartbtn" href="/cart" aria-label="Cart">&#128722;<span id="cartcount" hidden>0</span></a></div>
<nav class="wrap nav"><a href="#" id="deptbtn">&#9776; Departments</a><a href="/sale">Specials</a><a href="/account#buyagain">Buy again</a><a href="/store">Store &amp; hours</a></nav>
<div id="dept" class="dept" hidden><div class="wrap">${cats.map((c) => `<a href="/c/${esc(c.slug)}">${c.image_url ? `<img src="${esc(c.image_url)}" alt="" loading="lazy">` : ''}<span>${esc(c.name)}</span></a>`).join('')}</div></div></header>
<main class="wrap">${body}</main>
<footer><div class="wrap foot"><div><b>${esc(s.store.name)}</b><br>${esc(s.store.address)}<br><a href="tel:${esc(s.store.phone.replace(/[^\d+]/g, ''))}">${esc(s.store.phone)}</a><br>${esc(s.store.email)}</div>
<div><b>Hours</b><br>${DAYS.map(([k, n]) => `${n}: ${s.hours[k] ? t12(s.hours[k][0]) + ' - ' + t12(s.hours[k][1]) : 'Closed'}`).join('<br>')}</div>
<form id="subform"><b>Weekly specials by email</b><br><input type="email" name="email" placeholder="you@example.com" required aria-label="Email"> <button class="btn small">Join</button><div id="submsg" role="status"></div></form></div></footer>
<script src="/static/app.js" defer></script></body></html>`;
  }

  const card = (p) => `<article class="card${p.stock_status === 'out' ? ' out' : ''}" data-id="${p.id}">
<a href="/p/${p.id}-${esc(p.slug)}" class="img">${p.percent_off ? `<span class="badge">${p.percent_off}% OFF</span>` : ''}<img src="${esc(p.image_url || '/static/noimage.svg')}" alt="${esc(p.name)}" loading="lazy" width="200" height="200"></a>
<a href="/p/${p.id}-${esc(p.slug)}" class="nm">${esc(p.name)}</a><div class="sz">${esc(p.size)}</div>
<div class="pr">${p.was_cents ? `<b class="sale">${money(p.price_cents)}</b> <s>${money(p.was_cents)}</s>` : `<b>${money(p.price_cents)}</b>`}${p.sold_by === 'lb' ? ' <small>/ lb</small>' : ''}</div>
${p.stock_status === 'low' ? `<div class="warn">Low stock${p.stock != null ? ` (${p.stock} left)` : ''}</div>` : ''}
${p.stock_status === 'out' ? '<div class="warn">Out of stock</div><button class="btn add" disabled>Unavailable</button>' : `<button class="btn add" data-add="${p.id}" data-by="${p.sold_by}" data-name="${esc(p.name)}">Add${p.sold_by === 'lb' ? ' (1 lb)' : ''}</button>`}</article>`;
  const grid = (items) => items.length ? `<div class="grid">${items.map(card).join('')}</div>` : '<p class="empty">Nothing here yet.</p>';
  const crumbs = (list) => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: list.map(([name, url], i) => ({ '@type': 'ListItem', position: i + 1, name, item: abs(url) })) });

  async function storeLd() {
    const s = await settings.all();
    const spec = DAYS.filter(([k]) => s.hours[k]).map(([k, n]) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: n, opens: s.hours[k][0], closes: s.hours[k][1] }));
    return { '@context': 'https://schema.org', '@type': 'GroceryStore', name: s.store.name, url: abs('/'), telephone: s.store.phone, email: s.store.email, priceRange: '$$', servesCuisine: 'Kosher',
      address: { '@type': 'PostalAddress', streetAddress: '3477 Golden Gate Way', addressLocality: 'Lafayette', addressRegion: 'CA', postalCode: '94549', addressCountry: 'US' },
      geo: { '@type': 'GeoCoordinates', latitude: s.store.lat, longitude: s.store.lng }, openingHoursSpecification: spec,
      areaServed: ['Lafayette', 'Orinda', 'Moraga', 'Walnut Creek', 'Danville', 'San Ramon', 'Oakland', 'Berkeley', 'San Francisco', 'Bay Area'].map((n) => ({ '@type': 'City', name: n })) };
  }

  const pages = {
    async home(req) {
      const cats = (await core.categories()).filter((c) => !c.parent_id && c.product_count > 0);
      const sale = (await core.listProducts({ sale: true, sort: 'discount', limit: 12, inStockOnly: true })).items;
      const feat = (await db.rows(`SELECT id FROM products WHERE active AND image_url <> '' AND (NOT track_stock OR stock > 0) ORDER BY (SELECT count(*) FROM order_items oi WHERE oi.product_id = products.id) DESC, id DESC LIMIT 12`)).map((r) => r.id);
      const featured = feat.length ? (await core.listProducts({ ids: feat })).items : [];
      const body = `<section class="hero"><h1>Kosher groceries in Lafayette, delivered or ready for pickup across the Bay Area</h1><p>Glatt kosher meat, dairy, deli, Judaica, baked goods and Israeli favorites. Order online and pick up in about 3 hours, or get it delivered.</p><a class="btn" href="/c/${esc(cats[0] ? cats[0].slug : '')}">Start shopping</a></section>
<h2>Shop by department</h2><div class="depts">${cats.map((c) => `<a href="/c/${esc(c.slug)}">${c.image_url ? `<img src="${esc(c.image_url)}" alt="" loading="lazy">` : ''}<span>${esc(c.name)}</span></a>`).join('')}</div>
${sale.length ? `<h2>This week's specials</h2>${grid(sale)}<p><a href="/sale">See all specials</a></p>` : ''}${featured.length ? `<h2>Featured products</h2>${grid(featured)}` : ''}
<section class="seo"><h2>The Bay Area's online kosher grocery</h2><p>Bay Kosher, run by Chabad of Lamorinda, serves families in Lafayette, Orinda, Moraga, Walnut Creek, Danville, San Ramon, Oakland, Berkeley and San Francisco with kosher meat, chicken, dairy, frozen foods, baked goods, Judaica, baby food and more.</p></section>`;
      return layout(req, { title: 'Bay Kosher | Kosher Grocery Store in Lafayette, CA | Online Ordering, Pickup & Delivery', description: 'Order kosher groceries online from Bay Kosher in Lafayette, CA: kosher meat, dairy, frozen, baked goods and Judaica. Pickup in about 3 hours or delivery across the Bay Area.', body, canonical: '/', ld: [await storeLd(), { '@context': 'https://schema.org', '@type': 'WebSite', name: 'Bay Kosher', url: abs('/'), potentialAction: { '@type': 'SearchAction', target: abs('/search?q={q}'), 'query-input': 'required name=q' } }] });
    },
    async category(req) {
      const cat = (await core.categories()).find((c) => c.slug === req.params.slug);
      if (!cat) throw httpErr(404, 'Department not found');
      const sort = ['price_asc', 'price_desc', 'discount'].includes(req.query.sort) ? req.query.sort : '';
      const subs = (await core.categories()).filter((c) => c.parent_id === cat.id);
      const { items } = await core.listProducts({ category: cat.slug, limit: 100, sort });
      const body = `<nav class="crumbs"><a href="/">Home</a> / ${esc(cat.name)}</nav><h1>Kosher ${esc(cat.name)}</h1>${subs.length ? `<div class="chips">${subs.map((c) => `<a href="/c/${esc(c.slug)}">${esc(c.name)}</a>`).join('')}</div>` : ''}
<form class="sortbar"><label>Sort <select name="sort" data-autosubmit><option value="">Featured</option><option value="price_asc"${sort === 'price_asc' ? ' selected' : ''}>Price: low to high</option><option value="price_desc"${sort === 'price_desc' ? ' selected' : ''}>Price: high to low</option><option value="discount"${sort === 'discount' ? ' selected' : ''}>Biggest discount</option></select></label></form>${grid(items)}`;
      return layout(req, { title: `Kosher ${cat.name} | Buy Online in the Bay Area | Bay Kosher`, description: `Shop kosher ${cat.name.toLowerCase()} online at Bay Kosher in Lafayette, CA. Pickup or delivery across the Bay Area.`, body, canonical: `/c/${cat.slug}`, ld: [crumbs([['Home', '/'], [cat.name, `/c/${cat.slug}`]]), { '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: items.slice(0, 30).map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: abs(`/p/${p.id}-${p.slug}`), name: p.name })) }] });
    },
    async product(req) {
      const id = parseInt(req.params.idslug, 10);
      const p = await core.getProduct(id);
      if (!p) throw httpErr(404, 'Product not found');
      const sim = await core.similar(id), tog = await core.boughtTogether(id);
      const n = p.nutrition || {};
      const nutRows = [['Serving', n.serving], ['Calories', n.calories], ['Total fat', n.fat_g != null ? n.fat_g + ' g' : null], ['Saturated fat', n.sat_fat_g != null ? n.sat_fat_g + ' g' : null], ['Sodium', n.sodium_mg != null ? n.sodium_mg + ' mg' : null], ['Carbohydrates', n.carbs_g != null ? n.carbs_g + ' g' : null], ['Sugars', n.sugars_g != null ? n.sugars_g + ' g' : null], ['Fiber', n.fiber_g != null ? n.fiber_g + ' g' : null], ['Protein', n.protein_g != null ? n.protein_g + ' g' : null]].filter(([, v]) => v != null && v !== '');
      const avail = p.stock_status === 'out' ? 'https://schema.org/OutOfStock' : p.stock_status === 'low' ? 'https://schema.org/LimitedAvailability' : 'https://schema.org/InStock';
      const url = `/p/${p.id}-${p.slug}`;
      const body = `<nav class="crumbs"><a href="/">Home</a> / ${p.category_slug ? `<a href="/c/${esc(p.category_slug)}">${esc(p.category_name)}</a> / ` : ''}${esc(p.name)}</nav>
<div class="pdp"><div class="pimg"><img src="${esc(p.image_url || '/static/noimage.svg')}" alt="${esc(p.name)}" width="480" height="480"></div>
<div class="pinfo"><h1>${esc(p.name)}</h1>${p.brand ? `<div class="sz">${esc(p.brand)}</div>` : ''}<div class="sz">${esc(p.size)}</div>
<div class="bigpr">${p.was_cents ? `<b class="sale">${money(p.price_cents)}</b> <s>${money(p.was_cents)}</s> <span class="badge">${p.percent_off}% OFF</span>` : `<b>${money(p.price_cents)}</b>`}${p.sold_by === 'lb' ? ' <small>per lb</small>' : ''}</div>
${p.stock_status === 'low' ? `<div class="warn">Low stock${p.stock != null ? `: only ${p.stock} left` : ''}</div>` : ''}
${p.stock_status === 'out' ? '<div class="warn">Currently out of stock</div>' : `<div class="addrow"><button class="btn add" data-add="${p.id}" data-by="${p.sold_by}" data-name="${esc(p.name)}">Add to cart</button></div>${p.sold_by === 'lb' ? '<p class="hint">Priced by weight. You are charged for the exact weight we pack.</p>' : ''}`}
${p.kosher_cert ? `<p><b>Kosher supervision:</b> ${esc(p.kosher_cert)}</p>` : ''}${p.description ? `<h2>About this product</h2><p>${esc(p.description)}</p>` : ''}${p.ingredients ? `<h2>Ingredients</h2><p>${esc(p.ingredients)}</p>` : ''}
${nutRows.length ? `<h2>Nutrition</h2><table class="nut">${nutRows.map(([k, v]) => `<tr><th>${k}</th><td>${esc(v)}</td></tr>`).join('')}</table>` : ''}</div></div>
${tog.length ? `<h2>Frequently bought together</h2>${grid(tog)}` : ''}${sim.length ? `<h2>Similar items</h2>${grid(sim)}` : ''}`;
      const ld = [crumbs([['Home', '/'], ...(p.category_slug ? [[p.category_name, `/c/${p.category_slug}`]] : []), [p.name, url]]),
        { '@context': 'https://schema.org', '@type': 'Product', name: p.name, image: p.image_url ? [p.image_url] : undefined, description: p.description || undefined, brand: p.brand ? { '@type': 'Brand', name: p.brand } : undefined, gtin: p.upc || undefined, sku: String(p.id),
          offers: { '@type': 'Offer', url: abs(url), priceCurrency: 'USD', price: (p.price_cents / 100).toFixed(2), availability: avail, seller: { '@type': 'GroceryStore', name: 'Bay Kosher' } } }];
      return layout(req, { title: `${p.name}${p.size ? ' ' + p.size : ''} | Kosher ${p.category_name || 'Grocery'} | Bay Kosher`, description: (p.description || `Buy ${p.name} online from Bay Kosher in Lafayette, CA. Pickup or delivery across the Bay Area.`).slice(0, 155), body, canonical: url, ld, image: p.image_url });
    },
    async sale(req) {
      const { items } = await core.listProducts({ sale: true, sort: 'discount', limit: 200 });
      return layout(req, { title: 'Kosher Grocery Specials & Weekly Sales | Bay Kosher', description: 'This week\'s kosher grocery specials at Bay Kosher in Lafayette, CA.', body: `<h1>Specials</h1>${grid(items)}`, canonical: '/sale' });
    },
    async search(req) {
      const q = String(req.query.q || '').slice(0, 80);
      const { items, total } = q ? await core.listProducts({ q, limit: 60 }) : { items: [], total: 0 };
      return layout(req, { title: `Search: ${q} | Bay Kosher`, description: 'Search Bay Kosher products', noindex: true, body: `<h1>${q ? `Results for “${esc(q)}”` : 'Search'}</h1>${q ? `<p>${total} product${total === 1 ? '' : 's'}</p>` : ''}${q && !total ? '<p class="empty">No matches. Try fewer words or a different spelling. Questions? Call us.</p>' : ''}${grid(items)}` });
    },
    async store(req) {
      const s = await settings.all();
      return layout(req, { title: 'Store Location & Hours | Bay Kosher, Lafayette CA', description: `Visit Bay Kosher at ${s.store.address}. Open Sunday to Friday.`, canonical: '/store', ld: [await storeLd()],
        body: `<h1>Our location</h1><p>${esc(s.store.address)}<br><a href="tel:${esc(s.store.phone.replace(/[^\d+]/g, ''))}">${esc(s.store.phone)}</a><br>${esc(s.store.email)}</p><h2>Hours</h2><table class="nut">${DAYS.map(([k, n]) => `<tr><th>${n}</th><td>${s.hours[k] ? t12(s.hours[k][0]) + ' - ' + t12(s.hours[k][1]) : 'Closed'}</td></tr>`).join('')}</table><p><a href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(s.store.address)}">Get directions</a></p>` });
    },
    app: (title, noindex = true) => async (req) => layout(req, { title: title + ' | Bay Kosher', description: title, noindex, body: `<div id="app" data-page="${esc(title.toLowerCase())}"><p>Loading...</p></div>` }),
  };

  async function sitemap() {
    const prods = await db.rows('SELECT id, name, updated_at FROM products WHERE active ORDER BY id');
    const cats = await core.categories();
    const u = (loc, mod) => `<url><loc>${esc(abs(loc))}</loc>${mod ? `<lastmod>${new Date(mod).toISOString().slice(0, 10)}</lastmod>` : ''}</url>`;
    return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${u('/')}${u('/sale')}${u('/store')}${cats.filter((c) => c.product_count > 0).map((c) => u('/c/' + c.slug)).join('')}${prods.map((p) => u(`/p/${p.id}-${slugify(p.name)}`, p.updated_at)).join('')}</urlset>`;
  }
  const robots = () => `User-agent: *\nDisallow: /api/\nDisallow: /admin\nDisallow: /pick\nDisallow: /cart\nDisallow: /checkout\nDisallow: /account\nDisallow: /search\nSitemap: ${abs('/sitemap.xml')}\n`;

  return { pages, sitemap, robots, layout };
}

module.exports = { createPages };
