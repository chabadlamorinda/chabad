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
  priceShabbat: 500, priceHoliday: 720, priceBoard: 5000,
  standardNote: 'Standard Kiddush for 25 people', standardNoteHe: 'קידוש רגיל ל-25 איש',
  cardOn: true, coverFee: true,
  zelleOn: true, zelleId: 'chabadlamorinda@gmail.com', zelleName: 'Chabad of Lamorinda',
  venmoOn: true, venmoHandle: 'CHABAD-LAMORINDA',
  checkOn: true, checkPayable: 'Chabad of Lamorinda', checkAddress: '3477 Golden Gate Way, Lafayette, CA 94549',
  cashOn: true,
  contactEmail: 'rabbi@chabadoflamorinda.com', contactPhone: '925-384-7242',
  publicUrl: '',
  blessing: 'May He who blessed our fathers, Abraham, Isaac, and Jacob, bless those who provide wine for Kiddush... May the Holy One blessed be He, give them their reward, heal their entire body, pardon all their sins, and send blessings and success to all their endeavours.',
  blessingHe: 'מִי שֶׁבֵּרַךְ אֲבוֹתֵינוּ אַבְרָהָם יִצְחָק וְיַעֲקֹב, הוּא יְבָרֵךְ אֶת כָּל הַנּוֹתְנִים יַיִן לְקִדּוּשׁ... הַקָּדוֹשׁ בָּרוּךְ הוּא יְשַׁלֵּם שְׂכָרָם, וְיָסִיר מֵהֶם כָּל מַחֲלָה, וִירַפֵּא לְכָל גּוּפָם, וְיִמְחַל לְכָל עֲוֹנוֹתֵיהֶם, וְיִשְׁלַח בְּרָכָה וְהַצְלָחָה בְּכָל מַעֲשֵׂה יְדֵיהֶם.',
  donorEn: '', donorHe: '',
  includePurim: true, autoReminders: true, reminderDays: 3,
  boardYear: 0, // 0 = automatic: the year of the next upcoming Kiddush, so the board flips at Rosh Hashanah by itself
};
const FIELD = { // type of each setting, for validation
  orgName: ['s', 80], standardNote: ['s', 120], standardNoteHe: ['s', 120], blessingHe: ['s', 700], priceShabbat: ['n'], priceHoliday: ['n'], priceBoard: ['n'], cardOn: ['b'], coverFee: ['b'], zelleOn: ['b'], zelleId: ['s', 120], zelleName: ['s', 80],
  venmoOn: ['b'], venmoHandle: ['s', 60], checkOn: ['b'], checkPayable: ['s', 80], checkAddress: ['s', 200], cashOn: ['b'], contactEmail: ['s', 120], contactPhone: ['s', 30],
  publicUrl: ['u'], blessing: ['s', 600], donorEn: ['s', 120], donorHe: ['s', 120], includePurim: ['b'], boardYear: ['y'], autoReminders: ['b'], reminderDays: ['d'],
};

class HttpError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const validEmail = (e) => /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(e) && e.length <= 254;
const dedicationText = (kind, text) => (text ? (KINDS[kind] ? KINDS[kind] + ' ' : '') + text : '');

const MAX_REMINDERS = 3;

