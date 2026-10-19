// Reads chabad.config.json (your organisation's details) and turns it into what the server needs.
// Everything specific to one Chabad lives in that one file. Payment passwords and other secrets do NOT:
// those are environment variables (see .env.example).
'use strict';
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'chabad.config.json');
const str = (v, n = 200) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
const num = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : d);
const bool = (v, d) => (typeof v === 'boolean' ? v : d);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

function validTimezone(tz) { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch (e) { return false; } }

/** @param {object} [raw] the parsed config (defaults to chabad.config.json) */
function loadConfig(raw) {
  if (!raw) {
    const file = process.env.KIDDUSH_CONFIG || FILE;
    try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (e) { throw new Error('Could not read ' + file + ': ' + e.message + ' (it must be valid JSON; check for a missing comma or quote).'); }
  }
  const org = obj(raw.organization), loc = obj(raw.location), contact = obj(raw.contact), prices = obj(raw.prices), pay = obj(raw.payments),
    zelle = obj(pay.zelle), venmo = obj(pay.venmo), check = obj(pay.check), board = obj(raw.board), rem = obj(raw.reminders);

  const name = str(org.name, 80) || 'Your Chabad';
  const words = name.replace(/^chabad( of| at| in)?\s*/i, '').trim() || name;
  const timezone = str(loc.timezone, 60) || 'America/New_York';
  if (!validTimezone(timezone)) throw new Error('chabad.config.json: location.timezone "' + timezone + '" is not a valid time zone (for example America/New_York, America/Chicago, America/Los_Angeles, Europe/London).');

  // Hebcal looks up candle lighting and Havdalah times by US zip code or by a GeoNames city id (works worldwide).
  const zip = str(loc.zip, 10), geo = num(loc.geonameid, 0);
  let hebcalQuery = '';
  if (/^\d{5}$/.test(zip)) hebcalQuery = 'zip=' + zip;
  else if (Number.isInteger(geo) && geo > 0) hebcalQuery = 'geonameid=' + geo;
  if (hebcalQuery) hebcalQuery += '&b=' + Math.min(Math.max(Math.round(num(loc.candleLightingMinutesBeforeSunset, 18)), 0), 90) + '&m=' + Math.min(Math.max(Math.round(num(loc.havdalahMinutesAfterSunset, 40)), 0), 120);

  const venmoHandle = str(venmo.handle, 60).replace(/^@/, '');
  return {
    timezone,
    // Shown on the pages (the TV header uses the two short lines; the phone page uses the first line, then the second)
    org: {
      name, nameHe: str(org.nameHe, 80),
      line1: str(org.headerLine1, 30) || 'CHABAD', line2: str(org.headerLine2, 30) || words.toUpperCase(),
      line1He: str(org.headerLine1He, 30) || 'חב״ד', line2He: str(org.headerLine2He, 30) || str(org.nameHe, 80).replace(/^חב״ד\s*/, ''),
    },
    hebcalQuery,
    // Starting values for the Settings tab in the staff area. Once someone saves Settings there, the saved values win.
    settingDefaults: {
      orgName: name,
      priceShabbat: num(prices.shabbat, 500), priceHoliday: num(prices.holiday, 720), priceBoard: num(prices.board, 5000),
      ...(str(prices.standardNote, 120) ? { standardNote: str(prices.standardNote, 120) } : {}),
      ...(str(prices.standardNoteHe, 120) ? { standardNoteHe: str(prices.standardNoteHe, 120) } : {}),
      cardOn: bool(pay.card, true), coverFee: bool(pay.coverFee, true),
      zelleOn: bool(zelle.enabled, !!str(zelle.id)), zelleId: str(zelle.id, 120), zelleName: str(zelle.name, 80),
      venmoOn: bool(venmo.enabled, !!venmoHandle), venmoHandle,
      checkOn: bool(check.enabled, !!str(check.payableTo)), checkPayable: str(check.payableTo, 80), checkAddress: str(check.mailTo, 200),
      cashOn: bool(pay.cash, true),
      contactEmail: str(contact.email, 120), contactPhone: str(contact.phone, 30),
      publicUrl: str(raw.publicUrl, 200).replace(/\/+$/, ''), shareUrl: str(raw.shareUrl, 200).replace(/\/+$/, ''),
      ...(str(board.blessing, 600) ? { blessing: str(board.blessing, 600) } : {}),
      ...(str(board.blessingHe, 700) ? { blessingHe: str(board.blessingHe, 700) } : {}),
      includePurim: bool(board.includePurim, true),
      autoReminders: bool(rem.automatic, true), reminderDays: Math.min(Math.max(Math.round(num(rem.afterDays, 3)), 1), 30),
    },
  };
}

/** Today's date (and time) in the shul's time zone. */
function makeLocalParts(timezone) {
  return function localParts(date) {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' }).formatToParts(date);
    const g = (t) => p.find((x) => x.type === t).value;
    return { ymd: g('year') + '-' + g('month') + '-' + g('day'), hour: +g('hour'), minute: +g('minute'), dow: g('weekday') };
  };
}
module.exports = { loadConfig, makeLocalParts };
