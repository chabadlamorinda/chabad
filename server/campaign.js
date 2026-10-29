// Fundraising campaigns (building campaign, end of year...): the money side. The campaigns themselves (title, goal,
// dates, teams, giving levels, matching) are in site/content/campaigns.json; the pages are server/site/campaign-page.js.
//
// * Checkout: Stripe's secure checkout page, either one payment or a large gift split into 12, 24, 36... monthly
//   payments (a Stripe subscription that ends by itself after the last payment: see endInstallments).
// * Totals: read from Stripe (payments and plans that carry metadata.campaign) plus gifts the Rabbi enters by hand
//   (checks, cash, donor-advised funds), kept in the kv table. A split gift counts in full toward the goal.
// * Nothing is stored about card details; the donor wall shows only what the donor chose to show.
'use strict';
const { withOffset } = require('./site/content.js');

const MAX_TOTAL = 25000000;   // $250,000 for a whole pledge
const MAX_ONCE = 10000000;    // $100,000 in one card payment
const MIN_MONTHLY = 500;      // each monthly payment at least $5
const CACHE_MS = 60 * 1000;

// A campaign is running from start to end (Lafayette time), unless it is a draft.
function isLive(c, now = new Date()) {
  if (!c || c.status === 'draft') return false;
  const t = (s, end) => Date.parse(withOffset(s.length === 10 ? s + (end ? 'T23:59' : 'T00:00') : s)); // Lafayette time; a date alone ends at the end of that day
  return (!c.start || t(c.start) <= now.getTime()) && (!c.end || t(c.end, true) > now.getTime());
}
// The matching makes every dollar count more, up to what the matchers pledged (cap, in dollars).
function withMatch(c, cents) {
  const m = c.matching || {}, x = Number(m.multiplier) || 1;
  if (x <= 1) return cents;
  const extra = Math.round(cents * (x - 1)), cap = Number(m.cap) > 0 ? Number(m.cap) * 100 : Infinity;
  return cents + Math.min(extra, cap);
}
// The date a split gift's last payment is made, plus a day: Stripe stops the plan there.
function lastPaymentEnd(anchorSec, months) {
  const d = new Date(anchorSec * 1000); d.setUTCMonth(d.getUTCMonth() + months - 1); d.setUTCDate(d.getUTCDate() + 1);
  return Math.floor(d.getTime() / 1000);
}

