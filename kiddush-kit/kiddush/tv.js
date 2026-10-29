// TV display for the Kiddush board. Open /kiddush/tv/ in the TV's browser and press F11 (full screen).
// It refreshes itself every minute and keeps showing the last board if the connection drops.
'use strict';
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var KEY = 'kiddush-tv-last', board = null, lastOk = Date.now();
  var LIGHT = !/[?&]theme=dark\b/.test(location.search); // light look (matches the sponsor page) is the default; add ?theme=dark for the wood board
  if (LIGHT) document.documentElement.classList.add('light');
  var T = KI.t; KI.apply();

  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  // Shrink text that does not fit its box (long names).
  function fit(node, min) {
    var fs = parseFloat(getComputedStyle(node).fontSize), lo = fs * (min || .55), guard = 0;
    while (node.scrollWidth > node.clientWidth + 1 && fs > lo && guard++ < 30) { fs *= .93; node.style.fontSize = fs + 'px'; }
  }
  var shortTitle = function (t) { return t.replace('Shabbos Chol Hamoed', 'Shabbos Chol Hamoed'); };

  var sponsorsOf = function (s) { return s.sponsors || (s.sponsor ? [s.sponsor] : []); };
  var names = function (list) { return list.map(KI.name).join(' & '); };
  var reasons = function (list) { return list.map(KI.reason).filter(Boolean).join(' · '); };

  function tile(s, isCurrent) {
    var t = el('div', 'tile ' + s.status + (s.past ? ' past' : '') + (isCurrent ? ' current' : '')), sl = sponsorsOf(s), title = KI.title(s);
    var dateLine = KI.dateLabel(s) + ' · ' + KI.hebDate(s);
    if (LIGHT) {
      var dt = new Date(s.date + 'T12:00:00'), dd = el('div', 'tdate'); dd.appendChild(el('b', '', String(dt.getDate()))); dd.appendChild(el('span', '', KI.dowShort(s.date)));
      var body = el('div', 'tbody'); body.appendChild(el('div', 'tt', title));
      body.appendChild(el('div', 'td', s.past ? reasons(sl) : dateLine)); // past weeks: the reason (small) takes the date's place
      if (sl.length) body.appendChild(el('div', 'ts', names(sl)));
      t.appendChild(dd); t.appendChild(body); return t;
    }
    var n;
    if (s.past) n = el('div', 'n', title);
    else if ((title + ' – ' + dateLine).length > 34) { t.className += ' two'; n = el('div', 'n'); n.appendChild(el('div', '', title)); n.appendChild(el('div', '', dateLine)); } // long names: two lines
    else n = el('div', 'n', title + ' – ' + dateLine);
    t.appendChild(n);
    if (sl.length) t.appendChild(el('div', 's', names(sl)));
    if (s.past && reasons(sl)) t.appendChild(el('div', 'r', reasons(sl)));
    return t;
  }

  // The address on the QR code and under it. "shareUrl" (a full address such as https://www.example.org/kiddush, set in Staff > Settings)
  // wins; otherwise the server's own address is used and the QR opens the shown week directly.
  function shareAddress(S) {
    var share = (S.shareUrl || '').replace(/\/+$/, ''), base = (S.publicUrl || location.origin).replace(/\/+$/, '');
    if (share) return { url: share, base: base, label: share.replace(/^https?:\/\//, '') };
    return { url: '', base: base, label: base.replace(/^https?:\/\//, '') + '/kiddush' };
  }
  function qrSvg(text) {
    try { var q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }); } catch (e) { return ''; }
  }

  function renderPlate(b) {
    var s = b.slots.filter(function (x) { return x.key === b.current; })[0], box = $('plateIn');
    box.textContent = '';
    if (!s) { box.appendChild(el('div', 'loading', T('See you at the next Kiddush'))); return; }
    var days = Math.round((new Date(s.date + 'T12:00:00') - new Date(b.today + 'T12:00:00')) / 864e5);
    var main = el('div', 'p-main');
    main.appendChild(el('div', 'p-lbl', days <= 7 ? (s.kind === 'shabbat' ? T('THIS WEEK’S KIDDUSH') : T('THIS KIDDUSH')) : T('NEXT KIDDUSH')));
    main.appendChild(el('div', 'p-name', KI.title(s)));
    var d = el('div', 'p-date');
    d.appendChild(document.createTextNode(KI.dowName(s.date) + ', ' + KI.dateLabel(s) + '  ·  ' + KI.hebDate(s) + '  '));
    main.appendChild(d);
    if (s.mevarchim) { var mv = el('div', 'p-mev'); mv.appendChild(el('div', '', KI.mevarchim(s))); if (s.molad) mv.appendChild(el('div', '', T('Molad') + ': ' + KI.molad(s))); main.appendChild(mv); }
    var tm = el('div', 'p-times'); tm.id = 'times'; main.appendChild(tm); shabbatTimes(s, tm);
    main.appendChild(el('div', 'p-rule'));
    var sps = sponsorsOf(s);
    if (sps.length) {
      main.appendChild(el('div', 'p-by', T('SPONSORED BY')));
      var shown = sps.slice(0, 3);
      shown.forEach(function (x) { main.appendChild(el('div', 'p-sp' + (sps.length > 1 ? ' small' : ''), KI.name(x))); var r = KI.reason(x); if (r) main.appendChild(el('div', 'p-ded' + (sps.length > 1 ? ' small' : ''), r)); });
      if (sps.length > 3) main.appendChild(el('div', 'p-ded small', T('and {n} more', { n: sps.length - 3 })));
    } else {
      main.appendChild(el('div', 'p-open', T('OPEN FOR SPONSORSHIP')));
    }
    (s.notes || []).forEach(function (n) { main.appendChild(el('div', 'p-note', KI.note(n))); }); // this week's notes go last, after the sponsors
    box.appendChild(main);
    var sh = shareAddress(b.settings), url = sh.url || (sh.base + '/kiddush/?w=' + encodeURIComponent(s.key));
    var qr = el('div', 'p-qr'), q = el('div', 'qr'); q.innerHTML = qrSvg(url); qr.appendChild(q);
    qr.appendChild(el('div', 'q1', sps.length ? T('SPONSOR A KIDDUSH') : T('SCAN TO SPONSOR')));
    var q2 = el('div', 'q2'), cut = sh.label.indexOf('/'); // address on two lines (site, then path) so it never breaks mid-word
    q2.appendChild(el('div', 'q2h', cut > 0 ? sh.label.slice(0, cut) : sh.label)); if (cut > 0) q2.appendChild(el('div', 'q2p', sh.label.slice(cut)));
    qr.appendChild(q2);
    box.appendChild(qr);
    $('plate').className = 'plate' + ((s.mevarchim || (s.notes && s.notes.length)) ? ' tall' : '');
    ['p-name', 'p-open'].forEach(function (c) { var n = box.querySelector('.' + c); if (n) fit(n, .5); });
    Array.prototype.forEach.call(box.querySelectorAll('.p-sp'), function (n) { fit(n, .5); });
    Array.prototype.forEach.call(box.querySelectorAll('.q2h, .q2p'), function (n) { fit(n, .6); });
    // a long dedication must never push the label off the plate: shrink the sponsor text until everything fits
    var pm = box.querySelector('.p-main'), guard = 0;
    while (pm && pm.scrollHeight > pm.clientHeight + 1 && guard++ < 14) {
      Array.prototype.forEach.call(pm.querySelectorAll('.p-sp, .p-ded, .p-note'), function (n) { n.style.fontSize = parseFloat(getComputedStyle(n).fontSize) * .93 + 'px'; });
    }
    var ded = box.querySelector('.p-ded'); if (ded) { var g = 0; while (ded.scrollHeight > ded.clientHeight + 1 && ded.scrollHeight > parseFloat(getComputedStyle(ded).fontSize) * 2.4 && g++ < 12) ded.style.fontSize = parseFloat(getComputedStyle(ded).fontSize) * .92 + 'px'; }
  }

  // Candle lighting / Havdalah for the shown week (Hebcal, for the location in chabad.config.json). Silent if there is none or the lookup fails.
  // Safety margin: Shabbat/Yom Tov ends a minute later than the computed time, never earlier (candle lighting is Hebcal's 18 minutes before sunset, which is at or a minute before Chabad.org's).
  function addMinutes(t, n) {
    var m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(t); if (!m || !n) return t;
    var total = ((+m[1] % 12) + (/pm/i.test(m[3]) ? 12 : 0)) * 60 + (+m[2]) + n; total = ((total % 1440) + 1440) % 1440;
    var h24 = Math.floor(total / 60), h12 = h24 % 12 || 12;
    return h12 + ':' + String(total % 60).padStart(2, '0') + ' ' + (h24 >= 12 ? 'PM' : 'AM');
  }
  var timesCache = {};
  function shabbatTimes(s, node) {
    var ymd = function (d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
    var show = function (t) { node.textContent = t || ''; };
    var hq = board && board.settings && board.settings.hebcalQuery; if (!hq) return show('');
    if (timesCache[s.key] != null) return show(timesCache[s.key]);
    var d = new Date(s.date + 'T12:00:00'), a = new Date(d); a.setDate(a.getDate() - 1);
    fetch('https://www.hebcal.com/hebcal?v=1&cfg=json&c=on&' + hq + '&s=off&maj=off&min=off&mod=off&nx=off&mf=off&ss=off&start=' + ymd(a) + '&end=' + s.date).then(function (r) { return r.json(); }).then(function (j) {
      var c = (j.items || []).filter(function (i) { return i.category === 'candles'; })[0], h = (j.items || []).filter(function (i) { return i.category === 'havdalah'; })[0];
      var part = function (i, n, pad) { var m = i && /:\s*(.+)$/.exec(i.title); return m ? T(n) + ' ' + KI.time(addMinutes(m[1].replace(/(\d)(am|pm)/i, '$1 $2').toUpperCase(), pad || 0)) : ''; };
      var t = [part(c, 'Candle lighting'), part(h, 'Havdalah', board.settings.havdalahPad == null ? 1 : board.settings.havdalahPad)].filter(Boolean).join('  ·  ');
      timesCache[s.key] = t; show(t);
    }).catch(function () {});
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
    eventsBox(b, rows);
    Array.prototype.forEach.call(document.querySelectorAll('.tile .n'), function (n) { fit(n, .5); });
    Array.prototype.forEach.call(document.querySelectorAll('.tile .s, .tile .ts'), function (n) { fit(n, .5); });
    Array.prototype.forEach.call(document.querySelectorAll('.tile .r, .tile.past .td'), function (n) { fit(n, .8); }); // long reasons are cut short with … rather than shrunk to nothing
    Array.prototype.forEach.call(document.querySelectorAll('.tile .tt, .tile:not(.past) .td'), function (n) { fit(n, .55); });
  }
  // The empty space at the bottom of the last column holds an "Upcoming events" box (notes added in Staff → Calendar notes).
  function eventsBox(b, rows) {
    var col = $('c3'), empties = col.querySelectorAll('.tile.empty'), k = empties.length;
    if (k < 2 || !(b.events && b.events.length)) return;
    var box = el('div', 'events'); box.style.gridRow = 'span ' + k;
    Array.prototype.forEach.call(empties, function (e, i) { if (i) col.removeChild(e); });
    col.replaceChild(box, empties[0]);
    box.appendChild(el('div', 'ev-h', T('UPCOMING EVENTS')));
    b.events.forEach(function (n) {
      var it = el('div', 'ev'); it.appendChild(el('div', 'ev-d', KI.dowName(n.date) + ', ' + KI.dateLabel(n))); it.appendChild(el('div', 'ev-t', KI.he && n.textHe ? n.textHe : n.text)); box.appendChild(it);
    });
    while (box.children.length > 2 && box.scrollHeight > box.clientHeight + 1) box.removeChild(box.lastChild); // show as many as fit
  }
  function sizeRows(rows) {
    var col = $('c0'), h = col.clientHeight, gap = parseFloat(getComputedStyle(col).rowGap) || 0;
    document.documentElement.style.setProperty('--rh', Math.max(20, (h - gap * (rows - 1)) / rows) + 'px');
  }

  // Bottom of the center: who donated the board this year, or an open invitation to sponsor it.
  function renderDonor(b) {
    var d = $('donor'), bs = b.boardSponsor, S = b.settings; d.textContent = ''; d.className = 'donor';
    var base = shareAddress(S).label;
    var bsp = bs ? sponsorsOf(bs) : [];
    if (bsp.length) {
      d.appendChild(el('div', 'donor-l', T('DONATED BY'))); d.appendChild(el('div', 'donor-name', names(bsp)));
      var dd = reasons(bsp); if (dd) d.appendChild(el('div', 'donor-sub', dd));
    } else if (S.donorEn || S.donorHe) {
      d.appendChild(el('div', 'donor-l', T('DONATED BY')));
      if (S.donorHe) { var he = el('div', 'donor-he', S.donorHe); he.lang = 'he'; d.appendChild(he); }
      if (S.donorEn) d.appendChild(el('div', 'donor-en', S.donorEn));
    } else if (bs && bs.status === 'open') {
      d.className = 'donor open';
      d.appendChild(el('div', 'donor-l', T('SPONSOR THIS KIDDUSH BOARD FOR {year}', { year: KI.he ? b.yearHe : b.year })));
      d.appendChild(el('div', 'donor-sub', T('Your name displayed here all year') + ' · ' + base));
    } else { d.hidden = true; return; }
    d.hidden = false;
    var nm = d.querySelector('.donor-name'); if (nm) fit(nm, .5);
  }

  // Small gold clock in the corner of the centre column (in the shul's time zone once the board has loaded; the TV's own clock until then).
  function tickClock() {
    var n = $('clock'); if (!n) return;
    var tz = board && board.settings && board.settings.timezone, opts = { hour: 'numeric', minute: '2-digit', hour12: !KI.he };
    try { if (tz) opts.timeZone = tz; n.textContent = new Intl.DateTimeFormat(KI.he ? 'he-IL' : 'en-US', opts).format(new Date()); }
    catch (e) { n.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
  }
  tickClock(); setInterval(tickClock, 5000);

  function render(b) {
    board = b; tickClock();
    $('yearNum').textContent = KI.he ? '' : b.year; $('yearHe').textContent = b.yearHe; $('year').querySelector('.dash').style.display = KI.he ? 'none' : '';
    var s = b.settings, ol = KI.orgLines(s);
    $('orgL1').textContent = ol[0]; $('orgL2').textContent = ol[1]; document.title = (KI.he ? 'תורמי הקידוש' : 'Kiddush Sponsors') + (KI.org(s) ? ' — ' + KI.org(s) : '');
    $('blessing').textContent = KI.blessing(s) || '';
    renderDonor(b);
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
