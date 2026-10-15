// Phone page: pick a week, dedicate it, pay. Everything user-supplied is inserted with textContent (never HTML).
'use strict';
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var st = { board: null, year: null, onlyOpen: false, busy: false };
  var params = new URLSearchParams(location.search);

  function h(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (k === 'text') n.textContent = v; else if (k === 'class') n.className = v; else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
      else if (v === true) n.setAttribute(k, ''); else if (v !== false && v != null) n.setAttribute(k, v);
    });
    [].concat(kids || []).forEach(function (c) { if (c != null && c !== false) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  var money = function (c) { return '$' + (c / 100).toLocaleString('en-US', { maximumFractionDigits: 2 }); };
  function api(path, body) {
    return fetch('/api/kiddush' + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.error || 'Something went wrong. Please try again.'); e.code = j.code; throw e; } return j; });
    }, function () { var e = new Error('Can’t reach the server. Check your connection and try again.'); e.code = 'network'; throw e; });
  }
  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k)); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
  function note(html, bad) { var n = $('notice'); n.textContent = ''; if (html) n.appendChild(h('div', { class: 'note' + (bad ? ' bad' : '') }, html)); }

  // ------------------------------------------------------------------ list
  function load(year) {
    return api('/board' + (year ? '?year=' + year : '')).then(function (b) {
      st.board = b; st.year = b.year; render();
      var s = b.settings;
      $('blessing').textContent = s.blessing || '';
      $('contact').textContent = '';
      var c = [s.contactPhone && h('a', { href: 'tel:' + s.contactPhone.replace(/[^\d+]/g, ''), style: 'color:inherit', text: s.contactPhone }), s.contactEmail && h('a', { href: 'mailto:' + s.contactEmail, style: 'color:inherit', text: s.contactEmail })].filter(Boolean);
      $('contact').appendChild(document.createTextNode('Questions? ')); c.forEach(function (n, i) { if (i) $('contact').appendChild(document.createTextNode(' · ')); $('contact').appendChild(n); });
      return b;
    }).catch(function (e) { $('list').textContent = ''; $('list').appendChild(h('p', { class: 'muted center', text: e.message })); });
  }

  function render() {
    var b = st.board, years = $('years'); years.textContent = '';
    if (b.years.length > 1) b.years.forEach(function (y) {
      years.appendChild(h('button', { class: 'tab', role: 'tab', 'aria-selected': String(y === st.year), text: y === b.year ? String(y) : String(y), onclick: function () { load(y); } }));
    });
    var list = $('list'); list.textContent = '';
    var slots = b.slots.filter(function (s) { return !s.past && (!st.onlyOpen || s.status === 'open'); });
    var first = b.slots.filter(function (s) { return !s.past && s.status === 'open'; })[0];
    var cta = $('nextOpen'); cta.hidden = !(first && b.sponsoring);
    if (first) cta.onclick = function () { openSheet(first); };
    if (!slots.length) list.appendChild(h('p', { class: 'muted center', text: st.onlyOpen ? 'Every upcoming week this year is sponsored. Thank you!' : 'No upcoming weeks in this year.' }));
    var last = '';
    slots.forEach(function (s) {
      var d = new Date(s.date + 'T12:00:00'), label = MONTHS[d.getMonth()] + ' ' + d.getFullYear();
      if (label !== last) { list.appendChild(h('div', { class: 'month', text: label })); last = label; }
      list.appendChild(card(s, d));
    });
  }
  function card(s, d) {
    var open = s.status === 'open' && st.board.sponsoring;
    var date = h('div', { class: 'date', 'aria-hidden': 'true' }, [h('b', { text: String(d.getDate()) }), h('span', { text: DOW[d.getDay()].toUpperCase() })]);
    var mid = h('div', {}, [h('div', { class: 't', text: s.title }), h('div', { class: 's', text: s.dateLabel + ' · ' + s.heb + (s.note ? ' · ' + s.note : '') })]);
    var right;
    if (s.status === 'open') right = h('div', { class: 'go' }, [h('span', { text: money(s.priceCents) }), h('small', { text: 'Sponsor' })]);
    else {
      if (s.sponsor) { mid.appendChild(h('div', { class: 'sp', text: s.sponsor.name })); if (s.sponsor.dedication) mid.appendChild(h('div', { class: 'ded', text: s.sponsor.dedication })); }
      right = h('span', { class: 'pill', text: s.status === 'reserved' ? 'Reserved' : 'Sponsored' });
    }
    var attrs = { class: 'slot' + (open ? '' : ' taken') };
    if (open) { attrs.onclick = function () { openSheet(s); }; attrs['aria-label'] = 'Sponsor ' + s.title + ', ' + s.dateLabel + ', ' + money(s.priceCents); return h('button', attrs, [date, mid, right]); }
    return h('div', attrs, [date, mid, right]);
  }

  // ------------------------------------------------------------------ sheet
  var lastFocus = null;
  function showSheet(content) {
    var sh = $('sheet'), c = $('sheetCard'); lastFocus = document.activeElement;
    c.textContent = ''; c.appendChild(h('button', { class: 'x', 'aria-label': 'Close', onclick: closeSheet, text: '×' })); content.forEach(function (n) { c.appendChild(n); });
    sh.hidden = false; document.body.style.overflow = 'hidden'; c.scrollTop = 0;
    var f = c.querySelector('input,select,textarea,button.btn'); if (f && !/^(checkbox|radio)$/.test(f.type)) f.focus();
  }
  function closeSheet() { $('sheet').hidden = true; document.body.style.overflow = ''; if (lastFocus && lastFocus.focus) lastFocus.focus(); }
  $('sheet').addEventListener('click', function (e) { if (e.target.hasAttribute('data-close')) closeSheet(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('sheet').hidden) closeSheet(); });

  var WAYS = [
    ['card', 'Card, Apple Pay or Google Pay', 'Secure checkout by Stripe. Receipt by email.'],
    ['zelle', 'Zelle', 'No fees. We’ll show you where to send it.'],
    ['venmo', 'Venmo', 'Opens Venmo with the amount filled in.'],
    ['check', 'Check', 'Mail or hand it in at shul.'],
    ['cash', 'Cash or other', 'Bring it to shul, or ask us about other options.'],
  ];

  function openSheet(s) {
    var b = st.board, S = b.settings, me = store('kiddush-me') || {};
    var idem = 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
    var f = {};
    function field(label, id, input, extra) { return h('div', { class: 'f' }, [h('label', { class: 'l', for: id, text: label }), input, extra]); }
    f.name = h('input', { type: 'text', id: 'f-name', autocomplete: 'name', maxlength: '80', value: me.name || '', placeholder: 'e.g. The Cohen Family' });
    f.anon = h('input', { type: 'checkbox', id: 'f-anon' });
    f.kind = h('select', { id: 'f-kind' }, [h('option', { value: '', text: 'No dedication' })].concat(Object.keys(S.kinds).map(function (k) { return h('option', { value: k, text: S.kinds[k] }); })));
    f.ded = h('input', { type: 'text', id: 'f-ded', maxlength: '120', placeholder: 'Name(s) or occasion, e.g. Sara’s birthday' });
    f.email = h('input', { type: 'email', id: 'f-email', autocomplete: 'email', inputmode: 'email', value: me.email || '', placeholder: 'For your receipt' });
    f.phone = h('input', { type: 'tel', id: 'f-phone', autocomplete: 'tel', inputmode: 'tel', value: me.phone || '', placeholder: 'Optional' });
    f.amount = h('input', { type: 'number', id: 'f-amt', inputmode: 'decimal', min: String(s.priceCents / 100), step: '1', value: String(s.priceCents / 100) });
    f.note = h('textarea', { id: 'f-note', maxlength: '300', placeholder: 'Optional. Only the Rabbi sees this.' });
    f.fee = h('input', { type: 'checkbox', id: 'f-fee' });
    var feeRow = h('label', { class: 'opt', for: 'f-fee' }, [f.fee, h('span', { id: 'feeTxt' })]);
    var enabled = WAYS.filter(function (w) { return S.ways[w[0]]; });
    var radios = enabled.map(function (w, i) { return h('input', { type: 'radio', name: 'way', value: w[0], 'aria-label': w[1], checked: i === 0 }); });
    var ways = h('div', { class: 'ways', role: 'radiogroup', 'aria-label': 'How would you like to pay?' }, enabled.map(function (w, i) {
      return h('label', { class: 'way' }, [radios[i], h('span', {}, [h('div', { class: 'wt', text: w[1] }), h('div', { class: 'wd', text: w[2] })])]);
    }));
    var err = h('div', { class: 'err', role: 'alert' });
    var go = h('button', { class: 'btn gold block', type: 'submit' });
    function way() { var r = radios.filter(function (x) { return x.checked; })[0]; return r ? r.value : ''; }
    function refresh() {
      var amt = Number(f.amount.value) || 0, card = way() === 'card';
      feeRow.hidden = !(card && S.coverFee);
      $('feeTxt') && ($('feeTxt').textContent = 'Add ' + money(Math.round(amt * 100 * S.feeRate)) + ' to cover the card processing fee');
      go.textContent = card ? 'Continue to secure payment' : 'Reserve this Kiddush';
    }
    var form = h('form', { novalidate: true }, [
      field('Name to show on the board', 'f-name', f.name, h('label', { class: 'opt', for: 'f-anon' }, [f.anon, h('span', { text: 'Keep my name anonymous on the board' })])),
      h('div', { class: 'two stack' }, [field('Dedication', 'f-kind', f.kind), field('In honor / memory of', 'f-ded', f.ded)]),
      h('div', { class: 'two stack' }, [field('Email', 'f-email', f.email), field('Phone', 'f-phone', f.phone)]),
      field('Amount ($) — you’re welcome to give more', 'f-amt', f.amount),
      h('div', { class: 'f' }, [h('label', { class: 'l', text: 'How would you like to pay?' }), ways, feeRow]),
      field('Note to the Rabbi', 'f-note', f.note),
      err, go,
    ]);
    form.addEventListener('input', refresh); form.addEventListener('change', refresh);
    form.addEventListener('submit', function (e) {
      e.preventDefault(); if (st.busy) return;
      var amount = Number(f.amount.value);
      if (!f.name.value.trim()) return fail('Please enter the name to show on the board.', f.name);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.value.trim())) return fail('Please enter a valid email address.', f.email);
      if (!(amount >= s.priceCents / 100)) return fail('The minimum for this Kiddush is ' + money(s.priceCents) + '.', f.amount);
      if (!way()) return fail('Please choose how you would like to pay.');
      st.busy = true; go.disabled = true; err.textContent = '';
      store('kiddush-me', { name: f.name.value.trim(), email: f.email.value.trim(), phone: f.phone.value.trim() });
      api('/sponsor', { slot: s.key, name: f.name.value, anonymous: f.anon.checked, dedicationKind: f.ded.value.trim() ? f.kind.value : '', dedication: f.ded.value, email: f.email.value, phone: f.phone.value, amount: amount, method: way(), fee: f.fee.checked && way() === 'card', note: f.note.value, idem: idem })
        .then(function (r) {
          if (r.method === 'card' && r.url) { go.textContent = 'Opening secure checkout…'; location.href = r.url; return; }
          st.busy = false; thanks(r, s);
        }).catch(function (e) {
          st.busy = false; go.disabled = false; refresh(); err.textContent = e.message;
          if (e.code === 'taken') load(st.year);
        });
    });
    function fail(msg, el) { err.textContent = msg; if (el) el.focus(); }
    showSheet([h('h2', { id: 'sheetTitle', text: s.title }), h('p', { class: 'sub', text: s.dateLabel + ' · ' + s.heb + ' · ' + money(s.priceCents) }), form]);
    refresh();
  }

  // ------------------------------------------------------------------ results
  function copyBtn(text) {
    var b = h('button', { class: 'copy', type: 'button', text: 'Copy', onclick: function () {
      var done = function () { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy'; }, 1600); };
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () {}); else { var t = h('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); done(); } catch (e) { /* ignore */ } t.remove(); }
    } });
    return b;
  }
  function kv(k, v, copy) { return h('div', { class: 'card' }, [h('div', { class: 'k', text: k }), h('div', { class: 'row' }, [h('div', { class: 'v', text: v }), copy ? copyBtn(copy === true ? v : copy) : null])]); }
  function thanks(r, s) {
    load(st.year);
    var I = r.instructions || {}, kids = [h('div', { class: 'big-ok', 'aria-hidden': 'true', text: '✓' }), h('h2', { class: 'cen', text: 'Your Kiddush is reserved' }),
      h('p', { class: 'sub cen', text: (r.slot ? r.slot.title + ' · ' + r.slot.dateLabel : s.title) + (r.display && r.display.name ? ' · ' + r.display.name : '') })];
    var amt = '$' + I.amount;
    if (r.method === 'zelle') kids.push(h('p', { text: 'Please send ' + amt + ' by Zelle to:' }), kv('Zelle to', I.zelleId, true), I.zelleName ? h('p', { class: 'muted', text: 'The account name is ' + I.zelleName + '.' }) : null, kv('Memo', I.memo, true));
    else if (r.method === 'venmo') kids.push(h('p', { text: 'Please send ' + amt + ' on Venmo to:' }), kv('Venmo', '@' + I.venmoHandle, true), kv('Note', I.memo, true), h('a', { class: 'btn gold block', href: I.link, rel: 'noopener', text: 'Open Venmo' }));
    else if (r.method === 'check') kids.push(h('p', { text: 'Please make your ' + amt + ' check payable to:' }), kv('Payable to', I.payable, true), kv('Memo', I.memo, true), kv('Mail or bring to', I.address, true));
    else kids.push(h('p', { text: 'Please bring ' + amt + ' to shul, or contact us to arrange another way to give.' }), kv('Memo', I.memo, true));
    var c = r.contact || {};
    kids.push(h('p', { class: 'muted cen', text: 'Your name appears on the board right away and is marked as paid once we receive your gift. Thank you!' + (c.phone ? ' Questions? ' + c.phone : '') }), h('button', { class: 'btn block', type: 'button', onclick: closeSheet, text: 'Back to the board' }));
    showSheet(kids.filter(Boolean));
  }
  function returned() {
    var id = params.get('paid'), sid = params.get('session_id');
    if (id && sid) {
      note([h('b', { text: 'Confirming your payment…' })]);
      var tries = 0;
      (function poll() {
        api('/confirm?id=' + encodeURIComponent(id) + '&session_id=' + encodeURIComponent(sid)).then(function (r) {
          if (r.status === 'paid') { note([h('b', { text: 'Thank you! ' }), (r.slot ? r.slot.title + ' · ' + r.slot.dateLabel : 'Your Kiddush') + ' is sponsored' + (r.display && r.display.name ? ' by ' + r.display.name : '') + '. A receipt is on its way to your email.']); load(st.year); }
          else if (r.status === 'conflict') note([h('b', { text: 'We received your payment, ' }), 'but that week was taken a moment earlier. Please contact us and we will make it right.'], true);
          else if (r.status === 'expired') note('That checkout expired and no payment was taken. You can pick the week again below.', true);
          else if (++tries < 6) setTimeout(poll, 2000); else note('We haven’t received confirmation yet. If you were charged, your sponsorship will appear shortly. Please contact us if it does not.');
        }).catch(function (e) { note(e.message, true); });
      })();
    } else if (params.get('cancelled')) {
      api('/cancel', { id: params.get('cancelled') }).then(function () { note('Payment cancelled. No charge was made and the week was released.'); load(st.year); }, function () {});
    }
    if (id || params.get('cancelled')) history.replaceState(null, '', location.pathname);
  }

  $('onlyOpen').addEventListener('change', function (e) { st.onlyOpen = e.target.checked; if (st.board) render(); });
  load().then(function (b) {
    if (!b) return;
    if (!b.sponsoring) note('Online sponsorship is being set up. Please contact the office to sponsor a Kiddush.');
    returned();
    var w = params.get('w');
    if (w) {
      var s = b.slots.filter(function (x) { return x.key === w; })[0];
      if (s && s.status === 'open' && !s.past && b.sponsoring) openSheet(s);
      else if (s) note([h('b', { text: s.title + ' (' + s.dateLabel + ') ' }), s.past ? 'has already passed.' : 'is already sponsored. Please choose another week below.']);
    }
  });
})();
