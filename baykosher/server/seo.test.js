'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { startPg } = require('./pg-test-helper');
const { createApp } = require('./app');
const { createDb } = require('./db');
const { fakePayments } = require('./payments');
const { createMirror, isPrivateIp } = require('./mirror');
const { holidayInfo, inSeason } = require('./holidays');

let pg, A, base, server, sent, adminH, cats;
const env = { ADMIN_PASSWORD: 'correct horse battery', SESSION_SECRET: 'test-secret', NODE_ENV: 'test', PUBLIC_URL: 'https://baykosher.test' };
async function api(method, p, body, headers = {}) {
  const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text, headers: r.headers };
}
const admin = (m, p, b) => api(m, p, b, adminH);
const mk = (o) => admin('POST', '/api/admin/products', { price_cents: 500, cost_cents: 300, stock: 10, ...o }).then((r) => r.json);

test.before(async () => {
  pg = await startPg(); sent = { email: [], sms: [] };
  const notifier = { live: {}, async email(to, subject, html) { sent.email.push({ to, subject, html }); return true; }, async sms() { return true; } };
  A = await createApp({ env, db: createDb(pg.url), payments: fakePayments(), notifier, geocoder: { async geocode() { return { lat: 37.9, lng: -122.12 }; } } });
  server = http.createServer(A.app); await new Promise((r) => server.listen(0, r)); base = 'http://127.0.0.1:' + server.address().port;
  adminH = { 'x-staff-token': (await api('POST', '/api/staff/login', { password: env.ADMIN_PASSWORD })).json.token };
  cats = Object.fromEntries((await admin('GET', '/api/admin/categories')).json.map((c) => [c.slug, c.id]));
});
test.after(async () => { server.close(); await A.close(); await pg.stop(); });

test('holiday dates come from the Hebrew calendar and the season window is right', () => {
  const p = holidayInfo('pesach', new Date('2026-10-15T12:00:00Z')); assert.equal(p.start.toISOString().slice(0, 10), '2027-04-22'); assert.equal(p.end.toISOString().slice(0, 10), '2027-04-29'); assert.equal(p.inSeason, false);
  assert.ok(inSeason(new Date('2027-03-15T12:00:00Z')).some((h) => h.slug === 'pesach')); // 45 days before
  assert.ok(!inSeason(new Date('2027-04-30T12:00:00Z')).some((h) => h.slug === 'pesach')); // over
  assert.equal(holidayInfo('chanukah', new Date('2026-10-15T12:00:00Z')).start.toISOString().slice(0, 10), '2026-12-05');
  assert.equal(holidayInfo('nope'), null);
});

