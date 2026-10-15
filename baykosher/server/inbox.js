// Reads supplier invoices from email. READ-ONLY: it never changes, moves or deletes anything in the mailbox;
// it remembers which messages it has looked at in our own database. Use a Gmail "app password" for access.
'use strict';

const ATTACH = /^(application\/pdf|image\/(png|jpeg|gif|webp)|text\/(csv|plain))$/i;
const INVOICEY = /invoice|statement|packing\s*slip|bill of lading|freight|pallet|delivery (receipt|ticket)|credit memo/i;
const addr = (a) => String(a || '').toLowerCase().replace(/^.*</, '').replace(/>.*$/, '').trim();

function senderMatches(from, list) {
  const a = addr(from), domain = a.split('@')[1] || '';
  return list.some((x) => { x = String(x).toLowerCase().trim(); return x && (a === x || domain === x.replace(/^@/, '') || (x.includes('@') ? a === x : domain.endsWith(x))); });
}

// parsed = mailparser output: { from, subject, text, attachments:[{filename, contentType, content}], messageId }
async function processParsed(parsed, { purchasing, senders = [] }) {
  const from = parsed.from && parsed.from.text ? parsed.from.text : '';
  const subject = parsed.subject || '';
  const known = senderMatches(from, senders);
  const out = { ingested: [], skipped: 0 };
  const files = (parsed.attachments || []).filter((a) => ATTACH.test(a.contentType) && a.content && a.content.length > 200 && a.contentDisposition !== 'inline');
  for (const a of files) {
    if (!known && !INVOICEY.test(subject + ' ' + (a.filename || ''))) { out.skipped++; continue; } // a stranger's picture is not an invoice
    const csv = /csv|text\/plain/i.test(a.contentType);
    const r = await purchasing.ingest({ buffer: csv ? null : a.content, text: csv ? a.content.toString('utf8') : '', mediaType: a.contentType, filename: a.filename || '', source: 'email', sourceRef: `${parsed.messageId || subject}:${a.filename || a.checksum || ''}`, sender: from, subject });
    out.ingested.push(r);
  }
  // some suppliers paste the invoice into the email itself
  if (!files.length && (known || INVOICEY.test(subject)) && /\d+\.\d{2}/.test(parsed.text || '') && (parsed.text || '').length > 80) {
    out.ingested.push(await purchasing.ingest({ text: parsed.text, mediaType: 'text/plain', filename: '', source: 'email', sourceRef: `${parsed.messageId || subject}:body`, sender: from, subject }));
  }
  return out;
}

// accounts: [{ user, pass, host?, port? }]
async function pollInbox({ db, purchasing, settings, accounts, sinceDays = 21, limit = 30, clientFactory }) {
  const { simpleParser } = require('mailparser');
  const cfg = (await settings.all()).inbox || {};
  if (cfg.enabled === false) return { checked: 0, ingested: 0, disabled: true };
  const supplierEmails = (await db.rows(`SELECT email FROM suppliers WHERE email <> ''`)).map((s) => s.email);
  const senders = [...(cfg.senders || []), ...supplierEmails];
  const summary = { checked: 0, ingested: 0, errors: [] };
  for (const acct of accounts) {
    let client;
    try {
      client = clientFactory ? clientFactory(acct) : new (require('imapflow').ImapFlow)({ host: acct.host || 'imap.gmail.com', port: acct.port || 993, secure: true, auth: { user: acct.user, pass: acct.pass }, logger: false });
      await client.connect();
      const lock = await client.getMailboxLock('INBOX', { readOnly: true });
      try {
        const since = new Date(Date.now() - sinceDays * 86400000);
        const uids = (await client.search({ since })) || [];
        for (const uid of uids.slice(-300).reverse()) {
          if (summary.checked >= limit) break;
          const env = await client.fetchOne(uid, { envelope: true }, { uid: true });
          const mid = env && env.envelope && env.envelope.messageId;
          if (!mid) continue;
          if (await db.one('SELECT 1 FROM inbox_seen WHERE message_id=$1', [mid])) continue;
          const full = await client.fetchOne(uid, { source: true }, { uid: true });
          const parsed = await simpleParser(full.source);
          parsed.messageId = mid;
          const r = await processParsed(parsed, { purchasing, senders });
          summary.checked++; summary.ingested += r.ingested.filter((x) => !x.duplicate && x.status !== 'ignored').length;
          await db.q('INSERT INTO inbox_seen (message_id, account, outcome) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [mid, acct.user, r.ingested.length ? 'ingested' : 'skipped']);
        }
      } finally { lock.release(); }
      await client.logout();
    } catch (e) { summary.errors.push(`${acct.user}: ${e.message}`); try { client && (await client.close()); } catch {} }
  }
  await db.q('INSERT INTO sync_log (kind, summary) VALUES ($1,$2)', ['inbox', summary]);
  return summary;
}

const accountsFromEnv = (env) => { try { const a = JSON.parse(env.INBOXES || '[]'); return Array.isArray(a) ? a.filter((x) => x.user && x.pass) : []; } catch { return []; } };

module.exports = { processParsed, pollInbox, senderMatches, accountsFromEnv };
