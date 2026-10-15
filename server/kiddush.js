// Kiddush board: public API (TV display + sponsor page), sponsor/payment flow, and the Rabbi's admin API.
//
// Payments: cards, Apple Pay and Google Pay go through Stripe Checkout (hosted by Stripe, so card numbers
// never touch this server). Zelle, Venmo, check and cash reserve the week as "pending" and show the donor
// the instructions; the Rabbi marks it paid in the admin page once the money arrives.
'use strict';
const cal = require('./kiddush-calendar.js');
const { ptParts } = require('./scheduler.js');

const KINDS = { honor: 'In honor of', memory: 'In loving memory of', refuah: 'For the speedy recovery of', celebration: 'In celebration of', merit: 'In the merit of' };
const METHODS = ['card', 'zelle', 'venmo', 'check', 'cash'];
const FEE_RATE = 0.035;
const MAX_CENTS = 1000000;

// Everything the Rabbi can change on the Settings tab. Prices are in dollars.
const DEFAULTS = {
  orgName: 'Chabad Lamorinda',
  priceShabbat: 180, priceHoliday: 180,
  cardOn: true, coverFee: true,
  zelleOn: true, zelleId: '', zelleName: 'Chabad of Lamorinda',
  venmoOn: true, venmoHandle: 'CHABAD-LAMORINDA',
  checkOn: true, checkPayable: 'Chabad of Lamorinda', checkAddress: '3477 Golden Gate Way, Lafayette, CA 94549',
  cashOn: true,
  contactEmail: 'rabbi@chabadoflamorinda.com', contactPhone: '925-384-7242',
  publicUrl: '',
  blessing: 'May He who blessed our fathers, Abraham, Isaac, and Jacob, bless those who provide wine for Kiddush... May the Holy One blessed be He, give them their reward, heal their entire body, pardon all their sins, and send blessings and success to all their endeavours.',
  donorEn: '', donorHe: '',
  showPending: true, includePurim: true,
  boardYear: 0, // 0 = automatic: the year of the next upcoming Kiddush, so the board flips at Rosh Hashanah by itself
};
const FIELD = { // type of each setting, for validation
  orgName: ['s', 80], priceShabbat: ['n'], priceHoliday: ['n'], cardOn: ['b'], coverFee: ['b'], zelleOn: ['b'], zelleId: ['s', 120], zelleName: ['s', 80],
  venmoOn: ['b'], venmoHandle: ['s', 60], checkOn: ['b'], checkPayable: ['s', 80], checkAddress: ['s', 200], cashOn: ['b'], contactEmail: ['s', 120], contactPhone: ['s', 30],
  publicUrl: ['u'], blessing: ['s', 600], donorEn: ['s', 120], donorHe: ['s', 120], showPending: ['b'], includePurim: ['b'], boardYear: ['y'],
};

class HttpError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const validEmail = (e) => /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(e) && e.length <= 254;
const dedicationText = (kind, text) => (text ? (KINDS[kind] ? KINDS[kind] + ' ' : '') + text : '');

