// Optional email sending for Kiddush payment reminders and confirmations.
// Switched on by two settings (see store/kiddush-setup.md): SMTP_URL (for Gmail: smtps://you%40gmail.com:APP_PASSWORD@smtp.gmail.com:465)
// and MAIL_FROM (e.g. "Chabad of Anytown <you@gmail.com>"). Without them the admin page offers a prefilled email to send yourself.
'use strict';
function createMailer({ url, from }) {
  if (!url || !from) return null;
  const transport = require('nodemailer').createTransport(url);
  return { from, send: ({ to, subject, text }) => transport.sendMail({ from, to, subject, text }) };
}
module.exports = { createMailer };
