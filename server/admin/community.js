// Rabbi area, website page:
//  * Social drafts: every upcoming event as a ready post. Edit the text if you like, then Publish to Facebook
//    (and Instagram) with one button. Also the Google Business post text and a Facebook Event helper.
//  * Waiting for approval: Mazal Tovs, announcements, shiva notices, ideas and resources sent in by the community.
//  * RSVP lists per event (with CSV) and upcoming birthdays / Hebrew birthdays / anniversaries.
// Phone first: big buttons, short plain words, one section open at a time.
(function () {
  'use strict';
  var app = document.getElementById('app');
  function el(t, a, kids) { var n = document.createElement(t); for (var k in a || {}) { if (k === 'text') n.textContent = a[k]; else if (k === 'onclick') n.onclick = a[k]; else n.setAttribute(k, a[k]); } (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }); return n; }
  // Dates as people say them: "Today, 12:37 PM", "Yesterday, 9:05 AM", "Wed, Oct 21, 3:05 PM"; days as "Sat, Oct 31".
  function when(ts) {
    var d = new Date(ts); if (isNaN(d)) return String(ts || '');
    var time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }), days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 864e5);
    return days === 0 ? 'Today, ' + time : days === 1 ? 'Yesterday, ' + time : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ', ' + time;
  }
  function day(ts) { var d = /^\d{4}-\d{2}-\d{2}$/.test(ts) ? new Date(ts + 'T12:00:00') : new Date(ts); return isNaN(d) ? String(ts || '') : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
  // An event's start ("2026-12-06T16:30", Lafayette time) as "Sun, Dec 6, 4:30 PM".
  function dayTime(ts) { var d = new Date(ts); return isNaN(d) ? String(ts || '').replace('T', ' ') : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ', ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }
  function api(m, p, body) { return fetch('/admin/api' + p, { method: m, credentials: 'same-origin', headers: { 'x-admin': '1', 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j._status = r.status; return j; }); }); }
  var cell = function (v) { var s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  function csv(name, rows) { var b = new Blob([rows.map(function (r) { return r.map(cell).join(','); }).join('\r\n')], { type: 'text/csv' }); var a = el('a', { href: URL.createObjectURL(b), download: name }); a.click(); }
  function copy(text, btn) { (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { var t = btn.textContent; btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = t; }, 1500); }, function () { prompt('Copy this:', text); }); }
  // A link that looks like a button (Call, Text, WhatsApp, Email...). `cls`: 'wa' for WhatsApp green, 'on' for the main one.
  function btn(href, text, cls, attrs) { var a = el('a', { href: href, class: 'btn' + (cls ? ' ' + cls : ''), text: text }); for (var k in attrs || {}) a.setAttribute(k, attrs[k]); return a; }
  var ext = { target: '_blank', rel: 'noopener' };
  function telOf(phone) { var digits = String(phone || '').replace(/\D/g, ''); return digits.length === 10 ? '1' + digits : digits; }
  // Call / Text / WhatsApp / Email buttons for a person; only the ones we have a number or address for.
  function contactBtns(phone, email, subject) { var tel = telOf(phone); return [tel ? btn('tel:+' + tel, 'Call') : null, tel ? btn('sms:+' + tel, 'Text') : null, tel ? btn('https://wa.me/' + tel, 'WhatsApp', 'wa', ext) : null, email ? btn('mailto:' + email + (subject ? '?subject=' + encodeURIComponent(subject) : ''), 'Email') : null]; }
  // A big checkbox with its words on one line.
  function check(input, text) { return el('label', { class: 'check' }, [input, text]); }
  // What happens after a tap: the button is disabled while saving, then says "Saved ✓" (green) or "Could not save, try again".
  // `p` is the api() promise; ok when the server said 200 (or { ok: true }). Returns the promise for the caller's own follow-up.
  function flash(b, p, okText) {
    var was = b.textContent; b.disabled = true;
    return p.then(function (r) {
      var good = r && (r._status === 200 || r.ok) && !r.error;
      b.disabled = false; b.textContent = good ? (okText || 'Saved ✓') : 'Could not save, try again'; b.classList.add(good ? 'ok' : 'err');
      setTimeout(function () { if (b.isConnected) { b.textContent = was; b.classList.remove('ok', 'err'); } }, good ? 1500 : 3000);
      return r;
    }, function () { b.disabled = false; b.textContent = 'Could not save, try again'; b.classList.add('err'); setTimeout(function () { b.textContent = was; b.classList.remove('err'); }, 3000); return { _status: 0 }; });
  }
  // Raw words from the database as the Rabbi reads them.
  var STATUS = { pending: 'new', 'new': 'new', approved: 'approved', declined: 'declined', done: 'done', paid: 'paid', confirmed: 'signed up', unsubscribed: 'unsubscribed' };
  var SOURCE = { '?': 'website', '': 'website', site: 'website', form: 'a form', prefs: 'email settings', account: 'their account', rsvp: 'an RSVP', admin: 'you added them', footer: 'website', popup: 'website', subscribe: 'website', newsletter: 'website' };
  var word = function (s) { return STATUS[s] || String(s || '').replace(/[-_]/g, ' '); };
  var NOT_SET_UP = 'Not set up yet. Tell Claude: "I\'m at a computer".';

  // The sections, in the order they appear (things to act on first, then the tools, then the setup checklist); the menu follows it.
  var ORDER = ['requests', 'kaddish', 'approve', 'reach-out', 'sign-ups', 'campaign', 'rsvps', 'visitors', 'reading', 'birthdays', 'social', 'email', 'ask-the-rabbi', 'chat', 'setup'];
  // Each section folds away; a row of chips at the top jumps to it and, for things waiting for the Rabbi, shows how many.
  // Only the first section (in ORDER) with something waiting opens by itself; the others stay closed with a lit chip.
  var jump = el('nav', { class: 'jump' }), nSec = 0, W = window.WAITING_BY_ID; // ids: the short names, so /admin/community#requests opens that section
  var autoOpened = null, fromLink = !!(location.hash && location.hash.length > 1);
  function sortChips() { // lit chips first, then the rest, each group in ORDER
    var chips = [].slice.call(jump.children); chips.sort(function (a, b) { var ha = a.classList.contains('hot') ? 0 : 1, hb = b.classList.contains('hot') ? 0 : 1; return ha - hb || ORDER.indexOf(a.getAttribute('href').slice(1)) - ORDER.indexOf(b.getAttribute('href').slice(1)); });
    chips.forEach(function (c) { jump.appendChild(c); });
  }
  function section(title, note, short) {
    var id = String(short || 's' + (++nSec)).toLowerCase().replace(/[^a-z0-9]+/g, '-'), badge = el('span', { class: 'cnt' }), chipBadge = el('b', { class: 'cnt' }), h2 = el('h2', { text: title });
    var d = el('details', { class: 'sec', id: id }, [el('summary', {}, [h2, badge])]), body = el('div', { class: 'sec-b' });
    if (note) body.appendChild(el('p', { class: 'small', text: note }));
    d.appendChild(body); app.appendChild(d);
    var chip = el('a', { href: '#' + id, onclick: function () { d.open = true; } }, [short || title, chipBadge]);
    jump.appendChild(chip);
    // count(n, waiting): a badge on the chip and the section, only for things waiting for the Rabbi (waiting.js).
    body.count = function (n, waiting) {
      if (!waiting || !n) return;
      badge.textContent = chipBadge.textContent = String(n); chip.className = 'hot'; sortChips();
      if (fromLink) return; // opened from a link on the desk: that section is the one to show
      if (!autoOpened || ORDER.indexOf(id) < ORDER.indexOf(autoOpened.id)) { if (autoOpened) autoOpened.open = false; d.open = true; autoOpened = d; }
    };
    // sub(text): a plain count in the title ("RSVPs · 10 coming"), for things that are not waiting.
    body.sub = function (text) { h2.textContent = title + (text ? ' · ' + text : ''); };
    return body;
  }

  api('GET', '/site/social').then(function (soc) {
    if (soc._status === 401) { location.href = '/admin/'; return; }
    app.appendChild(el('h1', { text: 'Website community' }));
    app.appendChild(el('p', {}, [el('a', { href: '/admin/', text: '← Rabbi’s desk' })]));
    app.appendChild(jump);

    // ---- Setup: which settings are done (the same items as the to-do list Claude keeps) ----
    var su = section('Setup checklist', 'What is connected and what is not. To set up the rest, tell Claude: "I\'m at a computer".', 'Setup');
    api('GET', '/site/setup').then(function (x) {
      if (x._status !== 200 || !x.items) return;
      x.items.forEach(function (i) { su.appendChild(el('div', { class: 'row', style: 'min-height:36px' }, [el('strong', { text: i.done ? '✓' : '○', style: 'color:' + (i.done ? '#1f8f4e' : '#9b2c2c') + ';width:1.2em' }), i.label + (i.done ? '' : i.optional ? ' · not yet (optional)' : ' · not yet')])); });
      var left = x.items.filter(function (i) { return !i.done && !i.optional; }).length;
      su.sub(left ? left + ' to do' : 'all set');
    });

    // ---- Requests from the website (mezuzah, tefillin, giving, meetings) ----
    var sr = section('Requests from the website', 'People who tapped Call, Text, WhatsApp or Email, or asked the chat. Each one is also emailed to you.', 'Requests');
    api('GET', '/site/leads').then(function (x) {
      if (x._status !== 200 || !x.items || !x.items.length) { sr.appendChild(el('p', { class: 'small', text: 'None yet.' })); return; }
      sr.count(W['requests'](x), true);
      var NAME = { mezuzah: 'Mezuzah', tefillin: 'Tefillin', donation: 'Giving', meeting: 'Meeting', consult: 'Private conversation' }, HOW = { call: 'tapped Call', text: 'tapped Text', email: 'tapped Email', whatsapp: 'tapped WhatsApp', chat: 'asked the chat' }, LANG = { he: 'Hebrew', ru: 'Russian' };
      x.items.slice(0, 60).forEach(function (i) {
        sr.appendChild(el('div', { class: 'card' }, [el('strong', { text: NAME[i.topic] || word(i.topic) }), el('span', { class: 'pill', text: HOW[i.channel] || i.channel }), i.lang !== 'en' ? el('span', { class: 'pill', text: LANG[i.lang] || i.lang }) : null,
          el('div', { class: 'small', text: when(i.created_at) + (i.page ? ' · ' + i.page : '') }), i.detail ? el('div', { class: 'small', text: i.detail }) : null,
          (i.phone || i.email) ? el('div', { class: 'row' }, contactBtns(i.phone, i.email)) : null]));
      });
    });

    // ---- Visitors: people who left their details, their interests and the pages they looked at ----
    var sv = section('Visitors and their interests', 'Who left their name, what they read, and who is looking at an important topic right now.', 'Visitors');
    api('GET', '/site/visitors').then(function (x) {
      if (x._status !== 200) { sv.appendChild(el('p', { class: 'small', text: NOT_SET_UP })); return; }
      sv.appendChild(el('p', { class: 'small' }, [el('strong', { text: x.week.visitors + ' visitors this week. ' }), x.week.interests.slice(0, 8).map(function (i) { return i.label + ': ' + i.n; }).join(' · ')]));
      if (!x.items.length) { sv.appendChild(el('p', { class: 'small', text: 'No one has left their details yet.' })); return; }
      sv.count(W['visitors'](x), true);
      x.items.forEach(function (p) {
        var pages = el('div', { class: 'small', hidden: 'hidden' }, p.pages.map(function (v) { return el('div', { text: v.day + '  ' + v.path }); }));
        sv.appendChild(el('div', { class: 'card' + (p.hot ? ' hot' : '') }, [
          el('strong', { text: p.name || p.email }), el('div', { class: 'small', text: p.email + (p.phone ? ' · ' + p.phone : '') + ' · last visit ' + p.lastSeen }),
          el('div', {}, p.interests.map(function (i) { return el('span', { class: 'pill', text: i.label + ' ×' + i.n, style: i.alert ? 'background:#fff3e4' : '' }); })),
          el('div', { class: 'row' }, contactBtns(p.phone, p.email).concat([
            el('button', { text: 'Pages they looked at', onclick: function () { pages.hidden = !pages.hidden; } })])), pages]));
      });
    });

    // ---- People to reach out to ----
    var so = section('People to reach out to', 'Who to call or message this week, with a ready message. Tap Done when you have.', 'Reach out');
    var person = function (i, box) {
      var text = el('textarea', { rows: '4', dir: i.lang === 'he' ? 'rtl' : 'auto' }); text.value = i.text;
      var open = function (kind) { return function () { var t = encodeURIComponent(text.value), url = i[kind]; if (!url) return; url = url.replace(/([?&](text|body)=)[^&]*/, '$1' + t); window.open(url, '_blank'); }; };
      var doneBtn = el('button', { text: 'Done', onclick: function () { flash(doneBtn, api('POST', '/site/outreach/done', { memberId: i.memberId, key: i.key || ('invite:' + i.event) }), 'Done ✓').then(function (r) { if (r._status === 200) setTimeout(function () { card.remove(); }, 600); }); } });
      var card = el('div', { class: 'card' + (i.priority === 1 ? ' hot' : '') }, [el('strong', { text: i.name }), el('span', { class: 'pill', text: word(i.kind || 'invite') }), i.lang && i.lang !== 'en' ? el('span', { class: 'pill', text: i.lang === 'he' ? 'Hebrew' : 'Russian' }) : null,
        el('div', { class: 'small', text: i.reason || (i.reasons || []).join('; ') }), text,
        el('div', { class: 'row' }, [i.whatsapp ? el('button', { class: 'on wa', text: 'WhatsApp', onclick: open('whatsapp') }) : el('span', { class: 'small', text: 'No mobile number on file' }), i.sms ? el('button', { text: 'Text', onclick: open('sms') }) : null, i.email ? el('button', { text: 'Email', onclick: open('email') }) : null, i.call ? btn(i.call, 'Call ' + i.phone) : null, doneBtn])]);
      box.appendChild(card);
    };
    api('GET', '/site/outreach').then(function (o) {
      if (o._status !== 200) { so.appendChild(el('p', { class: 'small', text: NOT_SET_UP })); return; }
      if (!o.items.length) { so.appendChild(el('p', { class: 'small', text: 'Nothing for now. Suggestions appear as families sign in and come to events.' })); return; }
      so.count(W['reach-out'](o), true);
      o.items.forEach(function (i) { person(i, so); });
    });

    // ---- Social drafts ----
    var s1 = section('Social drafts', soc.facebook ? 'Every upcoming event is ready to post. Edit the text if you like, then press Publish.' : 'Facebook is not connected yet (tell Claude: "I\'m at a computer"). You can still copy the text.', 'Social');
    if (!soc.items.length) s1.appendChild(el('p', { class: 'small', text: 'No upcoming events.' }));
    var toPost = soc.items.filter(function (e) { return !(e.posted && e.posted.facebook); }).length;
    s1.sub(toPost ? toPost + ' to post' : '');
    soc.items.forEach(function (e) {
      var text = el('textarea', { rows: '9' }); text.value = e.message;
      var msg = el('div', { class: 'small' }), fbDone = e.posted.facebook, igDone = e.posted.instagram;
      var fbBox = el('input', { type: 'checkbox' }); fbBox.checked = !fbDone;
      var igBox = el('input', { type: 'checkbox' }); igBox.checked = soc.instagram && !igDone && !!e.image;
      var pub = el('button', { class: 'on', text: 'Publish', onclick: function () {
        var nets = []; if (fbBox.checked) nets.push('facebook'); if (igBox.checked && soc.instagram) nets.push('instagram');
        if (!nets.length) { msg.textContent = 'Tick Facebook or Instagram first.'; return; }
        pub.disabled = true; msg.textContent = 'Publishing…';
        api('POST', '/site/social/' + e.slug, { message: text.value, networks: nets }).then(function (r) {
          pub.disabled = false;
          if (r._status !== 200) { msg.textContent = r.error || 'Could not publish, try again.'; return; }
          msg.textContent = Object.keys(r.results).map(function (n) { var x = r.results[n]; return n + ': ' + (x.ok ? 'published' : x.error); }).join(' · ');
        });
      } });
      var status = [fbDone ? 'On Facebook since ' + day(fbDone.at) : 'Not yet on Facebook', soc.instagram ? (igDone ? 'on Instagram' : 'not yet on Instagram') : ''].filter(Boolean).join(' · ');
      var copyBtn = el('button', { text: 'Copy post text', onclick: function () { copy(text.value, copyBtn); } });
      var gBtn = el('button', { text: 'Copy Google Business post', onclick: function () { copy(e.google, gBtn); } });
      var ndBtn = el('button', { text: 'Copy & open Nextdoor', onclick: function () { copy(e.nextdoor, ndBtn); window.open('https://nextdoor.com/news_feed/', '_blank', 'noopener'); } });
      var calBtn = el('button', { text: 'Copy for local calendars', title: 'For community calendars of local papers and websites (Lamorinda Weekly, Patch...)', onclick: function () { copy(e.calendar, calBtn); } });
      var fbEv = el('button', { text: 'Copy & open Facebook Events', onclick: function () { copy(e.title + '\n' + e.when + '\n\n' + text.value, fbEv); window.open('https://www.facebook.com/events/create/', '_blank', 'noopener'); } });
      s1.appendChild(el('div', { class: 'card' }, [
        el('strong', { text: e.title }), el('div', { class: 'small', text: e.when + ' · ' + status }),
        e.image ? el('img', { src: e.image, alt: '', style: 'max-width:200px;border-radius:8px;margin:8px 0;display:block' }) : el('div', { class: 'small', text: 'Tip: add a picture or flyer to the event for a bigger post (Instagram needs one).' }),
        text,
        el('div', { class: 'row' }, [check(fbBox, 'Facebook'), soc.instagram ? check(igBox, 'Instagram') : null, pub]),
        el('details', { class: 'fold' }, [el('summary', { text: 'More ways to share' }), el('div', { class: 'row' }, [copyBtn, gBtn, ndBtn, calBtn, fbEv, btn(e.googleCalendar, 'Google Calendar', '', ext), btn(e.url, 'View page', '', ext)])]), msg]));
    });

    // ---- Weekly email ----
    // Compose (which edition, the Rabbi's word, this week's joke), see the real email, send a test to himself, send to
    // everyone or let it go by itself every week; then, folded away: the sent emails (opened, clicked), the subscribers
    // and the same week as a WhatsApp message.
    var sw = section('Weekly email', 'Written by itself every week: your word, Shabbat times, the parsha, events, guides and more.', 'Email');
    var kind = el('select', {}, [['auto', 'Weekly (holiday edition by itself when a holiday is near)'], ['shabbat', 'Weekly: Shabbat edition'], ['holiday', 'Holiday edition'], ['message', 'My own message (with the events and giving below it)']].map(function (o) { return el('option', { value: o[0], text: o[1] }); }));
    var note = el('textarea', { rows: '9', placeholder: 'A word from the Rabbi: a thought on the parsha or the holiday, a story, a greeting' }), noteSet = false;
    var wordInfo = el('div', { class: 'small' }), wordOut = el('div', { class: 'small' });
    var approveBtn = el('button', { class: 'on', text: 'Approve this word', onclick: function () { flash(approveBtn, api('POST', '/site/weekly/word', { text: note.value }), 'Approved ✓').then(function (r) { if (r.ok) { wordOut.textContent = 'Approved. It goes in this week\'s email.'; load(); } else if (r.error) wordOut.textContent = r.error; }); } });
    var subj = el('input', { placeholder: 'Subject (optional: written for you)' }), msgBox = el('textarea', { rows: '8', placeholder: 'Your message' }), joke = el('textarea', { rows: '2', placeholder: 'Joke of the week (optional: one is picked for you)' });
    var lang = el('select', {}, [['en', 'Preview in English'], ['he', 'Preview in Hebrew'], ['ru', 'Preview in Russian']].map(function (o) { return el('option', { value: o[0], text: o[1] }); }));
    var info = el('div', { class: 'small' });
    var see = btn('#', 'See the email ↗', 'on', ext);
    var opts = function () { return { kind: kind.value, note: note.value, joke: joke.value, subject: subj.value, message: msgBox.value }; };
    var qs = function () { var o = opts(); return Object.keys(o).map(function (k) { return k + '=' + encodeURIComponent(o[k]); }).join('&') + '&lang=' + lang.value; };
    var show = function () { msgBox.parentNode.hidden = kind.value !== 'message'; note.hidden = kind.value === 'message'; };
    var load = function () { show(); see.href = '/admin/api/site/weekly/preview?' + qs(); api('GET', '/site/weekly?' + qs()).then(function (m) { if (m._status !== 200) { info.textContent = m.error || NOT_SET_UP; return; }
      var w = m.word || {}; if (!noteSet && !note.value && w.text) { noteSet = true; note.value = w.text; return load(); } noteSet = true;
      sw.count(W['email'](w), true); // lights the chip while the word waits for approval
      wordInfo.textContent = !w.text ? 'No draft for this Shabbat yet: write your own, or leave it empty.' : w.approved ? 'Approved for Shabbat ' + day(w.week) + '. Change it and tap Approve again if you like.' : 'Claude\'s draft for Shabbat ' + day(w.week) + ', from the Rebbe\'s teachings. Read it, change anything, then tap Approve. Nothing is sent before you approve.'; var bl = m.byLang || {}; info.textContent = 'Subject: ' + m.subject + ' · ' + m.recipients + ' people will receive it (' + ['en', 'he', 'ru'].map(function (l) { return (bl[l] || 0) + ' ' + { en: 'English', he: 'Hebrew', ru: 'Russian' }[l]; }).join(', ') + ').' + (m.email ? '' : ' Email sending is not set up yet: tell Claude "I\'m at a computer".'); }); };
    var post = function (path, body, out, btnEl) { btnEl.disabled = true; return api('POST', path, body).then(function (r) { btnEl.disabled = false; out.textContent = r._status === 200 ? '' : (r.error || 'Something went wrong, try again.'); return r; }); };
    var testTo = el('input', { type: 'email', placeholder: 'Send a test to (empty: to you)' }), testOut = el('div', { class: 'small' });
    var testBtn = el('button', { text: 'Send me a test', onclick: function () { var b = opts(); b.to = testTo.value; b.lang = lang.value; post('/site/weekly/test', b, testOut, testBtn).then(function (r) { if (r.ok) testOut.textContent = 'Test sent to ' + r.to + '.'; }); } });
    var sendBtn = el('button', { class: 'on', text: 'Send to everyone now', onclick: function () { if (!confirm('Send this email to everyone now?')) return; var b = opts(); b.confirm = true; post('/site/weekly/send', b, info, sendBtn).then(function (r) { if (r.ok) { info.textContent = r.background ? 'Sending to ' + r.total + ' people now. See "Sent emails" below in a few minutes.' : 'Sent to ' + r.sent + ' of ' + r.total + '.'; sent(); } }); } });
    [kind, lang].forEach(function (x) { x.onchange = load; });
    sw.appendChild(el('div', { class: 'card' }, [el('label', {}, ['Edition ', kind]), el('strong', { text: 'A word from the Rabbi' }), wordInfo, note, el('div', { class: 'row' }, [approveBtn]), wordOut, el('div', { hidden: '' }, [subj, msgBox]), joke,
      el('div', { class: 'row' }, [el('button', { text: 'Update', onclick: load }), lang, see]), info,
      el('div', { class: 'row' }, [testTo, testBtn, sendBtn]), testOut]));
    // Every week by itself.
    var autoOn = el('input', { type: 'checkbox' });
    var autoDay = el('select', {}, ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map(function (d, i) { return el('option', { value: String(i), text: d }); }));
    var autoHour = el('select', {}, [7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map(function (h) { return el('option', { value: String(h), text: (h > 12 ? h - 12 : h) + (h >= 12 ? ' PM' : ' AM') }); })), autoOut = el('div', { class: 'small' });
    var saveAuto = function () { api('POST', '/site/weekly/auto', { on: autoOn.checked, day: autoDay.value, hour: autoHour.value }).then(function (r) { autoOut.textContent = r.ok ? (r.on ? 'On: it goes out by itself every ' + autoDay.options[autoDay.selectedIndex].text + ' at ' + autoHour.options[autoHour.selectedIndex].text + ' (Lafayette time), with the holiday edition when a holiday is near.' : 'Off: send it with the button.') : 'Could not save, try again.'; }); };
    [autoOn, autoDay, autoHour].forEach(function (x) { x.onchange = saveAuto; });
    api('GET', '/site/weekly/auto').then(function (a) { if (a._status !== 200) return; autoOn.checked = !!a.on; autoDay.value = String(a.day); autoHour.value = String(a.hour); autoOut.textContent = a.on ? 'On.' : 'Off: send it with the button.'; });
    sw.appendChild(el('div', { class: 'card' }, [el('strong', { text: 'Send it by itself every week' }), el('div', { class: 'small', text: 'Written fresh each week. To add your own word that week, send it with the button instead.' }), check(autoOn, 'On'), el('div', { class: 'row' }, [autoDay, autoHour]), autoOut]));
    // Sent emails: how many got it, opened it, clicked; the most clicked links.
    var sentBox = el('div');
    var sent = function () { api('GET', '/site/email/campaigns').then(function (r) { sentBox.textContent = ''; if (r._status !== 200) return; if (!r.items.length) sentBox.appendChild(el('p', { class: 'small', text: 'Nothing sent yet.' }));
      r.items.forEach(function (c) { var pct = function (n) { return c.sent ? Math.round(100 * n / c.sent) + '%' : '0%'; };
        sentBox.appendChild(el('div', { class: 'card' }, [el('strong', { text: c.subject }), el('div', { class: 'small', text: when(c.created_at) + (c.auto ? ' · sent by itself' : '') + (c.done_at ? '' : ' · still sending') }),
          el('div', { class: 'row em-stats' }, [['Sent', c.sent + ' of ' + c.total], ['Opened', c.opened + ' (' + pct(c.opened) + ')'], ['Clicked', c.clicked + ' (' + pct(c.clicked) + ')']].concat(c.failed ? [['Failed', String(c.failed)]] : []).map(function (x) { return el('div', {}, [el('b', { text: x[1] }), el('span', { text: x[0] })]); })),
          c.links.length ? el('div', { class: 'small', text: 'Most clicked: ' + c.links.map(function (l) { return l.url + ' (' + l.n + ')'; }).join(' · ') }) : null])); }); }); };
    sw.appendChild(el('details', { class: 'fold' }, [el('summary', { text: 'Sent emails' }), sentBox])); sent();
    // Subscribers.
    var subBox = el('div'), subQ = el('input', { type: 'search', placeholder: 'Find a name or email' }), subAll = [];
    var drawSubs = function () { var q = subQ.value.toLowerCase(); subBox.textContent = ''; subAll.filter(function (s) { return !q || (s.email + ' ' + (s.name || '')).toLowerCase().indexOf(q) >= 0; }).slice(0, 200).forEach(function (s) {
      var rm = el('button', { text: 'Remove', onclick: function () { if (confirm('Remove ' + s.email + ' from the weekly email?')) flash(rm, api('DELETE', '/site/email/subscribers/' + encodeURIComponent(s.email)), 'Removed ✓').then(subs); } });
      subBox.appendChild(el('div', { class: 'card' }, [el('strong', { text: s.name || s.email }), el('span', { class: 'pill', text: s.status === 'pending' ? 'waiting to confirm' : word(s.status) }), el('span', { class: 'pill', text: { en: 'English', he: 'Hebrew', ru: 'Russian' }[s.lang] || s.lang }),
        el('div', { class: 'small', text: (s.name ? s.email + ' · ' : '') + 'from ' + (SOURCE[s.source || ''] || word(s.source)) + (s.created_at ? ' · ' + day(s.created_at) : '') + ' · got ' + s.got + ', opened ' + s.opened + ', clicked ' + s.clicked }),
        s.status !== 'unsubscribed' ? rm : null])); }); };
    var subInfo = el('div', { class: 'small' }), subSummary = el('summary', { text: 'Subscribers' });
    var subs = function () { api('GET', '/site/email/subscribers').then(function (r) { if (r._status !== 200) return; subAll = r.items; subSummary.textContent = 'Subscribers (' + r.confirmed + ')'; subInfo.textContent = r.confirmed + ' signed up · ' + r.pending + ' waiting to confirm · ' + r.unsubscribed + ' unsubscribed'; drawSubs(); }); };
    subQ.oninput = drawSubs;
    var addEmail = el('input', { type: 'email', placeholder: 'Email' }), addName = el('input', { placeholder: 'Name' }), addLang = el('select', {}, [['en', 'English'], ['he', 'Hebrew'], ['ru', 'Russian']].map(function (o) { return el('option', { value: o[0], text: o[1] }); })), addOut = el('div', { class: 'small' });
    var addBtn = el('button', { text: 'Add', onclick: function () { flash(addBtn, api('POST', '/site/email/subscribers', { email: addEmail.value, name: addName.value, lang: addLang.value }), 'Added ✓').then(function (r) { if (r.ok) { addOut.textContent = 'Added.'; addEmail.value = addName.value = ''; subs(); } else addOut.textContent = r.error || ''; }); } });
    var remindOut = el('div', { class: 'small' }), remindBtn = el('button', { text: 'Ask the unconfirmed again', onclick: function () { post('/site/email/subscribers/remind', {}, remindOut, remindBtn).then(function (r) { if (r.ok) remindOut.textContent = 'Asked ' + r.sent + ' people to confirm.'; }); } });
    sw.appendChild(el('details', { class: 'fold' }, [subSummary, el('div', { class: 'card' }, [subInfo, el('div', { class: 'small', text: 'Add someone who asked you in person (they are signed up at once):' }), el('div', { class: 'row' }, [addName, addEmail, addLang, addBtn]), addOut,
      el('div', { class: 'row' }, [btn('/admin/api/site/email/subscribers.csv', 'Download all (CSV)'), remindBtn]), remindOut, subQ, subBox])]));
    subs();
    load();
    // The same week as a WhatsApp message for the community groups (pick the language, copy or open WhatsApp).
    var waText = el('textarea', { rows: '12' }), waLang = el('select', {}, [['en', 'English'], ['he', 'Hebrew'], ['ru', 'Russian']].map(function (o) { return el('option', { value: o[0], text: o[1] }); }));
    var waLoad = function () { api('GET', '/site/weekly/whatsapp?lang=' + waLang.value).then(function (m) { waText.value = m.text || ''; }); };
    waLang.onchange = waLoad;
    var waCopy = el('button', { text: 'Copy', onclick: function () { copy(waText.value, waCopy); } });
    sw.appendChild(el('details', { class: 'fold' }, [el('summary', { text: 'This week as a WhatsApp message' }), el('div', { class: 'card' }, [el('div', { class: 'small', text: 'For your WhatsApp groups and status. Open WhatsApp, choose the group, send.' }), waText, el('div', { class: 'row' }, [waLang, waCopy, el('button', { class: 'on wa', text: 'Open WhatsApp', onclick: function () { window.open('https://wa.me/?text=' + encodeURIComponent(waText.value), '_blank'); } })])])]));
    waLoad();

    // ---- Submissions ----
    var s2 = section('Waiting for approval', 'Mazal Tovs, announcements and notices sent in by the community. Approved ones go on the website.', 'Approve');
    api('GET', '/site/submissions').then(function (x) {
      if (x._status !== 200) { s2.appendChild(el('p', { class: 'small', text: NOT_SET_UP })); return; }
      if (!x.items.length) s2.appendChild(el('p', { class: 'small', text: 'Nothing new.' }));
      s2.count(W['approve'](x), true);
      x.items.forEach(function (i) {
        var st = el('span', { class: 'pill', text: word(i.status) });
        var set = function (status, b) { flash(b, api('POST', '/site/submissions/' + i.id, { status: status })).then(function (r) { if (r.ok) st.textContent = word(status); }); };
        var ok = el('button', { class: 'on', text: 'Approve', onclick: function () { set('approved', ok); } }), no = el('button', { text: 'Decline', onclick: function () { set('declined', no); } });
        s2.appendChild(el('div', { class: 'card' }, [el('div', { class: 'small', text: (x.kinds[i.kind] ? x.kinds[i.kind].label : word(i.kind)) + ' · from ' + i.name + ' (' + i.email + ') · ' + day(i.created_at) }), el('strong', { text: i.title }), el('div', { text: i.body }), i.link ? el('a', { href: i.link, target: '_blank', rel: 'noopener', text: i.link }) : null,
          el('div', { class: 'row' }, [st, ok, no, btn('mailto:' + i.email + '?subject=' + encodeURIComponent('Re: ' + i.title), 'Reply by email')])]));
      });
    });

    // ---- Kaddish requests, the prayer list and confidential messages (private forms), kept for good ----
    var sk = section('Kaddish, prayer list & private messages', 'From the Kaddish, Tehillim and "message to the Rabbi" forms, newest first. Tap Done when taken care of.', 'Kaddish');
    api('GET', '/site/submissions?private=1').then(function (x) {
      if (x._status !== 200) { sk.appendChild(el('p', { class: 'small', text: NOT_SET_UP })); return; }
      sk.count(W['kaddish'](x), true);
      var kq = el('input', { type: 'search', placeholder: 'Search a name, email or word' }), kk = el('select', {}, [el('option', { value: '', text: 'All kinds' })].concat(['kaddish', 'tehillim', 'rabbi'].map(function (k) { return el('option', { value: k, text: x.kinds[k] ? x.kinds[k].label : k }); })));
      var showDone = el('input', { type: 'checkbox' }), box = el('div');
      sk.appendChild(el('div', { class: 'row' }, [kq, kk, check(showDone, 'Show done'), btn('/admin/api/site/submissions.csv', 'Download all (CSV)')]));
      sk.appendChild(box);
      // Raw words in the form's text ("For: refuah", "Kaddish for: 11 months") as the Rabbi reads them.
      var FOR = { refuah: 'a complete recovery', birth: 'an easy and healthy birth', match: 'finding a match', children: 'children', livelihood: 'livelihood', other: 'other' };
      var readable = function (s) { return String(s || '').replace(/^(For): (\w+)$/gm, function (m, a, b) { return a + ': ' + (FOR[b] || b); }); };
      var draw = function () {
        box.textContent = '';
        var q = kq.value.trim().toLowerCase(), list = x.items.filter(function (i) {
          return (!kk.value || i.kind === kk.value) && (showDone.checked || i.status === 'pending') && (!q || [i.name, i.email, i.phone, i.title, i.body].join(' ').toLowerCase().indexOf(q) >= 0);
        });
        if (!list.length) box.appendChild(el('p', { class: 'small', text: x.items.length ? 'Nothing here. Tick "Show done" to see earlier ones.' : 'Nothing yet.' }));
        list.forEach(function (i) {
          var st = el('span', { class: 'pill', text: word(i.status) });
          var set = function (status, b) { flash(b, api('POST', '/site/submissions/' + i.id, { status: status }), status === 'done' ? 'Done ✓' : 'Saved ✓').then(function (r) { if (r.ok) { i.status = status; setTimeout(draw, 600); } }); };
          var doneBtn = i.status === 'pending' ? el('button', { class: 'on', text: 'Done', onclick: function () { set('done', doneBtn); } }) : el('button', { text: 'Open again', onclick: function () { set('pending', doneBtn); } });
          box.appendChild(el('div', { class: 'card' + (i.status === 'pending' ? ' hot' : '') }, [
            el('div', { class: 'small', text: (x.kinds[i.kind] ? x.kinds[i.kind].label : word(i.kind)) + ' · ' + day(i.created_at) }),
            el('strong', { text: i.title }), el('div', { style: 'white-space:pre-line', text: readable(i.body) }),
            el('div', { class: 'small', text: 'From ' + i.name + ' · ' + i.email + (i.phone ? ' · ' + i.phone : '') }),
            el('div', { class: 'row' }, [st].concat(contactBtns(i.phone, i.email, 'Re: ' + i.title), [doneBtn]))]));
        });
      };
      kq.oninput = draw; kk.onchange = draw; showDone.onchange = draw; draw();
    });

    // ---- Fundraising campaigns: totals, every gift, and gifts given by check, cash or a donor-advised fund ----
    var sc = section('Campaigns', 'How much each campaign raised and who gave. Add gifts that came by check or cash so they count.', 'Campaign');
    var usd = function (n) { return '$' + Math.round(n).toLocaleString('en-US'); };
    var HOW = { online: 'online', card: 'online', check: 'check', cash: 'cash', wire: 'wire transfer', stock: 'stock', daf: 'donor-advised fund', pledge: 'pledge', other: 'other' };
    var loadCampaigns = function () {
      sc.textContent = '';
      api('GET', '/campaigns').then(function (x) {
        if (x._status !== 200 || !x.campaigns || !x.campaigns.length) { sc.appendChild(el('p', { class: 'small', text: 'No campaigns yet. To start one, tell Claude its name, goal and dates.' })); return; }
        sc.count(W['campaign'](x), true);
        x.campaigns.forEach(function (c) {
          var list = el('div', { hidden: 'hidden' });
          var f = { name: el('input', { placeholder: 'Name (e.g. The Cohen Family)' }), amount: el('input', { type: 'number', min: '1', placeholder: 'Amount ($)' }), how: el('select', {}, ['check', 'cash', 'wire', 'stock', 'daf', 'other'].map(function (h) { return el('option', { value: h, text: HOW[h] }); })), team: el('select', {}, [el('option', { value: '', text: 'No team' })].concat(c.teams.map(function (t) { return el('option', { value: t.slug, text: t.name }); }))), message: el('input', { placeholder: 'Message or dedication (optional)' }), show: el('input', { type: 'checkbox', checked: 'checked' }) };
          var msg = el('p', { class: 'small warn' });
          var addBtn = el('button', { class: 'on', text: 'Add gift', onclick: function () { flash(addBtn, api('POST', '/campaigns/' + c.slug + '/offline', { name: f.name.value, amount: f.amount.value, how: f.how.value, team: f.team.value, message: f.message.value, show: f.show.checked }), 'Added ✓').then(function (r) { if (r._status === 200) setTimeout(loadCampaigns, 600); else msg.textContent = r.error || ''; }); } });
          var add = el('details', { class: 'fold' }, [el('summary', { text: 'Add a gift by check, cash or donor-advised fund' }), el('div', { class: 'card' }, [f.name, f.amount, el('div', { class: 'row' }, [f.how, c.teams.length ? f.team : null]), f.message, check(f.show, 'Show the name on the donor wall'), addBtn, msg])]);
          c.gifts.forEach(function (g) {
            var rm = el('button', { text: 'Remove', onclick: function () { if (confirm('Remove this gift?')) flash(rm, api('DELETE', '/campaigns/' + c.slug + '/offline/' + g.id), 'Removed ✓').then(loadCampaigns); } });
            list.appendChild(el('div', { class: 'card' }, [el('div', { class: 'row' }, [el('strong', { text: g.name || 'Anonymous' }), el('span', { text: usd(g.cents / 100) + (g.count ? ' over ' + g.count + (g.interval === 'year' ? ' years' : ' months') : '') }), el('span', { class: 'pill', text: HOW[g.how] || g.how }), g.show ? null : el('span', { class: 'pill', text: 'anonymous' })]),
              el('div', { class: 'small', text: [day(new Date(g.at).toISOString()), g.team && ('team: ' + g.team), g.dedication, g.message].filter(Boolean).join(' · ') }),
              /^off_/.test(g.id) ? rm : null]));
          });
          var pend = c.pledges.filter(function (p) { return p.status === 'pending'; });
          var pledgeBox = pend.length ? el('div', { class: 'card hot' }, [el('strong', { text: 'Pledges to follow up (' + pend.length + ')' })].concat(pend.map(function (p) {
            var got = el('button', { class: 'on', text: 'Received: count it', onclick: function () { flash(got, api('POST', '/campaigns/' + c.slug + '/pledges/' + p.id, { action: 'received' }), 'Counted ✓').then(function () { setTimeout(loadCampaigns, 600); }); } });
            var cancel = el('button', { text: 'Cancel pledge', onclick: function () { if (confirm('Cancel this pledge?')) flash(cancel, api('POST', '/campaigns/' + c.slug + '/pledges/' + p.id, { action: 'cancel' }), 'Cancelled ✓').then(function () { setTimeout(loadCampaigns, 600); }); } });
            return el('div', { class: 'card' }, [el('div', { class: 'row' }, [el('strong', { text: p.fullName }), el('span', { text: usd(p.cents / 100) }), el('span', { class: 'pill', text: 'by ' + (HOW[p.how] || p.how) })]),
              el('div', { class: 'small', text: [p.email, p.phone, day(new Date(p.at).toISOString()), p.dedication, p.message].filter(Boolean).join(' · ') }),
              el('div', { class: 'row' }, contactBtns(p.phone, p.email, c.title).concat([got, cancel]))]);
          }))) : null;
          var ambBox = c.ambassadors.length ? el('details', { class: 'fold' }, [el('summary', { text: 'Ambassador pages (' + c.ambassadors.length + ')' })].concat(c.ambassadors.map(function (t) {
            var hide = el('button', { text: t.hidden ? 'Show again' : 'Hide', onclick: function () { flash(hide, api('POST', '/campaigns/' + c.slug + '/ambassadors/' + t.slug, { hidden: !t.hidden })).then(function () { setTimeout(loadCampaigns, 600); }); } });
            return el('div', { class: 'card' }, [el('div', { class: 'row' }, [el('a', { href: '/campaign/' + c.slug + '/' + t.slug, target: '_blank', text: t.name }), el('span', { text: usd(c.teamTotals[t.slug] || 0) + ' of ' + usd(t.goal) }), t.hidden ? el('span', { class: 'pill', text: 'hidden' }) : null]),
              el('div', { class: 'small', text: [t.email, t.phone].filter(Boolean).join(' · ') }), el('div', { class: 'row' }, [hide])]);
          }))) : null;
          sc.appendChild(el('div', { class: 'card' + (c.live ? ' hot' : '') }, [
            el('div', { class: 'row' }, [el('strong', { text: c.title }), el('span', { class: 'pill', text: c.status === 'draft' ? 'draft (hidden)' : c.live ? 'live now' : 'not running' })]),
            el('p', { text: usd(c.raised) + ' raised of ' + usd(c.goal) + (c.raised !== c.given ? ' (with matching; ' + usd(c.given) + ' given)' : '') + (c.pledged ? ' · ' + usd(c.pledged) + ' pledged, not yet received' : '') + ' · ' + c.gifts.length + (c.gifts.length === 1 ? ' gift · ' : ' gifts · ') + day(c.start) + ' to ' + day(c.end) }),
            c.teams.length ? el('div', { class: 'small', text: 'Teams: ' + c.teams.map(function (t) { return t.name + ' ' + usd(c.teamTotals[t.slug] || 0) + (t.goal ? ' of ' + usd(t.goal) : ''); }).join(' · ') }) : null,
            el('div', { class: 'row' }, [btn('/campaign/' + c.slug + (c.status === 'draft' ? '?preview=1' : ''), c.status === 'draft' ? 'Preview the page' : 'Open the page', '', ext),
              el('button', { text: 'Show gifts', onclick: function () { list.hidden = !list.hidden; } }),
              el('button', { text: 'Download CSV', onclick: function () { csv(c.slug + '.csv', [['Date', 'Name', 'Amount', 'Paid over', 'How', 'Team', 'On the wall', 'Dedication', 'Message']].concat(c.gifts.map(function (g) { return [new Date(g.at).toISOString().slice(0, 10), g.name, g.cents / 100, g.count ? g.count + ' ' + (g.interval === 'year' ? 'years' : 'months') : '', HOW[g.how] || g.how, g.team, g.show ? 'yes' : 'no', g.dedication, g.message]; }))); } })]),
            pledgeBox, add, ambBox, list]));
        });
      });
    };
    loadCampaigns();

    // ---- Sign-ups, registrations and orders ----
    var sf = section('Sign-ups, registrations and orders', 'Everything people filled in on the website. New ones come first; any list downloads as a spreadsheet.', 'Sign-ups');
    api('GET', '/site/forms').then(function (x) {
      if (x._status !== 200) { sf.appendChild(el('p', { class: 'small', text: NOT_SET_UP })); return; }
      sf.count(W['sign-ups'](x), true);
      var flat = function (v) { return Array.isArray(v) ? v.map(function (r) { return typeof r === 'object' ? Object.values(r).filter(Boolean).join(' / ') : r; }).join('; ') : v === true ? 'yes' : v === false ? '' : (v == null ? '' : v); };
      var formCard = function (f) {
        var list = el('div');
        var showBtn = el('button', { text: 'Show', onclick: function () { list.textContent = 'Loading…'; api('GET', '/site/forms/' + f.id).then(function (y) { list.textContent = ''; if (!y.items || !y.items.length) list.textContent = 'None yet.';
          (y.items || []).forEach(function (i) { var st = el('span', { class: 'pill', text: word(i.status) });
            var mark = function (status, b) { flash(b, api('POST', '/site/forms/response/' + i.id, { status: status })).then(function (r) { if (r.ok) st.textContent = word(status); }); };
            var doneB = el('button', { text: 'Done', onclick: function () { mark('done', doneB); } }), paidB = el('button', { text: 'Paid', onclick: function () { mark('paid', paidB); } });
            list.appendChild(el('div', { class: 'card' }, [el('div', { class: 'small', text: when(i.created_at) + ' · ' + i.name + ' (' + i.email + ')' + (i.amount_cents ? ' · $' + i.amount_cents / 100 : '') }),
              el('div', { class: 'small', text: f.fields.map(function (fl) { var v = flat(i.data[fl.id]); return v ? fl.label + ': ' + v : ''; }).filter(Boolean).join(' | ') }),
              el('div', { class: 'row' }, [st, doneB, paidB, btn('mailto:' + i.email, 'Email')])])); }); }); } });
        return el('div', { class: 'card' }, [el('strong', { text: f.title }), el('span', { class: 'small', text: ' · ' + (f.total ? f.total + ' so far' : 'none yet') + (f.fresh ? ' · ' + f.fresh + ' new' : '') }),
          f.total ? el('div', { class: 'row' }, [showBtn,
            el('button', { text: 'Download CSV', onclick: function () { api('GET', '/site/forms/' + f.id).then(function (y) { csv(f.id + '.csv', [['When', 'Name', 'Email', 'Amount', 'Status'].concat(f.fields.map(function (fl) { return fl.label; }))].concat(y.items.map(function (i) { return [i.created_at, i.name, i.email, i.amount_cents / 100, i.status].concat(f.fields.map(function (fl) { return flat(i.data[fl.id]); })); }))); }); } })]) : null, list]);
      };
      // Forms with new entries first, then the rest with entries; the empty ones folded away in one line.
      var full = x.forms.filter(function (f) { return f.total; }).sort(function (a, b) { return (b.fresh || 0) - (a.fresh || 0); }), empty = x.forms.filter(function (f) { return !f.total; });
      if (!full.length) sf.appendChild(el('p', { class: 'small', text: 'No sign-ups yet.' }));
      full.forEach(function (f) { sf.appendChild(formCard(f)); });
      if (empty.length) sf.appendChild(el('details', { class: 'fold' }, [el('summary', { text: 'Forms with nothing yet (' + empty.length + ')' })].concat(empty.map(formCard))));
    });

    // ---- What people ask the chat ----
    var sq = section('What people ask the website chat', 'The latest questions (no names). Good ideas for new pages, classes and answers.', 'Chat');
    api('GET', '/site/chat-questions').then(function (x) {
      if (x._status !== 200 || !x.items.length) { sq.appendChild(el('p', { class: 'small', text: 'No questions yet.' })); return; }
      var week = x.items.filter(function (i) { return Date.now() - new Date(i.created_at) < 7 * 864e5; }).length;
      sq.sub(week ? week + ' this week' : '');
      var LANG = { en: 'English', he: 'Hebrew', ru: 'Russian' };
      x.items.slice(0, 100).forEach(function (i) { sq.appendChild(el('div', { class: 'card' }, [el('div', { class: 'small', text: day(i.created_at) + ' · ' + (LANG[i.lang] || i.lang) }), el('div', { text: i.question }), el('div', { class: 'row' }, [el('button', { text: 'Answer publicly', onclick: function () { sa.closest('details').open = true; qq.value = i.question; ql.value = i.lang; qa.focus(); qbox.scrollIntoView(); } })])])); });
    });

    // ---- Ask the Rabbi (public answers) ----
    var sa = section('Ask the Rabbi: publish answers', 'Answer a question for everyone; it becomes a page Google can find. Write it without names.', 'Ask the Rabbi');
    var qq = el('input', { placeholder: 'Question' }), qa = el('textarea', { rows: '6', placeholder: 'Your answer (links like [Shabbat times](/shabbat) work)' }), ql = el('select', {}, [['en', 'English'], ['he', 'Hebrew'], ['ru', 'Russian']].map(function (o) { return el('option', { value: o[0], text: o[1] }); })), qmsg = el('div', { class: 'small' });
    var qPub = el('button', { class: 'on', text: 'Publish', onclick: function () { flash(qPub, api('POST', '/site/qa', { question: qq.value, answer: qa.value, lang: ql.value }), 'Published ✓').then(function (r) { qmsg.textContent = r.ok ? 'Published: ' + r.url : (r.error || ''); if (r.ok) { qq.value = ''; qa.value = ''; } }); } });
    var qbox = el('div', { class: 'card' }, [qq, qa, el('div', { class: 'row' }, [ql, qPub]), qmsg]);
    sa.appendChild(qbox);

    // ---- Check-in at the door: tap each guest as they arrive (big rows for a phone), add walk-ins, see who is here ----
    function checkin(e, box) {
      var q = el('input', { type: 'search', placeholder: 'Find a name' }), head = el('p', { class: 'ck-head' }), rows = el('div'), people = [];
      var draw = function () {
        var here = people.filter(function (p) { return p.arrived_at; }), n = function (l) { return l.reduce(function (a, p) { return a + p.adults + p.kids; }, 0); };
        head.textContent = n(here) + ' of ' + n(people) + ' people here (' + here.length + ' of ' + people.length + ' families)';
        rows.textContent = ''; var words = q.value.toLowerCase();
        people.filter(function (p) { return !words || p.name.toLowerCase().indexOf(words) >= 0; }).forEach(function (p) {
          var row = el('button', { class: 'ck-row' + (p.arrived_at ? ' here' : ''), onclick: function () {
            var yes = !p.arrived_at, before = p.arrived_at; p.arrived_at = yes ? new Date().toISOString() : null; draw();
            api('POST', '/site/rsvps/' + e.slug + '/arrived', { email: p.email, arrived: yes }).then(function (r) { if (r._status !== 200) { p.arrived_at = before; draw(); head.textContent = 'Could not save, try again. ' + head.textContent; } });
          } }, [el('span', { class: 'ck-mark', text: p.arrived_at ? '✓' : '' }), el('span', { class: 'ck-body' }, [el('b', { text: p.name }), el('small', { text: [p.adults + (p.adults === 1 ? ' adult' : ' adults') + (p.kids ? ', ' + p.kids + (p.kids === 1 ? ' child' : ' children') : ''), p.diet && ('Diet: ' + p.diet), p.note, p.brought_by && ('brought by ' + p.brought_by), p.arrived_at && ('arrived ' + new Date(p.arrived_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))].filter(Boolean).join(' · ') })])]);
          rows.appendChild(row);
        });
      };
      var load = function () { api('GET', '/site/rsvps/' + e.slug).then(function (x) { people = (x.list || []).sort(function (a, b) { return a.name.localeCompare(b.name); }); draw(); }); };
      var w = { name: el('input', { placeholder: 'Walk-in name' }), adults: el('input', { type: 'number', min: '0', value: '1', 'aria-label': 'Adults' }), kids: el('input', { type: 'number', min: '0', value: '0', 'aria-label': 'Children' }), phone: el('input', { type: 'tel', placeholder: 'Phone (optional)' }), email: el('input', { type: 'email', placeholder: 'Email (optional)' }) }, wmsg = el('span', { class: 'small warn' });
      var walkBtn = el('button', { class: 'on', text: 'Add and check in', onclick: function () { flash(walkBtn, api('POST', '/site/rsvps/' + e.slug + '/walkin', { name: w.name.value, adults: w.adults.value, kids: w.kids.value, phone: w.phone.value, email: w.email.value }), 'Checked in ✓').then(function (r) { if (r._status === 200) { w.name.value = w.phone.value = w.email.value = ''; w.adults.value = 1; w.kids.value = 0; wmsg.textContent = ''; load(); } else wmsg.textContent = r.error || ''; }); } });
      var walk = el('details', { class: 'card fold' }, [el('summary', { text: '+ Add a walk-in' }), w.name, el('div', { class: 'row' }, ['Adults', w.adults, 'Children', w.kids]), w.phone, w.email, walkBtn, wmsg]);
      q.oninput = draw;
      box.textContent = '';
      box.appendChild(el('div', { class: 'ck' }, [el('strong', { text: 'Check-in: ' + e.title }), head, el('div', { class: 'row' }, [q, el('button', { text: 'Refresh', onclick: load })]), rows, walk]));
      load(); box.scrollIntoView();
    }

    // ---- RSVPs ----
    var s3 = section('RSVPs', '', 'RSVPs');
    api('GET', '/site/rsvps').then(function (r) {
      if (r._status !== 200 || !r.events.length) { s3.appendChild(el('p', { class: 'small', text: 'No upcoming events take RSVPs yet.' })); return; }
      var coming = r.events.reduce(function (a, e) { return a + (e.going || 0); }, 0);
      s3.sub(coming ? coming + ' coming' : '');
      r.events.forEach(function (e) {
        var list = el('div');
        s3.appendChild(el('div', { class: 'card' }, [el('strong', { text: e.title }), e.draft ? el('span', { class: 'pill', text: 'draft: not on the website yet' }) : null, el('div', { class: 'small', text: dayTime(e.start) + ' · ' + e.going + ' coming' + (e.capacity ? ' of ' + e.capacity : '') }),
          el('div', { class: 'row' }, [
            el('button', { text: 'Who is coming', onclick: function () { list.textContent = 'Loading…'; api('GET', '/site/rsvps/' + e.slug).then(function (x) { list.textContent = ''; x.list.forEach(function (p) { list.appendChild(el('div', { class: 'small' }, [p.name + ' · ' + (p.adults + p.kids) + ' (' + p.adults + ' adults, ' + p.kids + ' kids) · ' + p.email + (p.phone ? ' · ' + p.phone : '') + (p.brought_by ? ' · brought by ' + p.brought_by : '') + (p.brought ? ' · brought ' + p.brought + (p.brought === 1 ? ' friend' : ' friends') : '') + (p.note ? ' · “' + p.note + '”' : '') + (p.diet ? ' · Allergies/diet: ' + p.diet : '')])); }); if (!x.list.length) list.textContent = 'No one yet.'; }); } }),
            el('button', { class: 'on', text: 'Check in at the door', onclick: function () { checkin(e, list); } }),
            el('button', { text: 'Who to invite', onclick: function () { list.textContent = 'Loading…'; api('GET', '/site/outreach/event/' + e.slug).then(function (x) { list.textContent = ''; if (!x.items || !x.items.length) { list.textContent = 'No matches yet: as families come to events and read pages, matches appear here.'; return; } x.items.forEach(function (i) { person(i, list); }); }); } }),
            el('button', { text: 'Download CSV', onclick: function () { api('GET', '/site/rsvps/' + e.slug).then(function (x) { csv(e.slug + '.csv', [['Name', 'Email', 'Phone', 'Adults', 'Kids', 'Note', 'Allergies / diet', 'When']].concat(x.list.map(function (p) { return [p.name, p.email, p.phone, p.adults, p.kids, p.note, p.diet || '', p.created_at]; }))); }); } })]), list]));
        // Opened from the desk's "Check in at the door" (?checkin=<event>): start check-in for that event right away.
        if (new URLSearchParams(location.search).get('checkin') === e.slug) { fromLink = true; if (autoOpened) { autoOpened.open = false; autoOpened = null; } s3.closest('details').open = true; checkin(e, list); }
      });
    });

    // ---- What people read and search (reading.js) ----
    var srd = section('What people read and search', 'The most-read pages this month and what people searched for. Searches that found nothing are the writing list.', 'Reading');
    api('GET', '/site/reading').then(function (r) {
      if (r._status !== 200) { srd.appendChild(el('p', { class: 'small', text: NOT_SET_UP })); return; }
      var list = function (title, items, line) { var c = el('div', { class: 'card' }, [el('strong', { text: title })]); if (!items.length) c.appendChild(el('div', { class: 'small', text: 'Nothing yet.' })); items.forEach(function (x) { c.appendChild(line(x)); }); srd.appendChild(c); };
      var bar = function (label, n, max, href) { return el('div', { class: 'rd-row' }, [href ? el('a', { href: href, target: '_blank', rel: 'noopener', text: label }) : el('span', { text: label }), el('i', { style: 'width:' + Math.max(4, Math.round(100 * n / (max || 1))) + '%' }), el('b', { text: String(n) })]); };
      var gmax = r.guides.length ? r.guides[0].n : 1, pmax = r.pages.length ? r.pages[0].n : 1;
      list('Searches that found nothing (last 90 days)', r.missed, function (x) { return el('div', { class: 'rd-row' }, [el('span', { text: '“' + x.q + '”' + (x.lang !== 'en' ? ' (' + { he: 'Hebrew', ru: 'Russian' }[x.lang] + ')' : '') }), el('b', { text: x.n + '×' })]); });
      if (r.missed.length) srd.appendChild(el('p', { class: 'small', text: 'Tell Claude "write guides for the missed searches" and they become new guides.' }));
      list('Most-read guides (last 30 days)', r.guides, function (x) { return bar(x.title, x.n, gmax, x.path); });
      srd.appendChild(el('p', { class: 'small', text: r.unread + ' of ' + r.guidesTotal + ' guides were not opened this month.' }));
      list('Most-visited pages (last 30 days)', r.pages, function (x) { return bar(x.path, x.n, pmax, x.path); });
      list('What people search for (last 30 days)', r.top, function (x) { return el('div', { class: 'rd-row' }, [el('span', { text: x.q }), el('b', { text: x.n + '×' })]); });
      srd.sub(r.missed.length ? r.missed.length + ' to write' : '');
    });

    // ---- Birthdays ----
    var s4 = section('Birthdays & anniversaries (next 30 days)', '', 'Birthdays');
    api('GET', '/site/birthdays?days=30').then(function (b) {
      if (!b.items || !b.items.length) { s4.appendChild(el('p', { class: 'small', text: 'None in the next 30 days.' })); return; }
      s4.sub(b.items.length + ' coming up');
      b.items.forEach(function (i) {
        var what = i.kind === 'anniversary' ? i.years + ' years married' : i.kind === 'birthday' ? 'turns ' + i.age : 'Hebrew birthday (' + i.hebrew + ')';
        s4.appendChild(el('div', { class: 'card' }, [el('strong', { text: day(i.date) + ' · ' + i.name }), el('span', { class: 'small', text: ' ' + what + (i.relation && i.relation !== 'self' ? ' · ' + i.relation + ' of ' + i.family : '') }), el('div', { class: 'small', text: [i.email, i.phone].filter(Boolean).join(' · ') }),
          (i.phone || i.email) ? el('div', { class: 'row' }, contactBtns(i.phone, i.email, 'Mazal Tov!')) : null]));
      });
    });

    // Put the sections and their chips in ORDER (things to act on first, then the tools, then the setup checklist).
    ORDER.forEach(function (id) { var sec = document.getElementById(id); if (sec) app.appendChild(sec); });
    sortChips();

    // Opened from a link on the Rabbi's desk (/admin/community#requests...): open that section and go to it.
    var target = location.hash && document.getElementById(location.hash.slice(1));
    if (target && target.tagName === 'DETAILS') { target.open = true; target.scrollIntoView(); }
  });
})();
