// Postgres storage for members, yahrzeits, push subscriptions, follow-ups and payment events.
// Only used when DATABASE_URL is set; the app works without it (those features simply switch off).
'use strict';
const crypto = require('crypto');
const { Pool } = require('pg');
const { kiddushStore } = require('./kiddush-store.js');
const { SCHEMA: SITE_SCHEMA } = require('./site/community.js');
const { SCHEMA: OUTREACH_SCHEMA } = require('./site/outreach.js');

const newId = (p) => p + crypto.randomBytes(12).toString('hex');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '',
  stripe_customer_id TEXT,
  share_yahrzeits BOOLEAN NOT NULL DEFAULT FALSE,
  card_issue TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS members_email_idx ON members (lower(email));
CREATE INDEX IF NOT EXISTS members_stripe_idx ON members (stripe_customer_id);
CREATE TABLE IF NOT EXISTS yahrzeits (
  id TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  name TEXT NOT NULL, relation TEXT NOT NULL DEFAULT '', h_day INT NOT NULL, h_month TEXT NOT NULL, h_year INT,
  notes TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS yahrzeits_member_idx ON yahrzeits (member_id);
CREATE TABLE IF NOT EXISTS push_subs (
  id TEXT PRIMARY KEY, member_id TEXT REFERENCES members(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
  prefs JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS push_log (sub_id TEXT NOT NULL, key TEXT NOT NULL, sent_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (sub_id, key));
CREATE TABLE IF NOT EXISTS followups (
  yahrzeit_id TEXT NOT NULL, occurrence DATE NOT NULL, note TEXT NOT NULL DEFAULT '', done_at TIMESTAMPTZ,
  PRIMARY KEY (yahrzeit_id, occurrence)
);
CREATE TABLE IF NOT EXISTS payment_events (
  event_id TEXT PRIMARY KEY, type TEXT NOT NULL, customer_id TEXT, email TEXT NOT NULL DEFAULT '',
  amount_cents INT NOT NULL DEFAULT 0, message TEXT NOT NULL DEFAULT '', resolved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE members ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS members_verified_email_idx ON members (lower(email)) WHERE verified_at IS NOT NULL;
CREATE TABLE IF NOT EXISTS auth_codes (email TEXT PRIMARY KEY, code_hash TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, attempts INT NOT NULL DEFAULT 0, sent_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS account_state (member_id TEXT PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE, rev INT NOT NULL DEFAULT 1, state JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS community_days (day DATE PRIMARY KEY, coins INT NOT NULL DEFAULT 0, cents BIGINT NOT NULL DEFAULT 0);`;

function createStore(url, opts = {}) {
  const pool = new Pool({ connectionString: url, max: 5, ssl: /sslmode=require/.test(url) || process.env.DATABASE_SSL === '1' ? { rejectUnauthorized: false } : undefined, ...opts });
  const q = (text, params) => pool.query(text, params);
  const rows = async (text, params) => (await q(text, params)).rows;
  const one = async (text, params) => (await q(text, params)).rows[0] || null;

  const kiddush = kiddushStore({ q, rows, one });
  return {
    ...kiddush,
    pool,
    migrate: async () => { await q(SCHEMA); await q(kiddush.kiddushSchema); await q(SITE_SCHEMA); await q(OUTREACH_SCHEMA); },
    close: () => pool.end(),
    reset: async () => { // tests only (the shareable kit has no website tables)
      const want = ['members', 'yahrzeits', 'push_subs', 'push_log', 'followups', 'payment_events', 'family', 'rsvps', 'login_codes', 'submissions', 'social_posts', 'email_log', 'form_responses', 'chat_questions', 'email_unsubscribes', 'qa', 'member_activity', 'auth_codes', 'account_state', 'outreach_done', 'kv', 'community_days', 'fin_tx', 'fin_people', 'fin_budget'];
      const have = (await q('SELECT tablename FROM pg_tables WHERE schemaname = current_schema() AND tablename = ANY($1)', [want])).rows.map((r) => r.tablename);
      if (have.length) await q(`TRUNCATE ${have.join(', ')} CASCADE`);
    },

    // ----- members -----
    async createMember(m) {
      const id = newId('m_');
      await q('INSERT INTO members (id, name, email, phone, address) VALUES ($1,$2,$3,$4,$5)', [id, m.name, m.email, m.phone || '', m.address || '']);
      return id;
    },
    updateMember: (id, m) => q('UPDATE members SET name=$2, email=$3, phone=$4, address=$5, updated_at=now() WHERE id=$1', [id, m.name, m.email, m.phone || '', m.address || '']),
    getMember: (id) => one('SELECT * FROM members WHERE id=$1', [id]),
    linkStripe: (id, cus) => q('UPDATE members SET stripe_customer_id=$2, updated_at=now() WHERE id=$1', [id, cus]),
    setShare: (id, on) => q('UPDATE members SET share_yahrzeits=$2, updated_at=now() WHERE id=$1', [id, !!on]),
    deleteMember: (id) => q('DELETE FROM members WHERE id=$1', [id]),
    listMembers: () => rows(`SELECT m.*, (SELECT count(*) FROM yahrzeits y WHERE y.member_id=m.id)::int AS yahrzeit_count,
      (SELECT count(*) FROM push_subs p WHERE p.member_id=m.id)::int AS push_count FROM members m ORDER BY m.created_at DESC`),

    // ----- yahrzeits -----
    async replaceYahrzeits(memberId, entries) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await c.query("DELETE FROM yahrzeits WHERE member_id=$1 AND source='app'", [memberId]); // the website's own entries (source 'web') stay
        for (const e of entries) await c.query('INSERT INTO yahrzeits (id, member_id, name, relation, h_day, h_month, h_year, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [memberId + ':' + e.id, memberId, e.name, e.relation, e.day, e.month, e.year || null, e.notes]);
        await c.query('COMMIT');
      } catch (err) { await c.query('ROLLBACK'); throw err; } finally { c.release(); }
    },
    listYahrzeits: (memberId) => rows('SELECT * FROM yahrzeits WHERE member_id=$1 ORDER BY created_at', [memberId]),
    // Only members who agreed to share. This is the list the Rabbi sees.
    sharedYahrzeits: () => rows(`SELECT y.*, m.name AS member_name, m.email, m.phone, m.address FROM yahrzeits y JOIN members m ON m.id=y.member_id WHERE m.share_yahrzeits = TRUE ORDER BY y.created_at`),
    allYahrzeitsWithPush: () => rows(`SELECT y.* FROM yahrzeits y WHERE y.member_id IN (SELECT member_id FROM push_subs WHERE member_id IS NOT NULL)`),

    // ----- push -----
    async upsertPushSub(s) {
      const id = newId('p_');
      await q(`INSERT INTO push_subs (id, member_id, endpoint, p256dh, auth, prefs) VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (endpoint) DO UPDATE SET member_id=COALESCE(EXCLUDED.member_id, push_subs.member_id), p256dh=EXCLUDED.p256dh, auth=EXCLUDED.auth, prefs=EXCLUDED.prefs`, [id, s.memberId || null, s.endpoint, s.p256dh, s.auth, JSON.stringify(s.prefs || {})]);
    },
    updatePrefs: (endpoint, prefs) => q('UPDATE push_subs SET prefs=$2 WHERE endpoint=$1', [endpoint, JSON.stringify(prefs)]),
    deletePushSub: (endpoint) => q('DELETE FROM push_subs WHERE endpoint=$1', [endpoint]),
    listPushSubs: () => rows('SELECT * FROM push_subs'),
    async logOnce(subId, key) { return (await q('INSERT INTO push_log (sub_id, key) VALUES ($1,$2) ON CONFLICT DO NOTHING', [subId, key])).rowCount === 1; },

    // ----- Rabbi follow-ups -----
    setFollowup: (yid, occurrence, note, done) => q(`INSERT INTO followups (yahrzeit_id, occurrence, note, done_at) VALUES ($1,$2,$3, CASE WHEN $4 THEN now() ELSE NULL END)
      ON CONFLICT (yahrzeit_id, occurrence) DO UPDATE SET note=EXCLUDED.note, done_at=EXCLUDED.done_at`, [yid, occurrence, note, !!done]),
    listFollowups: () => rows("SELECT yahrzeit_id, to_char(occurrence,'YYYY-MM-DD') AS occurrence, note, done_at FROM followups"),

    // ----- payment events (from Stripe webhooks) -----
    // ----- sign-in with an emailed code, and the saved pushka that follows the person between devices -----
    async putAuthCode(email, hash, minutes) { await q(`INSERT INTO auth_codes (email, code_hash, expires_at, attempts, sent_at) VALUES ($1,$2, now() + ($3 || ' minutes')::interval, 0, now())
      ON CONFLICT (email) DO UPDATE SET code_hash=EXCLUDED.code_hash, expires_at=EXCLUDED.expires_at, attempts=0, sent_at=now()`, [email, hash, String(minutes)]); },
    getAuthCode: (email) => one('SELECT *, (expires_at > now()) AS live, extract(epoch FROM (now() - sent_at)) AS age FROM auth_codes WHERE email=$1', [email]),
    bumpAuthAttempts: (email) => q('UPDATE auth_codes SET attempts = attempts + 1 WHERE email=$1', [email]),
    deleteAuthCode: (email) => q('DELETE FROM auth_codes WHERE email=$1', [email]),
    verifiedMemberByEmail: (email) => one('SELECT * FROM members WHERE lower(email)=lower($1) AND verified_at IS NOT NULL', [email]),
    async createVerifiedMember(email, name) { const id = newId('m_'); await q('INSERT INTO members (id, name, email, verified_at) VALUES ($1,$2,$3, now())', [id, name || '', email]); return id; },
    getState: (memberId) => one('SELECT rev, state, updated_at FROM account_state WHERE member_id=$1', [memberId]),
    // Save a new version only if the caller saw the latest one (baseRev). Returns the new revision, or null when someone else saved first.
    async putState(memberId, baseRev, state) {
      if (!baseRev) { const r = await q('INSERT INTO account_state (member_id, rev, state) VALUES ($1, 1, $2) ON CONFLICT DO NOTHING RETURNING rev', [memberId, JSON.stringify(state)]); return r.rows[0] ? r.rows[0].rev : null; }
      const r = await q('UPDATE account_state SET rev = rev + 1, state=$3, updated_at=now() WHERE member_id=$1 AND rev=$2 RETURNING rev', [memberId, baseRev, JSON.stringify(state)]);
      return r.rows[0] ? r.rows[0].rev : null;
    },
    async forceState(memberId, state) { const r = await q(`INSERT INTO account_state (member_id, rev, state) VALUES ($1, 1, $2) ON CONFLICT (member_id) DO UPDATE SET rev = account_state.rev + 1, state=EXCLUDED.state, updated_at=now() RETURNING rev`, [memberId, JSON.stringify(state)]); return r.rows[0].rev; },

    // ----- small shared settings (announcements) and the anonymous community coin counter -----
    async getKv(key, fallback = null) { const r = await one('SELECT value FROM kv WHERE key=$1', [key]); return r ? r.value : fallback; },
    setKv: (key, value) => q('INSERT INTO kv (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()', [key, JSON.stringify(value)]),
    addCommunity: (day, coins, cents) => q('INSERT INTO community_days (day, coins, cents) VALUES ($1,$2,$3) ON CONFLICT (day) DO UPDATE SET coins=community_days.coins+EXCLUDED.coins, cents=community_days.cents+EXCLUDED.cents', [day, coins, cents]),
    async communitySince(day) { const r = await one("SELECT COALESCE(sum(coins),0)::int AS coins, COALESCE(sum(cents),0)::bigint AS cents FROM community_days WHERE day >= $1", [day]); return { coins: r.coins, cents: Number(r.cents) }; },

    async recordPaymentEvent(e) {
      return (await q('INSERT INTO payment_events (event_id, type, customer_id, email, amount_cents, message) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING', [e.id, e.type, e.customerId || null, e.email || '', e.amount || 0, e.message || ''])).rowCount === 1;
    },
    listPaymentEvents: () => rows('SELECT * FROM payment_events ORDER BY created_at DESC LIMIT 200'),
    resolvePayment: (eventId) => q('UPDATE payment_events SET resolved=TRUE WHERE event_id=$1', [eventId]),
    resolveCustomerPayments: (cus) => q("UPDATE payment_events SET resolved=TRUE WHERE customer_id=$1 AND type LIKE '%failed'", [cus]),
    flagCardIssue: (cus, msg) => q('UPDATE members SET card_issue=$2 WHERE stripe_customer_id=$1', [cus, msg || 'payment_failed']),
    clearCardIssue: (cus) => q("UPDATE members SET card_issue='' WHERE stripe_customer_id=$1", [cus]),
  };
}
module.exports = { createStore, newId };
