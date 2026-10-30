'use strict';
process.env.PUSHKA_TIMEZONE = 'America/' + 'Los_Angeles';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('./index.js');
const { createStore } = require('./store.js');
const { startPg } = require('./pg-test-helper.js');

let pg, store, server, base; const sent = [];
const mailer = { from: 'test', send: async (m) => { if (/fail@/.test(m.to)) throw new Error('smtp down'); sent.push(m); } };
test.before(async () => {
  pg = await startPg(); store = createStore(pg.url); await store.migrate();
  const app = createApp({ stripe: null, sessionSecret: 'a'.repeat(32), log: { error() {} }, store, mailer });
  server = await new Promise((r) => { const s = app.listen(0, () => r(s)); }); base = 'http://127.0.0.1:' + server.address().port;
});
test.after(async () => { server.close(); await store.close(); await pg.stop(); });
test.beforeEach(async () => { await store.reset(); sent.length = 0; });

const call = async (method, path, body, token) => {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const codeOf = () => /\b(\d{6})\b/.exec(sent[sent.length - 1].text)[1];
const signIn = async (email = 'dina@example.com') => {
  assert.equal((await call('POST', '/api/auth/request', { email })).status, 200);
  const r = await call('POST', '/api/auth/verify', { email, code: codeOf() }); assert.equal(r.status, 200); return r.json;
};

test('config says accounts are on only when database and email exist', async () => {
  assert.equal((await call('GET', '/api/config')).json.accounts, true);
  const app = createApp({ stripe: null, sessionSecret: 'a'.repeat(32), log: { error() {} }, store });
  const s = await new Promise((r) => { const x = app.listen(0, () => r(x)); });
  const cfg = await (await fetch('http://127.0.0.1:' + s.address().port + '/api/config')).json(); assert.equal(cfg.accounts, false);
  assert.equal((await fetch('http://127.0.0.1:' + s.address().port + '/api/auth/request', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"email":"a@b.co"}' })).status, 503); s.close();
});

test('sign in: code is emailed, works once, wrong codes are limited, signing in again finds the same person', async () => {
  assert.equal((await call('POST', '/api/auth/request', { email: 'nope' })).json.code, 'invalid_email');
  assert.equal((await call('POST', '/api/auth/request', { email: 'Dina@Example.com', lang: 'he' })).status, 200);
  assert.equal(sent.length, 1); assert.equal(sent[0].to, 'dina@example.com'); assert.match(sent[0].subject, /הקוד/); assert.match(sent[0].text, /\d{6}/);
  assert.equal((await call('POST', '/api/auth/request', { email: 'dina@example.com' })).json.code, 'too_soon');
  const good = codeOf();
  for (let i = 0; i < 5; i++) assert.equal((await call('POST', '/api/auth/verify', { email: 'dina@example.com', code: good === '000000' ? '111111' : '000000' })).status, 400);
  assert.equal((await call('POST', '/api/auth/verify', { email: 'dina@example.com', code: good })).json.code, 'code_expired'); // too many wrong tries: the code is dead
  await store.deleteAuthCode('dina@example.com');
  const a = await signIn(); assert.match(a.token, /^m_/); assert.equal(a.email, 'dina@example.com'); assert.equal(a.hasState, false);
  assert.equal((await call('POST', '/api/auth/verify', { email: 'dina@example.com', code: codeOf() })).json.code, 'code_expired'); // a code works only once
  await store.deleteAuthCode('dina@example.com'); await new Promise((r) => setTimeout(r, 10));
  const b = await signIn(); assert.equal(b.token, a.token); assert.equal((await store.listMembers()).length, 1);
});

test('a failed email does not leave a usable code', async () => {
  const r = await call('POST', '/api/auth/request', { email: 'fail@example.com' }); assert.equal(r.status, 502);
  assert.equal(await store.getAuthCode('fail@example.com'), null);
});

test('an expired code is refused', async () => {
  await call('POST', '/api/auth/request', { email: 'a@example.com' }); const c = codeOf();
  await store.pool.query("UPDATE auth_codes SET expires_at = now() - interval '1 minute'");
  assert.equal((await call('POST', '/api/auth/verify', { email: 'a@example.com', code: c })).json.code, 'code_expired');
});

test('saved pushka follows the person: private, versioned, conflicts are reported, device keys never stored', async () => {
  const a = await signIn('a@example.com'), b = await signIn('b@example.com');
  assert.equal((await call('GET', '/api/account/state')).status, 401);
  assert.equal((await call('GET', '/api/account/state', undefined, a.token)).json.rev, 0);
  const doc = { pushkas: [{ id: 'p1', balance: 12.5, drops: 3 }], history: [{ kind: 'coin', t: 1, amt: 1.8 }], token: 'cus_SECRET', mtoken: 'm_x', bio: 'x', notified: { z: 1 } };
  const put = await call('PUT', '/api/account/state', { baseRev: 0, state: doc }, a.token); assert.equal(put.status, 200); assert.equal(put.json.rev, 1);
  const got = (await call('GET', '/api/account/state', undefined, a.token)).json; assert.equal(got.rev, 1); assert.equal(got.state.pushkas[0].balance, 12.5); assert.ok(!('token' in got.state) && !('mtoken' in got.state) && !('bio' in got.state) && !('notified' in got.state));
  assert.equal((await call('GET', '/api/account/state', undefined, b.token)).json.rev, 0); // b cannot see a's
  const p2 = await call('PUT', '/api/account/state', { baseRev: 1, state: { pushkas: [{ id: 'p1', balance: 20, drops: 4 }] } }, a.token); assert.equal(p2.json.rev, 2);
  const stale = await call('PUT', '/api/account/state', { baseRev: 1, state: { pushkas: [{ id: 'p1', balance: 99 }] } }, a.token);
  assert.equal(stale.status, 409); assert.equal(stale.json.rev, 2); assert.equal(stale.json.state.pushkas[0].balance, 20);
  assert.equal((await call('PUT', '/api/account/state', { force: true, state: { pushkas: [{ id: 'p1', balance: 99 }] } }, a.token)).json.rev, 3);
  assert.equal((await call('PUT', '/api/account/state', { baseRev: 3, state: 'nope' }, a.token)).status, 400);
  const acc = (await call('GET', '/api/account', undefined, a.token)).json; assert.equal(acc.hasState, true); assert.equal(acc.rev, 3);
});

test('guest member tokens cannot read or write saved pushkas; deleting the account deletes the saved pushka', async () => {
  const guest = (await call('POST', '/api/member', { name: 'G', email: 'g@example.com' })).json.token;
  assert.equal((await call('GET', '/api/account/state', undefined, guest)).status, 401);
  assert.equal((await call('PUT', '/api/account/state', { baseRev: 0, state: { a: 1 } }, guest)).status, 401);
  const a = await signIn('a@example.com'); await call('PUT', '/api/account/state', { baseRev: 0, state: { a: 1 } }, a.token);
  assert.equal((await call('DELETE', '/api/member', undefined, a.token)).status, 200);
  assert.equal(await store.getState(a.token.split('.')[0]), null); assert.equal(await store.verifiedMemberByEmail('a@example.com'), null);
});

test('a saved card follows the person: the card token comes back after the Stripe customer is linked', async () => {
  const a = await signIn('a@example.com'); const mid = a.token.split('.')[0];
  assert.equal(a.stripeToken, ''); await store.linkStripe(mid, 'cus_ABC123');
  const acc = (await call('GET', '/api/account', undefined, a.token)).json; assert.match(acc.stripeToken, /^cus_ABC123\./);
  const again = await signIn('a@example.com'); assert.match(again.stripeToken, /^cus_ABC123\./);
});
