'use strict';
// Finances in the Rabbi area (/admin/finances): an overview of the year, every dollar in and out, people (donors and
// payees) with their giving and notes, and reports (spreadsheet, budget, year-end letters). Server: server/finances.js.
(function () {
  var app = document.getElementById('app'), M = null, year = new Date().getFullYear(), tab = (location.hash || '#overview').slice(1);
  function el(t, a, kids) { var n = document.createElement(t); for (var k in a || {}) { if (k === 'text') n.textContent = a[k]; else if (k === 'onclick') n.onclick = a[k]; else if (k === 'onchange') n.onchange = a[k]; else if (k === 'oninput') n.oninput = a[k]; else n.setAttribute(k, a[k]); } (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }); return n; }
  function api(m, p, body) { return fetch('/admin/api' + p, { method: m, credentials: 'same-origin', headers: { 'x-admin': '1', 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j._status = r.status; return j; }); }); }
  var usd = function (c) { return '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); };
  var usd2 = function (c) { return '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var today = function () { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var body = el('div');
  function opt(v, label, sel) { var o = el('option', { value: v, text: label }); if (sel) o.selected = true; return o; }
  function shell() {
    app.textContent = '';
    app.appendChild(el('p', {}, [el('a', { href: '/admin', text: '← Rabbi’s desk' })]));
    app.appendChild(el('h1', { text: 'Finances' }));
    var ys = el('select', { 'aria-label': 'Year', onchange: function () { year = +ys.value; show(); } });
    for (var y = new Date().getFullYear(); y >= new Date().getFullYear() - 6; y--) ys.appendChild(opt(y, String(y), y === year));
    var nav = el('nav', { class: 'jump' });
    [['overview', 'Overview'], ['money', 'Money in & out'], ['people', 'People'], ['reports', 'Reports']].forEach(function (x) { nav.appendChild(el('a', { href: '#' + x[0], class: tab === x[0] ? 'hot' : '', onclick: function () { tab = x[0]; shell(); show(); } }, [x[1]])); });
    app.appendChild(el('div', { class: 'row' }, [ys, el('span', { class: 'small', text: 'Year' })]));
    app.appendChild(nav); app.appendChild(body);
  }
  function show() { body.textContent = ''; ({ overview: overview, money: money, people: people, reports: reports })[tab] ? ({ overview: overview, money: money, people: people, reports: reports })[tab]() : overview(); }
  function card(title, kids, cls) { return el('div', { class: 'card' + (cls ? ' ' + cls : '') }, [title ? el('strong', { text: title }) : null].concat(kids || [])); }
  function table(rows, heads) { var t = el('table', { class: 'fin' }); if (heads) t.appendChild(el('tr', {}, heads.map(function (h) { return el('th', { text: h }); }))); rows.forEach(function (r) { t.appendChild(el('tr', {}, r.map(function (c) { return el('td', {}, [typeof c === 'object' && c ? c : String(c == null ? '' : c)]); }))); }); return t; }
  function personLink(id, name) { return el('a', { href: '#people', onclick: function (e) { e.preventDefault(); tab = 'people'; shell(); person(id); }, text: name || '(no name)' }); }

  // ---- Overview ----
  function overview() {
    var syncMsg = el('span', { class: 'small' });
    var syncBtn = el('button', { class: 'on', text: M.online ? 'Bring in online gifts now' : 'Online gifts: Stripe not connected', onclick: function () { syncBtn.disabled = true; syncMsg.textContent = 'Working…'; api('POST', '/fin/sync').then(function (r) { syncBtn.disabled = false; syncMsg.textContent = r._status === 200 ? r.added + ' new' : (r.error || 'Could not sync.'); show(); }); } });
    if (!M.online) syncBtn.disabled = true;
    body.appendChild(el('div', { class: 'row' }, [syncBtn, syncMsg]));
    api('GET', '/fin/summary?year=' + year).then(function (s) {
      if (s._status !== 200) { body.appendChild(el('p', { class: 'warn', text: s.error || 'Could not load.' })); return; }
      syncMsg.textContent = s.lastSync ? 'Last brought in: ' + new Date(s.lastSync).toLocaleString() : '';
      var diff = function (now, before) { if (!before) return ''; var p = Math.round((now - before) / before * 100); return (p >= 0 ? '+' : '') + p + '% vs ' + (s.year - 1); };
      body.appendChild(el('div', { class: 'fin-cards' }, [
        card('', [el('span', { class: 'small', text: 'Money in' }), el('b', { class: 'fin-big in', text: usd(s.income) }), el('span', { class: 'small', text: diff(s.income, s.lastYear.income) })]),
        card('', [el('span', { class: 'small', text: 'Money out' }), el('b', { class: 'fin-big out', text: usd(s.expenses) }), el('span', { class: 'small', text: diff(s.expenses, s.lastYear.expenses) })]),
        card('', [el('span', { class: 'small', text: s.net >= 0 ? 'Left over' : 'Short' }), el('b', { class: 'fin-big', text: usd(Math.abs(s.net)) })])]));
      var max = Math.max.apply(null, s.months.map(function (m) { return Math.max(m.in, m.out); }).concat([1]));
      body.appendChild(card('Month by month', [el('div', { class: 'fin-chart' }, s.months.map(function (m) {
        return el('div', { class: 'fin-m', title: MON[m.month - 1] + ': in ' + usd(m.in) + ', out ' + usd(m.out) }, [el('div', { class: 'fin-bars' }, [el('i', { class: 'in', style: 'height:' + Math.round(m.in / max * 100) + '%' }), el('i', { class: 'out', style: 'height:' + Math.round(m.out / max * 100) + '%' })]), el('span', { text: MON[m.month - 1] })]);
      })), el('p', { class: 'small' }, [el('span', { class: 'fin-key in' }), ' money in  ', el('span', { class: 'fin-key out' }), ' money out'])]));
      var budget = {}; s.budget.forEach(function (b) { budget[b.category] = b.cents; });
      ['in', 'out'].forEach(function (k) {
        var rows = s.byCategory.filter(function (x) { return x.kind === k; }).map(function (x) { var b = budget[x.key]; return [x.key, usd(x.cents), b ? Math.round(x.cents / b * 100) + '% of ' + usd(b) : '']; });
        if (rows.length) body.appendChild(card(k === 'in' ? 'Money in, by category' : 'Money out, by category', [table(rows, ['Category', 'Amount', 'Budget'])]));
      });
      var funds = s.byFund.filter(function (x) { return x.kind === 'in' && x.key; });
      if (funds.length) body.appendChild(card('Money in, by fund', [table(funds.map(function (x) { return [M.funds[x.key] || x.key, usd(x.cents), x.n + ' gifts']; }))]));
      var how = s.byMethod.filter(function (x) { return x.kind === 'in'; });
      if (how.length) body.appendChild(card('Money in, by how it was paid', [table(how.map(function (x) { return [M.methods[x.key] || x.key, usd(x.cents), x.n]; }))]));
      if (s.donors.length) body.appendChild(card('Top donors in ' + s.year, [table(s.donors.map(function (d) { return [personLink(d.id, d.name || d.email), usd(d.cents), d.n + (d.n === 1 ? ' gift' : ' gifts')]; }))]));
      var contact = function (p) { return el('span', {}, [p.email ? el('a', { href: 'mailto:' + p.email, text: 'Email' }) : null, p.email && p.phone ? ' · ' : '', p.phone ? el('a', { href: 'tel:' + p.phone, text: 'Call' }) : null]); };
      if (s.lapsed.length) body.appendChild(card('Gave in ' + (s.year - 1) + ', not yet in ' + s.year + ' (' + s.lapsed.length + ')', [el('p', { class: 'small', text: 'A personal call or note brings most people back.' }), table(s.lapsed.map(function (p) { return [personLink(p.id, p.name || p.email), usd(p.cents) + ' last year', contact(p)]; }))], 'hot'));
      if (s.repeat.length) body.appendChild(card('Give again and again: invite them to the Chai Club (' + s.repeat.length + ')', [table(s.repeat.map(function (p) { return [personLink(p.id, p.name || p.email), p.n + ' gifts, ' + usd(p.cents), contact(p)]; }))]));
      if (!s.income && !s.expenses) body.appendChild(el('p', { class: 'small', text: 'Nothing for ' + s.year + ' yet. Online gifts come in by themselves; add checks, cash and expenses under "Money in & out".' }));
    });
  }

  // ---- Money in & out ----
  function txForm(t, done) {
    t = t || { kind: 'in', day: today(), method: 'check', deductible: true };
    var kind = el('select', { 'aria-label': 'In or out' }, [opt('in', 'Money in', t.kind === 'in'), opt('out', 'Money out (expense)', t.kind === 'out')]);
    var amount = el('input', { type: 'number', step: '0.01', min: '0', placeholder: 'Amount ($)', inputmode: 'decimal' }); if (t.cents) amount.value = (t.cents / 100).toFixed(2);
    var day = el('input', { type: 'date' }); day.value = t.day || today();
    var cat = el('select', { 'aria-label': 'Category' }), fund = el('select', { 'aria-label': 'Fund' }, [opt('', 'Fund: none')].concat(Object.keys(M.funds).map(function (k) { return opt(k, M.funds[k], t.fund === k); })));
    var method = el('select', { 'aria-label': 'How paid' }, Object.keys(M.methods).map(function (k) { return opt(k, M.methods[k], t.method === k); }));
    var who = el('input', { placeholder: 'From (name)' }), email = el('input', { type: 'email', placeholder: 'Their email (optional, matches them to their record)' }), payee = el('input', { placeholder: 'Paid to (e.g. PG&E, Costco)' });
    var memo = el('input', { placeholder: 'Note (optional)' }); memo.value = t.memo || ''; payee.value = t.payee || '';
    var ref = el('input', { placeholder: 'Check # or reference (optional)' }); ref.value = t.ref || '';
    var ded = el('input', { type: 'checkbox' }); ded.checked = t.deductible !== false;
    var dedL = el('label', { class: 'row small' }, [ded, 'Tax-deductible gift (goes on their year-end letter)']), msg = el('p', { class: 'small warn' });
    var editing = !!t.id, online = t.source && t.source !== 'manual';
    var fill = function () { cat.textContent = ''; (kind.value === 'in' ? M.in : M.out).forEach(function (c) { cat.appendChild(opt(c, c, t.category === c)); }); var i = kind.value === 'in'; who.hidden = email.hidden = editing || !i; dedL.hidden = fund.hidden = !i; payee.hidden = i; };
    kind.onchange = fill; fill();
    if (online) { kind.disabled = amount.disabled = day.disabled = true; }
    var save = el('button', { class: 'on', text: editing ? 'Save' : 'Add', onclick: function () {
      var b = { kind: kind.value, amount: amount.value, day: day.value, category: cat.value, fund: fund.value, method: method.value, payee: payee.value, memo: memo.value, ref: ref.value, deductible: ded.checked, personName: who.value, personEmail: email.value };
      api(editing ? 'PUT' : 'POST', '/fin/tx' + (editing ? '/' + t.id : ''), b).then(function (r) { if (r._status === 200) done(); else msg.textContent = r.error || 'Could not save.'; });
    } });
    return el('div', { class: 'card fin-form' }, [el('strong', { text: editing ? 'Change' : 'Add money in or out' }), online ? el('p', { class: 'small', text: 'An online payment: its amount and date come from Stripe.' }) : null, kind, amount, day, cat, fund, method, who, email, payee, ref, memo, dedL, el('div', { class: 'row' }, [save, editing ? el('button', { text: 'Cancel', onclick: done }) : null]), msg]);
  }
  function money() {
    var form = el('div'); form.appendChild(txForm(null, money));
    var kind = el('select', {}, [opt('', 'In and out'), opt('in', 'Money in'), opt('out', 'Money out')]), cat = el('select', {}, [opt('', 'All categories')].concat(M.in.concat(M.out).map(function (c) { return opt(c, c); })));
    var q = el('input', { type: 'search', placeholder: 'Search names, notes, check #' }), list = el('div');
    var load = function () {
      list.textContent = 'Loading…';
      api('GET', '/fin/tx?year=' + year + '&kind=' + kind.value + '&category=' + encodeURIComponent(cat.value) + '&q=' + encodeURIComponent(q.value)).then(function (x) {
        list.textContent = '';
        if (!x.items || !x.items.length) { list.appendChild(el('p', { class: 'small', text: 'Nothing here.' })); return; }
        var tin = 0, tout = 0; x.items.forEach(function (t) { if (t.kind === 'in') tin += t.cents; else tout += t.cents; });
        list.appendChild(el('p', { class: 'small', text: x.items.length + ' entries · in ' + usd2(tin) + ' · out ' + usd2(tout) }));
        x.items.forEach(function (t) {
          var row = el('div', { class: 'card fin-tx ' + t.kind }, [el('div', { class: 'row' }, [el('b', { text: (t.kind === 'in' ? '+' : '−') + usd2(t.cents) }), el('span', { text: t.day }), el('span', { class: 'pill', text: t.category }), t.source !== 'manual' ? el('span', { class: 'pill', text: t.source === 'stripe' ? 'online' : t.source }) : null]),
            el('div', { class: 'small' }, [t.person_id ? personLink(t.person_id, t.person) : null, t.payee ? ' ' + t.payee : '', ' · ' + (M.methods[t.method] || t.method), t.ref ? ' #' + t.ref : '', t.memo ? ' · ' + t.memo : '']),
            el('div', { class: 'row' }, [el('button', { text: 'Change', onclick: function () { row.replaceWith(txForm(t, load)); } }), t.source === 'manual' ? el('button', { text: 'Delete', onclick: function () { if (confirm('Delete this entry?')) api('DELETE', '/fin/tx/' + t.id).then(load); } }) : null])]);
          list.appendChild(row);
        });
      });
    };
    kind.onchange = cat.onchange = load; var timer; q.oninput = function () { clearTimeout(timer); timer = setTimeout(load, 300); };
    body.appendChild(form); body.appendChild(el('div', { class: 'row' }, [kind, cat, q])); body.appendChild(list); load();
  }

  // ---- People ----
  function people() {
    var q = el('input', { type: 'search', placeholder: 'Search name, email, phone, tag' }), list = el('div');
    var add = el('button', { text: '+ Add a person', onclick: function () { var n = prompt('Name'); if (!n) return; var e = prompt('Email (optional)') || ''; api('POST', '/fin/people', { name: n, email: e }).then(function (r) { if (r.id) person(r.id); }); } });
    var load = function () {
      api('GET', '/fin/people?q=' + encodeURIComponent(q.value)).then(function (x) {
        list.textContent = '';
        if (!x.items || !x.items.length) { list.appendChild(el('p', { class: 'small', text: 'No one yet. Donors are added by themselves when online gifts come in.' })); return; }
        list.appendChild(table(x.items.map(function (p) { return [personLink(p.id, p.name || p.email), usd(p.total), p.thisYear ? usd(p.thisYear) + ' this year' : '', p.lastGift ? 'last ' + p.lastGift : '', p.tags]; }), ['Name', 'All time', 'This year', 'Last gift', 'Tags']));
      });
    };
    var timer; q.oninput = function () { clearTimeout(timer); timer = setTimeout(load, 300); };
    body.appendChild(el('div', { class: 'row' }, [q, add])); body.appendChild(list); load();
  }
  function person(id) {
    body.textContent = 'Loading…';
    api('GET', '/fin/people/' + id).then(function (x) {
      body.textContent = '';
      var p = x.person, f = {}, msg = el('span', { class: 'small' });
      ['name', 'email', 'phone', 'address', 'tags'].forEach(function (k) { f[k] = el('input', { placeholder: k === 'tags' ? 'Tags (e.g. board, preschool parent)' : k[0].toUpperCase() + k.slice(1) }); f[k].value = p[k] || ''; });
      f.notes = el('textarea', { rows: '4', placeholder: 'Notes (only you see these)' }); f.notes.value = p.notes || '';
      body.appendChild(el('p', {}, [el('a', { href: '#people', onclick: function (e) { e.preventDefault(); show(); }, text: '← Everyone' })]));
      body.appendChild(card(p.name || p.email, [el('div', { class: 'row' }, [p.email ? el('a', { href: 'mailto:' + p.email, text: 'Email' }) : null, p.phone ? el('a', { href: 'tel:' + p.phone, text: 'Call' }) : null, p.phone ? el('a', { href: 'https://wa.me/' + p.phone.replace(/\D/g, '').replace(/^(\d{10})$/, '1$1'), target: '_blank', rel: 'noopener', text: 'WhatsApp' }) : null]),
        f.name, f.email, f.phone, f.address, f.tags, f.notes, el('div', { class: 'row' }, [el('button', { class: 'on', text: 'Save', onclick: function () { var b = {}; for (var k in f) b[k] = f[k].value; api('PUT', '/fin/people/' + p.id, b).then(function (r) { msg.textContent = r._status === 200 ? 'Saved.' : r.error; }); } }), msg])]));
      if (x.years.length) body.appendChild(card('Giving by year', [table(x.years.map(function (y) { return [String(y.year), usd2(y.cents), y.n + (y.n === 1 ? ' gift' : ' gifts'), el('a', { href: '/admin/finances/letter/' + p.id + '?year=' + y.year, target: '_blank', text: 'Year-end letter' })]; }))]));
      body.appendChild(card('Payment history', x.tx.length ? x.tx.map(function (t) { return el('div', { class: 'small' }, [t.day + '  ' + (t.kind === 'in' ? '+' : '−') + usd2(t.cents) + '  ' + t.category + (t.memo ? ' · ' + t.memo : '')]); }) : [el('p', { class: 'small', text: 'None yet.' })]));
    });
  }

  // ---- Reports ----
  function reports() {
    body.appendChild(card('Spreadsheet for the accountant', [el('p', { class: 'small', text: 'Every dollar in and out in ' + year + ', with category, fund, how it was paid and who.' }), el('a', { class: 'pill', href: '/admin/api/fin/export.csv?year=' + year, text: 'Download ' + year + ' (CSV, opens in Excel)' })]));
    var lmsg = el('p', { class: 'small' });
    body.appendChild(card('Year-end tax letters', [el('p', { class: 'small', text: 'Each donor’s letter lists their tax-deductible gifts for the year with your tax ID. Open any donor under People to print theirs, or email everyone at once.' }),
      el('button', { class: 'on', text: 'Email ' + year + ' letters to every donor', onclick: function () { if (!confirm('Email a ' + year + ' giving letter to every donor with an email address?')) return; lmsg.textContent = 'Sending…'; api('POST', '/fin/letters', { year: year, confirm: true }).then(function (r) { lmsg.textContent = r._status === 200 ? 'Sent ' + r.sent + ' of ' + r.total + '.' : r.error; }); } }), lmsg]));
    var inputs = {}, bmsg = el('span', { class: 'small' });
    api('GET', '/fin/summary?year=' + year).then(function (s) {
      var have = {}; (s.budget || []).forEach(function (b) { have[b.category] = b.cents; });
      var rows = M.in.concat(M.out).map(function (c) { var i = el('input', { type: 'number', min: '0', step: '1', inputmode: 'numeric', placeholder: '$' }); if (have[c]) i.value = have[c] / 100; inputs[c] = i; return [c, i]; });
      body.appendChild(card('Budget for ' + year, [el('p', { class: 'small', text: 'Set a yearly amount for the categories you want to watch; the overview shows how much of each is used.' }), table(rows, ['Category', 'Budget ($)']),
        el('div', { class: 'row' }, [el('button', { class: 'on', text: 'Save budget', onclick: function () { api('PUT', '/fin/budget', { year: year, items: Object.keys(inputs).map(function (c) { return { category: c, amount: inputs[c].value }; }) }).then(function (r) { bmsg.textContent = r._status === 200 ? 'Saved.' : r.error; }); } }), bmsg])]));
    });
  }

  api('GET', '/fin/meta').then(function (m) {
    if (m._status === 401) { location.href = '/admin'; return; }
    M = m; shell();
    if (!m.db) { body.appendChild(el('p', { class: 'warn', text: 'The finances need the database (DATABASE_URL).' })); return; }
    show();
  });
})();