let matzo, milk, steak, chametz;
test('kosher type, Passover status and holiday tags; the Passover-only switch filters every page', async () => {
  matzo = await mk({ name: 'Streit\'s Matzo Meal', category_id: cats.groceries, kosher_type: 'pareve', passover: 'yes', holidays: 'pesach' });
  milk = await mk({ name: 'Cholov Yisroel Milk', category_id: cats.groceries, kosher_type: 'dairy', passover: 'yes' });
  steak = await mk({ name: 'Ribeye Steak', category_id: cats.groceries, kosher_type: 'meat', passover: 'no' });
  chametz = await mk({ name: 'Plain Pasta', category_id: cats.groceries, kosher_type: 'bogus', passover: 'maybe', holidays: 'pesach,notaholiday' });
  assert.equal(chametz.kosher_type, ''); assert.equal(chametz.passover, 'unknown'); assert.equal(chametz.holidays, 'pesach'); // bad values are cleaned
  const ids = (r) => r.json.items.map((i) => i.name);
  assert.deepEqual(ids(await api('GET', '/api/products?passover=1')).sort(), ["Cholov Yisroel Milk", "Streit's Matzo Meal"]); // unknown is never shown as Passover
  assert.equal((await api('GET', '/api/products?kosher=meat')).json.items[0].name, 'Ribeye Steak');
  const page = (await api('GET', '/c/groceries')).text; assert.match(page, /Plain Pasta/); assert.match(page, /class="kt dairy"/); assert.match(page, /class="kp"/);
  const pass = (await api('GET', '/c/groceries', null, { cookie: 'bk_passover=1' })).text; assert.ok(!/Plain Pasta/.test(pass) && !/Ribeye/.test(pass)); assert.match(pass, /Cholov Yisroel Milk/); assert.match(pass, /Showing only Kosher for Passover/); assert.match(pass, /id="passovertoggle"/);
  assert.equal((await api('GET', '/c/groceries?passover=1')).text.includes('Plain Pasta'), false); assert.ok((await api('GET', '/c/groceries?passover=0', null, { cookie: 'bk_passover=1' })).text.includes('Plain Pasta'));
  assert.match((await api('GET', '/c/groceries?kosher=dairy')).text, /noindex/); // filter variants are not indexed
  const s = (await api('GET', '/api/products?q=matzah&passover=1')).json.items; assert.equal(s[0].id, matzo.id);
  const pdp = (await api('GET', `/p/${matzo.id}-x`)).text; assert.match(pdp, /class="kt pareve"/); assert.match(pdp, /\/holiday\/pesach/);
  // toggle visibility: off-season default hides it; "on" shows it; "off" hides it
  assert.ok(!(await api('GET', '/')).text.includes('id="passovertoggle"'));
  await A.settings.set('holidays', { passover_toggle: 'on' }); assert.match((await api('GET', '/')).text, /id="passovertoggle"/);
  assert.match((await api('GET', '/he', null)).text, /כשר לפסח בלבד/);
  await A.settings.set('holidays', { passover_toggle: 'off' }); assert.ok(!(await api('GET', '/')).text.includes('id="passovertoggle"'));
  await A.settings.set('holidays', { passover_toggle: 'auto' });
});

test('holiday pages: tagged items, Passover page includes Passover-certified items, Hebrew, 404, structured data', async () => {
  await mk({ name: 'Chanukah Gelt', category_id: cats['candy-sweets'], holidays: 'chanukah', kosher_type: 'pareve' });
  const ch = (await api('GET', '/holiday/chanukah')).text; assert.match(ch, /Chanukah Gelt/); assert.match(ch, /<h1>Chanukah groceries/); assert.match(ch, /December 5, 2026/); assert.match(ch, /"@type":"ItemList"/); assert.match(ch, /rel="canonical" href="https:\/\/baykosher\.test\/holiday\/chanukah"/);
  const pe = (await api('GET', '/holiday/pesach')).text; for (const n of ['Matzo Meal', 'Plain Pasta', 'Cholov Yisroel Milk']) assert.match(pe, new RegExp(n)); assert.ok(!/Ribeye/.test(pe) && !/Chanukah Gelt/.test(pe)); // pesach tag OR certified, never "no"
  const he = (await api('GET', '/he/holiday/chanukah')).text; assert.match(he, /<html lang="he" dir="rtl">/); assert.match(he, /חנוכה/); assert.match(he, /hreflang="en"/);
  assert.equal((await api('GET', '/holiday/nope')).status, 404);
  assert.match((await api('GET', '/')).text, /Chanukah/); // footer link
});

test('city pages are unique, built from real distances and the live delivery price list, with FAQ markup', async () => {
  const orinda = (await api('GET', '/areas/orinda')).text; assert.match(orinda, /<h1>Kosher grocery delivery and pickup in Orinda<\/h1>/); assert.match(orinda, /about \d+(\.\d)? miles from our store/); assert.match(orinda, /Uber delivery from \$9\.99, free on orders over \$250\.00/); // 3.9 miles = the 3-8 mile band assert.match(orinda, /94563/); assert.match(orinda, /"@type":"FAQPage"/); assert.match(orinda, /Do you deliver to Orinda\?/);
  assert.match((await api('GET', '/areas/lafayette')).text, /home town/);
  const far = (await api('GET', '/areas/san-mateo')).text; assert.match(far, /beyond our Uber delivery area/); assert.ok(!/Uber delivery from/.test(far));
  const sf = (await api('GET', '/areas/san-francisco')).text; assert.notEqual(orinda.replace(/Orinda/g, 'X').replace(/\d/g, '0'), sf.replace(/San Francisco/g, 'X').replace(/\d/g, '0')); // not copy-paste pages
  await A.settings.set('delivery_tiers', [{ max_miles: 5, fee_cents: 799, free_over_cents: 10000 }, { max_miles: 30, fee_cents: 1999, free_over_cents: null }]);
  const sf2 = (await api('GET', '/areas/san-francisco')).text; assert.match(sf2, /\$19\.99/); // follows the owner's settings
  const he = (await api('GET', '/he/areas/orinda')).text; assert.match(he, /אורינדה/); assert.match(he, /משלוח ואיסוף מכולת כשרה/);
  assert.match((await api('GET', '/areas')).text, /href="\/areas\/walnut-creek"/); assert.equal((await api('GET', '/areas/atlantis')).status, 404);
  const faq = (await api('GET', '/faq')).text; assert.match(faq, /"@type":"FAQPage"/); assert.match(faq, /kosher for Passover/);
  const sm = (await api('GET', '/sitemap.xml')).text; for (const u of ['/areas/orinda', '/holiday/pesach', '/faq', '/he/areas/orinda', '/he/holiday/pesach']) assert.ok(sm.includes(u), u);
});

