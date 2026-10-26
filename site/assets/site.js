// Chabad of Lamorinda website: one-tap RSVP, the "My account" page (family, birthdays, yahrzeits), and the forms
// that send something to the Rabbi (community news, Kaddish, prayer list, private messages).
// Plain JavaScript, no libraries. Works in English, Hebrew and Russian (words come from the page). Everything else
// on the site works without it.
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var I = {}; try { I = JSON.parse(($('#i18n') || {}).textContent || '{}'); } catch (e) {}
  var LANG = I.lang || 'en', S = I.s || {};
  var T = function (s, v) { var o = S[s] || s; if (v) o = o.replace(/\{(\w+)\}/g, function (m, k) { return v[k] != null ? v[k] : m; }); return o; };
  var P = function (p) { return LANG === 'en' ? p : '/' + LANG + p; };
  var store = { get: function (k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    for (var k in attrs || {}) { if (k === 'text') n.textContent = attrs[k]; else if (k === 'on') for (var ev in attrs.on) n.addEventListener(ev, attrs.on[ev]); else if (attrs[k] !== false && attrs[k] != null) n.setAttribute(k, attrs[k] === true ? '' : attrs[k]); }
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function api(method, path, body) {
    return fetch('/api/site' + path, { method: method, credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-site': '1', 'x-lang': LANG }, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j._status = r.status; return j; }); });
  }
  function msg(node, text, ok) { node.textContent = text || ''; node.className = 'msg ' + (ok ? 'ok' : 'err'); node.hidden = !text; }
  function stepper(label, value, min) {
    var out = el('output', { text: String(value) }), v = value;
    var set = function (n) { v = Math.max(min, Math.min(30, n)); out.textContent = v; };
    var box = el('div', { class: 'row' }, [el('span', { text: label }), el('span', { class: 'stepper', dir: 'ltr' }, [
      el('button', { type: 'button', 'aria-label': '−', text: '−', on: { click: function () { set(v - 1); } } }), out,
      el('button', { type: 'button', 'aria-label': '+', text: '+', on: { click: function () { set(v + 1); } } })])]);
    box.value = function () { return v; };
    return box;
  }

  // Header: "Sign in" becomes "My account" once signed in on this device.
  if (store.get('cl_signed')) { var a = $('[data-account]'); if (a) a.textContent = T('My account'); }

  // ---------- RSVP ----------
  var box = $('[data-rsvp]');
  if (box) {
    var slug = box.getAttribute('data-rsvp'), ui = $('.rsvp-ui', box), withKids = box.getAttribute('data-kids') === '1';
    api('GET', '/rsvp/' + slug).then(function (s) {
      ui.hidden = false;
      if (s._status === 503) { ui.appendChild(el('p', { text: T('Online RSVP is coming soon. Please call or email us to RSVP.') })); return; }
      if (s._status !== 200) { ui.appendChild(el('p', { text: T('Could not load the RSVP form. Please refresh the page.') })); return; }
      var guest = store.get('cl_guest') || {}, mine = s.mine, sug = s.suggest || { adults: 1, kids: 0 };
      var adults = stepper(T('Adults'), mine ? mine.adults : sug.adults, 0), kids = stepper(T('Children'), mine ? mine.kids : sug.kids, 0);
      var name = el('input', { name: 'name', autocomplete: 'name', value: guest.name || '', required: true });
      var email = el('input', { name: 'email', type: 'email', autocomplete: 'email', value: guest.email || '', required: true });
      var phone = el('input', { name: 'phone', type: 'tel', autocomplete: 'tel', value: guest.phone || '' });
      var note = el('input', { name: 'note', placeholder: T('Anything we should know? (optional)') });
      var m = el('p', { class: 'msg', hidden: true }), go = el('button', { class: 'btn gold', type: 'submit', text: mine ? T('Update my RSVP') : (s.signedIn ? T("I'm coming") : T('RSVP')) });
      var form = el('form', {}, [
        s.signedIn ? el('p', { text: (mine ? T('You are coming.') + ' ' : '') + T('RSVP as {name}.', { name: s.name || '' }) }) : null,
        adults, withKids ? kids : null,
        s.signedIn ? null : el('div', { class: 'fields' }, [el('label', {}, [T('Name'), name]), el('label', {}, [T('Email'), email]), el('label', {}, [T('Phone (optional)'), phone])]),
        el('label', {}, [T('Note'), note]), el('p', { class: 'btns' }, [go]), m,
        s.signedIn ? null : el('p', { class: 'muted' }, [T('Tip:') + ' ', el('a', { href: P('/account'), text: T('sign in') }), ' ' + T('once and next time RSVP is a single tap.')])]);
      form.addEventListener('submit', function (ev) {
        ev.preventDefault(); go.disabled = true;
        var body = { adults: adults.value(), kids: withKids ? kids.value() : 0, note: note.value, name: name.value, email: email.value, phone: phone.value };
        if (!s.signedIn) store.set('cl_guest', { name: name.value, email: email.value, phone: phone.value });
        api('POST', '/rsvp/' + slug, body).then(function (r) {
          go.disabled = false;
          if (r.ok) { msg(m, T('Thank you! You are on the list. See you there.'), true); go.textContent = T('Update my RSVP'); if (window.gtag) window.gtag('event', 'rsvp', { event_label: slug }); }
          else msg(m, r.error || T('Something went wrong.'));
        });
      });
      ui.appendChild(form);
    });
  }

  // ---------- Forms that send something to the Rabbi ----------
  // data-kind fixes the kind; data-title builds the headline from fields ({deceased}); fields with data-extra are
  // added to the message as "Label: value"; data-after="give" then shows a donation button with the name filled in.
  [].forEach.call(document.querySelectorAll('[data-submit]'), function (f) {
    var guestInfo = store.get('cl_guest') || {};
    var E = f.elements;
    if (E.name && guestInfo.name && !E.name.value) E.name.value = guestInfo.name;
    if (E.email && guestInfo.email && !E.email.value) E.email.value = guestInfo.email;
    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var m = $('.msg', f), b = $('button[type=submit]', f); b.disabled = true;
      var val = function (n) { var x = f.elements[n]; return x ? (x.type === 'checkbox' ? (x.checked ? x.value : '') : x.value) : ''; };
      var extras = [].filter.call(f.querySelectorAll('[data-extra]'), function (x) { return x.type === 'checkbox' ? x.checked : x.value; })
        .map(function (x) { return x.getAttribute('data-extra') + ': ' + (x.type === 'checkbox' ? 'yes' : x.value); });
      var tpl = f.getAttribute('data-title'), title = tpl ? tpl.replace(/\{(\w+)\}/g, function (mm, k) { return val(k) || '?'; }) : val('title');
      var body = [val('body')].concat(extras).filter(Boolean).join('\n');
      var who = val('deceased') || val('pname');
      store.set('cl_guest', { name: val('name'), email: val('email'), phone: val('phone') || guestInfo.phone || '' });
      api('POST', '/submit', { kind: f.getAttribute('data-kind') || val('kind'), title: title, body: body, link: val('link'), name: val('name'), email: val('email') }).then(function (r) {
        b.disabled = false;
        if (!r.ok) { msg(m, r.error || T('Something went wrong.')); return; }
        var pub = /^(mazal-tov|announcement|shiva)$/.test(f.getAttribute('data-kind') || val('kind'));
        msg(m, pub ? T('Thank you! The Rabbi will review it and post it soon.') : T('Thank you! We received it and the Rabbi will be in touch.'), true);
        var give = $('.give-next', f);
        if (give) { var l = $('a', give), ded = (l.getAttribute('data-ded') || '').replace('{name}', who); l.href = l.href.replace(/([?&]ded=)[^&]*/, '$1' + encodeURIComponent(ded.slice(0, 80))); give.hidden = false; }
        [].forEach.call(f.querySelectorAll('textarea, input[name=title], input[name=link]'), function (x) { if (x.type !== 'hidden') x.value = ''; });
      });
    });
  });

  // ---------- Sign-ups, registrations and orders (forms.json) ----------
  var form = $('[data-form]');
  if (form) {
    var fid = form.getAttribute('data-form'), E = form.elements;
    // Signed in: fill in the parent's details and the children from "My family".
    api('GET', '/me').then(function (me) {
      if (me._status !== 200) return;
      var p = me.profile, put = function (n, v) { if (E[n] && !E[n].value && v) E[n].value = v; };
      put('name', p.name); put('email', p.email); put('phone', p.phone); put('address', p.address);
      var kids = me.family.filter(function (f) { return f.relation === 'child'; });
      [].forEach.call(form.querySelectorAll('[data-children]'), function (fs) {
        var id = fs.getAttribute('data-children');
        kids.forEach(function (k, i) { ['name', 'hebrewName', 'birthday', 'allergies'].forEach(function (c) { var x = E[id + '.' + i + '.' + c], v = c === 'allergies' ? k.diet : k[c]; if (x && !x.value && v) x.value = v; }); });
      });
      // Shabbat meals: the family's saved dietary needs.
      if (fid === 'shabbat-meal') put('message', [p.diet].concat(me.family.filter(function (f) { return f.diet; }).map(function (f) { return f.name + ': ' + f.diet; })).filter(Boolean).join('; '));
    });
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var m = $('.msg', form), b = $('button[type=submit]', form), fields = {};
      [].forEach.call(form.querySelectorAll('input, select, textarea'), function (x) {
        if (!x.name) return;
        var parts = x.name.split('.');
        if (parts.length === 3) { var a = fields[parts[0]] = fields[parts[0]] || []; a[+parts[1]] = a[+parts[1]] || {}; a[+parts[1]][parts[2]] = x.value; return; }
        if (x.type === 'checkbox' && x.closest('[data-group]')) { fields[x.name] = fields[x.name] || []; if (x.checked) fields[x.name].push(+x.value); return; }
        fields[x.name] = x.type === 'checkbox' ? x.checked : x.value;
      });
      Object.keys(fields).forEach(function (k) { if (Array.isArray(fields[k]) && fields[k].some(function (r) { return r && typeof r === 'object'; })) fields[k] = fields[k].filter(Boolean); });
      b.disabled = true;
      api('POST', '/forms/' + fid, { fields: fields }).then(function (r) {
        b.disabled = false;
        if (!r.ok) { msg(m, r.error || T('Something went wrong.')); return; }
        msg(m, T('Thank you! We received it and the Rabbi will be in touch.') + (r.amount ? ' ' + T('Total: ${amount}', { amount: r.amount }) : ''), true);
        var pay = $('.pay-next', form);
        if (pay && r.payUrl) { $('a', pay).href = r.payUrl; pay.hidden = false; }
        b.hidden = true;
        if (window.gtag) window.gtag('event', 'form_submit', { event_label: fid });
      });
    });
  }

  // ---------- "Ask us" chat ----------
  var fab = $('[data-chat-open]');
  if (fab) {
    var panel = null, history = [], busy = false;
    try { history = JSON.parse(sessionStorage.getItem('cl_chat') || '[]'); } catch (e) {}
    var save = function () { try { sessionStorage.setItem('cl_chat', JSON.stringify(history.slice(-20))); } catch (e) {} };
    // Safe, tiny Markdown for answers: links, bold, lists, line breaks. Everything else is plain text.
    var render = function (text, into) {
      into.textContent = '';
      String(text).split('\n').forEach(function (line) {
        var li = /^\s*[-*]\s+(.*)$/.exec(line), node = el(li ? 'div' : 'p', li ? { class: 'li' } : {});
        var rest = li ? li[1] : line, re = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g, last = 0, m;
        if (!rest.trim() && !li) return;
        while ((m = re.exec(rest))) {
          if (m.index > last) node.appendChild(document.createTextNode(rest.slice(last, m.index)));
          if (m[1]) { var u = m[2]; if (/^\/(?!\/)/.test(u)) node.appendChild(el('a', { href: /^\/(pushka|kiddush|board)\b/.test(u) ? u : P(u), text: m[1] })); else if (/^https:\/\//.test(u)) node.appendChild(el('a', { href: u, rel: 'noopener', target: '_blank', text: m[1] })); else if (/^tel:/.test(u)) node.appendChild(el('a', { href: u, text: m[1] })); else node.appendChild(document.createTextNode(m[1])); }
          else node.appendChild(el('strong', { text: m[3] }));
          last = re.lastIndex;
        }
        if (last < rest.length) node.appendChild(document.createTextNode(rest.slice(last)));
        into.appendChild(node);
      });
    };
    var bubble = function (role, text) { var b = el('div', { class: 'cm ' + role }); render(text, b); panel.log.appendChild(b); panel.log.scrollTop = panel.log.scrollHeight; return b; };
    var ask = function (q) {
      if (busy || !q.trim()) return;
      busy = true; history.push({ role: 'user', content: q.trim() }); save(); bubble('user', q.trim());
      var b = bubble('assistant', T('Thinking…')), got = '';
      fetch('/api/site/chat', { method: 'POST', headers: { 'content-type': 'application/json', 'x-site': '1' }, body: JSON.stringify({ messages: history, lang: LANG }) }).then(function (r) {
        if (!r.ok || !r.body) throw new Error('chat');
        var reader = r.body.getReader(), dec = new TextDecoder(), buf = '';
        var pump = function () { return reader.read().then(function (x) {
          if (x.done) return;
          buf += dec.decode(x.value, { stream: true });
          var parts = buf.split('\n\n'); buf = parts.pop();
          parts.forEach(function (p) { var d = /^data: (.*)$/m.exec(p); if (!d) return; try { var j = JSON.parse(d[1]); if (j.text) { got += j.text; render(got, b); panel.log.scrollTop = panel.log.scrollHeight; } } catch (e) {} });
          return pump();
        }); };
        return pump();
      }).then(function () { if (!got) throw new Error('empty'); history.push({ role: 'assistant', content: got }); save(); })
        .catch(function () { render(T('Sorry, something went wrong. Please call 925-384-7242.'), b); history.pop(); save(); })
        .then(function () { busy = false; panel.input.focus(); });
    };
    var handoff = function () {
      var box = el('form', { class: 'handoff' }), name = el('input', { required: true, autocomplete: 'name', placeholder: T('Your name') }), email = el('input', { type: 'email', required: true, autocomplete: 'email', placeholder: T('Your email'), dir: 'ltr' }), m = el('p', { class: 'msg', hidden: true });
      var g = store.get('cl_guest') || {}; name.value = g.name || ''; email.value = g.email || '';
      box.appendChild(el('p', { class: 'muted', text: T('The Rabbi will see this conversation and get back to you.') })); box.appendChild(name); box.appendChild(email);
      box.appendChild(el('button', { class: 'btn gold sm', type: 'submit', text: T('Send to the Rabbi') })); box.appendChild(m);
      box.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var transcript = history.map(function (h) { return (h.role === 'user' ? 'Visitor: ' : 'Assistant: ') + h.content; }).join('\n\n');
        api('POST', '/submit', { kind: 'rabbi', title: 'From the website chat', body: transcript || '(no messages)', name: name.value, email: email.value }).then(function (r) {
          if (r.ok) { box.textContent = ''; box.appendChild(el('p', { class: 'msg ok', text: T('Sent. The Rabbi will be in touch.') })); store.set('cl_guest', { name: name.value, email: email.value }); } else msg(m, r.error || T('Something went wrong.'));
        });
      });
      panel.log.appendChild(box); panel.log.scrollTop = panel.log.scrollHeight; name.focus();
    };
    var open = function () {
      if (!panel) {
        var input = el('input', { 'aria-label': T('Ask a question about Judaism or our community'), placeholder: T('Ask a question about Judaism or our community'), maxlength: '2000' });
        var log = el('div', { class: 'chat-log', 'aria-live': 'polite' });
        var form = el('form', { class: 'chat-in' }, [input, el('button', { class: 'btn gold sm', type: 'submit', text: T('Send') })]);
        form.addEventListener('submit', function (ev) { ev.preventDefault(); var q = input.value; input.value = ''; ask(q); });
        var root = el('div', { class: 'chat', role: 'dialog', 'aria-label': T('Ask us') }, [
          el('div', { class: 'chat-h' }, [el('strong', { text: T('Ask us') }), el('span', {}, [
            el('button', { type: 'button', class: 'linkish', text: T('New conversation'), on: { click: function () { history = []; save(); log.textContent = ''; greet(); } } }),
            el('button', { type: 'button', class: 'x', 'aria-label': T('Close'), text: '×', on: { click: function () { root.hidden = true; fab.hidden = false; fab.focus(); } } })])]),
          log, form,
          el('p', { class: 'chat-f' }, [el('button', { type: 'button', class: 'linkish', text: T('Send to the Rabbi'), on: { click: handoff } }), ' · ', el('span', { class: 'muted', text: T('Answers come from our website and may not be perfect. For anything important, call the Rabbi.') })])]);
        document.body.appendChild(root);
        panel = { root: root, log: log, input: input };
        var greet = function () {
          bubble('assistant', T('Hello! I can help with Shabbat times, programs, registration, holidays, Jewish questions, and anything you need from Chabad of Lamorinda. What would you like to know?'));
          var chips = el('div', { class: 'chips' });
          ['When is Shabbat this week?', 'How do I register for Hebrew School?', 'Someone in my family passed away', 'How do I put up a mezuzah?'].forEach(function (s) { chips.appendChild(el('button', { type: 'button', class: 'chip', text: T(s), on: { click: function () { chips.remove(); ask(T(s)); } } })); });
          log.appendChild(chips);
        };
        if (history.length) history.forEach(function (h) { bubble(h.role, h.content); }); else greet();
      }
      panel.root.hidden = false; fab.hidden = true; panel.input.focus();
    };
    fab.addEventListener('click', open);
    if (history.length && store.get('cl_chat_open')) open();
  }

  // ---------- Search box on lists (guides) ----------
  [].forEach.call(document.querySelectorAll('[data-filter]'), function (box) {
    var items = document.querySelectorAll(box.getAttribute('data-filter'));
    box.addEventListener('input', function () {
      var q = box.value.trim().toLowerCase();
      [].forEach.call(items, function (it) { it.hidden = !!q && it.textContent.toLowerCase().indexOf(q) < 0; });
      [].forEach.call(document.querySelectorAll('#guides h2'), function (h) { var g = h.nextElementSibling; h.hidden = g && ![].some.call(g.children, function (c) { return !c.hidden; }); });
    });
  });

  // ---------- My account ----------
  var acct = $('#account');
  if (acct) loadAccount();
  function loadAccount() {
    api('GET', '/me').then(function (me) {
      acct.textContent = '';
      if (me._status === 503) { acct.appendChild(el('p', { text: T('Accounts are being set up and will open soon.') })); return; }
      if (me._status === 401) { store.set('cl_signed', false); return signIn(); }
      if (me._status !== 200) { acct.appendChild(el('p', { text: T('Something went wrong. Please refresh the page.') })); return; }
      store.set('cl_signed', true); profile(me);
    });
  }
  function signIn() {
    var email = el('input', { type: 'email', autocomplete: 'email', required: true, dir: 'ltr' }), m = el('p', { class: 'msg', hidden: true });
    var go = el('button', { class: 'btn gold', type: 'submit', text: T('Email me a sign-in code') });
    if (/expired=1/.test(location.search)) msg(m, T('That sign-in link has expired. Please ask for a new one.'));
    var f = el('form', { class: 'card tool' }, [el('p', { text: T('Sign in or create your free account with your email. No password: we email you a 6-digit code.') }), el('label', {}, [T('Email'), email]), go, m]);
    f.addEventListener('submit', function (ev) {
      ev.preventDefault(); go.disabled = true;
      api('POST', '/login', { email: email.value }).then(function (r) { go.disabled = false; if (r.ok) codeStep(email.value.trim()); else msg(m, r.error); });
    });
    acct.appendChild(f);
  }
  function codeStep(email) {
    acct.textContent = '';
    var code = el('input', { inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '6', required: true, dir: 'ltr' }), m = el('p', { class: 'msg', hidden: true });
    var go = el('button', { class: 'btn gold', type: 'submit', text: T('Sign in') });
    var f = el('form', { class: 'card tool' }, [el('p', { text: T('We sent a code to {email}. Enter it here, or tap the link in the email.', { email: email }) }), el('label', {}, [T('6-digit code'), code]), go, m]);
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
    var f = { name: field(T('Full name'), p.name, { autocomplete: 'name' }), hebrewName: field(T('Hebrew name (e.g. Moshe ben Avraham)'), p.hebrewName), phone: field(T('Phone'), p.phone, { type: 'tel', autocomplete: 'tel', dir: 'ltr' }), address: field(T('Address'), p.address, { autocomplete: 'street-address' }), birthday: field(T('Birthday'), p.birthday, { type: 'date' }), anniversary: field(T('Wedding anniversary'), p.anniversary, { type: 'date' }), mezuzahs: field(T('Mezuzahs last checked'), p.mezuzahsChecked, { type: 'date' }), tefillin: field(T('Tefillin last checked'), p.tefillinChecked, { type: 'date' }), diet: field(T('Allergies or dietary needs (optional)'), p.diet) };
    var night = check(T('Born after sunset'), p.birthAfterSunset), news = check(T('Email me about events and holidays'), p.news), share = check(T('Share my yahrzeits with the Rabbi (so he can remember them with you)'), p.shareYahrzeits);
    var m1 = el('p', { class: 'msg', hidden: true });
    var s1 = el('form', { class: 'card' }, [el('h2', { text: T('Me') }), el('p', { class: 'muted', text: p.email }), el('div', { class: 'fields' }, [f.name, f.hebrewName, f.phone, f.address, f.birthday, f.anniversary, f.diet, f.mezuzahs, f.tefillin]), el('p', { class: 'muted', text: T('Mezuzahs and tefillin should be checked by a scribe twice in seven years. We will remind you when it is time.') }), night, news, share, el('p', {}, [el('button', { class: 'btn gold', text: T('Save') })]), m1]);
    s1.addEventListener('submit', function (ev) {
      ev.preventDefault();
      api('PUT', '/me', { name: f.name.input.value, hebrewName: f.hebrewName.input.value, phone: f.phone.input.value, address: f.address.input.value, birthday: f.birthday.input.value, anniversary: f.anniversary.input.value, mezuzahsChecked: f.mezuzahs.input.value, diet: f.diet.input.value, tefillinChecked: f.tefillin.input.value, birthAfterSunset: night.input.checked, news: news.input.checked, shareYahrzeits: share.input.checked })
        .then(function (r) { msg(m1, r.ok ? T('Saved.') : r.error, r.ok); });
    });

    // Family
    var famList = el('div'), m2 = el('p', { class: 'msg', hidden: true });
    var REL = [['spouse', 'Spouse'], ['child', 'Child'], ['parent', 'Parent'], ['sibling', 'Sibling'], ['grandchild', 'Grandchild'], ['grandparent', 'Grandparent'], ['other', 'Other']];
    var addPerson = function (x) {
      x = x || {};
      var rel = el('select', {}, REL.map(function (r) { var o = el('option', { value: r[0], text: T(r[1]) }); if (x.relation === r[0]) o.selected = true; return o; }));
      var g = el('select', {}, [['', '—'], ['m', T('Male')], ['f', T('Female')]].map(function (o) { var n = el('option', { value: o[0], text: o[1] }); if (x.gender === o[0]) n.selected = true; return n; }));
      var row = { name: field(T('Name'), x.name), hebrewName: field(T('Hebrew name'), x.hebrewName), birthday: field(T('Birthday'), x.birthday, { type: 'date' }), night: check(T('Born after sunset'), x.birthAfterSunset), diet: field(T('Allergies or dietary needs (optional)'), x.diet), rel: rel, g: g };
      var div = el('div', { class: 'person' }, [el('div', { class: 'fields' }, [row.name, row.hebrewName, el('label', {}, [T('Relation'), rel]), el('label', {}, [T('Gender'), g]), row.birthday, row.diet]), row.night,
        el('p', { class: 'btns' }, [el('button', { type: 'button', class: 'btn sm ghost', text: T('Remove'), on: { click: function () { div.remove(); } } }), x.name && x.birthday ? el('a', { class: 'btn sm ghost', href: P('/sponsor?o=birthday&name=' + encodeURIComponent(x.name)), text: T('Mark the occasion: sponsor a Kiddush or give in their honor') }) : null])]);
      div.row = row; famList.appendChild(div);
    };
    me.family.forEach(addPerson);
    var s2 = el('form', { class: 'card' }, [el('h2', { text: T('My family') }), el('p', { class: 'muted', text: T('Add your spouse and children. We will remember Hebrew birthdays and Bar/Bat Mitzvah dates, and your RSVPs count the family for you.') }), el('p', { class: 'muted', text: T('Allergies and dietary needs are shared only with our staff, so meals and children\'s programs are safe for everyone.') }), famList,
      el('p', { class: 'btns' }, [el('button', { type: 'button', class: 'btn ghost', text: T('+ Add a family member'), on: { click: function () { addPerson(); } } }), el('button', { class: 'btn gold', text: T('Save family') })]), m2]);
    s2.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var fam = [].map.call(famList.children, function (d) { var r = d.row; return { name: r.name.input.value, hebrewName: r.hebrewName.input.value, relation: r.rel.value, gender: r.g.value, birthday: r.birthday.input.value, birthAfterSunset: r.night.input.checked, diet: r.diet.input.value }; }).filter(function (x) { return x.name.trim(); });
      api('PUT', '/family', { family: fam }).then(function (r) { msg(m2, r.ok ? T('Saved.') : r.error, r.ok); });
    });

    // Yahrzeits (entries from the My Pushka app are shown, and are edited in the app)
    var yList = el('div'), m3 = el('p', { class: 'msg', hidden: true });
    var fromApp = me.yahrzeits.filter(function (y) { return y.fromApp; }), web = me.yahrzeits.filter(function (y) { return !y.fromApp; });
    var sponsorLink = function (y) { return el('a', { class: 'btn sm ghost', href: P('/sponsor?o=yahrzeit&name=' + encodeURIComponent(y.name)), text: T('Sponsor in their memory') }); };
    var addY = function (y) {
      y = y || {};
      var row = { name: field(T('Name'), y.name), relation: field(T('Relation (e.g. father)'), y.relation), date: field(T('Date of passing'), '', { type: 'date' }), night: check(T('Passed after sunset'), false), notes: field(T('Notes'), y.notes), keep: y.day ? { day: y.day, month: y.month, year: y.year } : null };
      var div = el('div', { class: 'person' }, [el('div', { class: 'fields' }, [row.name, row.relation, row.date, row.notes]), row.night,
        y.day ? el('p', { class: 'muted', text: T('Hebrew date: {date}', { date: y.day + ' ' + y.month }) + (y.next ? ' · ' + T('next yahrzeit {date}', { date: y.next }) : '') + '. ' + T('Enter a date only to change it.') }) : null,
        el('p', { class: 'btns' }, [el('button', { type: 'button', class: 'btn sm ghost', text: T('Remove'), on: { click: function () { div.remove(); } } }), y.name ? sponsorLink(y) : null])]);
      div.row = row; yList.appendChild(div);
    };
    web.forEach(addY);
    var s3 = el('form', { class: 'card', id: 'yahrzeits' }, [el('h2', { text: T('Yahrzeits') }), el('p', { class: 'muted', text: T('We work out the Hebrew date and remind you every year.') }),
      fromApp.length ? el('ul', {}, fromApp.map(function (y) { return el('li', {}, [y.name + ' · ' + y.day + ' ' + y.month + (y.next ? ' · ' + T('next yahrzeit {date}', { date: y.next }) : '') + ' ' + T('(from the My Pushka app)') + ' ', sponsorLink(y)]); })) : null,
      yList, el('p', { class: 'btns' }, [el('button', { type: 'button', class: 'btn ghost', text: T('+ Add a yahrzeit'), on: { click: function () { addY(); } } }), el('button', { class: 'btn gold', text: T('Save yahrzeits') })]), m3]);
    s3.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var list = [].map.call(yList.children, function (d) { var r = d.row, o = { name: r.name.input.value, relation: r.relation.input.value, notes: r.notes.input.value };
        if (r.date.input.value) { o.date = r.date.input.value; o.afterSunset = r.night.input.checked; } else if (r.keep) { o.day = r.keep.day; o.month = r.keep.month; o.year = r.keep.year; }
        return o; }).filter(function (x) { return x.name.trim(); });
      api('PUT', '/yahrzeits', { yahrzeits: list }).then(function (r) { msg(m3, r.ok ? T('Saved.') : r.error, r.ok); if (r.ok) loadAccount(); });
    });

    var out = el('p', { class: 'btns' }, [el('button', { class: 'btn ghost', text: T('Sign out'), on: { click: function () { api('POST', '/logout').then(function () { store.set('cl_signed', false); location.href = P('/'); }); } } }),
      el('button', { class: 'btn ghost', text: T('Delete my account'), on: { click: function () { if (confirm(T('Delete your account, family and yahrzeits? This cannot be undone.'))) api('DELETE', '/me').then(function () { store.set('cl_signed', false); location.href = P('/'); }); } } })]);
    var rs = me.rsvps.length ? el('section', { class: 'card' }, [el('h2', { text: T('My RSVPs') }), el('ul', {}, me.rsvps.map(function (r) { return el('li', {}, [el('a', { href: P('/events/' + r.event), text: r.event.replace(/-/g, ' ') }), ' · ' + T('{n} people', { n: r.adults + r.kids })]); }))]) : null;
    // My upcoming Jewish dates, each with a way to mark it.
    var KIND = { 'yahrzeit': ['Yahrzeit', '/sponsor?o=yahrzeit&name=', 'Sponsor in their memory'], 'hebrew-birthday': ['Hebrew birthday', '/sponsor?o=birthday&name=', 'Mark the occasion: sponsor a Kiddush or give in their honor'], 'bar-mitzvah': ['Bar Mitzvah', '/help/bar-bat-mitzvah?', 'Plan the Bar or Bat Mitzvah with the Rabbi'], 'bat-mitzvah': ['Bat Mitzvah', '/help/bar-bat-mitzvah?', 'Plan the Bar or Bat Mitzvah with the Rabbi'], 'anniversary': ['Wedding anniversary', '/sponsor?o=anniversary&name=', 'Mark the occasion: sponsor a Kiddush or give in their honor'], 'mezuzah-check': ['Mezuzahs due for checking', '/forms/mezuzah-tefillin?name=', 'Have them checked by a scribe'], 'tefillin-check': ['Tefillin due for checking', '/forms/mezuzah-tefillin?name=', 'Have them checked by a scribe'] };
    var up = (me.upcoming || []).length ? el('section', { class: 'card' }, [el('h2', { text: T('My upcoming Jewish dates') }), me.calendarUrl ? el('p', {}, [el('a', { class: 'btn sm ghost', href: me.calendarUrl, text: T('Add my Jewish dates to my phone calendar') })]) : null, el('ul', { class: 'list' }, me.upcoming.map(function (u) { var k = KIND[u.kind] || [u.kind, '/sponsor?', 'Sponsor']; return el('li', {}, [el('strong', { text: new Date(u.date + 'T12:00:00Z').toLocaleDateString(LANG === 'he' ? 'he-IL' : LANG === 'ru' ? 'ru-RU' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) }), ' · ' + T(k[0]) + ': ' + u.name + ' ', el('a', { href: P(k[1] + encodeURIComponent(u.name)), text: T(k[2]) })]); }))]) : null;
    [up, s1, s2, s3, rs, out].forEach(function (n) { if (n) acct.appendChild(el('section', {}, [n])); });
    if (!p.name) f.name.input.focus();
    if (location.hash === '#yahrzeits') s3.scrollIntoView();
  }
})();
