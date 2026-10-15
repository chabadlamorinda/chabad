'use strict';
(function () {
  var app = document.getElementById('app'), tab = 'yahrzeits';
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
    var nav = el('nav');
    [['yahrzeits', 'Yahrzeits'], ['members', 'Members'], ['payments', 'Payment issues'], ['push', 'Send a message']].forEach(function (t) {
      nav.appendChild(el('button', { class: tab === t[0] ? 'on' : '', text: t[1], onclick: function () { tab = t[0]; load(); } }));
    });
    nav.appendChild(el('a', { href: '/admin/kiddush/', class: 'pill', style: 'padding:8px 14px;font-size:16px;text-decoration:none', text: 'Kiddush board' }));
    nav.appendChild(el('button', { text: 'Sign out', onclick: function () { api('POST', '/logout').then(function () { login(); }); } }));
    app.appendChild(nav); app.appendChild(body);
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
    var views = { yahrzeits: yahrzeits, members: members, payments: payments, push: push };
    shell(views[tab]());
  }
  api('GET', '/me').then(load).catch(function () { login(); });
})();
