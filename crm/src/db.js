// SQLite storage for the CRM (Node's built-in node:sqlite, so there is nothing to compile).
//
// Tables
//   people        everyone in the community
//   donations     every gift, with amount, date, fund and method
//   activities    visits, mezuzos, tefillin, Shabbat candles, ... (one row per event)
//   messages      everything sent to the CRM (text, voice transcript, photo) and its reply
//   attachments   photos and voice notes saved on disk
'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const ACTIVITY_TYPES = [
  'visit', 'mezuzah', 'tefillin', 'shabbat_candles', 'kosher', 'holiday',
  'lifecycle', 'class', 'call', 'other',
];
const PERSON_FIELDS = [
  'first_name', 'last_name', 'hebrew_name', 'phone', 'email', 'address', 'city',
  'spouse', 'children', 'birthday', 'yahrzeits', 'tags', 'notes',
];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS people (
  id INTEGER PRIMARY KEY,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  hebrew_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  spouse TEXT NOT NULL DEFAULT '',
  children TEXT NOT NULL DEFAULT '',
  birthday TEXT NOT NULL DEFAULT '',
  yahrzeits TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  channel TEXT NOT NULL,            -- web | telegram | sms | whatsapp
  chat_id TEXT NOT NULL,            -- who/where it came from, for conversation memory
  kind TEXT NOT NULL,               -- text | voice | photo
  text TEXT NOT NULL DEFAULT '',    -- typed text or caption
  transcript TEXT NOT NULL DEFAULT '',
  reply TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY,
  message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,               -- photo | voice
  mime TEXT NOT NULL,
  file TEXT NOT NULL,               -- file name inside the uploads folder
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS donations (
  id INTEGER PRIMARY KEY,
  person_id INTEGER REFERENCES people(id) ON DELETE SET NULL,
  amount REAL NOT NULL,
  date TEXT NOT NULL,               -- YYYY-MM-DD
  method TEXT NOT NULL DEFAULT '',  -- check, cash, zelle, venmo, card, daf, stock, ...
  fund TEXT NOT NULL DEFAULT '',
  check_number TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  receipt_sent INTEGER NOT NULL DEFAULT 0,
  message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY,
  person_id INTEGER REFERENCES people(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  date TEXT NOT NULL,               -- YYYY-MM-DD
  quantity INTEGER NOT NULL DEFAULT 1,
  details TEXT NOT NULL DEFAULT '',
  follow_up_date TEXT NOT NULL DEFAULT '',
  follow_up_done INTEGER NOT NULL DEFAULT 0,
  message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS donations_date ON donations(date);
CREATE INDEX IF NOT EXISTS donations_person ON donations(person_id);
CREATE INDEX IF NOT EXISTS activities_date ON activities(date);
CREATE INDEX IF NOT EXISTS activities_person ON activities(person_id);
CREATE INDEX IF NOT EXISTS messages_chat ON messages(chat_id, id);
`;

const clean = (v) => (v == null ? '' : String(v).trim());
const fullName = (p) => [p.first_name, p.last_name].filter(Boolean).join(' ');

function openDb(dataDir) {
  let file = ':memory:';
  let uploadsDir = null;
  if (dataDir) {
    fs.mkdirSync(dataDir, { recursive: true });
    uploadsDir = path.join(dataDir, 'uploads');
    fs.mkdirSync(uploadsDir, { recursive: true });
    file = path.join(dataDir, 'crm.db');
  }
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  // A second, read-only connection for the free-form "report" tool, so a query can never change data.
  const ro = file === ':memory:' ? db : new DatabaseSync(file, { readOnly: true });
  return wrap(db, ro, uploadsDir);
}

function wrap(db, ro, uploadsDir) {
  const one = (sql, ...a) => db.prepare(sql).get(...a) || null;
  const all = (sql, ...a) => db.prepare(sql).all(...a);
  const run = (sql, ...a) => db.prepare(sql).run(...a);

  const api = {
    raw: db,
    uploadsDir,
    ACTIVITY_TYPES,

    // ---------- people ----------
    searchPeople(query, limit = 10) {
      const words = clean(query).toLowerCase().split(/\s+/).filter(Boolean);
      if (!words.length) return all('SELECT * FROM people ORDER BY last_name, first_name LIMIT ?', limit);
      const hay = "lower(first_name||' '||last_name||' '||hebrew_name||' '||phone||' '||email||' '||spouse||' '||children||' '||city||' '||tags)";
      const where = words.map(() => `${hay} LIKE ?`).join(' AND ');
      return all(`SELECT * FROM people WHERE ${where} ORDER BY last_name, first_name LIMIT ?`, ...words.map((w) => `%${w}%`), limit);
    },
    getPerson(id) { return one('SELECT * FROM people WHERE id = ?', id); },
    createPerson(fields) {
      const f = pick(fields);
      if (!f.first_name && !f.last_name) throw new Error('A person needs at least a first or last name.');
      const cols = Object.keys(f);
      const r = run(`INSERT INTO people (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, ...cols.map((c) => f[c]));
      return api.getPerson(Number(r.lastInsertRowid));
    },
    updatePerson(id, fields) {
      if (!api.getPerson(id)) throw new Error(`No person with id ${id}.`);
      const f = pick(fields);
      const cols = Object.keys(f);
      if (cols.length) run(`UPDATE people SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`, ...cols.map((c) => f[c]), id);
      return api.getPerson(id);
    },
    deletePerson(id) { return run('DELETE FROM people WHERE id = ?', id).changes > 0; },
    listPeople({ q = '', limit = 500 } = {}) {
      const people = q ? api.searchPeople(q, limit) : all('SELECT * FROM people ORDER BY last_name, first_name LIMIT ?', limit);
      const year = String(new Date().getFullYear());
      const given = new Map(all("SELECT person_id, SUM(amount) t FROM donations WHERE substr(date,1,4) = ? GROUP BY person_id", year).map((r) => [r.person_id, r.t]));
      const last = new Map(all("SELECT person_id, MAX(date) d FROM activities WHERE type = 'visit' GROUP BY person_id").map((r) => [r.person_id, r.d]));
      return people.map((p) => ({ ...p, name: fullName(p), given_this_year: given.get(p.id) || 0, last_visit: last.get(p.id) || '' }));
    },
    personProfile(id) {
      const p = api.getPerson(id);
      if (!p) return null;
      const donations = all('SELECT * FROM donations WHERE person_id = ? ORDER BY date DESC, id DESC', id);
      const activities = all('SELECT * FROM activities WHERE person_id = ? ORDER BY date DESC, id DESC', id);
      const byYear = all("SELECT substr(date,1,4) year, SUM(amount) total, COUNT(*) gifts FROM donations WHERE person_id = ? GROUP BY year ORDER BY year DESC", id);
      const counts = all('SELECT type, SUM(quantity) quantity, COUNT(*) times, MAX(date) last FROM activities WHERE person_id = ? GROUP BY type', id);
      return { ...p, name: fullName(p), donations, activities, donations_by_year: byYear, activity_counts: counts };
    },

    // ---------- donations ----------
    addDonation({ person_id = null, amount, date, method = '', fund = '', check_number = '', note = '', message_id = null }) {
      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt <= 0) throw new Error('Donation amount must be a positive number.');
      if (person_id != null && !api.getPerson(person_id)) throw new Error(`No person with id ${person_id}.`);
      const r = run('INSERT INTO donations (person_id, amount, date, method, fund, check_number, note, message_id) VALUES (?,?,?,?,?,?,?,?)',
        person_id, Math.round(amt * 100) / 100, isoDate(date), clean(method).toLowerCase(), clean(fund), clean(check_number), clean(note), message_id);
      return api.getDonation(Number(r.lastInsertRowid));
    },
    getDonation(id) { return one('SELECT d.*, p.first_name, p.last_name FROM donations d LEFT JOIN people p ON p.id = d.person_id WHERE d.id = ?', id); },
    updateDonation(id, fields) {
      if (!one('SELECT id FROM donations WHERE id = ?', id)) throw new Error(`No donation with id ${id}.`);
      const allowed = ['person_id', 'amount', 'date', 'method', 'fund', 'check_number', 'note', 'receipt_sent'];
      const sets = [];
      const vals = [];
      for (const k of allowed) if (fields[k] !== undefined) { sets.push(`${k} = ?`); vals.push(k === 'date' ? isoDate(fields[k]) : k === 'receipt_sent' ? (fields[k] ? 1 : 0) : fields[k]); }
      if (sets.length) run(`UPDATE donations SET ${sets.join(', ')} WHERE id = ?`, ...vals, id);
      return api.getDonation(id);
    },
    deleteDonation(id) { return run('DELETE FROM donations WHERE id = ?', id).changes > 0; },
    listDonations({ year, person_id } = {}) {
      const where = [];
      const vals = [];
      if (year) { where.push('substr(d.date,1,4) = ?'); vals.push(String(year)); }
      if (person_id) { where.push('d.person_id = ?'); vals.push(person_id); }
      return all(`SELECT d.*, trim(coalesce(p.first_name,'')||' '||coalesce(p.last_name,'')) name, p.email, p.address, p.city
        FROM donations d LEFT JOIN people p ON p.id = d.person_id
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY d.date DESC, d.id DESC`, ...vals);
    },

    // ---------- activities (visits, mezuzos, tefillin, ...) ----------
    addActivity({ person_id = null, type, date, quantity = 1, details = '', follow_up_date = '', message_id = null }) {
      const t = clean(type).toLowerCase().replace(/[\s-]+/g, '_');
      if (!ACTIVITY_TYPES.includes(t)) throw new Error(`Unknown activity type "${type}". Use one of: ${ACTIVITY_TYPES.join(', ')}.`);
      if (person_id != null && !api.getPerson(person_id)) throw new Error(`No person with id ${person_id}.`);
      const q = Math.max(1, Math.round(Number(quantity) || 1));
      const r = run('INSERT INTO activities (person_id, type, date, quantity, details, follow_up_date, message_id) VALUES (?,?,?,?,?,?,?)',
        person_id, t, isoDate(date), q, clean(details), follow_up_date ? isoDate(follow_up_date) : '', message_id);
      return api.getActivity(Number(r.lastInsertRowid));
    },
    getActivity(id) { return one('SELECT a.*, p.first_name, p.last_name FROM activities a LEFT JOIN people p ON p.id = a.person_id WHERE a.id = ?', id); },
    updateActivity(id, fields) {
      if (!one('SELECT id FROM activities WHERE id = ?', id)) throw new Error(`No activity with id ${id}.`);
      const allowed = ['person_id', 'type', 'date', 'quantity', 'details', 'follow_up_date', 'follow_up_done'];
      const sets = [];
      const vals = [];
      for (const k of allowed) if (fields[k] !== undefined) {
        sets.push(`${k} = ?`);
        vals.push(k === 'date' || (k === 'follow_up_date' && fields[k]) ? isoDate(fields[k]) : k === 'follow_up_done' ? (fields[k] ? 1 : 0) : fields[k]);
      }
      if (sets.length) run(`UPDATE activities SET ${sets.join(', ')} WHERE id = ?`, ...vals, id);
      return api.getActivity(id);
    },
    deleteActivity(id) { return run('DELETE FROM activities WHERE id = ?', id).changes > 0; },
    listActivities({ year, type, person_id } = {}) {
      const where = [];
      const vals = [];
      if (year) { where.push('substr(a.date,1,4) = ?'); vals.push(String(year)); }
      if (type) { where.push('a.type = ?'); vals.push(type); }
      if (person_id) { where.push('a.person_id = ?'); vals.push(person_id); }
      return all(`SELECT a.*, trim(coalesce(p.first_name,'')||' '||coalesce(p.last_name,'')) name
        FROM activities a LEFT JOIN people p ON p.id = a.person_id
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY a.date DESC, a.id DESC`, ...vals);
    },
    followUps(today) {
      return all(`SELECT a.*, trim(coalesce(p.first_name,'')||' '||coalesce(p.last_name,'')) name, p.phone
        FROM activities a LEFT JOIN people p ON p.id = a.person_id
        WHERE a.follow_up_date != '' AND a.follow_up_done = 0 AND a.follow_up_date <= date(?, '+14 days')
        ORDER BY a.follow_up_date`, today);
    },

    // ---------- summary ----------
    yearSummary(year) {
      const y = String(year);
      const d = one('SELECT COALESCE(SUM(amount),0) total, COUNT(*) gifts, COUNT(DISTINCT person_id) donors FROM donations WHERE substr(date,1,4) = ?', y);
      const byFund = all("SELECT CASE fund WHEN '' THEN 'General' ELSE fund END fund, SUM(amount) total, COUNT(*) gifts FROM donations WHERE substr(date,1,4) = ? GROUP BY 1 ORDER BY total DESC", y);
      const byMonth = all('SELECT substr(date,1,7) month, SUM(amount) total FROM donations WHERE substr(date,1,4) = ? GROUP BY month ORDER BY month', y);
      const topDonors = all(`SELECT d.person_id, trim(coalesce(p.first_name,'')||' '||coalesce(p.last_name,'')) name, SUM(d.amount) total, COUNT(*) gifts
        FROM donations d LEFT JOIN people p ON p.id = d.person_id WHERE substr(d.date,1,4) = ? GROUP BY d.person_id ORDER BY total DESC LIMIT 10`, y);
      const acts = all('SELECT type, SUM(quantity) quantity, COUNT(*) times, COUNT(DISTINCT person_id) people FROM activities WHERE substr(date,1,4) = ? GROUP BY type ORDER BY quantity DESC', y);
      const people = one('SELECT COUNT(*) n FROM people').n;
      return { year: Number(y), donations: { ...d, by_fund: byFund, by_month: byMonth, top_donors: topDonors }, activities: acts, people };
    },

    // ---------- free-form read-only query (for questions the other tools don't cover) ----------
    readOnlyQuery(sql, maxRows = 200) {
      const s = clean(sql).replace(/;+\s*$/, '');
      if (!/^(select|with)\b/i.test(s) || s.includes(';')) throw new Error('Only a single SELECT query is allowed.');
      const rows = ro.prepare(s).all();
      return { rows: rows.slice(0, maxRows), total_rows: rows.length, truncated: rows.length > maxRows };
    },

    // ---------- messages & attachments ----------
    addMessage({ channel, chat_id, kind, text = '', transcript = '' }) {
      const r = run('INSERT INTO messages (channel, chat_id, kind, text, transcript) VALUES (?,?,?,?,?)', channel, String(chat_id), kind, clean(text), clean(transcript));
      return Number(r.lastInsertRowid);
    },
    setMessage(id, fields) {
      for (const k of ['transcript', 'reply']) if (fields[k] !== undefined) run(`UPDATE messages SET ${k} = ? WHERE id = ?`, String(fields[k]), id);
    },
    recentMessages(chat_id, limit = 8) {
      return all("SELECT * FROM messages WHERE chat_id = ? AND reply != '' ORDER BY id DESC LIMIT ?", String(chat_id), limit).reverse();
    },
    listMessages(limit = 100) {
      const msgs = all('SELECT * FROM messages ORDER BY id DESC LIMIT ?', limit);
      const att = all(`SELECT * FROM attachments WHERE message_id IN (${msgs.map(() => '?').join(',') || 'NULL'})`, ...msgs.map((m) => m.id));
      return msgs.map((m) => ({ ...m, attachments: att.filter((a) => a.message_id === m.id) }));
    },
    saveAttachment({ message_id, kind, mime, buffer }) {
      const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/webm': 'webm', 'audio/wav': 'wav', 'audio/amr': 'amr', 'video/mp4': 'mp4' }[mime.split(';')[0]] || 'bin';
      const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      if (uploadsDir) fs.writeFileSync(path.join(uploadsDir, name), buffer);
      const r = run('INSERT INTO attachments (message_id, kind, mime, file) VALUES (?,?,?,?)', message_id, kind, mime, name);
      return Number(r.lastInsertRowid);
    },
    getAttachment(id) { return one('SELECT * FROM attachments WHERE id = ?', id); },
  };
  return api;
}

function pick(fields = {}) {
  const out = {};
  for (const k of PERSON_FIELDS) if (fields[k] !== undefined && fields[k] !== null) out[k] = clean(fields[k]);
  return out;
}

// Accepts YYYY-MM-DD (or anything Date can parse); stores YYYY-MM-DD.
function isoDate(v) {
  const s = clean(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (!s || Number.isNaN(d.getTime())) throw new Error(`Invalid date "${v}". Use YYYY-MM-DD.`);
  return d.toISOString().slice(0, 10);
}

module.exports = { openDb, ACTIVITY_TYPES, PERSON_FIELDS, fullName };
