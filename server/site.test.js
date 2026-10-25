'use strict';
// The website: pages, SEO files, content checks, email sign-in, family, yahrzeits and RSVPs.
// Needs a Postgres: starts a throwaway one automatically (or uses TEST_DATABASE_URL).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { createApp } = require('./index.js');
const { createStore } = require('./store.js');
const { startPg } = require('./pg-test-helper.js');
const { load, withOffset, DIR } = require('./site/content.js');
const { md } = require('./site/md.js');

const SECRET = 'a'.repeat(32), PW = 'correct horse battery';
const env = { PUBLIC_URL: 'http://site.test', SITE_HOME: '1', SITE_INDEXABLE: '1' };
let pg, store, server, base, mails, fbPosts;

test.before(async () => {
  pg = await startPg(); store = createStore(pg.url); await store.migrate();
  mails = []; fbPosts = [];
  const facebook = { photos: async () => [{ src: 'https://scontent.xx.fbcdn.net/a.jpg', alt: 'Menorah lighting', link: 'https://facebook.com/p/1' }], postEvent: async (e) => { fbPosts.push(e.slug); return { id: 'post_1' }; } };
  const app = createApp({ stripe: null, sessionSecret: SECRET, log: { error() {} }, store, adminPassword: PW, siteEnv: env, facebook,
    mailer: { send: async (m) => { mails.push(m); } } });
  server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  base = 'http://127.0.0.1:' + server.address().port;
});
test.after(async () => { server.close(); await store.close(); await pg.stop(); });
test.beforeEach(async () => { await store.reset(); mails.length = 0; });

// A tiny cookie-keeping client, like a browser.
function client() {
  let cookie = '';
  const call = async (method, p, body, headers = {}) => {
    const r = await fetch(base + p, { method, redirect: 'manual', headers: { 'content-type': 'application/json', 'x-site': '1', ...(cookie ? { cookie } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0].endsWith('=') ? '' : sc.split(';')[0];
    const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch (e) {}
    return { status: r.status, json, text, headers: r.headers };
  };
  return { call, get cookie() { return cookie; } };
}
async function signIn(email = 'Sara@Example.com') {
  const c = client();
  assert.equal((await c.call('POST', '/api/site/login', { email })).status, 200);
  const code = /code is (\d{6})/.exec(mails[mails.length - 1].text)[1];
  assert.equal((await c.call('POST', '/api/site/verify', { email, code })).status, 200);
  return c;
}
const EVENT = 'kabbalat-shabbat-and-dinner-2026-10-30';

test('content files are valid and linked together', () => {
  const c = load();
  assert.ok(c.events.length && c.programs.length && c.holidays.length && c.faq.length);
  for (const e of c.events) assert.match(e.startIso, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00[-+]\d{2}:00$/);
});
test('content errors are reported clearly', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'content-'));
  fs.cpSync(DIR, dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'events.json'), JSON.stringify([{ slug: 'Bad Slug', title: 'x', start: '6pm' }, { slug: 'a', title: 'A', start: '2026-01-01T10:00', program: 'nope' }]));
  assert.throws(() => load(dir), (e) => e.errors.some((m) => /bad slug/.test(m)) && e.errors.some((m) => /start must/.test(m)) && e.errors.some((m) => /unknown program/.test(m)));
  fs.rmSync(dir, { recursive: true, force: true });
});
test('times carry the right Pacific offset across daylight saving', () => {
  assert.equal(withOffset('2026-07-01T10:00'), '2026-07-01T10:00:00-07:00');
  assert.equal(withOffset('2026-12-06T16:30'), '2026-12-06T16:30:00-08:00');
});
test('markdown escapes HTML and unsafe links', () => {
  const h = md('# Hi\n<script>x</script> [a](javascript:alert(1)) **b**\n- one\n- two');
  assert.ok(!h.includes('<script>')); assert.ok(h.includes('href="#"')); assert.ok(h.includes('<strong>b</strong>')); assert.ok(h.includes('<ul><li>one</li><li>two</li></ul>'));
});

test('home and key pages render with structured data and security headers', async () => {
  const c = client();
  const home = await c.call('GET', '/');
  assert.equal(home.status, 200);
  assert.match(home.text, /"@type":\["Synagogue","NGO"\]/);
  assert.match(home.text, /Candle lighting/);
  assert.match(home.text, /fbcdn\.net\/a\.jpg/);
  assert.match(home.headers.get('content-security-policy'), /img-src 'self' data: https:\/\/\*\.fbcdn\.net/);
  const ev = await c.call('GET', '/events/' + EVENT);
  assert.match(ev.text, /"@type":"Event"/); assert.match(ev.text, /"startDate":"2026-10-30T18:30:00-07:00"/);
  assert.match(ev.text, /data-rsvp="kabbalat-shabbat-and-dinner-2026-10-30"/);
  for (const p of ['/events', '/shabbat', '/holidays', '/holidays/passover', '/programs', '/programs/hebrew-school', '/jewish-lamorinda', '/about', '/faq', '/contact', '/photos', '/account', '/tools/hebrew-date?d=2026-10-25', '/tools/yahrzeit?d=2020-03-10', '/tools/bar-bat-mitzvah?d=2014-03-10']) {
    assert.equal((await c.call('GET', p)).status, 200, p);
  }
  assert.match((await c.call('GET', '/tools/hebrew-date?d=2026-10-25')).text, /14th of Cheshvan, 5787/);
  // drafts stay hidden
  assert.equal((await c.call('GET', '/events/chanukah-grand-menorah-lighting-2026')).status, 404);
  const nf = await c.call('GET', '/no-such-page'); assert.equal(nf.status, 404); assert.match(nf.text, /could not find that page/);
});
test('the app itself stays reachable', async () => {
  const c = client();
  assert.equal((await c.call('GET', '/pushka/')).status, 200);
  assert.equal((await c.call('GET', '/healthz')).text, 'ok');
});

