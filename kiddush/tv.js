// TV display for the Kiddush board. Open /kiddush/tv/ in the TV's browser and press F11 (full screen).
// It refreshes itself every minute and keeps showing the last board if the connection drops.
'use strict';
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var KEY = 'kiddush-tv-last', board = null, lastOk = Date.now();
  var MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  // Shrink text that does not fit its box (long names).
  function fit(node, min) {
    var fs = parseFloat(getComputedStyle(node).fontSize), lo = fs * (min || .55), guard = 0;
    while (node.scrollWidth > node.clientWidth + 1 && fs > lo && guard++ < 30) { fs *= .93; node.style.fontSize = fs + 'px'; }
  }
  var shortTitle = function (t) { return t.replace('Shabbos Chol Hamoed', 'Shabbos Chol Hamoed'); };

  function tile(s, isCurrent) {
    var t = el('div', 'tile ' + s.status + (s.past ? ' past' : '') + (isCurrent ? ' current' : ''));
    t.appendChild(el('div', 'n', shortTitle(s.title)));
    t.appendChild(el('div', 'd', s.dateLabel.toUpperCase().replace(/^(\w{3})/, function (m) { return m; }) + ' – ' + s.heb.toUpperCase()));
    if (s.sponsor) t.appendChild(el('div', 's', s.sponsor.name));
    return t;
  }

  function qrSvg(text) {
    try { var q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }); } catch (e) { return ''; }
  }

  function renderPlate(b) {
    var s = b.slots.filter(function (x) { return x.key === b.current; })[0], box = $('plateIn');
    box.textContent = '';
    if (!s) { box.appendChild(el('div', 'loading', 'See you at the next Kiddush')); return; }
    var days = Math.round((new Date(s.date + 'T12:00:00') - new Date(b.today + 'T12:00:00')) / 864e5);
    var main = el('div', 'p-main');
    main.appendChild(el('div', 'p-lbl', days <= 7 ? (s.kind === 'shabbat' ? 'THIS WEEK’S KIDDUSH' : 'THIS KIDDUSH') : 'NEXT KIDDUSH'));
    main.appendChild(el('div', 'p-name', s.title));
    var dt = new Date(s.date + 'T12:00:00'), d = el('div', 'p-date');
    d.appendChild(document.createTextNode(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Shabbos'][dt.getDay()] + ', ' + s.dateLabel + '  ·  ' + s.heb + '  '));
    main.appendChild(d);
    main.appendChild(el('div', 'p-rule'));
    if (s.sponsor) {
      main.appendChild(el('div', 'p-by', 'SPONSORED BY'));
      main.appendChild(el('div', 'p-sp', s.sponsor.name));
      if (s.sponsor.dedication) main.appendChild(el('div', 'p-ded', s.sponsor.dedication));
    } else {
      main.appendChild(el('div', 'p-open', 'OPEN FOR SPONSORSHIP'));
      main.appendChild(el('div', 'p-price', 'Sponsor this Kiddush · $' + (s.priceCents / 100)));
    }
    box.appendChild(main);
    var base = (b.settings.publicUrl || location.origin).replace(/\/+$/, '');
    var url = base + '/kiddush/' + (s.sponsor ? '' : '?w=' + encodeURIComponent(s.key));
    var qr = el('div', 'p-qr'), q = el('div', 'qr'); q.innerHTML = qrSvg(url); qr.appendChild(q);
    qr.appendChild(el('div', 'q1', s.sponsor ? 'SPONSOR A FUTURE KIDDUSH' : 'SCAN TO SPONSOR'));
    qr.appendChild(el('div', 'q2', base.replace(/^https?:\/\//, '') + '/kiddush'));
    box.appendChild(qr);
    ['p-name', 'p-sp'].forEach(function (c) { var n = box.querySelector('.' + c); if (n) fit(n, .5); });
    var ded = box.querySelector('.p-ded'); if (ded) { var g = 0; while (ded.scrollHeight > ded.clientHeight + 1 && ded.scrollHeight > parseFloat(getComputedStyle(ded).fontSize) * 2.4 && g++ < 12) ded.style.fontSize = parseFloat(getComputedStyle(ded).fontSize) * .92 + 'px'; }
  }

  function layout(b) {
    var slots = b.slots, rows = Math.max(1, Math.ceil(slots.length / 4));
    document.documentElement.style.setProperty('--rows', rows);
    for (var c = 0; c < 4; c++) {
      var col = $('c' + c); col.textContent = '';
      for (var r = 0; r < rows; r++) {
        var s = slots[c * rows + r];
        col.appendChild(s ? tile(s, s.key === b.current) : el('div', 'tile empty'));
      }
    }
    sizeRows(rows);
    Array.prototype.forEach.call(document.querySelectorAll('.tile .n'), function (n) { fit(n, .6); });
    Array.prototype.forEach.call(document.querySelectorAll('.tile .d'), function (n) { fit(n, .6); });
    Array.prototype.forEach.call(document.querySelectorAll('.tile .s'), function (n) { fit(n, .5); });
  }
  function sizeRows(rows) {
    var col = $('c0'), h = col.clientHeight, gap = parseFloat(getComputedStyle(col).rowGap) || 0;
    document.documentElement.style.setProperty('--rh', Math.max(20, (h - gap * (rows - 1)) / rows) + 'px');
  }

  function render(b) {
    board = b;
    $('yearNum').textContent = b.year; $('yearHe').textContent = b.yearHe;
    var s = b.settings;
    $('blessing').textContent = s.blessing || '';
    $('donor').hidden = !(s.donorEn || s.donorHe);
    $('donorHe').textContent = s.donorHe || ''; $('donorEn').textContent = s.donorEn || '';
    layout(b); renderPlate(b);
    fit(document.querySelector('.title'), .6);
  }

  function load() {
    fetch('/api/kiddush/board', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('bad'); return r.json(); }).then(function (b) {
      lastOk = Date.now(); $('offline').hidden = true;
      var sig = JSON.stringify(b); if (!board || sig !== board.__sig) { b.__sig = sig; render(b); }
      try { localStorage.setItem(KEY, JSON.stringify(b)); } catch (e) { /* private mode */ }
    }).catch(function () { if (Date.now() - lastOk > 5 * 60e3) $('offline').hidden = false; });
  }

  var rs; window.addEventListener('resize', function () { clearTimeout(rs); rs = setTimeout(function () { if (board) render(board); }, 200); });
  var cached = null; try { cached = JSON.parse(localStorage.getItem(KEY)); } catch (e) { /* none */ }
  if (cached && cached.slots) render(cached);
  load(); setInterval(load, 60e3);
  setTimeout(function () { location.reload(); }, 12 * 3600e3); // pick up new versions of this page
  if (navigator.wakeLock) { var wl = function () { navigator.wakeLock.request('screen').catch(function () {}); }; wl(); document.addEventListener('visibilitychange', function () { if (!document.hidden) wl(); }); }
})();
