'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { startPg } = require('./pg-test-helper');
const { createApp } = require('./app');
const { createDb } = require('./db');
const { fakePayments } = require('./payments');
const { createClaudeExtractor, normalizeDraft } = require('./extractor');
const { processParsed } = require('./inbox');
const { syncClover, syncSales } = require('./clover');
const pricing = require('./pricing');

let pg, A, base, server, sent, adminH, cats, calls, nextDraft, cloverItems, created = 0;
const env = { ADMIN_PASSWORD: 'correct horse battery', SESSION_SECRET: 'test-secret', NODE_ENV: 'test' };
async function api(method, p, body, headers = {}) {
  const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text, headers: r.headers };
}
const admin = (m, p, b) => api(m, p, b, adminH);
const draft = (o) => ({ is_invoice: true, kind: 'goods', supplier_name: 'Kosher Wholesale', supplier_email: 'orders@kwholesale.example', invoice_no: 'INV-1', invoice_date: '2026-10-01', freight_cents: 0, subtotal_cents: 0, total_cents: 0, notes: '', lines: [], ...o });
const L = (o) => ({ upc: '', supplier_sku: '', description: '', qty: 1, unit: 'each', pack: 1, unit_cost_cents: 100, line_total_cents: 100, ...o });
const upload = (name, body = 'x'.repeat(300)) => admin('POST', '/api/admin/invoices/upload', { filename: name, content_type: 'application/pdf', data_base64: Buffer.from(body).toString('base64') });

test.before(async () => {
  pg = await startPg(); sent = { email: [] }; calls = { price: [], create: [], stock: [] };
  cloverItems = [];
  const clover = { items: async () => cloverItems, updatePrice: async (id, c) => calls.price.push([id, c]), createItem: async (p) => { calls.create.push(p.name); return 'NEWC' + (++created); }, setStock: async () => {}, sales: async () => [] };
  const extractor = { kind: 'fake', async extract() { if (nextDraft instanceof Error) throw nextDraft; return nextDraft; } };
  const notifier = { live: { email: true }, async email(to, subject, html) { sent.email.push({ to, subject, html }); return true; }, async sms() { return true; } };
  A = await createApp({ env, db: createDb(pg.url), payments: fakePayments(), notifier, extractor, clover, geocoder: { async geocode() { return { lat: 37.9, lng: -122.12 }; } } });
  server = http.createServer(A.app); await new Promise((r) => server.listen(0, r)); base = 'http://127.0.0.1:' + server.address().port;
  adminH = { 'x-staff-token': (await api('POST', '/api/staff/login', { password: env.ADMIN_PASSWORD })).json.token };
  cats = Object.fromEntries((await admin('GET', '/api/admin/categories')).json.map((c) => [c.slug, c.id]));
});
test.after(async () => { server.close(); await A.close(); await pg.stop(); });
const settle = () => new Promise((r) => setTimeout(r, 80)); // the Clover push runs in the background

let sup, jar, tahini;
test('supplier with email; products to match against', async () => {
  sup = (await admin('POST', '/api/admin/suppliers', { name: 'Kosher Wholesale', markup_pct: 30, email: 'Orders@KWholesale.example', phone: '510-555-0100' })).json;
  assert.equal(sup.email, 'orders@kwholesale.example');
  jar = (await admin('POST', '/api/admin/products', { name: 'Gefilte Fish Jar 24 oz', upc: '722776000111', supplier_id: sup.id, supplier_sku: 'KW-100', cost_cents: 300, price_cents: 399, stock: 5, category_id: cats.groceries, case_size: 12, clover_id: 'C-JAR' })).json;
  tahini = (await admin('POST', '/api/admin/products', { name: 'Pereg Tahini 16 oz', supplier_id: sup.id, cost_cents: 500, price_cents: 849, stock: 2, category_id: cats.groceries, clover_id: 'C-TAH' })).json;
  await settle();
});

