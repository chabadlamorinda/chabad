// Excel (.xlsx) workbooks -> CSV text. Understands Clover's inventory export (the "Items" sheet).
'use strict';
const csvCell = (v) => { const s = v == null ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

async function xlsxToCsv(buffer) {
  const read = require('read-excel-file/node');
  let sheets;
  try { sheets = await read(buffer); } catch { throw Object.assign(new Error('That does not look like an Excel (.xlsx) file'), { status: 400 }); }
  const pick = sheets.find((s) => /^items?$/i.test(s.sheet)) || sheets.find((s) => (s.data[0] || []).some((c) => /^(name|item|product)$/i.test(String(c).trim())));
  if (!pick) throw Object.assign(new Error('Could not find a sheet with a "Name" column'), { status: 400 });
  return pick.data.map((r) => r.map(csvCell).join(',')).join('\n');
}

module.exports = { xlsxToCsv, csvCell };
