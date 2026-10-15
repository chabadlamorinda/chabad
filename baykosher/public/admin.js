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
  const TABS = [['dash', 'Dashboard'], ['orders', 'Orders'], ['items', 'Items to pick'], ['customers', 'Customers'], ['products', 'Products'], ['invoices', 'Invoices'], ['sales', 'Sales'], ['coupons', 'Coupons'], ['suppliers', 'Suppliers & markup'], ['reorder', 'Reorder'], ['coop', 'Pickup points'], ['stockrep', 'Stock reports'], ['banners', 'Banners'], ['staff', 'Staff'], ['email', 'Weekly email'], ['activity', 'Activity log'], ['settings', 'Settings & sync']];
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
  const show = () => (({ dash, orders, items, customers, products, invoices, sales, coupons, suppliers, reorder, coop, stockrep, banners, staff, email, activity, settings })[tab] || dash)().catch(fail);
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

  // ---------- orders (order manager) ----------
  let of = { period: 'today', q: '', fulfillment: '', status: '' };
  const tag = (st) => `<span class="pill ${st === 'ready' || st === 'completed' ? 'g' : st === 'cancelled' ? 'r' : 'o'}">${esc(st.replace(/_/g, ' '))}</span>`;
  const when = (iso, opt) => (iso ? new Date(iso).toLocaleString([], { timeZone: 'America/Los_Angeles', ...opt }) : '');
  const PERIODS = [['today', 'Today'], ['tomorrow', 'Tomorrow'], ['yesterday', 'Yesterday'], ['week', 'Last 7 days'], ['upcoming', 'Upcoming'], ['month', 'Last 30 days']];
  async function orders() {
    const qs = new URLSearchParams(of).toString();
    const r = await api('GET', '/api/admin/orders?' + qs);
    const chip = (k, label, n, cls) => `<button class="pill ${cls || ''}" data-st="${k}" style="border:0;cursor:pointer;${of.status === k ? 'outline:2px solid #00209f' : ''}">${n} ${label}</button> `;
    main().innerHTML = `<h1>Orders</h1><div class="tools">${sel('per', PERIODS, of.period)}<input class="i" id="oq" placeholder="Order #, name, email, phone" value="${esc(of.q)}">${sel('ofl', [['pickup', 'Pickup in store'], ['uber', 'Delivery (Uber)'], ['coop', 'Pickup point']], of.fulfillment, 'All service areas')}<a class="btn small ghost" href="/api/admin/orders?${qs}&format=csv">Export Excel/CSV</a></div>
    <p>${chip('', 'Total', r.total)}${chip('placed', 'Received', r.counts.placed || 0, 'r')}${chip('picking', 'Processing', r.counts.picking || 0, 'o')}${chip('ready', 'Ready', r.counts.ready || 0, 'g')}${chip('out_for_delivery', 'Out for delivery', r.counts.out_for_delivery || 0)}${chip('completed', 'Completed', r.counts.completed || 0, 'g')}${chip('cancelled', 'Cancelled', r.counts.cancelled || 0, 'r')}</p>
    <p class="hint">Count: <b>${r.total}</b> &nbsp; Total ordered: <b>${money(r.ordered_cents)}</b> &nbsp; Total charged: <b>${money(r.processed_cents)}</b></p>
    <table><tr><th>#</th><th>Service</th><th>Day</th><th>Time</th><th>Customer</th><th>Status</th><th class="r">Order $</th><th class="r">Charged $</th><th>Shopper</th><th class="r">Boxes</th></tr>${r.orders.map((o) => `<tr class="click" data-id="${o.id}"><td>${o.id}</td><td>${o.fulfillment === 'pickup' ? 'In-store pickup' : o.fulfillment === 'uber' ? 'Delivery' : esc(o.coop_label || 'Pickup point')}</td><td>${when(o.slot_start || o.created_at, { month: 'short', day: 'numeric' })}</td><td>${o.slot_start ? when(o.slot_start, { hour: 'numeric', minute: '2-digit' }) + (o.slot_end ? ' - ' + when(o.slot_end, { hour: 'numeric', minute: '2-digit' }) : '') : ''}</td><td>${esc(o.customer_name || o.customer_email)}</td><td>${tag(o.status)} ${o.unpaid_cents ? `<span class="pill r">unpaid ${money(o.unpaid_cents)}</span>` : ''}</td><td class="r">${money(o.final_total_cents ?? o.est_subtotal_cents - o.discount_cents + o.est_tax_cents + o.delivery_fee_cents)}</td><td class="r">${o.captured_cents != null ? money(o.captured_cents) : o.auth_cents ? '<span class="hint">held ' + money(o.auth_cents) + '</span>' : ''}</td><td>${esc(o.picker || '')}</td><td class="r">${o.boxes || ''}</td></tr>`).join('')}</table>`;
    $('#per').onchange = (e) => { of.period = e.target.value; orders(); }; $('#ofl').onchange = (e) => { of.fulfillment = e.target.value; orders(); };
    let t; $('#oq').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { of.q = e.target.value; orders().then(() => { const q = $('#oq'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }); }, 300); };
    $$('[data-st]').forEach((b) => (b.onclick = () => { of.status = b.dataset.st; orders(); }));
    $$('tr.click').forEach((row) => (row.onclick = () => orderDetail(row.dataset.id)));
  }
  async function orderDetail(id) {
    const o = await api('GET', '/api/admin/orders/' + id); const rc = o.receipt;
    const m = modal(`<h2 style="margin-top:0">Order #${o.id} ${tag(o.status)}</h2><div class="grid2"><div><b>${esc(o.customer_name)}</b><br>${esc(o.customer_email)}<br>${esc(o.customer_phone)}<br>${o.address ? `${esc(o.address.street)} ${esc(o.address.unit || '')}, ${esc(o.address.city)} ${esc(o.address.zip)} (${o.address.miles} mi)<br>` : ''}${o.coop_label ? 'Pickup point: ' + esc(o.coop_label) + '<br>' : ''}Placed ${when(o.created_at, { dateStyle: 'medium', timeStyle: 'short' })}${o.customer_ip ? '<br><small class="hint">IP ' + esc(o.customer_ip) + '</small>' : ''}</div>
      <div>Substitutions: <b>${esc(o.sub_pref.replace(/_/g, ' '))}</b>${o.note ? '<br>Note: ' + esc(o.note) : ''}${o.coupon_code ? '<br>Coupon: <b>' + esc(o.coupon_code) + '</b>' : ''}<br>Shopper: ${esc(o.picker || '-')}${o.picking_started_at ? '<br>Started ' + when(o.picking_started_at, { timeStyle: 'short' }) : ''}${o.ready_at ? '<br>Finished ' + when(o.ready_at, { timeStyle: 'short' }) : ''}<br>Payment: ${o.payment_intent_id ? esc(o.payment_intent_id) : '-'}<br>Held ${money(o.auth_cents)}${o.captured_cents != null ? ' &middot; charged ' + money(o.captured_cents) : ''}</div></div>
      <table style="margin-top:10px"><tr><th>Item</th><th>Result</th><th class="r">Qty</th><th class="r">Total</th></tr>${rc.lines.map((l) => `<tr><td>${esc(l.name)}</td><td>${esc(l.status)}</td><td class="r">${l.qty_final ?? (l.est_weight_lb ? l.qty_ordered + ' × ' + l.est_weight_lb + ' lb' : l.qty_ordered)}${l.sold_by === 'lb' && l.qty_final != null ? ' lb' : ''}</td><td class="r">${money(l.line_total_cents)}</td></tr>`).join('')}</table>
      <p>Subtotal ${money(rc.subtotal_cents)}${rc.discount_cents ? ' &middot; Coupon -' + money(rc.discount_cents) : ''} &middot; Tax ${money(rc.tax_cents)} &middot; Delivery ${money(rc.delivery_fee_cents)} &middot; <b>Total ${money(rc.total_cents)}</b>${o.unpaid_cents ? `<br><span class="neg">Unpaid extra: ${money(o.unpaid_cents)}. Collect from the customer.</span>` : ''}${o.uber_tracking_url ? `<br><a href="${esc(o.uber_tracking_url)}" target="_blank" rel="noopener">Uber tracking</a>` : ''}</p>
      <div class="tools"><label>Boxes <input class="i" id="bx" style="width:70px" value="${o.boxes || 0}"></label><button class="btn small ghost" id="bxs">Save</button>${['ready', 'out_for_delivery'].includes(o.status) ? '<button class="btn small" id="cmp">Mark picked up / delivered</button>' : ''}${o.status === 'ready' && o.fulfillment === 'uber' ? '<button class="btn small ghost" id="dsp">Send to Uber now</button>' : ''}${['placed', 'pending_payment'].includes(o.status) ? '<button class="btn small ghost" id="can">Cancel order</button>' : ''}<button class="btn small ghost" id="rs">Resend confirmation</button></div>
      <div class="tools"><b>Card:</b><button class="btn small ghost" id="cap">Capture charge…</button><button class="btn small ghost" id="rel">Release hold</button></div>
      <h3>History</h3><table><tr><th>When</th><th>Who</th><th>What</th></tr>${o.events.map((e) => `<tr><td>${when(e.created_at, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td><td>${esc(e.actor)}</td><td>${esc(e.kind)} ${esc(e.detail)}</td></tr>`).join('')}</table><div class="tools" style="margin-top:10px"><button class="btn small ghost" id="cl">Close</button></div>`);
    $('#cl', m).onclick = () => m.remove();
    const doit = (sel, url, body, confirmMsg) => $(sel, m) && ($(sel, m).onclick = async () => { if (confirmMsg && !confirm(confirmMsg)) return; try { await api('POST', url, body || {}); m.remove(); orders(); } catch (e) { fail(e); } });
    doit('#cmp', `/api/admin/orders/${o.id}/complete`); doit('#dsp', `/api/admin/orders/${o.id}/dispatch`); doit('#can', `/api/admin/orders/${o.id}/cancel`, {}, 'Cancel this order and release the card hold?');
    doit('#rs', `/api/admin/orders/${o.id}/resend`); doit('#rel', `/api/admin/orders/${o.id}/payment`, { action: 'release' }, 'Release the card hold? The customer will not be charged.');
    $('#bxs', m).onclick = async () => { await api('POST', `/api/admin/orders/${o.id}/boxes`, { boxes: $('#bx', m).value }); alert('Saved'); };
    $('#cap', m).onclick = async () => { const v = prompt('Amount to charge in dollars (up to ' + money(o.auth_cents) + ')', (o.auth_cents / 100).toFixed(2)); if (!v) return; try { await api('POST', `/api/admin/orders/${o.id}/payment`, { action: 'capture', amount_cents: cents(v) }); m.remove(); orders(); } catch (e) { fail(e); } };
  }

  // ---------- items to pick (totals across orders) ----------
  let itf = { period: 'today', status: '', dept: '', q: '' };
  async function items() {
    const qs = new URLSearchParams(itf).toString();
    const r = await api('GET', '/api/admin/order-items?' + qs);
    main().innerHTML = `<h1>Items to pick</h1><p class="hint">Everything customers ordered, added up across orders. Use it to cut and prepare in bulk.</p><div class="tools">${sel('per', PERIODS, itf.period)}${sel('dept', catOpts(), itf.dept, 'All departments')}${sel('stt', [['all', 'Include finished orders']], itf.status, 'Orders still to pick')}<input class="i" id="iq" placeholder="Search item or SKU" value="${esc(itf.q)}"><a class="btn small ghost" href="/api/admin/order-items?${qs}&format=csv">Export Excel/CSV</a></div><p>Rows: <b>${r.rows.length}</b> &nbsp; Estimated total: <b>${money(r.total_cents)}</b></p>
    <table><tr><th></th><th>Item</th><th>Department</th><th>SKU</th><th class="r">Qty</th><th class="r">Est. weight</th><th class="r">Orders</th><th class="r">Done</th><th class="r">Est. $</th></tr>${r.rows.map((x) => `<tr><td><img src="${esc(x.image_url || '/static/noimage.svg')}" alt=""></td><td>${esc(x.name)}${x.not_available ? ` <span class="pill r">${x.not_available} n/a</span>` : ''}</td><td>${esc(x.category || '')}</td><td>${esc(x.upc || '')}</td><td class="r"><b>${x.qty}</b></td><td class="r">${x.est_weight_lb ? (x.qty * x.est_weight_lb).toFixed(2) + ' lb' : ''}</td><td class="r">${x.orders}</td><td class="r">${x.lines_done}/${x.lines}</td><td class="r">${money(x.est_cents)}</td></tr>`).join('')}</table>`;
    $('#per').onchange = (e) => { itf.period = e.target.value; items(); }; $('#dept').onchange = (e) => { itf.dept = e.target.value; items(); }; $('#stt').onchange = (e) => { itf.status = e.target.value; items(); };
    let t; $('#iq').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { itf.q = e.target.value; items().then(() => { const q = $('#iq'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }); }, 300); };
  }

  // ---------- customers ----------
  let cf = { q: '', sort: 'last', cart: '' };
  async function customers() {
    const qs = new URLSearchParams(cf).toString();
    const r = await api('GET', '/api/admin/customers?' + qs);
    main().innerHTML = `<h1>Customers <small class="hint">${r.total}</small></h1><div class="tools"><input class="i" id="cq" placeholder="Search name, email, phone" value="${esc(cf.q)}">${sel('cs', [['last', 'Last order'], ['spent', 'Most spent'], ['orders', 'Most orders'], ['name', 'Name']], cf.sort)}${sel('cc', [['open', 'Has an open cart']], cf.cart, 'All')}<a class="btn small ghost" href="/api/admin/customers?${qs}&format=csv&limit=1000">Export Excel/CSV</a></div>
    <table><tr><th>Name</th><th>Email</th><th>Phone</th><th>Address</th><th class="r">Orders</th><th class="r">Spent</th><th>Last order</th><th>Cart activity</th><th>Lang</th></tr>${r.items.map((c) => `<tr class="click" data-id="${c.id}"><td>${esc(c.name)}</td><td>${esc(c.email)}</td><td>${esc(c.phone)}</td><td>${c.address ? esc(c.address.street + ', ' + c.address.city) : ''}</td><td class="r">${c.orders}</td><td class="r">${money(c.spent)}</td><td>${c.last_order ? new Date(c.last_order).toLocaleDateString() : ''}</td><td>${c.cart_activity ? new Date(c.cart_activity).toLocaleDateString() : ''}</td><td>${c.lang === 'he' ? 'עברית' : 'EN'}</td></tr>`).join('')}</table>`;
    let t; $('#cq').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { cf.q = e.target.value; customers().then(() => { const q = $('#cq'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }); }, 300); };
    $('#cs').onchange = (e) => { cf.sort = e.target.value; customers(); }; $('#cc').onchange = (e) => { cf.cart = e.target.value; customers(); };
    $$('tr.click').forEach((row) => (row.onclick = async () => { const c = await api('GET', '/api/admin/customers/' + row.dataset.id); const m = modal(`<h2 style="margin-top:0">${esc(c.name)}</h2><p>${esc(c.email)} &middot; ${esc(c.phone)}<br>Texts: ${c.sms_ok ? 'OK' : 'no'} &middot; Weekly email: ${c.email_ok ? 'OK' : 'no'}</p><table><tr><th>#</th><th>Status</th><th>Date</th><th class="r">Total</th></tr>${c.orders.map((o) => `<tr><td>${o.id}</td><td>${tag(o.status)}</td><td>${new Date(o.created_at).toLocaleDateString()}</td><td class="r">${money(o.total_cents)}</td></tr>`).join('')}</table><button class="btn small ghost" id="cl" style="margin-top:10px">Close</button>`); $('#cl', m).onclick = () => m.remove(); }));
  }

  // ---------- coupons ----------
  async function coupons() {
    const list = await api('GET', '/api/admin/coupons');
    main().innerHTML = `<h1>Coupons</h1><div class="panel"><div class="grid3"><div><label class="f">Code</label><input class="i" id="cd" placeholder="WELCOME10"></div><div><label class="f">Name (for you)</label><input class="i" id="cn" placeholder="10% off first order"></div><div><label class="f">Discount</label><div style="display:flex;gap:6px">${sel('ck', [['percent', '% off'], ['amount', '$ off']], 'percent')}<input class="i" id="cv" value="10"></div></div></div>
    <div class="grid3"><div><label class="f">Only on this order number (optional)</label><input class="i" id="co" placeholder="1 = first order"></div><div><label class="f">Minimum order ($)</label><input class="i" id="cm" value="0"></div><div></div></div>
    <div class="grid3"><div><label class="f">Starts (optional)</label><input class="i" id="cs1" type="datetime-local"></div><div><label class="f">Ends (optional)</label><input class="i" id="ce" type="datetime-local"></div><div></div></div><button class="btn" id="add" style="margin-top:10px">Add coupon</button></div>
    <table><tr><th>Code</th><th>Name</th><th>Deal</th><th>Rule</th><th class="r">Used</th><th></th></tr>${list.map((c) => `<tr><td><b>${esc(c.code)}</b> ${c.active ? '' : '<span class="pill">off</span>'}</td><td>${esc(c.name)}</td><td>${c.percent != null ? Number(c.percent) + '% off' : money(c.amount_cents) + ' off'}</td><td>${c.order_number ? 'Order #' + c.order_number + ' only' : ''} ${c.min_subtotal_cents ? 'min ' + money(c.min_subtotal_cents) : ''}</td><td class="r">${c.uses}</td><td class="r"><button class="btn small ghost" data-tg="${c.id}">${c.active ? 'Turn off' : 'Turn on'}</button> <button class="btn small ghost" data-del="${c.id}">Delete</button></td></tr>`).join('')}</table>`;
    $('#add').onclick = async () => { try { await api('POST', '/api/admin/coupons', { code: $('#cd').value, name: $('#cn').value, kind: $('#ck').value, value: $('#cv').value, order_number: $('#co').value, min_subtotal: $('#cm').value, starts_at: $('#cs1').value ? new Date($('#cs1').value).toISOString() : null, ends_at: $('#ce').value ? new Date($('#ce').value).toISOString() : null }); coupons(); } catch (e) { fail(e); } };
    $$('[data-del]').forEach((b) => (b.onclick = async () => { if (confirm('Delete this coupon?')) { await api('DELETE', '/api/admin/coupons/' + b.dataset.del); coupons(); } }));
    $$('[data-tg]').forEach((b) => (b.onclick = async () => { const c = list.find((x) => String(x.id) === b.dataset.tg); await api('PUT', '/api/admin/coupons/' + c.id, { code: c.code, name: c.name, kind: c.percent != null ? 'percent' : 'amount', value: c.percent != null ? Number(c.percent) : c.amount_cents / 100, order_number: c.order_number, min_subtotal: c.min_subtotal_cents / 100, starts_at: c.starts_at, ends_at: c.ends_at, active: !c.active }); coupons(); }));
  }

  // ---------- staff ----------
  const ROLES = [['shopper', 'Personal shopper (packs orders)'], ['cashier', 'Cashier (hands over orders)'], ['data_entry', 'Data entry (products & invoices)'], ['manager', 'Store manager (everything)']];
  async function staff() {
    const list = await api('GET', '/api/admin/staff');
    main().innerHTML = `<h1>Staff</h1><p class="hint">Everyone signs in with their own PIN, so every order shows who packed it and the activity log shows who changed what.</p><div class="panel"><div class="grid3"><div><label class="f">Name</label><input class="i" id="sn"></div><div><label class="f">Role</label>${sel('sr', ROLES, 'shopper')}</div><div><label class="f">PIN (4-8 digits)</label><input class="i" id="sp" inputmode="numeric" maxlength="8"></div></div><button class="btn" id="add" style="margin-top:10px">Add person</button></div>
    <table><tr><th>Name</th><th>Role</th><th></th></tr>${list.map((p) => `<tr><td>${esc(p.name)} ${p.active ? '' : '<span class="pill">inactive</span>'}</td><td>${esc((ROLES.find((r) => r[0] === p.role) || [0, p.role])[1])}</td><td class="r"><button class="btn small ghost" data-pin="${p.id}">New PIN</button> <button class="btn small ghost" data-tg="${p.id}">${p.active ? 'Deactivate' : 'Reactivate'}</button></td></tr>`).join('')}</table>`;
    $('#add').onclick = async () => { try { await api('POST', '/api/admin/staff', { name: $('#sn').value, role: $('#sr').value, pin: $('#sp').value }); staff(); } catch (e) { fail(e); } };
    $$('[data-pin]').forEach((b) => (b.onclick = async () => { const pin = prompt('New PIN (4-8 digits)'); if (!pin) return; try { await api('PUT', '/api/admin/staff/' + b.dataset.pin, { pin }); alert('PIN changed'); } catch (e) { fail(e); } }));
    $$('[data-tg]').forEach((b) => (b.onclick = async () => { const p = list.find((x) => String(x.id) === b.dataset.tg); await api('PUT', '/api/admin/staff/' + p.id, { active: !p.active }); staff(); }));
  }

  // ---------- banners ----------
  async function banners() {
    const list = await api('GET', '/api/admin/banners');
    main().innerHTML = `<h1>Banners</h1><p class="hint">Pictures at the top of the home page. Paste an image link; use a wide picture for desktop and a tall/square one for phones.</p><div class="panel"><div class="grid3"><div><label class="f">Image link</label><input class="i" id="bi"></div><div><label class="f">Click goes to</label><input class="i" id="bl" placeholder="/sale"></div><div><label class="f">Shown on</label>${sel('bd', [['all', 'All devices'], ['desktop', 'Desktop'], ['mobile', 'Phones']], 'all')}</div></div><div class="grid3"><div><label class="f">Description (English)</label><input class="i" id="ba"></div><div><label class="f">Description (Hebrew)</label><input class="i" id="bh" dir="rtl"></div><div><label class="f">Order</label><input class="i" id="bs" value="0"></div></div><button class="btn" id="add" style="margin-top:10px">Add banner</button></div>
    <table><tr><th>Image</th><th>Link</th><th>Device</th><th></th></tr>${list.map((b) => `<tr><td><img src="${esc(b.image_url)}" alt="" style="width:140px;height:auto"></td><td>${esc(b.link)}</td><td>${b.device}</td><td class="r"><button class="btn small ghost" data-tg="${b.id}">${b.active ? 'Hide' : 'Show'}</button> <button class="btn small ghost" data-del="${b.id}">Delete</button></td></tr>`).join('')}</table>`;
    $('#add').onclick = async () => { try { await api('POST', '/api/admin/banners', { image_url: $('#bi').value, link: $('#bl').value, device: $('#bd').value, alt: $('#ba').value, alt_he: $('#bh').value, sort: $('#bs').value }); banners(); } catch (e) { fail(e); } };
    $$('[data-del]').forEach((b) => (b.onclick = async () => { if (confirm('Delete this banner?')) { await api('DELETE', '/api/admin/banners/' + b.dataset.del); banners(); } }));
    $$('[data-tg]').forEach((b) => (b.onclick = async () => { const x = list.find((y) => String(y.id) === b.dataset.tg); await api('PUT', '/api/admin/banners/' + x.id, { ...x, active: !x.active }); banners(); }));
  }

  // ---------- stock reports & activity ----------
  async function stockrep() {
    const list = await api('GET', '/api/admin/stock-reports');
    main().innerHTML = `<h1>Stock reports</h1><p class="hint">Items the packers could not find. Their stock was set to 0 so customers stop ordering them. When it is back, mark it in stock.</p>${list.length ? `<table><tr><th></th><th>Item</th><th>Department</th><th>SKU</th><th>Reported</th><th>By</th><th></th></tr>${list.map((r) => `<tr><td><img src="${esc(r.image_url || '/static/noimage.svg')}" alt=""></td><td>${esc(r.name)}</td><td>${esc(r.category || '')}</td><td>${esc(r.upc || '')}</td><td>${when(r.reported_at, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td><td>${esc(r.reported_by)}</td><td class="r"><button class="btn small" data-in="${r.id}">Back in stock</button> <button class="btn small ghost" data-ok="${r.id}">Dismiss</button></td></tr>`).join('')}</table>` : '<p class="empty">Nothing reported.</p>'}`;
    $$('[data-in]').forEach((b) => (b.onclick = async () => { const n = prompt('How many are in stock now?', '10'); if (n == null) return; await api('POST', `/api/admin/stock-reports/${b.dataset.in}/resolve`, { stock: Number(n) }); stockrep(); }));
    $$('[data-ok]').forEach((b) => (b.onclick = async () => { await api('POST', `/api/admin/stock-reports/${b.dataset.ok}/resolve`, {}); stockrep(); }));
  }
  async function activity() {
    const list = await api('GET', '/api/admin/activity');
    main().innerHTML = `<h1>Activity log</h1><table><tr><th>When</th><th>Who</th><th>What</th></tr>${list.map((a) => `<tr><td>${when(a.created_at, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td><td>${esc(a.actor)}</td><td>${esc(a.action)} <small class="hint">${esc(a.detail)}</small></td></tr>`).join('')}</table>`;
  }

  // ---------- products ----------
  let pf = { q: '', filter: '', offset: 0 };
  async function products() {
    const r = await api('GET', `/api/admin/products?q=${encodeURIComponent(pf.q)}&filter=${pf.filter}&offset=${pf.offset}&limit=50`);
    const margin = (p) => (p.cost_cents > 0 && p.price_cents > 0 ? Math.round(((p.price_cents - p.cost_cents) / p.price_cents) * 100) + '%' : '');
    main().innerHTML = `<h1>Products <small class="hint">${r.total} found</small></h1><div class="tools"><input class="i" id="q" placeholder="Search name, brand or barcode" value="${esc(pf.q)}">${sel('flt', [['hidden', 'Hidden / to review'], ['low', 'Low stock'], ['noimage', 'Missing photo'], ['uncategorized', 'No department'], ['nocost', 'No cost']], pf.filter, 'All products')}<button class="btn small" id="add">+ Add product</button><button class="btn small ghost" id="upc">Add by barcode</button><button class="btn small ghost" id="imp">Import from spreadsheet</button></div>
    <div class="tools" id="bulk" hidden><b id="bn"></b><button class="btn small ghost" data-b="show">Show on site</button><button class="btn small ghost" data-b="hide">Hide</button><button class="btn small ghost" data-b="feat">Feature on home</button><button class="btn small ghost" data-b="unfeat">Unfeature</button><button class="btn small ghost" data-b="dept">Set department…</button><button class="btn small ghost" data-b="sup">Set supplier…</button><button class="btn small ghost" data-b="pct">Change price %…</button></div>
    <table><tr><th><input type="checkbox" id="all"></th><th></th><th>Name</th><th>Dept</th><th class="r">Price</th><th class="r">Cost</th><th class="r">Margin</th><th class="r">Stock</th><th></th></tr>${r.items.map((p) => `<tr class="click" data-id="${p.id}"><td><input type="checkbox" data-sel="${p.id}"></td><td><img src="${esc(p.image_url || '/static/noimage.svg')}" alt=""></td><td>${esc(p.name)}${p.name_he ? ' <small class="hint">' + esc(p.name_he) + '</small>' : ''}${p.featured ? ' <span class="pill g">featured</span>' : ''}<br><small class="hint">${esc(p.brand)} ${esc(p.size)} ${esc(p.upc || '')}</small></td><td>${esc(p.category_name || '')}</td><td class="r">${money(p.price_cents)}${p.sold_by === 'lb' ? '/lb' + (p.est_weight_lb ? ' · ' + Number(p.est_weight_lb) + ' lb pk' : '') : ''}</td><td class="r">${p.cost_cents > 0 ? money(Math.round(p.cost_cents)) : ''}</td><td class="r">${margin(p)}</td><td class="r">${p.track_stock ? Number(p.stock) : '&infin;'}</td><td>${p.active ? '' : '<span class="pill o">hidden</span>'}</td></tr>`).join('')}</table>
    <div class="tools" style="margin-top:10px">${pf.offset > 0 ? '<button class="btn small ghost" id="prev">Previous</button>' : ''}${pf.offset + 50 < r.total ? '<button class="btn small ghost" id="next">Next</button>' : ''}</div>`;
    let t; $('#q').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { pf = { ...pf, q: e.target.value, offset: 0 }; products().then(() => { const q = $('#q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }); }, 300); };
    $('#flt').onchange = (e) => { pf = { ...pf, filter: e.target.value, offset: 0 }; products(); };
    $('#add').onclick = () => editProduct(null); $('#upc').onclick = quickUpc;
    $('#prev') && ($('#prev').onclick = () => { pf.offset -= 50; products(); }); $('#next') && ($('#next').onclick = () => { pf.offset += 50; products(); });
    $$('tr.click').forEach((r) => (r.onclick = async (e) => { if (e.target.closest('input')) return; editProduct(await api('GET', '/api/admin/products/' + r.dataset.id)); }));
    $('#imp').onclick = importProducts;
    const picked = () => $$('[data-sel]:checked').map((c) => Number(c.dataset.sel));
    const upd = () => { const n = picked().length; $('#bulk').hidden = !n; $('#bn').textContent = n + ' selected'; };
    $$('[data-sel]').forEach((c) => (c.onchange = upd)); $('#all').onchange = (e) => { $$('[data-sel]').forEach((c) => (c.checked = e.target.checked)); upd(); };
    $$('[data-b]').forEach((b) => (b.onclick = async () => {
      const ids = picked(), k = b.dataset.b; let body = { ids };
      if (k === 'show') body.set = { active: true }; else if (k === 'hide') body.set = { active: false }; else if (k === 'feat') body.set = { featured: true }; else if (k === 'unfeat') body.set = { featured: false };
      else if (k === 'dept') { const n = prompt('Department name:\n' + lookups.cats.map((c) => c.name).join(', ')); const c = lookups.cats.find((x) => x.name.toLowerCase() === String(n || '').trim().toLowerCase()); if (!c) return n && alert('No such department'); body.set = { category_id: c.id }; }
      else if (k === 'sup') { const n = prompt('Supplier name:\n' + lookups.sups.map((c) => c.name).join(', ')); const c = lookups.sups.find((x) => x.name.toLowerCase() === String(n || '').trim().toLowerCase()); if (!c) return n && alert('No such supplier'); body.set = { supplier_id: c.id }; }
      else if (k === 'pct') { const n = prompt('Change prices by what percent? (for example 5 or -10). Locked prices are skipped.'); if (!n) return; body.price_percent = Number(n); }
      try { await api('POST', '/api/admin/products/bulk', body); products(); } catch (e) { fail(e); }
    }));
  }
  function importProducts() {
    const m = modal(`<h2 style="margin-top:0">Import products</h2><p class="hint">Paste rows from Excel or a CSV file. First row = column names. Recognized: <b>name</b>, upc/barcode, sku, name_he, brand, size, price, cost, department, sold by (lb or each), est weight (average pack lb), stock, image, ingredients. Existing items (matched by barcode, SKU or name) are updated; new ones are created.</p>
      <div class="grid2"><div><label class="f">Supplier for these items (optional)</label>${sel('isup', supOpts(), '', 'None')}</div><div><label class="f">Or choose a file</label><input type="file" id="ifile" accept=".csv,.tsv,.txt"></div></div><textarea class="i" id="itext" rows="8" placeholder="name,upc,price,cost,department,sold by,est weight"></textarea><div class="tools" style="margin-top:8px"><button class="btn" id="ipv">Preview</button><button class="btn ghost" id="ix">Close</button></div><div id="iout"></div>`);
    $('#ix', m).onclick = () => m.remove(); $('#ifile', m).onchange = async (e) => { $('#itext', m).value = await e.target.files[0].text(); };
    $('#ipv', m).onclick = async () => {
      try {
        const body = { text: $('#itext', m).value, supplier_id: $('#isup', m).value || null };
        const r = await api('POST', '/api/admin/products/import', body);
        $('#iout', m).innerHTML = `<p><b>${r.create}</b> to add, <b>${r.update}</b> to update, <b>${r.skip}</b> skipped.</p><table><tr><th>Line</th><th>Action</th><th>Name</th><th>Department</th><th class="r">Price</th><th>Problems</th></tr>${r.rows.slice(0, 60).map((x) => `<tr><td>${x.line}</td><td><span class="pill ${x.action === 'skip' ? 'r' : x.action === 'create' ? 'g' : 'o'}">${x.action}</span></td><td>${esc(x.name)}</td><td>${esc(x.category || '')}</td><td class="r">${x.price_cents != null ? money(x.price_cents) : ''}</td><td>${esc(x.errors.join(', '))}</td></tr>`).join('')}</table>${r.create + r.update ? '<button class="btn" id="igo" style="margin-top:10px">Import now</button>' : ''}`;
        $('#igo', m) && ($('#igo', m).onclick = async () => { const d = await api('POST', '/api/admin/products/import', { ...body, commit: true }); alert(`Saved ${d.saved} products.`); m.remove(); products(); });
      } catch (e) { fail(e); }
    };
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
    <div class="grid2"><div><label class="f">Name</label><input class="i" id="name" value="${esc(p.name)}"></div><div><label class="f">Hebrew name (optional)</label><input class="i" id="nameHe" dir="rtl" value="${esc(p.name_he)}"></div></div><div class="grid2"><div><label class="f">Barcode (UPC)</label><div style="display:flex;gap:6px"><input class="i" id="upc" value="${esc(p.upc)}"><button class="btn small ghost" id="lk" type="button">Look up</button></div></div>
    <div><label class="f">Brand</label><input class="i" id="brand" value="${esc(p.brand)}"></div><div><label class="f">Size</label><input class="i" id="size" value="${esc(p.size)}"></div>
    <div><label class="f">Department</label>${sel('cat', catOpts(), p.category_id, 'Choose...')}</div><div><label class="f">Supplier</label>${sel('sup', supOpts(), p.supplier_id, 'None')}</div></div>
    <div class="grid3"><div><label class="f">Sold</label>${sel('by', [['each', 'Per item'], ['lb', 'Per pound']], p.sold_by || 'each')}</div><div><label class="f">Price ($)</label><input class="i" id="price" inputmode="decimal" value="${p.price_cents ? (p.price_cents / 100).toFixed(2) : ''}"></div><div><label class="f">Your cost ($)</label><input class="i" id="cost" inputmode="decimal" value="${p.cost_cents ? (Number(p.cost_cents) / 100).toFixed(2) : ''}"></div></div>
    <div class="grid3"><div><label class="f">Average pack weight (lb)</label><input class="i" id="estw" inputmode="decimal" placeholder="for meat sold as packs, e.g. 1.9" value="${p.est_weight_lb ?? ''}"></div><div></div><div></div></div><p class="hint" style="margin:0">For meat sold as packs: choose "Per pound", enter the price per pound, and the average pack weight. Customers order whole packs; the packer weighs and the customer pays the exact weight.</p>
    <div class="tools"><button class="btn small ghost" id="sug" type="button">Set price from cost + supplier markup</button><span id="mg" class="hint"></span></div>
    <div class="grid3"><div><label class="f">In stock</label><input class="i" id="stock" inputmode="decimal" value="${p.stock ?? 0}"></div><div><label class="f">Low-stock warning at</label><input class="i" id="low" inputmode="decimal" value="${p.low_stock_at ?? 3}"></div><div><label class="f">Kosher supervision</label><input class="i" id="cert" value="${esc(p.kosher_cert)}"></div></div>
    <label class="chk"><input type="checkbox" id="act" ${p.active !== false ? 'checked' : ''}> Show on the website</label><label class="chk"><input type="checkbox" id="feat" ${p.featured ? 'checked' : ''}> Feature on the home page</label><label class="chk"><input type="checkbox" id="trk" ${p.track_stock !== false ? 'checked' : ''}> Track stock (untick for items you never run out of)</label><label class="chk"><input type="checkbox" id="lock" ${p.price_locked ? 'checked' : ''}> Lock price (never changed by markup or Clover sync)</label><label class="chk"><input type="checkbox" id="tax" ${p.taxable ? 'checked' : ''}> Taxable</label>
    <label class="f">Photo link</label><div style="display:flex;gap:8px;align-items:center"><input class="i" id="img" value="${esc(p.image_url)}"><img id="pv" src="${esc(p.image_url || '/static/noimage.svg')}" alt="" style="width:56px;height:56px;object-fit:contain"></div>
    <label class="f">Description</label><textarea class="i" id="desc" rows="2">${esc(p.description)}</textarea><label class="f">Description (Hebrew, optional)</label><textarea class="i" id="descHe" rows="2" dir="rtl">${esc(p.description_he)}</textarea><label class="f">Ingredients</label><textarea class="i" id="ing" rows="2">${esc(p.ingredients)}</textarea>
    <label class="f">Nutrition (per serving)</label><div class="grid3">${[['serving', 'Serving size'], ['calories', 'Calories'], ['fat_g', 'Fat g'], ['sat_fat_g', 'Sat fat g'], ['sodium_mg', 'Sodium mg'], ['carbs_g', 'Carbs g'], ['sugars_g', 'Sugars g'], ['fiber_g', 'Fiber g'], ['protein_g', 'Protein g']].map(([k, l]) => `<input class="i" data-n="${k}" placeholder="${l}" value="${esc(n[k] ?? '')}">`).join('')}</div>
    <div class="tools" style="margin-top:14px"><button class="btn" id="save">Save</button><button class="btn ghost" id="x">Cancel</button></div>`);
    $('#x', m).onclick = () => m.remove();
    const mg = () => { const pr = cents($('#price', m).value), co = cents($('#cost', m).value); $('#mg', m).textContent = pr && co ? `Margin ${Math.round(((pr - co) / pr) * 100)}%` : ''; }; mg(); $('#price', m).oninput = mg; $('#cost', m).oninput = mg;
    $('#img', m).onchange = () => ($('#pv', m).src = $('#img', m).value || '/static/noimage.svg');
    $('#sug', m).onclick = () => { const s = lookups.sups.find((x) => String(x.id) === $('#sup', m).value), co = cents($('#cost', m).value); if (!s || !co) return alert('Pick a supplier and enter your cost first.'); const raw = co * (1 + Number(s.markup_pct) / 100); let c = Math.ceil(raw / 10) * 10 - 1; if (c < raw) c += 10; $('#price', m).value = (c / 100).toFixed(2); mg(); };
    $('#lk', m).onclick = async () => { try { const r = await api('GET', '/api/admin/upc/' + encodeURIComponent($('#upc', m).value)); if (r.exists && r.exists.id !== p.id) return alert('That barcode is already used by: ' + r.exists.name); if (!r.found && !r.draft) return alert('No match found online.'); const d = r.draft || {}; const fill = (id, v) => { if (v && !$(id, m).value) $(id, m).value = v; }; fill('#name', d.name); fill('#brand', d.brand); fill('#size', d.size); fill('#desc', d.description); fill('#ing', d.ingredients); fill('#img', d.image_url); $('#pv', m).src = $('#img', m).value || '/static/noimage.svg'; for (const [k, v] of Object.entries(d.nutrition || {})) { const el = $(`[data-n=${k}]`, m); if (el && !el.value) el.value = v; } } catch (e) { fail(e); } };
    $('#save', m).onclick = async () => {
      const nut = {}; $$('[data-n]', m).forEach((i) => { if (i.value !== '') nut[i.dataset.n] = i.dataset.n === 'serving' ? i.value : Number(i.value); });
      const body = { name: $('#name', m).value, name_he: $('#nameHe', m).value, description_he: $('#descHe', m).value, est_weight_lb: $('#estw', m).value, featured: $('#feat', m).checked, upc: $('#upc', m).value, brand: $('#brand', m).value, size: $('#size', m).value, category_id: $('#cat', m).value, supplier_id: $('#sup', m).value, sold_by: $('#by', m).value, price_cents: cents($('#price', m).value), cost_cents: cents($('#cost', m).value), stock: $('#stock', m).value, low_stock_at: $('#low', m).value, kosher_cert: $('#cert', m).value, active: $('#act', m).checked, track_stock: $('#trk', m).checked, price_locked: $('#lock', m).checked, taxable: $('#tax', m).checked, image_url: $('#img', m).value, description: $('#desc', m).value, ingredients: $('#ing', m).value, nutrition: nut };
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
    main().innerHTML = `<h1>Pickup points</h1><p class="hint">A pickup point is one neighborhood drop on one day at one place (a Chabad house, a community center). Customers choose it at checkout and delivery is free. Use <b>Orders</b> to see who is going there.</p><div class="panel"><div class="grid3"><div><label class="f">Name</label><input class="i" id="lb" placeholder="Orinda Thursday"></div><div><label class="f">Place</label><input class="i" id="lc" placeholder="Orinda Community Center"></div><div><label class="f">Address</label><input class="i" id="ad"></div></div><div class="grid3"><div><label class="f">Delivery date</label><input class="i" id="dd" type="date"></div><div><label class="f">Time window (shown to customers)</label><input class="i" id="wt" placeholder="4:00-5:00 PM"></div><div><label class="f">Order by</label><input class="i" id="co" type="datetime-local"></div></div><button class="btn" id="add" style="margin-top:10px">Add drop</button></div>
    <table><tr><th>Name</th><th>Place</th><th>Date</th><th>Order by</th><th></th></tr>${list.map((c) => `<tr><td>${esc(c.label)} ${c.active ? '' : '<span class="pill">closed</span>'}</td><td>${esc(c.location)}</td><td>${String(c.drop_date).slice(0, 10)} ${esc(c.window_text)}</td><td>${c.cutoff_at ? new Date(c.cutoff_at).toLocaleString([], { timeZone: TZ }) : ''}</td><td class="r"><button class="btn small ghost" data-mf="${c.id}">Orders</button> <button class="btn small ghost" data-tg="${c.id}">${c.active ? 'Close' : 'Reopen'}</button></td></tr>`).join('')}</table>`;
    $$('[data-mf]').forEach((b) => (b.onclick = async () => { const r = await api('GET', `/api/admin/coop/${b.dataset.mf}/manifest`); const m = modal(`<h2 style="margin-top:0">${esc(r.drop.label)}</h2><p>${esc(r.drop.location)} &middot; ${String(r.drop.drop_date).slice(0, 10)} ${esc(r.drop.window_text)}<br><b>${r.orders.length}</b> orders &middot; <b>${r.boxes}</b> boxes</p><table><tr><th>#</th><th>Customer</th><th>Phone</th><th>Status</th><th class="r">Boxes</th><th class="r">Total</th></tr>${r.orders.map((o) => `<tr><td>${o.id}</td><td>${esc(o.name)}</td><td>${esc(o.phone)}</td><td>${tag(o.status)}</td><td class="r">${o.boxes}</td><td class="r">${money(o.total_cents)}</td></tr>`).join('')}</table><button class="btn small ghost" id="cl" style="margin-top:10px">Close</button>`); $('#cl', m).onclick = () => m.remove(); }));
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