function createKiddush({ store, stripe, log = console, now = () => new Date(), mailer = null }) {
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
    // The year-long "sponsor the Kiddush board" offer: one per year, always open until someone takes it.
    const first = slots[0] || { date: hy + '-01-01', dow: 0 };
    const rank = (k) => (k === 'board' ? 0 : k === 'custom' ? 2 : 1);
    slots = slots.concat(extra, [{ key: first.date + '|board', kind: 'board', title: 'Kiddush Board Sponsor – ' + hy, titleHe: 'חסות על לוח הקידוש ' + (await cal.yearHe(hy)), note: '', date: first.date, dow: first.dow, dateLabel: 'Entire year', heb: '', hebHe: '', year: hy }])
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : rank(a.kind) - rank(b.kind)));
    return slots.map((s) => {
      const o = overrides.get(s.key) || {};
      const priceCents = o.priceCents != null ? o.priceCents : cents(s.kind === 'shabbat' ? st.priceShabbat : s.kind === 'board' ? st.priceBoard : st.priceHoliday);
      return { ...s, title: o.title || s.title, hidden: !!o.hidden, priceCents, customTitle: !!o.title, customPrice: o.priceCents != null };
    });
  }

  const spView = (sp) => ({
    id: sp.id, status: sp.status, method: sp.method, name: sp.name, anonymous: sp.anonymous, dedicationKind: sp.dedication_kind, dedication: sp.dedication,
    email: sp.email, phone: sp.phone, note: sp.note, amountCents: sp.amount_cents, feeCents: sp.fee_cents, source: sp.source, paidAt: sp.paid_at, createdAt: sp.created_at, remindedAt: sp.reminded_at, reminderCount: sp.reminder_count || 0, remindAt: sp.remind_at || null, remindersOff: !!sp.reminders_off,
  });
  // Only CONFIRMED (paid) sponsorships ever appear on the TV or the phone page. Card payments confirm themselves through
  // Stripe; Zelle, Venmo, check and cash appear once the Rabbi marks them paid.
  const publicSponsor = (sp) => (sp && sp.status === 'paid'
    ? { name: sp.anonymous ? 'Anonymous' : sp.name, dedication: dedicationText(sp.dedication_kind, sp.dedication), kind: sp.dedication_kind || '', reason: sp.dedication || '' } : null);

  /** The board for one Hebrew year. `admin` adds hidden weeks and private donor details. */
  async function board({ year, admin = false, exact = false } = {}) {
    const st = await settings();
    const { today } = await todayInfo();
    const [overrides, events, live, notes] = store ? await Promise.all([store.slotOverrides(), store.listEvents(), store.liveSponsorships(), store.listNotes()]) : [new Map(), [], [], []];
    const byKey = new Map(); // slot key -> every live sponsorship of that week, oldest first
    for (const sp of live) { if (!byKey.has(sp.slot_key)) byKey.set(sp.slot_key, []); byKey.get(sp.slot_key).push(sp); }
    let y, all, next;
    if (exact && Number.isInteger(year) && year > 5700 && year < 6000) { y = year; all = await slotsForYear(y, st, overrides, events); }
    else if (st.boardYear) { y = st.boardYear; all = await slotsForYear(y, st, overrides, events); }
    else { // automatic: the year containing the next upcoming week
      const { hy } = await todayInfo();
      const [a, b] = await Promise.all([slotsForYear(hy, st, overrides, events), slotsForYear(hy + 1, st, overrides, events)]);
      const nx = a.concat(b).find((s) => !s.hidden && s.kind !== 'board' && s.date >= today);
      y = nx ? nx.year : hy; all = y === hy ? a : b;
    }
    next = all.find((s) => !s.hidden && s.kind !== 'board' && s.date >= today);
    // A calendar note (yahrzeit, event...) is shown with the Shabbat of its week, or else the next day of the board within 6 days after it.
    const notesBySlot = new Map(), dayNum = (d) => Math.round(Date.parse(d + 'T12:00:00Z') / 864e5);
    for (const n of notes) {
      const cands = all.filter((s) => s.kind !== 'board' && !s.hidden && dayNum(s.date) >= dayNum(n.date) && dayNum(s.date) - dayNum(n.date) <= 6);
      const slot = cands.find((s) => s.kind === 'shabbat') || cands[0];
      if (!slot) continue;
      if (!notesBySlot.has(slot.key)) notesBySlot.set(slot.key, []);
      notesBySlot.get(slot.key).push({ id: n.id, kind: n.kind, text: n.text, textHe: n.text_he, date: n.date });
    }
    const noteDates = new Map();
    for (const list of notesBySlot.values()) for (const n of list) if (!noteDates.has(n.date)) noteDates.set(n.date, await cal.describeDate(n.date));
    const toOut = (s) => {
      const sps = byKey.get(s.key) || [];
      const shown = sps.map((sp) => publicSponsor(sp)).filter(Boolean);
      const out = {
        key: s.key, year: s.year, kind: s.kind, title: s.title, titleHe: s.titleHe, note: s.note, mevarchim: s.mevarchim || '', molad: s.molad || '', date: s.date, dow: s.dow, dateLabel: s.dateLabel, heb: s.heb, hebHe: s.hebHe,
        priceCents: s.priceCents, past: s.kind === 'board' ? false : s.date < today,
        status: sps.some((sp) => sp.status === 'paid') ? 'sponsored' : 'open',
        sponsor: shown[0] || null, sponsors: shown,
        notes: (notesBySlot.get(s.key) || []).map((n) => { const d = noteDates.get(n.date) || {}; return { id: admin ? n.id : undefined, kind: n.kind, text: n.text, textHe: n.textHe, date: n.date, dateLabel: d.dateLabel, heb: d.heb, hebHe: d.hebHe }; }),
      };
      if (admin) Object.assign(out, { hidden: s.hidden, customTitle: s.customTitle, customPrice: s.customPrice, eventId: s.eventId || null, sponsorship: sps[0] ? spView(sps[0]) : null, sponsorships: sps.map(spView) });
      return out;
    };
    const slots = all.filter((s) => admin || (!s.hidden && s.kind !== 'board')).map(toOut);
    const bs = all.find((s) => s.kind === 'board' && !s.hidden);
    const boardSponsor = bs ? toOut(bs) : null;
    const upcoming = [];
    for (const n of notes) if (n.date >= today && upcoming.length < 8) { const d = await cal.describeDate(n.date); upcoming.push({ kind: n.kind, text: n.text, textHe: n.text_he, date: n.date, dateLabel: d.dateLabel, heb: d.heb, hebHe: d.hebHe }); }
    return {
      events: upcoming, today, year: y, yearHe: await cal.yearHe(y), current: next ? next.key : null, years: [y], slots, boardSponsor,
      sponsoring: true, recorded: !!store, settings: publicSettings(st),
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
      orgName: st.orgName, standardNote: st.standardNote, standardNoteHe: st.standardNoteHe, blessingHe: st.blessingHe, ways: waysOf(st), coverFee: st.coverFee, feeRate: FEE_RATE,
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
    const memo = slot.kind === 'board' ? slot.title : 'Kiddush ' + slot.title + ' ' + slot.dateLabel;
    const dollars = (amountCents / 100).toFixed(2).replace(/\.00$/, '');
    if (method === 'zelle') return { zelleId: st.zelleId, zelleName: st.zelleName, memo, amount: dollars };
    if (method === 'venmo') { const h = st.venmoHandle.replace(/^@/, ''); return { venmoHandle: h, memo, amount: dollars, link: 'https://venmo.com/' + encodeURIComponent(h) + '?txn=pay&amount=' + dollars + '&note=' + encodeURIComponent(memo) }; }
    if (method === 'check') return { payable: st.checkPayable, address: st.checkAddress, memo, amount: dollars };
    return { memo, amount: dollars };
  };

  // Until the database is connected nothing can be saved here: card gifts still go through Stripe (the sponsor's
  // details ride along in the payment record) and the other methods get their instructions plus a note to email.
  async function sponsorUnrecorded(req, body, st, f) {
    const slot = await findSlot(body.slot);
    if (!slot) throw new HttpError(404, 'no_slot', 'That week could not be found.');
    if (f.amount < slot.priceCents) throw new HttpError(400, 'amount_too_low', 'The minimum for this Kiddush is $' + (slot.priceCents / 100) + '.');
    const display = { name: f.anonymous ? 'Anonymous' : f.name, dedication: dedicationText(f.kind, f.dedication), kind: f.kind || '', reason: f.dedication || '' };
    if (f.method !== 'card') return { ok: true, recorded: false, status: 'pending', method: f.method, slot: slotBrief(slot), display, amountCents: f.amount, instructions: instructionsFor(f.method, st, slot, f.amount), contact: contactOf(st) };
    const fee = f.fee ? Math.round(f.amount * FEE_RATE) : 0, title = slot.kind === 'board' ? slot.title : 'Kiddush sponsorship: ' + slot.title + ', ' + slot.dateLabel, base = baseUrl(req, st);
    const session = await stripe.checkout.sessions.create({
      mode: 'payment', locale: body.lang === 'he' ? 'he' : 'auto',
      line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: f.amount + fee, product_data: { name: title, description: [slot.kind === 'board' ? 'Sponsor of the Kiddush board for the year' : st.standardNote, display.dedication].filter(Boolean).join(' · ') } } }],
      customer_email: f.email,
      payment_intent_data: { description: title, receipt_email: f.email, metadata: { source: 'kiddush', sponsorship: 'unrecorded', slot: slot.key } },
      metadata: { source: 'kiddush', sponsorship: 'unrecorded', slot: slot.key, sponsor: f.name, anonymous: f.anonymous ? 'yes' : 'no', dedication_kind: f.kind, dedication: f.dedication, phone: f.phone, note: f.note, amount_cents: String(f.amount), fee_covered: fee ? 'yes' : 'no' },
      success_url: base + '/kiddush/?paid=unrecorded&session_id={CHECKOUT_SESSION_ID}',
      cancel_url: base + '/kiddush/?cancelled=unrecorded',
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
    }, { idempotencyKey: 'kiddush-unrec-' + f.idem });
    return { ok: true, recorded: false, status: 'pending', method: 'card', url: session.url };
  }

  async function sponsor(req, body) {
    const st = await settings();
    const f = readForm(body || {}, st);
    if (!store) return sponsorUnrecorded(req, body || {}, st, f);
    const dup = await store.sponsorshipByIdem(f.idem);
    if (dup) return resumeResponse(dup, st);
    const slot = await findSlot(body.slot);
    if (!slot) throw new HttpError(404, 'no_slot', 'That week could not be found.');
    if (f.amount < slot.priceCents) throw new HttpError(400, 'amount_too_low', 'The minimum for this Kiddush is $' + (slot.priceCents / 100) + '.');
    if (await store.pendingCountForEmail(f.email) >= 4) throw new HttpError(429, 'too_many', 'You already have several reservations waiting. Please complete or contact us first.');
    const fee = f.fee ? Math.round(f.amount * FEE_RATE) : 0;
    const id = await store.createSponsorship({
      slotKey: slot.key, status: 'pending', method: f.method, name: f.name, anonymous: f.anonymous, dedicationKind: f.kind, dedication: f.dedication,
      email: f.email, phone: f.phone, note: f.note, amountCents: f.amount, feeCents: fee, source: 'online', idem: f.idem,
    });
    const sp = await store.getSponsorship(id);
    if (f.method !== 'card') return { ok: true, id, status: 'pending', method: f.method, slot: slotBrief(slot), display: sponsorBrief(sp), amountCents: f.amount, instructions: instructionsFor(f.method, st, slot, f.amount), contact: contactOf(st) };
    try {
      const base = baseUrl(req, st);
      const title = slot.kind === 'board' ? slot.title : 'Kiddush sponsorship: ' + slot.title + ', ' + slot.dateLabel;
      const session = await stripe.checkout.sessions.create({
        mode: 'payment', locale: body && body.lang === 'he' ? 'he' : 'auto',
        line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: f.amount + fee, product_data: { name: title, description: [slot.kind === 'board' ? 'Sponsor of the Kiddush board for the year' : st.standardNote, dedicationText(sp.dedication_kind, sp.dedication)].filter(Boolean).join(' · ') } } }],
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
  const slotBrief = (s) => ({ kind: s.kind, key: s.key, title: s.title, titleHe: s.titleHe || '', dateLabel: s.dateLabel, heb: s.heb, hebHe: s.hebHe || '', date: s.date });
  const sponsorBrief = (sp) => ({ name: sp.anonymous ? 'Anonymous' : sp.name, dedication: dedicationText(sp.dedication_kind, sp.dedication), kind: sp.dedication_kind || '', reason: sp.dedication || '' });
  const contactOf = (st) => ({ email: st.contactEmail, phone: st.contactPhone });
  async function resumeResponse(sp, st) { // the same request sent twice (double tap, retry): answer again, never double-book
    const slot = await findSlot(sp.slot_key, { allowHidden: true });
    if (sp.method === 'card') return { ok: true, id: sp.id, status: sp.status, method: 'card', url: null, duplicate: true };
    return { ok: true, id: sp.id, status: sp.status, method: sp.method, slot: slot ? slotBrief(slot) : null, display: sponsorBrief(sp), instructions: slot ? instructionsFor(sp.method, st, slot, sp.amount_cents) : {}, contact: contactOf(st), duplicate: true };
  }

  /** The donor lands back from Stripe Checkout. Verifies with Stripe itself, so it works even without the webhook. */
  async function confirm(id, sessionId) {
    if (!store) { // card gift made before the database was connected: read it back from Stripe
      if (id !== 'unrecorded' || !sessionId || !stripe) throw new HttpError(404, 'not_found', 'We could not find that sponsorship.');
      let session; try { session = await stripe.checkout.sessions.retrieve(sessionId); } catch (e) { session = null; }
      const m = (session && session.metadata) || {};
      if (m.source !== 'kiddush' || m.sponsorship !== 'unrecorded') throw new HttpError(404, 'not_found', 'We could not find that sponsorship.');
      const slot = await findSlot(m.slot, { allowHidden: true });
      return { status: session.payment_status === 'paid' ? 'paid' : session.status === 'expired' ? 'expired' : 'pending', recorded: false, slot: slot ? slotBrief(slot) : null,
        display: { name: m.anonymous === 'yes' ? 'Anonymous' : m.sponsor, dedication: dedicationText(m.dedication_kind, m.dedication), kind: m.dedication_kind || '', reason: m.dedication || '' }, amountCents: Number(m.amount_cents) || 0 };
    }
    const sp = typeof id === 'string' ? await store.getSponsorship(id) : null;
    if (!sp || sp.method !== 'card' || !sessionId || sp.stripe_session_id !== sessionId) throw new HttpError(404, 'not_found', 'We could not find that sponsorship.');
    const slot = await findSlot(sp.slot_key, { allowHidden: true });
    const brief = { slot: slot ? slotBrief(slot) : null, display: sponsorBrief(sp), amountCents: sp.amount_cents };
    if (sp.status === 'paid') return { status: 'paid', ...brief };
    if (!stripe) throw new HttpError(503, 'not_configured', 'Card payments are not set up.');
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.metadata && session.metadata.sponsorship !== sp.id) throw new HttpError(404, 'not_found', 'We could not find that sponsorship.');
    if (session.payment_status === 'paid') {
      const done = await store.markPaid(sp.id, { paymentIntent: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent && session.payment_intent.id });
      return { status: 'paid', ...brief };
    }
    return { status: session.status === 'expired' ? 'expired' : sp.status, ...brief };
  }

  async function cancel(id) {
    if (!store) return { ok: true };
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
        await store.markPaid(o.metadata.sponsorship, { paymentIntent: typeof o.payment_intent === 'string' ? o.payment_intent : undefined });
      }
    } else if (event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed') {
      await store.releaseSponsorship(o.metadata.sponsorship, 'expired', true);
    }
    return true;
  }

  // ---------- payment reminders and confirmations (email when configured, otherwise a prefilled email for the Rabbi) ----------
  const dollars = (c) => '$' + (c / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
  async function messageFor(kind, sp, st) {
    const slot = await findSlot(sp.slot_key, { allowHidden: true });
    const what = slot ? slot.title + (slot.kind === 'board' ? '' : ' (' + slot.dateLabel + ')') : 'a Kiddush', I = slot ? instructionsFor(sp.method, st, slot, sp.amount_cents) : {};
    const sign = ['', 'With thanks,', st.orgName, [st.contactPhone, st.contactEmail].filter(Boolean).join(' · ')].filter((x, i) => i === 0 || x).join('\n');
    if (kind === 'confirmed') return { subject: 'Your Kiddush sponsorship is confirmed', body: ['Hello ' + sp.name + ',', '', 'Thank you! We have received your payment of ' + dollars(sp.amount_cents) + ' and your sponsorship of ' + what + ' is confirmed. It now appears on our Kiddush board.', '', 'May you be blessed with health, happiness and success!', sign].join('\n') };
    const how = sp.method === 'zelle' ? 'Zelle to ' + I.zelleId + (I.zelleName ? ' (' + I.zelleName + ')' : '') + ', with the memo "' + I.memo + '"'
      : sp.method === 'venmo' ? 'Venmo to @' + I.venmoHandle + ', with the note "' + I.memo + '" (' + I.link + ')'
      : sp.method === 'check' ? 'a check payable to ' + I.payable + ', mailed or brought to ' + I.address + ', with the memo "' + I.memo + '"'
      : 'cash, brought to shul' + (st.contactPhone ? ' (or call ' + st.contactPhone + ' to arrange another way to give)' : '');
    return { subject: 'Reminder: payment for your Kiddush sponsorship', body: ['Hello ' + sp.name + ',', '', 'Thank you for sponsoring ' + what + '. We have not yet received your payment of ' + dollars(sp.amount_cents) + '.', '', 'Please send it by ' + how + '.', '', 'Your sponsorship will appear on the Kiddush board as soon as we confirm your payment. If you have already sent it, thank you, and please let us know.', sign].join('\n') };
  }
  async function trySend(sp, msg) {
    if (!mailer || !sp.email) return false;
    try { await mailer.send({ to: sp.email, subject: msg.subject, text: msg.body }); return true; } catch (e) { log.error('kiddush email failed:', e && e.message); return false; }
  }
  /** Unpaid Zelle/Venmo/check/cash pledges: remind the sponsor by email after `reminderDays` (3 by default), then every few days, up to 3 times. */
  async function runReminders() {
    if (!store || !mailer) return 0;
    const st = await settings();
    let n = 0; // reminders you scheduled go out even when automatic ones are off
    for (const sp of await store.dueReminders({ days: st.reminderDays, max: MAX_REMINDERS, auto: !!st.autoReminders })) {
      if (await trySend(sp, await messageFor('reminder', sp, st))) { await store.markReminded(sp.id); n++; }
    }
    return n;
  }
  function startReminders() {
    if (!store || !mailer) return;
    const tick = () => runReminders().catch((e) => log.error('kiddush reminder run failed:', e && e.message));
    setTimeout(tick, 60e3).unref(); setInterval(tick, 3600e3).unref();
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
    r.post('/sponsor', limit('kiddush-sponsor', 120, 10 * 60 * 1000), wrap(async (req, res) => { res.json(await sponsor(req, req.body)); }));
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
      await store.updateSponsorship(sp.id, f);
      if ('remindAt' in b || 'remindersOff' in b) {
        let remindAt;
        if ('remindAt' in b) { if (b.remindAt === null || b.remindAt === '') remindAt = null; else { const t = Date.parse(b.remindAt); if (Number.isNaN(t)) bad('invalid', 'Please choose a date and time for the reminder.'); remindAt = new Date(t).toISOString(); } }
        await store.setReminder(sp.id, { remindAt, off: 'remindersOff' in b ? b.remindersOff === true : undefined });
      }
      let emailed = false;
      if (f.status === 'paid' && sp.status !== 'paid') { const fresh = await store.getSponsorship(sp.id); emailed = await trySend(fresh, await messageFor('confirmed', fresh, await settings())); }
      res.json({ ok: true, emailed });
    }));

    // Remind a sponsor to pay: emails them when email is set up, always records it, and returns the text so the page can open a prefilled email otherwise.
    r.post('/api/kiddush/sponsorship/:id/remind', authed, guard(async (req, res) => {
      need();
      const sp = await store.getSponsorship(req.params.id);
      if (!sp || sp.status !== 'pending' || sp.method === 'card') bad('not_pending', 'There is nothing waiting for payment here.');
      const msg = await messageFor('reminder', sp, await settings()), sent = await trySend(sp, msg);
      await store.markReminded(sp.id);
      res.json({ ok: true, sent, to: sp.email, subject: msg.subject, body: msg.body });
    }));

    r.post('/api/kiddush/sponsorship/:id/release', authed, guard(async (req, res) => {
      need();
      const sp = await store.getSponsorship(req.params.id);
      if (!sp) bad('not_found', 'Not found.', 404);
      await store.releaseSponsorship(sp.id, 'released');
      if (stripe && sp.status === 'pending' && sp.method === 'card' && sp.stripe_session_id) { try { await stripe.checkout.sessions.expire(sp.stripe_session_id); } catch (e) { /* already closed */ } }
      res.json({ ok: true });
    }));

    r.get('/api/kiddush/settings', authed, guard(async (req, res) => { need(); res.json({ settings: await settings(), defaults: DEFAULTS, cardAvailable: !!stripe, emailAvailable: !!mailer }); }));
    r.put('/api/kiddush/settings', authed, guard(async (req, res) => {
      need();
      const b = req.body || {}, out = {};
      for (const [k, t] of Object.entries(FIELD)) {
        if (!(k in b)) continue;
        const v = b[k];
        if (t[0] === 'b') out[k] = v === true;
        else if (t[0] === 'n') { const n = Number(v); if (!Number.isFinite(n) || n < 1 || n > 10000) bad('invalid', 'Prices must be between $1 and $10,000.'); out[k] = Math.round(n * 100) / 100; }
        else if (t[0] === 'd') { const n = Number(v); if (!Number.isInteger(n) || n < 1 || n > 30) bad('invalid', 'Reminder days must be a whole number from 1 to 30.'); out[k] = n; }
        else if (t[0] === 'y') { const n = Number(v); if (!Number.isInteger(n) || (n && (n < 5700 || n > 5900))) bad('invalid', 'Leave this at 0 for automatic, or enter a Hebrew year such as 5787.'); out[k] = n; }
        else if (t[0] === 'u') { const u = String(v || '').trim().replace(/\/+$/, ''); if (u && !/^https:\/\/[A-Za-z0-9.-]+(:\d+)?$/.test(u)) bad('invalid', 'The public web address must look like https://kiddush.example.org'); out[k] = u; }
        else out[k] = clean(v, t[1]);
      }
      await store.saveSettings(out);
      res.json({ ok: true, settings: await settings() });
    }));

    const NOTE_KINDS = ['yahrzeit', 'event', 'note'];
    r.get('/api/kiddush/notes', authed, guard(async (req, res) => {
      need();
      const out = [];
      for (const n of await store.listNotes()) out.push({ id: n.id, kind: n.kind, text: n.text, textHe: n.text_he, date: n.date, ...(await cal.describeDate(n.date)) });
      res.json({ notes: out });
    }));
    const noteFields = (b) => {
      const date = String(b.date || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) bad('invalid', 'Please choose a date.');
      const text = clean(b.text, 140);
      if (!text) bad('invalid', 'Please write what to show on the board.');
      return { date, kind: NOTE_KINDS.includes(b.kind) ? b.kind : 'note', text, textHe: clean(b.textHe, 140) };
    };
    r.post('/api/kiddush/notes', authed, guard(async (req, res) => { need(); res.json({ ok: true, id: await store.addNote(noteFields(req.body || {})) }); }));
    r.put('/api/kiddush/notes/:id', authed, guard(async (req, res) => {
      need();
      if (!(await store.updateNote(req.params.id, noteFields(req.body || {})))) bad('not_found', 'Not found.', 404);
      res.json({ ok: true });
    }));
    r.delete('/api/kiddush/notes/:id', authed, guard(async (req, res) => { need(); await store.deleteNote(req.params.id); res.json({ ok: true }); }));

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

  return { board, sponsor, confirm, cancel, onStripeEvent, mountPublic, mountAdmin, runReminders, startReminders, HttpError };
}

module.exports = { createKiddush, KINDS, DEFAULTS };
