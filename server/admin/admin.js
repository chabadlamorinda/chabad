'use strict';
(function () {
  var app = document.getElementById('app'), tab = 'donors';
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    for (var k in (attrs || {})) { if (k === 'text') n.textContent = attrs[k]; else if (k === 'class') n.className = attrs[k]; else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]); else n.setAttribute(k, attrs[k]); }
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function api(method, path, body) {
    return fetch('/admin/api' + path, { method: method, headers: { 'Content-Type': 'application/json', 'X-Admin': '1' }, body: body ? JSON.stringify(body) : undefined }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.error || 'Error'); e.status = r.status; throw e; } return j; });
    });
  }
  function shell(body) {
    app.textContent = '';
    app.appendChild(el('h1', { text: 'Rabbi’s desk' }));
    app.appendChild(el('div', { class: 'small', text: 'Chabad of Lamorinda · private' }));
    app.appendChild(waitingCard());
    var nav = el('nav');
    [['donors', 'Monthly donors'], ['yahrzeits', 'Yahrzeits'], ['members', 'Members'], ['announce', 'Announcements'], ['payments', 'Payment issues'], ['push', 'Send a message']].forEach(function (t) {
      nav.appendChild(el('button', { class: tab === t[0] ? 'on' : '', text: t[1], onclick: function () { tab = t[0]; load(); } }));
    });
    nav.appendChild(el('a', { href: '/admin/kiddush/', class: 'pill', style: 'padding:8px 14px;font-size:16px;text-decoration:none', text: 'Kiddush board' }));
    nav.appendChild(el('a', { href: '/admin/community', class: 'pill', style: 'padding:8px 14px;font-size:16px;text-decoration:none', text: 'Website: requests, sign-ups, RSVPs' }));
    nav.appendChild(el('button', { text: 'Sign out', onclick: function () { api('POST', '/logout').then(function () { login(); }); } }));
    app.appendChild(nav); app.appendChild(body);
  }
  // "Waiting for you": one tappable line per thing waiting on the website (counted by waiting.js), each opening its
  // section on the Website community page. Built once per visit; hidden where the website part is not installed.
  var waitBox = null;
  function waitingCard() {
    if (waitBox) return waitBox;
    var list = el('div'), slots = (window.WAITING || []).map(function () { return list.appendChild(el('div')); }), left = slots.length, any = false;
    waitBox = el('div', { class: 'card waiting' }, [el('h2', { text: 'Waiting for you' }), list, el('a', { class: 'big', href: '/admin/community', text: 'Open the website area ›' })]);
    if (!left) { waitBox.hidden = true; return waitBox; }
    (window.WAITING || []).forEach(function (w, i) {
      fetch('/admin/api' + w.path, { credentials: 'same-origin', headers: { 'x-admin': '1' } }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }).then(function (j) {
        if (j) { any = true; var n = w.count(j); if (n) slots[i].appendChild(el('a', { class: 'wait-row', href: '/admin/community#' + w.id }, [el('b', { text: String(n) }), ' ' + (n === 1 ? w.one : w.many), el('span', { text: '›' })])); }
        if (--left) return;
        if (!any) waitBox.hidden = true;
        else if (!list.querySelector('a')) list.appendChild(el('p', { class: 'small', text: 'Nothing waiting right now.' }));
      });
    });
    return waitBox;
  }
  function login(msg) {
    app.textContent = '';
    var pw = el('input', { type: 'password', autocomplete: 'current-password', 'aria-label': 'Password' });
    var err = el('div', { class: 'warn', text: msg || '' });
    function go() { api('POST', '/login', { password: pw.value }).then(load).catch(function (e) { err.textContent = e.message; }); }
    pw.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    app.appendChild(el('h1', { text: 'Rabbi’s desk' }));
    app.appendChild(el('div', { class: 'card' }, [el('p', { text: 'Password' }), pw, err, el('p', {}, [el('button', { text: 'Sign in', onclick: go })])]));
  }
  function wrapErr(p) { return p.catch(function (e) { if (e.status === 401) { login(); return null; } throw e; }); }

  var LV = { platinum: 'Platinum', gold: 'Gold', silver: 'Silver', bronze: 'Bronze' }, LC = { platinum: '#3f6490', gold: '#a06f24', silver: '#7d8590', bronze: '#8a5427' };
  function money(n) { return '$' + (Math.round(n * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 }); }
  function donors() {
    var box = el('div');
    wrapErr(api('GET', '/donors')).then(function (j) {
      if (!j) return;
      var sum = el('div', 'row');
      ['platinum', 'gold', 'silver', 'bronze'].forEach(function (l) {
        var c = el('div', 'card'); c.style.borderTop = '4px solid ' + LC[l]; c.style.minWidth = '150px';
        c.appendChild(el('strong', { text: LV[l] })); c.appendChild(el('div', { text: j.byLevel[l].count + (j.byLevel[l].count === 1 ? ' donor' : ' donors') }));
        c.appendChild(el('div', { class: 'small', text: money(j.byLevel[l].monthly) + ' / month' })); sum.appendChild(c);
      });
      box.appendChild(sum);
      box.appendChild(el('p', { class: 'small', text: 'All monthly gifts: ' + j.total.count + ' people, ' + money(j.total.monthly) + ' a month (before Stripe fees). Private to you: amounts and contact details are never shown on the public board.' }));
      if (!j.donors.length) box.appendChild(el('p', { text: 'No monthly donors yet.' }));
      j.donors.forEach(function (d) {
        var lvl = d.level ? el('span', { class: 'pill', text: LV[d.level] }) : el('span', { class: 'pill', text: d.club ? 'Under $72 (no medal)' : 'Other fund' });
        if (d.level) lvl.style.borderColor = LC[d.level];
        box.appendChild(el('div', { class: 'card' }, [
          el('div', { class: 'row' }, [el('strong', { text: d.name || d.email || 'Unnamed' }), lvl, el('span', { class: 'small', text: money(d.monthly) + ' / month' })]),
          el('div', { class: 'small', text: [d.email, d.phone].filter(Boolean).join(' · ') }),
          el('div', { class: 'small', text: (d.club ? (d.onBoard ? 'On the board as “' + d.boardName + '”' : 'Counted, not named on the board') : 'Fund: ' + d.fund) + ' · since ' + new Date(d.since).toLocaleDateString() + (d.next ? ' · next gift ' + new Date(d.next).toLocaleDateString() : '') })
        ]));
      });
    }).catch(function (e) { box.textContent = e.message; });
    return box;
  }
  var FUND_LIST = [];
  function announce() {
    var box = el('div'), items = [], status = el('span', { class: 'small' });
    function draw() {
      box.textContent = '';
      box.appendChild(el('p', { class: 'small', text: 'These appear on the home screen of everyone using the app. Use them for a matching day, a cause with a progress bar, or a short thank-you note. Up to 6; expired ones hide themselves.' }));
      items.forEach(function (a, i) {
        function f(label, key, type, ph) { var inp = el(type === 'area' ? 'textarea' : 'input', { 'aria-label': label, placeholder: label + (ph ? ' ' + ph : '') }); if (type === 'area') inp.rows = 2; else if (type) inp.type = type; inp.value = a[key] == null ? '' : a[key]; inp.addEventListener('input', function () { a[key] = type === 'number' ? Number(inp.value) : inp.value; }); return el('div', { style: 'margin:6px 0' }, [el('div', { class: 'small', text: label }), inp]); }
        var kind = el('select', { 'aria-label': 'Type' }); [['match', 'Matching day'], ['cause', 'Cause with progress bar'], ['impact', 'Thank-you / impact note']].forEach(function (k) { var o = el('option', { value: k[0], text: k[1] }); if (a.kind === k[0]) o.selected = true; kind.appendChild(o); });
        kind.addEventListener('change', function () { a.kind = kind.value; });
        var fund = el('select', { 'aria-label': 'Fund' }); [['', 'No fund (just a message)']].concat(FUND_LIST).forEach(function (k) { var o = el('option', { value: k[0], text: k[1] }); if (a.fund === k[0]) o.selected = true; fund.appendChild(o); });
        fund.addEventListener('change', function () { a.fund = fund.value; });
        box.appendChild(el('div', { class: 'card' }, [kind, f('Title', 'title'), f('Message', 'body', 'area'), f('Goal in dollars (cause only)', 'goal', 'number'), f('Raised so far in dollars (cause only)', 'raised', 'number'), f('Hide after this date (optional)', 'until', 'date'), el('div', { class: 'small', text: 'Button gives to:' }), fund,
          el('p', {}, [el('button', { text: 'Remove', onclick: function () { items.splice(i, 1); draw(); } })])]));
      });
      box.appendChild(el('p', {}, [el('button', { text: 'Add announcement', onclick: function () { if (items.length < 6) { items.push({ kind: 'impact', title: '', body: '', goal: 0, raised: 0, fund: '', until: '' }); draw(); } } }), ' ',
        el('button', { class: 'on', text: 'Save', onclick: function () { status.textContent = 'Saving…'; api('PUT', '/announcements', { items: items }).then(function (j) { items = j.items; status.textContent = 'Saved'; }).catch(function (e) { status.textContent = e.message; }); } }), ' ', status]));
    }
    wrapErr(api('GET', '/funds').then(function (f) { FUND_LIST = f.funds.map(function (x) { return [x.id, x.name]; }); return api('GET', '/announcements'); })).then(function (j) { if (!j) return; items = j.items; draw(); }).catch(function (e) { box.textContent = e.message; });
    return box;
  }
  function yahrzeits() {
    var box = el('div');
    wrapErr(api('GET', '/yahrzeits?days=60')).then(function (j) {
      if (!j) return;
      box.appendChild(el('p', { class: 'small', text: 'Only people who chose “Share with the Rabbi” appear here. Next 60 days.' }));
      box.appendChild(el('p', {}, [el('a', { href: '/admin/api/export.csv', text: 'Download all (CSV)' })]));
      if (!j.items.length) box.appendChild(el('p', { text: 'No upcoming yahrzeits to follow up on.' }));
      j.items.forEach(function (i) {
        var note = el('textarea', { rows: '2', 'aria-label': 'Follow-up note' }); note.value = i.followup.note;
        var done = el('input', { type: 'checkbox' }); done.checked = i.followup.done; done.style.width = 'auto';
        var saved = el('span', { class: 'small' });
        function save() { api('PUT', '/followup', { yahrzeitId: i.id, occurrence: i.date, note: note.value, done: done.checked }).then(function () { saved.textContent = 'Saved'; }).catch(function (e) { saved.textContent = e.message; }); }
        var when = i.daysLeft === 0 ? 'Today' : i.daysLeft === 1 ? 'Tomorrow' : 'In ' + i.daysLeft + ' days';
        var extra = i.dateNotes.length ? el('div', { class: 'small warn', text: 'Date note: ' + i.dateNotes.join(', ') + ' — check with the family which day they keep.' }) : null;
        box.appendChild(el('div', { class: 'card' }, [
          el('div', { class: 'row' }, [el('strong', { text: i.name }), i.relation ? el('span', { class: 'pill', text: i.relation }) : null, el('span', { class: 'small', text: when + ' · ' + i.date + ' · ' + i.hebrew })]),
          i.notes ? el('div', { class: 'small', text: i.notes }) : null, extra,
          el('div', { class: 'small', text: 'Family: ' + i.member.name + ' · ' + i.member.email + (i.member.phone ? ' · ' + i.member.phone : '') }),
          note, el('div', { class: 'row' }, [el('label', {}, [done, ' Followed up']), el('button', { text: 'Save', onclick: save }), saved])
        ]));
      });
    }).catch(function (e) { box.textContent = e.message; });
    return box;
  }
  function members() {
    var box = el('div');
    wrapErr(api('GET', '/members')).then(function (j) {
      if (!j) return;
      if (!j.members.length) box.appendChild(el('p', { text: 'No members yet.' }));
      j.members.forEach(function (m) {
        box.appendChild(el('div', { class: 'card' }, [el('strong', { text: m.name }), el('div', { class: 'small', text: m.email + (m.phone ? ' · ' + m.phone : '') }),
          el('div', { class: 'small', text: (m.shares ? 'Shares yahrzeits (' + m.yahrzeits + ')' : 'Does not share yahrzeits') + ' · notifications on ' + m.push + ' device(s)' }),
          m.cardIssue ? el('div', { class: 'warn small', text: 'Card problem: ' + m.cardIssue }) : null]));
      });
    }).catch(function (e) { box.textContent = e.message; });
    return box;
  }
  function payments() {
    var box = el('div');
    wrapErr(api('GET', '/payments')).then(function (j) {
      if (!j) return;
      if (!j.events.length) box.appendChild(el('p', { text: 'No payment problems recorded.' }));
      j.events.forEach(function (e) {
        var kids = [el('strong', { text: e.type + ' · $' + (e.amount_cents / 100).toFixed(2) }), el('div', { class: 'small', text: (e.email || e.customer_id || '') + ' · ' + new Date(e.created_at).toLocaleString() }), el('div', { class: 'small', text: e.message })];
        if (!e.resolved) kids.push(el('button', { text: 'Mark handled', onclick: function () { api('POST', '/payments/' + encodeURIComponent(e.event_id) + '/resolve').then(load); } }));
        else kids.push(el('span', { class: 'pill', text: 'handled' }));
        box.appendChild(el('div', { class: 'card' }, kids));
      });
    }).catch(function (e) { box.textContent = e.message; });
    return box;
  }
  function push() {
    var title = el('input', { maxlength: '60', placeholder: 'Title' }), body = el('textarea', { rows: '3', maxlength: '200', placeholder: 'Message' });
    var url = el('input', { value: '/pushka/' }), out = el('div', { class: 'small' }), ok = el('input', { type: 'checkbox' }); ok.style.width = 'auto';
    return el('div', { class: 'card' }, [el('p', { class: 'small', text: 'Sends a notification to everyone who turned notifications on.' }), title, body, el('p', { class: 'small', text: 'Opens (inside the app):' }), url,
      el('p', {}, [el('label', {}, [ok, ' I have read this and want to send it to everyone'])]),
      el('button', { text: 'Send', onclick: function () {
        out.textContent = 'Sending…';
        api('POST', '/broadcast', { title: title.value, body: body.value, url: url.value, confirm: ok.checked }).then(function (j) { out.textContent = 'Sent to ' + j.sent + ' of ' + j.total + ' device(s).'; }).catch(function (e) { out.textContent = e.message; });
      } }), out]);
  }
  function load() {
    var views = { announce: announce, donors: donors, yahrzeits: yahrzeits, members: members, payments: payments, push: push };
    shell(views[tab]());
  }
  api('GET', '/me').then(load).catch(function () { login(); });
})();
