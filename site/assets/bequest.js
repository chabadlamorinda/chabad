// The clauses for the "Write your own wording" builder (server/site/bequest.js). English only: they are for an attorney.
(function () {
  var root = document.getElementById('bequest');
  if (!root) return;
  var ORG = 'Chabad of Lamorinda, a tax-exempt organization described in Section 501(c)(3) of the Internal Revenue Code (EIN 47-4642750), 3477 Golden Gate Way, Lafayette, California 94549';
  var SHORT = 'Chabad of Lamorinda, 3477 Golden Gate Way, Lafayette, CA 94549, a 501(c)(3) organization, EIN 47-4642750';
  var map = JSON.parse(root.getAttribute('data-fields'));
  var kind = root.querySelector('[data-kind]'), out = root.querySelector('[data-out]');
  var BL = '________';
  function val(id) { var el = root.querySelector('[data-v="' + id + '"]'); if (!el) return ''; return el.tagName === 'SELECT' ? el.value : el.value.trim(); }
  function or(id) { return val(id) || BL; }
  function money(id) { var v = val(id).replace(/[^0-9.,]/g, ''); return v ? '$' + v : '$' + BL; }
  function pct(id) { var v = val(id).replace(/[^0-9.]/g, ''); return v ? v + ' percent (' + v + '%)' : BL + ' percent (____%)'; }
  function use() { return val('use') === '1' ? 'to be used for Jewish education for future generations' : 'to be used for its general purposes'; }
  function text() {
    switch (kind.value) {
      case 'sum': return 'I give and bequeath to ' + ORG + ', the sum of ' + money('amount') + ', ' + use() + '.';
      case 'pct': return 'I give and bequeath to ' + ORG + ', ' + pct('percent') + ' of my estate, ' + use() + '.';
      case 'resid': return 'I give all the rest, residue and remainder of my estate, of whatever kind and wherever situated, to ' + ORG + ', ' + use() + '.';
      case 'memory': {
        var how = val('honor') === '1' ? 'in honor of' : 'in loving memory of', amt = val('amount') ? 'the sum of ' + money('amount') : (val('percent') ? pct('percent') + ' of my estate' : 'the sum of $' + BL);
        return 'I give and bequeath to ' + ORG + ', ' + amt + ', ' + how + ' ' + or('person') + ', ' + use() + '.';
      }
      case 'dedic': return 'I give and bequeath to ' + ORG + ', the sum of ' + money('amount') + ', to dedicate ' + or('what') + ' in the name of ' + or('inname') + ', as agreed with Chabad of Lamorinda. If the dedication cannot be carried out, the gift shall be used for its general purposes.';
      case 'contingent': return 'If ' + or('first') + ' does not survive me, I give the share that would have passed to that beneficiary to ' + ORG + ', ' + use() + '.';
      case 'retire': { var s = val('share').replace(/[^0-9.]/g, ''); return 'Beneficiary: ' + SHORT + '. Share: ' + (s ? s : '____') + '%.'; }
      case 'stock': return 'I give and bequeath to ' + ORG + ', ' + or('shares') + ' shares of ' + or('company') + ', ' + use() + '.';
      case 'daf': return 'Upon my death, I recommend that ' + pct('percent') + ' of the balance of my donor-advised fund, ' + or('fund') + ', be granted to ' + SHORT + '.';
    }
    return '';
  }
  function render() {
    var show = map[kind.value] || [];
    root.querySelectorAll('[data-field]').forEach(function (l) { l.hidden = show.indexOf(l.getAttribute('data-field')) < 0; });
    var s = text();
    out.textContent = s;
    var box = document.querySelector('form[data-form="legacy-intent"] textarea[name="wording"]');
    if (box && !box.dataset.edited) box.value = s;
  }
  root.addEventListener('input', render); root.addEventListener('change', render);
  var box0 = document.querySelector('form[data-form="legacy-intent"] textarea[name="wording"]');
  if (box0) box0.addEventListener('input', function () { box0.dataset.edited = '1'; });
  root.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]'); if (!b) return;
    var s = text(), a = b.getAttribute('data-act');
    if (a === 'copy') {
      var done = function () { var o = b.textContent; b.textContent = root.getAttribute('data-copied'); setTimeout(function () { b.textContent = o; }, 1800); };
      if (navigator.clipboard) navigator.clipboard.writeText(s).then(done, function () {}); else { var ta = document.createElement('textarea'); ta.value = s; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (x) {} ta.remove(); }
    } else if (a === 'download') {
      var url = URL.createObjectURL(new Blob([s + '\n'], { type: 'text/plain;charset=utf-8' })), l = document.createElement('a');
      l.href = url; l.download = 'bequest-wording-chabad-of-lamorinda.txt'; document.body.appendChild(l); l.click(); l.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    } else if (a === 'print') {
      var w = window.open('', '_blank'); if (!w) return;
      w.document.write('<!doctype html><title>Chabad of Lamorinda</title><body style="font:18px/1.6 Georgia,serif;max-width:640px;margin:40px auto"><p></p>'); w.document.body.querySelector('p').textContent = s; w.document.close(); w.focus(); w.print();
    }
  });
  render();
})();
