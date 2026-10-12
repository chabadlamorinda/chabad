// One pipeline for every channel (web, Telegram, SMS, WhatsApp):
// save the message and its files -> transcribe voice -> let the agent update the CRM -> save the reply.
'use strict';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function createInbox({ db, agent, transcribe, log = console }) {
  /**
   * @param {{ channel: string, chatId: string, text?: string,
   *           voice?: { buffer: Buffer, mime: string } | null,
   *           photos?: { buffer: Buffer, mime: string }[] }} msg
   * @returns {Promise<{ messageId: number, reply: string, transcript: string }>}
   */
  async function receive({ channel, chatId, text = '', voice = null, photos = [] }) {
    const kind = voice ? 'voice' : photos.length ? 'photo' : 'text';
    const messageId = db.addMessage({ channel, chat_id: chatId, kind, text });
    const notes = [];

    let transcript = '';
    if (voice) {
      db.saveAttachment({ message_id: messageId, kind: 'voice', mime: voice.mime, buffer: voice.buffer });
      if (!transcribe) notes.push('Voice notes need OPENAI_API_KEY to be set up, so I could not listen to this one. It is saved; please type it for now.');
      else {
        try { transcript = await transcribe(voice.buffer, voice.mime); db.setMessage(messageId, { transcript }); }
        catch (e) { log.error(e); notes.push('I could not transcribe that voice note. Please try again or type it.'); }
      }
    }

    const images = [];
    for (const p of photos) {
      const mime = p.mime.split(';')[0];
      db.saveAttachment({ message_id: messageId, kind: 'photo', mime, buffer: p.buffer });
      if (IMAGE_TYPES.includes(mime) && p.buffer.length <= MAX_IMAGE_BYTES) images.push({ mime, base64: p.buffer.toString('base64') });
      else notes.push('One photo was too large or in an unsupported format (use JPG or PNG), so I saved it but could not read it.');
    }

    let reply = '';
    if (text.trim() || transcript || images.length) {
      try { reply = await agent.handle({ messageId, chatId, channel, text, transcript, images }); }
      catch (e) { log.error(e); reply = 'Something went wrong on my side and I may not have finished saving this message. Please check the dashboard or ask me what was saved.'; }
    }
    reply = [...notes, reply].filter(Boolean).join('\n\n') || 'Got it.';
    db.setMessage(messageId, { reply });
    return { messageId, reply, transcript };
  }
  return { receive };
}

module.exports = { createInbox };
