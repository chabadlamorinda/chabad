// Read the store's mailbox (IMAP) for supplier invoices and shipping charges.
//
// Works with Gmail / Google Workspace using an "app password", and with any other IMAP mailbox.
// Only emails that look like invoices are sent to the invoice reader, to keep costs low.
'use strict';

const { saveInvoice, htmlToText, findSupplier } = require('./invoices');

const KEYWORDS = /invoice|inv\s*#|bill(ing)?\b|statement|freight|shipping charge|delivery (receipt|ticket)|packing (slip|list)|order confirmation|credit memo/i;
const FIRST_RUN_DAYS = 30;
const MAX_PER_RUN = 40;

function imapConfig(env = process.env) {
  if (!env.IMAP_USER || !env.IMAP_PASSWORD) return null;
  return {
    host: env.IMAP_HOST || 'imap.gmail.com',
    port: Number(env.IMAP_PORT) || 993,
    secure: env.IMAP_SECURE !== 'false',
    auth: { user: env.IMAP_USER, pass: env.IMAP_PASSWORD },
    folder: env.IMAP_FOLDER || 'INBOX',
  };
}

/** Decide if a parsed email is worth reading as an invoice. */
function looksLikeInvoice(db, mail) {
  const from = (mail.from && mail.from.text) || '';
  if (findSupplier(db, { from, name: '' })) return true;          // a known supplier's address
  if (db.setting('email_known_senders_only') === '1') return false;
  const hay = (mail.subject || '') + ' ' + (mail.attachments || []).map((a) => a.filename || '').join(' ') + ' ' + String(mail.text || '').slice(0, 3000);
  return KEYWORDS.test(hay);
}

async function checkMailbox(db, extract, { config = imapConfig(), ImapFlow, simpleParser, now = Date.now() } = {}) {
  if (!config) return { skipped: 'Email is not set up (IMAP_USER / IMAP_PASSWORD).' };
  ImapFlow = ImapFlow || require('imapflow').ImapFlow;
  simpleParser = simpleParser || require('mailparser').simpleParser;
  const client = new ImapFlow({ host: config.host, port: config.port, secure: config.secure, auth: config.auth, logger: false });
  await client.connect();
  let scanned = 0, read = 0, saved = 0;
  const errors = [];
  try {
    const box = await client.mailboxOpen(config.folder, { readOnly: true });
    const validity = String(box.uidValidity);
    let lastUid = db.setting('imap_uid_validity') === validity ? Number(db.setting('imap_last_uid')) || 0 : 0;
    let uids;
    if (lastUid) uids = await client.search({ uid: (lastUid + 1) + ':*' }, { uid: true });
    else uids = await client.search({ since: new Date(now - FIRST_RUN_DAYS * 86400000) }, { uid: true });
    uids = (uids || []).filter((u) => u > lastUid).sort((a, b) => a - b);
    for (const uid of uids) {
      if (read >= MAX_PER_RUN) break;               // the rest wait for the next run
      const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
      scanned++;
      lastUid = uid;
      if (!msg || !msg.source) continue;
      const mail = await simpleParser(msg.source);
      if (!looksLikeInvoice(db, mail)) continue;
      const pdfs = [], images = [];
      for (const a of mail.attachments || []) {
        if (a.contentType === 'application/pdf' || /\.pdf$/i.test(a.filename || '')) pdfs.push(a.content);
        else if (/^image\/(png|jpeg|gif|webp)$/.test(a.contentType) && a.size > 20000) images.push({ type: a.contentType, data: a.content });
      }
      read++;
      let failed = false;
      try {
        const data = await extract({ subject: mail.subject || '', from: (mail.from && mail.from.text) || '', text: mail.text || htmlToText(mail.html), pdfs, images });
        const id = saveInvoice(db, data, { source: 'email', email_id: mail.messageId || 'uid:' + validity + ':' + uid, subject: mail.subject || '', from: (mail.from && mail.from.text) || '' });
        if (id) saved++;
      } catch (e) {
        errors.push((mail.subject || 'email') + ': ' + e.message);
        // Try this email again next time (up to 3 times) instead of skipping past it.
        const tries = db.setting('imap_fail_uid') === String(uid) ? Number(db.setting('imap_fail_count')) + 1 : 1;
        db.setSetting('imap_fail_uid', String(uid)); db.setSetting('imap_fail_count', String(tries));
        if (tries < 3) { lastUid = uid - 1; failed = true; }
      }
      db.setSetting('imap_uid_validity', validity);
      db.setSetting('imap_last_uid', String(lastUid));
      if (failed) break;
    }
    db.setSetting('imap_uid_validity', validity);
    db.setSetting('imap_last_uid', String(lastUid));
  } finally {
    await client.logout().catch(() => {});
  }
  return { scanned, read, saved, errors };
}

module.exports = { checkMailbox, imapConfig, looksLikeInvoice };
