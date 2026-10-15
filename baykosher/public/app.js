// Storefront behavior (English + Hebrew): cart, search-as-you-type, checkout, account. No framework, no build step.
(() => {
  'use strict';
  const TZ = 'America/Los_Angeles'; // always show the store's local time
  const LANG = document.documentElement.lang === 'he' ? 'he' : 'en';
  const P = LANG === 'he' ? '/he' : '';
  const LOC = LANG === 'he' ? 'he-IL' : 'en-US';
  const HE = window.__HE || {};
  const t = (k, v) => { let s = LANG === 'he' && HE[k] ? HE[k] : k; if (v) for (const x in v) s = s.split('{' + x + '}').join(v[x]); return s; };
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (c) => '$' + (c / 100).toFixed(2);
  const num = (n) => String(Math.round(Number(n) * 100) / 100);
  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
  const api = async (method, url, body) => {
    const r = await fetch(url, { method, headers: { 'X-Lang': LANG, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || t('Something went wrong. Please try again.')), { status: r.status });
    return j;
  };
  function toast(msg) { const x = document.createElement('div'); x.className = 'toast'; x.setAttribute('role', 'status'); x.textContent = msg; document.body.append(x); setTimeout(() => x.remove(), 2200); }
  try { document.cookie = 'bk_lang=' + LANG + '; Path=/; Max-Age=31536000; SameSite=Lax'; } catch {}
  $$('[data-setlang]').forEach((a) => a.addEventListener('click', () => { try { document.cookie = 'bk_lang=' + a.dataset.setlang + '; Path=/; Max-Age=31536000; SameSite=Lax'; } catch {} }));

  // ---------- cart (kept in this browser; saved to the server so we can remind people who leave) ----------
  const cartId = (() => { let id = store.get('bk_cartid', null); if (!id) { id = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join(''); store.set('bk_cartid', id); } return id; })();
  let items = store.get('bk_cart', []); // [{product_id, qty}]
  let contact = store.get('bk_contact', {});
  let saveTimer;
  // loose weighed items move in half pounds; whole items and packs move by one
  const step = (by, pack) => (by === 'lb' && !Number(pack) ? 0.5 : 1);
  const unitOf = (by, pack, q) => (by === 'lb' && !Number(pack) ? ' ' + t('lb') : Number(pack) ? ' ' + t(Number(q) === 1 ? 'pack' : 'packs') : '');
  function saveCart() {
    store.set('bk_cart', items); renderBadges();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => api('PUT', '/api/cart/' + cartId, { items, email: contact.email, phone: contact.phone, sms_ok: contact.sms_ok }).catch(() => {}), 1500);
  }
  const qtyOf = (id) => (items.find((i) => i.product_id === id) || {}).qty || 0;
  function setQty(id, qty) { items = items.filter((i) => i.product_id !== id); if (qty > 0) items.push({ product_id: id, qty }); saveCart(); syncCards(); }
  function renderBadges() { const el = $('#cartcount'); if (el) { el.hidden = !items.length; el.textContent = items.length; } }
  function syncCards() {
    $$('.card[data-id], .addrow').forEach((root) => {
      const btn = $('[data-add]', root) || $('.stepper', root);
      if (!btn) return;
      const id = Number(root.dataset.id || btn.dataset.add || btn.dataset.sid);
      const by = btn.dataset.by, pack = btn.dataset.pack, name = btn.dataset.name, q = qtyOf(id);
      if (q > 0) {
        if (!btn.classList.contains('stepper')) {
          const s = document.createElement('div'); s.className = 'stepper'; s.dataset.sid = id; s.dataset.by = by; s.dataset.pack = pack; s.dataset.name = name;
          s.innerHTML = `<button aria-label="${esc(t('Remove one'))}" data-dec>&minus;</button><span aria-live="polite">${q}${unitOf(by, pack, q)}</span><button aria-label="${esc(t('Add one'))}" data-inc>+</button>`;
          btn.replaceWith(s);
        } else $('span', btn).textContent = q + unitOf(by, pack, q);
      } else if (btn.classList.contains('stepper')) {
        const b = document.createElement('button'); b.className = 'btn add'; b.dataset.add = id; b.dataset.by = by; b.dataset.pack = pack; b.dataset.name = name; b.textContent = by === 'lb' && !Number(pack) ? t('Add (1 lb)') : root.classList.contains('addrow') ? t('Add to cart') : t('Add');
        btn.replaceWith(b);
      }
    });
    minibar();
  }
  async function minibar() {
    let bar = $('#minibar');
    if (!items.length || /^(\/he)?\/(cart|checkout)/.test(location.pathname)) { if (bar) bar.classList.remove('show'); return; }
    if (!bar) { bar = document.createElement('a'); bar.id = 'minibar'; bar.className = 'minibar'; bar.href = P + '/cart'; document.body.append(bar); }
    try { const p = await api('POST', '/api/cart/price', { items }); bar.innerHTML = `<span>${t('{n} items', { n: p.lines.length })}</span><span>${t('View cart')} &middot; ${money(p.subtotal_cents)}</span>`; bar.classList.add('show'); } catch {}
  }
  document.addEventListener('click', (e) => {
    const add = e.target.closest('[data-add]'), inc = e.target.closest('[data-inc]'), dec = e.target.closest('[data-dec]');
    if (add) { setQty(Number(add.dataset.add), step(add.dataset.by, add.dataset.pack) * (add.dataset.by === 'lb' && !Number(add.dataset.pack) ? 2 : 1)); toast(t('Added to cart')); }
    else if (inc || dec) { const s = e.target.closest('.stepper'); if (!s.dataset.sid) return; const id = Number(s.dataset.sid), st = step(s.dataset.by, s.dataset.pack); setQty(id, Math.max(0, qtyOf(id) + (inc ? st : -st))); }
  });

  // ---------- Passover-only switch (remembered in a cookie; the server filters every page) ----------
  const setPassover = (on) => { try { document.cookie = 'bk_passover=' + (on ? '1' : '0') + '; Path=/; Max-Age=' + (on ? 7776000 : 0) + '; SameSite=Lax'; } catch {} location.reload(); };
  const passoverOn = /(?:^|;\s*)bk_passover=1/.test(document.cookie);
  $('#passovertoggle')?.addEventListener('click', (e) => { e.preventDefault(); setPassover(!passoverOn); });
  $('#passoveroff')?.addEventListener('click', (e) => { e.preventDefault(); setPassover(false); });

  // ---------- header: departments, search suggestions, subscribe ----------
  $('#deptbtn')?.addEventListener('click', (e) => { e.preventDefault(); const d = $('#dept'); d.hidden = !d.hidden; });
  $$('select[data-autosubmit]').forEach((s) => s.addEventListener('change', () => s.form.submit()));
  const q = $('#q'), box = $('#suggest');
  let st;
  q?.addEventListener('input', () => {
    clearTimeout(st);
    const v = q.value.trim();
    if (v.length < 2) { box.hidden = true; return; }
    st = setTimeout(async () => {
      try {
        const r = await api('GET', '/api/suggest?q=' + encodeURIComponent(v) + (passoverOn ? '&passover=1' : ''));
        if (q.value.trim() !== v) return;
        box.innerHTML = r.map((p) => `<a href="${P}/p/${p.id}-${esc(p.slug)}"><img src="${esc(p.image_url || '/static/noimage.svg')}" alt=""><span>${esc(p.name)}</span><small>${money(p.price_cents)}${p.sold_by === 'lb' ? '/' + t('lb') : ''}</small></a>`).join('') + `<a href="${P}/search?q=${encodeURIComponent(v)}"><span>${esc(t('See all results for "{q}"', { q: v }))}</span></a>`;
        box.hidden = false;
      } catch {}
    }, 180);
  });
  document.addEventListener('click', (e) => { if (box && !e.target.closest('.search')) box.hidden = true; });
  $('#subform')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('POST', '/api/subscribe', { email: e.target.email.value }); $('#submsg').textContent = t('Thank you! You are on the list.'); e.target.reset(); } catch (er) { $('#submsg').textContent = er.message; }
  });
  api('GET', '/api/me').then((m) => { if (m.signed_in) { const a = $('#acct'); a.textContent = t('Hi, {name}', { name: (m.customer.name || t('account')).split(' ')[0] }); a.classList.add('ghost'); contact = { ...contact, email: m.customer.email, name: m.customer.name, phone: m.customer.phone }; } }).catch(() => {});

  // ---------- pages rendered in the browser ----------
  const page = $('#app') && $('#app').dataset.page;
  const root = $('#app');
  const priceBits = (p) => { const main = p.est_weight_lb ? p.pack_price_cents : p.price_cents; const was = p.was_cents ? Math.round(p.was_cents * (p.est_weight_lb || 1)) : null; return `${was ? `<b class="sale">${money(main)}</b> <s>${money(was)}</s>` : `<b>${money(main)}</b>`} ${p.est_weight_lb ? `<small>/ ${t('pack')} &middot; <span dir="ltr">${money(p.price_cents)}/${t('lb')}</span></small>` : p.sold_by === 'lb' ? `<small>/ ${t('lb')}</small>` : ''}`; };
  const miniCard = (p) => `<article class="card${p.stock_status === 'out' ? ' out' : ''}" data-id="${p.id}"><a class="img" href="${P}/p/${p.id}-${esc(p.slug)}"><img src="${esc(p.image_url || '/static/noimage.svg')}" alt="${esc(p.name)}" loading="lazy"></a><a class="nm" href="${P}/p/${p.id}-${esc(p.slug)}">${esc(p.name)}</a><div class="pr">${priceBits(p)}</div>${p.stock_status === 'out' ? `<div class="warn">${t('Out of stock')}</div>` : `<button class="btn add" data-add="${p.id}" data-by="${p.sold_by}" data-pack="${p.est_weight_lb ? 1 : 0}" data-name="${esc(p.name)}">${t('Add')}</button>`}</article>`;
  const qtyText = (l) => (l.est_weight_lb ? `${l.qty} &times; ${num(l.est_weight_lb)} ${t('lb')} = ${num(l.qty * l.est_weight_lb)} ${t('lb')}` : `${l.qty}${l.sold_by === 'lb' ? ' ' + t('lb') : ''}`);

  async function cartPage() {
    if (!items.length) { root.innerHTML = `<h1>${t('Your cart')}</h1><p class="empty">${t('Your cart is empty.')} <a href="${P || '/'}">${t('Start shopping')}</a></p>`; return; }
    const p = await api('POST', '/api/cart/price', { items });
    items = p.lines.map((l) => ({ product_id: l.product_id, qty: l.qty })); store.set('bk_cart', items); renderBadges();
    const lines = p.lines.map((l) => `<div class="line" data-id="${l.product_id}"><img src="${esc(l.image_url || '/static/noimage.svg')}" alt=""><div><a href="${P}/p/${l.product_id}-x">${esc(l.name)}</a><div class="hint">${l.est_weight_lb ? `${money(Math.round(l.unit_price_cents * l.est_weight_lb))} / ${t('pack')} (<span dir="ltr">${money(l.unit_price_cents)}/${t('lb')}</span>)` : `${money(l.unit_price_cents)}${l.sold_by === 'lb' ? ' / ' + t('lb') : ''}`}${l.stock_status === 'low' ? ` &middot; <span class="warn">${t('Low stock')}</span>` : ''}</div><div class="stepper" data-sid="${l.product_id}" data-by="${l.sold_by}" data-pack="${l.est_weight_lb ? 1 : 0}"><button data-dec aria-label="${esc(t('Remove one'))}">&minus;</button><span>${l.qty}${unitOf(l.sold_by, l.est_weight_lb ? 1 : 0, l.qty)}</span><button data-inc aria-label="${esc(t('Add one'))}">+</button></div>${l.est_weight_lb ? `<div class="hint">${t('about {w} lb', { w: num(l.qty * l.est_weight_lb) })}</div>` : ''}</div><div class="lt">${money(l.line_cents)}${l.sold_by === 'lb' ? `<div class="hint">${t('est.')}</div>` : ''}<br><button class="rm" data-rm="${l.product_id}">${t('Remove')}</button></div></div>`).join('');
    root.innerHTML = `<h1>${t('Your cart')}</h1>${p.problems.length ? `<div class="notice">${p.problems.map((x) => `${esc(x.name || '')}: ${esc(x.message)}`).join('<br>')}</div>` : ''}<div class="lay"><div class="panel">${lines}</div><aside><div class="panel"><div class="tot"><span>${t('Subtotal')}</span><b>${money(p.subtotal_cents)}</b></div>${p.savings_cents ? `<div class="tot save"><span>${t('You save')}</span><span>${money(p.savings_cents)}</span></div>` : ''}<p class="hint">${t('Items sold by weight are charged for the exact weight we pack. Tax (if any) and delivery are shown at checkout.')}</p><a class="btn big" href="${P}/checkout">${t('Checkout')}</a></div></aside></div><div id="more"></div>`;
    $$('[data-rm]').forEach((b) => b.addEventListener('click', () => { setQty(Number(b.dataset.rm), 0); cartPage(); }));
    $$('.stepper [data-inc],.stepper [data-dec]').forEach((b) => b.addEventListener('click', () => setTimeout(cartPage, 50)));
    const last = items[items.length - 1];
    if (last) api('GET', '/api/products/' + last.product_id).then((d) => { const sug = [...(d.together || []), ...(d.similar || [])].filter((x) => !items.some((i) => i.product_id === x.id)).slice(0, 6); if (sug.length) { $('#more').innerHTML = `<h2>${t('You might also like')}</h2><div class="grid">${sug.map(miniCard).join('')}</div>`; syncCards(); } }).catch(() => {});
  }

  async function checkoutPage() {
    if (!items.length) { location.replace(P + '/cart'); return; }
    const [info, priced, me] = await Promise.all([api('GET', '/api/store'), api('POST', '/api/cart/price', { items }), api('GET', '/api/me')]);
    const cust = me.signed_in ? me.customer : {};
    const S = { mode: 'pickup', slot: null, coop: null, sub: cust.default_sub_pref || 'substitute', quote: null, slots: { pickup: [], delivery: [] }, coops: [], day: null, coupon: store.get('bk_coupon', ''), disc: 0, addr: cust.address || null };
    const fmtDay = (d) => new Date(d + 'T12:00:00').toLocaleDateString(LOC, { weekday: 'short', month: 'short', day: 'numeric' });
    const fmtTime = (iso) => new Date(iso).toLocaleTimeString(LOC, { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
    [S.slots.pickup, S.slots.delivery, S.coops] = await Promise.all([api('GET', '/api/slots?kind=pickup'), api('GET', '/api/slots?kind=delivery'), api('GET', '/api/coop')]);
    if (!S.coops.length) delete S.coops;
    const subtotal = priced.subtotal_cents;
    const subs = [['substitute', 'Substitute something similar', 'We choose the closest match.'], ['call_sub', 'Call me; if no answer, substitute', ''], ['call_no_sub', 'Call me; if no answer, do not substitute', ''], ['never', 'Never substitute', 'Items out of stock are simply removed.']];
    function draw() {
      const slots = S.slots[S.mode === 'uber' ? 'delivery' : 'pickup'] || [];
      const days = [...new Set(slots.map((s) => s.date))];
      if (S.mode !== 'coop' && !days.includes(S.day)) S.day = days[0];
      const fee = S.mode === 'uber' && S.quote && S.quote.deliverable ? S.quote.fee_cents : 0;
      const disc = S.disc || 0;
      root.innerHTML = `<h1>${t('Checkout')}</h1><div class="lay"><div>
      <div class="panel"><h2>1. ${t('Your details')}</h2><label class="f" for="em">${t('Email')}</label><input class="i" id="em" type="email" dir="ltr" autocomplete="email" value="${esc(contact.email || cust.email || '')}"><div class="row2"><div><label class="f" for="nm">${t('Name')}</label><input class="i" id="nm" autocomplete="name" value="${esc(contact.name || cust.name || '')}"></div><div><label class="f" for="ph">${t('Mobile phone')}</label><input class="i" id="ph" type="tel" dir="ltr" autocomplete="tel" value="${esc(contact.phone || cust.phone || '')}"></div></div>
        <label class="opt"><input type="checkbox" id="sms" ${contact.sms_ok || cust.sms_ok ? 'checked' : ''}><span>${t('Text me when my order is ready, and if I leave something in my cart.')} <small class="hint">${t('Msg & data rates may apply. Reply STOP to opt out.')}</small></span></label></div>
      <div class="panel"><h2>2. ${t('Pickup or delivery')}</h2><div class="tabs" role="tablist"><button data-mode="pickup" class="${S.mode === 'pickup' ? 'on' : ''}">${t('Pickup in store')}<br><small>${t('Free')}</small></button><button data-mode="uber" class="${S.mode === 'uber' ? 'on' : ''}">${t('Delivery')}<br><small>${t('Uber, from {price}', { price: money(info.delivery_tiers[0].fee_cents) })}</small></button>${S.coops ? `<button data-mode="coop" class="${S.mode === 'coop' ? 'on' : ''}">${t('Neighborhood pickup point')}<br><small>${t('Free')}</small></button>` : ''}</div>
        ${S.mode === 'uber' ? `<div class="row2"><div><label class="f" for="st">${t('Street address')}</label><input class="i" id="st" autocomplete="address-line1" value="${esc(S.addr?.street || '')}"></div><div><label class="f" for="un">${t('Apt / unit')}</label><input class="i" id="un" autocomplete="address-line2" value="${esc(S.addr?.unit || '')}"></div></div><div class="row2"><div><label class="f" for="ct">${t('City')}</label><input class="i" id="ct" autocomplete="address-level2" value="${esc(S.addr?.city || '')}"></div><div><label class="f" for="zp">${t('ZIP')}</label><input class="i" id="zp" dir="ltr" autocomplete="postal-code" inputmode="numeric" value="${esc(S.addr?.zip || '')}"></div></div><button class="btn ghost small" id="quote" style="margin-top:10px">${t('Get my delivery price')}</button>${S.quote ? (S.quote.deliverable ? `<div class="okbox">${t('{miles} miles away: delivery {fee}', { miles: S.quote.miles, fee: S.quote.fee_cents ? money(S.quote.fee_cents) : t('FREE') })}${!S.quote.free && S.quote.free_over_cents ? '. ' + t('Free on orders over {amount}.', { amount: money(S.quote.free_over_cents) }) : ''}</div>` : `<div class="err">${esc(S.quote.reason)}</div>`) : `<p class="hint">${t('Delivery minimum {amount}.', { amount: money(info.delivery_min_cents) })}</p>`}` : ''}
        ${S.mode === 'coop' ? S.coops.map((c) => `<label class="opt ${S.coop === c.id ? 'on' : ''}"><input type="radio" name="coop" value="${c.id}" ${S.coop === c.id ? 'checked' : ''}><span><b>${esc(c.label)}</b><br>${esc(c.location)} &middot; ${fmtDay(String(c.drop_date).slice(0, 10))} ${esc(c.window_text)}<br><small class="hint">${t('Delivered together with your neighbors, free.')}${c.cutoff_at ? ' ' + t('Order by {when}.', { when: new Date(c.cutoff_at).toLocaleString(LOC, { timeZone: TZ, weekday: 'short', hour: 'numeric', minute: '2-digit' }) }) : ''}</small></span></label>`).join('') : `<h3 style="margin:14px 0 6px">${S.mode === 'uber' ? t('Delivery window') : t('Pickup time')}</h3>${slots.length ? `<div class="days">${days.map((d) => `<button data-day="${d}" class="${d === S.day ? 'on' : ''}">${fmtDay(d)}</button>`).join('')}</div><div class="times">${slots.filter((s) => s.date === S.day).map((s) => `<button data-slot="${s.start}" class="${S.slot === s.start ? 'on' : ''}" dir="ltr">${fmtTime(s.start)}${S.mode === 'uber' ? ' - ' + fmtTime(s.end) : ''}</button>`).join('')}</div><p class="hint">${S.mode === 'pickup' ? t('Most orders are ready within 2-3 hours. You can also schedule up to a month ahead. We notify you the moment it is ready.') : ''}</p>` : `<p class="empty">${t('No times available right now.')}</p>`}`}</div>
      <div class="panel"><h2>3. ${t('If something is out of stock')}</h2>${subs.map(([v, tt, h]) => `<label class="opt ${S.sub === v ? 'on' : ''}"><input type="radio" name="sub" value="${v}" ${S.sub === v ? 'checked' : ''}><span><b>${t(tt)}</b>${h ? `<br><small class="hint">${t(h)}</small>` : ''}</span></label>`).join('')}<label class="f" for="note">${t('Notes for the packer (optional)')}</label><textarea class="i" id="note" rows="2" maxlength="300">${esc(S.note || '')}</textarea></div>
      <div class="panel" id="paypanel"><h2>4. ${t('Payment')}</h2><div id="payarea"><button class="btn big" id="topay">${t('Continue to payment')}</button><p class="hint">${t('Your card is only held now. You are charged the exact total after we pick your order.')}</p></div><div id="err" class="err" hidden></div></div></div>
      <aside><div class="panel"><h2>${t('Order summary')}</h2>${priced.lines.map((l) => `<div class="tot"><span>${qtyText(l)} ${esc(l.name)}</span><span>${money(l.line_cents)}</span></div>`).join('')}<div class="tot" style="margin-top:8px"><span>${t('Subtotal')}</span><b>${money(subtotal)}</b></div>${priced.savings_cents ? `<div class="tot save"><span>${t('You save')}</span><span>${money(priced.savings_cents)}</span></div>` : ''}${disc ? `<div class="tot save"><span>${t('Coupon')} ${esc(S.coupon)}</span><span>-${money(disc)}</span></div>` : ''}${S.mode === 'uber' ? `<div class="tot"><span>${t('Delivery')}</span><span>${S.quote && S.quote.deliverable ? (fee ? money(fee) : t('FREE')) : '—'}</span></div>` : ''}${priced.tax_cents ? `<div class="tot"><span>${t('Tax')}</span><span>${money(priced.tax_cents)}</span></div>` : ''}<div class="tot big"><span>${t('Estimated total')}</span><span>${money(subtotal - disc + priced.tax_cents + fee)}</span></div><p class="hint">${t('Weighed items may change slightly.')}</p>
      <label class="f" for="cp">${t('Coupon code')}</label><div style="display:flex;gap:6px"><input class="i" id="cp" dir="ltr" value="${esc(S.coupon)}"><button class="btn small ghost" id="cpgo" type="button">${t('Apply')}</button></div><div id="cpmsg" class="hint" role="status"></div></div></aside></div>`;
      wire();
    }
    const readContact = () => { contact = { email: $('#em').value.trim(), name: $('#nm').value.trim(), phone: $('#ph').value.trim(), sms_ok: $('#sms').checked }; store.set('bk_contact', contact); S.note = $('#note').value; S.coupon = $('#cp').value.trim(); };
    const readAddr = () => { S.addr = { street: $('#st').value.trim(), unit: $('#un').value.trim(), city: $('#ct').value.trim(), state: 'CA', zip: $('#zp').value.trim() }; return S.addr; };
    const showErr = (m) => { const e = $('#err'); e.textContent = m; e.hidden = !m; if (m) e.scrollIntoView({ block: 'center' }); };
    async function checkCoupon(quiet) {
      if (!S.coupon) { S.disc = 0; store.set('bk_coupon', ''); return; }
      try { const r = await api('POST', '/api/coupon/check', { code: S.coupon, items, email: contact.email || cust.email || '' }); S.disc = r.discount_cents; store.set('bk_coupon', S.coupon); if (!quiet) toast(t('Coupon applied')); }
      catch (e) { S.disc = 0; if (!quiet) { draw(); $('#cpmsg').textContent = e.message; } else S.coupon = ''; }
    }
    function wire() {
      $$('[data-mode]').forEach((b) => b.addEventListener('click', () => { readContact(); if (S.mode === 'uber' && $('#st')) readAddr(); S.mode = b.dataset.mode; S.slot = null; draw(); }));
      $$('[data-day]').forEach((b) => b.addEventListener('click', () => { readContact(); S.day = b.dataset.day; draw(); }));
      $$('[data-slot]').forEach((b) => b.addEventListener('click', () => { S.slot = b.dataset.slot; $$('[data-slot]').forEach((x) => x.classList.toggle('on', x === b)); }));
      $$('[name=sub]').forEach((r) => r.addEventListener('change', () => { S.sub = r.value; $$('[name=sub]').forEach((x) => x.closest('.opt').classList.toggle('on', x.checked)); }));
      $$('[name=coop]').forEach((r) => r.addEventListener('change', () => { S.coop = Number(r.value); $$('[name=coop]').forEach((x) => x.closest('.opt').classList.toggle('on', x.checked)); }));
      $('#quote')?.addEventListener('click', async () => { readContact(); try { S.quote = await api('POST', '/api/delivery/quote', { items, address: readAddr() }); } catch (e) { S.quote = { deliverable: false, reason: e.message }; } draw(); });
      $('#cpgo').addEventListener('click', async () => { readContact(); await checkCoupon(false); if (S.disc) draw(); });
      $('#topay').addEventListener('click', startPayment);
    }
    async function startPayment() {
      showErr(''); readContact();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact.email)) return showErr(t('Please enter your email so we can send your receipt.'));
      if (S.mode === 'uber') { readAddr(); if (!S.quote?.deliverable) return showErr(t('Please check your delivery price first.')); }
      if (S.mode === 'coop' && !S.coop) return showErr(t('Please choose a pickup point.'));
      if (S.mode !== 'coop' && !S.slot) return showErr(t('Please choose a time.'));
      const btn = $('#topay'); btn.disabled = true; btn.textContent = t('One moment...');
      try {
        const body = { items, fulfillment: S.mode, slot_start: S.slot, address: S.mode === 'uber' ? S.addr : undefined, coop_drop_id: S.coop, sub_pref: S.sub, note: $('#note').value, coupon: S.coupon, customer: { email: contact.email, name: contact.name, phone: contact.phone, sms_ok: contact.sms_ok } };
        const co = await api('POST', '/api/checkout', body);
        store.set('bk_contact', contact);
        await api('PUT', '/api/cart/' + cartId, { items, email: contact.email, phone: contact.phone, sms_ok: contact.sms_ok }).catch(() => {});
        const done = async () => { await api('POST', `/api/orders/${co.order_id}/confirm`, { token: co.token }); items = []; store.set('bk_cart', []); store.set('bk_coupon', ''); location.href = `${P}/order/${co.order_id}?t=${co.token}&new=1`; };
        if (info.payments === 'stripe') {
          if (!window.Stripe) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://js.stripe.com/v3/'; s.onload = res; s.onerror = rej; document.head.append(s); });
          const stripe = window.Stripe(info.stripe_pk, { locale: LANG }), els = stripe.elements({ clientSecret: co.client_secret });
          $('#payarea').innerHTML = `<div id="pe"></div><p class="hint">${t('We hold {amount} on your card now (a little extra for weighed items). You are only charged the exact total after your order is picked.', { amount: money(co.auth_cents) })}</p><button class="btn big" id="pay">${t('Place order')}</button>`;
          els.create('payment').mount('#pe');
          $('#pay').addEventListener('click', async () => {
            $('#pay').disabled = true; showErr('');
            const r = await stripe.confirmPayment({ elements: els, confirmParams: { return_url: `${location.origin}${P}/order/${co.order_id}?t=${co.token}&new=1` }, redirect: 'if_required' });
            if (r.error) { showErr(r.error.message); $('#pay').disabled = false; } else { try { await done(); } catch (e) { showErr(e.message); $('#pay').disabled = false; } }
          });
        } else {
          $('#payarea').innerHTML = `<div class="notice"><b>${t('Test mode.')}</b> ${t('Stripe is not connected yet, so no card is used and nothing is charged.')}</div><button class="btn big" id="pay">${t('Place test order')}</button>`;
          $('#pay').addEventListener('click', async () => { await api('POST', '/api/dev/pay/' + co.order_id, {}); await done(); });
        }
      } catch (e) { showErr(e.message); btn.disabled = false; btn.textContent = t('Continue to payment'); }
    }
    if (S.coupon) { contact.email = contact.email || cust.email; await checkCoupon(true); }
    draw();
  }

  async function orderPage() {
    const id = location.pathname.split('/').pop(), tk = new URLSearchParams(location.search).get('t') || '';
    let o;
    try { o = await api('GET', `/api/orders/${id}?t=${encodeURIComponent(tk)}`); } catch { root.innerHTML = `<h1>${t('Order not found')}</h1><p>${t('Open the link from your email, or')} <a href="${P}/account">${t('sign in')}</a>.</p>`; return; }
    const isNew = new URLSearchParams(location.search).has('new');
    if (isNew) { items = []; store.set('bk_cart', []); renderBadges(); }
    const label = { placed: 'Received', picking: 'Being packed', ready: o.fulfillment === 'pickup' ? 'Ready for pickup' : 'Ready', out_for_delivery: 'On its way', completed: 'Completed', cancelled: 'Cancelled', pending_payment: 'Awaiting payment' }[o.status] || o.status;
    const when = o.slot_start ? new Date(o.slot_start).toLocaleString(LOC, { timeZone: TZ, weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
    root.innerHTML = `<h1>${t('Order #{id}', { id: o.order_id })} <span class="tag ${o.status === 'ready' ? 'ready' : o.status === 'cancelled' ? 'cancelled' : ''}">${t(label)}</span></h1>${isNew ? `<div class="okbox"><b>${t('Thank you!')}</b> ${t('We got your order and will notify you as soon as it is ready.')}</div>` : ''}<div class="panel"><p>${o.fulfillment === 'pickup' ? t('Pickup at 3477 Golden Gate Way, Lafayette') : o.fulfillment === 'uber' ? t('Delivery to {address}', { address: esc(o.address?.street || '') }) : t('Neighborhood pickup point: {where}', { where: esc(o.coop || '') })}${when ? '<br>' + when : ''}${o.tracking_url ? `<br><a href="${esc(o.tracking_url)}">${t('Track your delivery')}</a>` : ''}</p>${o.lines.map((l) => `<div class="tot"><span>${esc(l.name)}${l.is_extra ? ' (' + t('added') + ')' : ''}<br><small class="hint">${esc(l.status === 'pending' ? t('Not packed yet') : l.status)}</small></span><span>${l.line_total_cents == null ? (l.est_weight_lb ? `${l.qty_ordered} ${t('packs')}` : l.qty_ordered + (l.sold_by === 'lb' ? ' ' + t('lb') + ' ' + t('est.') : '')) : num(l.qty_final) + (l.sold_by === 'lb' ? ' ' + t('lb') : '') + ' &middot; ' + money(l.line_total_cents)}</span></div>`).join('')}<div class="tot"><span>${t('Subtotal')}</span><span>${money(o.subtotal_cents)}</span></div>${o.discount_cents ? `<div class="tot save"><span>${t('Coupon')} ${esc(o.coupon_code)}</span><span>-${money(o.discount_cents)}</span></div>` : ''}${o.tax_cents ? `<div class="tot"><span>${t('Tax')}</span><span>${money(o.tax_cents)}</span></div>` : ''}${o.delivery_fee_cents ? `<div class="tot"><span>${t('Delivery')}</span><span>${money(o.delivery_fee_cents)}</span></div>` : ''}<div class="tot big"><span>${o.charged_cents != null ? t('Charged') : t('Estimated total')}</span><span>${money(o.charged_cents ?? o.total_cents)}</span></div></div>`;
    if (['placed', 'picking'].includes(o.status)) setTimeout(orderPage, 30000);
  }

  async function accountPage() {
    const m = await api('GET', '/api/me');
    if (!m.signed_in) {
      let mode = 'password', stage = 1, email = '';
      const draw = () => {
        const tab = (k, label) => `<button data-mode="${k}" class="${mode === k ? 'on' : ''}">${t(label)}</button>`;
        root.innerHTML = `<h1>${t('Sign in')}</h1><div class="panel" style="max-width:440px"><div class="tabs">${tab('password', 'Password')}${tab('code', 'Email code')}${tab('create', 'Create account')}</div>
        ${stage === 1 ? `<label class="f" for="e">${t('Email')}</label><input class="i" id="e" type="email" dir="ltr" autocomplete="email" value="${esc(email)}">
          ${mode === 'create' ? `<label class="f" for="n">${t('Name')}</label><input class="i" id="n" autocomplete="name">` : ''}
          ${mode !== 'code' ? `<label class="f" for="pw">${t(mode === 'create' ? 'Choose a password (8+ characters)' : 'Password')}</label><input class="i" id="pw" type="password" dir="ltr" autocomplete="${mode === 'create' ? 'new-password' : 'current-password'}">` : `<p class="hint">${t('Enter the email you order with. We will email you a 6-digit code. No password needed.')}</p>`}
          <button class="btn big" id="go" style="margin-top:12px">${t(mode === 'password' ? 'Sign in' : mode === 'code' ? 'Email me a code' : 'Create my account')}</button>
          ${mode === 'password' ? `<p class="hint"><a href="#" id="forgot">${t('Forgot your password? Email me a code.')}</a></p>` : ''}`
        : `<p class="hint">${t('We emailed you a code to confirm your email.')}</p><label class="f" for="c">${t('6-digit code')}</label><input class="i" id="c" dir="ltr" inputmode="numeric" autocomplete="one-time-code" maxlength="6"><button class="btn big" id="verify" style="margin-top:12px">${t('Confirm')}</button>`}
        <div id="err" class="err" hidden></div><p class="hint">${t('New here? Your account is created automatically the first time you check out.')}</p></div>`;
        const err = (x) => { const el = $('#err'); el.textContent = x; el.hidden = !x; };
        $$('[data-mode]').forEach((b) => b.addEventListener('click', () => { mode = b.dataset.mode; stage = 1; draw(); }));
        $('#forgot')?.addEventListener('click', (e) => { e.preventDefault(); email = $('#e').value; mode = 'code'; stage = 1; draw(); });
        const run = async () => {
          err(''); if (stage === 1) email = $('#e').value;
          try {
            if (stage === 2) { await api('POST', '/api/auth/verify', { email, code: $('#c').value }); return location.reload(); }
            if (mode === 'password') { await api('POST', '/api/auth/login', { email, password: $('#pw').value }); return location.reload(); }
            if (mode === 'code') await api('POST', '/api/auth/request', { email });
            else await api('POST', '/api/auth/register', { email, name: $('#n').value, password: $('#pw').value });
            stage = 2; draw(); $('#c').focus();
          } catch (e) { err(e.message); }
        };
        ($('#go') || $('#verify')).addEventListener('click', run);
        root.querySelectorAll('input').forEach((i) => i.addEventListener('keydown', (e) => e.key === 'Enter' && run()));
      };
      draw();
      return;
    }
    const c = m.customer;
    const stLabel = (s) => t(({ placed: 'Received', picking: 'Being packed', ready: 'Ready', out_for_delivery: 'On its way', completed: 'Completed', cancelled: 'Cancelled' })[s] || s);
    root.innerHTML = `<h1>${c.name ? t('Hi, {name}', { name: esc(c.name.split(' ')[0]) }) : t('Hi')}</h1>
    <h2 id="buyagain">${t('Buy again')}</h2>${m.buy_again.length ? `<div class="grid">${m.buy_again.map(miniCard).join('')}</div>` : `<p class="empty">${t('Items you order will show up here for one-tap reordering.')}</p>`}
    <h2>${t('Your orders')}</h2><div class="panel">${m.orders.length ? m.orders.map((o) => `<div class="tot"><a href="${P}/order/${o.id}?t=${o.public_token}">#${o.id} &middot; ${new Date(o.created_at).toLocaleDateString(LOC)}</a><span><span class="tag ${o.status === 'ready' ? 'ready' : ''}">${esc(stLabel(o.status))}</span> ${money(o.total_cents)} <button class="rm" data-reorder="${o.id}">${t('Reorder')}</button></span></div>`).join('') : `<p class="empty">${t('No orders yet.')}</p>`}</div>
    <h2>${t('Preferences')}</h2><div class="panel" style="max-width:520px"><label class="f" for="pn">${t('Name')}</label><input class="i" id="pn" value="${esc(c.name)}"><label class="f" for="pp">${t('Mobile phone')}</label><input class="i" id="pp" type="tel" dir="ltr" value="${esc(c.phone)}"><label class="opt"><input type="checkbox" id="psms" ${c.sms_ok ? 'checked' : ''}><span>${t('Text me about my orders and cart reminders')}</span></label><label class="opt"><input type="checkbox" id="pem" ${c.email_ok ? 'checked' : ''}><span>${t('Email me the weekly specials')}</span></label><label class="f" for="psub">${t('Default when something is out of stock')}</label><select class="i" id="psub">${[['substitute', 'Substitute something similar'], ['call_sub', 'Call me; if no answer, substitute'], ['call_no_sub', 'Call me; if no answer, do not substitute'], ['never', 'Never substitute']].map(([v, tt]) => `<option value="${v}" ${c.default_sub_pref === v ? 'selected' : ''}>${t(tt)}</option>`).join('')}</select><h3 style="margin:18px 0 4px">${t(c.has_password ? 'Change password' : 'Set a password')}</h3><input class="i" id="newpw" type="password" dir="ltr" autocomplete="new-password" placeholder="${esc(t('New password'))}"><button class="btn ghost small" id="pwsave" style="margin-top:8px">${t('Save password')}</button>
    <br><button class="btn" id="psave" style="margin-top:12px">${t('Save')}</button> <button class="btn ghost" id="logout" style="margin-top:12px">${t('Sign out')}</button></div>`;
    syncCards();
    $('#psave').addEventListener('click', async () => { await api('PUT', '/api/me', { name: $('#pn').value, phone: $('#pp').value, sms_ok: $('#psms').checked, email_ok: $('#pem').checked, default_sub_pref: $('#psub').value }); toast(t('Saved')); });
    $('#pwsave').addEventListener('click', async () => { try { await api('POST', '/api/auth/password', { password: $('#newpw').value }); $('#newpw').value = ''; toast(t('Password saved')); } catch (e) { toast(e.message); } });
    $('#logout').addEventListener('click', async () => { await api('POST', '/api/auth/logout', {}); location.reload(); });
    $$('[data-reorder]').forEach((b) => b.addEventListener('click', async () => { const r = await api('POST', `/api/orders/${b.dataset.reorder}/reorder`, {}); items = r.items; saveCart(); location.href = P + '/cart'; }));
  }

  renderBadges(); syncCards();
  if (page === 'cart') cartPage().catch((e) => { root.textContent = e.message; });
  else if (page === 'checkout') checkoutPage().catch((e) => { root.textContent = e.message; });
  else if (page === 'order') orderPage();
  else if (page === 'account') accountPage().catch((e) => { root.textContent = e.message; });
})();
