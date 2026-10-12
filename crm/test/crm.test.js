'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { openDb } = require('../src/db');
const { createAgent } = require('../src/agent');
const { createInbox } = require('../src/inbox');
const { createApp } = require('../src/app');
const { createTelegram } = require('../src/telegram');
const { validSignature } = require('../src/twilio');

// A scripted stand-in for the Claude API: each call returns the next canned response.
function fakeClaude(script) {
  const calls = [];
  return {
    calls,
    beta: { messages: { create: async (req) => {
      calls.push(JSON.parse(JSON.stringify(req)));
      const next = script.shift();
      if (!next) throw new Error('fake Claude ran out of responses');
      return typeof next === 'function' ? next(req) : next;
    } } },
  };
}
const toolUse = (...uses) => ({ stop_reason: 'tool_use', content: uses.map(([name, input], i) => ({ type: 'tool_use', id: `tu_${name}_${i}_${Math.random()}`, name, input })) });
const say = (text) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text }] });

test('db: people, donations, activities and the year summary', () => {
  const db = openDb();
  const dave = db.createPerson({ first_name: 'David', last_name: 'Levin', city: 'Lafayette', hebrew_name: 'Dovid' });
  db.createPerson({ first_name: 'Sarah', last_name: 'Cohen' });
  assert.equal(db.searchPeople('levin')[0].id, dave.id);
  assert.equal(db.searchPeople('dave lafay').length, 0); // every word must match
  assert.equal(db.searchPeople('dav lafay')[0].id, dave.id);

  db.addDonation({ person_id: dave.id, amount: 180, date: '2026-09-03', method: 'Check', check_number: '1452' });
  db.addDonation({ person_id: dave.id, amount: 36, date: '2025-12-01' });
  db.addActivity({ person_id: dave.id, type: 'mezuzah', quantity: 3, date: '2026-09-03', follow_up_date: '2026-10-20' });
  db.addActivity({ person_id: dave.id, type: 'Shabbat candles', date: '2026-09-03' });
  db.addActivity({ person_id: dave.id, type: 'visit', date: '2026-09-03' });
  assert.throws(() => db.addDonation({ amount: -5, date: '2026-01-01' }), /positive/);
  assert.throws(() => db.addActivity({ type: 'skydiving', date: '2026-01-01' }), /Unknown activity/);
  assert.throws(() => db.addDonation({ person_id: 999, amount: 5, date: '2026-01-01' }), /No person/);

  const s = db.yearSummary(2026);
  assert.equal(s.donations.total, 180);
  assert.equal(s.donations.by_fund[0].fund, 'General');
  assert.equal(s.activities.find((a) => a.type === 'mezuzah').quantity, 3);
  assert.ok(s.activities.find((a) => a.type === 'shabbat_candles'));
  assert.equal(db.followUps('2026-10-12').length, 1);

  const prof = db.personProfile(dave.id);
  assert.equal(prof.donations.length, 2);
  assert.deepEqual(prof.donations_by_year.map((r) => r.year), ['2026', '2025']);
  assert.equal(db.listDonations({ year: 2026 })[0].method, 'check');
});

test('db: the report query is read-only', () => {
  const db = openDb();
  db.createPerson({ first_name: 'A' });
  assert.equal(db.readOnlyQuery('SELECT COUNT(*) n FROM people').rows[0].n, 1);
  assert.throws(() => db.readOnlyQuery('DELETE FROM people'), /SELECT/);
  assert.throws(() => db.readOnlyQuery('SELECT 1; DELETE FROM people'), /single SELECT/);
});

