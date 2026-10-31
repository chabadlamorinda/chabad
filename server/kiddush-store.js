// Postgres storage for the Kiddush board: settings, per-slot overrides, custom events and sponsorships.
// A slot (one Shabbat or holiday day) can have several live sponsorships (pending or paid): co-sponsors are welcome.
'use strict';
const crypto = require('crypto');

const newId = (p) => p + crypto.randomBytes(12).toString('hex');
const HOLD_MINUTES = 35; // an unfinished card checkout releases its week after this long (Stripe sessions last 30)

const SCHEMA = `
CREATE TABLE IF NOT EXISTS kiddush_settings (key TEXT PRIMARY KEY, value JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS kiddush_slots (
  slot_key TEXT PRIMARY KEY, hidden BOOLEAN NOT NULL DEFAULT FALSE, price_cents INT, title TEXT
);
CREATE TABLE IF NOT EXISTS kiddush_events (
  id TEXT PRIMARY KEY, event_date DATE NOT NULL, title TEXT NOT NULL, title_he TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS kiddush_sponsorships (
  id TEXT PRIMARY KEY, slot_key TEXT NOT NULL,
  status TEXT NOT NULL,                       -- pending | paid | released | expired
  method TEXT NOT NULL,                       -- card | zelle | venmo | check | cash | other
  name TEXT NOT NULL, anonymous BOOLEAN NOT NULL DEFAULT FALSE,
  dedication_kind TEXT NOT NULL DEFAULT '', dedication TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
  amount_cents INT NOT NULL DEFAULT 0, fee_cents INT NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'online',      -- online | admin
  idem TEXT UNIQUE, stripe_session_id TEXT, stripe_payment_intent TEXT,
  paid_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP INDEX IF EXISTS kiddush_live_slot; -- a week can now have more than one sponsor
CREATE INDEX IF NOT EXISTS kiddush_slot_idx ON kiddush_sponsorships (slot_key);
ALTER TABLE kiddush_sponsorships ADD COLUMN IF NOT EXISTS reminded_at TIMESTAMPTZ;
ALTER TABLE kiddush_sponsorships ADD COLUMN IF NOT EXISTS show_public BOOLEAN NOT NULL DEFAULT FALSE; -- shown on the board while still waiting for payment (staff choice)
ALTER TABLE kiddush_sponsorships ADD COLUMN IF NOT EXISTS reminder_count INT NOT NULL DEFAULT 0;
ALTER TABLE kiddush_sponsorships ADD COLUMN IF NOT EXISTS remind_at TIMESTAMPTZ;
ALTER TABLE kiddush_sponsorships ADD COLUMN IF NOT EXISTS reminders_off BOOLEAN NOT NULL DEFAULT FALSE;
CREATE TABLE IF NOT EXISTS kiddush_notes (
  id TEXT PRIMARY KEY, note_date DATE NOT NULL, kind TEXT NOT NULL DEFAULT 'note', text TEXT NOT NULL, text_he TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kiddush_sp_email ON kiddush_sponsorships (lower(email));
CREATE INDEX IF NOT EXISTS kiddush_sp_session ON kiddush_sponsorships (stripe_session_id);`;

const COLS = { name: 'name', anonymous: 'anonymous', dedicationKind: 'dedication_kind', dedication: 'dedication', email: 'email', phone: 'phone', note: 'note', amountCents: 'amount_cents', feeCents: 'fee_cents', method: 'method', showPublic: 'show_public' };

