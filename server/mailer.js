// Optional email sending for Kiddush payment reminders and confirmations.
// Switched on by two settings (see store/kiddush-setup.md): SMTP_URL (for Gmail: smtps://you%40gmail.com:APP_PASSWORD@smtp.gmail.com:465)
// and MAIL_FROM (e.g. "Chabad Lamorinda <you@gmail.com>"). Without them the admin page offers a prefilled email to send yourself.
'use strict';
function createMailer({ url, from }) {
  if (!url || !from) return null;
  // Give up after 10 to 20 seconds with a clear error instead of waiting for minutes (a blocked mail port makes a connection hang).
  const transport = require('nodemailer').createTransport(url, { connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000 });
  // html (optional): a designed version shown by email programs that can; headers: e.g. List-Unsubscribe;
  // attachments (optional): [{ filename, content }] (the weekly backup).
  return { from, send: ({ to, subject, text, html, headers, attachments }) => transport.sendMail({ from, to, subject, text, ...(html ? { html } : {}), ...(attachments ? { attachments } : {}), ...(headers ? { headers } : {}) }) };
}
module.exports = { createMailer };