test('agent: one message becomes a person, a donation, a visit and mezuzos', async () => {
  const db = openDb();
  const claude = fakeClaude([
    toolUse(['search_people', { query: 'levin' }]),
    (req) => {
      const last = req.messages[req.messages.length - 1].content[0];
      assert.equal(last.type, 'tool_result');
      assert.equal(JSON.parse(last.content).length, 0);
      return toolUse(['create_person', { first_name: 'David', last_name: 'Levin' }]);
    },
    toolUse(
      ['record_donation', { person_id: 1, amount: 180, date: '2026-10-12', method: 'check', check_number: '1452' }],
      ['record_activity', { person_id: 1, type: 'visit', date: '2026-10-12' }],
      ['record_activity', { person_id: 1, type: 'mezuzah', date: '2026-10-12', quantity: 3 }],
      ['record_activity', { person_id: 1, type: 'bungee', date: '2026-10-12' }],
    ),
    (req) => {
      const results = req.messages[req.messages.length - 1].content;
      assert.equal(results.length, 4); // all tool results in one message
      assert.equal(results[3].is_error, true);
      return say('Saved: $180 check #1452 from David Levin. Visit + 3 mezuzos logged.');
    },
  ]);
  const agent = createAgent({ client: claude, db, model: 'claude-opus-5-5' });
  const inbox = createInbox({ db, agent, transcribe: null, log: { error() {} } });
  const r = await inbox.receive({ channel: 'web', chatId: 'web', text: 'Visited Dave Levin, 3 mezuzos, $180 check 1452' });
  assert.match(r.reply, /Saved/);
  assert.equal(claude.calls[0].model, 'claude-opus-5-5');
  assert.match(claude.calls[0].messages[0].content.at(-1).text, /Today is .*2\d{3}-\d\d-\d\d/);
  const d = db.listDonations({ year: 2026 });
  assert.equal(d.length, 1);
  assert.equal(d[0].message_id, r.messageId);
  assert.equal(db.listActivities({}).length, 2);

  // The next message sees the earlier exchange as history.
  const claude2 = fakeClaude([say('ok')]);
  const inbox2 = createInbox({ db, agent: createAgent({ client: claude2, db, model: 'm' }), transcribe: null });
  await inbox2.receive({ channel: 'web', chatId: 'web', text: 'undo that' });
  assert.equal(claude2.calls[0].messages.length, 3);
  assert.match(claude2.calls[0].messages[1].content, /Saved/);
});

test('inbox: voice notes are transcribed, photos are passed to Claude as images', async () => {
  const db = openDb();
  const claude = fakeClaude([(req) => {
    const content = req.messages.at(-1).content;
    assert.equal(content[0].type, 'image');
    assert.equal(content[0].source.media_type, 'image/jpeg');
    assert.match(content.at(-1).text, /voice note transcript\):\nthis is a check from the Cohens/);
    return say('Saved check.');
  }]);
  const inbox = createInbox({ db, agent: createAgent({ client: claude, db, model: 'm' }), transcribe: async () => 'this is a check from the Cohens' });
  const r = await inbox.receive({ channel: 'telegram', chatId: 'tg:1', voice: { buffer: Buffer.from('ogg'), mime: 'audio/ogg' }, photos: [{ buffer: Buffer.from('jpg'), mime: 'image/jpeg' }] });
  assert.equal(r.transcript, 'this is a check from the Cohens');
  assert.equal(db.listMessages()[0].attachments.length, 2);

  const noVoice = createInbox({ db, agent: { handle: async () => 'x' }, transcribe: null });
  const r2 = await noVoice.receive({ channel: 'web', chatId: 'web', voice: { buffer: Buffer.from('a'), mime: 'audio/webm' } });
  assert.match(r2.reply, /OPENAI_API_KEY/);
});

async function startApp(t, agentReply = 'Done.') {
  const db = openDb();
  const inbox = createInbox({ db, agent: { handle: async () => agentReply }, transcribe: null });
  const app = createApp({ db, inbox, adminPassword: 'pw', sessionSecret: 's'.repeat(32), log: { error() {} } });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  t.after(() => server.close());
  const base = 'http://127.0.0.1:' + server.address().port;
  let cookie = '';
  const call = async (method, path, body) => {
    const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch { /* csv */ }
    return { status: r.status, json, text };
  };
  return { db, call, base };
}