function createCampaigns({ stripe, store, content, log = console, clean, HttpError, ensureProduct, FUND_NAMES, FEE_RATE, siteEnv = process.env }) {
  const list = () => (content().campaigns || []);
  const find = (slug) => list().find((c) => c.slug === slug);
  const cache = new Map();

  // A split gift: stop the plan after its last payment (done when the donor returns, and again whenever totals are read).
  async function endInstallments(sub) {
    const m = (sub && sub.metadata) || {}, n = Number(m.installments);
    if (!n || sub.cancel_at || !['active', 'trialing', 'past_due'].includes(sub.status)) return;
    try { await stripe.subscriptions.update(sub.id, { cancel_at: lastPaymentEnd(sub.billing_cycle_anchor || sub.created, n), proration_behavior: 'none' }); }
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
  const offlineKey = (slug) => 'campaign-offline:' + slug;
  async function offline(slug) { return store ? await store.getKv(offlineKey(slug), []) : []; }

  // Every gift to a campaign, newest first: { id, name, show, cents, plan, months, team, level, message, dedication, at, how }
  async function gifts(c) {
    const out = [];
    if (stripe) {
      const q = `metadata['campaign']:'${c.slug}'`;
      for (const pi of await searchAll(stripe.paymentIntents, q + " AND status:'succeeded'")) {
        const m = pi.metadata || {};
        out.push({ id: pi.id, name: m.wall_name || '', show: m.wall_show === 'yes', hideAmount: m.hide_amount === 'yes', cents: Number(m.gift_cents) || pi.amount_received || pi.amount || 0, plan: 'once', team: m.team || '', level: m.level || '', message: m.message || '', dedication: m.dedication || '', at: (pi.created || 0) * 1000, how: 'card' });
      }
      for (const s of await searchAll(stripe.subscriptions, q)) {
        const m = s.metadata || {}, n = Number(m.installments) || 0;
        const counts = ['active', 'trialing', 'past_due'].includes(s.status) || (s.status === 'canceled' && s.cancel_at && s.canceled_at >= s.cancel_at - 86400);
        if (!n || !counts) continue;
        await endInstallments(s);
        out.push({ id: s.id, name: m.wall_name || '', show: m.wall_show === 'yes', hideAmount: m.hide_amount === 'yes', cents: Number(m.pledge_cents) || 0, plan: 'split', months: n, team: m.team || '', level: m.level || '', message: m.message || '', dedication: m.dedication || '', at: (s.created || 0) * 1000, how: 'card' });
      }
    }
    for (const g of await offline(c.slug)) out.push({ ...g, plan: 'once', how: g.how || 'check' });
    return out.sort((a, b) => b.at - a.at);
  }

  // What the public page shows: the totals, the teams, how many of each level are taken, and the donor wall.
  async function totals(c) {
    const hit = cache.get(c.slug);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;
    const all = await gifts(c), base = all.reduce((a, g) => a + g.cents, 0), teams = {}, levels = {};
    for (const g of all) { if (g.team) teams[g.team] = (teams[g.team] || 0) + withMatch(c, g.cents); if (g.level) levels[g.level] = (levels[g.level] || 0) + 1; }
    const wall = all.slice(0, 200).map((g) => ({ name: g.show && g.name ? g.name : '', cents: g.hideAmount ? null : g.cents, months: g.months || 0, team: g.team, message: g.message, dedication: g.dedication, at: g.at }));
    const data = { raised: withMatch(c, base) / 100, given: base / 100, donors: all.length, teams: Object.fromEntries(Object.entries(teams).map(([k, v]) => [k, v / 100])), levels, wall };
    cache.set(c.slug, { at: Date.now(), data });
    return data;
  }

  function mountPublic(api, { wrap, limit }) {
    api.get('/campaign/:slug', limit('campaign', 120, 10 * 60 * 1000), wrap(async (req, res) => {
      const c = find(req.params.slug); if (!c) throw new HttpError(404, 'not_found', 'No such campaign.');
      res.json(await totals(c));
    }));

    api.post('/campaign/checkout', limit('give', 20, 10 * 60 * 1000), wrap(async (req, res) => {
      if (!stripe) throw new HttpError(503, 'not_configured', 'Online giving is not set up yet.');
      const b = req.body || {}, c = find(String(b.campaign || ''));
      if (!c || !isLive(c)) throw new HttpError(400, 'invalid_campaign', 'This campaign is not open for gifts.');
      const cents = Math.round(Number(b.amount) * 100), months = Number(b.months) || 0, split = months > 1;
      const plans = c.months && c.months.length ? c.months : [12, 24, 36];
      if (split && !plans.includes(months)) throw new HttpError(400, 'invalid_plan', 'Please choose how many months.');
      if (!Number.isFinite(cents) || cents < 100 || cents > (split ? MAX_TOTAL : MAX_ONCE)) throw new HttpError(400, 'invalid_amount', split ? 'Please enter an amount between $1 and $250,000.' : 'Please enter an amount between $1 and $100,000. For a larger gift, choose monthly payments or call us.');
      const monthly = split ? Math.ceil(cents / months) : 0;
      if (split && monthly < MIN_MONTHLY) throw new HttpError(400, 'invalid_amount', 'Each monthly payment needs to be at least $5.');
      const team = (c.teams || []).some((t) => t.slug === b.team) ? b.team : '', level = (c.levels || []).find((l) => l.id === b.level);
      const idem = clean(b.idem, 80); if (idem.length < 16) throw new HttpError(400, 'invalid_request', 'Missing request id.');
      const fee = b.fee === true, withFee = (x) => (fee ? Math.round(x * (1 + FEE_RATE)) : x);
      const lang = ['he', 'ru'].includes(b.lang) ? b.lang : 'en', pre = lang === 'en' ? '' : '/' + lang;
      const fund = Object.prototype.hasOwnProperty.call(FUND_NAMES, c.fund) ? c.fund : 'general';
      const configured = /^https:\/\/[^/\s]+$/.test(String(siteEnv.PUBLIC_URL || '').replace(/\/+$/, '')) ? siteEnv.PUBLIC_URL.replace(/\/+$/, '') : '';
      const base = configured || req.protocol + '://' + req.get('host');
      const meta = { source: 'pushka', via: 'website', campaign: c.slug, fund, team, level: level ? level.id : '', dedication: clean(b.dedication, 80), message: clean(b.message, 140),
        wall_name: clean(b.name, 60), wall_show: b.anonymous === true ? 'no' : 'yes', hide_amount: b.hideAmount === true ? 'yes' : 'no', fee_covered: fee ? 'yes' : 'no',
        gift_cents: String(split ? monthly : cents), ...(split ? { installments: String(months), pledge_cents: String(cents) } : {}) };
      const title = c.title + (meta.dedication ? ' (' + meta.dedication + ')' : '');
      const session = await stripe.checkout.sessions.create({
        mode: split ? 'subscription' : 'payment', locale: lang === 'en' ? 'auto' : lang,
        line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: withFee(split ? monthly : cents), ...(split ? { product: await ensureProduct(fund), recurring: { interval: 'month' } } : { product_data: { name: title } }) } }],
        ...(split ? { subscription_data: { description: `${c.title}: ${months} monthly payments`, metadata: meta } } : { submit_type: 'donate', payment_intent_data: { description: title, metadata: meta } }),
        metadata: meta,
        success_url: base + pre + '/campaign/' + c.slug + '/thank-you?session_id={CHECKOUT_SESSION_ID}' + (team ? '&team=' + team : ''),
        cancel_url: base + pre + '/campaign/' + c.slug + (team ? '/' + team : ''),
      }, { idempotencyKey: 'campaign-' + idem });
      res.json({ url: session.url });
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

  // The Rabbi area: every gift (with names and amounts), and gifts entered by hand (checks, cash, donor-advised funds).
  function mountAdmin(r, { authed, wrap }) {
    r.get('/api/campaigns', authed, wrap(async (req, res) => {
      const out = [];
      for (const c of list()) { const all = await gifts(c), t = await totals(c); out.push({ slug: c.slug, title: c.title, goal: c.goal, live: isLive(c), status: c.status || '', start: c.start, end: c.end, raised: t.raised, given: t.given, donors: t.donors, teams: c.teams || [], teamTotals: t.teams, gifts: all }); }
      res.json({ campaigns: out });
    }));
    r.post('/api/campaigns/:slug/offline', authed, wrap(async (req, res) => {
      const c = find(req.params.slug); if (!c || !store) return res.status(404).json({ error: 'No such campaign.' });
      const b = req.body || {}, cents = Math.round(Number(b.amount) * 100);
      if (!Number.isFinite(cents) || cents < 100 || cents > MAX_TOTAL * 4) return res.status(400).json({ error: 'Please enter the amount.' });
      const name = clean(b.name, 60); if (!name) return res.status(400).json({ error: 'Please enter the name.' });
      const g = { id: 'off_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, show: b.show !== false, hideAmount: b.hideAmount === true, cents, team: (c.teams || []).some((t) => t.slug === b.team) ? b.team : '', level: '', message: clean(b.message, 140), dedication: clean(b.dedication, 80), at: Date.now(), how: ['check', 'cash', 'daf', 'pledge', 'other'].includes(b.how) ? b.how : 'check' };
      await store.setKv(offlineKey(c.slug), [g, ...await offline(c.slug)]); cache.delete(c.slug);
      res.json({ ok: true, gift: g });
    }));
    r.delete('/api/campaigns/:slug/offline/:id', authed, wrap(async (req, res) => {
      const c = find(req.params.slug); if (!c || !store) return res.status(404).json({ error: 'No such campaign.' });
      await store.setKv(offlineKey(c.slug), (await offline(c.slug)).filter((g) => g.id !== req.params.id)); cache.delete(c.slug);
      res.json({ ok: true });
    }));
  }

  return { mountPublic, mountAdmin, totals, gifts, endInstallments, find };
}

module.exports = { createCampaigns, isLive, withMatch, lastPaymentEnd, MAX_TOTAL, MAX_ONCE };
