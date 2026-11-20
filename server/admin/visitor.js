'use strict';
// One visitor's visits (opened from the "Someone may need you" and "started but didn't finish" emails): who they are if they left
// their details, the forms they started, and every page they read with how long, newest first.
(function () {
  var app = document.getElementById('app');
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    for (var k in (attrs || {})) { if (k === 'text') n.textContent = attrs[k]; else if (k === 'class') n.className = attrs[k]; else n.setAttribute(k, attrs[k]); }
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  var v = (/[?&]v=([a-z0-9]{16,40})/.exec(location.search) || [])[1];
  app.appendChild(el('p', {}, [el('a', { href: '/admin', text: '‹ Desk' }), ' · ', el('a', { href: '/admin/community#visitors', text: 'All visitors' })]));
  app.appendChild(el('h1', { text: 'A visitor’s visits' }));
  if (!v) { app.appendChild(el('p', { text: 'This link is incomplete.' })); return; }
  fetch('/admin/api/site/visitor/' + v, { credentials: 'same-origin', headers: { 'x-admin': '1' } }).then(function (r) {
    if (r.status === 401) { app.appendChild(el('p', {}, ['Please ', el('a', { href: '/admin', text: 'sign in to the Rabbi’s desk' }), ' first, then open this link again.'])); return null; }
    return r.json();
  }).then(function (x) {
    if (!x) return;
    var who = x.who;
    var card = el('div', { class: 'card' + (who ? '' : '') }, [el('strong', { text: who ? (who.name || who.email) : 'An anonymous visitor' }),
      el('div', { class: 'small', text: [x.device, x.area].filter(Boolean).join(' · ') }),
      who ? el('div', { class: 'small', text: [who.email, who.phone].filter(Boolean).join(' · ') }) : el('div', { class: 'small', text: 'We do not know who this is. If they click one of our emails or fill in a form, their name appears here.' })]);
    if (who) {
      var row = el('div', { class: 'row' });
      if (who.phone) { var tel = who.phone.replace(/[^0-9+]/g, ''); row.appendChild(el('a', { class: 'big', href: 'tel:' + tel, text: 'Call' })); row.appendChild(el('a', { class: 'big quiet', href: 'sms:' + tel, text: 'Text' })); row.appendChild(el('a', { class: 'big quiet', href: 'https://wa.me/' + tel.replace(/^\+?/, '').replace(/^(\d{10})$/, '1$1'), text: 'WhatsApp' })); }
      if (who.email) row.appendChild(el('a', { class: 'big quiet', href: 'mailto:' + who.email, text: 'Email' }));
      card.appendChild(row);
    }
    app.appendChild(card);
    if (x.drafts.length) {
      app.appendChild(el('h2', { class: 'group-h', text: 'Forms they started' }));
      x.drafts.forEach(function (d) { app.appendChild(el('div', { class: 'card' + (d.finished ? '' : ' hot') }, [el('strong', { text: d.title + (d.amount ? ' (' + d.amount + ')' : '') }), el('div', { class: 'small', text: d.when + ' · ' + (d.finished ? 'sent' : 'not sent') })])); });
    }
    app.appendChild(el('h2', { class: 'group-h', text: 'What they read' }));
    if (!x.hits.length && !x.older.length) app.appendChild(el('p', { class: 'small', text: 'No pages recorded.' }));
    var day = '', box = null;
    x.hits.forEach(function (h) {
      if (h.day !== day) { day = h.day; box = el('div', { class: 'card' }, [el('strong', { text: h.when.replace(/,? \d+:\d+ [AP]M$/, '') })]); app.appendChild(box); }
      box.appendChild(el('div', { class: 'small' }, [h.when.replace(/^.*, /, '') + '  ', el('a', { href: h.path, target: '_blank', rel: 'noopener', text: h.title }), ' · ' + h.time + (h.interest ? ' · ' + h.interest : '') + (h.source ? ' · came from ' + h.source : '')]));
    });
    if (x.older.length && !x.hits.length) {
      var o = el('div', { class: 'card' }, [el('strong', { text: 'Earlier pages' })]);
      x.older.forEach(function (p) { o.appendChild(el('div', { class: 'small', text: p.day + '  ' + p.path })); });
      app.appendChild(o);
    }
    app.appendChild(el('p', { class: 'small', text: 'Private: please handle with care.' }));
  });
})();
