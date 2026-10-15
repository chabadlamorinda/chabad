// Store settings kept in the database (editable from the back office), with sensible defaults.
'use strict';

const DEFAULTS = {
  store: { name: 'Bay Kosher', address: '3477 Golden Gate Way, Lafayette, CA 94549', phone: '(925) 440-1226', email: 'baykosher@gmail.com', lat: 37.8934, lng: -122.1117, timezone: 'America/Los_Angeles' },
  // open/close in 24h local time; null = closed
  hours: { sun: ['11:00', '16:00'], mon: ['10:00', '18:00'], tue: ['10:00', '18:00'], wed: ['10:00', '18:00'], thu: ['10:00', '18:00'], fri: ['10:00', '14:30'], sat: null },
  pickup: { lead_minutes: 180, window_minutes: 30, max_days_ahead: 30, capacity_per_window: 6 },
  delivery: { min_order_cents: 3500, lead_minutes: 240, window_minutes: 120, capacity_per_window: 6, auto_dispatch: true },
  // fee by distance; free_over_cents = basket size that makes delivery free within that distance band
  delivery_tiers: [
    { max_miles: 3, fee_cents: 599, free_over_cents: 15000 },
    { max_miles: 8, fee_cents: 999, free_over_cents: 25000 },
    { max_miles: 15, fee_cents: 1499, free_over_cents: 40000 },
  ],
  tax_rate: 0.0925, // CA grocery food is exempt; only products marked taxable (household, beauty...) are taxed. Confirm the local rate with your accountant.
  auth_cushion_pct: 10, // extra held on the card for weighed items / substitutions; only the final amount is charged
  holidays: { passover_toggle: 'auto' }, // auto = show the Passover-only switch in the weeks before Pesach; on = always; off = never
  abandoned: { first_after_minutes: 60, second_after_hours: 24, max_reminders: 2 },
};

function createSettings(db) {
  let cache = null, at = 0;
  const merge = (base, over) => {
    if (Array.isArray(base) || typeof base !== 'object' || base === null) return over === undefined ? base : over;
    const out = { ...base };
    for (const k of Object.keys(over || {})) out[k] = merge(base[k], over[k]);
    return out;
  };
  return {
    async all() {
      if (cache && Date.now() - at < 5000) return cache;
      const rows = await db.rows('SELECT key, value FROM settings');
      let s = DEFAULTS;
      for (const r of rows) s = { ...s, [r.key]: merge(DEFAULTS[r.key], r.value) };
      cache = s; at = Date.now(); return s;
    },
    async set(key, value) {
      if (!(key in DEFAULTS)) throw Object.assign(new Error('Unknown setting'), { status: 400 });
      await db.q('INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2', [key, JSON.stringify(value)]);
      cache = null;
    },
    invalidate() { cache = null; },
  };
}

module.exports = { createSettings, DEFAULTS };
