// The private "Ask the Rabbi" form: a question that goes only to the Rabbi (saved in the Rabbi area with Call / Text /
// WhatsApp / Email buttons, and emailed to him), so he can answer the person directly. The person leaves an email or a phone
// number (one is enough). Used on /ask, on the help pages and, in a fuller version, on /contact.
'use strict';
const { esc } = require('./md.js');

function rabbiForm(X, subject, kind = 'rabbi') {
  const t = X.t;
  return `<form class="card tool" data-submit data-kind="${esc(kind)}">
  <p class="muted">${esc(t('Private and confidential: only the Rabbi reads it.'))}</p>
  <input type="hidden" name="title" value="${esc(subject)}">
  <label>${esc(t('How can we help?'))} <textarea name="body" rows="5" maxlength="2000" required></textarea></label>
  <label>${esc(t('Your name'))} <input name="name" autocomplete="name" required></label>
  <p class="muted small">${esc(t('So the Rabbi can answer you directly, please leave an email or a phone number (one is enough).'))}</p>
  <div class="fields"><label>${esc(t('Your email'))} <input name="email" type="email" autocomplete="email"></label><label>${esc(t('Your phone'))} <input name="phone" type="tel" autocomplete="tel" data-extra="Phone"></label></div>
  <button class="btn gold" type="submit">${esc(t('Send to the Rabbi'))}</button><p class="msg" hidden></p></form>`;
}
module.exports = { rabbiForm };
