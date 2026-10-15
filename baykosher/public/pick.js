// Packer screen: works on a phone with a Bluetooth/USB scanner (acts like a keyboard) or the camera.
(() => {
  'use strict';
  const TZ = 'America/Los_Angeles'; // always show the store's local time
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (c) => '$' + (c / 100).toFixed(2);
  const root = $('#root');
  let order = null, busy = false, scanMsg = '';
  const api = async (method, url, body) => {
    const r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || 'Error'), { status: r.status });
    return j;
  };
  const beep = (ok) => { try { const c = new (window.AudioContext || window.webkitAudioContext)(), o = c.createOscillator(); o.frequency.value = ok ? 880 : 220; o.connect(c.destination); o.start(); setTimeout(() => o.stop(), ok ? 90 : 300); } catch {} navigator.vibrate && navigator.vibrate(ok ? 40 : [120, 60, 120]); };
  const subLabel = { substitute: ['Substitute OK', ''], call_sub: ['Call first, else substitute', 'warn'], call_no_sub: ['Call first, else NO substitute', 'warn'], never: ['NEVER substitute', 'stop'] };

  async function login() {
    root.innerHTML = `<header><b>Bay Kosher Picker</b></header><div class="pad"><label class="f" for="pin">PIN</label><input class="i big" id="pin" type="password" inputmode="numeric" autocomplete="off"><button class="btn big" id="go" style="margin-top:12px">Sign in</button><div id="e" class="err" hidden></div></div>`;
    const go = async () => { try { await api('POST', '/api/staff/login', { pin: $('#pin').value }); queue(); } catch (e) { $('#e').hidden = false; $('#e').textContent = e.message; } };
    $('#go').onclick = go; $('#pin').onkeydown = (e) => e.key === 'Enter' && go(); $('#pin').focus();
  }

  async function queue() {
    let list;
    try { list = await api('GET', '/api/picker/queue'); } catch (e) { if (e.status === 401) return login(); throw e; }
    const t = (iso) => iso ? new Date(iso).toLocaleString([], { timeZone: TZ, weekday: 'short', hour: 'numeric', minute: '2-digit' }) : '';
    root.innerHTML = `<header><b>Orders to pick</b><button class="btn small ghost" id="ref" style="background:#fff">Refresh</button></header><div class="pad">${list.length ? list.map((o) => `<button class="q" data-id="${o.id}"><b>#${o.id} ${esc(o.customer_name || '')}</b> <small>${o.fulfillment === 'pickup' ? 'Pickup' : o.fulfillment === 'uber' ? 'Delivery' : 'Co-op'} ${t(o.slot_start)}</small><br><span class="pill ${subLabel[o.sub_pref][1]}">${subLabel[o.sub_pref][0]}</span><span class="pill">${o.done}/${o.items} items</span>${o.status === 'picking' ? `<span class="pill warn">In progress${o.picker ? ': ' + esc(o.picker) : ''}</span>` : ''}</button>`).join('') : '<p class="empty">No orders waiting. Nice work.</p>'}</div>`;
    $('#ref').onclick = queue;
    $$('.q').forEach((b) => (b.onclick = async () => { const name = localStorage.getItem('bk_picker') || prompt('Your name?') || ''; localStorage.setItem('bk_picker', name); try { order = await api('POST', `/api/picker/orders/${b.dataset.id}/start`, { picker: name }); pick(); } catch (e) { alert(e.message); queue(); } }));
  }

  const done = () => order.items.filter((i) => i.state !== 'pending').length;
  function pick() {
    const total = order.items.length, d = done(), allDone = d === total;
    const first = order.items.find((i) => i.state === 'pending');
    const [subText, subCls] = subLabel[order.sub_pref];
    root.innerHTML = `<header><b>Order #${order.id}</b><span>${d}/${total}</span><div class="prog"><i style="width:${(d / total) * 100}%"></i></div></header>
    <div class="pad"><div style="margin-bottom:8px"><span class="pill ${subCls}">${subText}</span><span class="pill">${esc(order.customer_name || '')}</span>${order.note ? `<div class="notice" style="margin-top:8px">Note: ${esc(order.note)}</div>` : ''}</div>
    <div class="scan"><input id="sc" inputmode="none" autocomplete="off" placeholder="Scan an item barcode" aria-label="Scan barcode"><button class="btn" id="cam" aria-label="Use camera">&#128247;</button></div><div id="msg" class="hint" role="status">${esc(scanMsg)}</div>
    ${order.items.map((i) => itemCard(i, first && i.id === first.id)).join('')}<button class="btn ghost big" id="add" style="margin-top:6px">+ Add an item</button></div>
    <div class="foot"><button class="btn g big" id="fin" ${allDone ? '' : 'disabled'}>${allDone ? 'Finish &amp; charge card' : `${total - d} item${total - d === 1 ? '' : 's'} to go`}</button></div>`;
    const sc = $('#sc'); sc.focus();
    sc.onkeydown = (e) => { if (e.key === 'Enter' && sc.value.trim()) { onScan(sc.value.trim()); sc.value = ''; } };
    $('#cam').onclick = camera; $('#add').onclick = () => finder('add'); $('#fin').onclick = finish;
    $$('[data-act]').forEach((b) => (b.onclick = () => act(Number(b.dataset.id), b.dataset.act)));
    $$('[data-undo]').forEach((b) => (b.onclick = () => run(`/api/picker/orders/${order.id}/items/${b.dataset.undo}/undo`, {})));
  }
  function itemCard(i, cur) {
    const lb = i.sold_by === 'lb';
    const cls = { picked: 'done', substituted: 'sub', out_of_stock: 'oos', pending: cur ? 'cur' : '' }[i.state];
    const state = { picked: `Picked ${Number(i.final_qty)}${lb ? ' lb' : ''} &middot; ${money(i.line_total_cents)}`, substituted: `Substituted: ${esc(i.sub_name)} &times; ${Number(i.final_qty)} &middot; ${money(i.line_total_cents)}`, out_of_stock: 'Not in stock', pending: '' }[i.state];
    return `<div class="it ${cls}"><img src="${esc(i.image_url || '/static/noimage.svg')}" alt=""><div><div class="nm">${esc(i.name)}${i.is_extra ? ' <span class="pill">added</span>' : ''}</div><div class="meta">${lb ? `~${Number(i.qty)} lb ordered` : `Qty ${Number(i.qty)}`} &middot; ${money(i.unit_price_cents)}${lb ? '/lb' : ''}${i.upc ? ' &middot; ' + esc(i.upc) : ''}</div><div class="meta"><b>${state}</b></div>${i.state !== 'pending' ? `<button class="rm" data-undo="${i.id}">Undo</button>` : ''}</div>
    ${i.state === 'pending' ? `<div class="acts"><button class="btn g" data-act="pick" data-id="${i.id}">${lb ? 'Weigh' : 'Got it'}</button><button class="btn o" data-act="sub" data-id="${i.id}" ${order.sub_pref === 'never' ? 'disabled' : ''}>Substitute</button><button class="btn r" data-act="oos" data-id="${i.id}">Not in stock</button></div>` : ''}</div>`;
  }

  async function run(url, body) {
    if (busy) return; busy = true;
    try { order = await api('POST', url, body); scanMsg = ''; } catch (e) { scanMsg = e.message; beep(false); alert(e.message); } finally { busy = false; }
    pick();
  }
  function act(id, a) {
    const it = order.items.find((x) => x.id === id);
    if (a === 'oos') { if (confirm(`Mark "${it.name}" as not in stock?`)) run(`/api/picker/orders/${order.id}/items/${id}/oos`, {}); }
    else if (a === 'pick') { if (it.sold_by === 'lb') weightSheet(it, (w) => run(`/api/picker/orders/${order.id}/items/${id}/pick`, { weight: w })); else if (Number(it.qty) > 1) qtySheet(it, (q) => run(`/api/picker/orders/${order.id}/items/${id}/pick`, { qty: q })); else run(`/api/picker/orders/${order.id}/items/${id}/pick`, { qty: 1 }); }
    else if (a === 'sub') finder('sub', it);
  }
  function sheet(html) { const s = document.createElement('div'); s.className = 'sheet'; s.innerHTML = `<div>${html}</div>`; document.body.append(s); s.onclick = (e) => e.target === s && s.remove(); return s; }
  function weightSheet(it, cb, name) {
    const s = sheet(`<h2 style="margin-top:0">${esc(name || it.name)}</h2><p class="hint">Weigh the item and type the weight in pounds. Ordered about ${Number(it.qty || 1)} lb.</p><input class="big" id="w" type="number" step="0.01" min="0" inputmode="decimal" placeholder="0.00 lb"><button class="btn g big" id="ok" style="margin-top:12px">Save weight</button><button class="btn ghost big" id="x" style="margin-top:8px">Cancel</button>`);
    $('#w', s).focus(); $('#x', s).onclick = () => s.remove();
    $('#ok', s).onclick = () => { const v = Number($('#w', s).value); if (!(v > 0)) return alert('Enter the weight'); s.remove(); cb(v); };
  }
  function qtySheet(it, cb, name) {
    const s = sheet(`<h2 style="margin-top:0">${esc(name || it.name)}</h2><p class="hint">How many did you pick? Ordered ${Number(it.qty)}.</p><input class="big" id="n" type="number" min="1" step="1" inputmode="numeric" value="${Number(it.qty) || 1}"><button class="btn g big" id="ok" style="margin-top:12px">Save</button><button class="btn ghost big" id="x" style="margin-top:8px">Cancel</button>`);
    $('#x', s).onclick = () => s.remove(); $('#ok', s).onclick = () => { const v = Number($('#n', s).value); if (!(v >= 1)) return; s.remove(); cb(v); };
  }

  // Scanner input: a scan of a pending item picks it; unknown barcodes say so (never silently wrong).
  function onScan(code) {
    const digits = code.replace(/\D/g, '');
    const it = order.items.find((i) => i.state === 'pending' && i.upc && i.upc === digits) || order.items.find((i) => i.state === 'pending' && i.upc && digits && (i.upc.endsWith(digits) || digits.endsWith(i.upc)));
    if (!it) { const done = order.items.find((i) => i.upc === digits); scanMsg = done ? `Already handled: ${done.name}` : 'Not on this order. Use Substitute or Add if intended.'; beep(false); return pick(); }
    beep(true);
    if (it.sold_by === 'lb') weightSheet(it, (w) => run(`/api/picker/orders/${order.id}/items/${it.id}/pick`, { weight: w, scanned_upc: digits }));
    else if (Number(it.qty) > 1) qtySheet(it, (q) => run(`/api/picker/orders/${order.id}/items/${it.id}/pick`, { qty: q, scanned_upc: digits }));
    else run(`/api/picker/orders/${order.id}/items/${it.id}/pick`, { qty: 1, scanned_upc: digits });
  }
  async function camera() {
    if (!('BarcodeDetector' in window)) return alert('Camera scanning is not supported on this phone. Use a barcode scanner or type the number.');
    const s = sheet('<video id="v" playsinline style="width:100%;border-radius:12px"></video><button class="btn ghost big" id="x" style="margin-top:8px">Close</button>');
    let stream, stop = false; $('#x', s).onclick = () => { stop = true; stream && stream.getTracks().forEach((t) => t.stop()); s.remove(); };
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); const v = $('#v', s); v.srcObject = stream; await v.play(); const det = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
      (async function loop() { while (!stop) { try { const r = await det.detect(v); if (r[0]) { $('#x', s).click(); return onScan(r[0].rawValue); } } catch {} await new Promise((r) => setTimeout(r, 200)); } })(); } catch { alert('Could not open the camera.'); s.remove(); }
  }

  // Product finder used for substitutes and added items (search by name or scan).
  function finder(mode, it) {
    const s = sheet(`<h2 style="margin-top:0">${mode === 'sub' ? 'Substitute for ' + esc(it.name) : 'Add an item'}</h2><input class="i" id="fq" placeholder="Search or scan a barcode" inputmode="search" autocomplete="off"><div id="res"></div><button class="btn ghost big" id="x" style="margin-top:8px">Cancel</button>`);
    $('#x', s).onclick = () => s.remove(); const fq = $('#fq', s); fq.focus(); let t;
    const search = async () => { const v = fq.value.trim(); if (v.length < 2) return; const r = await api('GET', '/api/picker/find?q=' + encodeURIComponent(v)); $('#res', s).innerHTML = r.length ? r.map((p) => `<button class="found" data-p='${esc(JSON.stringify({ id: p.id, name: p.name, by: p.sold_by }))}'><img src="${esc(p.image_url || '/static/noimage.svg')}" alt=""><span><b>${esc(p.name)}</b><br><small>${money(p.price_cents)}${p.sold_by === 'lb' ? '/lb' : ''}${p.stock_status === 'out' ? ' &middot; out of stock' : ''}</small></span></button>`).join('') : '<p class="empty">No matches</p>';
      $$('.found', s).forEach((b) => (b.onclick = () => { const p = JSON.parse(b.dataset.p); s.remove(); choose(mode, it, p); })); };
    fq.oninput = () => { clearTimeout(t); t = setTimeout(search, 200); }; fq.onkeydown = (e) => e.key === 'Enter' && search();
  }
  function choose(mode, it, p) {
    const go = (qty) => {
      const body = mode === 'sub' ? { sub_product_id: p.id, qty, customer_approved: needsApproval ? approved : undefined } : { product_id: p.id, qty };
      run(mode === 'sub' ? `/api/picker/orders/${order.id}/items/${it.id}/sub` : `/api/picker/orders/${order.id}/add`, body);
    };
    const needsApproval = mode === 'sub' && (order.sub_pref === 'call_sub' || order.sub_pref === 'call_no_sub');
    let approved = false;
    const ask = () => (p.by === 'lb' ? weightSheet({ qty: it ? it.qty : 1 }, go, p.name) : qtySheet({ qty: it ? it.qty : 1 }, go, p.name));
    if (!needsApproval) return ask();
    const s = sheet(`<h2 style="margin-top:0">Call the customer first</h2><p>${esc(order.customer_name)} asked to be called before a substitution.</p><p><b>${esc(order.customer_phone || 'No phone on file')}</b></p><p class="hint">${order.sub_pref === 'call_sub' ? 'If they do not answer, substituting is allowed.' : 'If they do not answer, do NOT substitute: mark it not in stock.'}</p><button class="btn g big" id="yes">They approved</button>${order.sub_pref === 'call_sub' ? '<button class="btn o big" id="na" style="margin-top:8px">No answer: substitute anyway</button>' : ''}<button class="btn ghost big" id="x" style="margin-top:8px">Cancel</button>`);
    $('#x', s).onclick = () => s.remove(); $('#yes', s).onclick = () => { approved = true; s.remove(); ask(); }; if ($('#na', s)) $('#na', s).onclick = () => { approved = true; s.remove(); ask(); };
  }

  async function finish() {
    if (!confirm('Finish this order and charge the card?')) return;
    try {
      const o = await api('POST', `/api/picker/orders/${order.id}/finish`, {});
      const m = o.status === 'cancelled' ? 'Nothing was available. The customer was not charged.' : o.status === 'out_for_delivery' ? 'Sent to Uber for delivery.' : 'Ready. The customer has been notified.';
      root.innerHTML = `<header><b>Order #${o.id} done</b></header><div class="pad"><div class="okbox"><b>${m}</b><br>Charged ${money(o.captured_cents || 0)}.${o.unpaid_cents ? `<br><span style="color:#b42318">Extra ${money(o.unpaid_cents)} could not be charged. Tell the owner.</span>` : ''}${o.fulfillment === 'pickup' ? '<br>Put the bags on the pickup shelf.' : ''}${o.dispatch_note ? '<br>' + esc(o.dispatch_note) : ''}</div><button class="btn big" id="next">Next order</button></div>`;
      $('#next').onclick = queue; order = null;
    } catch (e) { alert(e.message); }
  }
  // Leaving mid-order would strand it: warn. (Progress is saved on the server, so any picker can resume.)
  window.addEventListener('beforeunload', (e) => { if (order && done() < order.items.length) { e.preventDefault(); e.returnValue = ''; } });

  api('GET', '/api/staff/me').then((m) => (m.role ? queue() : login())).catch(login);
})();