let inv1;
test('invoice upload is read, matched (barcode, supplier item #, similar name, new) and queued for review, once', async () => {
  nextDraft = draft({ freight_cents: 6000, subtotal_cents: 0, lines: [
    L({ upc: '722776000111', description: 'GEFILTE JAR 24OZ', qty: 5, unit: 'case', pack: 12, unit_cost_cents: 4200, line_total_cents: 21000 }), // $42/case of 12 = $3.50 each (was $3.00)
    L({ supplier_sku: 'KW-NEW-1', description: 'Pereg Tahini 16oz', qty: 2, unit: 'case', pack: 6, unit_cost_cents: 3000, line_total_cents: 6000 }), // similar name, no barcode
    L({ upc: '722776000999', supplier_sku: 'KW-900', description: 'Brand New Cookies', qty: 10, unit: 'each', pack: 1, unit_cost_cents: 250, line_total_cents: 2500 })] });
  const up = await upload('inv-1.pdf', 'pdf-bytes-one'.padEnd(400, '.')); assert.equal(up.json.status, 'review'); inv1 = up.json.invoice_id;
  assert.equal((await upload('inv-1.pdf', 'pdf-bytes-one'.padEnd(400, '.'))).json.duplicate, true); // the same file twice is not read twice
  const got = (await admin('GET', `/api/admin/invoices/${inv1}`)).json;
  assert.equal(got.invoice.supplier_id, sup.id); // supplier recognised from name/email
  const [a, b, c] = got.invoice.draft.lines;
  assert.equal(a.state, 'matched'); assert.equal(a.matched_by, 'barcode'); assert.equal(a.change_pct, 16.7); // $3.00 -> $3.50
  assert.equal(b.state, 'suggested'); assert.equal(b.suggested_product_id, tahini.id);
  assert.equal(c.state, 'new'); assert.equal(c.create_new, true);
  assert.equal((await admin('GET', '/api/admin/invoices?status=review')).json.length, 1);
  assert.equal((await admin('GET', '/api/admin/dashboard')).json.invoices_to_review, 1);
  const doc = got.invoice.draft.doc_hash; const d = await fetch(base + '/api/admin/documents/' + doc, { headers: adminH }); assert.equal(d.status, 200); assert.equal(d.headers.get('content-type'), 'application/pdf'); // original stays viewable
  assert.equal((await fetch(base + '/api/admin/documents/' + doc)).status, 401);
  assert.equal((await api('GET', '/api/admin/invoices')).status, 401);
});

