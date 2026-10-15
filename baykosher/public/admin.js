(() => {
  'use strict';
  const TZ = 'America/Los_Angeles'; // always show the store's local time
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (c) => (c == null ? '' : '$' + (Number(c) / 100).toFixed(2));
  const cents = (v) => Math.round(Number(String(v).replace(/[$,]/g, '')) * 100) || 0;
  const root = $('#root');
  const api = async (method, url, body) => {
    const r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || 'Error'), { status: r.status });
    return j;
  };
  const fail = (e) => alert(e.message || e);
  let lookups = { cats: [], sups: [] };
  const TABS = [['dash', 'Dashboard'], ['orders', 'Orders'], ['products', 'Products'], ['invoices', 'Invoices'], ['sales', 'Sales'], ['suppliers', 'Suppliers & markup'], ['reorder', 'Reorder'], ['coop', 'Co-op drops'], ['email', 'Weekly email'], ['settings', 'Settings & sync']];
  let tab = (location.hash || '#dash').slice(1);

  async function shell() {
    try { [lookups.cats, lookups.sups] = await Promise.all([api('GET', '/api/admin/categories'), api('GET', '/api/admin/suppliers')]); } catch (e) { if (e.status === 401) return login(); throw e; }
    root.innerHTML = `<div class="shell"><nav class="side"><b>Bay Kosher</b>${TABS.map(([k, t]) => `<button data-t="${k}" class="${k === tab ? 'on' : ''}">${t}</button>`).join('')}<button id="pk">Open picker screen</button><button id="out">Sign out</button></nav><main id="main"></main></div>`;
    $$('[data-t]').forEach((b) => (b.onclick = () => { tab = b.dataset.t; location.hash = tab; $$('[data-t]').forEach((x) => x.classList.toggle('on', x === b)); show(); }));
    $('#pk').onclick = () => window.open('/pick', '_blank'); $('#out').onclick = async () => { await api('POST', '/api/staff/logout', {}); location.reload(); };
    show();
  }
  function login() {
    root.innerHTML = `<div class="wrap" style="max-width:380px;padding-top:60px"><h1>Back office</h1><label class="f" for="pw">Password</label><input class="i" id="pw" type="password"><button class="btn big" id="go" style="margin-top:12px">Sign in</button><div id="e" class="err" hidden></div></div>`;
    const go = async () => { try { await api('POST', '/api/staff/login', { password: $('#pw').value }); shell(); } catch (e) { $('#e').hidden = false; $('#e').textContent = e.message; } };
    $('#go').onclick = go; $('#pw').onkeydown = (e) => e.key === 'Enter' && go(); $('#pw').focus();
  }
  const show = () => (({ dash, orders, products, invoices, sales, suppliers, reorder, coop, email, settings })[tab] || dash)().catch(fail);
  const main = () => $('#main');
  const catName = (id) => (lookups.cats.find((c) => c.id === id) || {}).name || '';
  const sel = (id, opts, cur, blank) => `<select class="i" id="${id}">${blank ? `<option value="">${blank}</option>` : ''}${opts.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(cur ?? '') ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  const catOpts = () => lookups.cats.map((c) => [c.id, c.name]), supOpts = () => lookups.sups.map((s) => [s.id, s.name]);
  function modal(html) { const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = `<div>${html}</div>`; document.body.append(m); m.onclick = (e) => e.target === m && m.remove(); return m; }

  // ---------- dashboard ----------
  async function dash() {
    const d = await api('GET', '/api/admin/dashboard');
    const st = (n, label, tabTo, bad) => `<div class="stat ${bad && n ? 'bad' : ''}" data-go="${tabTo}"><b>${n}</b>${label}</div>`;
    main().innerHTML = `<h1>Dashboard</h1><div class="stats">${st(d.orders.placed || 0, 'New orders to pick', 'orders')}${st(d.orders.picking || 0, 'Being picked', 'orders')}${st(d.orders.ready || 0, 'Ready, waiting', 'orders')}${st(d.out_for_delivery || d.orders.out_for_delivery || 0, 'Out for delivery', 'orders')}${st(d.unpaid_orders, 'Orders with unpaid extra ' + (d.unpaid_cents ? '(' + money(d.unpaid_cents) + ')' : ''), 'orders', true)}</div>
    <div class="stats">${st(d.low_stock, 'Low stock items', 'reorder')}${st(d.out_of_stock, 'Out of stock', 'products')}${st(d.missing_images, 'Products missing a photo', 'products')}${st(d.hidden_products, 'Hidden products to review', 'products')}${st(d.open_carts, 'Open carts (last 3 days)', 'email')}</div>
    <div class="stats"><div class="stat"><b>${money(d.revenue_30d_cents)}</b>Online sales, 30 days (${d.orders_30d} orders)</div></div>
    <p class="hint">Packers use <a href="/pick" target="_blank">/pick</a> on their phones. Customers see <a href="/" target="_blank">the store</a>.</p>`;
    $$('[data-go]').forEach((b) => (b.onclick = () => { tab = b.dataset.go; $$('[data-t]').forEach((x) => x.classList.toggle('on', x.dataset.t === tab)); show(); }));
  }

  // ---------- orders ----------
  async function orders() {
    const list = await api('GET', '/api/admin/orders');
    const tag = (s) => `<span class="pill ${s === 'ready' || s === 'completed' ? 'g' : s === 'cancelled' ? 'r' : 'o'}">${esc(s.replace(/_/g, ' '))}</span>`;
    main().innerHTML = `<h1>Orders</h1><table><tr><th>#</th><th>Customer</th><th>Type</th><th>When</th><th>Status</th><th class="r">Total</th></tr>${list.map((o) => `<tr class="click" data-id="${o.id}"><td>${o.id}</td><td>${esc(o.customer_name || o.customer_email)}</td><td>${o.fulfillment}</td><td>${o.slot_start ? new Date(o.slot_start).toLocaleString([], { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}</td><td>${tag(o.status)} ${o.unpaid_cents ? `<span class="pill r">unpaid ${money(o.unpaid_cents)}</span>` : ''}</td><td class="r">${money(o.captured_cents ?? o.final_total_cents ?? o.est_subtotal_cents)}</td></tr>`).join('')}</table>`;
    $$('tr.click').forEach((r) => (r.onclick = async () => {
      const o = await api('GET', '/api/admin/orders/' + r.dataset.id); const rc = o.receipt;
      const m = modal(`<h2 style="margin-top:0">Order #${o.id} ${tag(o.status)}</h2><p>${esc(o.customer_name)} &middot; ${esc(o.customer_email)} &middot; ${esc(o.customer_phone)}<br>Substitutions: <b>${esc(o.sub_pref.replace(/_/g, ' '))}</b>${o.note ? '<br>Note: ' + esc(o.note) : ''}${o.address ? `<br>${esc(o.address.street)} ${esc(o.address.unit || '')}, ${esc(o.address.city)} ${esc(o.address.zip)} (${o.address.miles} mi)` : ''}${o.coop_label ? '<br>Co-op: ' + esc(o.coop_label) : ''}</p>
        <table><tr><th>Item</th><th>Result</th><th class="r">Qty</th><th class="r">Total</th></tr>${rc.lines.map((l) => `<tr><td>${esc(l.name)}</td><td>${esc(l.status)}</td><td class="r">${l.qty_final ?? l.qty_ordered}${l.sold_by === 'lb' ? ' lb' : ''}</td><td class="r">${money(l.line_total_cents)}</td></tr>`).join('')}</table>
        <p>Subtotal ${money(rc.subtotal_cents)} &middot; Tax ${money(rc.tax_cents)} &middot; Delivery ${money(rc.delivery_fee_cents)} &middot; <b>Total ${money(rc.total_cents)}</b>${rc.charged_cents != null ? ` &middot; Charged ${money(rc.charged_cents)}` : ''}${o.unpaid_cents ? `<br><span class="neg">Unpaid extra: ${money(o.unpaid_cents)}. Collect from the customer.</span>` : ''}${o.uber_tracking_url ? `<br><a href="${esc(o.uber_tracking_url)}" target="_blank" rel="noopener">Uber tracking</a>` : ''}</p>
        <div class="tools">${['ready', 'out_for_delivery'].includes(o.status) ? '<button class="btn small" id="cmp">Mark picked up / delivered</button>' : ''}${o.status === 'ready' && o.fulfillment === 'uber' ? '<button class="btn small ghost" id="dsp">Send to Uber now</button>' : ''}${['placed', 'pending_payment'].includes(o.status) ? '<button class="btn small ghost" id="can">Cancel order</button>' : ''}<button class="btn small ghost" id="cl">Close</button></div>`);
      $('#cl', m).onclick = () => m.remove();
      const doit = (sel, url) => $(sel, m) && ($(sel, m).onclick = async () => { try { await api('POST', url, {}); m.remove(); orders(); } catch (e) { fail(e); } });
      doit('#cmp', `/api/admin/orders/${o.id}/complete`); doit('#dsp', `/api/admin/orders/${o.id}/dispatch`); doit('#can', `/api/admin/orders/${o.id}/cancel`);
    }));
  }

  // ---------- products ----------
  let pf = { q: '', filter: '', offset: 0 };
  async function products() {
    const r = await api('GET', `/api/admin/products?q=${encodeURIComponent(pf.q)}&filter=${pf.filter}&offset=${pf.offset}&limit=50`);
    const margin = (p) => (p.cost_cents > 0 && p.price_cents > 0 ? Math.round(((p.price_cents - p.cost_cents) / p.price_cents) * 100) + '%' : '');
    main().innerHTML = `<h1>Products <small class="hint">${r.total} found</small></h1><div class="tools"><input class="i" id="q" placeholder="Search name, brand or barcode" value="${esc(pf.q)}">${sel('flt', [['hidden', 'Hidden / to review'], ['low', 'Low stock'], ['noimage', 'Missing photo'], ['uncategorized', 'No department'], ['nocost', 'No cost']], pf.filter, 'All products')}<button class="btn small" id="add">+ Add product</button><button class="btn small ghost" id="upc">Add by barcode</button></div>
    <table><tr><th></th><th>Name</th><th>Dept</th><th class="r">Price</th><th class="r">Cost</th><th class="r">Margin</th><th class="r">Stock</th><th></th></tr>${r.items.map((p) => `<tr class="click" data-id="${p.id}"><td><img src="${esc(p.image_url || '/static/noimage.svg')}" alt=""></td><td>${esc(p.name)}<br><small class="hint">${esc(p.brand)} ${esc(p.size)} ${esc(p.upc || '')}</small></td><td>${esc(p.category_name || '')}</td><td class="r">${money(p.price_cents)}${p.sold_by === 'lb' ? '/lb' : ''}</td><td class="r">${p.cost_cents > 0 ? money(Math.round(p.cost_cents)) : ''}</td><td class="r">${margin(p)}</td><td class="r">${p.track_stock ? Number(p.stock) : '&infin;'}</td><td>${p.active ? '' : '<span class="pill o">hidden</span>'}</td></tr>`).join('')}</table>
    <div class="tools" style="margin-top:10px">${pf.offset > 0 ? '<button class="btn small ghost" id="prev">Previous</button>' : ''}${pf.offset + 50 < r.total ? '<button class="btn small ghost" id="next">Next</button>' : ''}</div>`;
    let t; $('#q').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { pf = { ...pf, q: e.target.value, offset: 0 }; products().then(() => { const q = $('#q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }); }, 300); };
    $('#flt').onchange = (e) => { pf = { ...pf, filter: e.target.value, offset: 0 }; products(); };
    $('#add').onclick = () => editProduct(null); $('#upc').onclick = quickUpc;
    $('#prev') && ($('#prev').onclick = () => { pf.offset -= 50; products(); }); $('#next') && ($('#next').onclick = () => { pf.offset += 50; products(); });
    $$('tr.click').forEach((r) => (r.onclick = async () => editProduct(await api('GET', '/api/admin/products/' + r.dataset.id))));
  }
  function quickUpc() {
    const m = modal('<h2 style="margin-top:0">Add by barcode</h2><p class="hint">Scan or type the barcode. We look up the name, size, ingredients, nutrition and a photo for you.</p><input class="i" id="u" inputmode="numeric" placeholder="Barcode"><div id="s" class="hint" style="margin:8px 0"></div><button class="btn" id="go">Look up</button> <button class="btn ghost" id="x">Cancel</button>');
    $('#u', m).focus(); $('#x', m).onclick = () => m.remove();
    const go = async () => { $('#s', m).textContent = 'Looking...'; try { const r = await api('GET', '/api/admin/upc/' + encodeURIComponent($('#u', m).value)); m.remove(); if (r.exists) return editProduct(await api('GET', '/api/admin/products/' + r.exists.id)); if (!r.found) { alert('No match online. Fill it in by hand.'); return editProduct({ upc: r.upc }); } editProduct({ ...r.draft, active: true }); } catch (e) { $('#s', m).textContent = e.message; } };
    $('#go', m).onclick = go; $('#u', m).onkeydown = (e) => e.key === 'Enter' && go();
  }
  function editProduct(p) {
    const isNew = !p || !p.id; p = p || {}; const n = p.nutrition || {};
    const m = modal(`<h2 style="margin-top:0">${isNew ? 'Add product' : 'Edit product'}</h2>
    <div class="grid2"><div><label class="f">Name</label><input class="i" id="name" value="${esc(p.name)}"></div><div><label class="f">Barcode (UPC)</label><div style="display:flex;gap:6px"><input class="i" id="upc" value="${esc(p.upc)}"><button class="btn small ghost" id="lk" type="button">Look up</button></div></div>
    <div><label class="f">Brand</label><input class="i" id="brand" value="${esc(p.brand)}"></div><div><label class="f">Size</label><input class="i" id="size" value="${esc(p.size)}"></div>
    <div><label class="f">Department</label>${sel('cat', catOpts(), p.category_id, 'Choose...')}</div><div><label class="f">Supplier</label>${sel('sup', supOpts(), p.supplier_id, 'None')}</div></div>
    <div class="grid3"><div><label class="f">Sold</label>${sel('by', [['each', 'Per item'], ['lb', 'Per pound']], p.sold_by || 'each')}</div><div><label class="f">Price ($)</label><input class="i" id="price" inputmode="decimal" value="${p.price_cents ? (p.price_cents / 100).toFixed(2) : ''}"></div><div><label class="f">Your cost ($)</label><input class="i" id="cost" inputmode="decimal" value="${p.cost_cents ? (Number(p.cost_cents) / 100).toFixed(2) : ''}"></div></div>
    <div class="tools"><button class="btn small ghost" id="sug" type="button">Set price from cost + supplier markup</button><span id="mg" class="hint"></span></div>
    <div class="grid3"><div><label class="f">In stock</label><input class="i" id="stock" inputmode="decimal" value="${p.stock ?? 0}"></div><div><label class="f">Low-stock warning at</label><input class="i" id="low" inputmode="decimal" value="${p.low_stock_at ?? 3}"></div><div><label class="f">Kosher supervision</label><input class="i" id="cert" value="${esc(p.kosher_cert)}"></div></div>
    <label class="chk"><input type="checkbox" id="act" ${p.active !== false ? 'checked' : ''}> Show on the website</label><label class="chk"><input type="checkbox" id="trk" ${p.track_stock !== false ? 'checked' : ''}> Track stock (untick for items you never run out of)</label><label class="chk"><input type="checkbox" id="lock" ${p.price_locked ? 'checked' : ''}> Lock price (never changed by markup or Clover sync)</label><label class="chk"><input type="checkbox" id="tax" ${p.taxable ? 'checked' : ''}> Taxable</label>
    <label class="f">Photo link</label><div style="display:flex;gap:8px;align-items:center"><input class="i" id="img" value="${esc(p.image_url)}"><img id="pv" src="${esc(p.image_url || '/static/noimage.svg')}" alt="" style="width:56px;height:56px;object-fit:contain"></div>
    <label class="f">Description</label><textarea class="i" id="desc" rows="2">${esc(p.description)}</textarea><label class="f">Ingredients</label><textarea class="i" id="ing" rows="2">${esc(p.ingredients)}</textarea>
    <label class="f">Nutrition (per serving)</label><div class="grid3">${[['serving', 'Serving size'], ['calories', 'Calories'], ['fat_g', 'Fat g'], ['sat_fat_g', 'Sat fat g'], ['sodium_mg', 'Sodium mg'], ['carbs_g', 'Carbs g'], ['sugars_g', 'Sugars g'], ['fiber_g', 'Fiber g'], ['protein_g', 'Protein g']].map(([k, l]) => `<input class="i" data-n="${k}" placeholder="${l}" value="${esc(n[k] ?? '')}">`).join('')}</div>
    <div class="tools" style="margin-top:14px"><button class="btn" id="save">Save</button><button class="btn ghost" id="x">Cancel</button></div>`);
    $('#x', m).onclick = () => m.remove();
    const mg = () => { const pr = cents($('#price', m).value), co = cents($('#cost', m).value); $('#mg', m).textContent = pr && co ? `Margin ${Math.round(((pr - co) / pr) * 100)}%` : ''; }; mg(); $('#price', m).oninput = mg; $('#cost', m).oninput = mg;
    $('#img', m).onchange = () => ($('#pv', m).src = $('#img', m).value || '/static/noimage.svg');
    $('#sug', m).onclick = () => { const s = lookups.sups.find((x) => String(x.id) === $('#sup', m).value), co = cents($('#cost', m).value); if (!s || !co) return alert('Pick a supplier and enter your cost first.'); const raw = co * (1 + Number(s.markup_pct) / 100); let c = Math.ceil(raw / 10) * 10 - 1; if (c < raw) c += 10; $('#price', m).value = (c / 100).toFixed(2); mg(); };
    $('#lk', m).onclick = async () => { try { const r = await api('GET', '/api/admin/upc/' + encodeURIComponent($('#upc', m).value)); if (r.exists && r.exists.id !== p.id) return alert('That barcode is already used by: ' + r.exists.name); if (!r.found && !r.draft) return alert('No match found online.'); const d = r.draft || {}; const fill = (id, v) => { if (v && !$(id, m).value) $(id, m).value = v; }; fill('#name', d.name); fill('#brand', d.brand); fill('#size', d.size); fill('#desc', d.description); fill('#ing', d.ingredients); fill('#img', d.image_url); $('#pv', m).src = $('#img', m).value || '/static/noimage.svg'; for (const [k, v] of Object.entries(d.nutrition || {})) { const el = $(`[data-n=${k}]`, m); if (el && !el.value) el.value = v; } } catch (e) { fail(e); } };
    $('#save', m).onclick = async () => {
      const nut = {}; $$('[data-n]', m).forEach((i) => { if (i.value !== '') nut[i.dataset.n] = i.dataset.n === 'serving' ? i.value : Number(i.value); });
      const body = { name: $('#name', m).value, upc: $('#upc', m).value, brand: $('#brand', m).value, size: $('#size', m).value, category_id: $('#cat', m).value, supplier_id: $('#sup', m).value, sold_by: $('#by', m).value, price_cents: cents($('#price', m).value), cost_cents: cents($('#cost', m).value), stock: $('#stock', m).value, low_stock_at: $('#low', m).value, kosher_cert: $('#cert', m).value, active: $('#act', m).checked, track_stock: $('#trk', m).checked, price_locked: $('#lock', m).checked, taxable: $('#tax', m).checked, image_url: $('#img', m).value, description: $('#desc', m).value, ingredients: $('#ing', m).value, nutrition: nut };
      try { await api(isNew ? 'POST' : 'PUT', isNew ? '/api/admin/products' : '/api/admin/products/' + p.id, body); m.remove(); products(); } catch (e) { fail(e); }
    };
  }

  // ---------- invoices ----------
  async function invoices() {
    const past = await api('GET', '/api/admin/invoices');
    main().innerHTML = `<h1>Invoices</h1><div class="panel"><p class="hint">Paste the lines from your supplier invoice or a spreadsheet (columns: barcode, description, qty, unit cost, optional pack size). We match items by barcode, add shipping into each item's real cost, add the stock, and can reprice using the supplier's markup.</p>
    <div class="grid3"><div><label class="f">Supplier</label>${sel('sup', supOpts(), '', 'Choose...')}</div><div><label class="f">Invoice #</label><input class="i" id="no"></div><div><label class="f">Shipping / freight ($)</label><input class="i" id="ship" inputmode="decimal" value="0"></div></div>
    <label class="f">Lines (CSV or pasted from Excel)</label><textarea class="i" id="csv" rows="6" placeholder="upc,description,qty,unit cost,pack&#10;729000001001,Osem Couscous 12oz,2,30.00,12"></textarea><input type="file" id="file" accept=".csv,.tsv,.txt"><div class="tools" style="margin-top:8px"><button class="btn" id="prev">Preview</button></div><div id="out"></div></div>
    <h2>Past invoices</h2><table><tr><th>Date</th><th>Supplier</th><th>#</th><th class="r">Lines</th><th class="r">Shipping</th></tr>${past.map((i) => `<tr><td>${String(i.invoice_date).slice(0, 10)}</td><td>${esc(i.supplier || '')}</td><td>${esc(i.invoice_no)}</td><td class="r">${i.lines}</td><td class="r">${money(i.shipping_cents)}</td></tr>`).join('')}</table>`;
    $('#file').onchange = async (e) => { $('#csv').value = await e.target.files[0].text(); };
    $('#prev').onclick = async () => {
      try {
        let text = $('#csv').value; if (text.includes('\t') && !text.includes(',')) text = text.replace(/\t/g, ',');
        const { lines } = await api('POST', '/api/admin/invoices/parse-csv', { text });
        const payload = { supplier_id: $('#sup').value || null, invoice_no: $('#no').value, shipping_cents: cents($('#ship').value), lines };
        const r = await api('POST', '/api/admin/invoices', payload);
        $('#out').innerHTML = `<h2>Preview</h2><table><tr><th>Item</th><th>Match</th><th class="r">Units</th><th class="r">Unit cost</th><th class="r">Real cost (with shipping)</th><th class="r">Old &rarr; new price</th></tr>${r.lines.map((l) => `<tr><td>${esc(l.description || l.upc)}</td><td>${l.product_id ? esc(l.product_name) : '<span class="pill o">new item</span>'}</td><td class="r">${l.qty}</td><td class="r">${money(l.unit_cost_cents)}</td><td class="r">${money(Math.round(l.landed_cost_cents))}</td><td class="r">${l.new_price_cents ? money(l.old_price_cents) + ' &rarr; <b>' + money(l.new_price_cents) + '</b>' : ''}</td></tr>`).join('')}</table>
        <p><b>Total ${money(r.total_cents)}</b> &middot; ${r.unmatched} item${r.unmatched === 1 ? '' : 's'} not in the catalog yet.</p><div class="grid2"><div><label class="f">Prices</label>${sel('rp', [['new_only', 'Price new items only (recommended)'], ['all', "Reprice everything on this invoice by the supplier's markup (skips locked)"], ['none', 'Do not change prices']], 'new_only')}</div><div><label class="chk"><input type="checkbox" id="cm" checked> Create unknown items as hidden products so I can finish them (use "Hidden" filter)</label></div></div><button class="btn" id="commit">Save invoice &amp; add stock</button>`;
        $('#commit').onclick = async () => { try { const c = await api('POST', '/api/admin/invoices', { ...payload, commit: true, reprice: $('#rp').value, create_missing: $('#cm').checked }); alert(`Saved. ${c.created_product_ids.length} new hidden product(s) created.`); invoices(); } catch (e) { fail(e); } };
      } catch (e) { fail(e); }
    };
  }

  // ---------- sales ----------
  async function sales() {
    const list = await api('GET', '/api/admin/sales');
    main().innerHTML = `<h1>Sales</h1><div class="panel"><h2 style="margin-top:0">New sale</h2><div class="grid3"><div><label class="f">Name</label><input class="i" id="nm" placeholder="Pesach week"></div><div><label class="f">Discount type</label>${sel('kind', [['percent', '% off regular price'], ['margin', 'Sell at % over my cost'], ['price', 'Fixed price ($)']], 'percent')}</div><div><label class="f" id="vl">Percent off</label><input class="i" id="val" inputmode="decimal" value="10"></div></div>
    <div class="grid3"><div><label class="f">Applies to</label>${sel('sc', [['all', 'Everything'], ['category', 'A department'], ['supplier', 'A supplier'], ['brand', 'A brand'], ['product', 'Specific products']], 'all')}</div><div id="scv"></div><div></div></div>
    <div class="grid3"><div><label class="f">Starts (optional)</label><input class="i" id="st" type="datetime-local"></div><div><label class="f">Ends (optional)</label><input class="i" id="en" type="datetime-local"></div><div><label class="chk" style="margin-top:34px"><input type="checkbox" id="below"> Allow below my cost</label></div></div>
    <div class="tools"><button class="btn ghost" id="pv">Preview prices &amp; margins</button><button class="btn" id="sv">Start sale</button></div><div id="pvout"></div></div>
    <h2>Sales</h2><table><tr><th>Name</th><th>Deal</th><th>Applies to</th><th></th></tr>${list.map((s) => `<tr><td>${esc(s.name)} ${s.active ? '<span class="pill g">on</span>' : '<span class="pill">off</span>'}</td><td>${s.kind === 'percent' ? Number(s.value) + '% off' : s.kind === 'margin' ? Number(s.value) + '% over cost' : money(s.value)}</td><td>${s.scope_type === 'category' ? esc(catName(Number(s.scope_value))) : s.scope_type === 'supplier' ? esc((lookups.sups.find((x) => String(x.id) === s.scope_value) || {}).name || '') : s.scope_type === 'all' ? 'Everything' : esc(s.scope_type + ': ' + s.scope_value)}</td><td class="r"><button class="btn small ghost" data-tg="${s.id}">${s.active ? 'Turn off' : 'Turn on'}</button> <button class="btn small ghost" data-del="${s.id}">Delete</button></td></tr>`).join('')}</table>`;
    const chosen = []; // specific product ids
    const drawScope = () => {
      const v = $('#sc').value, box = $('#scv');
      box.innerHTML = v === 'category' ? `<label class="f">Department</label>${sel('scval', catOpts(), '')}` : v === 'supplier' ? `<label class="f">Supplier</label>${sel('scval', supOpts(), '')}` : v === 'brand' ? '<label class="f">Brand</label><input class="i" id="scval" placeholder="Osem">' : v === 'product' ? '<label class="f">Find products</label><input class="i" id="scfind" placeholder="Search..."><div id="scres"></div><div id="chips"></div>' : '';
      if (v === 'product') { let t; $('#scfind').oninput = (e) => { clearTimeout(t); t = setTimeout(async () => { const r = await api('GET', '/api/admin/products?limit=8&q=' + encodeURIComponent(e.target.value)); $('#scres').innerHTML = r.items.map((p) => `<div><button class="btn small ghost" data-pid="${p.id}" data-nm="${esc(p.name)}">+ ${esc(p.name)}</button></div>`).join(''); $$('[data-pid]').forEach((b) => (b.onclick = () => { if (!chosen.includes(b.dataset.pid)) chosen.push(b.dataset.pid); $('#chips').innerHTML += `<span class="pill">${esc(b.dataset.nm)}</span> `; })); }, 250); }; }
    };
    $('#sc').onchange = drawScope; drawScope();
    $('#kind').onchange = () => { $('#vl').textContent = { percent: 'Percent off', margin: 'Percent over cost', price: 'Sale price ($)' }[$('#kind').value]; };
    const spec = () => { const kind = $('#kind').value, v = Number($('#val').value); const sc = $('#sc').value; return { name: $('#nm').value, kind, value: kind === 'price' ? Math.round(v * 100) : v, scope_type: sc, scope_value: sc === 'product' ? chosen.join(',') : sc === 'all' ? '' : $('#scval').value, starts_at: $('#st').value ? new Date($('#st').value).toISOString() : null, ends_at: $('#en').value ? new Date($('#en').value).toISOString() : null, allow_below_cost: $('#below').checked }; };
    $('#pv').onclick = async () => { try { const r = await api('POST', '/api/admin/sales/preview', spec()); $('#pvout').innerHTML = `<p><b>${r.count}</b> products affected${r.items.some((i) => i.below_cost) ? ' <span class="neg">(some below cost)</span>' : ''}</p><table><tr><th>Product</th><th class="r">Regular</th><th class="r">Sale</th><th class="r">Margin</th></tr>${r.items.slice(0, 40).map((i) => `<tr><td>${esc(i.name)}</td><td class="r">${money(i.regular_cents)}</td><td class="r"><b>${money(i.sale_cents)}</b></td><td class="r ${i.below_cost ? 'neg' : ''}">${i.margin_pct == null ? '' : i.margin_pct + '%'}</td></tr>`).join('')}</table>`; } catch (e) { fail(e); } };
    $('#sv').onclick = async () => { try { await api('POST', '/api/admin/sales', spec()); sales(); } catch (e) { fail(e); } };
    $$('[data-del]').forEach((b) => (b.onclick = async () => { if (confirm('Delete this sale?')) { await api('DELETE', '/api/admin/sales/' + b.dataset.del); sales(); } }));
    $$('[data-tg]').forEach((b) => (b.onclick = async () => { const s = list.find((x) => String(x.id) === b.dataset.tg); await api('PUT', '/api/admin/sales/' + s.id, { ...s, active: !s.active }); sales(); }));
  }

  // ---------- suppliers ----------
  async function suppliers() {
    lookups.sups = await api('GET', '/api/admin/suppliers');
    main().innerHTML = `<h1>Suppliers &amp; markup</h1><p class="hint">Set each supplier's markup once. Prices are calculated from the real cost (invoice price plus shipping) and end in .x9. Locked products are never changed.</p><table><tr><th>Supplier</th><th>Markup %</th><th></th></tr>${lookups.sups.map((s) => `<tr><td><input class="i" data-n="${s.id}" value="${esc(s.name)}"></td><td><input class="i" data-m="${s.id}" value="${Number(s.markup_pct)}" inputmode="decimal" style="width:90px"></td><td class="r"><button class="btn small ghost" data-sv="${s.id}">Save</button> <button class="btn small" data-rp="${s.id}">Preview reprice</button></td></tr>`).join('')}<tr><td><input class="i" id="nn" placeholder="New supplier name"></td><td><input class="i" id="nm" value="30" style="width:90px"></td><td class="r"><button class="btn small" id="addsup">Add</button></td></tr></table><div id="out"></div>`;
    $('#addsup').onclick = async () => { if (!$('#nn').value) return; await api('POST', '/api/admin/suppliers', { name: $('#nn').value, markup_pct: Number($('#nm').value) }); suppliers(); };
    $$('[data-sv]').forEach((b) => (b.onclick = async () => { const id = b.dataset.sv; await api('PUT', '/api/admin/suppliers/' + id, { name: $(`[data-n="${id}"]`).value, markup_pct: Number($(`[data-m="${id}"]`).value) }); alert('Saved'); }));
    $$('[data-rp]').forEach((b) => (b.onclick = async () => {
      const id = b.dataset.rp; const r = await api('POST', `/api/admin/suppliers/${id}/reprice`, { apply: false });
      $('#out').innerHTML = `<h2>${esc(r.supplier)} at ${r.markup_pct}% markup: ${r.count} price change${r.count === 1 ? '' : 's'}</h2>${r.count ? `<table><tr><th>Product</th><th class="r">Cost</th><th class="r">Now</th><th class="r">New</th></tr>${r.changes.slice(0, 100).map((c) => `<tr><td>${esc(c.name)}</td><td class="r">${money(Math.round(c.cost_cents))}</td><td class="r">${money(c.old_price_cents)}</td><td class="r"><b>${money(c.new_price_cents)}</b></td></tr>`).join('')}</table><button class="btn" id="ap" style="margin-top:10px">Apply ${r.count} new prices</button>` : '<p>Everything is already priced correctly.</p>'}`;
      $('#ap') && ($('#ap').onclick = async () => { await api('POST', `/api/admin/suppliers/${id}/reprice`, { apply: true }); alert('Prices updated.'); suppliers(); });
    }));
  }

  // ---------- reorder ----------
  async function reorder() {
    const r = await api('GET', '/api/admin/reorder');
    main().innerHTML = `<h1>Reorder suggestions</h1><p class="hint">Based on how fast each item has been selling (in store through Clover, and online) and how much is left. Urgent items will run out before a new delivery could arrive.</p>${r.length ? `<div class="tools"><button class="btn small" id="cp">Copy order list</button></div><table><tr><th>Item</th><th>Supplier</th><th class="r">On hand</th><th class="r">Sells / day</th><th class="r">Days left</th><th class="r">Suggested order</th></tr>${r.map((x) => `<tr><td>${esc(x.name)} ${x.urgent ? '<span class="pill r">urgent</span>' : ''}</td><td>${esc(x.supplier || '')}</td><td class="r">${x.stock}</td><td class="r">${x.per_day}</td><td class="r">${x.days_left ?? ''}</td><td class="r"><b>${x.order_qty}</b></td></tr>`).join('')}</table>` : '<p class="empty">Nothing needs reordering yet. Suggestions appear once items have sold.</p>'}`;
    $('#cp') && ($('#cp').onclick = () => { navigator.clipboard.writeText(r.map((x) => `${x.order_qty} x ${x.name}${x.supplier ? ' (' + x.supplier + ')' : ''}`).join('\n')); alert('Copied.'); });
  }

  // ---------- co-op ----------
  async function coop() {
    const list = await api('GET', '/api/admin/coop');
    main().innerHTML = `<h1>Co-op drops</h1><p class="hint">A co-op drop is one neighborhood delivery on one day to one place. Customers choose it at checkout and delivery is free.</p><div class="panel"><div class="grid3"><div><label class="f">Name</label><input class="i" id="lb" placeholder="Orinda Thursday"></div><div><label class="f">Place</label><input class="i" id="lc" placeholder="Orinda Community Center"></div><div><label class="f">Address</label><input class="i" id="ad"></div></div><div class="grid3"><div><label class="f">Delivery date</label><input class="i" id="dd" type="date"></div><div><label class="f">Time window (shown to customers)</label><input class="i" id="wt" placeholder="4:00-5:00 PM"></div><div><label class="f">Order by</label><input class="i" id="co" type="datetime-local"></div></div><button class="btn" id="add" style="margin-top:10px">Add drop</button></div>
    <table><tr><th>Name</th><th>Place</th><th>Date</th><th>Order by</th><th></th></tr>${list.map((c) => `<tr><td>${esc(c.label)} ${c.active ? '' : '<span class="pill">closed</span>'}</td><td>${esc(c.location)}</td><td>${String(c.drop_date).slice(0, 10)} ${esc(c.window_text)}</td><td>${c.cutoff_at ? new Date(c.cutoff_at).toLocaleString([], { timeZone: TZ }) : ''}</td><td class="r"><button class="btn small ghost" data-tg="${c.id}">${c.active ? 'Close' : 'Reopen'}</button></td></tr>`).join('')}</table>`;
    $('#add').onclick = async () => { try { await api('POST', '/api/admin/coop', { label: $('#lb').value, location: $('#lc').value, address: $('#ad').value, drop_date: $('#dd').value, window_text: $('#wt').value, cutoff_at: $('#co').value ? new Date($('#co').value).toISOString() : null }); coop(); } catch (e) { fail(e); } };
    $$('[data-tg]').forEach((b) => (b.onclick = async () => { const c = list.find((x) => String(x.id) === b.dataset.tg); await api('PUT', '/api/admin/coop/' + c.id, { ...c, drop_date: String(c.drop_date).slice(0, 10), active: !c.active }); coop(); }));
  }

  // ---------- weekly email ----------
  async function email() {
    const d = await api('GET', '/api/admin/campaign/draft'); const carts = await api('GET', '/api/admin/carts/abandoned');
    main().innerHTML = `<h1>Weekly email</h1>${d.email_live ? '' : '<div class="notice">Email sending is not connected yet (set RESEND_API_KEY). Sends are logged only.</div>'}<p>Built from your current sales (${d.sale_count}) and new items (${d.new_count}). Goes to <b>${d.recipients}</b> people.</p><label class="f">Subject</label><input class="i" id="sj" value="${esc(d.subject)}"><label class="f" style="margin-top:10px">Preview</label><iframe sandbox id="fr"></iframe><div class="tools" style="margin-top:10px"><input class="i" id="te" placeholder="Send a test to..."><button class="btn ghost" id="test">Send test</button><button class="btn" id="all">Send to everyone</button></div>
    <h2>Left carts (reminders go out automatically)</h2><table><tr><th>Who</th><th class="r">Items</th><th>Last activity</th><th class="r">Reminders sent</th></tr>${carts.map((c) => `<tr><td>${esc(c.email || c.phone || 'unknown')}</td><td class="r">${c.item_count}</td><td>${new Date(c.updated_at).toLocaleString([], { timeZone: TZ })}</td><td class="r">${c.reminders_sent}</td></tr>`).join('')}</table>`;
    $('#fr').srcdoc = d.html;
    $('#test').onclick = async () => { try { await api('POST', '/api/admin/campaign/send', { subject: $('#sj').value, html: d.html, testTo: $('#te').value }); alert('Test sent'); } catch (e) { fail(e); } };
    $('#all').onclick = async () => { if (!confirm(`Send to ${d.recipients} people now?`)) return; try { const r = await api('POST', '/api/admin/campaign/send', { subject: $('#sj').value, html: d.html }); alert(`Sent to ${r.sent}.`); } catch (e) { fail(e); } };
  }

  // ---------- settings ----------
  async function settings() {
    const s = await api('GET', '/api/admin/settings'); const cl = await api('GET', '/api/admin/clover/status');
    const days = [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']];
    main().innerHTML = `<h1>Settings &amp; sync</h1>
    <div class="panel"><h2 style="margin-top:0">Store hours</h2><p class="hint">Pickup and delivery times are offered only inside these hours. Leave blank for closed.</p>${days.map(([k, n]) => `<div class="tools"><b style="width:100px">${n}</b><input class="i" type="time" data-o="${k}" value="${s.hours[k] ? s.hours[k][0] : ''}"> to <input class="i" type="time" data-c="${k}" value="${s.hours[k] ? s.hours[k][1] : ''}"></div>`).join('')}<button class="btn" id="sh">Save hours</button></div>
    <div class="panel"><h2 style="margin-top:0">Pickup &amp; delivery rules</h2><div class="grid3"><div><label class="f">Pickup ready in (minutes)</label><input class="i" id="pl" value="${s.pickup.lead_minutes}"></div><div><label class="f">Orders per 30-min pickup slot</label><input class="i" id="pc" value="${s.pickup.capacity_per_window}"></div><div><label class="f">Days ahead customers can schedule</label><input class="i" id="pd" value="${s.pickup.max_days_ahead}"></div></div><div class="grid3"><div><label class="f">Delivery minimum ($)</label><input class="i" id="dm" value="${(s.delivery.min_order_cents / 100).toFixed(2)}"></div><div><label class="f">Delivery lead time (minutes)</label><input class="i" id="dl" value="${s.delivery.lead_minutes}"></div><div><label class="f">Tax rate on taxable items (%)</label><input class="i" id="tx" value="${(s.tax_rate * 100).toFixed(3)}"></div></div>
    <h3>Delivery price by distance</h3><p class="hint">Fee within each distance, and the order size that makes delivery free.</p><table id="tiers"><tr><th>Up to (miles)</th><th>Fee ($)</th><th>Free over ($)</th></tr>${s.delivery_tiers.map((t) => `<tr><td><input class="i" data-tm value="${t.max_miles}"></td><td><input class="i" data-tf value="${(t.fee_cents / 100).toFixed(2)}"></td><td><input class="i" data-tfree value="${t.free_over_cents != null ? (t.free_over_cents / 100).toFixed(2) : ''}"></td></tr>`).join('')}</table><button class="btn" id="sr" style="margin-top:10px">Save rules</button></div>
    <div class="panel"><h2 style="margin-top:0">Clover sync</h2>${cl.connected ? `<p>Connected. ${cl.last ? 'Last sync ' + new Date(cl.last.created_at).toLocaleString([], { timeZone: TZ }) + ': ' + esc(JSON.stringify(cl.last.summary)) : 'Not synced yet.'}</p><div class="tools">${sel('dir', [['clover_wins', 'Clover prices win (recommended)'], ['site_wins', 'Website prices win (push to Clover)']], 'clover_wins')}<button class="btn" id="sync">Sync now</button></div><p class="hint">Stock always comes from Clover. New items found in Clover arrive hidden for you to review.</p>` : '<p class="hint">Not connected. Add CLOVER_MERCHANT_ID and CLOVER_TOKEN in the server settings.</p>'}</div>`;
    $('#sh').onclick = async () => { const h = {}; days.forEach(([k]) => { const o = $(`[data-o=${k}]`).value, c = $(`[data-c=${k}]`).value; h[k] = o && c ? [o, c] : null; }); try { await api('PUT', '/api/admin/settings/hours', { value: h }); alert('Saved'); } catch (e) { fail(e); } };
    $('#sr').onclick = async () => { try {
      await api('PUT', '/api/admin/settings/pickup', { value: { ...s.pickup, lead_minutes: Number($('#pl').value), capacity_per_window: Number($('#pc').value), max_days_ahead: Number($('#pd').value) } });
      await api('PUT', '/api/admin/settings/delivery', { value: { ...s.delivery, min_order_cents: cents($('#dm').value), lead_minutes: Number($('#dl').value) } });
      await api('PUT', '/api/admin/settings/tax_rate', { value: Number($('#tx').value) / 100 });
      const tiers = $$('#tiers tr').slice(1).map((r) => ({ max_miles: Number($('[data-tm]', r).value), fee_cents: cents($('[data-tf]', r).value), free_over_cents: $('[data-tfree]', r).value ? cents($('[data-tfree]', r).value) : null }));
      await api('PUT', '/api/admin/settings/delivery_tiers', { value: tiers }); alert('Saved'); } catch (e) { fail(e); } };
    $('#sync') && ($('#sync').onclick = async () => { $('#sync').disabled = true; try { const r = await api('POST', '/api/admin/clover/sync', { direction: $('#dir').value }); alert('Synced: ' + JSON.stringify(r)); settings(); } catch (e) { fail(e); $('#sync').disabled = false; } });
  }

  shell();
})();
