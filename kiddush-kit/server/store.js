// Postgres storage (settings, sponsorships, events, notes). Needs DATABASE_URL.
'use strict';
const { Pool } = require('pg');
const { kiddushStore } = require('./kiddush-store.js');

function createStore(url) {
  const pool = new Pool({ connectionString: url, max: 5, ssl: /sslmode=require/.test(url) || process.env.DATABASE_SSL === '1' ? { rejectUnauthorized: false } : undefined });
  const q = (text, params) => pool.query(text, params);
  const rows = async (text, params) => (await q(text, params)).rows;
  const one = async (text, params) => (await q(text, params)).rows[0] || null;
  const kiddush = kiddushStore({ q, rows, one });
  return {
    ...kiddush,
    pool,
    migrate: () => q(kiddush.kiddushSchema),
    close: () => pool.end(),
  };
}
module.exports = { createStore };