test('admin: Passover review lists, bulk confirm, bulk holiday tag, kosher type', async () => {
  const sug = (await admin('GET', '/api/admin/products?filter=passover_suggest')).json.items.map((p) => p.name); assert.ok(!sug.includes("Streit's Matzo Meal")); // already decided
  const m2 = await mk({ name: 'Manischewitz Matzah Ball Mix', category_id: cats.groceries });
  assert.ok((await admin('GET', '/api/admin/products?filter=passover_suggest')).json.items.some((p) => p.id === m2.id)); // name says matzah, owner still has to confirm
  assert.equal((await api('GET', '/api/products?passover=1')).json.items.some((p) => p.id === m2.id), false); // suggestions are NOT shown to customers
  assert.ok((await admin('GET', '/api/admin/products?filter=passover_unknown')).json.items.some((p) => p.id === m2.id));
  await admin('POST', '/api/admin/products/bulk', { ids: [m2.id], set: { passover: 'yes', kosher_type: 'pareve' }, add_holiday: 'pesach' });
  const got = (await admin('GET', '/api/admin/products/' + m2.id)).json; assert.equal(got.passover, 'yes'); assert.equal(got.kosher_type, 'pareve'); assert.equal(got.holidays, 'pesach');
  assert.ok((await api('GET', '/api/products?passover=1')).json.items.some((p) => p.id === m2.id));
  await admin('POST', '/api/admin/products/bulk', { ids: [m2.id], set: { passover: 'no' } }); assert.equal((await admin('GET', '/api/admin/products/' + m2.id)).json.passover, 'no');
});

test('import from the inventory app export: suppliers, supplier items, case size, Passover, SNAP, new departments', async () => {
  const text = 'name,upc,sku,category,brand,supplier,supplier_sku,case_size,cost,price,stock,kosher_passover,snap,taxable\nGefilte Fish Jar,722776000999,GF1,Canned Fish,Manischewitz,Kosher Wholesale Co,KW-77,12,2.40,3.99,24,yes,yes,no\nSoap,722776000998,SP1,Household,Palmolive,Kosher Wholesale Co,KW-78,6,1.1,2.49,6,no,no,yes\nWine,722776000997,W1,Canned Fish,Kedem,Other Dist,OD-1,6,5,8.99,,,,\n';
  const pre = (await admin('POST', '/api/admin/products/import', { text })).json; assert.equal(pre.skip, 2); // the two "Canned Fish" rows are skipped by default; Household already exists
  const pre2 = (await admin('POST', '/api/admin/products/import', { text, create_departments: true })).json; assert.deepEqual(pre2.new_departments, ['Canned Fish']); assert.equal(pre2.create, 3);
  assert.equal((await admin('POST', '/api/admin/products/import', { text, create_departments: true, commit: true })).json.saved, 3);
  const g = (await admin('GET', '/api/admin/products?q=722776000999')).json.items[0]; assert.equal(g.passover, 'yes'); assert.equal(g.snap, true); assert.equal(g.supplier_sku, 'KW-77'); assert.equal(Number(g.case_size), 12); assert.equal(g.category_name, 'Canned Fish'); assert.equal(g.supplier_name, 'Kosher Wholesale Co'); assert.equal(g.price_cents, 399);
  const w = (await admin('GET', '/api/admin/products?q=722776000997')).json.items[0]; assert.equal(w.passover, 'unknown'); // blank = not decided, never assumed
  assert.equal((await admin('GET', '/api/admin/suppliers')).json.filter((s) => /Kosher Wholesale Co|Other Dist/.test(s.name)).length, 2);
  assert.ok((await api('GET', '/api/categories')).json.some((c) => c.name === 'Canned Fish'));
  // re-importing updates rather than duplicating
  assert.equal((await admin('POST', '/api/admin/products/import', { text, create_departments: true })).json.update, 3);
});

