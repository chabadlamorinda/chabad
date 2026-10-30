// In-memory fake of the Stripe API surface used by server/index.js. For tests only.
'use strict';
const Stripe = require('stripe');
// Stripe search, just enough for the campaign totals: metadata['key']:'value' and status:'value', joined by AND.
function matchQuery(x, query) {
  return String(query).split(' AND ').every((part) => {
    const m = /^metadata\['(\w+)'\]:'([^']*)'$/.exec(part.trim()), st = /^status:'(\w+)'$/.exec(part.trim());
    if (m) return ((x.metadata || {})[m[1]] || '') === m[2];
    if (st) return x.status === st[1];
    return false;
  });
}
function fakeStripe() {
  const st = { customers: {}, pms: {}, pis: {}, subs: {}, products: {}, sessions: {}, seq: 0, idem: {}, calls: [], failNext: null };
  const id = (p) => p + '_' + (++st.seq).toString(36).padStart(6, '0') + 'Abc';
  const withIdem = (key, fn) => { if (key && st.idem[key]) return st.idem[key]; const r = fn(); if (key) st.idem[key] = r; return r; };
  const s = {
    _st: st,
    customers: {
      create: async (p) => { const c = { id: id('cus'), ...p }; st.customers[c.id] = c; return c; },
      update: async (i, p) => Object.assign(st.customers[i], p),
      retrieve: async (i) => st.customers[i],
    },
    setupIntents: { create: async (p) => { st.calls.push(['setupIntents.create', p]); return { id: id('seti'), client_secret: 'seti_secret_x' }; } },
    paymentMethods: {
      list: async ({ customer, limit }) => ({ data: Object.values(st.pms).filter((m) => m.customer === customer).slice(0, limit || 10) }),
      detach: async (i) => { delete st.pms[i]; return {}; },
    },
    paymentIntents: {
      create: async (p, o) => { st.calls.push(['paymentIntents.create', p, o]);
        if (st.failNext) { const f = st.failNext; st.failNext = null; throw f; }
        return withIdem(o && o.idempotencyKey, () => { const pi = { id: id('pi'), status: 'succeeded', customer: p.customer, latest_charge: { receipt_url: 'https://pay.stripe.com/receipts/test' } }; st.pis[pi.id] = pi; return pi; }); },
      retrieve: async (i) => st.pis[i],
      search: async ({ query }) => ({ data: Object.values(st.pis).filter((x) => matchQuery(x, query)), has_more: false }),
    },
    products: {
      retrieve: async (i) => { if (!st.products[i]) { const e = new Error('no'); e.code = 'resource_missing'; throw e; } return st.products[i]; },
      create: async (p) => { st.products[p.id] = p; return p; },
    },
    subscriptions: {
      create: async (p, o) => { st.calls.push(['subscriptions.create', p, o]);
        return withIdem(o && o.idempotencyKey, () => { const sub = { id: id('sub'), created: 1700000000 + st.seq, status: 'active', customer: p.customer, metadata: p.metadata, items: { data: [{ price: { unit_amount: p.items[0].price_data.unit_amount }, current_period_end: 1893456000 }] }, latest_invoice: { hosted_invoice_url: 'https://invoice.stripe.com/i/test' } }; st.subs[sub.id] = sub; return sub; }); },
      list: async ({ customer, status }) => ({ data: Object.values(st.subs).filter((x) => (!customer || x.customer === customer) && x.status === (status || 'active')) }),
      retrieve: async (i) => st.subs[i],
      update: async (i, p) => Object.assign(st.subs[i], p),
      cancel: async (i) => { st.subs[i].status = 'canceled'; return st.subs[i]; },
      search: async ({ query }) => ({ data: Object.values(st.subs).filter((x) => matchQuery(x, query)), has_more: false }),
    },
  };
  st.balance = []; // balance transactions the tests add (charges with their fees, refunds, payouts)
  s.balanceTransactions = { list: async ({ created, starting_after }) => { const all = st.balance.filter((b) => !created || b.created >= created.gte), i = starting_after ? all.findIndex((b) => b.id === starting_after) + 1 : 0; return { data: all.slice(i, i + 100), has_more: all.length > i + 100 }; } };
  s.webhooks = new Stripe('sk_test_dummy').webhooks; // real signature checking
  s.checkout = { sessions: {
    create: async (p, o) => { st.calls.push(['checkout.sessions.create', p, o]);
      if (st.failNext) { const f = st.failNext; st.failNext = null; throw f; }
      return withIdem(o && o.idempotencyKey, () => { const x = { id: id('cs_test'), url: 'https://checkout.stripe.com/c/pay/test', status: 'open', payment_status: 'unpaid', payment_intent: null, metadata: p.metadata, params: p }; st.sessions[x.id] = x; return x; }); },
    retrieve: async (i) => st.sessions[i],
    expire: async (i) => { st.sessions[i].status = 'expired'; return st.sessions[i]; },
  } };
  s.payCheckout = (i) => Object.assign(st.sessions[i], { status: 'complete', payment_status: 'paid', payment_intent: 'pi_' + i }); // simulate the donor paying
  s.addCard = (customer) => { const m = { id: id('pm'), created: ++st.seq, customer, card: { brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2030 } }; st.pms[m.id] = m; return m; };
  return s;
}


module.exports = { fakeStripe };
