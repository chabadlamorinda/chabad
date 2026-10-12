// Telegram bot: the easiest way to send the CRM text, voice notes and photos from a phone (free).
//
// Telegram POSTs every message to /telegram/webhook. We answer 200 straight away, do the work in the
// background, then send the reply with the Bot API. Only Telegram user ids listed in
// TELEGRAM_ALLOWED_USER_IDS are served; everyone else gets their id back so it can be added.
'use strict';

const express = require('express');

function chunks(text, size) {
  const out = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out.length ? out : [''];
}

function createTelegram({ token, secret, allowedUserIds, inbox, fetchImpl = fetch, log = console }) {
  const api = async (method, body) => {
    const r = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) throw new Error(`Telegram ${method} failed: ${j.description || r.status}`);
    return j.result;
  };
  const download = async (fileId) => {
    const f = await api('getFile', { file_id: fileId });
    const r = await fetchImpl(`https://api.telegram.org/file/bot${token}/${f.file_path}`);
    if (!r.ok) throw new Error(`Telegram download failed: ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  };
  const send = async (chatId, text) => {
    for (const part of chunks(text, 4000)) await api('sendMessage', { chat_id: chatId, text: part });
  };

  const seen = new Set();
  async function process(update) {
    const m = update.message || update.edited_message;
    if (!m || !m.from) return;
    const chatId = m.chat.id;
    if (!allowedUserIds.includes(String(m.from.id))) {
      await send(chatId, `This is a private CRM. Your Telegram id is ${m.from.id}. Ask the admin to add it to TELEGRAM_ALLOWED_USER_IDS.`);
      return;
    }
    if (m.text === '/start') {
      await send(chatId, 'Shalom! Send me a text, a voice note or a photo (check, card, note) and I will update the CRM. Ask me anything, e.g. "How much did we raise this year?"');
      return;
    }
    api('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {});

    let voice = null;
    const photos = [];
    const audio = m.voice || m.audio || (m.video_note && { ...m.video_note, mime_type: 'video/mp4' });
    if (audio) voice = { buffer: await download(audio.file_id), mime: audio.mime_type || 'audio/ogg' };
    if (m.photo && m.photo.length) {
      const best = m.photo[m.photo.length - 1]; // largest size Telegram made
      photos.push({ buffer: await download(best.file_id), mime: 'image/jpeg' });
    }
    if (m.document && /^image\//.test(m.document.mime_type || '')) photos.push({ buffer: await download(m.document.file_id), mime: m.document.mime_type });
    if (m.document && /^audio\//.test(m.document.mime_type || '')) voice = { buffer: await download(m.document.file_id), mime: m.document.mime_type };

    const text = m.text || m.caption || '';
    if (!text && !voice && !photos.length) { await send(chatId, 'I can read text, voice notes and photos.'); return; }
    const { reply, transcript } = await inbox.receive({ channel: 'telegram', chatId: `tg:${chatId}`, text, voice, photos });
    await send(chatId, transcript ? `🎙 "${transcript}"\n\n${reply}` : reply);
  }

  const router = express.Router();
  router.post('/telegram/webhook', express.json({ limit: '1mb' }), (req, res) => {
    if (req.get('x-telegram-bot-api-secret-token') !== secret) return res.sendStatus(401);
    res.sendStatus(200);
    const u = req.body || {};
    if (seen.has(u.update_id)) return;
    seen.add(u.update_id);
    if (seen.size > 1000) seen.delete(seen.values().next().value);
    process(u).catch(async (e) => {
      log.error(e);
      const chatId = u.message && u.message.chat && u.message.chat.id;
      if (chatId) send(chatId, 'Sorry, something went wrong with that message. Please try again.').catch(() => {});
    });
  });

  return { router, api, process };
}

module.exports = { createTelegram, chunks };
