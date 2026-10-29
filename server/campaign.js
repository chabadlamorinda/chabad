// Fundraising campaigns (building campaign, end of year...): the money side. The campaigns themselves (title, goal,
// dates, teams, naming opportunities, matching) are in site/content/campaigns.json; the pages are server/site/campaign-page.js.
//
// * Checkout: Stripe's secure checkout page (card, Apple Pay, Google Pay, and whatever else is switched on in Stripe,
//   such as bank transfer). One payment, or a larger gift split into monthly or yearly payments: a Stripe subscription
//   that ends by itself after the last payment (endInstallments).
// * Pledge now, pay later (check, wire, stock, donor-advised fund): kept in the kv table until the Rabbi marks it received.
// * Ambassadors: anyone can open their own fundraising page for a campaign (name, goal, a few words). The page is live at
//   once; the Rabbi is told and can hide it. A private link lets the ambassador change their goal and words later.
// * Totals: read from Stripe (payments and plans that carry metadata.campaign) plus gifts the Rabbi enters by hand and
//   pledges marked received. A split gift counts in full toward the goal.
// * Nothing is stored about card details; the donor wall shows only what the donor chose to show.
'use strict';
const crypto = require('crypto');
const { withOffset } = require('./time.js');

const MAX_TOTAL = 100000000;  // $1,000,000 for a whole gift paid over time
const MAX_ONCE = 25000000;    // $250,000 in one online payment
const MAX_PLEDGE = 1000000000; // $10,000,000 pledged to pay later
const MIN_PAYMENT = 500;      // each monthly or yearly payment at least $5
const CACHE_MS = 60 * 1000;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// A campaign is running from start to end (Lafayette time), unless it is a draft.
const at = (s, end) => Date.parse(withOffset(s.length === 10 ? s + (end ? 'T23:59' : 'T00:00') : s)); // a date alone ends at the end of that day
function isLive(c, now = new Date()) {
  if (!c || c.status === 'draft') return false;
  return (!c.start || at(c.start) <= now.getTime()) && (!c.end || at(c.end, true) > now.getTime());
}
const hasEnded = (c, now = new Date()) => !!(c && c.end && at(c.end, true) <= now.getTime());
// The matching makes every dollar count more, up to what the matchers pledged (cap, in dollars).
function withMatch(c, cents) {
  const m = c.matching || {}, x = Number(m.multiplier) || 1;
  if (x <= 1) return cents;
  const extra = Math.round(cents * (x - 1)), cap = Number(m.cap) > 0 ? Number(m.cap) * 100 : Infinity;
  return cents + Math.min(extra, cap);
}
// The payment plans a campaign offers: "once", "month-12", "month-24", "year-3"...
function plansOf(c) {
  return ['once', ...(c.months && c.months.length ? c.months : [12, 24, 36]).map((n) => 'month-' + n), ...(c.years || []).map((n) => 'year-' + n)];
}
// The date a split gift's last payment is made, plus a day: Stripe stops the plan there.
function lastPaymentEnd(anchorSec, count, interval = 'month') {
  const d = new Date(anchorSec * 1000);
  if (interval === 'year') d.setUTCFullYear(d.getUTCFullYear() + count - 1); else d.setUTCMonth(d.getUTCMonth() + count - 1);
  d.setUTCDate(d.getUTCDate() + 1);
  return Math.floor(d.getTime() / 1000);
}
// Ambassadors' own pages (kv). The public never sees email, phone or the private key.
const ambKey = (slug) => 'campaign-teams:' + slug;
async function ambassadors(store, slug) { return store ? await store.getKv(ambKey(slug), []) : []; }
const publicTeam = (t) => ({ slug: t.slug, name: t.name, goal: t.goal, message: t.message || '', self: true });
// Every team a campaign has: the ones in campaigns.json, then ambassadors' own pages (unless the Rabbi hid them).
async function teamsOf(store, c) {
  return [...(c.teams || []), ...(await ambassadors(store, c.slug)).filter((t) => !t.hidden).map(publicTeam)];
}

