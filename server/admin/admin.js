'use strict';
(function () {
  var app = document.getElementById('app'), tab = null;
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
  // The desk, phone first: what waits for the Rabbi, today's event, then every tool as a big tile with one line on
  // what it is for, in three groups. A tool opens below the tiles' place, with a way back to the desk.
  var TOOLS = [
    ['People', [
      ['members', 'Members', 'Families who use the app, with their details'],
      ['yahrzeits', 'Yahrzeits', 'Coming in the next 60 days, to call or remember'],
      ['donors', 'Monthly donors', 'Who gives every month, and how much'],
    ]],
    ['Money', [
      ['/admin/finances', 'Finances', 'Money in and out, donors, tax letters, reports'],
      ['payments', 'Payment issues', 'Cards that failed or need a look'],
      ['/admin/kiddush/', 'Kiddush board', 'Sponsors and the Kiddush TV screen'],
    ]],
    ['Website and app', [
      ['/admin/community', 'Website', 'Requests, sign-ups, RSVPs, approvals, visitors'],
      ['announce', 'Announcements', 'Notices on the app’s home screen'],
      ['push', 'Send a message', 'A notification to everyone’s phone'],
    ]],
  ];
  function shell(body) {
    app.textContent = '';
    app.appendChild(el('div', { class: 'desk-top' }, [el('div', {}, [el('h1', { text: 'Rabbi’s desk' }), el('div', { class: 'small', text: 'Chabad of Lamorinda · private' })]),
      el('button', { class: 'quiet', text: 'Sign out', onclick: function () { api('POST', '/logout').then(function () { login(); }); } })]));
    if (tab) {
      // One tool open: its name, a way back, and the tool itself.
      var name = '';
      TOOLS.forEach(function (g) { g[1].forEach(function (t) { if (t[0] === tab) name = t[1]; }); });
      app.appendChild(el('div', { class: 'tool-head' }, [el('button', { class: 'quiet', text: '‹ Desk', onclick: function () { tab = null; load(); } }), el('h2', { text: name })]));
      app.appendChild(body);
      return;
    }
    app.appendChild(waitingCard());
    app.appendChild(todayCard());
    TOOLS.forEach(function (g) {
      app.appendChild(el('h2', { class: 'group-h', text: g[0] }));
      app.appendChild(el('div', { class: 'tiles' }, g[1].map(function (t) {
        var kids = [el('strong', { text: t[1] }), el('span', { text: t[2] })];
        return t[0].charAt(0) === '/' ? el('a', { class: 'tile', href: t[0] }, kids) : el('button', { class: 'tile', onclick: function () { tab = t[0]; load(); window.scrollTo(0, 0); } }, kids);
      })));
    });
  }
  // "Today": the next event that takes RSVPs (through the day after it), how many are coming, and one tap to check
  // guests in at the door. Hidden when there is none (or the website part is not installed).
  function todayCard() {
    var box = el('div', { class: 'card today' }); box.hidden = true;
    fetch('/admin/api/site/rsvps', { credentials: 'same-origin', headers: { 'x-admin': '1' } }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }).then(function (j) {
      var e = j && (j.events || []).filter(function (x) { return !x.draft; }).sort(function (a, b) { return a.start < b.start ? -1 : 1; })[0];
      if (!e) return;
      var d = new Date(e.start), when = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) + ', ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      var today = new Date().toDateString() === d.toDateString();
      box.appendChild(el('p', { class: 'eyebrow', text: today ? 'Today' : 'Next event' }));
      box.appendChild(el('strong', { class: 'today-t', text: e.title }));
      box.appendChild(el('div', { class: 'small', text: when }));
      box.appendChild(el('div', { class: 'today-n' }, [el('b', { text: String(e.going) }), e.going === 1 ? ' person coming' : ' people coming', e.capacity ? el('span', { class: 'small', text: ' of ' + e.capacity + ' places' }) : null]));
      box.appendChild(el('div', { class: 'row' }, [el('a', { class: 'big', href: '/admin/community?checkin=' + encodeURIComponent(e.slug), text: 'Check in at the door' }), el('a', { class: 'big quiet', href: '/admin/community#rsvps', text: 'Who is coming' })]));
      box.hidden = false;
    });
    return box;
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
      else box.appendChild(el('p', { text: j.members.length + ' people in all · ' + j.members.filter(function (m) { return m.signedIn; }).length + ' signed in with their own pushka · $' + (j.members.reduce(function (a, m) { return a + (m.giftCents || 0); }, 0) / 100).toFixed(2) + ' given by them so far' }));
      j.members.forEach(function (m) {
        box.appendChild(el('div', { class: 'card' }, [el('strong', { text: m.name || '(no name yet)' }), el('div', { class: 'small', text: m.gifts ? 'Donated so far: $' + (m.giftCents / 100).toFixed(2) + ' in ' + m.gifts + (m.gifts === 1 ? ' gift' : ' gifts') : 'No gifts yet' }), el('div', { class: 'small', text: (m.signedIn ? 'Signed in with email' : 'Saved details only') + ' · joined ' + new Date(m.joined).toLocaleDateString() + (m.savedAt ? ' · pushka last saved ' + new Date(m.savedAt).toLocaleDateString() : '') }), el('div', { class: 'small', text: m.email + (m.phone ? ' · ' + m.phone : '') }),
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
    shell(tab ? views[tab]() : null);
  }
  api('GET', '/me').then(load).catch(function () { login(); });
})();
