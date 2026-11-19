// Keys and settings the Rabbi can change from his phone (Rabbi area → Website and app → "Keys and settings"): the Stripe keys,
// the mail account, Google and Facebook. They are kept in the database, encrypted (AES-256-GCM, with a key made from
// SESSION_SECRET), never shown back (only "ends in 1234"), and applied when the website starts: saving restarts the website
// for a few seconds (the server brings it back by itself). A value saved here wins over the same name in the server's
// settings file; "Use the server's original" removes it. Nothing here can lock the Rabbi out: the Rabbi area password is not in the list.
// "Add another key or setting" adds a brand-new NAME (for something new Claude builds, which reads process.env.NAME); see isCustomId.
'use strict';
const crypto = require('crypto');
const fs = require('fs');

const KEY = 'secure-settings', LOG_KEY = 'secure-settings-log';
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const SETTINGS = [
  { id: 'STRIPE_SECRET_KEY', label: 'Stripe secret key', secret: true, help: 'Starts with sk_live_. In Stripe: Developers, API keys.', test: /^sk_(live|test)_[A-Za-z0-9]{10,}$/ },
  { id: 'STRIPE_PUBLISHABLE_KEY', label: 'Stripe publishable key', secret: true, help: 'Starts with pk_live_. Same page in Stripe.', test: /^pk_(live|test)_[A-Za-z0-9]{10,}$/ },
  { id: 'STRIPE_WEBHOOK_SECRET', label: 'Stripe webhook secret', secret: true, help: 'Starts with whsec_. In Stripe: the webhook, Signing secret.', test: /^whsec_[A-Za-z0-9]{10,}$/ },
  { id: 'SMTP_URL', label: 'Email account (sending)', secret: true, help: 'The mail address and its app password written as smtps://name%40gmail.com:app-password@smtp.gmail.com:465. Ask Claude to write it for you.', test: /^smtps?:\/\/\S+@\S+$/ },
  { id: 'MAIL_FROM', label: 'Emails are sent from', secret: false, help: 'For example: Chabad of Lamorinda <office@example.org>', test: /^(?:[^<>]*<[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>|[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+)$/ },
  { id: 'ADMIN_EMAIL', label: 'Where the Rabbi\'s notices go', secret: false, help: 'The address that gets requests, gifts and the 9 AM summary.', test: EMAIL },
  { id: 'GA_ID', label: 'Google Analytics code', secret: false, help: 'Looks like G-ABC123XYZ.', test: /^G-[A-Z0-9]{4,}$/ },
  { id: 'ANTHROPIC_API_KEY', label: 'AI answers in the chat', secret: true, help: 'Starts with sk-ant-. Optional; costs a little.', test: /^sk-ant-[A-Za-z0-9_-]{10,}$/ },
  { id: 'FB_PAGE_ID', label: 'Facebook page number', secret: false, help: 'Digits only.', test: /^\d{5,}$/ },
  { id: 'FB_PAGE_TOKEN', label: 'Facebook page key', secret: true, help: 'A long code from Facebook.', test: /^\S{20,}$/ },
  { id: 'IG_USER_ID', label: 'Instagram account number', secret: false, help: 'Digits only.', test: /^\d{5,}$/ },
  { id: 'VAPID_PUBLIC_KEY', label: 'App notifications: public key', secret: false, help: 'Claude makes the pair for you.', test: /^\S{20,}$/ },
  { id: 'VAPID_PRIVATE_KEY', label: 'App notifications: private key', secret: true, help: 'The other half of the pair.', test: /^\S{20,}$/ },
];
const BY_ID = Object.fromEntries(SETTINGS.map((s) => [s.id, s]));
// New keys and settings the Rabbi adds himself (for something new Claude adds to the website, which reads it by this name).
// Any name in CAPITAL_LETTERS_AND_NUMBERS except the ones that run the server itself (the database, the passwords, the web
// address, the program's own search paths): those stay in the server's settings file. Values are always kept hidden.
const CUSTOM_NAME = /^[A-Z][A-Z0-9_]{2,59}$/;
const PROTECTED = new Set(['PORT', 'PATH', 'HOME', 'USER', 'SHELL', 'DATABASE_URL', 'SESSION_SECRET', 'ADMIN_PASSWORD', 'PUBLIC_URL', 'RENDER', 'TZ']);
const PROTECTED_PREFIX = /^(NODE_|NPM_|LD_|DYLD_|PG|SYSTEMD_|SSH_|SUDO_)/;
const isCustomId = (id) => typeof id === 'string' && CUSTOM_NAME.test(id) && !PROTECTED.has(id) && !PROTECTED_PREFIX.test(id) && !BY_ID[id];

const keyOf = (secret) => crypto.createHash('sha256').update('chabad-settings:' + secret).digest();
function seal(plain, secret) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', keyOf(secret), iv);
  const enc = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}
function unseal(text, secret) {
  const [iv, tag, enc] = String(text).split('.').map((x) => Buffer.from(x, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', keyOf(secret), iv); d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}

// At start-up, before anything reads its settings: put the saved values into the environment.
async function applyOverrides(store, env, secret, log = console) {
  const applied = [];
  if (!store || !store.getKv) return applied;
  let saved = {};
  try { saved = (await store.getKv(KEY, null)) || {}; } catch (e) { log.error('settings:', e && e.message); return applied; }
  for (const id of Object.keys(saved)) {
    if (!saved[id] || !(BY_ID[id] || isCustomId(id))) continue;
    try { env[id] = unseal(saved[id], secret); applied.push(id); } catch (e) { log.error('settings: could not read ' + id + ' (the website secret changed?), using the server\'s value'); }
  }
  return applied;
}

const mask = (v) => (v.length >= 12 ? '••••' + v.slice(-4) : '••••');
const liveness = (v) => (/^(?:sk|pk)_live_/.test(v) ? 'live' : /^(?:sk|pk)_test_/.test(v) ? 'test' : '');

let restartHook = () => {};
const onRestart = (fn) => { restartHook = fn; };

function mountAdmin(r2, { authed, wrap }, { store, env = process.env, secret, notify = () => {}, log = console, restartAfterMs = 1500, logFile = '/var/log/website-maintenance.log' }) {
  const items = async () => ((store && store.getKv) ? (await store.getKv(KEY, null)) : null) || {};

  r2.get('/api/site/settings', authed, wrap(async (req, res) => {
    if (!store || !store.pool) return res.status(503).json({ code: 'not_configured', error: 'Needs the database.' });
    const saved = await items();
    const known = SETTINGS.map((s) => {
      let v = String(env[s.id] || '');
      if (saved[s.id]) { try { v = unseal(saved[s.id], secret); } catch (e) { /* unreadable: show the server's value */ } } // what is saved wins, even before the restart
      return { id: s.id, label: s.label, help: s.help, secret: s.secret, set: !!v, fromScreen: !!saved[s.id], hint: !v ? '' : s.secret ? mask(v) : v };
    });
    // the ones the Rabbi added himself
    const added = Object.keys(saved).filter((id) => isCustomId(id) && saved[id]).sort().map((id) => {
      let v = ''; try { v = unseal(saved[id], secret); } catch (e) { /* unreadable */ }
      return { id, label: id, help: 'Added by you.', secret: true, set: !!v, fromScreen: true, custom: true, hint: v ? mask(v) : '' };
    });
    res.json({ items: known.concat(added) });
  }));

  r2.post('/api/site/settings', authed, wrap(async (req, res) => {
    if (!store || !store.pool) return res.status(503).json({ code: 'not_configured', error: 'Needs the database.' });
    const values = req.body && typeof req.body.values === 'object' && req.body.values ? req.body.values : null;
    const ids = values ? Object.keys(values) : [];
    if (!ids.length) return res.status(400).json({ code: 'bad_request', error: 'Nothing to save.' });
    const saved = await items(), next = { ...saved }, eff = { ...env }, changed = [];
    for (const id of ids) {
      const known = BY_ID[id], s = known || (isCustomId(id) ? { label: id, custom: true } : null);
      if (!s) return res.status(400).json({ code: 'bad_request', error: '“' + String(id).slice(0, 60) + '” cannot be used as a name here. Use CAPITAL LETTERS, numbers and underscores (for example MY_NEW_KEY), at least 3 characters, and not one that runs the server itself (the database, passwords or web address).' });
      const v = String(values[id] == null ? '' : values[id]).trim();
      if (!v) { delete next[id]; changed.push(s.label + (known ? ' (back to the server\'s original)' : ' (removed)')); continue; }
      if (known ? (v.length > 600 || !known.test.test(v)) : (v.length > 2000 || /[\u0000-\u001f]/.test(v))) return res.status(400).json({ code: 'bad_value', error: s.label + ' does not look right.' + (known ? ' ' + known.help : ' Use a single line of up to 2000 characters.') });
      next[id] = seal(v, secret); eff[id] = v; changed.push(s.label + (known ? '' : ' (new)'));
    }
    // The two Stripe keys must be both live or both test, or the website would refuse to start.
    const a = liveness(String(eff.STRIPE_SECRET_KEY || '')), b = liveness(String(eff.STRIPE_PUBLISHABLE_KEY || ''));
    if (a && b && a !== b) return res.status(400).json({ code: 'bad_value', error: 'The Stripe secret key and publishable key must both be live (or both test). Paste both together, then save.' });
    await store.setKv(KEY, next);
    const log2 = ((await store.getKv(LOG_KEY, null)) || []);
    log2.unshift({ at: new Date().toISOString(), what: changed });
    await store.setKv(LOG_KEY, log2.slice(0, 30));
    notify('A website setting was changed', 'Changed in the Rabbi area: ' + changed.join(', ') + '.\n\nThe website restarts for a few seconds to use it. If you did not do this, change the Rabbi area password now.', '/admin');
    res.json({ ok: true, restarting: true, changed });
    setTimeout(() => { try { restartHook(); } catch (e) { log.error('restart:', e && e.message); } }, restartAfterMs).unref();
  }));

  // "Server care": is it healthy, and what the maintenance requests did lately (the log is written by deploy-oracle/maintenance.sh).
  r2.get('/api/site/care', authed, wrap(async (req, res) => {
    const out = { uptimeMinutes: Math.round(require('os').uptime() / 60), siteMinutes: Math.round(process.uptime() / 60), freeMemoryMb: Math.round(require('os').freemem() / 1048576) };
    try { const st = fs.statfsSync('/'); out.diskFreePercent = Math.round((st.bavail / st.blocks) * 100); out.diskFreeGb = Math.round((st.bavail * st.bsize) / 1073741824); } catch (e) { /* not available */ }
    try { out.maintenance = fs.readFileSync(logFile, 'utf8').trim().split('\n').slice(-30); } catch (e) { out.maintenance = null; }
    const changes = (store && store.getKv) ? ((await store.getKv(LOG_KEY, null).catch(() => null)) || []) : [];
    out.changes = changes.slice(0, 8);
    res.json(out);
  }));
}

module.exports = { SETTINGS, KEY, seal, unseal, applyOverrides, mountAdmin, onRestart, isCustomId };
