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
  // the thank-you: warm, about the area (not town names), about this kind of gift, its dedication and the giver's own words; the names at the top and the bottom
  const chesed = receipt({ lang: 'en', base: '', org, gift: { ...gift, fundId: 'chesed' }, donor: { name: 'Dana Levi' } });
  assert.ok(chesed.html.includes('Thank you for partnering with us') && chesed.html.includes('you are our partner in everything we do') && chesed.html.includes('strengthens Jewish families in the area') && chesed.html.includes('Thank you for making this happen.') && !/Lafayette, Moraga and Orinda/.test(chesed.html + chesed.text), 'every receipt opens with the warm general thank-you');
  assert.ok(receipt({ lang: 'en', base: '', org, gift: { ...gift, monthly: true }, donor: {} }).html.includes('month after month'), 'monthly partners are thanked as such');
  assert.ok(chesed.html.indexOf('Thank you for partnering with us') < chesed.html.indexOf('visit and care for those in need'), 'the general thanks comes before the specific thanks');
  assert.ok(chesed.html.includes('visit and care for those in need') && chesed.html.includes('Your gift is dedicated: In memory of Sarah bat Avraham') && chesed.html.includes('“For my mother”'));
  assert.equal((chesed.html.match(/Rabbi Israel and Tzipora Labkowski/g) || []).length, 2, 'the names at the top and at the bottom');
  assert.ok(chesed.html.indexOf('Rabbi Israel and Tzipora Labkowski') < chesed.html.indexOf('Official gift receipt</div>'), 'at the top, in the letterhead');
  for (const L of ['he', 'ru']) { const r = receipt({ lang: L, base: '', org, gift: { ...gift, fundId: 'preschool' }, donor: {} }); assert.ok(!/undefined/.test(r.html) && r.html.includes('“For my mother”') || r.html.includes('«For my mother»'), L + ' has the specific thanks'); }
  const plain = receipt({ lang: 'en', base: '', org, gift: { cents: 500, fund: 'General Fund', monthly: false, date: new Date(), number: 'CL-2026-00000005' }, donor: {} });
  assert.ok(plain.html.includes('Dear friend,') && !plain.html.includes('Your note'), 'a gift with no details still gets a receipt');
});