function kiddushStore({ q, rows, one }) {
  const expire = () => q(`UPDATE kiddush_sponsorships SET status='expired', updated_at=now() WHERE status='pending' AND method='card' AND created_at < now() - interval '${HOLD_MINUTES} minutes'`);
  return {
    kiddushSchema: SCHEMA,
    kiddushResetForTests: () => q('TRUNCATE kiddush_settings, kiddush_slots, kiddush_events, kiddush_sponsorships, kiddush_notes'),

    async getSettings() {
      const out = {};
      for (const r of await rows('SELECT key, value FROM kiddush_settings')) out[r.key] = r.value;
      return out;
    },
    async saveSettings(obj) {
      for (const [k, v] of Object.entries(obj)) if (v !== undefined) await q('INSERT INTO kiddush_settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value', [k, JSON.stringify(v)]);
    },

    // ----- per-slot overrides (hide a week, change its price or name) -----
    async slotOverrides() {
      const m = new Map();
      for (const r of await rows('SELECT * FROM kiddush_slots')) m.set(r.slot_key, { hidden: r.hidden, priceCents: r.price_cents, title: r.title });
      return m;
    },
    saveSlot: (key, o) => q(`INSERT INTO kiddush_slots (slot_key, hidden, price_cents, title) VALUES ($1,$2,$3,$4)
      ON CONFLICT (slot_key) DO UPDATE SET hidden=EXCLUDED.hidden, price_cents=EXCLUDED.price_cents, title=EXCLUDED.title`, [key, !!o.hidden, o.priceCents == null ? null : o.priceCents, o.title || null]),

    // ----- custom events -----
    listEvents: () => rows("SELECT id, to_char(event_date,'YYYY-MM-DD') AS date, title, title_he, note FROM kiddush_events ORDER BY event_date, created_at"),
    async addEvent(e) { const id = newId('ke_'); await q('INSERT INTO kiddush_events (id, event_date, title, title_he, note) VALUES ($1,$2,$3,$4,$5)', [id, e.date, e.title, e.titleHe || '', e.note || '']); return id; },
    async deleteEvent(id) { return (await q('DELETE FROM kiddush_events WHERE id=$1', [id])).rowCount === 1; },

    // ----- calendar notes (a yahrzeit, an event that week...) shown on the board next to the week they fall in -----
    listNotes: () => rows("SELECT id, to_char(note_date,'YYYY-MM-DD') AS date, kind, text, text_he FROM kiddush_notes ORDER BY note_date, created_at"),
    async addNote(n) { const id = newId('kn_'); await q('INSERT INTO kiddush_notes (id, note_date, kind, text, text_he) VALUES ($1,$2,$3,$4,$5)', [id, n.date, n.kind, n.text, n.textHe || '']); return id; },
    async updateNote(id, n) { return (await q('UPDATE kiddush_notes SET note_date=$2, kind=$3, text=$4, text_he=$5 WHERE id=$1', [id, n.date, n.kind, n.text, n.textHe || ''])).rowCount === 1; },
    async deleteNote(id) { return (await q('DELETE FROM kiddush_notes WHERE id=$1', [id])).rowCount === 1; },

    // ----- sponsorships -----
    async liveSponsorships() { await expire(); return rows("SELECT * FROM kiddush_sponsorships WHERE status IN ('pending','paid') ORDER BY created_at"); },
    async allSponsorships() { await expire(); return rows('SELECT * FROM kiddush_sponsorships ORDER BY created_at DESC'); },
    getSponsorship: (id) => one('SELECT * FROM kiddush_sponsorships WHERE id=$1', [id]),
    sponsorshipByIdem: (idem) => one('SELECT * FROM kiddush_sponsorships WHERE idem=$1', [idem]),
    sponsorshipBySession: (sid) => one('SELECT * FROM kiddush_sponsorships WHERE stripe_session_id=$1', [sid]),
    async pendingCountForEmail(email) { await expire(); return (await one("SELECT count(*)::int AS n FROM kiddush_sponsorships WHERE status='pending' AND lower(email)=lower($1)", [email])).n; },
    /** Returns the new id. */
    async createSponsorship(s) {
      await expire();
      const id = newId('ks_');
      {
        await q(`INSERT INTO kiddush_sponsorships (id, slot_key, status, method, name, anonymous, dedication_kind, dedication, email, phone, note, amount_cents, fee_cents, source, idem, show_public, paid_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16, CASE WHEN $3='paid' THEN now() ELSE NULL END)`,
          [id, s.slotKey, s.status, s.method, s.name, !!s.anonymous, s.dedicationKind || '', s.dedication || '', s.email || '', s.phone || '', s.note || '', s.amountCents || 0, s.feeCents || 0, s.source || 'online', s.idem || null, !!s.showPublic]);
      }
      return id;
    },
    markReminded: (id) => q('UPDATE kiddush_sponsorships SET reminded_at=now(), reminder_count=reminder_count+1, remind_at=NULL, updated_at=now() WHERE id=$1', [id]),
    /** Schedule a reminder for a time (null clears it) and/or stop (true) or resume (false) all reminders for this pledge. */
    async setReminder(id, { remindAt, off }) {
      const sets = [], vals = [id];
      if (remindAt !== undefined) { vals.push(remindAt); sets.push(`remind_at=$${vals.length}`); }
      if (off !== undefined) { vals.push(!!off); sets.push(`reminders_off=$${vals.length}`); if (off) sets.push('remind_at=NULL'); }
      if (!sets.length) return true;
      return (await q(`UPDATE kiddush_sponsorships SET ${sets.join(', ')}, updated_at=now() WHERE id=$1`, vals)).rowCount === 1;
    },
    /** Unpaid non-card pledges with an email: ones whose scheduled time has come, plus (when `auto`) the ones `days` old and not reminded within `days`, at most `max` automatic reminders each. Never ones with reminders switched off. */
    dueReminders: ({ days, max, auto = true }) => rows(`SELECT * FROM kiddush_sponsorships WHERE status='pending' AND method <> 'card' AND email <> '' AND NOT reminders_off AND (
      (remind_at IS NOT NULL AND remind_at <= now())
      OR ($3::boolean AND remind_at IS NULL AND reminder_count < $2 AND created_at < now() - ($1 || ' days')::interval AND (reminded_at IS NULL OR reminded_at < now() - ($1 || ' days')::interval))
    ) ORDER BY created_at`, [String(days), max, !!auto]),
    attachSession: (id, sessionId) => q('UPDATE kiddush_sponsorships SET stripe_session_id=$2, updated_at=now() WHERE id=$1', [id, sessionId]),
    /** Edit fields (admin). */
    async updateSponsorship(id, f) {
      const sets = [], vals = [id];
      for (const [k, col] of Object.entries(COLS)) if (k in f) { vals.push(f[k]); sets.push(`${col}=$${vals.length}`); }
      if ('slotKey' in f) { vals.push(f.slotKey); sets.push(`slot_key=$${vals.length}`); }
      if ('status' in f) { vals.push(f.status); sets.push(`status=$${vals.length}`); sets.push(`paid_at=CASE WHEN $${vals.length}='paid' THEN COALESCE(paid_at, now()) WHEN $${vals.length}='pending' THEN NULL ELSE paid_at END`); }
      if (!sets.length) return true;
      return (await q(`UPDATE kiddush_sponsorships SET ${sets.join(', ')}, updated_at=now() WHERE id=$1`, vals)).rowCount === 1;
    },
    /** Called when Stripe reports the checkout paid. Idempotent; also works if the hold already lapsed and the week is still free. */
    async markPaid(id, { paymentIntent, amountTotal } = {}) {
      const sp = await one('SELECT * FROM kiddush_sponsorships WHERE id=$1', [id]);
      if (!sp) return null;
      if (sp.status === 'paid') return sp;
      await q("UPDATE kiddush_sponsorships SET status='paid', paid_at=now(), stripe_payment_intent=COALESCE($2, stripe_payment_intent), updated_at=now() WHERE id=$1", [id, paymentIntent || null]);
      return one('SELECT * FROM kiddush_sponsorships WHERE id=$1', [id]);
    },
    async releaseSponsorship(id, status = 'released', onlyPendingCard = false) {
      const r = await q(`UPDATE kiddush_sponsorships SET status=$2, updated_at=now() WHERE id=$1 AND status IN ('pending','paid') ${onlyPendingCard ? "AND status='pending' AND method='card'" : ''}`, [id, status]);
      return r.rowCount === 1;
    },
  };
}
module.exports = { kiddushStore, newId, HOLD_MINUTES };
