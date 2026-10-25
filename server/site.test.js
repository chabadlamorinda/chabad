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
let pg, store, server, base, mails, fbPosts, theApp;
const server_site = () => theApp.locals.site;

test.before(async () => {
  pg = await startPg(); store = createStore(pg.url); await store.migrate();
  mails = []; fbPosts = [];
  const facebook = { instagram: true, photos: async () => [{ src: 'https://scontent.xx.fbcdn.net/a.jpg', alt: 'Menorah lighting', link: 'https://facebook.com/p/1' }],
    publish: async (p) => { fbPosts.push(['facebook', p]); return 'page_post_1'; }, publishInstagram: async (p) => { if (!p.image) throw new Error('Instagram posts need a picture'); fbPosts.push(['instagram', p]); return 'ig_1'; } };
  const app = createApp({ stripe: null, sessionSecret: SECRET, log: { error() {} }, store, adminPassword: PW, siteEnv: env, facebook,
    mailer: { send: async (m) => { mails.push(m); } } });
  theApp = app;
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
  // Social drafts: every upcoming event is a ready post; one button publishes it.
  const soc = (await a.call('GET', '/admin/api/site/social')).json;
  const d = soc.items.find((x) => x.slug === EVENT);
  assert.match(d.message, /RSVP in one tap: http:\/\/site\.test\/events\/kabbalat-shabbat/); assert.match(d.message, /#Lafayette #Moraga #Orinda/);
  assert.match(d.googleCalendar, /^https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE/);
  assert.deepEqual(d.posted, {});
  const pub = (await a.call('POST', '/admin/api/site/social/' + EVENT, { message: 'Edited text', networks: ['facebook', 'instagram'] }, h)).json;
  assert.equal(pub.results.facebook.ok, true); assert.equal(pub.results.instagram.ok, false, 'no picture, no Instagram');
  assert.equal(fbPosts[0][1].message, 'Edited text'); assert.equal(fbPosts[0][1].link, 'http://site.test/events/' + EVENT);
  assert.ok((await a.call('GET', '/admin/api/site/social')).json.items.find((x) => x.slug === EVENT).posted.facebook);
  assert.equal((await client().call('GET', '/admin/api/site/rsvps')).status, 401);
});

test('town pages: local Shabbat times, distance, local questions, linked everywhere', async () => {
  const c = client();
  const m = await c.call('GET', '/jewish-moraga');
  assert.equal(m.status, 200);
  assert.match(m.text, /<h1>Jewish Moraga<\/h1>/); assert.match(m.text, /3\.6 miles from us/); assert.match(m.text, /Is there a synagogue in Moraga\?/);
  assert.match(m.text, /"@type":"FAQPage"/); assert.match(m.text, /Shabbat in Moraga/);
  assert.equal((await c.call('GET', '/jewish-martinez')).status, 200);
  assert.equal((await c.call('GET', '/jewish-nowhere')).status, 404);
  assert.match((await c.call('GET', '/our-area')).text, /Jewish Pleasant Hill/);
  assert.match((await c.call('GET', '/')).text, /href="\/jewish-orinda"/);
  assert.match((await c.call('GET', '/sitemap.xml')).text, /\/jewish-walnut-creek/);
  assert.match((await c.call('GET', '/llms.txt')).text, /Jewish Martinez, CA/);
});

test('learn guides: index, article with Q&A markup, related guides', async () => {
  const c = client(), C = load();
  assert.ok(C.learn.length >= 16);
  const a = C.learn.find((x) => x.slug === 'mezuzah');
  const r = await c.call('GET', '/learn/mezuzah');
  assert.equal(r.status, 200); assert.match(r.text, /"@type":"Article"/); assert.match(r.text, /In Lamorinda/);
  if (a.faq.length) assert.match(r.text, /"@type":"FAQPage"/);
  assert.match((await c.call('GET', '/learn')).text, /href="\/learn\/shabbat"/);
  assert.equal((await c.call('GET', '/learn/not-a-guide')).status, 404);
});

test('old Chabad.org addresses redirect to the new pages', async () => {
  const c = client();
  for (const [from, to] of [['/3186196', '/programs/hebrew-school'], ['/templates/section_cdo/aid/5180613/jewish/Lamorinda-Jewish-Preschool.htm', '/programs/jewish-preschool'], ['/article.asp?aid=3186877', '/programs/hebrew-school'], ['/4970020', '/donate']]) {
    const r = await c.call('GET', from); assert.equal(r.status, 301, from); assert.equal(r.headers.get('location'), to);
  }
});

test('community board: submit, moderate, then it appears', async () => {
  const g = client();
  assert.equal((await g.call('POST', '/api/site/submit', { kind: 'mazal-tov', title: 'x', name: 'A', email: 'a@x.co' }, { 'x-site': '' })).status, 403);
  assert.equal((await g.call('POST', '/api/site/submit', { kind: 'nope', title: 'x', name: 'A', email: 'a@x.co' })).json.code, 'invalid_kind');
  assert.equal((await g.call('POST', '/api/site/submit', { kind: 'mazal-tov', title: 'Mazal Tov to the Levi family on the twins!', body: 'Welcome Noa!', name: 'Sara', email: 'sara@x.co' })).status, 200);
  assert.match(mails[mails.length - 1].subject, /^Mazal Tov: Mazal Tov to the Levi family/);
  assert.ok(!(await g.call('GET', '/community')).text.includes('Levi family on the twins'), 'not shown before approval');
  const a = client(); await a.call('POST', '/admin/api/login', { password: PW });
  const item = (await a.call('GET', '/admin/api/site/submissions')).json.items[0];
  assert.equal((await a.call('POST', '/admin/api/site/submissions/' + item.id, { status: 'approved' }, { 'x-admin': '1' })).status, 200);
  assert.match((await g.call('GET', '/community')).text, /Levi family on the twins/);
  assert.match((await g.call('GET', '/')).text, /Community news/);
  assert.equal((await g.call('GET', '/get-involved')).status, 200);
});

test('reminder emails: yahrzeit a week and a day before, Hebrew birthday, never twice', async () => {
  const c = await signIn();
  await c.call('PUT', '/api/site/me', { name: 'Sara Levi' });
  const H = require('../pushka/hebdate.js'), { createReminders } = require('./site/reminders.js');
  const today = '2026-11-01', inWeek = H.addDays(today, 7), p = H.parts(inWeek), bday = H.addDays(today, 1);
  await c.call('PUT', '/api/site/yahrzeits', { yahrzeits: [{ name: 'Avraham ben Yitzchak', day: p.day, month: p.month }] });
  const kidBorn = (() => { const t = H.parts(bday); for (let y = 2015; ; y--) { const d = String(y) + bday.slice(4); const q = H.parts(d); if (q.day === t.day && q.month === t.month) return d; if (y < 1990) return null; } })();
  if (kidBorn) await c.call('PUT', '/api/site/family', { family: [{ name: 'Noa', relation: 'child', birthday: kidBorn }] });
  const out = [], rem = createReminders({ store, mailer: { send: async (m) => out.push(m) }, base: 'http://site.test', org: load().org, now: () => new Date(today + 'T18:00:00Z') });
  const n = await rem.run();
  assert.ok(out.some((m) => /Yahrzeit of Avraham ben Yitzchak: in one week/.test(m.subject)));
  if (kidBorn) assert.ok(out.some((m) => /Noa's Hebrew birthday is tomorrow/.test(m.subject)));
  assert.equal(await rem.run(), 0, 'each reminder is sent once'); assert.equal(out.length, n);
  const early = createReminders({ store, mailer: { send: async () => {} }, base: '', org: load().org, now: () => new Date(today + 'T14:00:00Z') });
  assert.equal(await early.run(), 0, 'not before 9 AM Lafayette time');
});

test('languages: Hebrew and Russian pages, automatic choice, switch, hreflang', async () => {
  const c = client();
  const he = await c.call('GET', '/he/');
  assert.equal(he.status, 200); assert.match(he.text, /<html lang="he" dir="rtl">/);
  assert.match(he.text, /hreflang="ru" href="http:\/\/site\.test\/ru"/); assert.match(he.text, /href="\/he\/events"/, 'internal links stay in Hebrew');
  assert.match((await c.call('GET', '/ru/events')).text, /<html lang="ru" dir="ltr">/);
  // The phone's language picks the version; search engines and a saved choice are never redirected.
  const auto = await c.call('GET', '/events', undefined, { 'accept-language': 'he-IL,he;q=0.9,en;q=0.8' });
  assert.equal(auto.status, 302); assert.equal(auto.headers.get('location'), '/he/events');
  assert.equal((await c.call('GET', '/events', undefined, { 'accept-language': 'ru-RU,ru', 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' })).status, 200);
  assert.equal((await c.call('GET', '/events', undefined, { 'accept-language': 'he', cookie: 'lang=en' })).status, 200);
  const sw = await c.call('GET', '/lang/ru?to=%2Flearn%2Fmezuzah');
  assert.equal(sw.status, 302); assert.equal(sw.headers.get('location'), '/ru/learn/mezuzah'); assert.match(sw.headers.get('set-cookie'), /^lang=ru;/);
  assert.equal((await c.call('GET', '/lang/ru?to=%2F%2Fevil.com')).headers.get('location'), '/ru', 'no open redirect');
  // Translated content.
  assert.match((await c.call('GET', '/he/learn/mezuzah')).text, /מזוזה/);
  assert.match((await c.call('GET', '/ru/learn/mezuzah')).text, /[Мм]езуз/);
  assert.match((await c.call('GET', '/he/events/' + EVENT)).text, /קבלת שבת וסעודת שבת/);
  assert.match((await c.call('GET', '/sitemap.xml')).text, /<loc>http:\/\/site\.test\/he\/learn\/mezuzah<\/loc>/);
});

test('help, Kaddish, Tehillim and sponsor pages', async () => {
  const c = client();
  for (const p of ['/help', '/help/someone-passed-away', '/help/someone-is-sick', '/kaddish', '/tehillim', '/sponsor', '/he/help', '/ru/kaddish', '/he/tehillim']) assert.equal((await c.call('GET', p)).status, 200, p);
  const sp = (await c.call('GET', '/sponsor?o=yahrzeit&name=Avraham%20ben%20Yitzchak')).text;
  assert.match(sp, /In memory of Avraham ben Yitzchak/); assert.match(sp, /\/pushka\/\?go=give&amp;fund=general&amp;ded=In%20memory%20of%20Avraham%20ben%20Yitzchak/);
  assert.match(sp, /href="\/kiddush\/"/);
  const th = (await c.call('GET', '/tehillim?name=' + encodeURIComponent('משה'))).text;
  assert.match(th, /Psalms\.119\.97-104/); assert.match(th, /Psalms\.119\.161-168/); assert.match(th, /Psalms\.119\.33-40/); // מ ש ה
  const bd = (await c.call('GET', '/tehillim?b=1986-05-01')).text;
  assert.match(bd, /Your chapter this year is/); assert.match(bd, /Psalm (41|42)\b/);
  assert.match((await c.call('GET', '/tehillim')).text, /Today&#39;s Tehillim/);
  assert.match((await c.call('GET', '/help/someone-passed-away')).text, /tel:9253847242/);
});

test('Kaddish requests and the prayer list stay private', async () => {
  const g = client();
  assert.equal((await g.call('POST', '/api/site/submit', { kind: 'kaddish', title: 'Kaddish: Avraham', body: 'Kaddish for: 11 months', name: 'Sara', email: 'sara@x.co' })).status, 200);
  assert.equal((await g.call('POST', '/api/site/submit', { kind: 'tehillim', title: 'Moshe ben Sarah', body: 'For: refuah', name: 'Sara', email: 'sara@x.co' })).status, 200);
  assert.match(mails[mails.length - 1].subject, /^\[Private\] Prayer list/);
  const a = client(); await a.call('POST', '/admin/api/login', { password: PW });
  const items = (await a.call('GET', '/admin/api/site/submissions')).json.items;
  for (const i of items) await a.call('POST', '/admin/api/site/submissions/' + i.id, { status: 'approved' }, { 'x-admin': '1' });
  const board = (await g.call('GET', '/community')).text;
  assert.ok(!board.includes('Moshe ben Sarah') && !board.includes('Kaddish: Avraham'), 'never shown publicly');
  // Errors come back in the visitor's language once translations exist.
  const he = await g.call('POST', '/api/site/submit', { kind: 'nope' }, { 'x-lang': 'he' });
  assert.equal(he.json.code, 'invalid_kind');
});

test('every interface phrase on the main pages is translated into Hebrew and Russian', async () => {
  const c = client(), i18n = server_site().i18n;
  i18n.missing.clear();
  const pages = ['/', '/events', '/events/' + EVENT, '/shabbat', '/holidays', '/holidays/chanukah', '/programs', '/programs/hebrew-school', '/jewish-lamorinda', '/learn', '/learn/mezuzah', '/learn/yahrzeit', '/our-area', '/jewish-moraga', '/community', '/get-involved', '/help', '/help/someone-passed-away', '/kaddish', '/tehillim', '/tehillim?b=1986-05-01&name=%D7%9E%D7%A9%D7%94', '/sponsor?o=yahrzeit&name=A', '/account', '/about', '/contact', '/faq', '/photos', '/tools/hebrew-date?d=2026-10-25', '/tools/yahrzeit?d=2020-03-10', '/tools/bar-bat-mitzvah?d=2014-03-10', '/no-such-page'];
  for (const l of ['he', 'ru']) for (const p of pages) await c.call('GET', '/' + l + p);
  assert.deepEqual([...i18n.missing], [], 'add these to site/content/i18n/he.json and ru.json');
  // and the content itself: every guide, help page, holiday and page has both translations
  const C = load(), fs = require('fs'), path = require('path');
  for (const l of ['he', 'ru']) for (const [dir, list] of [['learn', C.learn], ['help', C.help], ['holidays', C.holidays], ['pages', C.pages]]) for (const x of list) assert.ok(fs.existsSync(path.join(DIR, 'i18n', l, dir, x.slug + '.md')), `${l}/${dir}/${x.slug}.md is missing`);
  for (const l of ['he', 'ru']) for (const f of ['org.json', 'programs.json', 'faq.json', 'directory.json', 'towns.json', 'sponsor.json', 'tehillim.json']) assert.ok(fs.existsSync(path.join(DIR, 'i18n', l, f)), `${l}/${f} is missing`);
});
