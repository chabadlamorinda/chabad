// Rabbi area, website page: RSVP lists per event (with CSV), upcoming birthdays / Hebrew birthdays /
// anniversaries for members and their families, and "Post to Facebook" for each event.
(function () {
  'use strict';
  var app = document.getElementById('app');
  function el(t, a, kids) { var n = document.createElement(t); for (var k in a || {}) { if (k === 'text') n.textContent = a[k]; else if (k === 'onclick') n.onclick = a[k]; else n.setAttribute(k, a[k]); } (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }); return n; }
  function api(m, p) { return fetch('/admin/api' + p, { method: m, credentials: 'same-origin', headers: { 'x-admin': '1', 'content-type': 'application/json' } }).then(function (r) { return r.json().then(function (j) { j._status = r.status; return j; }); }); }
  var cell = function (v) { var s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  function csv(name, rows) { var b = new Blob([rows.map(function (r) { return r.map(cell).join(','); }).join('\r\n')], { type: 'text/csv' }); var a = el('a', { href: URL.createObjectURL(b), download: name }); a.click(); }

  api('GET', '/site/rsvps').then(function (r) {
    if (r._status === 401) { location.href = '/admin/'; return; }
    app.appendChild(el('h1', { text: 'Website community' }));
    app.appendChild(el('p', {}, [el('a', { href: '/admin/', text: '← Rabbi’s desk' })]));
    app.appendChild(el('h2', { text: 'RSVPs' }));
    if (!r.events.length) app.appendChild(el('p', { class: 'small', text: 'No upcoming events take RSVPs yet.' }));
    r.events.forEach(function (e) {
      var list = el('div'), msg = el('span', { class: 'small' });
      var card = el('div', { class: 'card' }, [el('strong', { text: e.title }), el('div', { class: 'small', text: e.start.replace('T', ' ') + ' · ' + e.going + ' coming' + (e.capacity ? ' of ' + e.capacity : '') }),
        el('div', { class: 'row' }, [
          el('button', { text: 'Who is coming', onclick: function () { api('GET', '/site/rsvps/' + e.slug).then(function (x) { list.textContent = ''; x.list.forEach(function (p) { list.appendChild(el('div', { class: 'small', text: p.name + ' · ' + (p.adults + p.kids) + ' (' + p.adults + ' adults, ' + p.kids + ' kids) · ' + p.email + (p.phone ? ' · ' + p.phone : '') + (p.note ? ' · “' + p.note + '”' : '') })); }); if (!x.list.length) list.textContent = 'No one yet.'; }); } }),
          el('button', { text: 'Download CSV', onclick: function () { api('GET', '/site/rsvps/' + e.slug).then(function (x) { csv(e.slug + '.csv', [['Name', 'Email', 'Phone', 'Adults', 'Kids', 'Note', 'When']].concat(x.list.map(function (p) { return [p.name, p.email, p.phone, p.adults, p.kids, p.note, p.created_at]; }))); }); } }),
          el('button', { text: 'Post to Facebook', onclick: function () { if (!confirm('Post "' + e.title + '" to the Facebook page?')) return; api('POST', '/site/facebook/' + e.slug).then(function (x) { msg.textContent = x.ok ? ' Posted.' : ' ' + x.error; }); } }), msg]), list]);
      app.appendChild(card);
    });
    app.appendChild(el('h2', { text: 'Birthdays & anniversaries (next 30 days)' }));
    var bl = el('div'); app.appendChild(bl);
    api('GET', '/site/birthdays?days=30').then(function (b) {
      if (!b.items || !b.items.length) { bl.appendChild(el('p', { class: 'small', text: 'None in the next 30 days.' })); return; }
      b.items.forEach(function (i) {
        var what = i.kind === 'anniversary' ? i.years + ' years married' : i.kind === 'birthday' ? 'turns ' + i.age : 'Hebrew birthday (' + i.hebrew + ')';
        bl.appendChild(el('div', { class: 'card' }, [el('strong', { text: i.date + ' · ' + i.name }), el('span', { class: 'small', text: ' ' + what + (i.relation && i.relation !== 'self' ? ' · ' + i.relation + ' of ' + i.family : '') }), el('div', { class: 'small', text: [i.email, i.phone].filter(Boolean).join(' · ') })]));
      });
    });
  });
})();