test('review: pick the right product for a suggestion, then apply: cost, stock, new item, price PROPOSALS (not silent changes)', async () => {
  const inv = (await admin('GET', `/api/admin/invoices/${inv1}`)).json.invoice;
  const lines = inv.draft.lines.map((l) => (l.state === 'suggested' ? { ...l, product_id: l.suggested_product_id } : l));
  await admin('PUT', `/api/admin/invoices/${inv1}`, { lines });
  const pre = (await admin('GET', `/api/admin/invoices/${inv1}`)).json.preview; // preview includes the freight spread over the lines
  assert.ok(pre.lines[0].landed_cost_cents > pre.lines[0].unit_cost_cents);
  const before = (await admin('GET', '/api/admin/products/' + jar.id)).json;
  const r = await admin('POST', `/api/admin/invoices/${inv1}/apply`, {}); assert.equal(r.status, 200, r.text);
  assert.equal(r.json.created_product_ids.length, 1); assert.equal(r.json.proposals, 2);
  const after = (await admin('GET', '/api/admin/products/' + jar.id)).json;
  assert.equal(Number(after.stock), Number(before.stock) + 60); // 5 cases x 12
  assert.ok(Number(after.cost_cents) > 415 && Number(after.cost_cents) < 430, after.cost_cents); // $3.50 each plus its share of the $60 freight (spread by value over all lines): about $4.21
  assert.equal(after.price_cents, 399); // price did NOT change by itself
  const t = (await admin('GET', '/api/admin/products/' + tahini.id)).json; assert.equal(t.supplier_sku, 'KW-NEW-1'); assert.equal(Number(t.stock), 14); // remembered the supplier's item number
  const props = (await admin('GET', '/api/admin/price-proposals')).json; const pj = props.find((p) => p.product_id === jar.id);
  assert.equal(pj.old_price_cents, 399); assert.equal(pj.new_price_cents, pricing.suggestPrice(Number(after.cost_cents), 30)); assert.ok(pj.cost_change_pct > 15); assert.match(pj.reason, /Cost up/);
  const hidden = (await admin('GET', '/api/admin/products?filter=hidden')).json.items.find((p) => p.name === 'Brand New Cookies'); assert.ok(hidden && hidden.active === false && hidden.supplier_sku === 'KW-900'); // new items wait for review
  assert.equal((await admin('GET', `/api/admin/invoices/${inv1}`)).json.invoice.status, 'applied');
  assert.equal((await admin('POST', `/api/admin/invoices/${inv1}/apply`, {})).status, 409); // cannot apply twice
  // future invoices now find these items by the supplier's own number
  nextDraft = draft({ invoice_no: 'INV-2', lines: [L({ supplier_sku: 'KW-100', description: 'something else entirely', qty: 1, unit_cost_cents: 340 })] });
  const second = (await upload('inv-2.pdf', 'second-pdf'.padEnd(400, '-'))).json;
  assert.equal((await admin('GET', `/api/admin/invoices/${second.invoice_id}`)).json.invoice.draft.lines[0].matched_by, 'supplier item #');
  await admin('POST', `/api/admin/invoices/${second.invoice_id}/ignore`);
});

test('approving a price change updates the website price and pushes it to Clover; dismissing leaves it alone', async () => {
  const props = (await admin('GET', '/api/admin/price-proposals')).json; const pj = props.find((p) => p.product_id === jar.id), pt = props.find((p) => p.product_id === tahini.id);
  calls.price.length = 0;
  assert.equal((await admin('POST', `/api/admin/price-proposals/${pj.id}/approve`)).status, 200); await settle();
  assert.equal((await api('GET', '/api/products/' + jar.id)).json.price_cents, pj.new_price_cents); // live on the site immediately
  assert.deepEqual(calls.price, [['C-JAR', pj.new_price_cents]]); // and at the register
  assert.equal((await admin('POST', `/api/admin/price-proposals/${pj.id}/approve`)).status, 409);
  await admin('POST', `/api/admin/price-proposals/${pt.id}/dismiss`);
  assert.equal((await admin('GET', '/api/admin/products/' + tahini.id)).json.price_cents, 849);
  assert.equal((await admin('GET', '/api/admin/price-proposals')).json.length, 0);
  assert.equal((await admin('GET', '/api/admin/price-proposals?status=approved')).json[0].decided_by, 'Owner');
});

test('editing or activating a product pushes it to Clover; new items are created there with their barcode', async () => {
  calls.price.length = 0; calls.create.length = 0;
  const hidden = (await admin('GET', '/api/admin/products?filter=hidden')).json.items.find((p) => p.name === 'Brand New Cookies');
  await admin('PUT', '/api/admin/products/' + hidden.id, { active: true, price_cents: 349, category_id: cats.groceries }); await settle();
  assert.deepEqual(calls.create, ['Brand New Cookies']); assert.match((await admin('GET', '/api/admin/products/' + hidden.id)).json.clover_id, /^NEWC\d+$/);
  await admin('PUT', '/api/admin/products/' + tahini.id, { price_cents: 899 }); await settle(); assert.deepEqual(calls.price, [['C-TAH', 899]]);
  await admin('PUT', '/api/admin/products/' + tahini.id, { description: 'no price change' }); await settle(); assert.equal(calls.price.length, 1); // unrelated edits do not call Clover
  assert.equal((await admin('POST', '/api/admin/clover/push-all')).json.queued >= 3, true);
});