function createKiddush({ store, stripe, log = console, now = () => new Date() }) {
  const needStore = () => { if (!store) throw new HttpError(503, 'not_configured', 'Sponsorships are not set up yet. Please contact the office.'); };

  async function settings() {
    const saved = store ? await store.getSettings() : {};
    return { ...DEFAULTS, ...saved };
  }
  const cents = (dollars) => Math.round(Number(dollars) * 100);

  // ---------- the year's slots, with the Rabbi's changes applied ----------
  async function todayInfo() {
    const today = ptParts(now()).ymd;
    return { today, hy: await cal.hebrewYearOf(today) };
  }
  async function slotsForYear(hy, st, overrides, events) {
    let slots = (await cal.buildYear(hy)).filter((s) => st.includePurim || s.kind !== 'purim');
    const extra = [];
    for (const e of events) {
      if ((await cal.hebrewYearOf(e.date)) !== hy) continue;
      const d = await cal.describeDate(e.date);
      extra.push({ ...d, date: e.date, key: e.date + '|c_' + e.id, kind: 'custom', title: e.title, titleHe: e.title_he, note: e.note, year: hy, eventId: e.id });
    }
    slots = slots.concat(extra).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.kind === 'custom') - (b.kind === 'custom')));
    return slots.map((s) => {
      const o = overrides.get(s.key) || {};
      const priceCents = o.priceCents != null ? o.priceCents : cents(s.kind === 'shabbat' ? st.priceShabbat : st.priceHoliday);
      return { ...s, title: o.title || s.title, hidden: !!o.hidden, priceCents, customTitle: !!o.title, customPrice: o.priceCents != null };
    });
  }

  const spView = (sp) => ({
    id: sp.id, status: sp.status, method: sp.method, name: sp.name, anonymous: sp.anonymous, dedicationKind: sp.dedication_kind, dedication: sp.dedication,
    email: sp.email, phone: sp.phone, note: sp.note, amountCents: sp.amount_cents, feeCents: sp.fee_cents, source: sp.source, paidAt: sp.paid_at, createdAt: sp.created_at,
  });
  const publicSponsor = (sp, st) => (sp && (sp.status === 'paid' || st.showPending)
    ? { name: sp.anonymous ? 'Anonymous' : sp.name, dedication: dedicationText(sp.dedication_kind, sp.dedication) } : null);

  /** The board for one Hebrew year. `admin` adds hidden weeks and private donor details. */
  async function board({ year, admin = false, exact = false } = {}) {
    const st = await settings();
    const { today } = await todayInfo();
    const [overrides, events, live] = store ? await Promise.all([store.slotOverrides(), store.listEvents(), store.liveSponsorships()]) : [new Map(), [], []];
    const byKey = new Map(live.map((s) => [s.slot_key, s]));
    let y, all, next;
    if (exact && Number.isInteger(year) && year > 5700 && year < 6000) { y = year; all = await slotsForYear(y, st, overrides, events); }
    else if (st.boardYear) { y = st.boardYear; all = await slotsForYear(y, st, overrides, events); }
    else { // automatic: the year containing the next upcoming week
      const { hy } = await todayInfo();
      const [a, b] = await Promise.all([slotsForYear(hy, st, overrides, events), slotsForYear(hy + 1, st, overrides, events)]);
      const nx = a.concat(b).find((s) => !s.hidden && s.date >= today);
      y = nx ? nx.year : hy; all = y === hy ? a : b;
    }
    next = all.find((s) => !s.hidden && s.date >= today);
    const slots = all.filter((s) => admin || !s.hidden).map((s) => {
      const sp = byKey.get(s.key) || null;
      const out = {
        key: s.key, year: s.year, kind: s.kind, title: s.title, titleHe: s.titleHe, note: s.note, date: s.date, dow: s.dow, dateLabel: s.dateLabel, heb: s.heb, hebHe: s.hebHe,
        priceCents: s.priceCents, past: s.date < today,
        status: !sp ? 'open' : sp.status === 'paid' ? 'sponsored' : 'reserved',
        sponsor: publicSponsor(sp, st),
      };
      if (admin) Object.assign(out, { hidden: s.hidden, customTitle: s.customTitle, customPrice: s.customPrice, eventId: s.eventId || null, sponsorship: sp ? spView(sp) : null });
      return out;
    });
    return {
      today, year: y, yearHe: await cal.yearHe(y), current: next ? next.key : null, years: [y], slots,
      sponsoring: !!store, settings: publicSettings(st),
    };
  }

  function waysOf(st) {
    return {
      card: !!stripe && st.cardOn,
      zelle: st.zelleOn && !!st.zelleId,
      venmo: st.venmoOn && !!st.venmoHandle,
      check: st.checkOn,
      cash: st.cashOn,
    };
  }
  function publicSettings(st) {
    return {
      orgName: st.orgName, ways: waysOf(st), coverFee: st.coverFee, feeRate: FEE_RATE,
      zelleId: st.zelleId, zelleName: st.zelleName, venmoHandle: st.venmoHandle.replace(/^@/, ''), checkPayable: st.checkPayable, checkAddress: st.checkAddress,
      contactEmail: st.contactEmail, contactPhone: st.contactPhone, publicUrl: st.publicUrl, blessing: st.blessing, donorEn: st.donorEn, donorHe: st.donorHe,
      kinds: KINDS,
    };
  }

  async function findSlot(key, { allowHidden = false } = {}) {
    if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}\|[A-Za-z0-9_]{1,40}$/.test(key)) return null;
    const hy = await cal.hebrewYearOf(key.slice(0, 10));
    const { slots } = await board({ year: hy, admin: true, exact: true });
    const s = slots.find((x) => x.key === key);
    if (!s || (s.hidden && !allowHidden)) return null;
    if (!allowHidden && s.year !== (await board({})).year) return null; // only the year on the board can be sponsored
    return s;
  }

  // ---------- creating a sponsorship ----------
  function readForm(b, st) {
    const name = clean(b.name, 80);
    if (!name) throw new HttpError(400, 'invalid_name', 'Please enter the name to show on the Kiddush board.');
    const email = clean(b.email, 254).toLowerCase();
    if (!validEmail(email)) throw new HttpError(400, 'invalid_email', 'Please enter a valid email address.');
    const method = String(b.method || '');
    if (!METHODS.includes(method)) throw new HttpError(400, 'invalid_method', 'Please choose how you would like to pay.');
    if (!waysOf(st)[method]) throw new HttpError(400, 'method_off', 'That payment option is not available right now.');
    const amount = cents(b.amount);
    if (!Number.isFinite(amount) || amount < 100 || amount > MAX_CENTS) throw new HttpError(400, 'invalid_amount', 'Please enter an amount between $1 and $10,000.');
    const kind = Object.prototype.hasOwnProperty.call(KINDS, b.dedicationKind) ? b.dedicationKind : '';
    const idem = clean(b.idem, 80);
    if (idem.length < 16) throw new HttpError(400, 'invalid_request', 'Missing request id.');
    return {
      name, email, method, amount, idem, kind, anonymous: b.anonymous === true,
      dedication: clean(b.dedication, 120), phone: clean(b.phone, 30), note: clean(b.note, 300), fee: b.fee === true && method === 'card' && st.coverFee,
    };
  }
  const baseUrl = (req, st) => {
    const configured = /^https:\/\/[^/\s]+$/.test(st.publicUrl.replace(/\/+$/, '')) ? st.publicUrl.replace(/\/+$/, '') : '';
    return configured || req.protocol + '://' + req.get('host');
  };
  const instructionsFor = (method, st, slot, amountCents) => {
    const memo = 'Kiddush ' + slot.title + ' ' + slot.dateLabel;
    const dollars = (amountCents / 100).toFixed(2).replace(/\.00$/, '');
    if (method === 'zelle') return { zelleId: st.zelleId, zelleName: st.zelleName, memo, amount: dollars };
    if (method === 'venmo') { const h = st.venmoHandle.replace(/^@/, ''); return { venmoHandle: h, memo, amount: dollars, link: 'https://venmo.com/' + encodeURIComponent(h) + '?txn=pay&amount=' + dollars + '&note=' + encodeURIComponent(memo) }; }
    if (method === 'check') return { payable: st.checkPayable, address: st.checkAddress, memo, amount: dollars };
    return { memo, amount: dollars };
  };

  async function sponsor(req, body) {
    needStore();
    const st = await settings();
    const f = readForm(body || {}, st);
    const dup = await store.sponsorshipByIdem(f.idem);
    if (dup) return resumeResponse(dup, st);
    const slot = await findSlot(body.slot);
    if (!slot) throw new HttpError(404, 'no_slot', 'That week could not be found.');
    if (slot.past) throw new HttpError(400, 'past', 'That date has already passed.');
    if (slot.status !== 'open') throw new HttpError(409, 'taken', 'Sorry, someone just sponsored this week. Please choose another.');
    if (f.amount < slot.priceCents) throw new HttpError(400, 'amount_too_low', 'The minimum for this Kiddush is $' + (slot.priceCents / 100) + '.');
    if (await store.pendingCountForEmail(f.email) >= 4) throw new HttpError(429, 'too_many', 'You already have several reservations waiting. Please complete or contact us first.');
    const fee = f.fee ? Math.round(f.amount * FEE_RATE) : 0;
    const id = await store.createSponsorship({
      slotKey: slot.key, status: 'pending', method: f.method, name: f.name, anonymous: f.anonymous, dedicationKind: f.kind, dedication: f.dedication,
      email: f.email, phone: f.phone, note: f.note, amountCents: f.amount, feeCents: fee, source: 'online', idem: f.idem,
    });
    if (!id) throw new HttpError(409, 'taken', 'Sorry, someone just sponsored this week. Please choose another.');
    const sp = await store.getSponsorship(id);
    if (f.method !== 'card') return { ok: true, id, status: 'pending', method: f.method, slot: slotBrief(slot), display: sponsorBrief(sp), instructions: instructionsFor(f.method, st, slot, f.amount), contact: contactOf(st) };
    try {
      const base = baseUrl(req, st);
      const title = 'Kiddush sponsorship: ' + slot.title + ', ' + slot.dateLabel;
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: f.amount + fee, product_data: { name: title, ...(sp.dedication ? { description: dedicationText(sp.dedication_kind, sp.dedication) } : {}) } } }],
        customer_email: f.email,
        payment_intent_data: { description: title, receipt_email: f.email, metadata: { source: 'kiddush', sponsorship: id, slot: slot.key } },
        metadata: { source: 'kiddush', sponsorship: id, slot: slot.key, fee_covered: fee ? 'yes' : 'no' },
        success_url: base + '/kiddush/?paid=' + id + '&session_id={CHECKOUT_SESSION_ID}',
        cancel_url: base + '/kiddush/?cancelled=' + id,
        expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
      }, { idempotencyKey: 'kiddush-' + id });
      await store.attachSession(id, session.id);
      return { ok: true, id, status: 'pending', method: 'card', url: session.url };
    } catch (e) {
      await store.releaseSponsorship(id, 'expired');
      throw e;
    }
  }
  const slotBrief = (s) => ({ key: s.key, title: s.title, dateLabel: s.dateLabel, heb: s.heb, date: s.date });
  const sponsorBrief = (sp) => ({ name: sp.anonymous ? 'Anonymous' : sp.name, dedication: dedicationText(sp.dedication_kind, sp.dedication) });
  const contactOf = (st) => ({ email: st.contactEmail, phone: st.contactPhone });
  async function resumeResponse(sp, st) { // the same request sent twice (double tap, retry): answer again, never double-book
    const slot = await findSlot(sp.slot_key, { allowHidden: true });
    if (sp.method === 'card') return { ok: true, id: sp.id, status: sp.status, method: 'card', url: null, duplicate: true };
    return { ok: true, id: sp.id, status: sp.status, method: sp.method, slot: slot ? slotBrief(slot) : null, display: sponsorBrief(sp), instructions: slot ? instructionsFor(sp.method, st, slot, sp.amount_cents) : {}, contact: contactOf(st), duplicate: true };
  }

  /** The donor lands back from Stripe Checkout. Verifies with Stripe itself, so it works even without the webhook. */
  async function confirm(id, sessionId) {
    needStore();
    const sp = typeof id === 'string' ? await store.getSponsorship(id) : null;
    if (!sp || sp.method !== 'card' || !sessionId || sp.stripe_session_id !== sessionId) throw new HttpError(404, 'not_found', 'We could not find that sponsorship.');
    const slot = await findSlot(sp.slot_key, { allowHidden: true });
    const brief = { slot: slot ? slotBrief(slot) : null, display: sponsorBrief(sp) };
    if (sp.status === 'paid') return { status: 'paid', ...brief };
    if (!stripe) throw new HttpError(503, 'not_configured', 'Card payments are not set up.');
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.metadata && session.metadata.sponsorship !== sp.id) throw new HttpError(404, 'not_found', 'We could not find that sponsorship.');
    if (session.payment_status === 'paid') {
      const done = await store.markPaid(sp.id, { paymentIntent: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent && session.payment_intent.id });
      if (done && done.conflict) { log.error('kiddush: paid session for a week that was taken', sp.id); return { status: 'conflict', ...brief }; }
      return { status: 'paid', ...brief };
    }
    return { status: session.status === 'expired' ? 'expired' : sp.status, ...brief };
  }

  async function cancel(id) {
    needStore();
    const sp = typeof id === 'string' ? await store.getSponsorship(id) : null;
    if (!sp || sp.method !== 'card' || sp.status !== 'pending') return { ok: true };
    await store.releaseSponsorship(sp.id, 'released', true);
    if (stripe && sp.stripe_session_id) { try { await stripe.checkout.sessions.expire(sp.stripe_session_id); } catch (e) { /* already closed */ } }
    return { ok: true };
  }

  /** Stripe webhook events for Checkout sessions created here. */
  async function onStripeEvent(event) {
    if (!store || !/^checkout\.session\./.test(event.type)) return false;
    const o = (event.data && event.data.object) || {};
    if (!o.metadata || o.metadata.source !== 'kiddush' || !o.metadata.sponsorship) return false;
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      if (o.payment_status === 'paid') {
        const r = await store.markPaid(o.metadata.sponsorship, { paymentIntent: typeof o.payment_intent === 'string' ? o.payment_intent : undefined });
        if (r && r.conflict) log.error('kiddush: paid session for a week that was taken', o.metadata.sponsorship);
      }
    } else if (event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed') {
      await store.releaseSponsorship(o.metadata.sponsorship, 'expired', true);
    }
    return true;
  }

  // =====================================================================================
  // Routes
  // =====================================================================================
  // Mounted at /api/kiddush with its own generous limits: at a Kiddush, dozens of phones on the shul's wifi share one IP.
  function mountPublic(r, { wrap, limit }) {
    r.get('/board', limit('kiddush-board', 600, 10 * 60 * 1000), wrap(async (req, res) => {
      const year = req.query.year ? parseInt(req.query.year, 10) : undefined;
      res.json(await board({ year }));
    }));
    r.post('/sponsor', limit('kiddush-sponsor', 40, 10 * 60 * 1000), wrap(async (req, res) => { res.json(await sponsor(req, req.body)); }));
    r.get('/confirm', limit('kiddush-confirm', 60, 10 * 60 * 1000), wrap(async (req, res) => { res.json(await confirm(String(req.query.id || ''), String(req.query.session_id || ''))); }));
    r.post('/cancel', limit('kiddush-cancel', 40, 10 * 60 * 1000), wrap(async (req, res) => { res.json(await cancel(String((req.body && req.body.id) || ''))); }));
  }

  function mountAdmin(r, { authed, wrap }) {
    const bad = (code, msg, status = 400) => { throw new HttpError(status, code, msg); };
    const guard = (fn) => wrap(async (req, res) => {
      try { await fn(req, res); } catch (e) {
        if (e instanceof HttpError) return res.status(e.status).json({ code: e.code, error: e.message });
        throw e;
      }
    });
    const need = () => { if (!store) bad('not_configured', 'No database.', 503); };
    const pickForm = (b, partial) => {
      const out = {};
      const put = (k, v) => { if (!partial || k in b) out[k] = v; };
      put('name', clean(b.name, 80));
      if ((!partial || 'name' in out) && !out.name) bad('invalid_name', 'Please enter a name.');
      put('anonymous', b.anonymous === true);
      put('dedicationKind', Object.prototype.hasOwnProperty.call(KINDS, b.dedicationKind) ? b.dedicationKind : '');
      put('dedication', clean(b.dedication, 120)); put('email', clean(b.email, 254).toLowerCase()); put('phone', clean(b.phone, 30)); put('note', clean(b.note, 300));
      put('method', METHODS.concat(['other']).includes(b.method) ? b.method : 'other');
      if ('amount' in b || !partial) { const c = cents(b.amount || 0); if (!Number.isFinite(c) || c < 0 || c > MAX_CENTS * 10) bad('invalid_amount', 'Amount looks wrong.'); out.amountCents = c; }
      return out;
    };

    r.get('/api/kiddush/board', authed, guard(async (req, res) => { need(); res.json(await board({ year: req.query.year ? parseInt(req.query.year, 10) : undefined, admin: true })); }));

    r.get('/api/kiddush/pending', authed, guard(async (req, res) => {
      need();
      const live = (await store.liveSponsorships()).filter((s) => s.status === 'pending');
      const out = [];
      for (const sp of live) { const slot = await findSlot(sp.slot_key, { allowHidden: true }); out.push({ ...spView(sp), slot: slot ? slotBrief(slot) : { key: sp.slot_key, title: sp.slot_key, dateLabel: '' } }); }
      out.sort((a, b) => (a.slot.date || '') < (b.slot.date || '') ? -1 : 1);
      res.json({ pending: out });
    }));

    r.put('/api/kiddush/slot', authed, guard(async (req, res) => {
      need();
      const b = req.body || {};
      const slot = await findSlot(b.key, { allowHidden: true });
      if (!slot) bad('no_slot', 'That week could not be found.', 404);
      let priceCents = null;
      if (b.price !== '' && b.price != null) { priceCents = cents(b.price); if (!Number.isFinite(priceCents) || priceCents < 0 || priceCents > MAX_CENTS) bad('invalid_amount', 'Price looks wrong.'); }
      await store.saveSlot(slot.key, { hidden: b.hidden === true, priceCents, title: clean(b.title, 80) });
      res.json({ ok: true });
    }));

    // Enter a sponsorship by hand (check handed over, Zelle received, someone who called the office...).
    r.post('/api/kiddush/sponsorship', authed, guard(async (req, res) => {
      need();
      const b = req.body || {};
      const slot = await findSlot(b.slot, { allowHidden: true });
      if (!slot) bad('no_slot', 'That week could not be found.', 404);
      const f = pickForm(b, false);
      const status = b.status === 'pending' ? 'pending' : 'paid';
      const id = await store.createSponsorship({ slotKey: slot.key, status, ...f, feeCents: 0, source: 'admin' });
      if (!id) bad('taken', 'This week already has a sponsor. Release it first, or edit it.', 409);
      res.json({ ok: true, id });
    }));

    r.patch('/api/kiddush/sponsorship/:id', authed, guard(async (req, res) => {
      need();
      const sp = await store.getSponsorship(req.params.id);
      if (!sp) bad('not_found', 'Not found.', 404);
      const b = req.body || {};
      const f = pickForm(b, true);
      if (['pending', 'paid'].includes(b.status)) f.status = b.status;
      if (typeof b.slot === 'string' && b.slot !== sp.slot_key) { const s = await findSlot(b.slot, { allowHidden: true }); if (!s) bad('no_slot', 'That week could not be found.', 404); f.slotKey = s.key; }
      try { await store.updateSponsorship(sp.id, f); }
      catch (e) { if (e && e.code === '23505') bad('taken', 'That week already has a sponsor.', 409); throw e; }
      res.json({ ok: true });
    }));

    r.post('/api/kiddush/sponsorship/:id/release', authed, guard(async (req, res) => {
      need();
      const sp = await store.getSponsorship(req.params.id);
      if (!sp) bad('not_found', 'Not found.', 404);
      await store.releaseSponsorship(sp.id, 'released');
      if (stripe && sp.status === 'pending' && sp.method === 'card' && sp.stripe_session_id) { try { await stripe.checkout.sessions.expire(sp.stripe_session_id); } catch (e) { /* already closed */ } }
      res.json({ ok: true });
    }));

    r.get('/api/kiddush/settings', authed, guard(async (req, res) => { need(); res.json({ settings: await settings(), defaults: DEFAULTS, cardAvailable: !!stripe }); }));
    r.put('/api/kiddush/settings', authed, guard(async (req, res) => {
      need();
      const b = req.body || {}, out = {};
      for (const [k, t] of Object.entries(FIELD)) {
        if (!(k in b)) continue;
        const v = b[k];
        if (t[0] === 'b') out[k] = v === true;
        else if (t[0] === 'n') { const n = Number(v); if (!Number.isFinite(n) || n < 1 || n > 10000) bad('invalid', 'Prices must be between $1 and $10,000.'); out[k] = Math.round(n * 100) / 100; }
        else if (t[0] === 'y') { const n = Number(v); if (!Number.isInteger(n) || (n && (n < 5700 || n > 5900))) bad('invalid', 'Leave this at 0 for automatic, or enter a Hebrew year such as 5787.'); out[k] = n; }
        else if (t[0] === 'u') { const u = String(v || '').trim().replace(/\/+$/, ''); if (u && !/^https:\/\/[A-Za-z0-9.-]+(:\d+)?$/.test(u)) bad('invalid', 'The public web address must look like https://kiddush.example.org'); out[k] = u; }
        else out[k] = clean(v, t[1]);
      }
      await store.saveSettings(out);
      res.json({ ok: true, settings: await settings() });
    }));

    r.post('/api/kiddush/events', authed, guard(async (req, res) => {
      need();
      const b = req.body || {};
      const date = String(b.date || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) bad('invalid', 'Please choose a date.');
      const title = clean(b.title, 80);
      if (!title) bad('invalid', 'Please give the event a name.');
      const id = await store.addEvent({ date, title, titleHe: clean(b.titleHe, 80), note: clean(b.note, 120) });
      res.json({ ok: true, id, key: date + '|c_' + id });
    }));
    r.delete('/api/kiddush/events/:id', authed, guard(async (req, res) => {
      need();
      const live = await store.liveSponsorships();
      if (live.some((s) => s.slot_key.endsWith('|c_' + req.params.id))) bad('in_use', 'This event has a sponsor. Release it first.', 409);
      await store.deleteEvent(req.params.id);
      res.json({ ok: true });
    }));

    // A spreadsheet of every sponsorship, for records and thank-you notes.
    const cell = (v) => { let s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
    r.get('/api/kiddush/export.csv', authed, guard(async (req, res) => {
      need();
      const all = await store.allSponsorships();
      const lines = [['Date', 'Week', 'Status', 'Sponsor', 'Anonymous', 'Dedication', 'Amount', 'Method', 'Email', 'Phone', 'Note to Rabbi', 'Entered by', 'Paid on', 'Reserved on'].map(cell).join(',')];
      for (const sp of all) {
        const slot = await findSlot(sp.slot_key, { allowHidden: true });
        lines.push([slot ? slot.date : sp.slot_key.slice(0, 10), slot ? slot.title : sp.slot_key, sp.status, sp.name, sp.anonymous ? 'yes' : '', dedicationText(sp.dedication_kind, sp.dedication),
          (sp.amount_cents / 100).toFixed(2), sp.method, sp.email, sp.phone, sp.note, sp.source, sp.paid_at ? new Date(sp.paid_at).toISOString().slice(0, 10) : '', new Date(sp.created_at).toISOString().slice(0, 10)].map(cell).join(','));
      }
      res.type('text/csv').set('Content-Disposition', 'attachment; filename="kiddush-sponsorships.csv"').send(lines.join('\r\n') + '\r\n');
    }));
  }

  return { board, sponsor, confirm, cancel, onStripeEvent, mountPublic, mountAdmin, HttpError };
}

module.exports = { createKiddush, KINDS, DEFAULTS };
