// Email the Rabbi the moment something happens on the website (the Rabbi's direction: "make sure I get email
// notifications for everything"): RSVPs, new accounts, new weekly-email subscribers, chat questions, Kiddush
// sponsorships, gifts and monthly gifts that failed or stopped, alongside the emails the forms, requests, campaign and
// visitor alerts already send. To ADMIN_EMAIL, else the website's own email. Never slows or breaks the visitor's request.
'use strict';

function makeNotify({ mailer, notifyTo = '', content = null, base = '', log = console }) {
  return function notify(subject, text, where = '') {
    const to = notifyTo || (content && ((content() || {}).org || {}).email) || '';
    if (!mailer || !to) return;
    Promise.resolve(mailer.send({ to, subject, text: text + (where ? `\n\nRabbi area: ${base}${where}` : '') })).catch((e) => log.error('notify:', e && e.message));
  };
}
module.exports = { makeNotify };
