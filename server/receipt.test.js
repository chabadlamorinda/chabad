'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { receipt } = require('./site/receipt.js');

const org = { name: 'Chabad of Lamorinda', address: { street: '3477 Golden Gate Way', city: 'Lafayette', region: 'CA', postal: '94549' }, phone: '925-384-7242', legal: 'A 501(c)(3) nonprofit, tax ID 47-4642750.' };
const gift = { cents: 36000, fund: 'General Fund', dedication: 'In memory of Sarah bat Avraham', monthly: false, date: new Date('2026-11-20T18:00:00Z'), number: 'CL-2026-AB12CD34', note: 'For my mother' };

test('the official gift receipt: letterhead, gift details, tax statement and signature, in three languages', () => {
  const en = receipt({ lang: 'en', base: 'https://jewishlamorinda.com', org, gift, donor: { name: 'Dana Levi', address: '1 Main St, Lafayette' } });
  for (const s of ['Chabad of Lamorinda', '3477 Golden Gate Way', '47-4642750', 'Official gift receipt', '$360.00', 'CL-2026-AB12CD34', 'General Fund', 'In memory of Sarah bat Avraham', 'Dana Levi', 'No goods or services were provided', 'Rabbi Israel and Tzipora Labkowski', 'logo-email.png']) assert.ok(en.html.includes(s), 'html has ' + s);
  for (const s of ['$360.00', '47-4642750', 'Rabbi Israel and Tzipora Labkowski', 'No goods or services']) assert.ok(en.text.includes(s), 'text has ' + s);
  assert.match(en.subject, /Official gift receipt/); assert.match(en.subject, /\$360\.00/);
  const he = receipt({ lang: 'he', base: '', org, gift, donor: {} });
  assert.match(he.html, /dir="rtl"/); assert.ok(he.html.includes('הרב ישראל וציפורה לבקובסקי')); assert.ok(he.html.includes('קבלה רשמית'));
  const ru = receipt({ lang: 'ru', base: '', org, gift: { ...gift, monthly: true }, donor: {} });
  assert.ok(ru.html.includes('рав Исраэль и Ципора Лабковски')); assert.ok(ru.html.includes('ежемесячно'));
  assert.ok(!/undefined|\[object/.test(en.html + he.html + ru.html), 'nothing left blank or broken');
  // the letter: short, personal, in the Rabbi's voice: the amount, partnering, being part of everything, helping Chabad grow; signed once; then the receipt
  let chesed0; const letter = receipt({ lang: 'en', base: '', org, gift: { ...gift, fundId: 'general', note: '', dedication: '' }, donor: { name: 'Dana Levi' } });
  for (const x of ['Dear Dana Levi,', 'Thank you for your gift of $360.', 'Thank you for partnering with us and for helping Chabad of Lamorinda grow.', 'We are truly grateful for your friendship and your generosity.']) assert.ok(letter.html.includes(x) && letter.text.includes(x), 'the letter says: ' + x);
  assert.ok(receipt({ lang: 'en', base: '', org, gift: { ...gift, monthly: true }, donor: {} }).html.includes('Thank you for your monthly gift of $360.'), 'a monthly gift is thanked as monthly');
  assert.ok(receipt({ lang: 'en', base: '', org, gift: { ...gift, cents: 1850 }, donor: {} }).html.includes('gift of $18.50.'), 'cents are kept when there are cents');
  assert.equal((letter.html.match(/Rabbi Israel and Tzipora Labkowski/g) || []).length, 1, 'signed once');
  assert.ok(!/everything we do/.test(letter.html), 'the redundant phrase is gone');
  assert.equal((chesed0 = receipt({ lang: 'en', base: '', org, gift: { ...gift, fundId: 'chesed' }, donor: { name: 'Dana' } })).html.split('In memory of Sarah bat Avraham').length - 1, 1, 'the dedication is in the letter only, not repeated in the receipt table');
  assert.ok(letter.html.indexOf('Thank you for your gift of $360.') < letter.html.indexOf('Rabbi Israel and Tzipora Labkowski') && letter.html.indexOf('Rabbi Israel and Tzipora Labkowski') < letter.html.indexOf('Receipt number'), 'the letter, then the signature, then the gift receipt');
  assert.ok(/color:#c99a2e/.test(letter.html.slice(letter.html.indexOf('With blessings and gratitude'), letter.html.indexOf('Receipt number'))), 'the names are in gold');
  // a gift for a particular purpose, a dedication or a note gets one short, warm line each (the general fund needs none)
  const chesed = receipt({ lang: 'en', base: '', org, gift: { ...gift, fundId: 'chesed' }, donor: { name: 'Dana Levi' } });
  assert.ok(chesed.html.includes('Through the Chesed Fund, your gift brings visits, care and comfort to those in need') && chesed.html.includes('This gift is dedicated: In memory of Sarah bat Avraham') && chesed.html.includes('Your words touched us: “For my mother”'));
  assert.ok(!letter.html.includes('General Fund helps'), 'no extra line for the general fund');
  // only positive and uplifting words; no repeated phrases beyond the three thank-yous the Rabbi asked for
  for (const id of ['general', 'chai', 'preschool', 'market', 'building', 'holidays', 'chesed', 'synagogue', 'endyear', 'children', 'pledge']) {
    const r = receipt({ lang: 'en', base: '', org, gift: { ...gift, fundId: id, monthly: id === 'chai' }, donor: { name: 'Dana' } });
    assert.ok(!/\bkeeps\b|keeping|going|open door|doors|open to/i.test(r.text), id + ' has none of the words the Rabbi dislikes');
    assert.ok(!/Lafayette, Moraga and Orinda/.test(r.text), id + ': no town names');
  }
  for (const L of ['he', 'ru']) { const r = receipt({ lang: L, base: '', org, gift: { ...gift, fundId: 'preschool' }, donor: {} }); assert.ok(!/undefined/.test(r.html) && (r.html.includes('“For my mother”') || r.html.includes('«For my mother»')) && r.html.includes('$360.'), L + ' has the letter with the amount'); }
  const plain = receipt({ lang: 'en', base: '', org, gift: { cents: 500, fund: 'General Fund', monthly: false, date: new Date(), number: 'CL-2026-00000005' }, donor: {} });
  assert.ok(plain.html.includes('Dear friend,') && !plain.html.includes('Your note'), 'a gift with no details still gets a receipt');
});
