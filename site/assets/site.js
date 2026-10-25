// Chabad of Lamorinda website: one-tap RSVP and the "My account" page (family, birthdays, yahrzeits).
// Plain JavaScript, no libraries. Everything else on the site works without it.
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var store = { get: function (k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    for (var k in attrs || {}) { if (k === 'text') n.textContent = attrs[k]; else if (k === 'on') for (var ev in attrs.on) n.addEventListener(ev, attrs.on[ev]); else if (attrs[k] !== false && attrs[k] != null) n.setAttribute(k, attrs[k] === true ? '' : attrs[k]); }
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function api(method, path, body) {
    return fetch('/api/site' + path, { method: method, credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-site': '1' }, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j._status = r.status; return j; }); });
  }
  function msg(node, text, ok) { node.textContent = text || ''; node.className = 'msg ' + (ok ? 'ok' : 'err'); node.hidden = !text; }
  function stepper(label, value, min) {
    var out = el('output', { text: String(value) }), v = value;
    var set = function (n) { v = Math.max(min, Math.min(30, n)); out.textContent = v; };
    var box = el('div', { class: 'row' }, [el('span', { text: label }), el('span', { class: 'stepper' }, [
      el('button', { type: 'button', 'aria-label': 'Fewer ' + label, text: '−', on: { click: function () { set(v - 1); } } }), out,
      el('button', { type: 'button', 'aria-label': 'More ' + label, text: '+', on: { click: function () { set(v + 1); } } })])]);
    box.value = function () { return v; };
    return box;
  }

  // Header: "Sign in" becomes "My account" once signed in on this device.
  if (store.get('cl_signed')) { var a = $('[data-account]'); if (a) a.textContent = 'My account'; }

  // ---------- RSVP ----------
  var box = $('[data-rsvp]');
  if (box) {
    var slug = box.getAttribute('data-rsvp'), ui = $('.rsvp-ui', box), withKids = box.getAttribute('data-kids') === '1';
    api('GET', '/rsvp/' + slug).then(function (s) {
      ui.hidden = false;
      if (s._status === 503) { ui.appendChild(el('p', { text: 'Online RSVP is coming soon. Please call or email us to RSVP.' })); return; }
      if (s._status !== 200) { ui.appendChild(el('p', { text: 'Could not load the RSVP form. Please refresh the page.' })); return; }
      var guest = store.get('cl_guest') || {}, mine = s.mine, sug = s.suggest || { adults: 1, kids: 0 };
      var adults = stepper('Adults', mine ? mine.adults : sug.adults, 0), kids = stepper('Children', mine ? mine.kids : sug.kids, 0);
      var name = el('input', { name: 'name', autocomplete: 'name', value: guest.name || '', required: true });
      var email = el('input', { name: 'email', type: 'email', autocomplete: 'email', value: guest.email || '', required: true });
      var phone = el('input', { name: 'phone', type: 'tel', autocomplete: 'tel', value: guest.phone || '' });
      var note = el('input', { name: 'note', placeholder: 'Anything we should know? (optional)' });
      var m = el('p', { class: 'msg', hidden: true }), go = el('button', { class: 'btn gold', type: 'submit', text: mine ? 'Update my RSVP' : (s.signedIn ? "I'm coming" : 'RSVP') });
      var form = el('form', {}, [
        s.signedIn ? el('p', { text: (mine ? 'You are coming. ' : '') + 'RSVP as ' + (s.name || 'you') + '.' }) : null,
        adults, withKids ? kids : null,
        s.signedIn ? null : el('div', { class: 'fields' }, [el('label', {}, ['Name', name]), el('label', {}, ['Email', email]), el('label', {}, ['Phone (optional)', phone])]),
        el('label', {}, ['Note', note]), el('p', { class: 'btns' }, [go]), m,
        s.signedIn ? null : el('p', { class: 'muted' }, ['Tip: ', el('a', { href: '/account', text: 'sign in' }), ' once and next time RSVP is a single tap.'])]);
      form.addEventListener('submit', function (ev) {
        ev.preventDefault(); go.disabled = true;
        var body = { adults: adults.value(), kids: withKids ? kids.value() : 0, note: note.value, name: name.value, email: email.value, phone: phone.value };
        if (!s.signedIn) store.set('cl_guest', { name: name.value, email: email.value, phone: phone.value });
        api('POST', '/rsvp/' + slug, body).then(function (r) {
          go.disabled = false;
          if (r.ok) { msg(m, 'Thank you! You are on the list. See you there.', true); go.textContent = 'Update my RSVP'; if (window.gtag) window.gtag('event', 'rsvp', { event_label: slug }); }
          else msg(m, r.error || 'Something went wrong.');
        });
      });
      ui.appendChild(form);
    });
  }

  // ---------- Community board: share your news ----------
  var sub = $('[data-submit]');
  if (sub) {
    var guestInfo = store.get('cl_guest') || {};
    if (guestInfo.name && !sub.name.value) sub.name.value = guestInfo.name;
    if (guestInfo.email && !sub.email.value) sub.email.value = guestInfo.email;
    sub.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var m = $('.msg', sub), b = $('button', sub); b.disabled = true;
      api('POST', '/submit', { kind: sub.kind.value, title: sub.title.value, body: sub.body.value, link: sub.link.value, name: sub.name.value, email: sub.email.value }).then(function (r) {
        b.disabled = false;
        if (r.ok) { msg(m, 'Thank you! The Rabbi will review it and post it soon.', true); sub.title.value = ''; sub.body.value = ''; sub.link.value = ''; }
        else msg(m, r.error || 'Something went wrong.');
      });
    });
  }

  // ---------- My account ----------
  var acct = $('#account');
  if (acct) loadAccount();
  function loadAccount() {
    api('GET', '/me').then(function (me) {
      acct.textContent = '';
      if (me._status === 503) { acct.appendChild(el('p', { text: 'Accounts are being set up and will open soon.' })); return; }
      if (me._status === 401) { store.set('cl_signed', false); return signIn(); }
      if (me._status !== 200) { acct.appendChild(el('p', { text: 'Something went wrong. Please refresh the page.' })); return; }
      store.set('cl_signed', true); profile(me);
    });
  }
  function signIn() {
    var email = el('input', { type: 'email', autocomplete: 'email', required: true }), m = el('p', { class: 'msg', hidden: true });
    var go = el('button', { class: 'btn gold', type: 'submit', text: 'Email me a sign-in code' });
    if (/expired=1/.test(location.search)) msg(m, 'That sign-in link has expired. Please ask for a new one.');
    var f = el('form', { class: 'card tool' }, [el('p', { text: 'Sign in or create your free account with your email. No password: we email you a 6-digit code.' }), el('label', {}, ['Email', email]), go, m]);
    f.addEventListener('submit', function (ev) {
      ev.preventDefault(); go.disabled = true;
      api('POST', '/login', { email: email.value }).then(function (r) { go.disabled = false; if (r.ok) codeStep(email.value.trim()); else msg(m, r.error); });
    });
    acct.appendChild(f);
  }
  function codeStep(email) {
    acct.textContent = '';
    var code = el('input', { inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '6', required: true }), m = el('p', { class: 'msg', hidden: true });
    var go = el('button', { class: 'btn gold', type: 'submit', text: 'Sign in' });
    var f = el('form', { class: 'card tool' }, [el('p', { text: 'We sent a code to ' + email + '. Enter it here, or tap the link in the email.' }), el('label', {}, ['6-digit code', code]), go, m]);
    f.addEventListener('submit', function (ev) {
      ev.preventDefault(); go.disabled = true;
      api('POST', '/verify', { email: email, code: code.value }).then(function (r) { go.disabled = false; if (r.ok) loadAccount(); else msg(m, r.error); });
    });
    acct.appendChild(f); code.focus();
  }
  function field(label, value, attrs) { var i = el('input', Object.assign({ value: value || '' }, attrs || {})); var l = el('label', {}, [label, i]); l.input = i; return l; }
  function check(label, on) { var i = el('input', { type: 'checkbox' }); i.checked = !!on; var l = el('label', { class: 'check' }, [i, label]); l.input = i; return l; }
  function profile(me) {
    var p = me.profile;
    var f = { name: field('Full name', p.name, { autocomplete: 'name' }), hebrewName: field('Hebrew name (e.g. Moshe ben Avraham)', p.hebrewName), phone: field('Phone', p.phone, { type: 'tel', autocomplete: 'tel' }), address: field('Address', p.address, { autocomplete: 'street-address' }), birthday: field('Birthday', p.birthday, { type: 'date' }), anniversary: field('Wedding anniversary', p.anniversary, { type: 'date' }) };
    var night = check('Born after sunset', p.birthAfterSunset), news = check('Email me about events and holidays', p.news), share = check('Share my yahrzeits with the Rabbi (so he can remember them with you)', p.shareYahrzeits);
    var m1 = el('p', { class: 'msg', hidden: true });
    var s1 = el('form', { class: 'card' }, [el('h2', { text: 'Me' }), el('p', { class: 'muted', text: p.email }), el('div', { class: 'fields' }, [f.name, f.hebrewName, f.phone, f.address, f.birthday, f.anniversary]), night, news, share, el('p', {}, [el('button', { class: 'btn gold', text: 'Save' })]), m1]);
    s1.addEventListener('submit', function (ev) {
      ev.preventDefault();
      api('PUT', '/me', { name: f.name.input.value, hebrewName: f.hebrewName.input.value, phone: f.phone.input.value, address: f.address.input.value, birthday: f.birthday.input.value, anniversary: f.anniversary.input.value, birthAfterSunset: night.input.checked, news: news.input.checked, shareYahrzeits: share.input.checked })
        .then(function (r) { msg(m1, r.ok ? 'Saved.' : r.error, r.ok); });
    });

    // Family
    var famList = el('div'), m2 = el('p', { class: 'msg', hidden: true });
    var addPerson = function (x) {
      x = x || {};
      var rel = el('select', {}, ['spouse', 'child', 'parent', 'sibling', 'grandchild', 'grandparent', 'other'].map(function (r) { var o = el('option', { value: r, text: r[0].toUpperCase() + r.slice(1) }); if (x.relation === r) o.selected = true; return o; }));
      var g = el('select', {}, [['', '—'], ['m', 'Male'], ['f', 'Female']].map(function (o) { var n = el('option', { value: o[0], text: o[1] }); if (x.gender === o[0]) n.selected = true; return n; }));
      var row = { name: field('Name', x.name), hebrewName: field('Hebrew name', x.hebrewName), birthday: field('Birthday', x.birthday, { type: 'date' }), night: check('Born after sunset', x.birthAfterSunset), rel: rel, g: g };
      var div = el('div', { class: 'person' }, [el('div', { class: 'fields' }, [row.name, row.hebrewName, el('label', {}, ['Relation', rel]), el('label', {}, ['Gender', g]), row.birthday]), row.night,
        el('p', {}, [el('button', { type: 'button', class: 'btn sm ghost', text: 'Remove', on: { click: function () { div.remove(); } } })])]);
      div.row = row; famList.appendChild(div);
    };
    (me.family.length ? me.family : []).forEach(addPerson);
    var s2 = el('form', { class: 'card' }, [el('h2', { text: 'My family' }), el('p', { class: 'muted', text: 'Add your spouse and children. We will remember Hebrew birthdays and Bar/Bat Mitzvah dates, and your RSVPs count the family for you.' }), famList,
      el('p', { class: 'btns' }, [el('button', { type: 'button', class: 'btn ghost', text: '+ Add a family member', on: { click: function () { addPerson(); } } }), el('button', { class: 'btn gold', text: 'Save family' })]), m2]);
    s2.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var fam = [].map.call(famList.children, function (d) { var r = d.row; return { name: r.name.input.value, hebrewName: r.hebrewName.input.value, relation: r.rel.value, gender: r.g.value, birthday: r.birthday.input.value, birthAfterSunset: r.night.input.checked }; }).filter(function (x) { return x.name.trim(); });
      api('PUT', '/family', { family: fam }).then(function (r) { msg(m2, r.ok ? 'Saved.' : r.error, r.ok); });
    });

    // Yahrzeits (entries from the My Pushka app are shown, and are edited in the app)
    var yList = el('div'), m3 = el('p', { class: 'msg', hidden: true });
    var fromApp = me.yahrzeits.filter(function (y) { return y.fromApp; }), web = me.yahrzeits.filter(function (y) { return !y.fromApp; });
    var addY = function (y) {
      y = y || {};
      var row = { name: field('Name', y.name), relation: field('Relation (e.g. father)', y.relation), date: field('Date of passing', '', { type: 'date' }), night: check('Passed after sunset', false), notes: field('Notes', y.notes), keep: y.day ? { day: y.day, month: y.month, year: y.year } : null };
      var div = el('div', { class: 'person' }, [el('div', { class: 'fields' }, [row.name, row.relation, row.date, row.notes]), row.night,
        y.day ? el('p', { class: 'muted', text: 'Hebrew date: ' + y.day + ' ' + y.month + (y.next ? ' · next yahrzeit ' + y.next : '') + '. Enter a date only to change it.' }) : null,
        el('p', {}, [el('button', { type: 'button', class: 'btn sm ghost', text: 'Remove', on: { click: function () { div.remove(); } } })])]);
      div.row = row; yList.appendChild(div);
    };
    web.forEach(addY);
    var s3 = el('form', { class: 'card', id: 'yahrzeits' }, [el('h2', { text: 'Yahrzeits' }), el('p', { class: 'muted', text: 'We work out the Hebrew date and remind you every year.' }),
      fromApp.length ? el('ul', {}, fromApp.map(function (y) { return el('li', { text: y.name + ' · ' + y.day + ' ' + y.month + (y.next ? ' · next ' + y.next : '') + ' (from the My Pushka app)' }); })) : null,
      yList, el('p', { class: 'btns' }, [el('button', { type: 'button', class: 'btn ghost', text: '+ Add a yahrzeit', on: { click: function () { addY(); } } }), el('button', { class: 'btn gold', text: 'Save yahrzeits' })]), m3]);
    s3.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var list = [].map.call(yList.children, function (d) { var r = d.row, o = { name: r.name.input.value, relation: r.relation.input.value, notes: r.notes.input.value };
        if (r.date.input.value) { o.date = r.date.input.value; o.afterSunset = r.night.input.checked; } else if (r.keep) { o.day = r.keep.day; o.month = r.keep.month; o.year = r.keep.year; }
        return o; }).filter(function (x) { return x.name.trim(); });
      api('PUT', '/yahrzeits', { yahrzeits: list }).then(function (r) { msg(m3, r.ok ? 'Saved.' : r.error, r.ok); if (r.ok) loadAccount(); });
    });

    var out = el('p', { class: 'btns' }, [el('button', { class: 'btn ghost', text: 'Sign out', on: { click: function () { api('POST', '/logout').then(function () { store.set('cl_signed', false); location.href = '/'; }); } } }),
      el('button', { class: 'btn ghost', text: 'Delete my account', on: { click: function () { if (confirm('Delete your account, family and yahrzeits? This cannot be undone.')) api('DELETE', '/me').then(function () { store.set('cl_signed', false); location.href = '/'; }); } } })]);
    var rs = me.rsvps.length ? el('section', { class: 'card' }, [el('h2', { text: 'My RSVPs' }), el('ul', {}, me.rsvps.map(function (r) { return el('li', {}, [el('a', { href: '/events/' + r.event, text: r.event.replace(/-/g, ' ') }), ' · ' + (r.adults + r.kids) + ' people']); }))]) : null;
    [s1, s2, s3, rs, out].forEach(function (n) { if (n) acct.appendChild(el('section', {}, [n])); });
    if (!p.name) f.name.input.focus();
    if (location.hash === '#yahrzeits') s3.scrollIntoView();
  }
})();
