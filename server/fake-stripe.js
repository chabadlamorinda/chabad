// In-memory fake of the Stripe API surface used by server/index.js. For tests only.
'use strict';
function fakeStripe() {
  const st = { customers: {}, pms: {}, pis: {}, subs: {}, products: {}, seq: 0, idem: {}, calls: [], failNext: null };
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
    },
    products: {
      retrieve: async (i) => { if (!st.products[i]) { const e = new Error('no'); e.code = 'resource_missing'; throw e; } return st.products[i]; },
      create: async (p) => { st.products[p.id] = p; return p; },
    },
    subscriptions: {
      create: async (p, o) => { st.calls.push(['subscriptions.create', p, o]);
        return withIdem(o && o.idempotencyKey, () => { const sub = { id: id('sub'), status: 'active', customer: p.customer, metadata: p.metadata, items: { data: [{ price: { unit_amount: p.items[0].price_data.unit_amount }, current_period_end: 1893456000 }] }, latest_invoice: { hosted_invoice_url: 'https://invoice.stripe.com/i/test' } }; st.subs[sub.id] = sub; return sub; }); },
      list: async ({ customer }) => ({ data: Object.values(st.subs).filter((x) => x.customer === customer && x.status === 'active') }),
      retrieve: async (i) => st.subs[i],
      cancel: async (i) => { st.subs[i].status = 'canceled'; return st.subs[i]; },
    },
  };
  s.addCard = (customer) => { const m = { id: id('pm'), customer, card: { brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2030 } }; st.pms[m.id] = m; return m; };
  return s;
}


module.exports = { fakeStripe };