test('auto-approve small changes; locked prices never get proposals', async () => {
  await A.settings.set('pricing', { auto_approve_pct: 5 });
  const p = (await admin('POST', '/api/admin/products', { name: 'Auto Item', upc: '722776000500', supplier_id: sup.id, cost_cents: 300, price_cents: 399, stock: 1, category_id: cats.groceries })).json;
  const lk = (await admin('POST', '/api/admin/products', { name: 'Locked Item', upc: '722776000501', supplier_id: sup.id, cost_cents: 300, price_cents: 399, price_locked: true, stock: 1, category_id: cats.groceries })).json;
  nextDraft = draft({ invoice_no: 'INV-3', lines: [L({ upc: '722776000500', description: 'a', unit_cost_cents: 310 }), L({ upc: '722776000501', description: 'b', unit_cost_cents: 400 })] });
  const id = (await upload('inv-3.pdf', 'third'.padEnd(400, '_'))).json.invoice_id;
  const r = (await admin('POST', `/api/admin/invoices/${id}/apply`, {})).json;
  assert.equal(r.proposals, 1); assert.equal(r.proposals_auto_approved, 1); // cost 3.00 -> 3.10: $3.99 -> $4.09 is 2.5%, under the 5% auto-approve limit
  assert.equal((await admin('GET', '/api/admin/products/' + p.id)).json.price_cents, 409);
  assert.equal((await admin('GET', '/api/admin/products/' + lk.id)).json.price_cents, 399); // locked: untouched, no proposal
  await A.settings.set('pricing', { auto_approve_pct: 0 });
});

test('freight, pallet and truck bills are spread over the goods they carried and propose new prices', async () => {
  const g = (await admin('POST', '/api/admin/products', { name: 'Pallet Item A', upc: '722776000600', supplier_id: sup.id, cost_cents: 100, price_cents: 199, stock: 0, category_id: cats.groceries })).json;
  const h = (await admin('POST', '/api/admin/products', { name: 'Pallet Item B', upc: '722776000601', supplier_id: sup.id, cost_cents: 100, price_cents: 199, stock: 0, category_id: cats.groceries })).json;
  nextDraft = draft({ invoice_no: 'INV-4', lines: [L({ upc: '722776000600', description: 'A', qty: 10, unit_cost_cents: 100 }), L({ upc: '722776000601', description: 'B', qty: 30, unit_cost_cents: 100 })] });
  const goods = await upload('inv-4.pdf', 'fourth'.padEnd(400, '='));
  const gid = goods.json.invoice_id; await admin('POST', `/api/admin/invoices/${gid}/apply`, { reprice: 'none' });
  assert.equal(Number((await admin('GET', '/api/admin/products/' + g.id)).json.cost_cents), 100);
  nextDraft = draft({ kind: 'freight', invoice_no: 'TRK-77', freight_cents: 4000, lines: [] });
  const f = (await upload('truck.pdf', 'truck-bill'.padEnd(400, '#'))).json; assert.equal(f.status, 'review');
  assert.equal((await admin('POST', `/api/admin/invoices/${f.invoice_id}/apply`, {})).status, 400); // must say which delivery it belongs to
  const cands = (await admin('GET', `/api/admin/invoices/${f.invoice_id}/freight-candidates`)).json; assert.ok(cands.some((c) => c.id === gid));
  const r = (await admin('POST', `/api/admin/invoices/${f.invoice_id}/allocate`, { target_id: gid })).json; assert.equal(r.allocated_cents, 4000); assert.equal(r.products_updated, 2);
  // $40 over 40 units of equal value = $1.00 each
  assert.equal(Number((await admin('GET', '/api/admin/products/' + g.id)).json.cost_cents), 200); assert.equal(Number((await admin('GET', '/api/admin/products/' + h.id)).json.cost_cents), 200);
  const props = (await admin('GET', '/api/admin/price-proposals')).json; assert.ok(props.some((p) => p.product_id === g.id && /Freight/.test(p.reason)));
  assert.equal((await admin('POST', `/api/admin/invoices/${f.invoice_id}/allocate`, { target_id: gid })).status, 409); // only once
  await admin('POST', '/api/admin/price-proposals/approve-all', {}); assert.equal((await admin('GET', '/api/admin/price-proposals')).json.length, 0);
});

