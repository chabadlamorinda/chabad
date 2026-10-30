'use strict';
// Browser test of "sign in and have your own pushka on every device". Run: node server/e2e/signin.e2e.js
process.env.PUSHKA_TIMEZONE = 'America/' + 'Los_Angeles';
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createApp } = require('../index.js');
const { createStore } = require('../store.js');
const { startPg } = require('../pg-test-helper.js');

(async () => {
  const pg = await startPg(), store = createStore(pg.url); await store.migrate();
  const sent = [], mailer = { from: 'test', send: async (m) => { sent.push(m); } };
  const app = createApp({ stripe: null, sessionSecret: 'a'.repeat(32), log: { error() {} }, store, mailer });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); }), base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  const device = async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } }), page = await ctx.newPage();
    for (const pat of ['**/fonts.googleapis.com/**', '**/fonts.gstatic.com/**']) await page.route(pat, (r) => r.fulfill({ status: 200, body: '' }));
    page.on('pageerror', (e) => { console.error('PAGE ERROR', e.message); });
    return page;
  };
  const signIn = async (page, email) => {
    await page.click('[data-act="signIn"]'); await page.fill('#si1', email); await page.click('#siGo');
    await page.waitForSelector('#si2'); await page.fill('#si2', /\b(\d{6})\b/.exec(sent[sent.length - 1].text)[1]);
  };
  try {
    // device A: add a coin, then sign in
    const a = await device(); await a.goto(base + '/pushka/?signin=1');
    await a.waitForSelector('#si1'); await a.fill('#si1', 'dina@example.com'); await a.click('#siGo');
    await a.waitForSelector('#si2'); assert.equal(sent.length, 1); assert.equal(sent[0].to, 'dina@example.com');
    await a.fill('#si2', /\b(\d{6})\b/.exec(sent[0].text)[1]);
    await a.waitForSelector('.toast'); assert.match(await a.textContent('.toast'), /Signed in/);
    await a.evaluate(() => A.dropPrimary && A.dropPrimary()); await a.waitForTimeout(500);
    await a.waitForFunction(() => JSON.parse(localStorage.getItem('lamorinda-pushka-v4')).dirty === false, null, { timeout: 8000 });
    const balA = await a.evaluate(() => JSON.parse(localStorage.getItem('lamorinda-pushka-v4')).pushkas[0].balance);
    const st = await store.getState((await store.verifiedMemberByEmail('dina@example.com')).id); assert.ok(st && st.state.pushkas[0].balance === balA, 'saved on server');
    assert.ok(!('mtoken' in st.state) && !('auth' in st.state), 'no device keys on the server');
    // device B: empty device signs in and gets the same pushka
    const b = await device(); await b.goto(base + '/pushka/'); await b.waitForSelector('#app');
    await b.evaluate(() => { U.page = 'profile'; draw(); }); await signIn(b, 'dina@example.com');
    await b.waitForSelector('.toast'); assert.match(await b.textContent('.toast'), /restored/);
    assert.equal(await b.evaluate(() => P().balance), balA);
    // sign out clears the device but not the account
    await b.evaluate(() => A.signOutGo()); await b.waitForTimeout(300);
    assert.equal(await b.evaluate(() => P().balance), 0); assert.equal(await b.evaluate(() => !!S.auth), false);
    assert.ok(await store.getState((await store.verifiedMemberByEmail('dina@example.com')).id));
    // wrong code
    const c = await device(); await c.goto(base + '/pushka/?signin=1'); await c.waitForSelector('#si1'); await c.fill('#si1', 'x@example.com'); await c.click('#siGo');
    await c.waitForSelector('#si2'); await c.fill('#si2', '000000'); await c.waitForFunction(() => /not right/.test(document.querySelector('#siErr').textContent));
    console.log('sign-in e2e: ok');
  } finally { await browser.close(); server.close(); await store.close(); await pg.stop(); }
})().catch((e) => { console.error(e); process.exit(1); });
