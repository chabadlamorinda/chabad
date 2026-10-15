// Email (Resend) and text messages (Twilio). Without keys they are only written to notify_log, so the
// whole app can be tried safely. Every message is logged.
'use strict';

function createNotifier(db, env = process.env, fetchImpl = globalThis.fetch) {
  const log = (channel, recipient, subject, body, ok, error = '') =>
    db.q('INSERT INTO notify_log (channel, recipient, subject, body, ok, error) VALUES ($1,$2,$3,$4,$5,$6)', [channel, recipient, subject, body, ok, error]).catch(() => {});
  return {
    live: { email: !!env.RESEND_API_KEY, sms: !!(env.TWILIO_SID && env.TWILIO_TOKEN && env.TWILIO_FROM) },
    async email(to, subject, html) {
      if (!to) return false;
      if (!env.RESEND_API_KEY) { await log('email', to, subject, html, true, 'not sent: RESEND_API_KEY not set'); return false; }
      try {
        const r = await fetchImpl('https://api.resend.com/emails', {
          method: 'POST', headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: env.EMAIL_FROM || 'Bay Kosher <orders@baykosher.com>', to, subject, html }),
        });
        if (!r.ok) throw new Error('Resend ' + r.status);
        await log('email', to, subject, html, true); return true;
      } catch (e) { await log('email', to, subject, html, false, String(e.message)); return false; }
    },
    async sms(to, text) {
      if (!to) return false;
      if (!(env.TWILIO_SID && env.TWILIO_TOKEN && env.TWILIO_FROM)) { await log('sms', to, '', text, true, 'not sent: Twilio not configured'); return false; }
      try {
        const r = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_SID}/Messages.json`, {
          method: 'POST',
          headers: { Authorization: 'Basic ' + Buffer.from(env.TWILIO_SID + ':' + env.TWILIO_TOKEN).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ To: to, From: env.TWILIO_FROM, Body: text }),
        });
        if (!r.ok) throw new Error('Twilio ' + r.status);
        await log('sms', to, '', text, true); return true;
      } catch (e) { await log('sms', to, '', text, false, String(e.message)); return false; }
    },
  };
}

module.exports = { createNotifier };