test('a bad document or a failed read still shows up for a human; non-invoices are set aside; CSV needs no AI', async () => {
  nextDraft = new Error('The invoice reader declined this document');
  const bad = (await upload('blurry.pdf', 'blurry'.padEnd(400, '~'))).json; assert.equal(bad.status, 'review'); assert.match(bad.error, /declined/);
  const row = (await admin('GET', `/api/admin/invoices/${bad.invoice_id}`)).json.invoice; assert.equal(row.draft.lines.length, 0); assert.match(row.error, /declined/);
  nextDraft = draft({ is_invoice: false }); assert.equal((await upload('menu.pdf', 'lunch menu'.padEnd(400, '%'))).json.status, 'ignored');
  const csv = 'upc,description,qty,unit cost\n722776000111,Gefilte,2,3.60\n';
  const r = (await admin('POST', '/api/admin/invoices/upload', { filename: 'lines.csv', content_type: 'text/csv', text: csv })).json; assert.equal(r.status, 'review');
  assert.equal((await admin('GET', `/api/admin/invoices/${r.invoice_id}`)).json.invoice.draft.lines[0].state, 'matched');
  assert.equal((await admin('POST', '/api/admin/invoices/upload', {})).status, 400);
});

test('email inbox: invoices from known senders are read, strangers and duplicates are not, mailbox is only read', async () => {
  const att = (name, type = 'application/pdf', body = 'attachment-body') => ({ filename: name, contentType: type, content: Buffer.from(body.padEnd(400, '*')), contentDisposition: 'attachment' });
  nextDraft = draft({ invoice_no: 'EML-1', lines: [L({ upc: '722776000111', description: 'x', unit_cost_cents: 330 })] });
  const ctx = { purchasing: A.purchasing, senders: ['kwholesale.example'] };
  const r1 = await processParsed({ from: { text: 'Orders <orders@kwholesale.example>' }, subject: 'Your order', messageId: '<m1>', attachments: [att('doc.pdf')] }, ctx); assert.equal(r1.ingested.length, 1);
  assert.equal((await processParsed({ from: { text: 'Orders <orders@kwholesale.example>' }, subject: 'Your order', messageId: '<m1>', attachments: [att('doc.pdf')] }, ctx)).ingested[0].duplicate, true);
  const stranger = await processParsed({ from: { text: 'spam <x@random.example>' }, subject: 'Hi', messageId: '<m2>', attachments: [att('photo.png', 'image/png')] }, ctx); assert.equal(stranger.ingested.length, 0); assert.equal(stranger.skipped, 1);
  const strangerInvoice = await processParsed({ from: { text: 'new supplier <x@new.example>' }, subject: 'Invoice 55', messageId: '<m3>', attachments: [att('invoice-55.pdf', 'application/pdf', 'other-bytes')] }, ctx); assert.equal(strangerInvoice.ingested.length, 1); // subject says invoice
  const pasted = await processParsed({ from: { text: 'o@kwholesale.example' }, subject: 'Delivery', messageId: '<m4>', text: 'Invoice 9\nGefilte Fish 3 x 12.00 = 36.00\nTotal 36.00 '.padEnd(120, ' '), attachments: [] }, ctx); assert.equal(pasted.ingested.length, 1);
  assert.equal((await A.db.one(`SELECT source FROM invoices WHERE source_ref LIKE '<m1>%'`)).source, 'email');
  // polling logic with a fake mailbox: only reads (readOnly lock), remembers message ids
  nextDraft = draft({ invoice_no: 'EML-2', lines: [L({ upc: '722776000111', description: 'x', unit_cost_cents: 335 })] });
  const mail = Buffer.from('From: Orders <orders@kwholesale.example>\r\nSubject: Invoice 1002\r\nMessage-ID: <poll-1@x>\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=b\r\n\r\n--b\r\nContent-Type: text/plain\r\n\r\nsee attached\r\n--b\r\nContent-Type: application/pdf; name="i.pdf"\r\nContent-Disposition: attachment; filename="i.pdf"\r\nContent-Transfer-Encoding: base64\r\n\r\n' + Buffer.from('polled-pdf'.padEnd(400, '+')).toString('base64') + '\r\n--b--\r\n');
  let lockOpts = null, logouts = 0;
  const fake = () => ({ connect: async () => {}, logout: async () => { logouts++; }, close: async () => {}, getMailboxLock: async (_, o) => { lockOpts = o; return { release() {} }; }, search: async () => [7], fetchOne: async (uid, q) => (q.envelope ? { envelope: { messageId: '<poll-1@x>' } } : { source: mail }) });
  const { pollInbox } = require('./inbox');
  const s1 = await pollInbox({ db: A.db, purchasing: A.purchasing, settings: A.settings, accounts: [{ user: 'me@gmail.com', pass: 'app-pass' }], clientFactory: fake });
  assert.equal(s1.checked, 1); assert.equal(s1.ingested, 1); assert.deepEqual(lockOpts, { readOnly: true }); assert.equal(logouts, 1);
  const s2 = await pollInbox({ db: A.db, purchasing: A.purchasing, settings: A.settings, accounts: [{ user: 'me@gmail.com', pass: 'app-pass' }], clientFactory: fake }); assert.equal(s2.checked, 0); // already seen
  const bad = await pollInbox({ db: A.db, purchasing: A.purchasing, settings: A.settings, accounts: [{ user: 'x', pass: 'y' }], clientFactory: () => ({ connect: async () => { throw new Error('bad credentials'); }, close: async () => {} }) }); assert.match(bad.errors[0], /bad credentials/);
  const st = (await admin('GET', '/api/admin/inbox/status')).json; assert.equal(st.accounts, 0); assert.equal(st.reader, 'fake');
  assert.equal((await admin('POST', '/api/admin/inbox/poll')).status, 501);
});