function createCampaigns({ stripe, store, content, log = console, clean, HttpError, ensureProduct, FUND_NAMES, FEE_RATE, siteEnv = process.env, mailer = null }) {
  const site = () => (content && content()) || {}; // the kit has no website content
  const list = () => site().campaigns || [];
  const find = (slug) => list().find((c) => c.slug === slug);
  const cache = new Map();
  const notify = (subject, text) => { const to = siteEnv.ADMIN_EMAIL || (site().org || {}).email; if (mailer && to) mailer.send({ to, subject, text }).catch((e) => log.error('campaign mail:', e && e.message)); };
  const siteBase = (req) => { const configured = String(siteEnv.PUBLIC_URL || '').replace(/\/+$/, ''); return /^https:\/\/[^/\s]+$/.test(configured) ? configured : req.protocol + '://' + req.get('host'); };

  // A split gift: stop the plan after its last payment (done when the donor returns, and again whenever totals are read).
  async function endInstallments(sub) {
    const m = (sub && sub.metadata) || {}, n = Number(m.installments);
    if (!n || sub.cancel_at || !['active', 'trialing', 'past_due'].includes(sub.status)) return;
    try { await stripe.subscriptions.update(sub.id, { cancel_at: lastPaymentEnd(sub.billing_cycle_anchor || sub.created, n, m.interval === 'year' ? 'year' : 'month'), proration_behavior: 'none' }); }
    catch (e) { log.error('campaign: could not set the end of a split gift', sub.id, e && e.message); }
  }

  async function searchAll(api, query) {
    const out = []; let page;
    for (let i = 0; i < 20; i++) {
      const r = await api.search({ query, limit: 100, ...(page ? { page } : {}) });
      out.push(...r.data); if (!r.has_more || !r.next_page) break; page = r.next_page;
    }
    return out;
  }
  const offlineKey = (slug) => 'campaign-offline:' + slug, pledgeKey = (slug) => 'campaign-pledges:' + slug;
  async function offline(slug) { return store ? await store.getKv(offlineKey(slug), []) : []; }
  async function pledges(slug) { return store ? await store.getKv(pledgeKey(slug), []) : []; }

  // Every gift to a campaign, newest first: { id, name, show, cents, plan, count, interval, team, level, message, dedication, at, how }
  async function gifts(c) {
    const out = [];
    if (stripe) {
      const q = `metadata['campaign']:'${c.slug}'`;
      for (const pi of await searchAll(stripe.paymentIntents, q + " AND status:'succeeded'")) {
        const m = pi.metadata || {};
        out.push({ id: pi.id, name: m.wall_name || '', show: m.wall_show === 'yes', hideAmount: m.hide_amount === 'yes', cents: Number(m.gift_cents) || pi.amount_received || pi.amount || 0, plan: 'once', team: m.team || '', level: m.level || '', message: m.message || '', dedication: m.dedication || '', at: (pi.created || 0) * 1000, how: 'online' });
      }
      for (const s of await searchAll(stripe.subscriptions, q)) {
        const m = s.metadata || {}, n = Number(m.installments) || 0;
        const counts = ['active', 'trialing', 'past_due'].includes(s.status) || (s.status === 'canceled' && s.cancel_at && s.canceled_at >= s.cancel_at - 86400);
        if (!n || !counts) continue;
        await endInstallments(s);
        out.push({ id: s.id, name: m.wall_name || '', show: m.wall_show === 'yes', hideAmount: m.hide_amount === 'yes', cents: Number(m.pledge_cents) || 0, plan: 'split', count: n, interval: m.interval === 'year' ? 'year' : 'month', team: m.team || '', level: m.level || '', message: m.message || '', dedication: m.dedication || '', at: (s.created || 0) * 1000, how: 'online' });
      }
    }
    for (const g of await offline(c.slug)) out.push({ ...g, plan: 'once', how: g.how || 'check' });
    return out.sort((a, b) => b.at - a.at);
  }

  // What the public page shows: the totals, the teams, how many of each naming opportunity are taken, and the donor wall.
  async function totals(c) {
    const hit = cache.get(c.slug);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;
    const all = await gifts(c), base = all.reduce((a, g) => a + g.cents, 0), teams = {}, teamDonors = {}, levels = {};
    for (const g of all) {
      if (g.team) { teams[g.team] = (teams[g.team] || 0) + withMatch(c, g.cents); teamDonors[g.team] = (teamDonors[g.team] || 0) + 1; }
      if (g.level) levels[g.level] = (levels[g.level] || 0) + 1;
    }
    const wall = all.slice(0, 300).map((g) => ({ name: g.show && g.name ? g.name : '', cents: g.hideAmount ? null : g.cents, count: g.count || 0, interval: g.interval || '', team: g.team, message: g.message, dedication: g.dedication, at: g.at }));
    const pend = (await pledges(c.slug)).filter((p) => p.status === 'pending').reduce((a, p) => a + p.cents, 0);
    const data = { raised: withMatch(c, base) / 100, given: base / 100, pledged: pend / 100, donors: all.length, teams: Object.fromEntries(Object.entries(teams).map(([k, v]) => [k, v / 100])), teamDonors, levels, wall };
    cache.set(c.slug, { at: Date.now(), data });
    return data;
  }

  const teamOk = async (c, slug) => (slug && (await teamsOf(store, c)).some((t) => t.slug === slug) ? slug : '');

  function mountPublic(api, { wrap, limit }) {
    api.get('/campaign/:slug', limit('campaign', 120, 10 * 60 * 1000), wrap(async (req, res) => {
      const c = find(req.params.slug); if (!c) throw new HttpError(404, 'not_found', 'No such campaign.');
      res.json(await totals(c));
    }));

    api.post('/campaign/checkout', limit('give', 20, 10 * 60 * 1000), wrap(async (req, res) => {
      if (!stripe) throw new HttpError(503, 'not_configured', 'Online giving is not set up yet.');
      const b = req.body || {}, c = find(String(b.campaign || ''));
      if (!c || !isLive(c)) throw new HttpError(400, 'invalid_campaign', 'This campaign is not open for gifts.');
      const plan = String(b.plan || 'once'), [interval, n] = plan === 'once' ? ['', 1] : [plan.split('-')[0], Number(plan.split('-')[1])], split = n > 1;
      if (!plansOf(c).includes(plan)) throw new HttpError(400, 'invalid_plan', 'Please choose how you would like to pay.');
      const cents = Math.round(Number(b.amount) * 100);
      if (!Number.isFinite(cents) || cents < 100 || cents > (split ? MAX_TOTAL : MAX_ONCE)) throw new HttpError(400, 'invalid_amount', split ? 'Please enter an amount between $1 and $1,000,000.' : 'Please enter an amount between $1 and $250,000. For a larger gift, choose payments over time or pledge now and pay later.');
      const each = split ? Math.ceil(cents / n) : 0;
      if (split && each < MIN_PAYMENT) throw new HttpError(400, 'invalid_amount', 'Each payment needs to be at least $5.');
      const team = await teamOk(c, b.team), level = (c.levels || []).find((l) => l.id === b.level);
      const idem = clean(b.idem, 80); if (idem.length < 16) throw new HttpError(400, 'invalid_request', 'Missing request id.');
      const fee = b.fee === true, withFee = (x) => (fee ? Math.round(x * (1 + FEE_RATE)) : x);
      const lang = ['he', 'ru'].includes(b.lang) ? b.lang : 'en', pre = lang === 'en' ? '' : '/' + lang;
      const fund = Object.prototype.hasOwnProperty.call(FUND_NAMES, c.fund) ? c.fund : 'general', base = siteBase(req);
      const meta = { source: 'pushka', via: 'website', campaign: c.slug, fund, team, level: level ? level.id : '', dedication: clean(b.dedication, 80), message: clean(b.message, 140),
        wall_name: clean(b.name, 60), wall_show: b.anonymous === true ? 'no' : 'yes', hide_amount: b.hideAmount === true ? 'yes' : 'no', fee_covered: fee ? 'yes' : 'no',
        gift_cents: String(split ? each : cents), ...(split ? { installments: String(n), interval, pledge_cents: String(cents) } : {}) };
      const title = c.title + (meta.dedication ? ' (' + meta.dedication + ')' : '');
      const session = await stripe.checkout.sessions.create({
        mode: split ? 'subscription' : 'payment', locale: lang === 'en' ? 'auto' : lang,
        line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: withFee(split ? each : cents), ...(split ? { product: await ensureProduct(fund), recurring: { interval } } : { product_data: { name: title } }) } }],
        ...(split ? { subscription_data: { description: `${c.title}: ${n} ${interval === 'year' ? 'yearly' : 'monthly'} payments`, metadata: meta } } : { submit_type: 'donate', payment_intent_data: { description: title, metadata: meta } }),
        metadata: meta,
        success_url: base + pre + '/campaign/' + c.slug + '/thank-you?session_id={CHECKOUT_SESSION_ID}' + (team ? '&team=' + team : ''),
        cancel_url: base + pre + '/campaign/' + c.slug + (team ? '/' + team : ''),
      }, { idempotencyKey: 'campaign-' + idem });
      res.json({ url: session.url });
    }));

    // Pledge now, pay later (check, wire transfer, stock, donor-advised fund): the Rabbi gets the details and marks it received.
    api.post('/campaign/pledge', limit('give', 20, 10 * 60 * 1000), wrap(async (req, res) => {
      const b = req.body || {}, c = find(String(b.campaign || ''));
      if (!c || !isLive(c) || !store) throw new HttpError(400, 'invalid_campaign', 'This campaign is not open for pledges.');
      const cents = Math.round(Number(b.amount) * 100);
      if (!Number.isFinite(cents) || cents < 100 || cents > MAX_PLEDGE) throw new HttpError(400, 'invalid_amount', 'Please enter the amount you would like to pledge.');
      const email = clean(b.email, 254).toLowerCase(), fullName = clean(b.fullName || b.name, 100);
      if (!fullName) throw new HttpError(400, 'invalid_name', 'Please enter your name.');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'invalid_email', 'Please enter a valid email address.');
      const how = ['check', 'wire', 'stock', 'daf', 'other'].includes(b.how) ? b.how : 'check';
      const p = { id: 'pl_' + crypto.randomBytes(6).toString('hex'), status: 'pending', fullName, email, phone: clean(b.phone, 30), how, cents, name: b.anonymous === true ? '' : clean(b.name, 60) || fullName, show: b.anonymous !== true, hideAmount: b.hideAmount === true,
        team: await teamOk(c, b.team), level: ((c.levels || []).find((l) => l.id === b.level) || {}).id || '', dedication: clean(b.dedication, 80), message: clean(b.message, 140), at: Date.now() };
      await store.setKv(pledgeKey(c.slug), [p, ...await pledges(c.slug)]); cache.delete(c.slug);
      notify(`New pledge for ${c.title}: $${(cents / 100).toLocaleString('en-US')}`, `${fullName} <${email}>${p.phone ? ' ' + p.phone : ''} pledged $${(cents / 100).toLocaleString('en-US')} to ${c.title}, to pay by ${how}.${p.dedication ? '\nDedication: ' + p.dedication : ''}${p.message ? '\nMessage: ' + p.message : ''}\n\nWhen it arrives, mark it received in the Rabbi area (Campaign section) so it counts.`);
      res.json({ ok: true });
    }));

    // Ambassadors open their own page: live at once, with a private link to change it later.
    api.post('/campaign/:slug/ambassador', limit('ambassador', 6, 60 * 60 * 1000), wrap(async (req, res) => {
      const c = find(req.params.slug), b = req.body || {};
      if (!c || c.status === 'draft' || hasEnded(c) || c.ambassadors === false || !store) throw new HttpError(400, 'invalid_campaign', 'This campaign is not taking new ambassadors.');
      const name = clean(b.name, 60), email = clean(b.email, 254).toLowerCase(), goal = Math.round(Number(b.goal));
      if (name.length < 2) throw new HttpError(400, 'invalid_name', 'Please enter the name for your page.');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'invalid_email', 'Please enter a valid email address.');
      if (!(goal >= 100 && goal <= 10000000)) throw new HttpError(400, 'invalid_goal', 'Please choose a goal of at least $100.');
      const all = await ambassadors(store, c.slug), taken = new Set([...(c.teams || []).map((t) => t.slug), ...all.map((t) => t.slug), 'thank-you', 'join', 'edit']);
      let slug = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'friend';
      if (!SLUG.test(slug)) slug = 'friend';
      for (let i = 2; taken.has(slug); i++) slug = slug.replace(/-\d+$/, '') + '-' + i;
      const token = crypto.randomBytes(18).toString('base64url');
      const t = { slug, name, goal, message: clean(b.message, 400), email, phone: clean(b.phone, 30), token, at: Date.now(), hidden: false };
      await store.setKv(ambKey(c.slug), [...all, t]);
      const lang = ['he', 'ru'].includes(b.lang) ? b.lang : 'en', pre = lang === 'en' ? '' : '/' + lang, page = siteBase(req) + pre + '/campaign/' + c.slug + '/' + slug;
      notify(`New ambassador page for ${c.title}: ${name}`, `${name} <${email}>${t.phone ? ' ' + t.phone : ''} opened a fundraising page with a goal of $${goal.toLocaleString('en-US')}:\n${page}\n\n${t.message}\n\nTo hide it, open the Rabbi area, Campaign section.`);
      if (mailer) mailer.send({ to: email, subject: `Your page for ${c.title} is ready`, text: `Thank you for raising money for ${c.title}!\n\nYour page: ${page}\nShare it with friends and family by WhatsApp, text and email.\n\nTo change your goal or your words later (keep this link private):\n${page}/edit?k=${token}\n\n${(site().org || {}).name || ''}` }).catch(() => {});
      res.json({ ok: true, url: pre + '/campaign/' + c.slug + '/' + slug + '?welcome=1&k=' + token });
    }));
    // The ambassador changes their goal or words (with the private link).
    api.post('/campaign/:slug/ambassador/:team', limit('ambassador', 20, 60 * 60 * 1000), wrap(async (req, res) => {
      const c = find(req.params.slug), b = req.body || {}; if (!c || !store) throw new HttpError(404, 'not_found', 'Not found.');
      const all = await ambassadors(store, c.slug), t = all.find((x) => x.slug === req.params.team);
      const kb = Buffer.from(String(b.k || '')), tb = Buffer.from(t ? t.token : '');
      if (!t || kb.length !== tb.length || !crypto.timingSafeEqual(kb, tb)) throw new HttpError(403, 'forbidden', 'This link is not valid.');
      const goal = Math.round(Number(b.goal)), name = clean(b.name, 60);
      if (goal >= 100 && goal <= 10000000) t.goal = goal;
      if (name.length >= 2) t.name = name;
      if (typeof b.message === 'string') t.message = clean(b.message, 400);
      await store.setKv(ambKey(c.slug), all);
      res.json({ ok: true });
    }));

    // The thank-you page calls this: a split gift gets its end date right away, and the totals refresh.
    api.post('/campaign/confirm', limit('campaign', 120, 10 * 60 * 1000), wrap(async (req, res) => {
      const id = String((req.body && req.body.session_id) || '');
      if (!stripe || !/^cs_[A-Za-z0-9_]{6,200}$/.test(id)) return res.json({ ok: false });
      const s = await stripe.checkout.sessions.retrieve(id).catch(() => null);
      if (!s || !s.metadata || !s.metadata.campaign) return res.json({ ok: false });
      if (s.subscription) await endInstallments(typeof s.subscription === 'string' ? await stripe.subscriptions.retrieve(s.subscription) : s.subscription);
      cache.delete(s.metadata.campaign);
      res.json({ ok: true });
    }));
  }

  // The Rabbi area: every gift (with names and amounts), pledges, ambassadors, and gifts entered by hand.
  function mountAdmin(r, { authed, wrap }) {
    r.get('/api/campaigns', authed, wrap(async (req, res) => {
      const out = [];
      for (const c of list()) {
        const all = await gifts(c), t = await totals(c);
        out.push({ slug: c.slug, title: c.title, goal: c.goal, live: isLive(c), status: c.status || '', start: c.start, end: c.end, raised: t.raised, given: t.given, pledged: t.pledged, donors: t.donors,
          teams: await teamsOf(store, c), teamTotals: t.teams, ambassadors: (await ambassadors(store, c.slug)).map(({ token, ...x }) => x), pledges: await pledges(c.slug), gifts: all });
      }
      res.json({ campaigns: out });
    }));
    const addOffline = async (c, g) => { await store.setKv(offlineKey(c.slug), [g, ...await offline(c.slug)]); cache.delete(c.slug); };
    r.post('/api/campaigns/:slug/offline', authed, wrap(async (req, res) => {
      const c = find(req.params.slug); if (!c || !store) return res.status(404).json({ error: 'No such campaign.' });
      const b = req.body || {}, cents = Math.round(Number(b.amount) * 100);
      if (!Number.isFinite(cents) || cents < 100 || cents > MAX_PLEDGE) return res.status(400).json({ error: 'Please enter the amount.' });
      const name = clean(b.name, 60); if (!name) return res.status(400).json({ error: 'Please enter the name.' });
      const g = { id: 'off_' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex'), name, show: b.show !== false, hideAmount: b.hideAmount === true, cents, team: await teamOk(c, b.team), level: ((c.levels || []).find((l) => l.id === b.level) || {}).id || '', message: clean(b.message, 140), dedication: clean(b.dedication, 80), at: Date.now(), how: ['check', 'cash', 'wire', 'stock', 'daf', 'pledge', 'other'].includes(b.how) ? b.how : 'check' };
      await addOffline(c, g);
      res.json({ ok: true, gift: g });
    }));
    r.delete('/api/campaigns/:slug/offline/:id', authed, wrap(async (req, res) => {
      const c = find(req.params.slug); if (!c || !store) return res.status(404).json({ error: 'No such campaign.' });
      await store.setKv(offlineKey(c.slug), (await offline(c.slug)).filter((g) => g.id !== req.params.id)); cache.delete(c.slug);
      res.json({ ok: true });
    }));
    // A pledge arrived (it becomes a gift and counts) or will not come (removed).
    r.post('/api/campaigns/:slug/pledges/:id', authed, wrap(async (req, res) => {
      const c = find(req.params.slug); if (!c || !store) return res.status(404).json({ error: 'No such campaign.' });
      const all = await pledges(c.slug), p = all.find((x) => x.id === req.params.id); if (!p) return res.status(404).json({ error: 'No such pledge.' });
      const action = req.body && req.body.action;
      if (action === 'received' && p.status === 'pending') {
        p.status = 'received';
        await addOffline(c, { id: 'off_' + p.id, name: p.name, show: p.show, hideAmount: p.hideAmount, cents: p.cents, team: p.team, level: p.level, message: p.message, dedication: p.dedication, at: Date.now(), how: p.how === 'check' || p.how === 'wire' || p.how === 'stock' || p.how === 'daf' ? p.how : 'other' });
      } else if (action === 'cancel') p.status = 'canceled';
      await store.setKv(pledgeKey(c.slug), all); cache.delete(c.slug);
      res.json({ ok: true });
    }));
    // Hide or show an ambassador's page.
    r.post('/api/campaigns/:slug/ambassadors/:team', authed, wrap(async (req, res) => {
      const c = find(req.params.slug); if (!c || !store) return res.status(404).json({ error: 'No such campaign.' });
      const all = await ambassadors(store, c.slug), t = all.find((x) => x.slug === req.params.team); if (!t) return res.status(404).json({ error: 'No such page.' });
      t.hidden = !!(req.body && req.body.hidden);
      await store.setKv(ambKey(c.slug), all);
      res.json({ ok: true });
    }));
  }

  return { mountPublic, mountAdmin, totals, gifts, endInstallments, find };
}

module.exports = { createCampaigns, isLive, hasEnded, withMatch, lastPaymentEnd, plansOf, teamsOf, ambassadors, MAX_TOTAL, MAX_ONCE };