test('SEO and AI files', async () => {
  const c = client();
  const robots = await c.call('GET', '/robots.txt');
  assert.match(robots.text, /User-agent: GPTBot\nAllow: \//); assert.match(robots.text, /User-agent: ClaudeBot/); assert.match(robots.text, /Sitemap: http:\/\/site\.test\/sitemap\.xml/);
  const sm = await c.call('GET', '/sitemap.xml'); assert.match(sm.text, /<loc>http:\/\/site\.test\/events\/kabbalat-shabbat/); assert.ok(!sm.text.includes('grand-menorah'));
  const llms = await c.call('GET', '/llms.txt'); assert.match(llms.text, /^# Chabad of Lamorinda/); assert.match(llms.text, /3477 Golden Gate Way/);
  const ics = await c.call('GET', '/events.ics'); assert.match(ics.text, /BEGIN:VCALENDAR/); assert.match(ics.text, /DTSTART;TZID=America\/Los_Angeles:20261030T183000/);
  assert.match((await c.call('GET', '/feed.xml')).text, /<rss/);
});

test('email sign-in: code, link, wrong codes, and the account is shared with the app', async () => {
  const c = client();
  assert.equal((await c.call('POST', '/api/site/login', { email: 'nope' })).json.code, 'invalid_email');
  assert.equal((await c.call('POST', '/api/site/login', { email: 'x@y.co' }, { 'x-site': '' })).status, 403); // must come from our pages
  assert.equal((await c.call('GET', '/api/site/me')).status, 401);
  // A member who joined through My Pushka signs in to the same record.
  const app = await fetch(base + '/api/member', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Sara Levi', email: 'sara@example.com' }) });
  assert.equal(app.status, 200);
  await c.call('POST', '/api/site/login', { email: 'Sara@Example.com' });
  assert.equal(mails[0].to, 'sara@example.com');
  for (let i = 0; i < 5; i++) assert.equal((await c.call('POST', '/api/site/verify', { email: 'sara@example.com', code: '000000' === /code is (\d{6})/.exec(mails[0].text)[1] ? '111111' : '000000' })).status, 400);
  const code = /code is (\d{6})/.exec(mails[0].text)[1];
  assert.equal((await c.call('POST', '/api/site/verify', { email: 'sara@example.com', code })).status, 400, 'five wrong tries burn the code');
  await c.call('POST', '/api/site/login', { email: 'sara@example.com' });
  const link = /(\/account\/verify\?\S+)/.exec(mails[1].text)[1];
  const v = await c.call('GET', link); assert.equal(v.status, 302); assert.equal(v.headers.get('location'), '/account');
  const me = await c.call('GET', '/api/site/me'); assert.equal(me.status, 200); assert.equal(me.json.profile.name, 'Sara Levi');
  assert.equal((await c.call('GET', link)).headers.get('location'), '/account?expired=1', 'links work once');
});

test('profile, family and yahrzeits; app yahrzeits are kept separate', async () => {
  const c = await signIn();
  assert.equal((await c.call('PUT', '/api/site/me', { name: '' })).json.code, 'invalid_name');
  assert.equal((await c.call('PUT', '/api/site/me', { name: 'Sara Levi', hebrewName: 'Sarah bat Avraham', birthday: '1985-04-02', anniversary: '2010-06-20', shareYahrzeits: true })).status, 200);
  assert.equal((await c.call('PUT', '/api/site/family', { family: [{ name: 'David Levi', relation: 'spouse', gender: 'm' }, { name: 'Noa', relation: 'child', gender: 'f', birthday: '2016-01-15' }, { name: 'Eli', relation: 'child', birthday: '2019-09-09' }] })).status, 200);
  assert.equal((await c.call('PUT', '/api/site/family', { family: [{ name: '' }] })).json.code, 'invalid_family');
  assert.equal((await c.call('PUT', '/api/site/yahrzeits', { yahrzeits: [{ name: 'Avraham ben Yitzchak', relation: 'Father', date: '2020-03-10' }] })).status, 200);
  const me = (await c.call('GET', '/api/site/me')).json;
  assert.equal(me.profile.hebrewName, 'Sarah bat Avraham'); assert.equal(me.family.length, 3); assert.equal(me.family[1].birthday, '2016-01-15');
  assert.equal(me.yahrzeits[0].day, 14); assert.equal(me.yahrzeits[0].month, 'Adar'); assert.ok(me.yahrzeits[0].next);
  // The Rabbi sees shared yahrzeits from the website too.
  const shared = await store.sharedYahrzeits(); assert.equal(shared.length, 1);
  // A My Pushka sync replaces only the app's own entries.
  await store.replaceYahrzeits((await store.pool.query('SELECT id FROM members')).rows[0].id, [{ id: 'a1', name: 'From app', relation: '', day: 1, month: 'Nisan', year: null, notes: '' }]);
  assert.equal((await c.call('GET', '/api/site/me')).json.yahrzeits.length, 2);
});

test('RSVP: one tap for members (family counted), guests by form, capacity, update, cancel', async () => {
  const c = await signIn();
  await c.call('PUT', '/api/site/me', { name: 'Sara Levi' });
  await c.call('PUT', '/api/site/family', { family: [{ name: 'David', relation: 'spouse' }, { name: 'Noa', relation: 'child' }] });
  const s = (await c.call('GET', '/api/site/rsvp/' + EVENT)).json;
  assert.equal(s.signedIn, true); assert.deepEqual(s.suggest, { adults: 2, kids: 1 }); assert.equal(s.capacity, 40);
  assert.equal((await c.call('POST', '/api/site/rsvp/' + EVENT, { adults: 2, kids: 1 })).json.going, 3);
  assert.equal(mails[mails.length - 1].subject, "You're coming: Kabbalat Shabbat and Shabbat Dinner");
  assert.equal((await c.call('POST', '/api/site/rsvp/' + EVENT, { adults: 2, kids: 2 })).json.going, 4, 'second RSVP updates, not duplicates');
  const g = client();
  assert.equal((await g.call('POST', '/api/site/rsvp/' + EVENT, { adults: 1 })).json.code, 'invalid_name');
  assert.equal((await g.call('POST', '/api/site/rsvp/' + EVENT, { adults: 0, kids: 0, name: 'G', email: 'g@x.co' })).json.code, 'invalid_count');
  assert.equal((await g.call('POST', '/api/site/rsvp/' + EVENT, { adults: 30, kids: 10, name: 'Big Group', email: 'big@x.co' })).json.code, 'full');
  assert.equal((await g.call('POST', '/api/site/rsvp/' + EVENT, { adults: 1, name: 'Guest', email: 'guest@x.co' })).json.going, 5);
  assert.equal((await g.call('POST', '/api/site/rsvp/chanukah-grand-menorah-lighting-2026', { adults: 1, name: 'G', email: 'g@x.co' })).status, 404, 'drafts take no RSVPs');
  assert.deepEqual((await c.call('GET', '/api/site/me')).json.rsvps, [{ event: EVENT, adults: 2, kids: 2 }]);
  assert.equal((await c.call('DELETE', '/api/site/rsvp/' + EVENT)).status, 200);
  assert.equal((await g.call('GET', '/api/site/rsvp/' + EVENT)).json.going, 1);
  assert.match((await g.call('GET', '/events/' + EVENT)).text, /39 of 40 places left/);
});

test('Rabbi area: RSVP lists, birthdays, post to Facebook', async () => {
  const c = await signIn();
  const today = new Date(), soon = new Date(today.getTime() + 5 * 864e5);
  const bday = '2015-' + String(soon.getUTCMonth() + 1).padStart(2, '0') + '-' + String(soon.getUTCDate()).padStart(2, '0');
  await c.call('PUT', '/api/site/me', { name: 'Sara Levi' });
  await c.call('PUT', '/api/site/family', { family: [{ name: 'Noa', relation: 'child', birthday: bday }] });
  await c.call('POST', '/api/site/rsvp/' + EVENT, { adults: 2 });
  const a = client();
  const login = await a.call('POST', '/admin/api/login', { password: PW }); assert.equal(login.status, 200);
  const h = { 'x-admin': '1' };
  const ev = (await a.call('GET', '/admin/api/site/rsvps')).json.events.find((e) => e.slug === EVENT);
  assert.equal(ev.going, 2);
  const list = (await a.call('GET', '/admin/api/site/rsvps/' + EVENT)).json.list; assert.equal(list[0].name, 'Sara Levi');
  const b = (await a.call('GET', '/admin/api/site/birthdays?days=10')).json.items.find((i) => i.kind === 'birthday');
  assert.equal(b.name, 'Noa'); assert.equal(b.family, 'Sara Levi');
  assert.equal((await a.call('POST', '/admin/api/site/facebook/' + EVENT, {}, h)).json.id, 'post_1'); assert.deepEqual(fbPosts, [EVENT]);
  assert.equal((await client().call('GET', '/admin/api/site/rsvps')).status, 401);
});