test('accounts: password or emailed code; email ownership is proven before a password is saved', async () => {
  const cookieOf = (r) => r.headers.get('set-cookie').split(';')[0];
  assert.equal((await api('POST', '/api/auth/register', { email: 'new@example.com', password: 'short' })).status, 400);
  assert.equal((await api('POST', '/api/auth/register', { email: 'new@example.com', name: 'New Person', password: 'correct-horse-1' })).status, 200);
  assert.equal((await api('POST', '/api/auth/login', { email: 'new@example.com', password: 'correct-horse-1' })).status, 401); // not usable before the email is confirmed
  const code = sent.email.filter((m) => m.to === 'new@example.com').pop().html.match(/>(\d{6})</)[1];
  assert.equal((await api('POST', '/api/auth/verify', { email: 'new@example.com', code: '000000' })).status, 401);
  const v = await api('POST', '/api/auth/verify', { email: 'new@example.com', code }); assert.equal(v.status, 200); assert.equal(v.json.name, 'New Person');
  const me = (await api('GET', '/api/me', null, { cookie: cookieOf(v) })).json; assert.equal(me.signed_in, true); assert.equal(me.customer.has_password, true);
  const ok = await api('POST', '/api/auth/login', { email: 'NEW@example.com', password: 'correct-horse-1' }); assert.equal(ok.status, 200);
  const bad = await api('POST', '/api/auth/login', { email: 'new@example.com', password: 'wrong-password' }), none = await api('POST', '/api/auth/login', { email: 'nobody@example.com', password: 'wrong-password' });
  assert.equal(bad.status, 401); assert.equal(bad.json.error, none.json.error); // same message whether or not the account exists
  assert.equal((await api('POST', '/api/auth/login', { email: 'new@example.com', password: 'wrong-password' }, { 'X-Lang': 'he' })).json.error, 'אימייל או סיסמה שגויים');
  // someone who only ever checked out as a guest: registering does not let a stranger take the account
  await A.core.upsertCustomer({ email: 'guest@example.com', name: 'Guest' });
  await api('POST', '/api/auth/register', { email: 'guest@example.com', password: 'attacker-pass-1' });
  assert.equal((await A.db.one('SELECT password_hash FROM customers WHERE email=$1', ['guest@example.com'])).password_hash, null);
  assert.equal((await api('POST', '/api/auth/login', { email: 'guest@example.com', password: 'attacker-pass-1' })).status, 401);
  // the real owner signs in by code, then sets or changes the password
  await api('POST', '/api/auth/request', { email: 'guest@example.com' });
  const c2 = sent.email.filter((m) => m.to === 'guest@example.com').pop().html.match(/>(\d{6})</)[1];
  const v2 = await api('POST', '/api/auth/verify', { email: 'guest@example.com', code: c2 }); assert.equal(v2.status, 200);
  assert.equal((await A.db.one('SELECT password_hash FROM customers WHERE email=$1', ['guest@example.com'])).password_hash, null); // still not the attacker's
  assert.equal((await api('POST', '/api/auth/password', { password: 'short' }, { cookie: cookieOf(v2) })).status, 400);
  assert.equal((await api('POST', '/api/auth/password', { password: 'my-real-password' }, { cookie: cookieOf(v2) })).status, 200);
  assert.equal((await api('POST', '/api/auth/login', { email: 'guest@example.com', password: 'my-real-password' })).status, 200);
  assert.equal((await api('POST', '/api/auth/password', { password: 'my-real-password' })).status, 401); // must be signed in
  const row = await A.db.one('SELECT password_hash FROM customers WHERE email=$1', ['guest@example.com']); assert.match(row.password_hash, /^p1:/); assert.ok(!row.password_hash.includes('my-real-password'));
});

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 1)]);
const resp = (body, { status = 200, headers = {} } = {}) => ({ ok: status < 400, status, headers: { get: (k) => headers[k.toLowerCase()] ?? null }, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.length) });
test('photos are copied to our own storage, safely', async () => {
  assert.ok(isPrivateIp('127.0.0.1') && isPrivateIp('10.1.2.3') && isPrivateIp('192.168.0.5') && isPrivateIp('169.254.169.254') && isPrivateIp('::1') && !isPrivateIp('8.8.8.8'));
  const pub = (h) => [{ address: '93.184.216.34' }];
  const m = createMirror(A.db, { lookup: async () => [{ address: '93.184.216.34' }], fetchImpl: async (u) => (u.includes('bad-type') ? resp(Buffer.from('<svg onload=alert(1)>')) : u.includes('redir') ? resp(Buffer.alloc(0), { status: 302, headers: { location: 'https://internal.example/x.png' } }) : u.includes('404') ? resp(Buffer.alloc(0), { status: 404 }) : resp(PNG)) });
  const p = await mk({ name: 'Photo Item', image_url: 'https://img.example.com/a.png', category_id: cats.groceries });
  const p2 = await mk({ name: 'Photo Item Two', image_url: 'https://img.example.com/b.png', category_id: cats.groceries });
  const bad = await mk({ name: 'Svg Item', image_url: 'https://img.example.com/bad-type.svg', category_id: cats.groceries });
  const nf = await mk({ name: 'Missing Item', image_url: 'https://img.example.com/404.png', category_id: cats.groceries });
  const out = await m.run(50);
  assert.equal(out.done, 2); assert.equal(out.failed.length, 2); assert.match(out.failed.find((f) => f.id === bad.id).error, /not a PNG/);
  const got = (await admin('GET', '/api/admin/products/' + p.id)).json.image_url; assert.match(got, /^\/img\/[a-f0-9]{64}$/);
  assert.equal((await admin('GET', '/api/admin/products/' + p2.id)).json.image_url, got); // identical pictures are stored once
  assert.equal((await A.db.one('SELECT count(*)::int n FROM images')).n, 1);
  assert.equal((await admin('GET', '/api/admin/products/' + bad.id)).json.image_url, 'https://img.example.com/bad-type.svg'); // failures keep their old link
  const img = await fetch(base + got); assert.equal(img.status, 200); assert.equal(img.headers.get('content-type'), 'image/png'); assert.match(img.headers.get('cache-control'), /immutable/); assert.equal(Buffer.from(await img.arrayBuffer()).length, PNG.length);
  assert.equal((await fetch(base + '/img/' + 'a'.repeat(64))).status, 404); assert.equal((await fetch(base + '/img/../etc')).status, 404);
  // internal addresses and redirects into them are refused
  const priv = createMirror(A.db, { lookup: async () => [{ address: '169.254.169.254' }], fetchImpl: async () => resp(PNG) });
  await assert.rejects(() => priv.mirrorUrl('https://metadata.example/latest'), /not allowed/); await assert.rejects(() => priv.mirrorUrl('http://example.com/a.png'), /https/);
  const redir = createMirror(A.db, { lookup: async (h) => [{ address: h === 'internal.example' ? '10.0.0.1' : '93.184.216.34' }], fetchImpl: async () => resp(Buffer.alloc(0), { status: 302, headers: { location: 'https://internal.example/x.png' } }) });
  await assert.rejects(() => redir.mirrorUrl('https://ok.example/redir.png'), /not allowed/);
  const big = createMirror(A.db, { maxBytes: 20, lookup: async () => pub(), fetchImpl: async () => resp(PNG) }); await assert.rejects(() => big.mirrorUrl('https://ok.example/big.png'), /too large/);
  assert.equal((await admin('GET', '/api/admin/images/status')).json.external >= 2, true);
  assert.equal((await admin('GET', '/api/admin/products?filter=external_image')).json.items.some((x) => x.id === bad.id), true);
});
