// Optional: talk to the CRM over WhatsApp or plain SMS/MMS through Twilio.
//
// Point the Twilio number's (or WhatsApp sender's) "A message comes in" webhook at
// https://<your-app>/twilio/webhook. We check Twilio's signature, answer at once with empty TwiML,
// do the work in the background, then send the reply through Twilio's API.
'use strict';

const crypto = require('crypto');
const express = require('express');
const { chunks } = require('./telegram');

function validSignature(authToken, url, params, signature) {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join('');
  const expected = crypto.createHmac('sha1', authToken).update(Buffer.from(data, 'utf8')).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function createTwilio({ accountSid, authToken, publicUrl, allowedNumbers, inbox, fetchImpl = fetch, log = console }) {
  const auth = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const webhookUrl = publicUrl.replace(/\/$/, '') + '/twilio/webhook';
  const strip = (n) => String(n || '').replace(/^whatsapp:/, '');

  const send = async (to, from, text) => {
    for (const part of chunks(text, 1500)) {
      const r = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        method: 'POST',
        headers: { authorization: auth, 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ To: to, From: from, Body: part }),
      });
      if (!r.ok) throw new Error(`Twilio send failed (${r.status}): ${(await r.text()).slice(0, 200)}`);
    }
  };

  async function process(p) {
    const channel = String(p.From).startsWith('whatsapp:') ? 'whatsapp' : 'sms';
    if (!allowedNumbers.includes(strip(p.From))) return; // silently ignore strangers
    let voice = null;
    const photos = [];
    for (let i = 0; i < Number(p.NumMedia || 0); i++) {
      const type = String(p[`MediaContentType${i}`] || '');
      const r = await fetchImpl(p[`MediaUrl${i}`], { headers: { authorization: auth } });
      if (!r.ok) throw new Error(`Twilio media download failed: ${r.status}`);
      const buffer = Buffer.from(await r.arrayBuffer());
      if (type.startsWith('image/')) photos.push({ buffer, mime: type });
      else if (type.startsWith('audio/') || type.startsWith('video/')) voice = { buffer, mime: type };
    }
    const { reply, transcript } = await inbox.receive({ channel, chatId: `${channel}:${strip(p.From)}`, text: p.Body || '', voice, photos });
    await send(p.From, p.To, transcript ? `🎙 "${transcript}"\n\n${reply}` : reply);
  }

  const router = express.Router();
  router.post('/twilio/webhook', express.urlencoded({ extended: false }), (req, res) => {
    if (!validSignature(authToken, webhookUrl, req.body || {}, req.get('x-twilio-signature'))) return res.sendStatus(403);
    res.type('text/xml').send('<Response></Response>');
    process(req.body).catch(async (e) => {
      log.error(e);
      send(req.body.From, req.body.To, 'Sorry, something went wrong with that message. Please try again.').catch(() => {});
    });
  });
  return { router, process };
}

module.exports = { createTwilio, validSignature };