test('purchase orders from reorder suggestions, in cases, emailed to the supplier', async () => {
  // jar sells fast: lots of recent sales, little stock
  await A.db.q(`UPDATE products SET stock = 2 WHERE id=$1`, [jar.id]);
  await A.db.q(`INSERT INTO stock_events (product_id, delta, reason) VALUES ($1,-84,'online')`, [jar.id]);
  const po = (await admin('POST', '/api/admin/purchase-orders/from-reorder', { supplier_id: sup.id })).json;
  const line = po.lines.find((l) => l.product_id === jar.id); assert.ok(line); assert.equal(Number(line.case_size), 12); assert.equal(Number(line.qty_units) % 12, 0); assert.equal(Number(line.qty_cases) * 12, Number(line.qty_units)); // whole cases
  assert.match((await admin('GET', `/api/admin/purchase-orders/${po.id}`)).json.text, /Gefilte Fish Jar/);
  const s = (await admin('POST', `/api/admin/purchase-orders/${po.id}/send`)).json; assert.equal(s.sent, true);
  const mail = sent.email.find((m) => m.to === 'orders@kwholesale.example' && /Order from Bay Kosher/.test(m.subject)); assert.ok(mail && /KW-100/.test(mail.html) && /case/.test(mail.html));
  assert.equal((await admin('POST', `/api/admin/purchase-orders/${po.id}/send`)).status, 409);
  const other = (await admin('POST', '/api/admin/suppliers', { name: 'No Email Co' })).json;
  assert.equal((await admin('POST', '/api/admin/purchase-orders/from-reorder', { supplier_id: other.id })).status, 409); // nothing to order
});

