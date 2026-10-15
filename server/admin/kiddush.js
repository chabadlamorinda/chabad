'use strict';
// The Rabbi's Kiddush page: see the whole year, enter or edit sponsors, mark payments received, settings.
// Text from donors is only ever inserted with textContent.
(function () {
  var app = document.getElementById('app'), tab = 'board', year = null, filter = 'upcoming', data = null, pendingCount = 0;
  var KINDS = { '': 'No dedication', honor: 'In honor of', memory: 'In loving memory of', refuah: 'For the speedy recovery of', celebration: 'In celebration of', merit: 'In the merit of' };
  var METHODS = { card: 'Card (Stripe)', zelle: 'Zelle', venmo: 'Venmo', check: 'Check', cash: 'Cash', other: 'Other' };

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    for (var k in (attrs || {})) { var v = attrs[k]; if (v == null || v === false) continue; if (k === 'text') n.textContent = v; else if (k === 'class') n.className = v; else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v); else if (k === 'value') n.value = v; else if (k === 'checked') n.checked = !!v; else n.setAttribute(k, v === true ? '' : v); }
    [].concat(kids || []).forEach(function (c) { if (c != null && c !== false) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function api(method, path, body) {
    return fetch('/admin/api/kiddush' + path, { method: method, headers: { 'Content-Type': 'application/json', 'X-Admin': '1' }, body: body ? JSON.stringify(body) : undefined }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.error || 'Error'); e.status = r.status; throw e; } return j; });
    });
  }
  var money = function (c) { return '$' + (c / 100).toFixed(2).replace(/\.00$/, ''); };
  var ded = function (k, t) { return t ? (KINDS[k] ? KINDS[k] + ' ' : '') + t : ''; };
  function guard(p) { return p.catch(function (e) { if (e.status === 401) { login(); return null; } alert(e.message); return null; }); }

  function shell(body) {
    app.textContent = '';
    app.appendChild(el('h1', { text: 'Kiddush board' }));
    app.appendChild(el('div', { class: 'small' }, [el('a', { href: '/admin/', text: '← Rabbi’s desk' }), ' · Chabad of Lamorinda · private']));
    var nav = el('nav');
    [['board', 'The board'], ['pending', 'Waiting for payment' + (pendingCount ? ' ' : '')], ['events', 'Add an event'], ['settings', 'Settings']].forEach(function (t) {
      var b = el('button', { class: tab === t[0] ? 'on' : '', text: t[1].trim(), onclick: function () { tab = t[0]; load(); } });
      if (t[0] === 'pending' && pendingCount) b.appendChild(el('span', { class: 'badge', text: String(pendingCount) }));
      nav.appendChild(b);
    });
    nav.appendChild(el('a', { class: 'btn', href: '/admin/api/kiddush/export.csv', text: 'Download spreadsheet' }));
    app.appendChild(nav); app.appendChild(body);
  }
  function login() {
    app.textContent = '';
    var pw = el('input', { type: 'password', autocomplete: 'current-password', 'aria-label': 'Password' }), err = el('div', { class: 'warn' });
    function go() { fetch('/admin/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw.value }) }).then(function (r) { if (!r.ok) throw new Error('Wrong password.'); load(); }).catch(function (e) { err.textContent = e.message; }); }
    pw.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    app.appendChild(el('h1', { text: 'Kiddush board' }));
    app.appendChild(el('div', { class: 'card' }, [el('p', { text: 'Password' }), pw, err, el('p', {}, [el('button', { class: 'pri', text: 'Sign in', onclick: go })])]));
  }

  // ------------------------------------------------------------ board
  function boardTab() {
    var box = el('div');
    guard(api('GET', '/board' + (year ? '?year=' + year : ''))).then(function (b) {
      if (!b) return; data = b; year = b.year;
      var links = el('div', { class: 'card' }, [
        el('div', { class: 'row' }, [el('b', { text: 'Links:' }),
          el('a', { class: 'btn', href: '/kiddush/tv/', target: '_blank', text: 'TV display' }), el('a', { class: 'btn', href: '/kiddush/', target: '_blank', text: 'Sponsor page (phones)' }),
          el('button', { text: 'Copy sponsor link', onclick: function (e) { var u = (b.settings.publicUrl || location.origin) + '/kiddush/'; navigator.clipboard && navigator.clipboard.writeText(u); e.target.textContent = 'Copied: ' + u; } })]),
        el('div', { class: 'small', text: 'On the TV, open the TV display in its web browser and press F11 for full screen. It updates itself every minute.' }),
      ]);
      var yrs = el('h2', { text: 'Year ' + b.year + ' · ' + b.yearHe });
      var fl = el('div', { class: 'row', style: 'margin:10px 0' }, [['upcoming', 'Upcoming'], ['all', 'Whole year'], ['open', 'Open'], ['pending', 'Waiting for payment'], ['paid', 'Sponsored'], ['hidden', 'Hidden']].map(function (f) {
        return el('button', { class: filter === f[0] ? 'on' : '', text: f[1], onclick: function () { filter = f[0]; boardTab.render(box, b); } });
      }));
      box.appendChild(links); box.appendChild(yrs); box.appendChild(fl); var tbl = el('div'); box.appendChild(tbl); box._tbl = tbl;
      boardTab.render(box, b);
    });
    return box;
  }
  boardTab.render = function (box, b) {
    var tbl = box._tbl; tbl.textContent = '';
    var rows = b.slots.filter(function (s) {
      var sp = s.sponsorship;
      return (filter === 'upcoming' && !s.past) || filter === 'all' || (filter === 'open' && !sp && !s.hidden) || (filter === 'pending' && sp && sp.status === 'pending') || (filter === 'paid' && sp && sp.status === 'paid') || (filter === 'hidden' && s.hidden);
    });
    var t = el('table'), head = el('tr'); ['Date', 'Week', 'Status', 'Sponsor', 'Gift'].forEach(function (h) { head.appendChild(el('th', { text: h })); }); t.appendChild(head);
    rows.forEach(function (s) {
      var sp = s.sponsorship, tr = el('tr', { class: 'click' + (s.past ? ' past' : ''), onclick: function () { editor(s, b); } });
      tr.appendChild(el('td', { text: s.dateLabel + (s.past ? ' (past)' : '') }));
      tr.appendChild(el('td', {}, [s.title, el('div', { class: 'small', text: s.heb + (s.hidden ? ' · hidden' : '') })]));
      tr.appendChild(el('td', {}, [s.hidden && !sp ? el('span', { class: 'pill hid', text: 'Hidden' }) : sp ? el('span', { class: 'pill ' + sp.status, text: sp.status === 'paid' ? 'Paid' : 'Waiting for payment' }) : el('span', { class: 'pill', text: 'Open' })]));
      tr.appendChild(el('td', {}, sp ? [sp.name + (sp.anonymous ? ' (anonymous)' : ''), el('div', { class: 'small', text: ded(sp.dedicationKind, sp.dedication) })] : ''));
      tr.appendChild(el('td', { text: sp ? money(sp.amountCents) + ' · ' + (METHODS[sp.method] || sp.method) : money(s.priceCents) }));
      t.appendChild(tr);
    });
    tbl.appendChild(rows.length ? t : el('p', { class: 'small', text: 'Nothing matches.' }));
  };

  function modal(content) {
    var m = el('div', { class: 'modal', onclick: function (e) { if (e.target === m) m.remove(); } }, [el('div', { class: 'card', role: 'dialog' }, content)]);
    document.body.appendChild(m); return m;
  }
  function editor(s, b) {
    var sp = s.sponsorship, f = {}, m;
    function inp(label, key, val, attrs) { f[key] = el('input', Object.assign({ value: val == null ? '' : val }, attrs || {})); return el('div', {}, [el('label', { text: label }), f[key]]); }
    var kind = el('select', {}, Object.keys(KINDS).map(function (k) { return el('option', { value: k, text: KINDS[k], selected: sp && sp.dedicationKind === k }); }));
    var method = el('select', {}, Object.keys(METHODS).filter(function (k) { return k !== 'card' || (sp && sp.method === 'card'); }).map(function (k) { return el('option', { value: k, text: METHODS[k], selected: sp ? sp.method === k : k === 'check' }); }));
    var anon = el('input', { type: 'checkbox', checked: sp && sp.anonymous });
    var paid = el('select', {}, [el('option', { value: 'paid', text: 'Paid — money received', selected: !sp || sp.status === 'paid' }), el('option', { value: 'pending', text: 'Waiting for payment', selected: sp && sp.status === 'pending' })]);
    var note = el('textarea', { rows: '2' }); note.value = sp ? sp.note : '';
    var hide = el('input', { type: 'checkbox', checked: s.hidden }), title = el('input', { value: s.customTitle ? s.title : '', placeholder: s.title }), price = el('input', { type: 'number', value: s.customPrice ? s.priceCents / 100 : '', placeholder: String(s.priceCents / 100), min: '1' });
    var err = el('div', { class: 'warn' });
    function close() { m.remove(); load(); }
    function run(p) { guard(p).then(function (r) { if (r) close(); }); }
    var form = [
      el('h2', { text: s.title }), el('div', { class: 'small', text: s.dateLabel + ' · ' + s.heb + (s.note ? ' · ' + s.note : '') }),
      sp && sp.createdAt ? el('div', { class: 'small', text: 'Entered ' + (sp.source === 'admin' ? 'by you' : 'online') + ' on ' + new Date(sp.createdAt).toLocaleDateString() + (sp.paidAt ? ' · paid ' + new Date(sp.paidAt).toLocaleDateString() : '') }) : null,
      el('h2', { style: 'margin-top:12px', text: sp ? 'Sponsor' : 'Add a sponsor' }),
      inp('Name (as shown on the board)', 'name', sp && sp.name, { maxlength: '80' }),
      el('label', {}, [anon, ' Show as “Anonymous” on the board']),
      el('div', { class: 'grid2' }, [el('div', {}, [el('label', { text: 'Dedication' }), kind]), inp('In honor / memory of', 'ded', sp && sp.dedication, { maxlength: '120' })]),
      el('div', { class: 'grid2' }, [inp('Email', 'email', sp && sp.email), inp('Phone', 'phone', sp && sp.phone)]),
      el('div', { class: 'grid2' }, [inp('Amount ($)', 'amount', sp ? sp.amountCents / 100 : s.priceCents / 100, { type: 'number', min: '0' }), el('div', {}, [el('label', { text: 'Paid by' }), method])]),
      el('div', {}, [el('label', { text: 'Status' }), paid]),
      el('div', {}, [el('label', { text: 'Note' }), note]), err,
      el('div', { class: 'row', style: 'margin-top:10px' }, [
        el('button', { class: 'pri', text: sp ? 'Save changes' : 'Add sponsor', onclick: function () {
          var body = { name: f.name.value, anonymous: anon.checked, dedicationKind: kind.value, dedication: f.ded.value, email: f.email.value, phone: f.phone.value, amount: f.amount.value, method: method.value, status: paid.value, note: note.value };
          if (!body.name.trim()) { err.textContent = 'Please enter a name.'; return; }
          run(sp ? api('PATCH', '/sponsorship/' + sp.id, body) : api('POST', '/sponsorship', Object.assign({ slot: s.key }, body)));
        } }),
        sp && sp.status === 'pending' ? el('button', { text: 'Mark paid', onclick: function () { run(api('PATCH', '/sponsorship/' + sp.id, { status: 'paid' })); } }) : null,
        sp ? el('button', { class: 'bad', text: 'Remove sponsor', onclick: function () { if (confirm('Remove this sponsor and open the week again?')) run(api('POST', '/sponsorship/' + sp.id + '/release', {})); } }) : null,
        el('button', { text: 'Cancel', onclick: function () { m.remove(); } }),
      ]),
      el('h2', { style: 'margin-top:18px', text: 'This week’s settings' }),
      el('div', { class: 'grid2' }, [el('div', {}, [el('label', { text: 'Different name' }), title]), el('div', {}, [el('label', { text: 'Different price ($)' }), price])]),
      el('label', {}, [hide, ' Hide this week from the board and the sponsor page']),
      el('div', { class: 'row', style: 'margin-top:8px' }, [el('button', { text: 'Save week settings', onclick: function () { run(api('PUT', '/slot', { key: s.key, hidden: hide.checked, title: title.value, price: price.value })); } }),
        s.eventId ? el('button', { class: 'bad', text: 'Delete this event', onclick: function () { if (confirm('Delete this event?')) run(api('DELETE', '/events/' + s.eventId)); } }) : null]),
      sp && (sp.email || sp.phone || sp.note) ? el('p', { class: 'small', text: 'Private: ' + [sp.email, sp.phone, sp.note && 'Note: ' + sp.note].filter(Boolean).join(' · ') }) : null,
    ];
    m = modal(form.filter(Boolean));
  }

  // ------------------------------------------------------------ waiting for payment
  function pendingTab() {
    var box = el('div');
    guard(api('GET', '/pending')).then(function (r) {
      if (!r) return; pendingCount = r.pending.length;
      if (!r.pending.length) { box.appendChild(el('div', { class: 'card', text: 'Nothing is waiting. Every reservation has been paid.' })); return; }
      box.appendChild(el('p', { class: 'small', text: 'People who reserved a week and said they would pay by Zelle, Venmo, check or cash (or who are still at the card checkout). Tap “Mark paid” when the money arrives.' }));
      r.pending.forEach(function (p) {
        var days = Math.floor((Date.now() - new Date(p.createdAt)) / 864e5);
        box.appendChild(el('div', { class: 'card' }, [
          el('div', { class: 'row' }, [el('b', { text: p.slot.title + ' · ' + p.slot.dateLabel }), el('span', { class: 'pill pending', text: METHODS[p.method] || p.method }), el('span', { class: days >= 7 ? 'small warn' : 'small', text: days === 0 ? 'today' : days + ' day' + (days > 1 ? 's' : '') + ' ago' })]),
          el('div', { text: p.name + ' · ' + money(p.amountCents) }), el('div', { class: 'small', text: [p.email, p.phone, ded(p.dedicationKind, p.dedication)].filter(Boolean).join(' · ') }), p.note ? el('div', { class: 'small', text: 'Note: ' + p.note }) : null,
          el('div', { class: 'row', style: 'margin-top:8px' }, [
            el('button', { class: 'pri', text: 'Mark paid', onclick: function () { guard(api('PATCH', '/sponsorship/' + p.id, { status: 'paid' })).then(load); } }),
            el('button', { class: 'bad', text: 'Release the week', onclick: function () { if (confirm('Release this week so someone else can sponsor it?')) guard(api('POST', '/sponsorship/' + p.id + '/release', {})).then(load); } }),
            p.email ? el('a', { class: 'btn', href: 'mailto:' + p.email + '?subject=' + encodeURIComponent('Your Kiddush sponsorship: ' + p.slot.title + ' ' + p.slot.dateLabel), text: 'Email' }) : null])]));
      });
    });
    return box;
  }

  // ------------------------------------------------------------ events
  function eventsTab() {
    var date = el('input', { type: 'date' }), title = el('input', { maxlength: '80', placeholder: 'e.g. Chanukah Celebration' }), he = el('input', { maxlength: '80', placeholder: 'Optional Hebrew name' }), err = el('div', { class: 'warn' });
    return el('div', { class: 'card' }, [
      el('h2', { text: 'Add an event' }),
      el('p', { class: 'small', text: 'Every Shabbat, Yom Tov day and Purim is already on the board. Use this for anything else people can sponsor a Kiddush or meal for (Chanukah party, Lag BaOmer, a special Shabbaton…). It appears on the board in date order. Change its price or delete it later by tapping it on The board.' }),
      el('label', { text: 'Date' }), date, el('label', { text: 'Name' }), title, el('label', { text: 'Hebrew name' }), he, err,
      el('p', {}, [el('button', { class: 'pri', text: 'Add to the board', onclick: function () { guard(api('POST', '/events', { date: date.value, title: title.value, titleHe: he.value })).then(function (r) { if (r) { tab = 'board'; load(); } }); } })]),
    ]);
  }

  // ------------------------------------------------------------ settings
  var SETTING_UI = [
    ['Prices', [['standardNote', 'What a sponsorship includes (shown to donors)', 't'], ['priceShabbat', 'Shabbat Kiddush ($)', 'n'], ['priceHoliday', 'Holiday / other ($)', 'n'], ['priceBoard', 'Sponsor the Kiddush board for the year ($)', 'n']]],
    ['Card payments', [['cardOn', 'Accept cards, Apple Pay and Google Pay (Stripe)', 'b'], ['coverFee', 'Offer “cover the card fee” (3.5%)', 'b']]],
    ['Zelle', [['zelleOn', 'Offer Zelle', 'b'], ['zelleId', 'Zelle email or phone (Zelle stays hidden until this is filled in)', 't'], ['zelleName', 'Name on the Zelle account', 't']]],
    ['Venmo', [['venmoOn', 'Offer Venmo', 'b'], ['venmoHandle', 'Venmo username', 't']]],
    ['Check and cash', [['checkOn', 'Offer check', 'b'], ['checkPayable', 'Checks payable to', 't'], ['checkAddress', 'Mailing address', 't'], ['cashOn', 'Offer cash / other at shul', 'b']]],
    ['Contact shown to donors', [['contactEmail', 'Email', 't'], ['contactPhone', 'Phone', 't']]],
    ['The board', [['boardYear', 'Year shown on the board: 0 = automatic (switches at Rosh Hashanah). Only enter a year like 5787 to force one.', 'n'], ['includePurim', 'Include Purim', 'b'], ['showPending', 'Show names on the TV as soon as someone reserves (before payment arrives)', 'b'], ['blessing', 'Blessing shown on the TV', 'a'], ['donorEn', '“Donated by” line (English)', 't'], ['donorHe', '“Donated by” line (Hebrew)', 't'],
      ['publicUrl', 'Web address for the QR code (optional, e.g. https://kiddush.chabadoflamorinda.com)', 't']]],
  ];
  function settingsTab() {
    var box = el('div');
    guard(api('GET', '/settings')).then(function (r) {
      if (!r) return; var S = r.settings, inputs = {};
      if (!r.cardAvailable) box.appendChild(el('div', { class: 'card warn', text: 'Card payments are off because Stripe is not connected yet (see the setup guide). Zelle, Venmo, check and cash still work.' }));
      SETTING_UI.forEach(function (sec) {
        var c = el('div', { class: 'card' }, [el('h2', { text: sec[0] })]);
        sec[1].forEach(function (d) {
          var k = d[0], i;
          if (d[2] === 'b') { i = el('input', { type: 'checkbox', checked: S[k] }); c.appendChild(el('label', { style: 'font-size:16px;color:inherit' }, [i, ' ' + d[1]])); }
          else if (d[2] === 'a') { i = el('textarea', { rows: '4' }); i.value = S[k] || ''; c.appendChild(el('label', { text: d[1] })); c.appendChild(i); }
          else { i = el('input', { type: d[2] === 'n' ? 'number' : 'text', value: S[k], min: k === 'boardYear' ? '0' : '1', step: k === 'boardYear' ? '1' : 'any' }); c.appendChild(el('label', { text: d[1] })); c.appendChild(i); }
          inputs[k] = [i, d[2]];
        });
        box.appendChild(c);
      });
      var msg = el('span', { class: 'small' });
      box.appendChild(el('p', { class: 'row' }, [el('button', { class: 'pri', text: 'Save settings', onclick: function () {
        var body = {}; Object.keys(inputs).forEach(function (k) { var i = inputs[k]; body[k] = i[1] === 'b' ? i[0].checked : i[0].value; });
        guard(api('PUT', '/settings', body)).then(function (r2) { msg.textContent = r2 ? 'Saved.' : ''; msg.className = 'small ok'; });
      } }), msg]));
    });
    return box;
  }

  function load() {
    api('GET', '/pending').then(function (r) { pendingCount = r.pending.length; }).catch(function () {}).then(function () {
      var body = tab === 'board' ? boardTab() : tab === 'pending' ? pendingTab() : tab === 'events' ? eventsTab() : settingsTab();
      shell(body);
    });
  }
  api('GET', '/pending').then(function () { load(); }).catch(function (e) { if (e.status === 401) login(); else { app.textContent = e.message; } });
})();