test('app: everything under /api needs the password', async (t) => {
  const { call } = await startApp(t);
  assert.equal((await call('GET', '/api/people')).status, 401);
  assert.equal((await call('POST', '/api/login', { password: 'nope' })).status, 401);
  assert.equal((await call('GET', '/healthz')).status, 200);
  assert.equal((await call('POST', '/api/login', { password: 'pw' })).status, 200);
  assert.equal((await call('GET', '/api/people')).status, 200);
});

test('app: talk, browse and export', async (t) => {
  const { call, db } = await startApp(t, 'Saved.');
  await call('POST', '/api/login', { password: 'pw' });
  const m = await call('POST', '/api/message', { text: 'hello' });
  assert.equal(m.json.reply, 'Saved.');
  assert.equal((await call('POST', '/api/message', {})).status, 400);

  const p = db.createPerson({ first_name: 'Sarah', last_name: 'Cohen, Jr' });
  db.addDonation({ person_id: p.id, amount: 1800, date: '2026-03-01', note: '=HYPERLINK("x")' });
  assert.equal((await call('GET', '/api/donations?year=2026')).json.length, 1);
  const csv = await call('GET', '/api/donations.csv?year=2026');
  assert.match(csv.text, /^date,name,amount/);
  assert.match(csv.text, /"Sarah Cohen, Jr",1800/);
  assert.match(csv.text, /"'=HYPERLINK\(""x""\)"/); // spreadsheet formulas are neutralised
  assert.equal((await call('GET', `/api/people/${p.id}`)).json.name, 'Sarah Cohen, Jr');
  assert.equal((await call('GET', '/api/people/999')).status, 404);
  assert.equal((await call('POST', '/api/donations', { amount: 'abc', date: '2026-01-01' })).status, 400);
  const s = await call('GET', '/api/summary?year=2026');
  assert.equal(s.json.donations.total, 1800);
  assert.equal((await call('GET', '/api/messages')).json.length, 1);
});

test('telegram: checks the secret and only serves allowed users', async (t) => {
  const sent = [];
  const fetchImpl = async (url, opts) => {
    const body = opts && opts.body ? JSON.parse(opts.body) : {};
    if (url.endsWith('/sendMessage')) sent.push(body);
    return { ok: true, json: async () => ({ ok: true, result: {} }) };
  };
  const received = [];
  const inbox = { receive: async (m) => { received.push(m); return { reply: 'Saved.', transcript: '' }; } };
  const tg = createTelegram({ token: 'T', secret: 'sec', allowedUserIds: ['42'], inbox, fetchImpl, log: { error() {} } });

  await tg.process({ update_id: 1, message: { from: { id: 7 }, chat: { id: 7 }, text: 'hi' } });
  assert.match(sent.at(-1).text, /Your Telegram id is 7/);
  assert.equal(received.length, 0);

  await tg.process({ update_id: 2, message: { from: { id: 42 }, chat: { id: 42 }, text: 'Visited the Levins' } });
  assert.equal(received[0].chatId, 'tg:42');
  assert.equal(sent.at(-1).text, 'Saved.');

  const express = require('express');
  const app = express(); app.use(tg.router);
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  t.after(() => server.close());
  const r = await fetch(`http://127.0.0.1:${server.address().port}/telegram/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'wrong' }, body: '{}' });
  assert.equal(r.status, 401);
});

test('twilio: signature check matches Twilio\'s algorithm', () => {
  const url = 'https://example.com/twilio/webhook';
  const params = { From: '+19255551234', Body: 'hi', To: '+1925' };
  const data = url + 'Bodyhi' + 'From+19255551234' + 'To+1925';
  const sig = crypto.createHmac('sha1', 'tok').update(data).digest('base64');
  assert.equal(validSignature('tok', url, params, sig), true);
  assert.equal(validSignature('tok', url, { ...params, Body: 'changed' }, sig), false);
  assert.equal(validSignature('tok', url, params, ''), false);
});
