// Rabbi area, website page:
//  * Social drafts: every upcoming event as a ready post. Edit the text if you like, then Publish to Facebook
//    (and Instagram) with one button. Also the Google Business post text and a Facebook Event helper.
//  * Waiting for approval: Mazal Tovs, announcements, shiva notices, ideas and resources sent in by the community.
//  * RSVP lists per event (with CSV) and upcoming birthdays / Hebrew birthdays / anniversaries.
(function () {
  'use strict';
  var app = document.getElementById('app');
  function el(t, a, kids) { var n = document.createElement(t); for (var k in a || {}) { if (k === 'text') n.textContent = a[k]; else if (k === 'onclick') n.onclick = a[k]; else n.setAttribute(k, a[k]); } (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }); return n; }
  function api(m, p, body) { return fetch('/admin/api' + p, { method: m, credentials: 'same-origin', headers: { 'x-admin': '1', 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j._status = r.status; return j; }); }); }
  var cell = function (v) { var s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  function csv(name, rows) { var b = new Blob([rows.map(function (r) { return r.map(cell).join(','); }).join('\r\n')], { type: 'text/csv' }); var a = el('a', { href: URL.createObjectURL(b), download: name }); a.click(); }
  function copy(text, btn) { (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { var t = btn.textContent; btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = t; }, 1500); }, function () { prompt('Copy this:', text); }); }
  function section(title, note) { var s = el('section'); s.appendChild(el('h2', { text: title })); if (note) s.appendChild(el('p', { class: 'small', text: note })); app.appendChild(s); return s; }

  api('GET', '/site/social').then(function (soc) {
    if (soc._status === 401) { location.href = '/admin/'; return; }
    app.appendChild(el('h1', { text: 'Website community' }));
    app.appendChild(el('p', {}, [el('a', { href: '/admin/', text: '← Rabbi’s desk' })]));

    // ---- People to reach out to ----
    var so = section('People to reach out to', 'Who to call or message this week, and why. Each message is ready and personal: tap WhatsApp (or text, email, call), adjust it if you like, send. Press Done to clear it.');
    var person = function (i, box) {
      var text = el('textarea', { rows: '4' }); text.value = i.text;
      var open = function (kind) { return function () { var t = encodeURIComponent(text.value), url = i[kind]; if (!url) return; url = url.replace(/([?&](text|body)=)[^&]*/, '$1' + t); window.open(url, '_blank'); }; };
      var card = el('div', { class: 'card' + (i.priority === 1 ? ' hot' : '') }, [el('strong', { text: i.name }), el('span', { class: 'pill', text: (i.kind || 'invite').replace('-', ' ') }), i.lang && i.lang !== 'en' ? el('span', { class: 'pill', text: i.lang === 'he' ? 'Hebrew' : 'Russian' }) : null,
        el('div', { class: 'small', text: i.reason || (i.reasons || []).join('; ') }), text,
        el('div', { class: 'row' }, [i.whatsapp ? el('button', { class: 'on wa', text: 'WhatsApp', onclick: open('whatsapp') }) : el('span', { class: 'small', text: 'No mobile number on file' }), i.sms ? el('button', { text: 'Text', onclick: open('sms') }) : null, i.email ? el('button', { text: 'Email', onclick: open('email') }) : null, i.call ? el('a', { href: i.call }, [el('button', { text: 'Call ' + i.phone })]) : null,
          el('button', { text: 'Done', onclick: function () { api('POST', '/site/outreach/done', { memberId: i.memberId, key: i.key || ('invite:' + i.event) }).then(function () { card.remove(); }); } })])]);
      box.appendChild(card);
    };
    api('GET', '/site/outreach').then(function (o) {
      if (o._status !== 200) { so.appendChild(el('p', { class: 'small', text: 'Not available yet (the database is not connected).' })); return; }
      if (!o.items.length) { so.appendChild(el('p', { class: 'small', text: 'Nothing for now. As families sign in, save dates and come to events, suggestions appear here.' })); return; }
      o.items.forEach(function (i) { person(i, so); });
    });

    // ---- Social drafts ----
    var s1 = section('Social drafts', soc.facebook ? 'Every upcoming event is ready to post. Edit the text if you like, then press Publish.' : 'Facebook is not connected yet: add FB_PAGE_ID and FB_PAGE_TOKEN in Render (see store/website-setup.md). You can still copy the text below.');
    if (!soc.items.length) s1.appendChild(el('p', { class: 'small', text: 'No upcoming events.' }));
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
          if (r._status !== 200) { msg.textContent = r.error || 'Could not publish.'; return; }
          msg.textContent = Object.keys(r.results).map(function (n) { var x = r.results[n]; return n + ': ' + (x.ok ? 'published' : x.error); }).join(' · ');
        });
      } });
      var status = [fbDone ? 'On Facebook since ' + new Date(fbDone.at).toLocaleDateString() : 'Not yet on Facebook', soc.instagram ? (igDone ? 'on Instagram' : 'not yet on Instagram') : ''].filter(Boolean).join(' · ');
      var copyBtn = el('button', { text: 'Copy post text', onclick: function () { copy(text.value, copyBtn); } });
      var gBtn = el('button', { text: 'Copy Google Business post', onclick: function () { copy(e.google, gBtn); } });
      var fbEv = el('button', { text: 'Copy & open Facebook Events', onclick: function () { copy(e.title + '\n' + e.when + '\n\n' + text.value, fbEv); window.open('https://www.facebook.com/events/create/', '_blank', 'noopener'); } });
      s1.appendChild(el('div', { class: 'card' }, [
        el('strong', { text: e.title }), el('div', { class: 'small', text: e.when + ' · ' + status }),
        e.image ? el('img', { src: e.image, alt: '', style: 'max-width:200px;border-radius:8px;margin:8px 0;display:block' }) : el('div', { class: 'small', text: 'Tip: add an image or flyer to the event for a bigger, more eye-catching post (Instagram needs one).' }),
        text,
        el('div', { class: 'row' }, [el('label', {}, [fbBox, ' Facebook']), soc.instagram ? el('label', {}, [igBox, ' Instagram']) : null, pub, copyBtn, gBtn, fbEv, el('a', { href: e.googleCalendar, target: '_blank', rel: 'noopener', text: 'Google Calendar' }), el('a', { href: e.url, target: '_blank', rel: 'noopener', text: 'View page' })]), msg]));
    });

    // ---- Weekly email ----
    var sw = section('Weekly email', 'Written automatically from the website: Shabbat times, the Torah portion, upcoming events, the next holiday and a guide. Add a personal note, check it, and send.');
    var note = el('textarea', { rows: '3', placeholder: 'A personal note at the top (optional)' }), prev = el('pre', { style: 'white-space:pre-wrap;font:14px/1.5 system-ui;background:#fff;border:1px solid #ddd;border-radius:8px;padding:12px' }), info = el('div', { class: 'small' });
    var load = function () { api('GET', '/site/weekly?note=' + encodeURIComponent(note.value)).then(function (m) { if (m._status !== 200) { info.textContent = m.error || 'Needs the database.'; return; } prev.textContent = 'Subject: ' + m.subject + '\n\n' + m.text; info.textContent = m.recipients + ' people will receive it.' + (m.email ? '' : ' Email is not set up yet (SMTP_URL).'); }); };
    var sendBtn = el('button', { class: 'on', text: 'Send to everyone', onclick: function () { if (!confirm('Send the weekly email now?')) return; sendBtn.disabled = true; fetch('/admin/api/site/weekly/send', { method: 'POST', credentials: 'same-origin', headers: { 'x-admin': '1', 'content-type': 'application/json' }, body: JSON.stringify({ confirm: true, note: note.value }) }).then(function (r) { return r.json(); }).then(function (r) { sendBtn.disabled = false; info.textContent = r.ok ? 'Sent to ' + r.sent + ' of ' + r.total + '.' : r.error; }); } });
    sw.appendChild(el('div', { class: 'card' }, [note, el('div', { class: 'row' }, [el('button', { text: 'Preview', onclick: load }), sendBtn]), info, prev]));
    load();
    // The same week as a WhatsApp message for the community groups (pick the language, copy or open WhatsApp).
    var waText = el('textarea', { rows: '12' }), waLang = el('select', {}, [['en', 'English'], ['he', 'Hebrew'], ['ru', 'Russian']].map(function (o) { return el('option', { value: o[0], text: o[1] }); }));
    var waLoad = function () { api('GET', '/site/weekly/whatsapp?lang=' + waLang.value).then(function (m) { waText.value = m.text || ''; }); };
    waLang.onchange = waLoad;
    var waCopy = el('button', { text: 'Copy', onclick: function () { copy(waText.value, waCopy); } });
    sw.appendChild(el('div', { class: 'card' }, [el('strong', { text: 'This week as a WhatsApp message' }), el('div', { class: 'small', text: 'For your WhatsApp groups and status. Open WhatsApp, choose the group, send.' }), waText, el('div', { class: 'row' }, [waLang, waCopy, el('button', { class: 'on wa', text: 'Open WhatsApp', onclick: function () { window.open('https://wa.me/?text=' + encodeURIComponent(waText.value), '_blank'); } })])]));
    waLoad();

    // ---- Submissions ----
    var s2 = section('Waiting for approval', 'Sent in by the community. Approved Mazal Tovs, announcements and shiva notices appear on the community board and home page.');
    api('GET', '/site/submissions').then(function (x) {
      if (x._status !== 200) { s2.appendChild(el('p', { class: 'small', text: 'Needs the database (DATABASE_URL).' })); return; }
      if (!x.items.length) s2.appendChild(el('p', { class: 'small', text: 'Nothing new.' }));
      x.items.forEach(function (i) {
        var st = el('span', { class: 'pill', text: i.status });
        var set = function (status) { api('POST', '/site/submissions/' + i.id, { status: status }).then(function (r) { if (r.ok) st.textContent = status; }); };
        s2.appendChild(el('div', { class: 'card' }, [el('div', { class: 'small', text: (x.kinds[i.kind] ? x.kinds[i.kind].label : i.kind) + ' · from ' + i.name + ' <' + i.email + '> · ' + new Date(i.created_at).toLocaleDateString() }), el('strong', { text: i.title }), el('div', { text: i.body }), i.link ? el('a', { href: i.link, target: '_blank', rel: 'noopener', text: i.link }) : null,
          el('div', { class: 'row' }, [st, el('button', { text: 'Approve', onclick: function () { set('approved'); } }), el('button', { text: 'Decline', onclick: function () { set('declined'); } }), el('a', { href: 'mailto:' + i.email + '?subject=' + encodeURIComponent('Re: ' + i.title), text: 'Reply' })])]));
      });
    });

    // ---- Sign-ups, registrations and orders ----
    var sf = section('Sign-ups, registrations and orders', 'Everything people filled in on the website. New ones are marked; download any list as a spreadsheet.');
    api('GET', '/site/forms').then(function (x) {
      if (x._status !== 200) { sf.appendChild(el('p', { class: 'small', text: 'Needs the database (DATABASE_URL).' })); return; }
      x.forms.forEach(function (f) {
        var list = el('div');
        var flat = function (v) { return Array.isArray(v) ? v.map(function (r) { return typeof r === 'object' ? Object.values(r).filter(Boolean).join(' / ') : r; }).join('; ') : v === true ? 'yes' : v === false ? '' : (v == null ? '' : v); };
        sf.appendChild(el('div', { class: 'card' }, [el('strong', { text: f.title }), el('span', { class: 'small', text: ' · ' + f.total + ' total' + (f.fresh ? ' · ' + f.fresh + ' new' : '') }),
          el('div', { class: 'row' }, [
            el('button', { text: 'Show', onclick: function () { api('GET', '/site/forms/' + f.id).then(function (y) { list.textContent = ''; if (!y.items.length) list.textContent = 'None yet.';
              y.items.forEach(function (i) { var st = el('span', { class: 'pill', text: i.status });
                list.appendChild(el('div', { class: 'card' }, [el('div', { class: 'small', text: new Date(i.created_at).toLocaleString() + ' · ' + i.name + ' <' + i.email + '>' + (i.amount_cents ? ' · $' + i.amount_cents / 100 : '') }),
                  el('div', { class: 'small', text: f.fields.map(function (fl) { var v = flat(i.data[fl.id]); return v ? fl.label + ': ' + v : ''; }).filter(Boolean).join(' | ') }),
                  el('div', { class: 'row' }, [st, el('button', { text: 'Done', onclick: function () { api('POST', '/site/forms/response/' + i.id, { status: 'done' }).then(function (r) { if (r.ok) st.textContent = 'done'; }); } }), el('button', { text: 'Paid', onclick: function () { api('POST', '/site/forms/response/' + i.id, { status: 'paid' }).then(function (r) { if (r.ok) st.textContent = 'paid'; }); } }), el('a', { href: 'mailto:' + i.email, text: 'Email' })])])); }); }); } }),
            el('button', { text: 'Who to invite', onclick: function () { api('GET', '/site/outreach/event/' + e.slug).then(function (x) { list.textContent = ''; if (!x.items || !x.items.length) { list.textContent = 'No matches yet: as families come to events and read pages, matches appear here.'; return; } x.items.forEach(function (i) { person(i, list); }); }); } }),
            el('button', { text: 'Download CSV', onclick: function () { api('GET', '/site/forms/' + f.id).then(function (y) { csv(f.id + '.csv', [['When', 'Name', 'Email', 'Amount', 'Status'].concat(f.fields.map(function (fl) { return fl.label; }))].concat(y.items.map(function (i) { return [i.created_at, i.name, i.email, i.amount_cents / 100, i.status].concat(f.fields.map(function (fl) { return flat(i.data[fl.id]); })); }))); }); } })]), list]));
      });
    });

    // ---- What people ask the chat ----
    var sq = section('What people ask the website chat', 'The latest questions (no names). Great ideas for new pages, classes and answers.');
    api('GET', '/site/chat-questions').then(function (x) {
      if (x._status !== 200 || !x.items.length) { sq.appendChild(el('p', { class: 'small', text: 'No questions yet.' })); return; }
      var ul = el('ul'); x.items.slice(0, 100).forEach(function (i) { ul.appendChild(el('li', { class: 'small' }, [new Date(i.created_at).toLocaleDateString() + ' (' + i.lang + '): ' + i.question + ' ', el('button', { text: 'Answer publicly', onclick: function () { qq.value = i.question; ql.value = i.lang; qa.focus(); qbox.scrollIntoView(); } })])); }); sq.appendChild(ul);
    });

    // ---- Ask the Rabbi (public answers) ----
    var sa = section('Ask the Rabbi: publish answers', 'Answer a question for everyone. It becomes a page Google and AI assistants can find. Write the question the way it should appear, without names.');
    var qq = el('input', { placeholder: 'Question' }), qa = el('textarea', { rows: '6', placeholder: 'Your answer (links like [Shabbat times](/shabbat) work)' }), ql = el('select', {}, [['en', 'English'], ['he', 'Hebrew'], ['ru', 'Russian']].map(function (o) { return el('option', { value: o[0], text: o[1] }); })), qmsg = el('div', { class: 'small' });
    var qbox = el('div', { class: 'card' }, [qq, qa, el('div', { class: 'row' }, [ql, el('button', { class: 'on', text: 'Publish', onclick: function () { fetch('/admin/api/site/qa', { method: 'POST', credentials: 'same-origin', headers: { 'x-admin': '1', 'content-type': 'application/json' }, body: JSON.stringify({ question: qq.value, answer: qa.value, lang: ql.value }) }).then(function (r) { return r.json(); }).then(function (r) { qmsg.textContent = r.ok ? 'Published: ' + r.url : r.error; if (r.ok) { qq.value = ''; qa.value = ''; } }); } })]), qmsg]);
    sa.appendChild(qbox);

    // ---- RSVPs ----
    var s3 = section('RSVPs');
    api('GET', '/site/rsvps').then(function (r) {
      if (r._status !== 200 || !r.events.length) { s3.appendChild(el('p', { class: 'small', text: 'No upcoming events take RSVPs yet.' })); return; }
      r.events.forEach(function (e) {
        var list = el('div');
        s3.appendChild(el('div', { class: 'card' }, [el('strong', { text: e.title }), el('div', { class: 'small', text: e.start.replace('T', ' ') + ' · ' + e.going + ' coming' + (e.capacity ? ' of ' + e.capacity : '') }),
          el('div', { class: 'row' }, [
            el('button', { text: 'Who is coming', onclick: function () { api('GET', '/site/rsvps/' + e.slug).then(function (x) { list.textContent = ''; x.list.forEach(function (p) { list.appendChild(el('div', { class: 'small', text: p.name + ' · ' + (p.adults + p.kids) + ' (' + p.adults + ' adults, ' + p.kids + ' kids) · ' + p.email + (p.phone ? ' · ' + p.phone : '') + (p.note ? ' · “' + p.note + '”' : '') + (p.diet ? ' · Allergies/diet: ' + p.diet : '') })); }); if (!x.list.length) list.textContent = 'No one yet.'; }); } }),
            el('button', { text: 'Download CSV', onclick: function () { api('GET', '/site/rsvps/' + e.slug).then(function (x) { csv(e.slug + '.csv', [['Name', 'Email', 'Phone', 'Adults', 'Kids', 'Note', 'Allergies / diet', 'When']].concat(x.list.map(function (p) { return [p.name, p.email, p.phone, p.adults, p.kids, p.note, p.diet || '', p.created_at]; }))); }); } })]), list]));
      });
    });

    // ---- Birthdays ----
    var s4 = section('Birthdays & anniversaries (next 30 days)');
    api('GET', '/site/birthdays?days=30').then(function (b) {
      if (!b.items || !b.items.length) { s4.appendChild(el('p', { class: 'small', text: 'None in the next 30 days.' })); return; }
      b.items.forEach(function (i) {
        var what = i.kind === 'anniversary' ? i.years + ' years married' : i.kind === 'birthday' ? 'turns ' + i.age : 'Hebrew birthday (' + i.hebrew + ')';
        s4.appendChild(el('div', { class: 'card' }, [el('strong', { text: i.date + ' · ' + i.name }), el('span', { class: 'small', text: ' ' + what + (i.relation && i.relation !== 'self' ? ' · ' + i.relation + ' of ' + i.family : '') }), el('div', { class: 'small', text: [i.email, i.phone].filter(Boolean).join(' · ') })]));
      });
    });
  });
})();
