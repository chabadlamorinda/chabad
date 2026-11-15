// "Write your own wording": a form inside the sample-bequest guide. The visitor picks a kind of gift, fills in the blanks, sees the
// wording for their attorney appear as they type, and either keeps it (copy, download, print) or sends it to the Rabbi
// (the form "legacy-intent" in forms.json, whose "wording" box this page fills in). The clauses themselves are in
// /assets/bequest.js and stay in English: they are for an attorney. Only the labels are translated.
const { esc } = require('./md.js');

const KINDS = [
  ['sum', 'A specific sum', ['amount', 'use']],
  ['pct', 'A percentage of the estate', ['percent', 'use']],
  ['resid', 'The entire estate, or all that is left of it', ['use']],
  ['memory', 'A gift in memory or in honor of someone', ['amount', 'percent', 'honor', 'person', 'use']],
  ['dedic', 'A named dedication, such as a room', ['amount', 'what', 'inname']],
  ['contingent', 'Chabad as a successor beneficiary', ['first', 'use']],
  ['retire', 'A retirement account or life insurance', ['share']],
  ['stock', 'A gift of stock', ['shares', 'company', 'use']],
  ['daf', 'A donor-advised fund recommendation', ['percent', 'fund']],
];
const FIELDS = {
  amount: ['Amount in dollars', 'text', 'for example 5,000'],
  percent: ['Percentage of the estate (or of the fund)', 'text', 'for example 10'],
  honor: ['This gift is', 'select', ['In memory of', 'In honor of']],
  person: ['Name of the person', 'text', ''],
  what: ['What is dedicated (for example, a room)', 'text', ''],
  inname: ['In the name of', 'text', ''],
  first: ['Who must survive you (the first beneficiary)', 'text', ''],
  share: ['Share for Chabad of Lamorinda (percent)', 'text', 'for example 25'],
  shares: ['Number of shares (or "all of my shares")', 'text', ''],
  company: ['Company or fund', 'text', ''],
  fund: ['Name of your donor-advised fund and account', 'text', ''],
  use: ['Use the gift for', 'select', ['Its general purposes', 'Jewish education for future generations']],
};

function builderHtml(X) {
  const { t } = X;
  const field = (id) => {
    const [label, type, extra] = FIELDS[id];
    return type === 'select'
      ? `<label data-field="${id}">${esc(t(label))} <select data-v="${id}">${extra.map((o, i) => `<option value="${i}">${esc(t(o))}</option>`).join('')}</select></label>`
      : `<label data-field="${id}">${esc(t(label))} <input type="text" data-v="${id}" maxlength="120"${extra ? ` placeholder="${esc(t(extra))}"` : ''}></label>`;
  };
  return `<div class="card tool bequest" id="bequest" data-fields='${esc(JSON.stringify(Object.fromEntries(KINDS.map(([k, , f]) => [k, f]))))}' data-copied="${esc(t('Copied!'))}">
<script src="/assets/bequest.js" defer></script>
<label>${esc(t('Choose the kind of gift'))} <select data-kind>${KINDS.map(([k, name]) => `<option value="${k}">${esc(t(name))}</option>`).join('')}</select></label>
<div class="fields">${Object.keys(FIELDS).map(field).join('')}</div>
<h3>${esc(t('Your wording'))}</h3>
<blockquote class="bq-out" data-out aria-live="polite"></blockquote>
<p class="muted">${esc(t('This is sample wording for your attorney to adapt, in English. It is not legal or tax advice. Blanks (________) are left for you or your attorney to fill in.'))}</p>
<p class="btns"><button class="btn gold" type="button" data-act="copy">${esc(t('Copy'))}</button><button class="btn ghost" type="button" data-act="download">${esc(t('Download'))}</button><button class="btn ghost" type="button" data-act="print">${esc(t('Print'))}</button></p>
</div>`;
}
function shareHtml(X, formHtml, f) {
  const { t } = X;
  return `<div class="bequest-share"><h3>${esc(t('Or let the Rabbi know'))}</h3><p class="muted">${esc(t('Telling the Rabbi is entirely your choice. Nothing is binding, and your message goes only to the Rabbi. The box below is filled in with your wording as you type; you may change it.'))}</p>${formHtml(X, f, {})}</div>`;
}
module.exports = { builderHtml, shareHtml, KINDS };
