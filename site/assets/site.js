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
  // After a guest RSVP or form: invite them to save their details for next time.
  function nudge(after) {
    if (store.get('cl_signed') || !after || after.querySelector('.nudge')) return;
    after.appendChild(el('p', { class: 'nudge' }, [T('Save your family\'s details so next time is one tap:') + ' ', el('a', { href: P('/account'), text: T('Create your free family account') + ' →' })]));
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
  // Footer: on phones the link groups start folded; on wide screens they always stay open.
  var cols = document.querySelectorAll('.ftr-col');
  // (also when the screen turns or the window is resized, so the links never stay hidden on a wide screen)
  var narrow = window.matchMedia('(max-width: 699px)');
  var fold = function () { [].forEach.call(cols, function (d) { d.open = !narrow.matches; }); };
  fold();
  if (narrow.addEventListener) narrow.addEventListener('change', fold); else if (narrow.addListener) narrow.addListener(fold);
  [].forEach.call(cols, function (d) { d.querySelector('summary').addEventListener('click', function (e) { if (!narrow.matches) e.preventDefault(); }); });
  // Share with a friend: the phone's own share menu where there is one, and copy link.
  [].forEach.call(document.querySelectorAll('[data-share]'), function (box) {
    var nat = box.querySelector('[data-share-native]'), url = box.getAttribute('data-url'), title = box.getAttribute('data-title');
    if (nat && navigator.share) { nat.hidden = false; nat.addEventListener('click', function () { navigator.share({ title: title, text: title, url: url }).catch(function () {}); }); }
    var cp = box.querySelector('[data-copy]');
    if (cp) cp.addEventListener('click', function () {
      var done = function () { var t = cp.textContent; cp.textContent = cp.getAttribute('data-done'); setTimeout(function () { cp.textContent = t; }, 1800); };
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, function () { prompt('', url); }); else prompt('', url);
    });
  });
  // Which pages are visited (an anonymous id in a first-party cookie; no IP addresses kept). Skipped when the browser
  // asks not to be tracked. If the visitor later leaves their details, the Rabbi sees their interests (see Privacy).
  (function () {
    if (navigator.globalPrivacyControl || navigator.doNotTrack === '1' || window.doNotTrack === '1') return;
    var m = /(?:^|;\s*)cl_vid=([a-z0-9]+)/.exec(document.cookie), vid = m && m[1];
    if (!vid) { vid = (Math.random().toString(36).slice(2) + Date.now().toString(36) + Math.random().toString(36).slice(2)).slice(0, 32); }
    try { document.cookie = 'cl_vid=' + vid + ';path=/;max-age=' + 400 * 86400 + ';samesite=lax' + (location.protocol === 'https:' ? ';secure' : ''); } catch (e) {}
    try { fetch('/api/site/view', { method: 'POST', keepalive: true, credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-site': '1' }, body: JSON.stringify({ path: location.pathname }) }).catch(function () {}); } catch (e) {}
  })();
  if (store.get('cl_signed')) {
    var a = $('[data-account]'); if (a) a.textContent = T('My account');
    // So the Rabbi can suggest events that fit (only when "Suggest things for my family" is on in My account).
    var here = location.pathname.replace(/^\/(he|ru)(?=\/)/, '');
    if (/^\/(learn|help|programs|holidays|events|forms)\/[a-z0-9-]+$|^\/kaddish$/.test(here)) fetch('/api/site/seen', { method: 'POST', keepalive: true, credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-site': '1' }, body: JSON.stringify({ path: here }) }).catch(function () {});
    // "For your family": upcoming events that fit this family.
    var fy = $('[data-for-you]');
    if (fy) api('GET', '/for-you').then(function (r) {
      if (!r.items || !r.items.length) return;
      fy.appendChild(el('div', { class: 'sec-h' }, [el('h2', { text: T('For your family') })]));
      fy.appendChild(el('div', { class: 'grid' }, r.items.map(function (e) { return el('a', { class: 'card tile foryou', href: P('/events/' + e.slug) }, [el('p', { class: 'eyebrow', text: e.when }), el('h3', { text: e.title }), el('p', { class: 'more', text: T('RSVP in one tap') + ' →' })]); })));
      fy.hidden = false;
    });
  }

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
          if (r.ok) { msg(m, T('Thank you! You are on the list. See you there.'), true); nudge(m.parentNode); go.textContent = T('Update my RSVP'); if (window.gtag) window.gtag('event', 'rsvp', { event_label: slug }); }
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
        if (give) { var l = $('a', give), ded = (l.getAttribute('data-ded') || '').replace('{name}', who); l.href = l.href.replace(/([?&]ded=)[^&#]*/, '$1' + encodeURIComponent(ded.slice(0, 80))); give.hidden = false; }
        [].forEach.call(f.querySelectorAll('textarea, input[name=title], input[name=link]'), function (x) { if (x.type !== 'hidden') x.value = ''; });
      });
    });
  });

  // ---------- One-tap Shabbat dinner for signed-in families ----------
  var quick = $('[data-shabbat-quick]');
  if (quick && quick.getAttribute('data-date') && store.get('cl_signed')) api('GET', '/me').then(function (me) {
    if (me._status !== 200) return;
    var p = me.profile, fam = me.family.filter(function (f) { return ['spouse', 'child'].indexOf(f.relation) >= 0; }).length;
    var n = stepper(T('People'), 1 + fam, 1), m = el('p', { class: 'msg', hidden: true });
    var go = el('button', { class: 'btn gold', type: 'button', text: T("We're coming") });
    go.addEventListener('click', function () {
      go.disabled = true;
      var diet = [p.diet].concat(me.family.filter(function (f) { return f.diet; }).map(function (f) { return f.name + ': ' + f.diet; })).filter(Boolean).join('; ');
      api('POST', '/forms/shabbat-meal', { fields: { role: '2', people: String(n.value()), date: quick.getAttribute('data-date'), name: p.name, email: p.email, phone: p.phone, message: diet } }).then(function (r) {
        go.disabled = false;
        if (!r.ok) { msg(m, r.error || T('Something went wrong.')); return; }
        msg(m, T('Wonderful! The Rabbi\'s family is expecting you. Shabbat Shalom!'), true); go.hidden = true;
        if (window.gtag) window.gtag('event', 'form_submit', { event_label: 'shabbat-quick' });
      });
    });
    quick.appendChild(el('p', { class: 'quick-h', text: T('Shabbat dinner with the Rabbi\'s family, {day}?', { day: quick.getAttribute('data-day') }) }));
    quick.appendChild(n); quick.appendChild(go); quick.appendChild(m); quick.hidden = false;
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
        msg(m, T('Thank you! We received it and the Rabbi will be in touch.') + (r.amount ? ' ' + T('Total: ${amount}', { amount: r.amount }) : ''), true); nudge(form);
        var pay = $('.pay-next', form);
        if (pay && r.payUrl) { $('a', pay).href = r.payUrl; pay.hidden = false; }
        b.hidden = true;
        if (window.gtag) window.gtag('event', 'form_submit', { event_label: fid });
      });
    });
  }

  // ---------- Home: the large banners slide by themselves, and with the dots, arrows or a swipe ----------
  Array.prototype.forEach.call(document.querySelectorAll('[data-carousel]'), function (track) {
    var root = track.parentNode, dots = root.querySelectorAll('.bn-dots button'), n = track.children.length, cur = 0, timer = null;
    if (n < 2) return;
    var rtl = document.documentElement.dir === 'rtl';
    var go = function (i) { cur = (i + n) % n; track.scrollTo({ left: (rtl ? -1 : 1) * cur * track.clientWidth, behavior: 'smooth' }); };
    var mark = function () { cur = Math.round(Math.abs(track.scrollLeft) / track.clientWidth); Array.prototype.forEach.call(dots, function (d, i) { d.setAttribute('aria-selected', String(i === cur)); }); };
    track.addEventListener('scroll', function () { clearTimeout(track._t); track._t = setTimeout(mark, 80); }, { passive: true });
    Array.prototype.forEach.call(dots, function (d, i) { d.addEventListener('click', function () { stop(); go(i); }); });
    var prev = root.querySelector('.bn-prev'), next = root.querySelector('.bn-next');
    if (prev) prev.addEventListener('click', function () { stop(); go(cur - 1); });
    if (next) next.addEventListener('click', function () { stop(); go(cur + 1); });
    var stop = function () { clearInterval(timer); timer = null; };
    var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!still) timer = setInterval(function () { if (!document.hidden) go(cur + 1); }, 7000);
    ['pointerdown', 'focusin', 'wheel', 'touchstart'].forEach(function (ev) { track.addEventListener(ev, stop, { passive: true }); });
  });

  // ---------- Spin the dreidel (/dreidel) ----------
  // Light the menorah (/menorah): candles 1..N are placed from the right; the shamash first, then the newest (N) down to 1.
  Array.prototype.forEach.call(document.querySelectorAll('[data-menorah]'), function (g) {
    var M = JSON.parse(g.querySelector('[data-mn-text]').textContent), msg = g.querySelector('.mn-msg'), night = +g.getAttribute('data-night') || 1, next;
    var c = function (i) { return g.querySelector('.mn-c[data-i="' + i + '"]'); };
    var setup = function () {
      for (var i = 0; i <= 8; i++) { var b = c(i); b.classList.toggle('mn-off', i > night); b.disabled = i > night; b.classList.remove('lit'); }
      next = 0; msg.textContent = M.shamash;
      Array.prototype.forEach.call(g.querySelectorAll('.mn-nights .chip'), function (b) { b.classList.toggle('on', +b.getAttribute('data-n') === night); });
      var first = document.querySelector('.mn-first'); if (first) first.classList.toggle('mn-dim', night > 1);
    };
    g.addEventListener('click', function (ev) {
      var n = ev.target.closest('.mn-nights .chip'); if (n) { night = +n.getAttribute('data-n'); setup(); return; }
      if (ev.target.closest('[data-mn-reset]')) { setup(); return; }
      var b = ev.target.closest('.mn-c'); if (!b || b.classList.contains('lit')) return;
      var i = +b.getAttribute('data-i'), want = next === 0 ? 0 : next;
      if (i !== want) { msg.textContent = next === 0 ? M.shamash : M.wrong; return; }
      b.classList.add('lit');
      next = next === 0 ? night : next - 1;
      msg.textContent = next === 0 ? M.done : i === 0 ? M.next : M.more;
      if (next === 0) next = -1;
    });
    setup();
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-dreidel]'), function (g) {
    var L = []; try { L = JSON.parse(g.querySelector('[data-dr-letters]').textContent); } catch (e) { return; }
    var you = 10, pot = 4, busy = false, d = g.querySelector('.dreidel'), letter = g.querySelector('.dr-letter'), msg = g.querySelector('.dr-msg');
    var spinB = g.querySelector('[data-dr-spin]'), again = g.querySelector('[data-dr-reset]');
    var show = function () { g.querySelector('[data-dr-you]').textContent = you; g.querySelector('[data-dr-pot]').textContent = pot; };
    spinB.addEventListener('click', function () {
      if (busy) return; busy = true; spinB.disabled = true;
      if (pot === 0) { you--; pot++; } // an empty pot: everyone puts one in
      var i = Math.floor(Math.random() * 4), turns = 0;
      d.classList.remove('landed'); d.classList.add('spinning');
      var tick = setInterval(function () { letter.textContent = L[turns++ % 4].he; }, 90);
      setTimeout(function () {
        clearInterval(tick); d.classList.remove('spinning'); d.classList.add('landed'); letter.textContent = L[i].he;
        if (i === 1) { you += pot; pot = 0; } else if (i === 2) { var h = Math.ceil(pot / 2); you += h; pot -= h; } else if (i === 3 && you > 0) { you--; pot++; }
        msg.textContent = L[i].name + ': ' + L[i].what;
        if (you <= 0) { msg.textContent += ' ' + T('Out of coins! Play again?'); spinB.hidden = true; again.hidden = false; }
        else if (you >= 30) { msg.textContent += ' ' + T('30 coins: you win! A freilichen Chanukah!'); spinB.hidden = true; again.hidden = false; }
        show(); busy = false; spinB.disabled = false;
      }, 1600);
    });
    again.addEventListener('click', function () { you = 10; pot = 4; show(); msg.textContent = T('Ready? Tap Spin!'); spinB.hidden = false; again.hidden = true; });
  });

  // ---------- Giving (/donate, /chai-club): on to Stripe's secure checkout page ----------
  Array.prototype.forEach.call(document.querySelectorAll('form[data-give]'), function (f) {
    var err = f.querySelector('.give-err'), btn = f.querySelector('button[type=submit]'), other = f.elements.other;
    var fail = function (m, at) { err.textContent = m; err.hidden = false; if (at && at.focus) at.focus(); };
    if (other) other.addEventListener('input', function () { if (other.value) Array.prototype.forEach.call(f.querySelectorAll('input[name=amt]'), function (r) { r.checked = false; }); });
    Array.prototype.forEach.call(f.querySelectorAll('input[name=amt]'), function (r) { r.addEventListener('change', function () { if (other) other.value = ''; }); });
    f.addEventListener('submit', function (e) {
      e.preventDefault(); err.hidden = true;
      var pick = f.querySelector('input[name=amt]:checked'), amount = Number(other && other.value ? other.value : pick ? pick.value : 0);
      if (!(amount >= 1 && amount <= 10000)) return fail(T('Please enter an amount between $1 and $10,000.'), other);
      var freq = f.elements.freq, monthly = (freq && (freq.value || (f.querySelector('input[name=freq]:checked') || {}).value)) === 'monthly';
      var body = { amount: amount, fund: f.elements.fund.value, freq: monthly ? 'monthly' : 'once', dedication: f.elements.dedication.value, fee: f.elements.fee.checked, lang: LANG, back: f.getAttribute('data-back') || '/donate', idem: 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 14) };
      if (f.elements.show) {
        body.club = { show: f.elements.show.checked, name: f.elements.boardName.value.trim() };
        if (body.club.show && !body.club.name) return fail(T('Please enter the name for the board.'), f.elements.boardName);
      }
      btn.disabled = true; btn.textContent = T('Opening secure checkout…');
      fetch('/api/give/checkout', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, status: r.status, j: j }; }); })
        .then(function (x) {
          if (x.ok && x.j.url) { if (window.gtag) window.gtag('event', 'begin_checkout', { value: amount, currency: 'USD' }); location.href = x.j.url; return; }
          throw new Error(x.status === 503 ? T('Online giving is opening soon. Please call 925-384-7242, or see other ways to give below.') : (x.j.error || T('Something went wrong. Please try again.')));
        })
        .catch(function (e2) { btn.disabled = false; btn.textContent = T('Continue to secure payment'); fail(e2.message && e2.message !== 'Failed to fetch' ? e2.message : T('Something went wrong. Please try again.')); });
    });
  });
  // Fundraising campaigns (/campaign/..., and the banner on the home page): live totals, countdown, teams, levels left,
  // the donor wall, and the giving form (one payment or monthly payments). Numbers come from /api/campaign/<slug>.
  var usd = function (n) { return '$' + Math.round(n).toLocaleString('en-US'); }, cdata = {};
  var campaignData = function (slug) { if (!cdata[slug]) cdata[slug] = fetch('/api/campaign/' + encodeURIComponent(slug), { credentials: 'omit' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); return cdata[slug]; };
  Array.prototype.forEach.call(document.querySelectorAll('[data-campaign]'), function (box) {
    var slug = box.getAttribute('data-campaign'), team = box.getAttribute('data-team'), goal = +box.getAttribute('data-goal') || 0, bonus = +box.getAttribute('data-bonus') || 0;
    var q = function (s) { return box.querySelector(s); }, clock = q('[data-c-clock]'), start = Date.parse(box.getAttribute('data-start')), end = Date.parse(box.getAttribute('data-end'));
    var tick = function () {
      var now = Date.now(), until = now < start ? start : end, left = until - now;
      if (!(left > 0) || isNaN(until)) { clock.textContent = T('The campaign has ended'); clock.hidden = false; return; }
      var d = Math.floor(left / 864e5), h = Math.floor(left / 36e5) % 24, m = Math.floor(left / 6e4) % 60, s2 = Math.floor(left / 1e3) % 60;
      clock.textContent = (now < start ? T('Starts in') : T('Ends in')) + ' ' + (d ? d + T('d') + ' ' : '') + h + T('h') + ' ' + m + T('m') + ' ' + s2 + T('s');
      clock.hidden = false; setTimeout(tick, 1000);
    };
    tick();
    campaignData(slug).then(function (d) {
      if (!d) return;
      var raised = team ? (d.teams[team] || 0) : d.raised, donors = team ? d.wall.filter(function (w) { return w.team === team; }).length : d.donors;
      var target = bonus && raised >= goal ? bonus : goal, pct = target ? Math.min(100, Math.round(raised / target * 100)) : 0;
      q('[data-c-raised]').textContent = usd(raised); q('[data-c-donors]').textContent = donors; var dw = q('[data-c-donors-word]'); if (dw && donors === 1) dw.textContent = dw.getAttribute('data-one');
      q('[data-c-pct]').textContent = (goal ? Math.round(raised / goal * 100) : 0) + '%';
      q('[data-c-bar]').style.width = pct + '%'; q('.cmp-bar').setAttribute('aria-valuenow', pct);
      if (bonus && raised >= goal) q('[data-c-bonus]').hidden = false;
    });
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-wall]'), function (ul) {
    var slug = (document.querySelector('[data-campaign]') || {}).getAttribute && document.querySelector('[data-campaign]').getAttribute('data-campaign');
    var team = document.querySelector('[data-campaign][data-team]'), teamSlug = team && team.getAttribute('data-team');
    var search = document.querySelector('[data-wall-search]'), sort = document.querySelector('[data-wall-sort]'), all = [];
    var draw = function () {
      var words = (search && search.value || '').toLowerCase(), list = all.filter(function (w) { return !words || (w.name || '').toLowerCase().indexOf(words) >= 0 || (w.message || '').toLowerCase().indexOf(words) >= 0; });
      if (sort && sort.value === 'largest') list = list.slice().sort(function (a, b) { return (b.cents || 0) - (a.cents || 0); });
      ul.textContent = '';
      list.slice(0, 120).forEach(function (w) {
        var li = document.createElement('li'), top = document.createElement('p'), b = document.createElement('b');
        b.textContent = w.name || ul.getAttribute('data-anon'); top.appendChild(b);
        if (w.cents != null) { var a = document.createElement('span'); a.className = 'amt'; a.textContent = usd(w.cents / 100) + (w.months ? ' ' + ul.getAttribute('data-monthly').replace('{n}', w.months) : ''); top.appendChild(a); }
        li.appendChild(top);
        [w.dedication, w.message].forEach(function (x) { if (x) { var p2 = document.createElement('p'); p2.className = 'small'; p2.textContent = x; li.appendChild(p2); } });
        ul.appendChild(li);
      });
      if (!list.length && all.length) { var li2 = document.createElement('li'); li2.className = 'muted'; li2.textContent = '—'; ul.appendChild(li2); }
    };
    if (search) search.addEventListener('input', draw); if (sort) sort.addEventListener('change', draw);
    if (slug) campaignData(slug).then(function (d) { if (!d || !d.wall.length) return; all = teamSlug ? d.wall.filter(function (w) { return w.team === teamSlug; }) : d.wall; if (all.length) draw(); });
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-team-card]'), function (card) {
    var slug = document.querySelector('[data-campaign]').getAttribute('data-campaign'), id = card.getAttribute('data-team-card'), goal = +card.getAttribute('data-goal') || 0;
    campaignData(slug).then(function (d) { if (!d) return; var n = d.teams[id] || 0; card.querySelector('[data-team-raised]').textContent = usd(n); card.querySelector('.cmp-bar i').style.width = (goal ? Math.min(100, n / goal * 100) : 0) + '%'; });
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-left]'), function (el2) {
    var slug = document.querySelector('[data-campaign]').getAttribute('data-campaign');
    campaignData(slug).then(function (d) { if (!d) return; var left = Math.max(0, +el2.getAttribute('data-quantity') - (d.levels[el2.getAttribute('data-left')] || 0)); el2.textContent = left ? T('{n} available', { n: left }) : T('All taken: thank you!'); });
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-campaign-confirm]'), function (el2) {
    var sid = el2.getAttribute('data-campaign-confirm'); if (!sid) return;
    fetch('/api/campaign/confirm', { method: 'POST', credentials: 'omit', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ session_id: sid }) }).catch(function () {});
  });
  Array.prototype.forEach.call(document.querySelectorAll('form[data-campaign-give]'), function (f) {
    var err = f.querySelector('.give-err'), btn = f.querySelector('button[type=submit]'), other = f.elements.other, x = +f.getAttribute('data-multiplier') || 1, matchLine = f.querySelector('[data-c-matchline]');
    var fail = function (m, at) { err.textContent = m; err.hidden = false; if (at && at.focus) at.focus(); };
    var amount = function () { var pick = f.querySelector('input[name=amt]:checked'); return Number(other.value ? other.value : pick ? pick.value : 0); };
    var months = function () { var m = f.querySelector('input[name=months]:checked'); return m ? +m.value : 1; };
    var update = function () {
      var a = amount();
      Array.prototype.forEach.call(f.querySelectorAll('[data-per]'), function (s2) { s2.textContent = a >= 1 ? '(' + T('{amount} a month', { amount: (function (m) { return '$' + m.toLocaleString('en-US', { minimumFractionDigits: m % 1 ? 2 : 0, maximumFractionDigits: 2 }); })(Math.ceil(a / +s2.getAttribute('data-per') * 100) / 100) }) + ')' : ''; });
      if (matchLine) { matchLine.hidden = !(x > 1 && a >= 1); matchLine.textContent = T('With matching, your {gift} becomes {total}!', { gift: usd(a), total: usd(a * x) }); }
    };
    other.addEventListener('input', function () { if (other.value) Array.prototype.forEach.call(f.querySelectorAll('input[name=amt]'), function (r) { r.checked = false; }); update(); });
    Array.prototype.forEach.call(f.querySelectorAll('input[name=amt]'), function (r) { r.addEventListener('change', function () { other.value = ''; update(); }); });
    if (f.elements.level) f.elements.level.addEventListener('change', function () { var o = f.elements.level.selectedOptions[0], a = o && +o.getAttribute('data-amount'); if (a) { other.value = a; Array.prototype.forEach.call(f.querySelectorAll('input[name=amt]'), function (r) { r.checked = +r.value === a; if (r.checked) other.value = ''; }); update(); } });
    if (f.elements.anonymous) f.elements.anonymous.addEventListener('change', function () { f.elements.name.disabled = f.elements.anonymous.checked; });
    update();
    // The floating Donate button (phones) steps aside while the form itself is on screen.
    var sticky = document.querySelector('.cmp-sticky');
    if (sticky && window.IntersectionObserver) new IntersectionObserver(function (es) { sticky.hidden = es[0].isIntersecting; }).observe(f);
    f.addEventListener('submit', function (e) {
      e.preventDefault(); err.hidden = true;
      var a = amount(), n = months();
      if (!(a >= 1 && a <= (n > 1 ? 250000 : 100000))) return fail(n > 1 ? T('Please enter an amount between $1 and $250,000.') : T('Please enter an amount between $1 and $100,000. For a larger gift, choose monthly payments or call us.'), other);
      if (n > 1 && a / n < 5) return fail(T('Each monthly payment needs to be at least $5.'), other);
      var body = { campaign: f.getAttribute('data-campaign-give'), amount: a, months: n, level: f.elements.level ? f.elements.level.value : '', team: f.elements.team ? f.elements.team.value : '', name: f.elements.name.value.trim(), anonymous: f.elements.anonymous.checked, hideAmount: f.elements.hideAmount.checked, dedication: f.elements.dedication.value, message: f.elements.message.value, fee: f.elements.fee.checked, lang: LANG, idem: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 14) };
      btn.disabled = true; btn.textContent = T('Opening secure checkout…');
      fetch('/api/campaign/checkout', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, status: r.status, j: j }; }); })
        .then(function (r) {
          if (r.ok && r.j.url) { if (window.gtag) window.gtag('event', 'begin_checkout', { value: a, currency: 'USD' }); location.href = r.j.url; return; }
          throw new Error(r.status === 503 ? T('Online giving is opening soon. Please call 925-384-7242, or see other ways to give below.') : (r.j.error || T('Something went wrong. Please try again.')));
        })
        .catch(function (e2) { btn.disabled = false; btn.textContent = T('Continue to secure payment'); fail(e2.message && e2.message !== 'Failed to fetch' ? e2.message : T('Something went wrong. Please try again.')); });
    });
  });
  // The Chai Club honor board (/chai-club): each listed partner under their level, with that level's medal; counts per level.
  Array.prototype.forEach.call(document.querySelectorAll('[data-club-board]'), function (box) {
    fetch('/api/club', { credentials: 'omit' }).then(function (r) { return r.json(); }).then(function (d) {
      var counts = d.counts || {};
      Array.prototype.forEach.call(document.querySelectorAll('[data-count]'), function (c) { var n = counts[c.getAttribute('data-count')] || 0; c.textContent = n === 1 ? T('1 partner') : n ? T('{n} partners', { n: n }) : ''; });
      Array.prototype.forEach.call(box.querySelectorAll('[data-tier]'), function (tier) {
        var id = tier.getAttribute('data-tier'), ul = tier.querySelector('.hb-names'), tpl = tier.querySelector('template');
        var names = (d.members || []).filter(function (m) { return m.level === id; }), quiet = (counts[id] || 0) - names.length;
        names.forEach(function (m) { var li = el('li'); if (tpl) li.appendChild(tpl.content.cloneNode(true)); li.appendChild(el('span', { text: m.name })); ul.appendChild(li); });
        if (quiet > 0) { var q = tier.querySelector('.hb-quiet'); q.textContent = T('and {n} who give quietly', { n: quiet }); q.hidden = false; }
        tier.querySelector('.hb-empty').hidden = !!(counts[id] || names.length);
      });
    }).catch(function () {});
  });

  // ---------- "Ask us" chat ----------
  // "I'll do it" on /mitzvah: counts the pledge, shows how-to (and Call / WhatsApp the Rabbi for tefillin and mezuzah).
  Array.prototype.forEach.call(document.querySelectorAll('[data-mitzvah]'), function (card) {
    var id = card.getAttribute('data-mitzvah'), btn = card.querySelector('[data-mitzvah-do]'), done = card.querySelector('.mz-done'), key = 'cl_mz_' + id + '_' + new Date().toISOString().slice(0, 7);
    var show = function () { btn.disabled = true; btn.textContent = '✓ ' + T("I'm in!"); done.hidden = false; };
    if (store.get(key)) show();
    btn.addEventListener('click', function () {
      show(); store.set(key, 1);
      fetch('/api/site/mitzvah', { method: 'POST', credentials: 'omit', headers: { 'content-type': 'application/json', 'x-site': '1' }, body: JSON.stringify({ id: id, lang: LANG }) }).then(function (r) { return r.json(); }).then(function (j) {
        if (!j.ok) return;
        var c = card.querySelector('[data-mitzvah-count]'), tot = document.querySelector('[data-mitzvah-total]');
        if (c) c.textContent = T('{n} this month').replace('{n}', j.count); if (tot) tot.textContent = j.total;
      }).catch(function () {});
    });
  });
  // A random id for this visit's chat, so the Rabbi gets one note per conversation (no name, no tracking across visits).
  function cid() { try { var c = sessionStorage.getItem('cl_cid'); if (!c) { c = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem('cl_cid', c); } return c; } catch (e) { return ''; } }
  // Tapping Call / Text / WhatsApp the Rabbi lets him know (the call or message itself goes straight to his phone).
  document.addEventListener('click', function (ev) {
    var a = ev.target.closest && ev.target.closest('[data-lead]');
    if (!a) return;
    var body = JSON.stringify({ topic: a.getAttribute('data-lead'), channel: a.getAttribute('data-channel'), who: a.getAttribute('data-who') || '', page: location.pathname.replace(/^\/(he|ru)(?=\/)/, ''), lang: LANG, cid: cid() });
    try { fetch('/api/site/lead', { method: 'POST', credentials: 'omit', keepalive: true, headers: { 'content-type': 'application/json', 'x-site': '1' }, body: body }); } catch (e) {}
  });
  var fab = $('.chat-fab[data-chat-open]');
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
    // Keep the start of the answer in view (a long answer is read from its top, not scrolled to its end).
    var lastAnswer = null, show = function (b) { if (!b) return; var lg = panel.log; lg.scrollTop = Math.min(lg.scrollHeight, lg.scrollTop + b.getBoundingClientRect().top - lg.getBoundingClientRect().top - 8); };
    var bubble = function (role, text) { var b = el('div', { class: 'cm ' + role }); render(text, b); panel.log.appendChild(b); panel.log.scrollTop = panel.log.scrollHeight; return b; };
    var ask = function (q) {
      if (busy || !q.trim()) return;
      busy = true; history.push({ role: 'user', content: q.trim() }); save(); bubble('user', q.trim());
      Array.prototype.forEach.call(panel.log.querySelectorAll('.chips'), function (c) { c.remove(); });
      var b = el('div', { class: 'cm assistant typing', 'aria-label': T('Thinking…') }, [el('span'), el('span'), el('span')]), got = '', more = [], contact = null;
      panel.log.appendChild(b); panel.log.scrollTop = panel.log.scrollHeight; lastAnswer = b;
      fetch('/api/site/chat', { method: 'POST', credentials: 'omit', headers: { 'content-type': 'application/json', 'x-site': '1' }, body: JSON.stringify({ messages: history, lang: LANG, page: location.pathname, cid: cid() }) }).then(function (r) {
        if (!r.ok || !r.body) throw new Error('chat');
        var reader = r.body.getReader(), dec = new TextDecoder(), buf = '';
        var pump = function () { return reader.read().then(function (x) {
          if (x.done) return;
          buf += dec.decode(x.value, { stream: true });
          var parts = buf.split('\n\n'); buf = parts.pop();
          parts.forEach(function (p) { var d = /^data: (.*)$/m.exec(p); if (!d) return; try { var j = JSON.parse(d[1]); if (j.text) { got += j.text; b.classList.remove('typing'); render(got, b); show(b); } if (j.suggest) more = j.suggest; if (j.contact) contact = j.contact; } catch (e) {} });
          return pump();
        }); };
        return pump();
      }).then(function () { if (!got) throw new Error('empty'); history.push({ role: 'assistant', content: got }); save(); reach(contact); offer(more); })
        .catch(function () { b.classList.remove('typing'); render(T('Sorry, something went wrong. Please call 925-384-7242.'), b); history.pop(); save(); })
        .then(function () { busy = false; panel.input.focus(); });
    };
    // Call / Text / WhatsApp the Rabbi, right in the chat (mezuzah, tefillin, giving, meeting).
    var reach = function (c) {
      if (!c) return;
      var row = function (L, who) {
        var a = function (ch, label, cls) { return el('a', { class: 'btn sm ' + cls, href: L[ch], 'data-lead': c.topic, 'data-channel': ch, 'data-who': who, target: ch === 'whatsapp' ? '_blank' : null, rel: ch === 'whatsapp' ? 'noopener' : null, text: label }); };
        return el('div', { class: 'btns' }, [a('call', c.labels.call, 'ghost'), a('text', c.labels.text, 'ghost'), a('whatsapp', 'WhatsApp', 'gold'), L.email ? a('email', c.labels.email, 'ghost') : null]);
      };
      var kids = [el('strong', { text: c.title })];
      if (c.rebbetzin) kids.push(el('span', { text: c.labels.rabbi }), row(c, 'rabbi'), el('span', { text: c.labels.rebbetzin }), row(c.rebbetzin, 'rebbetzin')); else kids.push(row(c, 'rabbi'));
      kids.push(el('p', { class: 'muted', text: c.note }));
      panel.log.appendChild(el('div', { class: 'cm assistant reach' }, kids));
      show(lastAnswer);
    };
    var offer = function (qs) {
      if (!qs || !qs.length) return;
      var chips = el('div', { class: 'chips' });
      qs.forEach(function (q) { chips.appendChild(el('button', { type: 'button', class: 'chip', text: q, on: { click: function () { ask(q); } } })); });
      panel.log.appendChild(chips); show(lastAnswer);
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
    // "Ask a question about this" buttons on guides open the same chat (it already knows which page they are on).
    Array.prototype.forEach.call(document.querySelectorAll('[data-chat-open]:not(.chat-fab)'), function (b) { b.addEventListener('click', function () { open(); }); });
    if (history.length && store.get('cl_chat_open')) open();
  }

  // ---------- Search box on lists (guides) ----------
  [].forEach.call(document.querySelectorAll('[data-filter]'), function (box) {
    var items = document.querySelectorAll(box.getAttribute('data-filter'));
    box.addEventListener('input', function () {
      var q = box.value.trim().toLowerCase();
      [].forEach.call(items, function (it) { it.hidden = !!q && it.textContent.toLowerCase().indexOf(q) < 0; });
      [].forEach.call(document.querySelectorAll('#guides h2'), function (h) { var g = h.nextElementSibling; h.hidden = g && ![].some.call(g.querySelectorAll('.tile'), function (c) { return !c.hidden; }); });
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
    var perks = $('[data-perks]'); if (perks) perks.hidden = true;
    var p = me.profile;
    var f = { name: field(T('Full name'), p.name, { autocomplete: 'name' }), hebrewName: field(T('Hebrew name (e.g. Moshe ben Avraham)'), p.hebrewName), phone: field(T('Phone'), p.phone, { type: 'tel', autocomplete: 'tel', dir: 'ltr' }), address: field(T('Address'), p.address, { autocomplete: 'street-address' }), birthday: field(T('Birthday'), p.birthday, { type: 'date' }), anniversary: field(T('Wedding anniversary'), p.anniversary, { type: 'date' }), mezuzahs: field(T('Mezuzahs last checked'), p.mezuzahsChecked, { type: 'date' }), tefillin: field(T('Tefillin last checked'), p.tefillinChecked, { type: 'date' }), diet: field(T('Allergies or dietary needs (optional)'), p.diet) };
    var night = check(T('Born after sunset'), p.birthAfterSunset), news = check(T('Email me about events and holidays'), p.news), share = check(T('Share my yahrzeits with the Rabbi (so he can remember them with you)'), p.shareYahrzeits), pers = check(T('Suggest events and classes that fit my family (based on what we come to and read here)'), p.personalize !== false), shab = check(T('Email me the candle-lighting time every Friday'), p.shabbatEmail);
    var town = el('select', {}, [el('option', { value: '', text: T('My town') + '…' })].concat((me.towns || []).map(function (x) { var o = el('option', { value: x.slug, text: x.name }); if (p.town === x.slug) o.selected = true; return o; })));
    var m1 = el('p', { class: 'msg', hidden: true });
    var s1 = el('form', { class: 'card' }, [el('h2', { text: T('Me') }), el('p', { class: 'muted', text: p.email }), el('div', { class: 'fields' }, [f.name, f.hebrewName, f.phone, f.address, f.birthday, f.anniversary, f.diet, f.mezuzahs, f.tefillin]), el('p', { class: 'muted', text: T('Mezuzahs and tefillin should be checked by a scribe twice in seven years. We will remind you when it is time.') }), el('label', {}, [T('My town'), town]), night, news, shab, share, pers, el('p', {}, [el('button', { class: 'btn gold', text: T('Save') })]), m1]);
    s1.addEventListener('submit', function (ev) {
      ev.preventDefault();
      api('PUT', '/me', { name: f.name.input.value, hebrewName: f.hebrewName.input.value, phone: f.phone.input.value, address: f.address.input.value, birthday: f.birthday.input.value, anniversary: f.anniversary.input.value, mezuzahsChecked: f.mezuzahs.input.value, diet: f.diet.input.value, tefillinChecked: f.tefillin.input.value, birthAfterSunset: night.input.checked, news: news.input.checked, shareYahrzeits: share.input.checked, personalize: pers.input.checked, town: town.value, shabbatEmail: shab.input.checked })
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
    var yq = (new URLSearchParams(location.search).get('yahrzeit') || '').trim().slice(0, 60); /* from /sponsor: "Remember them every year" */
    if (yq && !web.some(function (y) { return y.name === yq; })) addY({ name: yq });
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
    var up = (me.upcoming || []).length ? el('section', { class: 'card' }, [el('h2', { text: T('My upcoming Jewish dates') }), me.calendarUrl ? el('p', {}, [el('a', { class: 'btn sm ghost', href: me.calendarUrl, text: T('Add my Jewish dates to my phone calendar') })]) : null, el('ul', { class: 'list' }, me.upcoming.map(function (u) { var k = KIND[u.kind] || [u.kind, '/sponsor?', 'Sponsor']; return el('li', {}, [el('strong', { text: new Date(u.date + 'T12:00:00Z').toLocaleDateString(LANG === 'he' ? 'he-IL' : LANG === 'ru' ? 'ru-RU' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) }), ' · ' + T(k[0]) + ': ' + u.name + ' ', u.parshaLabel ? el('a', { href: P(u.parshaSlug ? '/parsha/' + u.parshaSlug : '/parsha'), text: '(' + u.parshaLabel + ')' }) : null, u.parshaLabel ? ' ' : null, el('a', { href: P(k[1] + encodeURIComponent(u.name)), text: T(k[2]) })]); }))]) : null;
    // Getting started: a short checklist until the family has set up the things that make the account useful.
    var steps = [[T('Add your family'), me.family.length > 0, '#family'], [T('Add your Hebrew name'), !!p.hebrewName, '#me'], [T('Choose your town'), !!p.town, '#me'], [T('Get the Friday candle-lighting email'), !!p.shabbatEmail, '#me'], [T('Add a yahrzeit to remember'), me.yahrzeits.length > 0, '#yahrzeits'], [T('Add a phone number'), !!p.phone, '#me']];
    var doneN = steps.filter(function (x) { return x[1]; }).length;
    var start = doneN < steps.length ? el('section', { class: 'card start' }, [el('h2', { text: T('Get started') }), el('p', { class: 'muted', text: T('{done} of {all} done', { done: doneN, all: steps.length }) }), el('div', { class: 'bar' }, [el('span', { style: 'width:' + Math.round(100 * doneN / steps.length) + '%' })]),
      el('ul', { class: 'steps' }, steps.map(function (x) { return el('li', { class: x[1] ? 'done' : '' }, [x[1] ? el('span', { text: '✓ ' + x[0] }) : el('a', { href: x[2], text: x[0] })]); }))]) : null;
    s1.id = 'me'; s2.id = 'family';
    // My prayer list
    var pList = el('ul', { class: 'list' }), pName = field(T('Name for prayer (Hebrew name and mother\'s name, if you know them)'), ''), pMsg = el('p', { class: 'msg', hidden: true });
    var loadPrayers = function () { fetch('/api/site/me/prayers', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (r) { pList.textContent = ''; (r.items || []).forEach(function (x) {
      var act = function (a) { return function () { fetch('/api/site/me/prayers/' + x.id + '/' + a, { method: 'POST', credentials: 'same-origin', headers: { 'x-site': '1' } }).then(loadPrayers); }; };
      pList.appendChild(el('li', {}, [el('strong', { text: x.title }), ' ', el('span', { class: 'muted', text: x.active ? T('on the list since {date}', { date: x.since }) : T('no longer on the list') }), ' ', el('button', { type: 'button', class: 'btn sm ghost', text: T('Renew'), on: { click: act('renew') } }), ' ', el('button', { type: 'button', class: 'btn sm ghost', text: T('Remove'), on: { click: act('remove') } })]));
    }); }).catch(function () {}); };
    var s4 = el('form', { class: 'card', id: 'prayers' }, [el('h2', { text: T('My prayer list') }), el('p', { class: 'muted', text: T('Names for a refuah shleimah (complete recovery). The Rabbi and the community say Tehillim for them. Names stay on the list for 90 days; renew with one tap.') }), pList, pName, el('p', {}, [el('button', { class: 'btn gold', text: T('Add to the prayer list') })]), pMsg, el('p', {}, [el('a', { href: P('/tehillim'), text: T('Tehillim for every occasion') + ' →' })])]);
    s4.addEventListener('submit', function (ev) { ev.preventDefault(); var n = pName.input.value.trim(); if (!n) return; api('POST', '/submit', { kind: 'tehillim', title: n.slice(0, 120), name: p.name || p.email, email: p.email }).then(function (r) { msg(pMsg, r.ok ? T('Added. May they have a complete recovery.') : r.error, r.ok); if (r.ok) { pName.input.value = ''; loadPrayers(); } }); });
    loadPrayers();
    [start, up, s1, s2, s3, s4, rs, out].forEach(function (n) { if (n) acct.appendChild(el('section', {}, [n])); });
    if (!p.name) f.name.input.focus();
    if (location.hash === '#yahrzeits') s3.scrollIntoView();
  }
})();