test('stock: hand counts, computed from invoices minus sales; Clover counts only when chosen; register sales reduce stock', async () => {
  assert.equal((await admin('POST', `/api/admin/products/${tahini.id}/count`, { qty: 9 })).json.now, 9);
  assert.equal((await admin('POST', `/api/admin/products/${tahini.id}/count`, { qty: -1 })).status, 400);
  const row = await A.db.one(`SELECT delta FROM stock_events WHERE product_id=$1 AND reason='count' ORDER BY id DESC LIMIT 1`, [tahini.id]); assert.ok(row);
  // Clover counts are ignored in "computed" mode, used in "clover" mode
  cloverItems.push({ id: 'C-TAH', name: 'Pereg Tahini 16 oz', upc: '', price_cents: 899, per_lb: false, stock: 100 });
  await syncClover({ db: A.db, clover: { items: async () => cloverItems }, direction: 'site_wins', stockSource: 'computed' });
  assert.equal(Number((await admin('GET', '/api/admin/products/' + tahini.id)).json.stock), 9);
  await syncClover({ db: A.db, clover: { items: async () => cloverItems }, direction: 'site_wins', stockSource: 'clover' });
  assert.equal(Number((await admin('GET', '/api/admin/products/' + tahini.id)).json.stock), 100);
  await admin('POST', `/api/admin/products/${tahini.id}/count`, { qty: 9 });
  // register sales: first run only sets the starting point, later runs take sold units off the shelf
  let t = 1000, rows = [];
  const cl = { sales: async (since) => rows.filter((x) => x.at > since) };
  assert.equal((await syncSales({ db: A.db, clover: cl, now: t })).first_run, true);
  rows = [{ item_id: 'C-TAH', qty: 1, at: 1500 }, { item_id: 'C-TAH', qty: 2, at: 1600 }, { item_id: 'unknown', qty: 5, at: 1700 }];
  assert.equal((await syncSales({ db: A.db, clover: cl, now: 2000 })).sold, 3);
  assert.equal(Number((await admin('GET', '/api/admin/products/' + tahini.id)).json.stock), 6);
  assert.equal((await syncSales({ db: A.db, clover: cl, now: 3000 })).sold, 0); // nothing is counted twice
  assert.equal((await A.syncClover('site_wins')).sales !== undefined, true);
});

test('the invoice reader sends the PDF to Claude with a JSON schema and handles refusals', async () => {
  let seen;
  const fakeSdk = (reply) => ({ messages: { parse: async (req) => { seen = req; return reply; } } });
  const parsed = { is_invoice: true, kind: 'goods', supplier_name: 'S', supplier_email: '', invoice_number: '1', invoice_date: '2026-10-01', freight_total: 5, subtotal: 24, total: 29,
    lines: [{ upc: '', supplier_sku: 'A1', description: 'Jar', qty: 2, unit: 'case', pack: 12, unit_cost: 12, line_total: 24 }], notes: '' };
  const ok = await createClaudeExtractor({ client: fakeSdk({ stop_reason: 'end_turn', parsed_output: parsed }) }).extract({ buffer: Buffer.from('%PDF-1.4 fake'), mediaType: 'application/pdf', filename: 'a.pdf', sender: 'x@y.com' });
  assert.equal(ok.freight_cents, 500); assert.equal(ok.lines[0].unit_cost_cents, 1200); assert.equal(ok.lines[0].pack, 12);
  assert.equal(seen.model, 'claude-opus-5-5'); assert.equal(seen.messages[0].content[0].type, 'document'); assert.equal(seen.messages[0].content[0].source.media_type, 'application/pdf'); assert.ok(seen.output_config.format); assert.match(seen.system, /Never invent/);
  assert.equal(seen.messages[0].content[0].source.data, Buffer.from('%PDF-1.4 fake').toString('base64'));
  await createClaudeExtractor({ client: fakeSdk({ stop_reason: 'end_turn', parsed_output: parsed }) }).extract({ buffer: Buffer.from('imgbytes'), mediaType: 'image/jpeg' }); assert.equal(seen.messages[0].content[0].type, 'image');
  await assert.rejects(() => createClaudeExtractor({ client: fakeSdk({ stop_reason: 'refusal', parsed_output: null }) }).extract({ buffer: Buffer.from('x'), mediaType: 'application/pdf' }), /declined/);
  await assert.rejects(() => createClaudeExtractor({ client: fakeSdk({ stop_reason: 'max_tokens', parsed_output: null }) }).extract({ buffer: Buffer.from('x'), mediaType: 'application/pdf' }), /too long/);
  await assert.rejects(() => createClaudeExtractor({ client: fakeSdk({ stop_reason: 'end_turn', parsed_output: null }) }).extract({ buffer: Buffer.from('x'), mediaType: 'application/pdf' }), /Could not read/);
  assert.equal(normalizeDraft({ ...parsed, kind: 'freight_only', invoice_date: 'last week' }).kind, 'freight'); assert.equal(normalizeDraft({ ...parsed, invoice_date: 'last week' }).invoice_date, '');
});

