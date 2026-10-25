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

    // ---- RSVPs ----
    var s3 = section('RSVPs');
    api('GET', '/site/rsvps').then(function (r) {
      if (r._status !== 200 || !r.events.length) { s3.appendChild(el('p', { class: 'small', text: 'No upcoming events take RSVPs yet.' })); return; }
      r.events.forEach(function (e) {
        var list = el('div');
        s3.appendChild(el('div', { class: 'card' }, [el('strong', { text: e.title }), el('div', { class: 'small', text: e.start.replace('T', ' ') + ' · ' + e.going + ' coming' + (e.capacity ? ' of ' + e.capacity : '') }),
          el('div', { class: 'row' }, [
            el('button', { text: 'Who is coming', onclick: function () { api('GET', '/site/rsvps/' + e.slug).then(function (x) { list.textContent = ''; x.list.forEach(function (p) { list.appendChild(el('div', { class: 'small', text: p.name + ' · ' + (p.adults + p.kids) + ' (' + p.adults + ' adults, ' + p.kids + ' kids) · ' + p.email + (p.phone ? ' · ' + p.phone : '') + (p.note ? ' · “' + p.note + '”' : '') })); }); if (!x.list.length) list.textContent = 'No one yet.'; }); } }),
            el('button', { text: 'Download CSV', onclick: function () { api('GET', '/site/rsvps/' + e.slug).then(function (x) { csv(e.slug + '.csv', [['Name', 'Email', 'Phone', 'Adults', 'Kids', 'Note', 'When']].concat(x.list.map(function (p) { return [p.name, p.email, p.phone, p.adults, p.kids, p.note, p.created_at]; }))); }); } })]), list]));
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
