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
const chatCalls = [];
const server_site = () => theApp.locals.site;

test.before(async () => {
  pg = await startPg(); store = createStore(pg.url); await store.migrate();
  mails = []; fbPosts = [];
  const facebook = { instagram: true, photos: async () => [{ src: 'https://scontent.xx.fbcdn.net/a.jpg', alt: 'Menorah lighting', link: 'https://facebook.com/p/1' }],
    publish: async (p) => { fbPosts.push(['facebook', p]); return 'page_post_1'; }, publishInstagram: async (p) => { if (!p.image) throw new Error('Instagram posts need a picture'); fbPosts.push(['instagram', p]); return 'ig_1'; } };
  // A stand-in for Claude: records the request and streams a short answer.
  const chatClient = { messages: { stream: (params) => {
    chatCalls.push(params);
    const text = 'Shabbat services are Saturday at 10 AM. See [Shabbat times](/shabbat).';
    return { async *[Symbol.asyncIterator]() { for (const w of text.match(/.{1,12}/g)) yield { type: 'content_block_delta', delta: { type: 'text_delta', text: w } }; }, finalMessage: async () => ({ stop_reason: 'end_turn' }) };
  } } };
  const app = createApp({ stripe: null, sessionSecret: SECRET, log: { error() {} }, store, adminPassword: PW, siteEnv: env, facebook, chatClient,
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
  assert.match((await c.call('GET', '/events')).text, /"@type":"EventSeries".*"byDay":"https:\/\/schema.org\/Sunday"/);
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
  const kinds = me.upcoming.map((u) => u.kind);
  assert.ok(kinds.includes('yahrzeit') && kinds.includes('hebrew-birthday') && kinds.includes('anniversary'), kinds.join());
  assert.ok(me.upcoming.every((u, i, a) => !i || a[i - 1].date <= u.date), 'soonest first');
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
  assert.match((await c.call('GET', '/sitemap.xml')).text, /\/jewish-pleasant-hill/);
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

test('mezuzah and tefillin checking reminders, and the Bar/Bat Mitzvah invitation', async () => {
  const c = await signIn();
  // Mezuzahs checked 3.5 years ago are due now; tefillin checked last year are not.
  await c.call('PUT', '/api/site/me', { name: 'Dovid Katz', mezuzahsChecked: '2022-05-01', tefillinChecked: '2025-06-01' });
  const me = (await c.call('GET', '/api/site/me')).json;
  assert.equal(me.profile.mezuzahsChecked, '2022-05-01');
  assert.ok(me.upcoming.some((u) => u.kind === 'mezuzah-check'));
  const { checkDue } = require('./site/community.js');
  assert.equal(checkDue('2022-05-01'), '2025-11-01'); assert.equal(checkDue(''), '');
  const { createReminders } = require('./site/reminders.js'), out = [];
  const rem = createReminders({ store, mailer: { send: async (m) => out.push(m) }, base: 'http://site.test', org: load().org, now: () => new Date('2026-11-01T18:00:00Z') });
  await rem.run();
  assert.equal(out.filter((m) => /mezuzahs checked/.test(m.subject)).length, 1);
  assert.ok(!out.some((m) => /tefillin checked/.test(m.subject)));
  await rem.run();
  assert.equal(out.filter((m) => /mezuzahs checked/.test(m.subject)).length, 1, 'only once');

  // Bar/Bat Mitzvah invitation about 18 months ahead, sent once. A girl born 11 years ago turns 12 (Bat Mitzvah) in about a year.
  await c.call('PUT', '/api/site/family', { family: [{ name: 'Chaya', relation: 'child', gender: 'f', birthday: '2015-12-01' }, { name: 'Moshe', relation: 'child', gender: 'm', birthday: '2024-01-01' }] });
  out.length = 0; await rem.run(); await rem.run();
  assert.equal(out.filter((m) => /Chaya's Bat Mitzvah is coming up/.test(m.subject)).length, 1);
  assert.ok(!out.some((m) => /Moshe/.test(m.subject)), 'not years too early');
  // Outreach: pages a signed-in member reads help the Rabbi know whom to invite or check in on.
  await c.call('PUT', '/api/site/me', { name: 'Rivka Stein', phone: '(925) 555-0100' });
  for (const path of ['/events/' + EVENT, '/he/help/someone-passed-away', '/about']) assert.equal((await c.call('POST', '/api/site/seen', { path }, { 'x-site': '1' })).status, 204);
  const adm = client(); await adm.call('POST', '/admin/api/login', { password: PW });
  const inv = (await adm.call('GET', '/admin/api/site/outreach/event/' + EVENT)).json.items.find((x) => x.name === 'Rivka Stein');
  assert.ok(inv && inv.reasons.includes('looked at this event'), 'a family that looked at the event is suggested');
  assert.match(inv.whatsapp, /^https:\/\/wa\.me\/19255550100\?text=Hi%20Rivka!/);
  let todo = (await adm.call('GET', '/admin/api/site/outreach')).json.items.filter((x) => x.name === 'Rivka Stein');
  const chk = todo.find((x) => x.kind === 'check-in');
  assert.ok(chk, 'reading about a loss suggests a gentle check-in'); assert.match(chk.reason, /a loss in the family/);
  assert.equal((await adm.call('POST', '/admin/api/site/outreach/done', { memberId: chk.memberId, key: chk.key }, { 'x-admin': '1' })).status, 200);
  todo = (await adm.call('GET', '/admin/api/site/outreach')).json.items.filter((x) => x.name === 'Rivka Stein');
  assert.ok(!todo.some((x) => x.kind === 'check-in'), 'done items disappear');
  assert.ok((await c.call('GET', '/api/site/for-you')).json.items.some((x) => x.slug === EVENT), 'For your family shows events that fit');
  // Turning suggestions off stops noting pages.
  await c.call('PUT', '/api/site/me', { name: 'Rivka Stein', personalize: false });
  await c.call('POST', '/api/site/seen', { path: '/learn/mezuzah' }, { 'x-site': '1' });
  assert.equal((await store.pool.query("SELECT count(*)::int AS n FROM member_activity WHERE path='/learn/mezuzah'")).rows[0].n, 0);
  // Allergies saved in the account travel with the RSVP to the Rabbi's list.
  await c.call('PUT', '/api/site/me', { name: 'Rivka Stein', diet: 'vegetarian' });
  await c.call('PUT', '/api/site/family', { family: [{ name: 'Chaya', relation: 'child', diet: 'peanut allergy' }] });
  assert.equal((await c.call('GET', '/api/site/me')).json.family[0].diet, 'peanut allergy');
  await c.call('POST', '/api/site/rsvp/' + EVENT, { adults: 1, kids: 1 });
  const row = (await adm.call('GET', '/admin/api/site/rsvps/' + EVENT)).json.list.find((x) => x.name === 'Rivka Stein');
  assert.match(row.diet, /vegetarian/); assert.match(row.diet, /Chaya: peanut allergy/);
  // A private calendar link with the family's Jewish dates (works without the sign-in cookie, only with its key).
  await c.call('PUT', '/api/site/me', { name: 'Rivka Stein', mezuzahsChecked: '2022-05-01' });
  await c.call('PUT', '/api/site/family', { family: [{ name: 'Chaya', relation: 'child', gender: 'f', birthday: '2015-12-01' }] });
  const url = (await c.call('GET', '/api/site/me')).json.calendarUrl;
  assert.match(url, /^webcal:\/\/site\.test\/api\/site\/me\/calendar\.ics\?k=m_/);
  const ics = await client().call('GET', url.replace(/^webcal:\/\/site\.test/, ''));
  assert.equal(ics.status, 200); assert.match(ics.text, /BEGIN:VCALENDAR/); assert.match(ics.text, /SUMMARY:Bat Mitzvah: Chaya/); assert.match(ics.text, /SUMMARY:Mezuzahs due for checking/);
  assert.equal((await client().call('GET', url.replace(/^webcal:\/\/site\.test/, '').replace(/.$/, 'x'))).status, 404, 'a wrong key shows nothing');
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
  const pages = ['/', '/events', '/events/' + EVENT, '/shabbat', '/holidays', '/holidays/chanukah', '/programs', '/programs/hebrew-school', '/jewish-lamorinda', '/learn', '/learn/mezuzah', '/learn/yahrzeit', '/our-area', '/jewish-moraga', '/community', '/get-involved', '/help', '/help/someone-passed-away', '/kaddish', '/tehillim', '/tehillim?b=1986-05-01&name=%D7%9E%D7%A9%D7%94', '/sponsor?o=yahrzeit&name=A', '/account', '/about', '/contact', '/faq', '/photos', '/tools/hebrew-date?d=2026-10-25', '/tools/yahrzeit?d=2020-03-10', '/tools/bar-bat-mitzvah?d=2014-03-10', '/no-such-page', '/donate', '/forms', '/forms/hebrew-school', '/forms/summer-camp', '/forms/sell-chametz', '/welcome', '/jewish-martinez', '/help/disputes', '/parsha', '/calendar', '/tools/zmanim', '/tools/hebrew-birthday?d=1985-04-02', '/daily-study', '/ask', '/shabbat-times', '/shabbat-times/orinda', '/this-week', '/jewish-holidays-' + new Date().getFullYear()];
  for (const l of ['he', 'ru']) for (const p of pages) await c.call('GET', '/' + l + p);
  assert.deepEqual([...i18n.missing], [], 'add these to site/content/i18n/he.json and ru.json');
  // and the content itself: every guide, help page, holiday and page has both translations
  const C = load(), fs = require('fs'), path = require('path');
  for (const l of ['he', 'ru']) for (const [dir, list] of [['learn', C.learn], ['help', C.help], ['holidays', C.holidays], ['pages', C.pages]]) for (const x of list) assert.ok(fs.existsSync(path.join(DIR, 'i18n', l, dir, x.slug + '.md')), `${l}/${dir}/${x.slug}.md is missing`);
  for (const l of ['he', 'ru']) for (const f of ['org.json', 'programs.json', 'faq.json', 'directory.json', 'towns.json', 'sponsor.json', 'tehillim.json', 'forms.json', 'giving.json']) assert.ok(fs.existsSync(path.join(DIR, 'i18n', l, f)), `${l}/${f} is missing`);
});

test('forms: Hebrew School registration with tuition, camp pricing, chametz authorization, Rabbi area', async () => {
  const g = client();
  assert.equal((await g.call('GET', '/forms')).status, 200);
  const page = (await g.call('GET', '/forms/hebrew-school')).text;
  assert.match(page, /data-form="hebrew-school"/); assert.match(page, /name="children\.0\.name"/);
  assert.match((await g.call('GET', '/programs/hebrew-school')).text, /href="\/forms\/hebrew-school"/);
  assert.match((await g.call('GET', '/holidays/passover')).text, /href="\/forms\/sell-chametz"/);
  // missing required answers
  const bad = await g.call('POST', '/api/site/forms/hebrew-school', { fields: { name: 'Sara' } });
  assert.equal(bad.status, 400); assert.match(bad.json.error, /Email/);
  const ok = await g.call('POST', '/api/site/forms/hebrew-school', { fields: { name: 'Sara Levi', email: 'sara@x.co', phone: '925', emergency: 'David 925', photos: true, children: [{ name: 'Noa', birthday: '2016-01-15', grade: '4' }, { name: 'Eli', grade: '1' }, { name: '' }] } });
  assert.equal(ok.status, 200); assert.equal(ok.json.amount, 1200);
  assert.match(ok.json.payUrl, /^\/pushka\/\?go=give&fund=children&amt=1200&ded=/);
  assert.ok(mails.some((m) => /^We received it: Lamorinda Hebrew School registration/.test(m.subject)));
  const camp = await g.call('POST', '/api/site/forms/summer-camp', { fields: { name: 'A', email: 'a@x.co', phone: '1', plan: 1, weeks: 3, children: [{ name: 'Kid' }] } });
  assert.equal(camp.json.amount, 1500);
  assert.equal((await g.call('POST', '/api/site/forms/sell-chametz', { fields: { name: 'A', email: 'a@x.co', locations: 'Home', signature: 'A' } })).status, 400, 'authorization box is required');
  assert.equal((await g.call('POST', '/api/site/forms/sell-chametz', { fields: { name: 'A', email: 'a@x.co', locations: 'Home', signature: 'A', authorize: true } })).status, 200);
  const a = client(); await a.call('POST', '/admin/api/login', { password: PW });
  const list = (await a.call('GET', '/admin/api/site/forms')).json.forms;
  assert.equal(list.find((f) => f.id === 'hebrew-school').fresh, 1);
  const items = (await a.call('GET', '/admin/api/site/forms/hebrew-school')).json.items;
  assert.equal(items[0].data.children.length, 2); assert.equal(items[0].data.photos, true);
  // Hebrew form page, answers stored in English
  assert.match((await g.call('GET', '/he/forms/lulav-etrog')).text, /dir="rtl"/);
  await g.call('POST', '/api/site/forms/lulav-etrog', { fields: { name: 'B', email: 'b@x.co', phone: '1', quality: 1, quantity: 2 } }, { 'x-lang': 'he' });
  assert.equal((await a.call('GET', '/admin/api/site/forms/lulav-etrog')).json.items[0].data.quality, 'Mehudar (extra beautiful)');
});

test('the donation page works on the site itself', async () => {
  const d = (await client().call('GET', '/donate')).text;
  assert.match(d, /\/pushka\/\?go=give&amp;fund=general&amp;amt=180/); assert.match(d, /id="building"/); assert.match(d, /CHABAD-LAMORINDA/); assert.match(d, /47-4642750/);
  assert.ok(!/chabadoflamorinda\.com\/\d/.test(d), 'no links to the old site');
});

const readSse = (text) => text.split('\n\n').map((p) => /^data: (.*)$/m.exec(p)).filter(Boolean).map((m) => JSON.parse(m[1]));
test('chat: answers from the site with Claude, in the visitor language, and logs only the question', async () => {
  const r = await fetch(base + '/api/site/chat', { method: 'POST', headers: { 'content-type': 'application/json', 'x-site': '1' }, body: JSON.stringify({ lang: 'he', messages: [{ role: 'assistant', content: 'hi' }, { role: 'user', content: 'When are Shabbat services?' }] }) });
  assert.equal(r.headers.get('content-type'), 'text/event-stream; charset=utf-8');
  const ev = readSse(await r.text());
  assert.equal(ev.filter((e) => e.text).map((e) => e.text).join(''), 'Shabbat services are Saturday at 10 AM. See [Shabbat times](/shabbat).'); assert.ok(ev.some((e) => e.done));
  const p = chatCalls[chatCalls.length - 1];
  assert.equal(p.model, 'claude-haiku-5-5', 'always the cheapest model'); assert.deepEqual(p.output_config, { effort: 'low' });
  assert.equal(p.messages[0].role, 'user', 'conversation starts with the visitor');
  assert.deepEqual(p.system[0].cache_control, { type: 'ephemeral' }); assert.match(p.system[0].text, /WEBSITE KNOWLEDGE/); assert.match(p.system[0].text, /Lamorinda Hebrew School/); assert.match(p.system[0].text, /Walnut Creek, Concord, Alamo/);
  assert.match(p.system[1].text, /Hebrew version/); assert.match(p.system[1].text, /kabbalat-shabbat-and-dinner-2026-10-30/);
  assert.equal((await fetch(base + '/api/site/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 403);
  assert.equal((await fetch(base + '/api/site/chat', { method: 'POST', headers: { 'content-type': 'application/json', 'x-site': '1' }, body: JSON.stringify({ messages: [] }) })).status, 400);
  const a = client(); await a.call('POST', '/admin/api/login', { password: PW });
  await new Promise((res) => setTimeout(res, 50));
  assert.equal((await a.call('GET', '/admin/api/site/chat-questions')).json.items[0].question, 'When are Shabbat services?');
  assert.match((await client().call('GET', '/')).text, /data-chat-open/);
});
test('chat without Claude: answers with matching pages', () => {
  const { searchAnswer } = require('./site/chat.js');
  const out = searchAnswer(load(), 'how do I register for hebrew school', (s, v) => (v ? s.replace(/\{(\w+)\}/g, (m, k) => v[k]) : s));
  assert.match(out, /\/forms\/hebrew-school|\/programs\/hebrew-school/); assert.match(out, /925-384-7242/);
});

test('yearly pages: Jewish holidays by year and Shabbat times by town', async () => {
  const c = client(), y = new Date().getFullYear();
  const h = (await c.call('GET', '/jewish-holidays-' + (y + 1))).text;
  for (const name of ['Rosh Hashanah', 'Yom Kippur', 'Chanukah', 'Passover', 'Shavuot']) assert.match(h, new RegExp(name));
  assert.match(h, /Candle lighting/); assert.match(h, /ItemList/);
  assert.equal((await c.call('GET', '/jewish-holidays-' + (y + 5))).status, 404);
  assert.equal((await c.call('GET', '/jewish-holidays')).status, 302);
  const s = (await c.call('GET', '/shabbat-times/moraga')).text;
  assert.match(s, /Shabbat candle lighting times in Moraga/); assert.ok((s.match(/<tr>/g) || []).length > 50);
  assert.equal((await c.call('GET', '/shabbat-times/lafayette')).status, 301);
  assert.equal((await c.call('GET', '/shabbat-times/walnut-creek')).status, 404);
  assert.match((await c.call('GET', '/sitemap.xml')).text, /shabbat-times\/orinda/);
  const w = (await c.call('GET', '/this-week')).text;
  assert.match(w, /This week in Jewish Lamorinda/); assert.match(w, /Moraga/); assert.match(w, /Candle lighting/); assert.match(w, /Guide of the week/);
  assert.match((await c.call('GET', '/he/this-week')).text, /השבוע בלמורינדה היהודית/);
});

test('Google Ads campaigns: within Google limits and every ad lands on a working page', async () => {
  const data = require('../store/google-ads/campaigns.json'), { build } = require('../scripts/google-ads.js');
  assert.deepEqual(build(data).errors, []);
  const c = client(), y = new Date().getFullYear();
  for (const g of data.campaigns.flatMap((x) => x.groups)) assert.equal((await c.call('GET', g.url.replace('{year}', y))).status, 200, g.url);
});

test('new tools: zmanim, Hebrew birthday, monthly calendar, parsha', async () => {
  const c = client();
  const z = (await c.call('GET', '/tools/zmanim?d=2026-10-25')).text;
  assert.match(z, /Latest Shema/); assert.match(z, /10:07 AM/); assert.match(z, /Nightfall/);
  assert.match((await c.call('GET', '/tools/zmanim?d=2026-10-25&town=martinez')).text, /Martinez/);
  const hb = (await c.call('GET', '/tools/hebrew-birthday?d=1985-04-02')).text;
  assert.match(hb, /11 Nisan|Nisan 11|11th of Nisan/); assert.match(hb, /\/tehillim\?b=1985-04-02/);
  const cal = (await c.call('GET', '/calendar?m=2026-12')).text;
  assert.match(cal, /Chanukah: 1 Candle/); assert.match(cal, /Rosh Chodesh Tevet/);
  assert.equal((await c.call('GET', '/calendar?m=2026-13')).status, 302);
  assert.equal((await c.call('GET', '/parsha')).status, 200);
  const ds = (await c.call('GET', '/daily-study')).text; assert.match(ds, /Tanya/); assert.match(ds, /Rambam/); assert.match(ds, /sefaria\.org/);
  assert.match((await c.call('GET', '/sitemap.xml')).text, /\/tools\/zmanim/);
});

test('weekly email: preview, send once to subscribers and members, unsubscribe', async () => {
  const g = client();
  await g.call('POST', '/api/site/forms/newsletter', { fields: { name: 'Reader', email: 'reader@x.co' } });
  const m = await signIn('member@x.co'); await m.call('PUT', '/api/site/me', { name: 'Member' });
  const a = client(); await a.call('POST', '/admin/api/login', { password: PW });
  const pv = (await a.call('GET', '/admin/api/site/weekly?note=' + encodeURIComponent('Good Shabbos everyone!'))).json;
  assert.equal(pv.recipients, 2); assert.match(pv.text, /^Good Shabbos everyone!/); assert.match(pv.text, /COMING UP/); assert.match(pv.text, /LEARN SOMETHING NEW/);
  assert.equal((await a.call('POST', '/admin/api/site/weekly/send', {}, { 'x-admin': '1' })).status, 400, 'needs confirmation');
  mails.length = 0;
  assert.equal((await a.call('POST', '/admin/api/site/weekly/send', { confirm: true }, { 'x-admin': '1' })).json.sent, 2);
  assert.equal((await a.call('POST', '/admin/api/site/weekly/send', { confirm: true }, { 'x-admin': '1' })).json.sent, 0, 'never twice the same day');
  const link = /Unsubscribe: (\S+)/.exec(mails.find((x) => x.to === 'reader@x.co').text)[1].replace('http://site.test', '');
  assert.match((await g.call('GET', link)).text, /You are unsubscribed/);
  assert.equal((await a.call('GET', '/admin/api/site/weekly')).json.recipients, 1);
  assert.match((await g.call('GET', '/unsubscribe?e=reader@x.co&t=wrongwrongwrongwrongwrong')).text, /not valid/);
});

test('Ask the Rabbi: publish an answer, it becomes a page with Q&A markup', async () => {
  const a = client(); await a.call('POST', '/admin/api/login', { password: PW });
  const r = (await a.call('POST', '/admin/api/site/qa', { question: 'Can I light Shabbat candles if I am not religious?', answer: 'Yes! Every Jewish woman and girl is welcome to light. See [how](/learn/shabbat-candles).' }, { 'x-admin': '1' })).json;
  assert.equal(r.ok, true); assert.match(r.url, /\/ask\/can-i-light-shabbat-candles-if-i-am-not-religious$/);
  const g = client(), page = await g.call('GET', '/ask/can-i-light-shabbat-candles-if-i-am-not-religious');
  assert.equal(page.status, 200); assert.match(page.text, /"@type":"FAQPage"/); assert.match(page.text, /href="\/learn\/shabbat-candles"/);
  assert.match((await g.call('GET', '/ask')).text, /Can I light Shabbat candles/);
  assert.match((await g.call('GET', '/sitemap.xml')).text, /\/ask\/can-i-light-shabbat-candles/);
  assert.equal((await g.call('POST', '/admin/api/site/qa', { question: 'x', answer: 'y' })).status, 401);
});

test('no broken links inside the content (English, Hebrew, Russian)', async () => {
  const fs = require('fs'), path = require('path'), C = load(), bad = [];
  const ok = new Set(['/', '/events', '/shabbat', '/holidays', '/programs', '/learn', '/jewish-lamorinda', '/our-area', '/community', '/get-involved', '/help', '/kaddish', '/tehillim', '/sponsor', '/donate', '/forms', '/parsha', '/calendar', '/ask', '/daily-study', '/photos', '/account', '/faq', '/contact', '/about', '/welcome', '/privacy', '/accessibility', '/kiddush/', '/pushka/', '/board/', '/events.ics',
    ...C.learn.map((a) => '/learn/' + a.slug), ...C.programs.map((p) => '/programs/' + p.slug), ...C.holidays.map((h) => '/holidays/' + h.slug), ...C.help.map((h) => '/help/' + h.slug), ...C.forms.map((f) => '/forms/' + f.id), ...C.towns.map((t) => '/jewish-' + t.slug),
    '/tools/hebrew-date', '/tools/yahrzeit', '/tools/bar-bat-mitzvah', '/tools/zmanim', '/tools/hebrew-birthday', '/shabbat-times', '/this-week', ...['moraga', 'orinda', 'pleasant-hill', 'martinez'].map((t) => '/shabbat-times/' + t), ...[0, 1].map((n) => '/jewish-holidays-' + (new Date().getFullYear() + n))]);
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  for (const f of walk(DIR).filter((f) => /\.(md|json)$/.test(f) && !f.endsWith('strings-en.json'))) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\]\((\/[^)\s#?]*)[^)]*\)/g)) if (!ok.has(m[1]) && !/^\/(pushka|kiddush|board|media)\//.test(m[1])) bad.push(path.relative(DIR, f) + ' -> ' + m[1]);
  }
  assert.deepEqual(bad, [], 'fix these links');
});
