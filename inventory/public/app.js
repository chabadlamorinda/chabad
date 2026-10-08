// Bay Kosher Inventory — the web app (no build step).
'use strict';

// ---------- tiny helpers ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => (n == null || isNaN(n) ? '—' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const money0 = (n) => (n == null || isNaN(n) ? '—' : '$' + Math.round(Number(n)).toLocaleString('en-US'));
const qty = (n, p) => { if (n == null || isNaN(n)) return '—'; const v = Math.round(Number(n) * 100) / 100; return v.toLocaleString('en-US') + (p && p.sold_by_weight ? ' lb' : ''); };
const pct = (n) => (n == null || isNaN(n) ? '—' : Math.round(n * 100) + '%');
const parseDay = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
// "Today" is the store's date (from the server), so labels match the order lists even if this device's clock or time zone differs.
const today0 = () => { if (state.today) return parseDay(state.today); const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
function dayLabel(s) {
  if (!s) return '—';
  const d = parseDay(s), diff = Math.round((d - today0()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function ago(iso) {
  if (!iso) return 'never';
  const t = new Date(/Z|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso.replace(' ', 'T') + 'Z'), s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + ' min ago';
  if (s < 86400) return Math.floor(s / 3600) + ' h ago';
  return t.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
const STATUS = {
  out: ['Out of stock', 'out'], urgent: ['Running low', 'urgent'], order: ['Reorder', 'order'], ok: ['In stock', 'ok'], idle: ['Not selling', 'idle'],
};
const statusPill = (f) => { const s = STATUS[(f && f.status) || 'ok']; return `<span class="pill ${s[1]}">${s[0]}</span>`; };

const I = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.6 12.2a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.5L22 7H6"/>',
  receipt: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  tag: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="8" cy="8" r="1.5"/>',
  truck: '<path d="M2 6h12v10H2zM14 10h4l3 3v3h-7"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>',
  print: '<path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2"/><path d="M6 14h12v7H6z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  download: '<path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v3h16v-3"/>',
  upload: '<path d="M12 16V4m0 0-4 4m4-4 4 4M4 17v3h16v-3"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.5"/>',
  scan: '<path d="M3 7V4h3M21 7V4h-3M3 17v3h3M21 17v3h-3M7 8v8M10 8v8M13 8v8M17 8v8"/>',
  store: '<path d="M3 9 4.5 4h15L21 9M3 9v11h18V9M3 9h18M9 20v-6h6v6"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  logout: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3"/>',
  arrow: '<path d="M9 6l6 6-6 6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
};
const icon = (n, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n] || ''}</svg>`;

// ---------- API ----------
async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    method: opts.method || 'GET',
    headers: { ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}), 'x-requested-with': 'app' },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/login') { showLogin(); throw new Error(data.error || 'Please sign in.'); }
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}
const post = (path, body = {}) => api(path, { method: 'POST', body });
const put = (path, body = {}) => api(path, { method: 'PUT', body });

let toastTimer;
function toast(msg, err = false) {
  let t = $('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
  t.textContent = msg; t.classList.toggle('err', err); t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), err ? 5000 : 2800);
}
async function act(btn, fn) {
  const old = btn && btn.innerHTML;
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>'; }
  try { return await fn(); }
  catch (e) { toast(e.message, true); }
  finally { if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = old; } }
}

// ---------- shell ----------
const NAV = [
  ['home', '#/', 'Home', 'home'],
  ['products', '#/products', 'Products', 'box'],
  ['orders', '#/orders', 'Order lists', 'cart'],
  ['invoices', '#/invoices', 'Invoices', 'receipt'],
  ['prices', '#/prices', 'Prices', 'tag'],
  ['suppliers', '#/suppliers', 'Suppliers', 'truck'],
  ['settings', '#/settings', 'Settings', 'gear'],
];
const MOBILE = ['home', 'products', 'orders', 'invoices', 'settings'];
const state = { store: 'Bay Kosher Market', badges: {} };

function shell() {
  $('#root').innerHTML = `
  <div class="shell">
    <aside class="side">
      <div class="brand"><div class="brand-mark">${icon('cart')}</div><div><div class="brand-name">${esc(state.store)}</div><div class="brand-sub">Inventory</div></div></div>
      <nav class="nav" aria-label="Main">${NAV.map(([k, h, l, i]) => `<a href="${h}" data-nav="${k}">${icon(i)}<span>${l}</span><span class="badge hidden" data-badge="${k}"></span></a>`).join('')}</nav>
      <div class="side-foot" id="sync-foot"></div>
    </aside>
    <main class="main" id="page"></main>
    <nav class="tabbar" aria-label="Main">${NAV.filter((n) => MOBILE.includes(n[0])).map(([k, h, l, i]) => `<a href="${h}" data-nav="${k}">${icon(i)}<span>${l === 'Order lists' ? 'Orders' : l}</span><span class="badge hidden" data-badge="${k}"></span></a>`).join('')}</nav>
  </div>`;
}
function setBadges(b) {
  state.badges = { ...state.badges, ...b };
  for (const [k, n] of Object.entries(state.badges)) for (const el of $$(`[data-badge="${k}"]`)) { el.textContent = n; el.classList.toggle('hidden', !n); }
}
function syncFoot(s) {
  const el = $('#sync-foot'); if (!el || !s) return;
  const last = Object.values(s.tasks || {}).map((t) => t.at).sort().pop();
  const any = Object.values(s.connected || {}).some(Boolean);
  el.innerHTML = any ? `<span class="dot" style="background:var(--brand-2)"></span> Synced ${esc(ago(last))}` : '<span class="dot" style="background:var(--amber)"></span> Not connected yet';
}

function showLogin() {
  closeOverlays();
  $('#root').innerHTML = `
  <div class="login"><form class="card" id="login-form">
    <div class="brand-mark">${icon('cart')}</div>
    <h1>Welcome back</h1><p class="muted" style="margin:0 0 22px">Sign in to your store inventory.</p>
    <label class="f">Password<input class="input" type="password" name="password" autocomplete="current-password" required autofocus></label>
    <p class="small" id="login-err" style="color:var(--red);min-height:20px;margin:8px 0"></p>
    <button class="btn btn-primary" style="width:100%">Sign in</button>
  </form></div>`;
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await post('/login', { password: e.target.password.value }); start(); }
    catch (err) { $('#login-err').textContent = err.message; }
  });
}

// ---------- router ----------
const pages = {};
let current = '';
async function route() {
  const h = location.hash.replace(/^#/, '').split('?')[0] || '/';
  const [, name = '', arg] = h.split('/');
  const key = name || 'home';
  const page = pages[key] || pages.home;
  for (const a of $$('[data-nav]')) a.classList.toggle('on', a.dataset.nav === key);
  if (current !== key || !arg) closeOverlays();
  if (current !== key) { $('#page').innerHTML = '<div class="loading"><span class="spinner"></span></div>'; current = key; window.scrollTo(0, 0); }
  try { await page(arg); } catch (e) { if (!/sign in/i.test(e.message)) $('#page').innerHTML = `<div class="card empty">${icon('alert')}<p>${esc(e.message)}</p></div>`; }
}
const refresh = () => route();

async function start() {
  const me = await api('/me');
  state.store = me.store || state.store;
  state.today = me.today;
  shell();
  syncFoot(me.status);
  window.onhashchange = route;
  await route();
}

// ---------- overlays ----------
function closeOverlays() { $$('.scrim, .drawer, .dialog').forEach((el) => el.remove()); document.body.style.overflow = ''; }
function drawer(html, { onClose, wide } = {}) {
  closeOverlays();
  const scrim = document.createElement('div'); scrim.className = 'scrim';
  const d = document.createElement('div'); d.className = 'drawer' + (wide ? ' wide' : ''); d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true');
  d.innerHTML = html;
  document.body.append(scrim, d); document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => { scrim.classList.add('show'); d.classList.add('show'); });
  const close = () => { scrim.classList.remove('show'); d.classList.remove('show'); setTimeout(() => { scrim.remove(); d.remove(); document.body.style.overflow = ''; }, 200); document.removeEventListener('keydown', onKey); if (onClose) onClose(); };
  const onKey = (e) => { if (e.key === 'Escape' && !$('.dialog')) close(); };
  scrim.onclick = close; document.addEventListener('keydown', onKey);
  for (const b of $$('[data-close]', d)) b.onclick = close;
  return { el: d, close };
}
function dialog(html) {
  return new Promise((resolve) => {
    const scrim = document.createElement('div'); scrim.className = 'scrim'; scrim.style.zIndex = 52;
    const d = document.createElement('form'); d.className = 'dialog'; d.style.zIndex = 53; d.innerHTML = html;
    document.body.append(scrim, d);
    requestAnimationFrame(() => { scrim.classList.add('show'); d.classList.add('show'); const f = $('input,select,textarea', d); if (f) f.focus(); });
    const done = (v) => { scrim.remove(); d.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') done(null); };
    document.addEventListener('keydown', onKey);
    scrim.onclick = () => done(null);
    for (const b of $$('[data-cancel]', d)) b.onclick = () => done(null);
    d.onsubmit = (e) => { e.preventDefault(); done(Object.fromEntries(new FormData(d))); };
  });
}
const confirmBox = (title, text, ok = 'Yes') => dialog(`<h2>${esc(title)}</h2><p class="muted">${esc(text)}</p><div class="actions"><button type="button" class="btn" data-cancel>Cancel</button><button class="btn btn-primary">${esc(ok)}</button></div>`);

// ---------- charts ----------
function barChart(data, { keys = ['v'], colors = ['var(--brand-2)'], height = 140, labelEvery = 7 } = {}) {
  const w = 600, pad = 22, n = data.length || 1;
  const max = Math.max(1, ...data.map((d) => keys.reduce((a, k) => a + (d[k] || 0), 0)));
  const bw = (w - 8) / n, gap = Math.min(4, bw * 0.25);
  let bars = '', labels = '';
  data.forEach((d, i) => {
    let y = height - pad;
    keys.forEach((k, j) => {
      const h = ((d[k] || 0) / max) * (height - pad - 8);
      if (h > 0) { y -= h; bars += `<rect x="${(4 + i * bw + gap / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${(bw - gap).toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${colors[j]}"><title>${esc(d.day)}: ${keys.map((kk) => Math.round(d[kk] || 0)).join(' + ')}</title></rect>`; }
    });
    if ((n - 1 - i) % labelEvery === 0) labels += `<text x="${(4 + i * bw + bw / 2).toFixed(1)}" y="${height - 6}" text-anchor="middle" font-size="11" fill="var(--muted)">${esc(parseDay(d.day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))}</text>`;
  });
  return `<svg class="chart" viewBox="0 0 ${w} ${height}" role="img" aria-label="Sales by day"><line x1="0" x2="${w}" y1="${height - pad}" y2="${height - pad}" stroke="var(--line)"/>${bars}${labels}</svg>`;
}

// ================= HOME =================
pages.home = async () => {
  const d = await api('/dashboard');
  state.today = d.today || state.today;
  setBadges({ invoices: d.invoicesToReview, prices: d.pricesToReview, orders: d.due.filter((g) => dayLabel(g.order_day) === 'Today' || g.urgent).length });
  syncFoot(d.sync);
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const t = d.totals;
  const notConnected = !Object.values(d.sync.connected).some(Boolean);
  $('#page').innerHTML = `
  <div class="page-head"><div><h1>${hello}</h1><p>${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} · ${esc(d.store)}</p></div>
    <div class="row"><button class="btn" id="sync-now">${icon('refresh')} Sync now</button></div></div>
  ${notConnected ? `<div class="info" style="margin-bottom:16px">${icon('info')}<div>Clover, the website and your email are not connected yet. <a href="#/settings">See Settings</a> to connect them${t.products ? '' : ', or load demo data to look around'}.</div></div>` : ''}
  <div class="grid g4" style="margin-bottom:16px">
    <a class="card tile" href="#/orders"><span class="label"><span class="dot" style="background:var(--blue)"></span>Need ordering</span><span class="value num">${t.order + t.urgent + t.out}</span><span class="hint">${d.due.length} supplier list${d.due.length === 1 ? '' : 's'} ready</span></a>
    <a class="card tile" href="#/products?status=out"><span class="label"><span class="dot" style="background:var(--red)"></span>Out of stock</span><span class="value num">${t.out}</span><span class="hint">${t.urgent} more will run out before delivery</span></a>
    <a class="card tile" href="#/invoices"><span class="label"><span class="dot" style="background:var(--gold)"></span>Invoices to check</span><span class="value num">${d.invoicesToReview}</span><span class="hint">${d.pricesToReview} price change${d.pricesToReview === 1 ? '' : 's'} suggested</span></a>
    <div class="card tile"><span class="label"><span class="dot" style="background:var(--brand-2)"></span>Stock value</span><span class="value num">${money0(t.value)}</span><span class="hint">${t.products} products · ${money0(t.retail)} at shelf price</span></div>
  </div>
  <div class="grid wide-left">
    <div class="stack">
      <section class="card">
        <div class="card-head"><h2>Order today &amp; next</h2><a class="btn btn-sm btn-ghost" href="#/orders">All lists ${icon('arrow')}</a></div>
        <div class="list" style="margin-top:8px">${d.due.length ? d.due.map((g) => `
          <a class="list-item" href="#/orders/${g.supplier.id}">
            <div class="conn-icon" style="background:var(--blue-soft);color:var(--blue)">${icon('truck')}</div>
            <div class="grow"><div style="font-weight:600">${esc(g.supplier.name)}</div><div class="small muted">${g.lines} item${g.lines === 1 ? '' : 's'} · about ${money0(g.total)}${g.urgent ? ` · <span style="color:var(--amber);font-weight:600">${g.urgent} urgent</span>` : ''}</div></div>
            <div style="text-align:right"><div style="font-weight:600">${esc(dayLabel(g.order_day))}</div><div class="tiny muted">order day</div></div>
          </a>`).join('') : `<div class="empty">${icon('check')}<div>Nothing to order right now.</div></div>`}</div>
      </section>
      <section class="card">
        <div class="card-head"><h2>Sales, last 4 weeks</h2><div class="legend"><span><span class="dot" style="background:var(--brand-2)"></span>Store</span><span><span class="dot" style="background:var(--web)"></span>Website</span></div></div>
        <div class="card-pad">${barChart(d.salesByDay, { keys: ['store', 'web'], colors: ['var(--brand-2)', 'var(--web)'] })}</div>
      </section>
    </div>
    <div class="stack">
      <section class="card">
        <div class="card-head"><h2>Running out</h2><a class="btn btn-sm btn-ghost" href="#/products?status=low">See all ${icon('arrow')}</a></div>
        <div class="list" style="margin-top:8px">${d.attention.length ? d.attention.map((p) => `
          <button class="list-item" data-product="${p.id}">
            <div class="grow"><div style="font-weight:550">${esc(p.name)}</div><div class="small muted">${qty(p.stock, p)} left · sells ${qty(p.forecast.weekly, p)}/week</div></div>
            ${statusPill(p.forecast)}
          </button>`).join('') : `<div class="empty">${icon('check')}<div>Everything is well stocked.</div></div>`}</div>
      </section>
      <section class="card">
        <div class="card-head"><h2>Best sellers</h2><span class="small muted">last 28 days</span></div>
        <div class="list" style="margin-top:8px">${d.top.length ? d.top.map((p, i) => `
          <button class="list-item" data-product="${p.id}"><span class="muted num" style="width:18px">${i + 1}</span><div class="grow" style="font-weight:550">${esc(p.name)}</div><span class="num">${qty(p.forecast.sold28, p)}</span></button>`).join('') : '<div class="empty">No sales yet.</div>'}</div>
      </section>
      <section class="card">
        <div class="card-head"><h2>Recent activity</h2></div>
        <div class="list" style="margin-top:8px">${d.activity.length ? d.activity.slice(0, 6).map((a) => `
          <div class="list-item"><span class="dot" style="background:${a.ok ? 'var(--brand-2)' : 'var(--red)'}"></span><div class="grow small">${esc(a.message)}</div><span class="tiny muted">${esc(ago(a.at))}</span></div>`).join('') : '<div class="empty small">Sync activity will show here.</div>'}</div>
      </section>
    </div>
  </div>`;
  $('#sync-now').onclick = (e) => act(e.currentTarget, async () => { await post('/sync'); toast('Synced'); refresh(); });
  bindProductLinks();
};

function bindProductLinks(root = document) { for (const b of $$('[data-product]', root)) b.onclick = () => openProduct(Number(b.dataset.product)); }

// ================= PRODUCTS =================
const prodState = { q: '', status: '', category: '', supplier: '' };
pages.products = async () => {
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  if (params.has('status')) prodState.status = params.get('status');
  const [{ products, categories }, { suppliers }] = await Promise.all([api('/products'), api('/suppliers')]);
  const counts = { '': products.length, low: 0, out: 0, idle: 0 };
  for (const p of products) { const s = p.forecast && p.forecast.status; if (['out', 'urgent', 'order'].includes(s)) counts.low++; if (s === 'out') counts.out++; if (s === 'idle') counts.idle++; }
  $('#page').innerHTML = `
  <div class="page-head"><div><h1>Products</h1><p>${products.length} items · one stock count for the store and the website</p></div>
    <div class="row"><button class="btn" id="quick-count">${icon('scan')} Count / receive</button><button class="btn btn-primary" id="add-product">${icon('plus')} Add product</button></div></div>
  <div class="card" style="padding:14px;margin-bottom:14px">
    <div class="row">
      <div class="search grow" style="min-width:220px">${icon('search')}<input class="input" id="q" placeholder="Search name, brand, or scan a barcode" value="${esc(prodState.q)}" autocomplete="off"></div>
      <select class="input" id="cat" style="width:auto"><option value="">All categories</option>${categories.map((c) => `<option ${c === prodState.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      <select class="input" id="sup" style="width:auto"><option value="">All suppliers</option>${suppliers.map((s) => `<option value="${s.id}" ${String(s.id) === prodState.supplier ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}<option value="0" ${prodState.supplier === '0' ? 'selected' : ''}>No supplier</option></select>
    </div>
    <div class="row" style="margin-top:12px">${[['', 'All'], ['low', 'Needs ordering'], ['out', 'Out of stock'], ['idle', 'Not selling']].map(([k, l]) => `<button class="chip ${prodState.status === k ? 'on' : ''}" data-st="${k}">${l} <span class="n">${counts[k]}</span></button>`).join('')}</div>
  </div>
  <div class="card table-wrap" id="ptable"></div>`;
  const draw = () => {
    const q = prodState.q.trim().toLowerCase();
    const list = products.filter((p) => {
      const s = p.forecast && p.forecast.status;
      if (prodState.status === 'low' && !['out', 'urgent', 'order'].includes(s)) return false;
      if (prodState.status && prodState.status !== 'low' && s !== prodState.status) return false;
      if (prodState.category && p.category !== prodState.category) return false;
      if (prodState.supplier && String(p.supplier_id || 0) !== prodState.supplier) return false;
      if (q && !(`${p.name} ${p.brand} ${p.category}`.toLowerCase().includes(q) || [p.sku, p.upc, p.supplier_sku].some((c) => c && c.replace(/^0+/, '') === q.replace(/^0+/, '')))) return false;
      return true;
    });
    $('#ptable').innerHTML = list.length ? `<table class="t"><thead><tr><th>Product</th><th class="r">In stock</th><th class="r hide-sm">Sells / week</th><th class="r hide-sm">Days left</th><th class="r hide-sm">Price</th><th class="hide-sm">Supplier</th><th>Status</th></tr></thead><tbody>
      ${list.slice(0, 500).map((p) => `<tr class="click" data-product="${p.id}">
        <td><div class="name">${esc(p.name)}</div><div class="sub">${esc([p.brand, p.category, p.upc || p.sku].filter(Boolean).join(' · '))}</div></td>
        <td class="r num" style="font-weight:600">${qty(p.stock, p)}</td>
        <td class="r num hide-sm">${p.forecast ? qty(p.forecast.weekly, p) : '—'}</td>
        <td class="r num hide-sm">${p.forecast && p.forecast.days_cover != null ? Math.floor(p.forecast.days_cover) : '—'}</td>
        <td class="r num hide-sm">${money(p.price)}</td>
        <td class="hide-sm small">${esc(p.supplier_name || '—')}</td>
        <td>${statusPill(p.forecast)}</td></tr>`).join('')}</tbody></table>${list.length > 500 ? '<p class="small muted" style="padding:10px 14px">Showing the first 500. Search to narrow down.</p>' : ''}`
      : `<div class="empty">${icon('box')}<div>${products.length ? 'No products match.' : 'No products yet. Connect Clover in Settings, import a spreadsheet, or add one.'}</div>${products.length ? '' : '<div class="row" style="justify-content:center;margin-top:12px"><a class="btn" href="#/settings">Go to Settings</a></div>'}</div>`;
    bindProductLinks($('#ptable'));
  };
  draw();
  $('#q').oninput = (e) => { prodState.q = e.target.value; draw(); };
  $('#q').onkeydown = async (e) => {
    if (e.key !== 'Enter') return;
    const code = e.target.value.trim(); if (!/^\w{4,}$/.test(code)) return;
    const r = await api('/lookup?code=' + encodeURIComponent(code)).catch(() => null);
    if (r && r.product) { openProduct(r.product.id); e.target.select(); }
  };
  $('#cat').onchange = (e) => { prodState.category = e.target.value; draw(); };
  $('#sup').onchange = (e) => { prodState.supplier = e.target.value; draw(); };
  for (const c of $$('[data-st]')) c.onclick = () => { prodState.status = c.dataset.st; history.replaceState(null, '', '#/products'); pages.products(); };
  $('#add-product').onclick = () => editProduct(null, suppliers);
  $('#quick-count').onclick = quickCount;
};

async function openProduct(id) {
  const d = await api('/products/' + id).catch((e) => { toast(e.message, true); return null; });
  if (!d) return;
  const p = d.product, f = d.forecast || {};
  const kindLabel = { sale: 'Sold', return: 'Returned', receive: 'Received', count: 'Counted', adjust: 'Adjusted', initial: 'Starting stock' };
  const srcLabel = { clover: 'Store', web: 'Website', manual: 'You', invoice: 'Invoice', demo: 'Demo' };
  const margin = p.price > 0 ? (p.price - p.cost) / p.price : null;
  const dr = drawer(`
    <div class="drawer-head"><div class="grow"><h2>${esc(p.name)}</h2><div class="small muted">${esc([p.brand, p.category, p.upc || p.sku].filter(Boolean).join(' · '))}</div><div style="margin-top:8px">${statusPill(f)}</div></div>
      <button class="btn btn-icon btn-ghost" data-close aria-label="Close">${icon('x')}</button></div>
    <div class="drawer-body">
      <div class="stats">
        <div class="stat"><div class="k">In stock</div><div class="v num">${qty(p.stock, p)}</div></div>
        <div class="stat"><div class="k">Sells per week</div><div class="v num">${qty(f.weekly, p)}</div></div>
        <div class="stat"><div class="k">Days left</div><div class="v num">${f.days_cover != null ? Math.floor(f.days_cover) : '—'}</div></div>
        <div class="stat"><div class="k">On order</div><div class="v num">${qty(f.on_order || 0, p)}</div></div>
      </div>
      ${f.suggest_qty > 0 ? `<div class="info">${icon('cart')}<div>Order <b>${f.suggest_cases} case${f.suggest_cases === 1 ? '' : 's'}</b> (${qty(f.suggest_qty, p)}) ${d.supplier ? 'from ' + esc(d.supplier.name) + ' ' : ''}on <b>${esc(dayLabel(f.order_day))}</b>. ${f.run_out ? 'At this pace it runs out around ' + esc(dayLabel(f.run_out)) + '.' : ''}</div></div>` : ''}
      <div class="row"><button class="btn grow" data-op="count">${icon('check')} Count</button><button class="btn grow" data-op="receive">${icon('download')} Receive</button><button class="btn grow" data-op="adjust">${icon('edit')} Damaged / other</button></div>
      <section class="card card-pad"><div class="spread" style="margin-bottom:8px"><h3>Sales, last 8 weeks</h3><span class="small muted">${qty(f.sold28, p)} in 28 days</span></div>${barChart(d.sales.map((s) => ({ day: s.day, v: s.qty })), { height: 110 })}</section>
      <section class="card card-pad"><h3 style="margin-bottom:10px">Price</h3>
        <div class="grid g3"><div><div class="small muted">Cost (landed)</div><div style="font-weight:650" class="num">${money(p.cost)}</div></div><div><div class="small muted">Shelf price</div><div style="font-weight:650" class="num">${money(p.price)}</div></div><div><div class="small muted">Margin</div><div style="font-weight:650" class="num">${pct(margin)}</div></div></div>
        ${d.suggested && d.suggested - p.price >= 0.05 ? `<p class="small muted" style="margin:10px 0 0">At your target margin the price would be <b>${money(d.suggested)}</b>.</p>` : ''}
        ${d.prices.length ? `<div class="small" style="margin-top:12px">${d.prices.slice(0, 5).map((h) => `<div class="spread" style="padding:4px 0;border-top:1px solid var(--line)"><span>${h.field === 'cost' ? 'Cost' : 'Price'} ${money(h.old_value)} → <b>${money(h.new_value)}</b> <span class="muted">${esc(h.source)}</span></span><span class="muted tiny">${esc(ago(h.at))}</span></div>`).join('')}</div>` : ''}
      </section>
      <section class="card"><div class="card-head"><h3>Stock history</h3></div><div class="list" style="margin-top:6px">
        ${d.movements.length ? d.movements.slice(0, 25).map((m) => `<div class="list-item small"><span class="num" style="width:64px;font-weight:600;color:${m.qty < 0 ? 'var(--red)' : 'var(--brand)'}">${m.qty > 0 ? '+' : ''}${qty(m.qty)}</span><div class="grow">${esc(kindLabel[m.kind] || m.kind)} · ${esc(srcLabel[m.source] || m.source)}${m.note ? ' <span class="muted">· ' + esc(m.note) + '</span>' : ''}${m.counted === 0 ? ' <span class="muted">(history)</span>' : ''}</div><span class="tiny muted">${esc(new Date(m.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))}</span></div>`).join('') : '<div class="empty small">No history yet.</div>'}
      </div></section>
    </div>
    <div class="drawer-foot"><button class="btn" data-op="edit">${icon('edit')} Edit details</button></div>`);
  for (const b of $$('[data-op]', dr.el)) b.onclick = async () => {
    const op = b.dataset.op;
    if (op === 'edit') { const { suppliers } = await api('/suppliers'); return editProduct(d, suppliers); }
    const titles = { count: ['Count on the shelf', 'How many are there right now? This replaces the stock number.', 'Save count'], receive: ['Receive stock', 'How many came in?', 'Add to stock'], adjust: ['Damaged, expired or other', 'How many to remove? (Use a minus for removing, e.g. -3.)', 'Save'] };
    const [t, txt, ok] = titles[op];
    const r = await dialog(`<h2>${t}</h2><p class="muted">${txt}</p><div class="stack" style="gap:12px"><label class="f">${p.sold_by_weight ? 'Pounds' : 'Quantity'}<input class="input" name="qty" type="number" step="any" inputmode="decimal" required value="${op === 'adjust' ? '-1' : ''}"></label><label class="f">Note (optional)<input class="input" name="note" placeholder="${op === 'adjust' ? 'Expired' : ''}"></label></div><div class="actions"><button type="button" class="btn" data-cancel>Cancel</button><button class="btn btn-primary">${ok}</button></div>`);
    if (!r) return;
    try { await post(`/products/${p.id}/${op}`, { qty: Number(r.qty), note: r.note }); toast('Saved'); openProduct(p.id); if (current === 'products' || current === 'home') refresh(); }
    catch (e) { toast(e.message, true); }
  };
}

function editProduct(d, suppliers) {
  const p = (d && d.product) || { case_size: 1, active: 1, taxable: 0 };
  const v = (k) => esc(p[k] == null ? '' : p[k]);
  const ck = (k) => (p[k] ? 'checked' : '');
  const dr = drawer(`
    <div class="drawer-head"><div class="grow"><h2>${d ? 'Edit product' : 'New product'}</h2><div class="small muted">Changes to the price are sent to Clover and to the website.</div></div><button class="btn btn-icon btn-ghost" data-close aria-label="Close">${icon('x')}</button></div>
    <form class="drawer-body" id="pf">
      <fieldset class="form-grid"><legend>Basics</legend>
        <label class="f full">Name<input class="input" name="name" value="${v('name')}" required></label>
        <label class="f">Barcode (UPC)<input class="input" name="upc" value="${v('upc')}"></label>
        <label class="f">SKU / PLU<input class="input" name="sku" value="${v('sku')}"></label>
        <label class="f">Category<input class="input" name="category" value="${v('category')}"></label>
        <label class="f">Subcategory<input class="input" name="subcategory" value="${v('subcategory')}"></label>
        <label class="f">Brand<input class="input" name="brand" value="${v('brand')}"></label>
        <label class="f">Shelf / aisle<input class="input" name="shelf" value="${v('shelf')}"></label>
        ${d ? '' : '<label class="f">Starting stock<input class="input" name="stock" type="number" step="any" value="0"></label>'}
      </fieldset>
      <fieldset class="form-grid"><legend>Supplier &amp; ordering</legend>
        <label class="f">Supplier<select class="input" name="supplier_id"><option value="">—</option>${suppliers.map((s) => `<option value="${s.id}" ${s.id === p.supplier_id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
        <label class="f">Supplier item code<input class="input" name="supplier_sku" value="${v('supplier_sku')}"></label>
        <label class="f">Units in a case<input class="input" name="case_size" type="number" min="1" value="${v('case_size') || 1}"></label>
        <label class="f">Never go below<input class="input" name="min_stock" type="number" min="0" value="${v('min_stock') || 0}"></label>
      </fieldset>
      <fieldset class="form-grid"><legend>Price</legend>
        <label class="f">Cost per unit<input class="input" name="cost" type="number" step="0.0001" min="0" value="${v('cost') || 0}"></label>
        <label class="f">Shelf price<input class="input" name="price" type="number" step="0.01" min="0" value="${v('price') || 0}"></label>
        <label class="f">Target margin % <span class="tiny">(blank = store default)</span><input class="input" name="target_margin" type="number" step="1" min="0" max="90" value="${p.target_margin != null ? Math.round(p.target_margin * 100) : ''}"></label>
      </fieldset>
      <fieldset class="form-grid"><legend>Website details</legend>
        <label class="f">Size<input class="input" name="size" value="${v('size')}" placeholder="6"></label>
        <label class="f">Unit<select class="input" name="unit">${['', 'Oz', 'Ct', 'Pk', 'Lb', 'Gr', 'Pc', 'Ml', 'Ltr', 'Each', 'Lit', 'Tab', 'Pcs'].map((u) => `<option ${u === (p.unit || '') ? 'selected' : ''}>${u}</option>`).join('')}</select></label>
        <label class="f">Est. weight of one (lb)<input class="input" name="est_weight" type="number" step="0.01" value="${v('est_weight')}"></label>
        <label class="f">Weight unit<select class="input" name="est_weight_unit">${['', 'each', 'tray', 'pack', 'bunch', 'bag', 'container'].map((u) => `<option ${u === (p.est_weight_unit || '') ? 'selected' : ''}>${u}</option>`).join('')}</select></label>
        <label class="f full">Other barcodes <span class="tiny">(old or alternate, separated by commas)</span><input class="input" name="additional_skus" value="${v('additional_skus')}"></label>
        <div class="row full" style="gap:18px">
          <label class="check"><input type="checkbox" name="sold_by_weight" ${ck('sold_by_weight')}> Sold by the pound</label>
          <label class="check"><input type="checkbox" name="taxable" ${ck('taxable')}> Taxable</label>
          <label class="check"><input type="checkbox" name="snap" ${ck('snap')}> SNAP / EBT</label>
          <label class="check"><input type="checkbox" name="kosher_passover" ${ck('kosher_passover')}> Kosher for Passover</label>
          <label class="check"><input type="checkbox" name="age_restricted" ${ck('age_restricted')}> Age restricted</label>
          ${d ? `<label class="check"><input type="checkbox" name="active" ${ck('active')}> Active</label>` : ''}
        </div>
        <label class="f full">Notes<textarea class="input" name="notes">${v('notes')}</textarea></label>
      </fieldset>
    </form>
    <div class="drawer-foot"><button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="save-p">Save</button></div>`);
  $('#save-p', dr.el).onclick = (e) => act(e.currentTarget, async () => {
    const form = $('#pf', dr.el);
    if (!form.reportValidity()) return;
    const fd = new FormData(form), body = {};
    for (const [k, val] of fd) body[k] = val;
    for (const k of ['sold_by_weight', 'taxable', 'snap', 'kosher_passover', 'age_restricted', 'active']) if ($(`[name=${k}]`, form)) body[k] = $(`[name=${k}]`, form).checked;
    if (d) { const r = await put('/products/' + p.id, body); toast(r.pushed === 'clover' ? 'Saved and sent to Clover' : 'Saved'); dr.close(); openProduct(p.id); }
    else { const r = await post('/products', body); toast('Product added'); dr.close(); openProduct(r.id); }
    if (current === 'products') pages.products();
  });
}

async function quickCount() {
  const dr = drawer(`
    <div class="drawer-head"><div class="grow"><h2>Count or receive</h2><div class="small muted">Scan a barcode (or type it), then enter the number.</div></div><button class="btn btn-icon btn-ghost" data-close aria-label="Close">${icon('x')}</button></div>
    <div class="drawer-body">
      <div class="row"><button class="chip on" data-mode="count">Shelf count</button><button class="chip" data-mode="receive">Receiving a delivery</button></div>
      <div class="search">${icon('scan')}<input class="input" id="qc-code" placeholder="Scan or type barcode, then Enter" autocomplete="off"></div>
      <div id="qc-item"></div>
      <div class="card"><div class="card-head"><h3>Done this session</h3></div><div class="list" id="qc-done" style="margin-top:6px"><div class="empty small">Nothing yet.</div></div></div>
    </div>`, { onClose: () => { if (current === 'products') pages.products(); } });
  let mode = 'count';
  const done = [];
  for (const c of $$('[data-mode]', dr.el)) c.onclick = () => { mode = c.dataset.mode; $$('[data-mode]', dr.el).forEach((x) => x.classList.toggle('on', x === c)); $('#qc-code', dr.el).focus(); };
  const code = $('#qc-code', dr.el);
  setTimeout(() => code.focus(), 250);
  code.onkeydown = async (e) => {
    if (e.key !== 'Enter') return;
    const r = await api('/lookup?code=' + encodeURIComponent(code.value.trim())).catch(() => null);
    const box = $('#qc-item', dr.el);
    if (!r || !r.product) { box.innerHTML = `<div class="warn">${icon('alert')}<div>No product with barcode ${esc(code.value)}.</div></div>`; code.select(); return; }
    const p = r.product;
    box.innerHTML = `<form class="card card-pad stack" style="gap:12px"><div><div style="font-weight:650">${esc(p.name)}</div><div class="small muted">Now in stock: ${qty(p.stock, p)}</div></div>
      <label class="f">${mode === 'count' ? 'Counted on the shelf' : 'Quantity received'}<input class="input" name="qty" type="number" step="any" inputmode="decimal" required></label>
      <button class="btn btn-primary">${mode === 'count' ? 'Save count' : 'Add to stock'}</button></form>`;
    const f = $('form', box), q = $('[name=qty]', f);
    q.focus();
    f.onsubmit = async (ev) => {
      ev.preventDefault();
      try {
        const res = await post(`/products/${p.id}/${mode}`, { qty: Number(q.value) });
        done.unshift(`${mode === 'count' ? 'Counted' : 'Received'} ${q.value} · ${p.name} → now ${qty(res.product.stock, p)}`);
        $('#qc-done', dr.el).innerHTML = done.map((t) => `<div class="list-item small">${icon('check')}<span>${esc(t)}</span></div>`).join('');
        box.innerHTML = ''; code.value = ''; code.focus();
      } catch (err) { toast(err.message, true); }
    };
  };
}

// ================= ORDER LISTS =================
pages.orders = async (focus) => {
  const { lists, open } = await api('/orders');
  setBadges({ orders: lists.filter((g) => dayLabel(g.order_day) === 'Today' || g.urgent).length });
  $('#page').innerHTML = `
  <div class="page-head"><div><h1>Order lists</h1><p>What to buy from each supplier, based on how fast things sell and when each supplier delivers.</p></div></div>
  ${open.length ? `<section class="card" style="margin-bottom:16px"><div class="card-head"><h2>On the way</h2><span class="small muted">Mark these received when the delivery comes (or apply the invoice)</span></div><div class="list" style="margin-top:8px">
    ${open.map((o) => `<div class="list-item"><div class="conn-icon">${icon('truck')}</div><div class="grow"><div style="font-weight:600">${esc(o.supplier_name || 'Order')} · #${o.id}</div><div class="small muted">${o.lines} items · ${money(o.total)} · expected ${esc(dayLabel(o.expected_at))}</div></div>
      <button class="btn btn-sm" data-recv="${o.id}">Received</button><button class="btn btn-sm btn-ghost btn-danger" data-cancel-po="${o.id}">Cancel</button></div>`).join('')}</div></section>` : ''}
  ${lists.length ? lists.map((g) => orderCard(g)).join('') : `<div class="card empty">${icon('check')}<h2 style="margin:6px 0">All stocked up</h2><div>Nothing needs to be ordered right now.</div></div>`}`;
  for (const g of lists) bindOrderCard(g);
  for (const b of $$('[data-recv]')) b.onclick = (e) => act(e.currentTarget, async () => { await post(`/purchase-orders/${b.dataset.recv}/receive`); toast('Received. Stock updated.'); refresh(); });
  for (const b of $$('[data-cancel-po]')) b.onclick = async () => { if (await confirmBox('Cancel this order?', 'It will no longer count as on the way.', 'Cancel order')) { await post(`/purchase-orders/${b.dataset.cancelPo}/cancel`); refresh(); } };
  if (focus) { const el = $(`#sup-${focus}`); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
};

const reason = (l) => {
  const f = l.forecast;
  if (f.status === 'out') return '';
  if (f.days_cover != null) return `${Math.floor(f.days_cover)} days left`;
  return 'Below minimum';
};
function orderCard(g) {
  const s = g.supplier;
  return `<section class="card order-card" id="sup-${s.id}" style="margin-bottom:16px">
    <div class="card-head" style="flex-wrap:wrap"><div><h2>${esc(s.name)}</h2><div class="small muted">Order ${esc(dayLabel(g.order_day))}${s.order_days ? ' · orders on ' + esc(s.order_days) : ''} · arrives in ${s.lead_time_days} day${s.lead_time_days === 1 ? '' : 's'}</div></div>
      <div style="text-align:right"><div class="num" style="font-size:20px;font-weight:700" data-total>${money(g.total)}</div><div class="tiny muted">estimated</div></div></div>
    ${g.below_min ? `<div class="warn" style="margin:12px 20px 0">${icon('alert')}<div>Below this supplier's ${money0(s.min_order)} minimum order.</div></div>` : ''}
    <div class="table-wrap lines" style="margin-top:8px"><table class="t"><thead><tr><th>Item</th><th class="hide-sm">Why</th><th class="r">Cases</th><th class="r hide-sm">Units</th><th class="r hide-sm">Est.</th></tr></thead><tbody>
      ${g.lines.map((l, i) => `<tr data-i="${i}"><td><div class="name">${esc(l.product.name)}</div><div class="sub">${esc([l.product.supplier_sku && 'Item ' + l.product.supplier_sku, l.product.upc].filter(Boolean).join(' · '))} · ${qty(l.product.stock, l.product)} in stock · sells ${qty(l.forecast.weekly, l.product)}/wk</div></td>
        <td class="hide-sm">${statusPill(l.forecast)} <span class="small muted">${esc(reason(l))}</span></td>
        <td class="r"><span class="qty-box"><button type="button" data-d="-1" aria-label="Less">−</button><input data-cases value="${l.cases}" inputmode="numeric" aria-label="Cases"><button type="button" data-d="1" aria-label="More">+</button></span></td>
        <td class="r num hide-sm" data-units>${qty(l.qty, l.product)}</td><td class="r num hide-sm" data-est>${money(l.est_cost)}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="row no-print" style="padding:14px 20px;border-top:1px solid var(--line)">
      <button class="btn btn-sm" data-o="copy">${icon('copy')} Copy</button>
      ${s.email ? `<button class="btn btn-sm" data-o="email">${icon('mail')} Email</button>` : ''}
      <button class="btn btn-sm" data-o="print">${icon('print')} Print</button>
      ${s.id ? `<a class="btn btn-sm" href="/api/orders/${s.id}/csv">${icon('download')} CSV</a>` : ''}
      <span class="grow"></span>
      ${s.id ? `<button class="btn btn-primary btn-sm" data-o="placed">${icon('check')} Mark as ordered</button>` : '<span class="small muted">Set a supplier on these products to order them.</span>'}
    </div></section>`;
}
function bindOrderCard(g) {
  const card = $(`#sup-${g.supplier.id}`); if (!card) return;
  const recalc = () => {
    let total = 0;
    for (const tr of $$('tr[data-i]', card)) {
      const l = g.lines[tr.dataset.i]; const cs = Math.max(0, Math.round(Number($('[data-cases]', tr).value) || 0));
      l.cases = cs; l.qty = cs * Math.max(1, l.product.case_size || 1); l.est_cost = l.qty * (l.product.cost || 0); total += l.est_cost;
      $('[data-units]', tr).textContent = qty(l.qty, l.product); $('[data-est]', tr).textContent = money(l.est_cost);
    }
    $('[data-total]', card).textContent = money(total);
  };
  for (const tr of $$('tr[data-i]', card)) {
    const inp = $('[data-cases]', tr);
    inp.oninput = recalc;
    for (const b of $$('[data-d]', tr)) b.onclick = () => { inp.value = Math.max(0, (Number(inp.value) || 0) + Number(b.dataset.d)); recalc(); };
  }
  const text = () => `Order for ${g.supplier.name} from ${state.store}\n\n` + g.lines.filter((l) => l.cases > 0).map((l) => `${l.cases} case${l.cases === 1 ? '' : 's'} (${l.qty} units)  ${l.product.name}${l.product.supplier_sku ? '  [item ' + l.product.supplier_sku + ']' : ''}${l.product.upc ? '  UPC ' + l.product.upc : ''}`).join('\n') + '\n\nThank you!';
  for (const b of $$('[data-o]', card)) b.onclick = async () => {
    const o = b.dataset.o;
    if (o === 'copy') { await navigator.clipboard.writeText(text()).then(() => toast('Copied. Paste it into a text or email.'), () => toast('Could not copy', true)); }
    if (o === 'email') location.href = `mailto:${encodeURIComponent(g.supplier.email)}?subject=${encodeURIComponent('Order from ' + state.store)}&body=${encodeURIComponent(text())}`;
    if (o === 'print') { const w = window.open('', '_blank'); if (!w) return toast('Allow pop-ups to print', true); w.document.write(`<title>Order ${esc(g.supplier.name)}</title><pre style="font:14px/1.6 system-ui;white-space:pre-wrap">${esc(text())}</pre>`); w.document.close(); w.print(); }
    if (o === 'placed') {
      const lines = g.lines.filter((l) => l.qty > 0).map((l) => ({ product_id: l.product.id, qty: l.qty }));
      if (!lines.length) return toast('Nothing to order', true);
      if (!(await confirmBox('Mark as ordered?', `${lines.length} items from ${g.supplier.name} will show as "on the way" so they are not suggested again.`, 'Mark ordered'))) return;
      await act(b, async () => { await post('/orders', { supplier_id: g.supplier.id, lines }); toast('Order saved'); refresh(); });
    }
  };
}

// ================= INVOICES =================
let invTab = 'review';
pages.invoices = async (id) => {
  const d = await api('/invoices');
  const n = { review: 0, applied: 0, ignored: 0 };
  for (const i of d.invoices) n[i.status] = (n[i.status] || 0) + 1;
  setBadges({ invoices: n.review });
  const list = d.invoices.filter((i) => i.status === invTab);
  $('#page').innerHTML = `
  <div class="page-head"><div><h1>Invoices</h1><p>Supplier invoices from your email are read automatically. Check each one, then apply it to update costs and add the delivery to stock.</p></div></div>
  ${!d.readerReady ? `<div class="info" style="margin-bottom:14px">${icon('info')}<div>The invoice reader is not switched on yet. Add <b>ANTHROPIC_API_KEY</b> (see Settings).</div></div>` : ''}
  ${d.readerReady && !d.emailReady ? `<div class="info" style="margin-bottom:14px">${icon('mail')}<div>Email is not connected, so invoices are not picked up automatically yet. You can still upload them below.</div></div>` : ''}
  <label class="drop" id="drop" style="display:block;margin-bottom:16px">${icon('upload')}<div style="font-weight:600;margin-top:6px">Drop an invoice here, or tap to choose</div><div class="small muted">PDF or a photo of a paper invoice</div><input type="file" id="file" accept="application/pdf,image/*" multiple hidden></label>
  <div class="row" style="margin-bottom:12px">${[['review', 'To check'], ['applied', 'Applied'], ['ignored', 'Ignored']].map(([k, l]) => `<button class="chip ${invTab === k ? 'on' : ''}" data-tab="${k}">${l} <span class="n">${n[k] || 0}</span></button>`).join('')}</div>
  <div class="card">${list.length ? `<div class="list">${list.map((i) => `
    <a class="list-item" href="#/invoices/${i.id}"><div class="conn-icon">${icon(i.kind === 'shipping_charge' ? 'truck' : 'receipt')}</div>
      <div class="grow"><div style="font-weight:600">${esc(i.supplier || i.supplier_name || 'Unknown supplier')} ${i.number ? '· ' + esc(i.number) : ''}</div>
      <div class="small muted">${i.kind === 'shipping_charge' ? 'Shipping charge' : `${i.lines} lines`}${i.unmatched ? ` · <span style="color:var(--amber)">${i.unmatched} need a product</span>` : ''} · ${esc(i.date || ago(i.created_at))}${i.source === 'email' ? ' · from email' : ''}</div></div>
      <div style="text-align:right"><div class="num" style="font-weight:650">${money(i.total)}</div><span class="pill ${i.status}">${i.status === 'review' ? 'To check' : i.status}</span></div></a>`).join('')}</div>`
    : `<div class="empty">${icon('receipt')}<div>${invTab === 'review' ? 'No invoices waiting.' : 'Nothing here yet.'}</div></div>`}</div>`;
  for (const c of $$('[data-tab]')) c.onclick = () => { invTab = c.dataset.tab; pages.invoices(); };
  const drop = $('#drop'), file = $('#file');
  const upload = async (files) => {
    if (!files.length) return;
    drop.innerHTML = '<span class="spinner"></span><div style="margin-top:8px">Reading the invoice… this takes a few seconds.</div>';
    try {
      const payload = await Promise.all([...files].slice(0, 5).map((f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res({ name: f.name, type: f.type, data: String(r.result).split(',')[1] }); r.onerror = rej; r.readAsDataURL(f); })));
      const r = await post('/invoices/upload', { files: payload, subject: files[0].name });
      if (!r.id) { toast(r.message || 'Nothing found', true); return pages.invoices(); }
      toast('Invoice read'); location.hash = '#/invoices/' + r.id;
    } catch (e) { toast(e.message, true); pages.invoices(); }
  };
  file.onchange = () => upload(file.files);
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); upload(e.dataTransfer.files); };
  if (id) openInvoice(Number(id));
};

async function openInvoice(id) {
  const [d, { suppliers }, { products }] = await Promise.all([api('/invoices/' + id), api('/suppliers'), api('/products')]);
  const i = d.invoice, editable = i.status === 'review';
  const opts = (sel) => `<option value="">— choose product —</option>` + products.map((p) => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.name)}${p.upc ? ' · ' + esc(p.upc) : ''}</option>`).join('');
  const change = (l) => { if (l.landed_unit_cost == null || !l.old_cost) return ''; const c = (l.landed_unit_cost - l.old_cost) / l.old_cost * 100; if (Math.abs(c) < 0.5) return '<span class="tiny muted">same</span>'; return `<span class="tiny ${c > 0 ? 'up' : 'down'}">${c > 0 ? '▲' : '▼'} ${Math.abs(c).toFixed(0)}%</span>`; };
  const dr = drawer(`
    <div class="drawer-head"><div class="grow"><h2>${esc(i.supplier || i.supplier_name || 'Invoice')} ${i.number ? '· ' + esc(i.number) : ''}</h2><div class="small muted">${esc(i.email_subject || '')} ${i.date ? '· ' + esc(i.date) : ''}</div><div style="margin-top:8px"><span class="pill ${i.status}">${i.status === 'review' ? 'To check' : esc(i.status)}</span></div></div><button class="btn btn-icon btn-ghost" data-close aria-label="Close">${icon('x')}</button></div>
    <div class="drawer-body">
      ${i.kind === 'shipping_charge' ? `<div class="info">${icon('truck')}<div>This is a shipping charge of <b>${money(i.shipping || i.total)}</b>${i.attached_to ? ` and was added to invoice #${i.attached_to}.` : '. Choose the invoice it belongs to; it will be spread over that delivery\'s items.'}</div></div>
        ${!i.attached_to ? `<div class="row"><select class="input grow" id="attach-to">${d.targets.map((t) => `<option value="${t.id}">${esc(t.supplier_name)} ${esc(t.number)} ${esc(t.date)}</option>`).join('')}</select><button class="btn btn-primary" id="attach">Add shipping</button></div>` : ''}` : `
      <div class="form-grid">
        <label class="f">Supplier<select class="input" id="inv-sup" ${editable ? '' : 'disabled'}><option value="">— choose —</option>${suppliers.map((s) => `<option value="${s.id}" ${s.id === i.supplier_id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
        <label class="f">Shipping &amp; delivery charges<input class="input" id="inv-ship" type="number" step="0.01" value="${i.shipping || 0}" ${editable ? '' : 'disabled'}></label>
      </div>
      <div class="card table-wrap"><table class="t"><thead><tr><th>Invoice line</th><th>Product</th><th class="r">Qty</th><th class="r">New cost / unit</th></tr></thead><tbody>
        ${d.lines.map((l) => `<tr data-line="${l.id}"><td style="min-width:160px"><div class="name small">${esc(l.description)}</div><div class="sub">${esc([l.supplier_sku, l.upc, money(l.line_total), l.match && 'matched by ' + l.match].filter(Boolean).join(' · '))}</div></td>
          <td style="min-width:150px">${editable ? `<select class="input input-sm" data-f="product_id">${opts(l.product_id)}</select>` : esc(l.product ? l.product.name : '—')}</td>
          <td class="r" style="white-space:nowrap">${editable ? `<input class="input input-sm num" style="width:64px;text-align:right" data-f="qty" value="${l.qty}"> <select class="input input-sm" style="width:auto" data-f="uom">${['each', 'case', 'lb'].map((u) => `<option ${u === l.uom ? 'selected' : ''}>${u}</option>`).join('')}</select>${l.uom === 'case' ? ` <span class="tiny muted">× <input class="input input-sm num" style="width:52px" data-f="pack_size" value="${l.pack_size || (l.product && l.product.case_size) || ''}"></span>` : ''}` : `${l.qty} ${esc(l.uom)}`}<div class="tiny muted">= ${qty(l.units)} units</div></td>
          <td class="r num"><div style="font-weight:650">${money(l.landed_unit_cost)}</div>${l.old_cost != null ? `<div class="tiny muted">was ${money(l.old_cost)}</div>` : ''}${change(l)}</td></tr>`).join('')}
      </tbody></table></div>
      ${d.lines.some((l) => !l.product_id) && editable ? `<div class="warn">${icon('alert')}<div>Lines without a product are skipped. Choose a product, or leave them (e.g. for supplies you don't sell).</div></div>` : ''}
      <div class="spread small muted"><span>Goods ${money(d.lines.reduce((a, l) => a + l.line_total, 0))} + shipping ${money(i.shipping)}</span><span>Invoice total <b>${money(i.total)}</b></span></div>
      ${editable ? '<label class="check"><input type="checkbox" id="inv-recv" checked> This delivery arrived: add these items to stock</label>' : ''}`}
    </div>
    ${editable && i.kind !== 'shipping_charge' ? `<div class="drawer-foot"><button class="btn btn-ghost btn-danger" id="inv-ignore">Ignore</button><span class="grow"></span><button class="btn btn-primary" id="inv-apply">${icon('check')} Apply invoice</button></div>` : ''}`,
  { wide: true, onClose: () => { if (location.hash.startsWith('#/invoices/')) history.replaceState(null, '', '#/invoices'); } });
  const reopen = () => openInvoice(id);
  if (editable) {
    const sup = $('#inv-sup', dr.el), ship = $('#inv-ship', dr.el);
    if (sup) sup.onchange = async () => { await put('/invoices/' + id, { supplier_id: sup.value || null }); };
    if (ship) ship.onchange = async () => { await put('/invoices/' + id, { shipping: Number(ship.value) || 0 }); reopen(); };
    for (const tr of $$('tr[data-line]', dr.el)) for (const f of $$('[data-f]', tr)) f.onchange = async () => {
      try { await put(`/invoices/${id}/lines/${tr.dataset.line}`, { [f.dataset.f]: f.value === '' ? null : f.dataset.f === 'uom' ? f.value : Number(f.value) }); reopen(); } catch (e) { toast(e.message, true); }
    };
    const apply = $('#inv-apply', dr.el);
    if (apply) apply.onclick = (e) => act(e.currentTarget, async () => {
      const r = await post(`/invoices/${id}/apply`, { receive: $('#inv-recv', dr.el).checked });
      toast(`Applied. ${r.received || 0} items received, costs updated.`); dr.close(); pages.invoices();
      const pr = await api('/prices'); if (pr.review.length) setTimeout(() => toast(`${pr.review.length} price change${pr.review.length === 1 ? '' : 's'} suggested. See Prices.`), 3000);
    });
    const ign = $('#inv-ignore', dr.el);
    if (ign) ign.onclick = async () => { await post(`/invoices/${id}/ignore`); toast('Ignored'); dr.close(); pages.invoices(); };
  }
  const att = $('#attach', dr.el);
  if (att) att.onclick = (e) => act(e.currentTarget, async () => { await post(`/invoices/${id}/attach`, { target: Number($('#attach-to', dr.el).value) }); toast('Shipping added'); dr.close(); pages.invoices(); });
}

// ================= PRICES =================
pages.prices = async () => {
  const d = await api('/prices');
  setBadges({ prices: d.review.length });
  $('#page').innerHTML = `
  <div class="page-head"><div><h1>Prices</h1><p>When an invoice raises a cost, or an item's margin is below target (${pct(d.default_margin)} unless set per item), the suggested price shows here. Approved prices go to Clover right away and to the website with its next update.</p></div></div>
  <div class="card table-wrap">${d.review.length ? `<table class="t"><thead><tr><th>Product</th><th class="r">Cost</th><th class="r">Now</th><th class="r hide-sm">Margin now</th><th class="r">New price</th><th></th></tr></thead><tbody>
    ${d.review.map((r) => `<tr data-pid="${r.product.id}"><td><div class="name">${esc(r.product.name)}</div><div class="sub">${esc(r.reasons.join(' · '))}${r.cost_source ? ' · ' + esc(r.cost_source) : ''}</div></td>
      <td class="r num">${money(r.product.cost)}${r.cost_change_pct ? `<div class="tiny ${r.cost_change_pct > 0 ? 'up' : 'down'}">${r.cost_change_pct > 0 ? '▲' : '▼'} ${Math.abs(r.cost_change_pct)}%</div>` : ''}</td>
      <td class="r num">${money(r.product.price)}</td><td class="r num hide-sm">${pct(r.margin_now)}</td>
      <td class="r"><input class="input input-sm num" style="width:90px;text-align:right" value="${r.suggested.toFixed(2)}" data-new aria-label="New price"><div class="tiny muted" data-m>${pct(r.margin_after)} margin</div></td>
      <td class="r" style="white-space:nowrap"><button class="btn btn-sm btn-primary" data-ok>Approve</button> <button class="btn btn-sm btn-ghost" data-keep>Keep</button></td></tr>`).join('')}
  </tbody></table>` : `<div class="empty">${icon('tag')}<h2 style="margin:6px 0">Prices look good</h2><div>No changes needed. New invoices may suggest some.</div></div>`}</div>`;
  for (const tr of $$('tr[data-pid]')) {
    const id = tr.dataset.pid, r = d.review.find((x) => String(x.product.id) === id), inp = $('[data-new]', tr);
    inp.oninput = () => { const v = Number(inp.value); $('[data-m]', tr).textContent = v > 0 ? pct((v - r.product.cost) / v) + ' margin' : ''; };
    $('[data-ok]', tr).onclick = (e) => act(e.currentTarget, async () => { const res = await post('/prices/' + id, { price: Number(inp.value) }); toast(res.pushed === 'clover' ? 'Price updated in Clover' : 'Price updated'); tr.remove(); setBadges({ prices: Math.max(0, (state.badges.prices || 1) - 1) }); });
    $('[data-keep]', tr).onclick = async () => { await post(`/prices/${id}/dismiss`); tr.remove(); setBadges({ prices: Math.max(0, (state.badges.prices || 1) - 1) }); };
  }
};

// ================= SUPPLIERS =================
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
pages.suppliers = async () => {
  const { suppliers } = await api('/suppliers');
  $('#page').innerHTML = `
  <div class="page-head"><div><h1>Suppliers</h1><p>Set which days you order and how long delivery takes. Order lists use this to tell you what to buy and when.</p></div><button class="btn btn-primary" id="add-sup">${icon('plus')} Add supplier</button></div>
  ${suppliers.length ? `<div class="grid g3">${suppliers.map((s) => `
    <button class="card card-pad" data-sup="${s.id}" style="text-align:left;cursor:pointer">
      <div class="spread"><h2>${esc(s.name)}</h2>${s.open_orders ? `<span class="pill order">${s.open_orders} on the way</span>` : ''}</div>
      <div class="small muted" style="margin-top:6px">${s.products} products</div>
      <div class="small" style="margin-top:12px;display:grid;gap:4px">
        <div>${icon('cart', 'ic')} Orders: <b>${esc(s.order_days || 'any day')}</b></div>
        <div>Delivery: <b>${s.lead_time_days} day${s.lead_time_days === 1 ? '' : 's'}</b>${s.min_order ? ` · Minimum ${money0(s.min_order)}` : ''}</div>
        <div class="muted">${esc(s.email || 'No email')}</div>
      </div></button>`).join('')}</div>` : `<div class="card empty">${icon('truck')}<div>Add your suppliers to get order lists for each one.</div></div>`}`;
  $$('.ic').forEach((el) => { el.style.cssText = 'width:14px;height:14px;vertical-align:-2px'; });
  $('#add-sup').onclick = () => editSupplier(null);
  for (const b of $$('[data-sup]')) b.onclick = () => editSupplier(suppliers.find((s) => String(s.id) === b.dataset.sup));
};
function editSupplier(s) {
  s = s || { lead_time_days: 3, min_order: 0, order_days: '' };
  const on = new Set(String(s.order_days || '').split(/[\s,]+/).map((x) => x.slice(0, 3).toLowerCase()));
  const v = (k) => esc(s[k] == null ? '' : s[k]);
  const dr = drawer(`
    <div class="drawer-head"><div class="grow"><h2>${s.id ? esc(s.name) : 'New supplier'}</h2></div><button class="btn btn-icon btn-ghost" data-close aria-label="Close">${icon('x')}</button></div>
    <form class="drawer-body" id="sf">
      <div class="form-grid">
        <label class="f full">Name<input class="input" name="name" value="${v('name')}" required></label>
        <label class="f">Contact person<input class="input" name="contact" value="${v('contact')}"></label>
        <label class="f">Phone<input class="input" name="phone" value="${v('phone')}"></label>
        <label class="f full">Email for orders<input class="input" name="email" type="email" value="${v('email')}"></label>
      </div>
      <fieldset><legend>Days you place orders</legend><div class="days">${DAYS.map((d) => `<button type="button" class="chip ${on.has(d.toLowerCase()) ? 'on' : ''}" data-day="${d}">${d}</button>`).join('')}</div><div class="tiny muted" style="margin-top:6px">None selected = you can order any day.</div></fieldset>
      <div class="form-grid">
        <label class="f">Days from order to shelf<input class="input" name="lead_time_days" type="number" min="0" value="${v('lead_time_days')}"></label>
        <label class="f">Minimum order ($)<input class="input" name="min_order" type="number" min="0" step="1" value="${v('min_order')}"></label>
        <label class="f full">Invoice emails come from <span class="tiny">(addresses or @domain, separated by commas)</span><input class="input" name="invoice_senders" value="${v('invoice_senders')}" placeholder="@supplier.com, billing@supplier.com"></label>
        <label class="f full">Notes<textarea class="input" name="notes">${v('notes')}</textarea></label>
      </div>
    </form>
    <div class="drawer-foot">${s.id ? '<button class="btn btn-ghost btn-danger" id="del-s">Delete</button><span class="grow"></span>' : ''}<button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="save-s">Save</button></div>`);
  for (const c of $$('[data-day]', dr.el)) c.onclick = () => c.classList.toggle('on');
  $('#save-s', dr.el).onclick = (e) => act(e.currentTarget, async () => {
    const f = $('#sf', dr.el); if (!f.reportValidity()) return;
    const body = Object.fromEntries(new FormData(f));
    body.order_days = $$('[data-day].on', dr.el).map((c) => c.dataset.day).join(', ');
    if (s.id) await put('/suppliers/' + s.id, body); else await post('/suppliers', body);
    toast('Saved'); dr.close(); pages.suppliers();
  });
  const del = $('#del-s', dr.el);
  if (del) del.onclick = async () => { if (await confirmBox('Delete supplier?', 'Products from this supplier will have no supplier set.', 'Delete')) { await api('/suppliers/' + s.id, { method: 'DELETE' }); dr.close(); pages.suppliers(); } };
}

// ================= SETTINGS =================
pages.settings = async () => {
  const [{ settings, status }, { log }] = await Promise.all([api('/settings'), api('/activity')]);
  syncFoot(status);
  const c = status.connected, t = status.tasks || {};
  const last = (k) => (t[k] ? `${t[k].ok ? '' : '⚠ '}${esc(t[k].message || 'OK')} · ${esc(ago(t[k].at))}` : '');
  const conn = (on, ic, title, text, extra = '') => `<div class="conn ${on ? 'on' : ''}"><div class="conn-icon">${icon(ic)}</div><div class="grow"><div class="spread"><div style="font-weight:600">${title}</div><span class="pill ${on ? 'ok' : 'idle'}">${on ? 'Connected' : 'Not set up'}</span></div><div class="small muted">${text}</div>${extra ? `<div class="small" style="margin-top:4px">${extra}</div>` : ''}</div></div>`;
  $('#page').innerHTML = `
  <div class="page-head"><div><h1>Settings</h1><p>Connections, store preferences, and importing your products.</p></div><button class="btn" id="sync-all">${icon('refresh')} Sync everything now</button></div>
  <div class="grid g2">
    <div class="stack">
      <section class="card"><div class="card-head"><h2>Connections</h2></div><div style="margin-top:8px">
        ${conn(c.clover, 'store', 'Clover (register)', 'Reads every sale and sends back the combined stock count every 10 minutes. New Clover items are added automatically.', [last('clover_sales'), last('clover_stock')].filter(Boolean).join('<br>'))}
        ${conn(c.webOrders, 'globe', 'Website orders (My Cloud Grocer)', 'Reads paid online orders and takes them out of stock.', last('web_orders'))}
        ${conn(c.webFtp, 'upload', 'Website product update', 'Sends products, prices and stock to the website every hour.', last('web_upload') || (status.lastUpload ? 'Last sent ' + esc(ago(status.lastUpload)) : ''))}
        ${conn(c.email, 'mail', 'Email (invoices)', 'Checks your inbox every 30 minutes for supplier invoices and shipping charges.', last('email'))}
        ${conn(c.claude, 'sparkle', 'Invoice reader', 'Reads invoices (PDF, photo or email text) and pulls out each item and its cost.')}
      </div>
      <div class="small muted" style="padding:12px 20px 18px">Connections are set up in the hosting dashboard (Render → Environment). The step-by-step guide is in <b>inventory/README.md</b>.</div></section>
      <section class="card card-pad"><h2 style="margin-bottom:6px">Bring in products</h2><p class="small muted" style="margin-top:0">Products come in from Clover automatically. You can also add or update many at once from a spreadsheet (CSV) with columns like: name, upc, sku, category, brand, supplier, supplier_sku, case_size, cost, price, stock.</p>
        <div class="row"><label class="btn">${icon('upload')} Import CSV<input type="file" id="csv" accept=".csv,text/csv" hidden></label>
        <a class="btn" href="/api/export/products.csv">${icon('download')} Products CSV</a>
        <a class="btn" href="/api/export/website.csv">${icon('download')} Website file</a>
        ${c.clover ? `<button class="btn" id="clover-refresh">${icon('refresh')} Refresh from Clover</button>` : ''}</div>
        <div id="demo-slot"></div>
      </section>
    </div>
    <div class="stack">
      <form class="card card-pad stack" id="setf" style="gap:14px"><h2>Store preferences</h2>
        <div class="form-grid">
          <label class="f full">Store name<input class="input" name="store_name" value="${esc(settings.store_name)}"></label>
          <label class="f">Target margin %<input class="input" name="default_margin" type="number" min="0" max="90" value="${Math.round(Number(settings.default_margin) * 100)}"></label>
          <label class="f">Price endings<select class="input" name="price_rounding">${[['smart', 'Friendly (.x9 / .49 / .99)'], ['0.99', 'Always .99'], ['none', 'Exact to the cent']].map(([v, l]) => `<option value="${v}" ${settings.price_rounding === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="f">Extra days of safety stock<input class="input" name="safety_days" type="number" min="0" value="${esc(settings.safety_days)}"></label>
          <label class="f">Flag cost jumps over %<input class="input" name="price_alert_pct" type="number" min="0" value="${esc(settings.price_alert_pct)}"></label>
          <label class="f">Reorder every (days) <span class="tiny">for suppliers with no set days</span><input class="input" name="review_days" type="number" min="1" value="${esc(settings.review_days)}"></label>
          <label class="f">Website file name<input class="input" name="web_store_file_prefix" value="${esc(settings.web_store_file_prefix)}"></label>
        </div>
        <label class="check"><input type="checkbox" name="auto_apply_costs" ${settings.auto_apply_costs === '1' ? 'checked' : ''}> Update product costs when an invoice is applied</label>
        <label class="check"><input type="checkbox" name="push_stock_to_clover" ${settings.push_stock_to_clover === '1' ? 'checked' : ''}> Send the combined stock count to Clover</label>
        <label class="check"><input type="checkbox" name="push_prices_to_clover" ${settings.push_prices_to_clover === '1' ? 'checked' : ''}> Send approved price changes to Clover</label>
        <label class="check"><input type="checkbox" name="web_unattended_mode" ${settings.web_unattended_mode === '1' ? 'checked' : ''}> Only import website orders processed by the Cashier module</label>
        <label class="check"><input type="checkbox" name="email_known_senders_only" ${settings.email_known_senders_only === '1' ? 'checked' : ''}> Only read emails from known supplier addresses</label>
        <div class="row"><button class="btn btn-primary">Save preferences</button>
          <span class="grow"></span>
          <select class="input" id="theme" style="width:auto" aria-label="Appearance"><option value="">Match device</option><option value="light">Light</option><option value="dark">Dark</option></select>
          <button type="button" class="btn btn-ghost" id="logout">${icon('logout')} Sign out</button></div>
      </form>
      <section class="card"><div class="card-head"><h2>Activity</h2></div><div class="list" style="margin-top:8px;max-height:420px;overflow:auto">${log.length ? log.map((a) => `<div class="list-item"><span class="dot" style="background:${a.ok ? 'var(--brand-2)' : 'var(--red)'}"></span><div class="grow small">${esc(a.message)}</div><span class="tiny muted">${esc(ago(a.at))}</span></div>`).join('') : '<div class="empty small">Nothing yet.</div>'}</div></section>
    </div>
  </div>`;
  $('#sync-all').onclick = (e) => act(e.currentTarget, async () => { await post('/sync'); toast('Sync finished'); pages.settings(); });
  $('#setf').onsubmit = (e) => { e.preventDefault(); act($('button.btn-primary', e.target), async () => {
    const f = e.target, body = Object.fromEntries(new FormData(f));
    body.default_margin = String(Number(body.default_margin) / 100);
    for (const k of ['auto_apply_costs', 'push_stock_to_clover', 'push_prices_to_clover', 'web_unattended_mode', 'email_known_senders_only']) body[k] = f[k].checked ? '1' : '0';
    await put('/settings', body); state.store = body.store_name || state.store; toast('Saved');
  }); };
  $('#theme').value = localStore('theme') || '';
  $('#theme').onchange = (e) => { localStore('theme', e.target.value); applyTheme(); };
  $('#logout').onclick = async () => { await post('/logout'); showLogin(); };
  $('#csv').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const r = await post('/import/products', { csv: await f.text() }); toast(`${r.created} added, ${r.updated} updated`); }
    catch (err) { toast(err.message, true); }
  };
  const cr = $('#clover-refresh');
  if (cr) cr.onclick = (e) => act(e.currentTarget, async () => { const r = await post('/sync', { task: 'clover_refresh' }); toast(r.result && r.result.error ? r.result.error : 'Updated from Clover', !!(r.result && r.result.error)); });
  const { products } = await api('/products');
  if (!products.length) {
    $('#demo-slot').innerHTML = `<div class="info" style="margin-top:14px">${icon('sparkle')}<div class="grow">Want to look around first? Load sample products, suppliers and invoices.<div style="margin-top:8px"><button class="btn btn-sm" id="demo">Load demo data</button></div></div></div>`;
    $('#demo').onclick = (e) => act(e.currentTarget, async () => { await post('/demo'); toast('Demo data loaded'); location.hash = '#/'; });
  }
};

// ---------- theme ----------
function localStore(k, v) { try { if (v === undefined) return localStorage.getItem('bkinv.' + k); if (v) localStorage.setItem('bkinv.' + k, v); else localStorage.removeItem('bkinv.' + k); } catch { return null; } }
function applyTheme() { const t = localStore('theme'); if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }
applyTheme();

start().catch(() => {});
