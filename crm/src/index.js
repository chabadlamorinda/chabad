// Start the CRM server. All settings come from environment variables (see .env.example).
'use strict';

const path = require('path');
const crypto = require('crypto');
const Anthropic = require('@anthropic-ai/sdk');
const { openDb } = require('./db');
const { createAgent } = require('./agent');
const { createTranscriber } = require('./transcribe');
const { createInbox } = require('./inbox');
const { createTelegram } = require('./telegram');
const { createTwilio } = require('./twilio');
const { createApp } = require('./app');

const env = process.env;
const list = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);

if (!env.ANTHROPIC_API_KEY) console.warn('ANTHROPIC_API_KEY is not set: the CRM cannot understand messages until it is.');
if (!env.ADMIN_PASSWORD) console.warn('ADMIN_PASSWORD is not set: nobody can log in to the dashboard until it is.');

const db = openDb(env.DATA_DIR || path.join(__dirname, '..', 'data'));
const agent = createAgent({
  client: new Anthropic(),
  db,
  model: env.CLAUDE_MODEL || 'claude-opus-5-5',
  timeZone: env.TIME_ZONE || 'America/Los_Angeles',
  log: (m) => console.log(m),
});
const transcribe = createTranscriber({ apiKey: env.OPENAI_API_KEY, model: env.TRANSCRIBE_MODEL || 'whisper-1' });
const inbox = createInbox({ db, agent, transcribe });
const sessionSecret = env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

const routers = [];
let telegram = null;
if (env.TELEGRAM_BOT_TOKEN) {
  // The webhook secret is derived from the session secret so there is one less thing to configure.
  const secret = env.TELEGRAM_WEBHOOK_SECRET || crypto.createHmac('sha256', sessionSecret).update('telegram').digest('hex').slice(0, 48);
  telegram = createTelegram({ token: env.TELEGRAM_BOT_TOKEN, secret, allowedUserIds: list(env.TELEGRAM_ALLOWED_USER_IDS), inbox });
  routers.push(telegram.router);
  telegram.secret = secret;
}
if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.PUBLIC_URL) {
  routers.push(createTwilio({
    accountSid: env.TWILIO_ACCOUNT_SID, authToken: env.TWILIO_AUTH_TOKEN, publicUrl: env.PUBLIC_URL,
    allowedNumbers: list(env.ALLOWED_PHONE_NUMBERS), inbox,
  }).router);
}

const app = createApp({ db, inbox, adminPassword: env.ADMIN_PASSWORD, sessionSecret, routers });
const port = Number(env.PORT || 3000);
app.listen(port, async () => {
  console.log(`CRM running on http://localhost:${port}`);
  // Tell Telegram where to deliver messages (safe to repeat on every start).
  if (telegram && env.PUBLIC_URL) {
    try {
      await telegram.api('setWebhook', {
        url: env.PUBLIC_URL.replace(/\/$/, '') + '/telegram/webhook',
        secret_token: telegram.secret,
        allowed_updates: ['message', 'edited_message'],
      });
      console.log('Telegram webhook set.');
    } catch (e) { console.error(e.message); }
  }
});
