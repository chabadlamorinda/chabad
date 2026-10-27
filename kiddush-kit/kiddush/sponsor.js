// Phone page: pick a week, dedicate it, pay. Everything user-supplied is inserted with textContent (never HTML).
// English / Hebrew: every visible string goes through T() (see i18n.js).
'use strict';
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var T = KI.t;
  var st = { board: null, year: null, onlyOpen: false, busy: false };
  var params = new URLSearchParams(location.search);
  KI.apply();

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
      return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.error || 'Something went wrong. Please try again.'); e.code = j.code; e.message = KI.error(e); throw e; } return j; });
    }, function () { var e = new Error('Can’t reach the server. Check your connection and try again.'); e.code = 'network'; e.message = KI.error(e); throw e; });
  }
  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k)); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
  function note(html, bad) { var n = $('notice'); n.textContent = ''; if (html) n.appendChild(h('div', { class: 'note' + (bad ? ' bad' : '') }, html)); }
  var telOf = function (p) { return p.replace(/[^\d+]/g, ''); };

  // "A larger or deluxe Kiddush? Please contact the Rabbi" with a tap-to-call number.
  function largerNote(cls) {
    var ph = st.board.settings.contactPhone;
    return h('p', { class: cls || 'fine' }, [T('Would you like a larger or deluxe Kiddush? Please contact the Rabbi to discuss'), ph ? ': ' : '.', ph ? h('a', { href: 'tel:' + telOf(ph), text: ph, dir: 'ltr' }) : null, ph ? '.' : null]);
  }
  var sponsorsOf = function (s) { return s.sponsors || (s.sponsor ? [s.sponsor] : []); };
  var list0 = function (s) { return sponsorsOf(s).length > 0; };
  // One block per sponsor: the name and, in smaller type, why they sponsored it.
  function sponsorLines(list, nameCls, dedCls) {
    return list.map(function (x) { var r = KI.reason(x); return h('div', { class: 'one' }, [h('div', { class: nameCls, text: KI.name(x) }), r ? h('div', { class: dedCls, text: r }) : null]); });
  }
  var mevLine = function (s) { var m = KI.mevarchim(s), mo = KI.molad(s); return m ? m + (mo ? ' · ' + T('Molad') + ': ' + mo : '') : ''; };

  // Top of the page: the upcoming Kiddush and who sponsored it, and why (or an invitation). The whole plaque is tappable.
  function renderThisWeek(b) {
    var box = $('thisWeek'), s = b.slots.filter(function (x) { return x.key === b.current; })[0]; box.textContent = ''; box.hidden = !s;
    if (!s) return;
    var list = sponsorsOf(s);
    box.setAttribute('role', 'button'); box.tabIndex = 0; box.setAttribute('aria-label', T('Sponsor') + ' ' + KI.title(s)); box.onclick = function () { openSheet(s); };
    box.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSheet(s); } }; box.classList.add('tap');
    var days = Math.round((new Date(s.date + 'T12:00:00') - new Date(b.today + 'T12:00:00')) / 864e5);
    box.appendChild(h('div', { class: 'lbl', text: days <= 7 ? (s.kind === 'shabbat' ? T('This week’s Kiddush') : T('This Kiddush')) : T('Next Kiddush') }));
    box.appendChild(h('div', { class: 'nm', text: KI.title(s) }));
    box.appendChild(h('div', { class: 'dt', text: [KI.dateLabel(s), KI.hebDate(s)].join(' · ') }));
    if (s.mevarchim) box.appendChild(h('div', { class: 'mv', text: mevLine(s) }));
    box.appendChild(h('div', { class: 'rule' }));
    if (list.length) {
      var line = h('div', { class: 'spl' }, [h('div', { class: 'by', text: T('SPONSORED BY') })]);
      sponsorLines(list, 'who', 'for').forEach(function (n) { line.appendChild(n); });
      box.appendChild(line);
    } else box.appendChild(h('div', { class: 'open', text: T('OPEN FOR SPONSORSHIP') }));
    (s.notes || []).forEach(function (n) { box.appendChild(h('div', { class: 'note', text: KI.note(n) })); });
    box.appendChild(h('div', { class: 'btn gold', text: list.length ? T('Add your sponsorship') : T('Sponsor this Kiddush') }));
  }
  // Bottom of the page: sponsor the whole Kiddush board for the year (no price on this page; it shows when you tap Sponsor).
  function renderBoardCard(b) {
    var box = $('boardCard'), bs = b.boardSponsor; box.textContent = ''; box.hidden = !bs;
    if (!bs) return;
    var list = sponsorsOf(bs);
    box.appendChild(h('h2', { text: T('Sponsor the Kiddush board for {year}', { year: KI.he ? b.yearHe : b.year }) }));
    if (list.length) {
      box.appendChild(h('p', { text: T('The Kiddush board is generously donated by') }));
      sponsorLines(list, 'sp', 'ded').forEach(function (n) { box.appendChild(n); });
      box.appendChild(h('p', { style: 'margin-top:10px', text: T('You are welcome to join in sponsoring the board.') }));
    } else box.appendChild(h('p', { text: T('Your name and dedication will be displayed as the sponsor of the Kiddush board on the shul’s TV and here, all year.') }));
    box.appendChild(h('button', { class: 'btn gold', type: 'button', text: T('Sponsor the board'), onclick: function () { openSheet(bs); } }));
  }

  // ------------------------------------------------------------------ list
  // The organisation's name comes from chabad.config.json (served with the board).
  function orgNames(S) {
    var n = KI.org(S), el = $('orgName'); if (el) el.textContent = n.toUpperCase();
    var t = KI.he ? 'תרומת קידוש' : 'Sponsor a Kiddush'; document.title = n ? t + ' — ' + n : t;
  }
  function load(year) {
    return api('/board' + (year ? '?year=' + year : '')).then(function (b) {
      st.board = b; st.year = b.year; orgNames(b.settings); render(); renderThisWeek(b); renderBoardCard(b);
      var s = b.settings;
      $('blessing').textContent = KI.blessing(s) || '';
      var ct = $('contact'); ct.textContent = '';
      ct.appendChild(h('div', { class: 'cc-t', text: T('Questions, or a larger or deluxe Kiddush?') }));
      ct.appendChild(h('div', { class: 'cc-s', text: T('Contact the Rabbi') }));
      ct.appendChild(h('div', { class: 'cc-b' }, [s.contactPhone ? h('a', { class: 'btn', href: 'tel:' + telOf(s.contactPhone), text: T('Call {phone}', { phone: s.contactPhone }), dir: 'ltr' }) : null, s.contactEmail ? h('a', { class: 'btn', href: 'mailto:' + s.contactEmail + '?subject=' + encodeURIComponent('Kiddush' + (KI.org(s) ? ' at ' + KI.org(s) : '')), text: T('Email') }) : null]));
      return b;
    }).catch(function (e) { $('list').textContent = ''; $('list').appendChild(h('p', { class: 'muted center', text: e.message })); });
  }

  function render() {
    var b = st.board, years = $('years'); years.textContent = '';
    if (b.years.length > 1) b.years.forEach(function (y) {
      years.appendChild(h('button', { class: 'tab', role: 'tab', 'aria-selected': String(y === st.year), text: String(y), onclick: function () { load(y); } }));
    });
    var list = $('list'); list.textContent = '';
    var slots = b.slots.filter(function (s) { return !st.onlyOpen || (s.status === 'open' && !s.past); });
    if (!slots.length) list.appendChild(h('p', { class: 'muted center', text: st.onlyOpen ? T('Every upcoming week this year is sponsored. Thank you!') : T('No upcoming weeks in this year.') }));
    var last = '';
    slots.forEach(function (s) {
      var label = KI.monthYear(s.date);
      if (label !== last) { list.appendChild(h('div', { class: 'month', text: label })); last = label; }
      list.appendChild(card(s));
    });
    if (!st.scrolled) { st.scrolled = true; scrollToCurrent(); }
  }
  // Land on the current week (the floating top covers the header); earlier weeks are just above.
  function scrollToCurrent() {
    var top = $('top'); document.documentElement.style.setProperty('--topH', (top.offsetHeight + 8) + 'px');
    var go = function () { var c = $('cur'); if (c) { document.documentElement.style.setProperty('--topH', ($('top').offsetHeight + 8) + 'px'); c.scrollIntoView({ block: 'start' }); } };
    requestAnimationFrame(go); if (document.fonts && document.fonts.ready) document.fonts.ready.then(go);
  }
  function card(s) {
    var can = !(s.past && list0(s)), list = sponsorsOf(s); // a past week with no sponsor can still be sponsored afterwards
    var d = new Date(s.date + 'T12:00:00'), kids = [];
    // Past weeks show just the parshah name; the reason (in small type, under each sponsor) takes the place of the date.
    if (!s.past) kids.push(h('div', { class: 'date', 'aria-hidden': 'true' }, [h('b', { text: String(d.getDate()) }), h('span', { text: KI.dowShort(s.date) })]));
    var mid = h('div', {}, [h('div', { class: 't', text: KI.title(s) })]);
    if (!s.past) {
      mid.appendChild(h('div', { class: 's', text: KI.dateLabel(s) + ' · ' + KI.hebDate(s) + (s.note && !KI.he ? ' · ' + s.note : '') }));
      if (s.mevarchim) mid.appendChild(h('div', { class: 'mev', text: mevLine(s) }));
    }
    sponsorLines(list, 'sp', 'ded').forEach(function (n) { mid.appendChild(n); });
    (s.notes || []).forEach(function (n) { mid.appendChild(h('div', { class: 'note', text: KI.note(n) })); });
    kids.push(mid);
    kids.push(list.length ? h('div', { class: 'go' }, [h('span', { class: 'pill', text: T('Sponsored') }), can ? h('small', { text: T('Join in') }) : null])
      : h('div', { class: 'go' }, [can ? h('span', { text: T('Sponsor') }) : null]));
    var attrs = { class: 'slot' + (list.length ? ' taken' : '') + (s.past ? ' past' : '') };
    if (s.key === st.board.current) attrs.id = 'cur';
    if (can) { attrs.onclick = function () { openSheet(s); }; attrs['aria-label'] = T('Sponsor') + ' ' + KI.title(s); return h('button', attrs, kids); }
    return h('div', attrs, kids);
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

  var METHODNAMES = { card: 'Card', zelle: 'Zelle', venmo: 'Venmo', check: 'Check', cash: 'Cash' };
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
    f.name = h('input', { type: 'text', id: 'f-name', autocomplete: 'name', maxlength: '80', value: me.name || '', placeholder: T('e.g. The Cohen Family') });
    f.anon = h('input', { type: 'checkbox', id: 'f-anon' });
    f.kind = h('select', { id: 'f-kind' }, [h('option', { value: '', text: T('No dedication') })].concat(Object.keys(S.kinds).map(function (k) { return h('option', { value: k, text: KI.kindLabel(k, S.kinds[k]) }); })));
    f.ded = h('input', { type: 'text', id: 'f-ded', maxlength: '120', placeholder: T('Name(s) or occasion, e.g. Sara’s birthday') });
    f.email = h('input', { type: 'email', id: 'f-email', autocomplete: 'email', inputmode: 'email', value: me.email || '', placeholder: T('For your receipt'), dir: 'ltr' });
    f.phone = h('input', { type: 'tel', id: 'f-phone', autocomplete: 'tel', inputmode: 'tel', value: me.phone || '', placeholder: T('Optional'), dir: 'ltr' });
    f.amount = h('input', { type: 'number', id: 'f-amt', inputmode: 'decimal', min: String(s.priceCents / 100), step: '1', value: String(s.priceCents / 100), dir: 'ltr' });
    f.note = h('textarea', { id: 'f-note', maxlength: '300', placeholder: T('Optional. Only the Rabbi sees this.') });
    f.fee = h('input', { type: 'checkbox', id: 'f-fee' });
    var feeRow = h('label', { class: 'opt', for: 'f-fee' }, [f.fee, h('span', { id: 'feeTxt' })]);
    var enabled = WAYS.filter(function (w) { return S.ways[w[0]]; });
    var radios = enabled.map(function (w, i) { return h('input', { type: 'radio', name: 'way', value: w[0], 'aria-label': T(w[1]), checked: i === 0 }); });
    var ways = h('div', { class: 'ways', role: 'radiogroup', 'aria-label': T('How would you like to pay?') }, enabled.map(function (w, i) {
      return h('label', { class: 'way' }, [radios[i], h('span', {}, [h('div', { class: 'wt', text: T(w[1]) }), h('div', { class: 'wd', text: T(w[2]) })])]);
    }));
    var err = h('div', { class: 'err', role: 'alert' });
    var go = h('button', { class: 'btn gold block', type: 'submit' });
    function way() { var r = radios.filter(function (x) { return x.checked; })[0]; return r ? r.value : ''; }
    function refresh() {
      var amt = Number(f.amount.value) || 0, card = way() === 'card';
      feeRow.hidden = !(card && S.coverFee);
      $('feeTxt') && ($('feeTxt').textContent = T('Add {amount} to cover the card processing fee', { amount: money(Math.round(amt * 100 * S.feeRate)) }));
      go.textContent = card ? T('Continue to secure payment') : T('Reserve this Kiddush');
    }
    var form = h('form', { novalidate: true }, [
      field(T('Name to show on the board'), 'f-name', f.name, h('label', { class: 'opt', for: 'f-anon' }, [f.anon, h('span', { text: T('Keep my name anonymous on the board') })])),
      h('div', { class: 'two stack' }, [field(T('Dedication'), 'f-kind', f.kind), field(T('In honor / memory of'), 'f-ded', f.ded)]),
      h('div', { class: 'two stack' }, [field(T('Email'), 'f-email', f.email), field(T('Phone'), 'f-phone', f.phone)]),
      field(T('Amount ($) — you’re welcome to give more'), 'f-amt', f.amount),
      h('div', { class: 'f' }, [h('label', { class: 'l', text: T('How would you like to pay?') }), ways, feeRow]),
      field(T('Note to the Rabbi'), 'f-note', f.note),
      err, go,
    ]);
    form.addEventListener('input', refresh); form.addEventListener('change', refresh);
    form.addEventListener('submit', function (e) {
      e.preventDefault(); if (st.busy) return;
      var amount = Number(f.amount.value);
      if (!f.name.value.trim()) return fail(T('Please enter the name to show on the board.'), f.name);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.value.trim())) return fail(T('Please enter a valid email address.'), f.email);
      if (!(amount >= s.priceCents / 100)) return fail(T('The minimum for this Kiddush is {amount}.', { amount: money(s.priceCents) }), f.amount);
      if (!way()) return fail(T('Please choose how you would like to pay.'));
      st.busy = true; go.disabled = true; err.textContent = '';
      store('kiddush-me', { name: f.name.value.trim(), email: f.email.value.trim(), phone: f.phone.value.trim() });
      api('/sponsor', { slot: s.key, name: f.name.value, anonymous: f.anon.checked, dedicationKind: f.ded.value.trim() ? f.kind.value : '', dedication: f.ded.value, email: f.email.value, phone: f.phone.value, amount: amount, method: way(), fee: f.fee.checked && way() === 'card', note: f.note.value, idem: idem, lang: KI.lang })
        .then(function (r) {
          if (r.method === 'card' && r.url) { go.textContent = T('Opening secure checkout…'); location.href = r.url; return; }
          st.busy = false; thanks(r, s, false, { name: f.name.value.trim(), email: f.email.value.trim(), phone: f.phone.value.trim(), amount: amount });
        }).catch(function (e) {
          st.busy = false; go.disabled = false; refresh(); err.textContent = e.message;
        });
    });
    function fail(msg, el) { err.textContent = msg; if (el) el.focus(); }
    var sp = sponsorsOf(s), std = KI.standard(S);
    showSheet([h('h2', { id: 'sheetTitle', text: KI.title(s) }), h('p', { class: 'sub', text: [s.kind === 'board' ? '' : KI.dateLabel(s), s.kind === 'board' ? '' : KI.hebDate(s)].filter(Boolean).concat([money(s.priceCents)]).join(' · '), dir: 'auto' }),
      s.past ? h('p', { class: 'fine', text: T('This Kiddush has already taken place. You are welcome to sponsor it now, in honor or in memory of someone dear.') }) : null,
      sp.length ? h('p', { class: 'fine', text: T('Already sponsored by {names}. You are welcome to join in sponsoring.', { names: sp.map(function (x) { return KI.name(x); }).join(' & ') }) }) : null,
      s.kind === 'board' ? h('p', { class: 'fine', text: T('Your name and dedication are displayed as the sponsor of the Kiddush board for the whole year.') }) : null,
      s.mevarchim ? h('p', { class: 'fine', text: mevLine(s) }) : null,
      s.kind !== 'board' && std ? h('p', { class: 'fine', text: std }) : null, s.kind !== 'board' ? largerNote() : null, form].filter(Boolean));
    refresh();
  }

  // ------------------------------------------------------------------ results
  function copyBtn(text) {
    var b = h('button', { class: 'copy', type: 'button', text: T('Copy'), onclick: function () {
      var done = function () { b.textContent = T('Copied'); setTimeout(function () { b.textContent = T('Copy'); }, 1600); };
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () {}); else { var ta = h('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { /* ignore */ } ta.remove(); }
    } });
    return b;
  }
  function kv(k, v, copy) { return h('div', { class: 'card' }, [h('div', { class: 'k', text: k }), h('div', { class: 'row' }, [h('div', { class: 'v', text: v, dir: 'auto' }), copy ? copyBtn(copy === true ? v : copy) : null])]); }
  function thanks(r, s, paid, form) {
    load(st.year);
    var S = st.board.settings, I = r.instructions || {}, disp = r.display || {}, slot = r.slot || (s && { title: s.title, titleHe: s.titleHe, dateLabel: s.dateLabel, date: s.date, heb: s.heb, hebHe: s.hebHe, kind: s.kind }) || {};
    var who = disp.name && disp.name !== 'Anonymous' ? ', ' + disp.name : '';
    var kids = [h('div', { class: 'big-ok', 'aria-hidden': 'true', text: '✓' }), h('h2', { class: 'cen', id: 'sheetTitle', text: T('Thank you') + who + '!' }),
      h('p', { class: 'sub cen', text: paid ? T('Your Kiddush sponsorship is confirmed.') : T('Please send your payment to complete your sponsorship.') })];
    var amt = r.amountCents != null ? money(r.amountCents) : (I.amount ? '$' + I.amount : '');
    var reason = KI.reason({ dedication: disp.dedication, kind: disp.kind, reason: disp.reason });
    kids.push(h('div', { class: 'sum' }, [
      h('div', { class: 'what', text: T(slot.kind === 'board' ? 'You are sponsoring the' : 'You are sponsoring') }), h('div', { class: 'big', text: slot.title ? KI.title(slot) : '' }),
      slot.kind === 'board' ? null : h('div', { class: 'dt', text: [slot.date ? KI.dateLabel(slot) : slot.dateLabel, KI.hebDate(slot)].filter(Boolean).join(' · ') }),
      reason ? h('div', { class: 'ded2', text: reason }) : null,
      h('div', { class: 'inc', text: (slot.kind === 'board' ? T('Displayed all year on the Kiddush board') : (KI.he ? (S.standardNoteHe || T('Standard Kiddush')) : (S.standardNote || 'Standard Kiddush'))) + (amt ? '  ·  ' + amt : '') }),
    ]));
    kids.push(h('p', { class: 'msg', text: T('Your generosity brings our community together.') + ' ' + (paid ? (disp.name === 'Anonymous' ? T('Your sponsorship will be acknowledged without your name.') : T('Your name and dedication now appear on our Kiddush board.')) : T('Your sponsorship will appear on the Kiddush board once your payment is confirmed.')) + ' ' + T('May you be blessed with health, happiness and success!') }));
    if (!paid) {
      kids.push(h('p', { class: 'msg', text: T('To complete your sponsorship, please send {amt} as follows:', { amt: amt || '' }) }));
      if (r.method === 'zelle') kids.push(kv(T('Zelle to'), I.zelleId, true), I.zelleName ? h('p', { class: 'fine cen', text: T('The account name is {name}.', { name: I.zelleName }) }) : null, kv(T('Memo'), I.memo, true));
      else if (r.method === 'venmo') kids.push(kv('Venmo', '@' + I.venmoHandle, true), kv(T('Note'), I.memo, true), h('a', { class: 'btn gold block', href: I.link, rel: 'noopener', text: T('Open Venmo') }));
      else if (r.method === 'check') kids.push(kv(T('Payable to'), I.payable, true), kv(T('Memo'), I.memo, true), kv(T('Mail or bring to'), I.address, true));
      else kids.push(kv(T('Memo'), I.memo, true), h('p', { class: 'fine cen', text: T('Please bring it to shul, or contact us to arrange another way to give.') }));
      if (r.recorded === false) { // nothing could be saved yet: ask them to email the details so the office can add them to the board
        var m = form || {}, body = ['Hello Rabbi,', '', 'I would like to sponsor ' + (slot.title || 'a Kiddush') + (slot.dateLabel ? ' (' + slot.dateLabel + ')' : '') + '.', 'Name on the board: ' + (m.name || disp.name || ''), 'Dedication: ' + (disp.dedication || 'none'), 'Amount: ' + (amt || ''), 'Paying by: ' + (METHODNAMES[r.method] || r.method), 'My email: ' + (m.email || ''), 'My phone: ' + (m.phone || '')].join('\n');
        kids.push(h('div', { class: 'card' }, [h('div', { class: 'k', text: T('One last step') }), h('div', { class: 'msg', style: 'margin:4px 0 8px', text: T('Please send us a quick email so we can add your name to the board and match your payment.') }),
          h('a', { class: 'btn gold block', href: 'mailto:' + ((r.contact && r.contact.email) || S.contactEmail) + '?subject=' + encodeURIComponent('Kiddush sponsorship: ' + (slot.title || '') + ' ' + (slot.dateLabel || '')) + '&body=' + encodeURIComponent(body), text: T('Email the details') })]));
      } else kids.push(h('p', { class: 'fine cen', text: T('We will confirm it as soon as it arrives, and send you a friendly reminder if we have not received it within 3 days.') }));
    } else kids.push(h('p', { class: 'fine cen', text: r.recorded === false ? T('Your payment was received and a receipt has been emailed to you. The office will add your name to the board.') : T('A receipt has been emailed to you.') }));
    if (slot.kind !== 'board') kids.push(largerNote('fine cen'));
    kids.push(h('button', { class: 'btn gold block', type: 'button', onclick: closeSheet, text: T('Back to the board') }));
    showSheet(kids.filter(Boolean));
  }
  function returned() {
    var id = params.get('paid'), sid = params.get('session_id');
    if (id && sid) {
      note([h('b', { text: T('Confirming your payment…') })]);
      var tries = 0;
      (function poll() {
        api('/confirm?id=' + encodeURIComponent(id) + '&session_id=' + encodeURIComponent(sid)).then(function (r) {
          if (r.status === 'paid') { note(''); load(st.year).then(function () { thanks(r, null, true); }); }
          else if (r.status === 'conflict') note([h('b', { text: T('We received your payment, ') }), T('but that week was taken a moment earlier. Please contact us and we will make it right.')], true);
          else if (r.status === 'expired') note(T('That checkout expired and no payment was taken. You can pick the week again below.'), true);
          else if (++tries < 6) setTimeout(poll, 2000); else note(T('We haven’t received confirmation yet. If you were charged, your sponsorship will appear shortly. Please contact us if it does not.'));
        }).catch(function (e) { note(e.message, true); });
      })();
    } else if (params.get('cancelled')) {
      api('/cancel', { id: params.get('cancelled') }).then(function () { note(T('Payment cancelled. No charge was made and the week was released.')); load(st.year); }, function () {});
    }
    if (id || params.get('cancelled')) history.replaceState(null, '', location.pathname + (KI.he ? '?lang=he' : ''));
  }

  // Staff entry: not shown anywhere until the bottom-left corner of the screen is tapped.
  (function () {
    var hot = $('staffHot'), link = $('staffLink'), tm;
    hot.addEventListener('click', function () { link.hidden = false; clearTimeout(tm); tm = setTimeout(function () { link.hidden = true; }, 6000); });
  })();
  $('onlyOpen').addEventListener('change', function (e) { st.onlyOpen = e.target.checked; if (st.board) render(); });
  load().then(function (b) {
    if (!b) return;
    returned();
    var w = params.get('w');
    if (w) {
      var s = b.slots.concat(b.boardSponsor ? [b.boardSponsor] : []).filter(function (x) { return x.key === w; })[0];
      if (s && !(s.past && list0(s))) openSheet(s);
      else if (s) note([h('b', { text: KI.title(s) + ' ' }), T('has already passed.')]);
    }
  });
})();
