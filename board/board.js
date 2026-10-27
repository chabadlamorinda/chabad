// Chai Club honor board. Builds the board with DOM calls only (names are shown as text, never as HTML).
(function (root) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var LEVELS = [
    { id: 'platinum', c: ['#ffffff', '#9fc0e3', '#3f6490', '#d6e8fa'], range: { en: '$720 and above a month', he: '720$ ומעלה בחודש' }, en: 'Platinum', he: 'פלטינה' },
    { id: 'gold', c: ['#fff0b8', '#e0b046', '#a06f24', '#f6d98a'], range: { en: '$360 – $719 a month', he: '360$–719$ בחודש' }, en: 'Gold', he: 'זהב' },
    { id: 'silver', c: ['#ffffff', '#cfd3d8', '#8a9099', '#f2f3f5'], range: { en: '$180 – $359 a month', he: '180$–359$ בחודש' }, en: 'Silver', he: 'כסף' },
    { id: 'bronze', c: ['#f3c9a0', '#c98a55', '#8a5427', '#ecb98a'], range: { en: '$72 – $179 a month', he: '72$–179$ בחודש' }, en: 'Bronze', he: 'ארד' }
  ];
  var T = {
    en: { title: 'Chai Club', sub: 'Monthly donors who sustain Chabad of Lamorinda, day in and day out.', empty: 'Be the first to join', anon: 'Anonymous', more: function (n) { return '+ ' + n + ' more'; }, foot: 'Every monthly gift, large or small, keeps our community going. Thank you.', join: 'Join the Chai Club', members: function (n) { return n === 1 ? '1 member' : n + ' members'; } },
    he: { title: 'מועדון חי', sub: 'תורמים חודשיים התומכים בבית חב״ד לאמורינדה יום אחר יום.', empty: 'היו הראשונים להצטרף', anon: 'אנונימי', more: function (n) { return '+ עוד ' + n; }, foot: 'כל תרומה חודשית, גדולה או קטנה, מקיימת את הקהילה שלנו. תודה.', join: 'הצטרפו למועדון חי', members: function (n) { return n === 1 ? 'חבר אחד' : n + ' חברים'; } }
  };
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function svg(tag, attrs) { var n = document.createElementNS(NS, tag); for (var k in attrs) n.setAttribute(k, attrs[k]); return n; }
  var uid = 0;
  // A round medal on a ribbon. size = pixel width.
  function medal(level, size) {
    var L = LEVELS.filter(function (l) { return l.id === level; })[0] || LEVELS[3], id = 'cbm' + (++uid), w = size, h = Math.round(size * 1.25);
    var s = svg('svg', { viewBox: '0 0 80 100', width: w, height: h, 'aria-hidden': 'true', focusable: 'false' });
    var d = svg('defs', {}), g = svg('radialGradient', { id: id + 'g', cx: '35%', cy: '30%', r: '85%' });
    [[0, L.c[0]], [.45, L.c[1]], [1, L.c[2]]].forEach(function (st) { g.appendChild(svg('stop', { offset: st[0], 'stop-color': st[1] })); });
    var rg = svg('linearGradient', { id: id + 'r', x1: '0', y1: '0', x2: '0', y2: '1' });
    rg.appendChild(svg('stop', { offset: 0, 'stop-color': '#2a5a9e' })); rg.appendChild(svg('stop', { offset: 1, 'stop-color': '#173766' }));
    d.appendChild(g); d.appendChild(rg); s.appendChild(d);
    s.appendChild(svg('path', { d: 'M22 2h14l10 36-10 6L22 2z', fill: 'url(#' + id + 'r)' }));
    s.appendChild(svg('path', { d: 'M58 2H44L34 38l10 6L58 2z', fill: 'url(#' + id + 'r)', opacity: '.88' }));
    s.appendChild(svg('circle', { cx: 40, cy: 62, r: 31, fill: 'url(#' + id + 'g)', stroke: L.c[2], 'stroke-width': 1.2 }));
    s.appendChild(svg('circle', { cx: 40, cy: 62, r: 25.5, fill: 'none', stroke: L.c[3], 'stroke-width': 1.1, 'stroke-dasharray': '1.6 2.2' }));
    s.appendChild(svg('circle', { cx: 40, cy: 62, r: 22, fill: 'none', stroke: L.c[2], 'stroke-width': .8, opacity: '.6' }));
    var t = svg('text', { x: 40, y: 70.5, 'text-anchor': 'middle', 'font-family': '"Cormorant Garamond",Georgia,serif', 'font-weight': 700, 'font-size': 26, fill: L.c[2], stroke: L.c[3], 'stroke-width': .35 });
    t.textContent = 'חי'; s.appendChild(t);
    s.appendChild(svg('path', { d: 'M22 48c6-9 18-12 28-8', fill: 'none', stroke: '#fff', 'stroke-width': 2.4, 'stroke-linecap': 'round', opacity: '.45' }));
    return s;
  }
  function render(data, o) {
    o = o || {}; var lang = o.lang === 'he' ? 'he' : 'en', X = T[lang];
    data = data || { members: [], counts: {}, total: 0 };
    var box = el('div', 'cb'); box.setAttribute('lang', lang); box.setAttribute('dir', lang === 'he' ? 'rtl' : 'ltr');
    var frame = el('div', 'cb-frame'), paper = el('div', 'cb-paper'); frame.appendChild(paper); box.appendChild(frame);
    var head = el('div', 'cb-head'); head.appendChild(el('div', 'cb-he', 'מועדון חי')); if (lang === 'en') head.appendChild(el('h2', 'cb-title', X.title));
    head.appendChild(el('div', 'cb-orn', '✦')); head.appendChild(el('p', 'cb-sub', X.sub)); paper.appendChild(head);
    var any = false;
    LEVELS.forEach(function (L) {
      var count = (data.counts && data.counts[L.id]) || 0, names = (data.members || []).filter(function (m) { return m.level === L.id; });
      var tier = el('section', 'cb-tier'); tier.setAttribute('data-level', L.id);
      var th = el('div', 'cb-th'); th.appendChild(medal(L.id, 34));
      var tt = el('div'); tt.appendChild(el('div', 'cb-tn', L[lang])); tt.appendChild(el('div', 'cb-tr', L.range[lang])); th.appendChild(tt);
      if (count) th.appendChild(el('div', 'cb-ct', X.members(count)));
      tier.appendChild(th);
      if (names.length) { any = true; var grid = el('div', 'cb-names'); names.forEach(function (m, i) { var p = el('div', 'cb-plaque'); p.style.animationDelay = Math.min(i, 12) * 40 + 'ms'; p.appendChild(medal(L.id, 18)); p.appendChild(el('span', '', m.name)); grid.appendChild(p); }); tier.appendChild(grid); }
      var quiet = count - names.length;
      if (quiet > 0) { // donors who joined anonymously still get a plaque and a medal
        any = true; var ag = el('div', 'cb-names'), shown = Math.min(quiet, 18);
        for (var q = 0; q < shown; q++) { var ap = el('div', 'cb-plaque cb-anon'); ap.appendChild(medal(L.id, 18)); ap.appendChild(el('span', '', X.anon)); ag.appendChild(ap); }
        tier.appendChild(ag); if (quiet > shown) tier.appendChild(el('div', 'cb-quiet', X.more(quiet - shown)));
      }
      if (!count) tier.appendChild(el('div', 'cb-empty', X.empty));
      paper.appendChild(tier);
    });
    var foot = el('div', 'cb-foot'); foot.appendChild(el('div', '', X.foot));
    if (o.joinHref) { var a = el('a', 'cb-cta', X.join); a.href = o.joinHref; a.target = '_top'; foot.appendChild(a); }
    else if (o.onJoin) { var b = el('button', 'cb-cta', X.join); b.type = 'button'; b.setAttribute('data-act', 'clubJoinPage'); foot.appendChild(b); }
    paper.appendChild(foot);
    return box;
  }
  function load(base) { return fetch((base || '') + '/api/club').then(function (r) { if (!r.ok) throw new Error('board'); return r.json(); }); }
  root.ClubBoard = { render: render, medal: medal, load: load, LEVELS: LEVELS };
})(window);