test('Clover export (.xlsx) imports: codes, per-lb items, hidden/open-price, tax flag, departments guessed or mapped, no echo back to Clover', async () => {
  const fs = require('fs'), path = require('path');
  const xlsx = fs.readFileSync(path.join(__dirname, 'fixtures', 'clover-sample.xlsx')).toString('base64');
  calls.price.length = 0; calls.create.length = 0;
  const pre = (await admin('POST', '/api/admin/products/import', { xlsx_base64: xlsx })).json;
  assert.equal(pre.preview, true); assert.equal(pre.skip, 1); // the repeated barcode is skipped
  assert.equal(pre.create, 7); assert.ok(pre.guessed_departments >= 2);
  const done = (await admin('POST', '/api/admin/products/import', { xlsx_base64: xlsx, commit: true })).json; assert.equal(done.saved, 7); assert.equal(done.failed_count, 0);
  await settle(); assert.deepEqual(calls.create, []); assert.deepEqual(calls.price, []); // importing from Clover must not push anything back
  const get = async (q) => (await admin('GET', '/api/admin/products?q=' + encodeURIComponent(q))).json.items[0];
  const fish = await get('Sample Gefilte Fish Jar'); assert.equal(fish.upc, '722776000001'); assert.equal(fish.sku, 'SKU-A'); assert.equal(fish.clover_id, 'CLV1'); assert.equal(fish.price_cents, 799); assert.equal(Number(fish.stock), 12); assert.equal(fish.category_name, 'Deli & Provisions'); assert.equal(fish.kosher_type, ''); // never guessed
  const beef = await get('Sample Corned Beef'); assert.equal(beef.sold_by, 'lb'); assert.equal(beef.upc, null); assert.equal(beef.sku, '210062'); assert.equal(beef.kosher_type, 'meat'); assert.equal(beef.category_name, 'Meat'); // Clover category set by hand: trusted
  const cheese = await get('Sample Cheddar'); assert.equal(cheese.kosher_type, 'dairy'); assert.equal(Number(cheese.stock), 0); // negative count becomes 0
  const soap = await get('Sample Dish Soap'); assert.equal(soap.taxable, true); assert.equal(soap.category_name, 'Household');
  const open = await get('Sample Open Price'); assert.equal(open.active, false); assert.equal(open.price_cents, 0);
  const hid = await get('Sample Hidden'); assert.equal(hid.active, false);
  const myst = await get('Sample Mystery'); assert.equal(myst.upc, null); assert.equal(myst.category_id, null); assert.equal(myst.passover, 'unknown');
  // run again: updates by Clover id / barcode, no duplicates
  assert.equal((await admin('POST', '/api/admin/products/import', { xlsx_base64: xlsx })).json.create, 0);
  assert.equal((await admin('POST', '/api/admin/products/import', { xlsx_base64: Buffer.from('not excel').toString('base64') })).status, 400);
});
