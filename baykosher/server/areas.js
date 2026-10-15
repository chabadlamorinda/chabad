// Places we serve. Page text is built from real facts (distance from the store, the live delivery price list, ZIP codes),
// so every location page says something different and true instead of being a copy-paste "doorway" page.
'use strict';

const AREAS = [
  { slug: 'lafayette', name: 'Lafayette', he: 'לפאייט', lat: 37.8858, lng: -122.118, zips: ['94549'], note: 'home' },
  { slug: 'orinda', name: 'Orinda', he: 'אורינדה', lat: 37.8771, lng: -122.1797, zips: ['94563'] },
  { slug: 'moraga', name: 'Moraga', he: 'מוראגה', lat: 37.8349, lng: -122.1297, zips: ['94556'] },
  { slug: 'walnut-creek', name: 'Walnut Creek', he: 'ווילנאט קריק', lat: 37.9101, lng: -122.0652, zips: ['94595', '94596', '94597', '94598'] },
  { slug: 'pleasant-hill', name: 'Pleasant Hill', he: 'פלזנט היל', lat: 37.948, lng: -122.0608, zips: ['94523'] },
  { slug: 'alamo', name: 'Alamo', he: 'אלמו', lat: 37.8502, lng: -122.032, zips: ['94507'] },
  { slug: 'danville', name: 'Danville', he: 'דנוויל', lat: 37.8216, lng: -121.9999, zips: ['94506', '94526'] },
  { slug: 'san-ramon', name: 'San Ramon', he: 'סן רמון', lat: 37.7799, lng: -121.978, zips: ['94582', '94583'] },
  { slug: 'concord', name: 'Concord', he: 'קונקורד', lat: 37.9779, lng: -122.0311, zips: ['94518', '94519', '94520', '94521'] },
  { slug: 'oakland', name: 'Oakland', he: 'אוקלנד', lat: 37.8044, lng: -122.2712, zips: ['94610', '94611', '94618', '94619'] },
  { slug: 'piedmont', name: 'Piedmont', he: 'פידמונט', lat: 37.8244, lng: -122.2316, zips: ['94610', '94611'] },
  { slug: 'berkeley', name: 'Berkeley', he: 'ברקלי', lat: 37.8715, lng: -122.273, zips: ['94705', '94707', '94708', '94709', '94710'] },
  { slug: 'el-cerrito', name: 'El Cerrito', he: 'אל סריטו', lat: 37.9161, lng: -122.3108, zips: ['94530'] },
  { slug: 'san-francisco', name: 'San Francisco', he: 'סן פרנסיסקו', lat: 37.7749, lng: -122.4194, zips: ['94118', '94121', '94122', '94123'] },
  { slug: 'pleasanton', name: 'Pleasanton', he: 'פלזנטון', lat: 37.6624, lng: -121.8747, zips: ['94566', '94588'] },
  { slug: 'san-mateo', name: 'San Mateo', he: 'סן מטאו', lat: 37.563, lng: -122.3255, zips: ['94401', '94402', '94403'] },
];

const FAQ = [
  { q: 'Is Bay Kosher a kosher grocery store near {city}?', a: 'Yes. Bay Kosher is a kosher grocery store at {address}, run by Chabad of Lamorinda. You can shop online for {city} delivery or pickup, or visit the store.' },
  { q: 'How fast can I get my order?', a: 'Pickup orders are usually ready in about 2-3 hours, and you can schedule pickup up to a month ahead. We notify you as soon as your order is ready.' },
  { q: 'What do you sell?', a: 'Kosher meat and chicken, dairy, deli, frozen foods, baked goods and challah, beverages, candy, baby food, Judaica and household items. Each product page shows whether it is meat, dairy or pareve, and whether it is kosher for Passover.' },
  { q: 'Do you have kosher for Passover products?', a: 'Yes. Before Passover, switch on "Kosher for Passover only" and the whole store shows only Passover items. We also have pages for Rosh Hashana, Sukkot, Chanukah, Purim and Shavuot.' },
  { q: 'Can I order in Hebrew?', a: 'Yes. Use the language button at the top of any page to see the whole store in Hebrew.' },
];

module.exports = { AREAS, FAQ };
