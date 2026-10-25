// Sign-ups, registrations and orders (site/content/forms.json), and the donation page (site/content/giving.json).
// Everything the old website did with forms now happens here: preschool and Hebrew School registration, camp,
// High Holiday reservations, Yizkor names, lulav and etrog, matzah, selling chametz, mezuzah and tefillin requests,
// Shabbat meal matching, volunteers and the weekly email. Answers are saved, emailed to the Rabbi, listed in the
// Rabbi area (with CSV), and the person gets a confirmation. Forms with a price offer "Pay now" through My Pushka.
// Signed-in members find the form already filled in (their details and their children from "My family").
'use strict';
const crypto = require('crypto');
const express = require('express');
const { esc, md } = require('./md.js');
const { clean } = require('../members.js');

const COLUMNS = { name: 'Name', hebrewName: 'Hebrew name', birthday: 'Birthday', grade: 'Grade', school: 'School', allergies: 'Allergies or medical notes' };
const validEmail = (e) => /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(e) && e.length <= 254;
const optLabel = (o) => (typeof o === 'string' ? o : o.label);
const giveUrl = (fund, amt, ded) => `/pushka/?go=give&fund=${encodeURIComponent(fund || 'general')}${amt ? '&amt=' + amt : ''}&ded=${encodeURIComponent(String(ded || '').slice(0, 80))}`;
const MAX_CARD = 10000;

// Check the answers against the form (English form, so stored answers are always in English) and price them.
function readAnswers(form, body) {
  const out = {}, errors = [];
  let kids = 0;
  for (const f of form.fields) {
    const v = body[f.id];
    if (f.type === 'checkbox') { out[f.id] = v === true; if (f.required && v !== true) errors.push(f.label); continue; }
    if (f.type === 'checkboxes') { const idx = (Array.isArray(v) ? v : []).map(Number).filter((i) => Number.isInteger(i) && i >= 0 && i < f.options.length); out[f.id] = [...new Set(idx)].map((i) => optLabel(f.options[i])); if (f.required && !idx.length) errors.push(f.label); continue; }
    if (f.type === 'select') { const i = Number(v); out[f.id] = Number.isInteger(i) && i >= 0 && i < f.options.length ? optLabel(f.options[i]) : ''; out[f.id + '#'] = out[f.id] ? i : null; if (f.required && !out[f.id]) errors.push(f.label); continue; }
    if (f.type === 'number') { const n = v === '' || v == null ? null : Math.trunc(Number(v)); out[f.id] = Number.isFinite(n) && n >= (f.min || 0) && n <= (f.max || 1000) ? n : null; if (f.required && out[f.id] == null) errors.push(f.label); continue; }
    if (f.type === 'children') {
      const rows = (Array.isArray(v) ? v : []).slice(0, f.rows || 4).map((r) => Object.fromEntries(f.columns.map((c) => [c, c === 'birthday' ? (/^\d{4}-\d{2}-\d{2}$/.test((r && r[c]) || '') ? r[c] : '') : clean(r && r[c], 120)]))).filter((r) => r.name);
      out[f.id] = rows; kids = Math.max(kids, rows.length); if (f.required && !rows.length) errors.push(f.label); continue;
    }
    const max = f.type === 'textarea' ? 3000 : 300;
    out[f.id] = f.type === 'email' ? clean(v, 254).toLowerCase() : f.type === 'date' ? (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : '') : String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, max);
    if (f.required && !out[f.id]) errors.push(f.label);
    if (f.type === 'email' && out[f.id] && !validEmail(out[f.id])) errors.push(f.label);
  }
  // Price: perChild x children, plus priced select options and "amountEach" numbers.
  let amount = 0;
  const p = form.payment;
  if (p) {
    if (p.perChild) amount += p.perChild * kids;
    for (const f of form.fields) {
      if (f.type === 'select' && out[f.id + '#'] != null) { const o = f.options[out[f.id + '#']]; if (o && o.amount) amount += o.amount * (o.perChild ? Math.max(kids, 1) : 1); }
      if (f.type === 'number' && f.amountEach && out[f.id]) amount += f.amountEach * out[f.id] * (f.perChild ? Math.max(kids, 1) : 1);
    }
  }
  for (const k of Object.keys(out)) if (k.endsWith('#')) delete out[k];
  return { out, errors, amount };
}

function mountForms(r, { base, store, mailer, content, render, wrap, limit, readMember, ctxOf, tOf, log = console, notifyTo = '' }) {
  const pool = store && store.pool, q = (t, p) => pool.query(t, p);
  const formsOf = (C) => C.forms || [];

  r.get('/forms', wrap(async (req, res) => {
    const X = ctxOf(req), { t, C } = X, list = formsOf(C);
    await render(res, { path: '/forms', title: t('Sign-ups, registrations and orders'), description: t('Register for preschool, Hebrew School and camp, reserve High Holiday seats, order lulav and etrog or matzah, sell your chametz and more, online at Chabad of Lamorinda.'),
      body: `<section class="wrap sec"><h1>${esc(t('Sign-ups, registrations and orders'))}</h1><p class="lead-d">${esc(t('Everything you can sign up for or order, in one place. Signed in? Your details are filled in for you.'))}</p>
<div class="grid">${list.map((f) => `<a class="card tile" href="/forms/${f.id}"><h3>${esc(f.title)}</h3><p>${esc(f.intro)}</p></a>`).join('')}</div></section>` });
  }));

  r.get('/forms/:id', wrap(async (req, res, next) => {
    const X = ctxOf(req), { t, C } = X, f = formsOf(C).find((x) => x.id === req.params.id);
    if (!f) return next();
    const input = (x) => {
      const req_ = x.required ? ' required' : '', lab = (inner) => `<label>${esc(x.label)}${x.required ? ' *' : ''} ${inner}</label>`;
      switch (x.type) {
        case 'textarea': return lab(`<textarea name="${x.id}" rows="4" maxlength="3000"${req_}></textarea>`);
        case 'select': return lab(`<select name="${x.id}"${req_}><option value="">—</option>${x.options.map((o, i) => `<option value="${i}">${esc(optLabel(o))}</option>`).join('')}</select>`);
        case 'checkbox': return `<label class="check"><input type="checkbox" name="${x.id}"${req_}> ${esc(x.label)}${x.required ? ' *' : ''}</label>`;
        case 'checkboxes': return `<fieldset class="radios" data-group="${x.id}"><legend>${esc(x.label)}${x.required ? ' *' : ''}</legend>${x.options.map((o, i) => `<label><input type="checkbox" name="${x.id}" value="${i}"> ${esc(optLabel(o))}</label>`).join('')}</fieldset>`;
        case 'number': return lab(`<input type="number" name="${x.id}" min="${x.min || 0}" max="${x.max || 1000}" inputmode="numeric"${req_}>`);
        case 'children': return `<fieldset class="kids" data-children="${x.id}"><legend>${esc(x.label)}${x.required ? ' *' : ''}</legend>${Array.from({ length: x.rows || 3 }, (_, i) => `<div class="fields kid" data-row="${i}">${x.columns.map((c) => `<label>${esc(t(COLUMNS[c] || c))} <input name="${x.id}.${i}.${c}"${c === 'birthday' ? ' type="date"' : ''}${x.required && i === 0 && c === 'name' ? ' required' : ''}></label>`).join('')}</div>`).join('')}</fieldset>`;
        default: return lab(`<input type="${x.type === 'email' ? 'email' : x.type === 'tel' ? 'tel' : x.type === 'date' ? 'date' : 'text'}" name="${x.id}"${x.id === 'name' ? ' autocomplete="name"' : x.type === 'email' ? ' autocomplete="email"' : x.type === 'tel' ? ' autocomplete="tel"' : ''}${req_}>`);
      }
    };
    const body = `<section class="wrap sec narrow"><p class="crumbs"><a href="/forms">${esc(t('Sign-ups and orders'))}</a> ›</p><h1>${esc(f.title)}</h1><p class="lead-d">${esc(f.intro)}</p>
<form class="card tool" data-form="${f.id}">
${f.fields.map(input).join('\n')}
<button class="btn gold" type="submit">${esc(f.button || t('Send'))}</button><p class="msg" hidden></p>
<p class="pay-next" hidden><a class="btn gold" href="#">${esc(f.payment ? f.payment.label : '')}</a></p>
</form>
<p class="muted">${esc(t('Questions? Call {phone}.', { phone: C.org.phone }))}</p></section>`;
    await render(res, { path: '/forms/' + f.id, title: f.title, description: f.intro, body });
  }));

  r.post('/api/site/forms/:id', limit('site-forms', 20, 60 * 60 * 1000), express.json({ limit: '32kb' }), wrap(async (req, res) => {
    const t = tOf(req), C = content(), f = formsOf(C).find((x) => x.id === req.params.id);
    if (req.get('x-site') !== '1') return res.status(403).json({ code: 'forbidden', error: 'Forbidden.' });
    if (!f) return res.status(404).json({ code: 'not_found', error: t('Form not found.') });
    if (!pool) return res.status(503).json({ code: 'not_configured', error: t('Sending is not switched on yet. Please call or email us.') });
    const { out, errors, amount } = readAnswers(f, (req.body && req.body.fields) || {});
    if (errors.length) return res.status(400).json({ code: 'invalid', error: t('Please fill in: {fields}', { fields: errors.map((e) => t(e)).join(', ') }), fields: errors });
    const m = readMember ? await readMember(req) : null, name = clean(out.name || (m && m.name), 100), email = (out.email || (m && m.email) || '').toLowerCase();
    if (!name || !validEmail(email)) return res.status(400).json({ code: 'invalid_contact', error: t('Please add your name and email so the Rabbi can reach you.') });
    const id = 'f_' + crypto.randomBytes(12).toString('hex');
    await q('INSERT INTO form_responses (id, form_id, member_id, name, email, data, amount_cents) VALUES ($1,$2,$3,$4,$5,$6,$7)', [id, f.id, m ? m.id : null, name, email, JSON.stringify(out), Math.round(amount * 100)]);
    const lines = f.fields.map((x) => { const v = out[x.id]; const s = Array.isArray(v) ? (x.type === 'children' ? v.map((r) => Object.values(r).filter(Boolean).join(', ')).join(' | ') : v.join(', ')) : v === true ? 'yes' : v === false ? 'no' : v; return s ? `${x.label}: ${s}` : null; }).filter(Boolean).join('\n');
    const to = notifyTo || C.org.email;
    if (mailer && to) mailer.send({ to, subject: `${f.title}: ${name}`, text: `${lines}${amount ? `\n\nAmount: $${amount}` : ''}\n\nRabbi area: ${base}/admin/community` }).catch((e) => log.error('form notify:', e && e.message));
    if (mailer) mailer.send({ to: email, subject: t('We received it: {title}', { title: f.title }), text: t('Thank you, {name}! We received your form and will be in touch soon.', { name }) + `\n\n${lines}\n\n${C.org.name} · ${C.org.phone}` }).catch((e) => log.error('form confirm:', e && e.message));
    const p = f.payment, pay = p && (amount || p.optional) && amount <= MAX_CARD ? giveUrl(p.fund, amount || 0, `${f.title}: ${name}`) : null;
    res.json({ ok: true, amount, payUrl: pay, tooLarge: amount > MAX_CARD });
  }));

  // ---------- Donate ----------
  r.get('/donate', wrap(async (req, res) => {
    const X = ctxOf(req), { t, C } = X, G = C.giving || {}, money = (n) => '$' + Number(n).toLocaleString('en-US');
    const body = `<section class="wrap sec narrow"><h1>${esc(t('Donate'))}</h1><p class="lead-d">${esc(G.intro || '')}</p>
<h2>${esc(t('Give online'))}</h2>
<p class="chips">${(G.amounts || []).map((a) => `<a class="chip" href="${esc(giveUrl('general', a, ''))}">${money(a)}</a>`).join('')}<a class="chip" href="/pushka/?go=give&amp;fund=general">${esc(t('Other amount'))}</a></p>
<p class="btns"><a class="btn gold" href="/pushka/?go=give&amp;fund=general">${esc(t('Give now'))}</a><a class="btn ghost" href="/pushka/?go=club">${esc(t('Give monthly: join the Chai Club'))}</a><a class="btn ghost" href="/sponsor">${esc(t('Sponsor in honor or memory'))}</a></p>
<h2>${esc(t('Choose where your gift goes'))}</h2>
<div class="dir">${(G.funds || []).map((f) => `<div class="card dir-i" id="${f.id}"><h3>${esc(f.name)}</h3><p>${esc(f.text)}</p><p><a class="btn ghost sm" href="${esc(f.id === 'chai' ? '/pushka/?go=club' : giveUrl(f.id, 0, ''))}">${esc(t('Give'))}</a></p></div>`).join('')}</div>
${G.building ? `<h2 id="building">${esc(t('Building Campaign'))}</h2><p>${esc(G.building.text)}</p><table class="tbl"><tbody>${G.building.levels.map(([n, a]) => `<tr><td>${esc(t(n))}</td><td>${money(a)}</td><td>${a <= MAX_CARD ? `<a href="${esc(giveUrl('building', a, 'Building Campaign: ' + n))}">${esc(t('Give'))}</a>` : `<a href="/contact?about=${encodeURIComponent('Building Campaign: ' + n)}">${esc(t('Contact us'))}</a>`}</td></tr>`).join('')}</tbody></table>` : ''}
<h2 id="other">${esc(t('Other ways to give'))}</h2>
<div class="dir">${(G.ways || []).map((w) => `<div class="card dir-i" id="${w.id}"><h3>${esc(w.name)}</h3><p>${esc(w.text)}</p>${w.url ? `<p><a class="btn ghost sm" href="${esc(w.url)}" rel="noopener" target="_blank">${esc(t('Open'))} ${esc(w.name)}</a></p>` : ''}</div>`).join('')}</div>
<p class="muted">${esc(C.org.legal || '')} ${esc(t('Questions? Call {phone}.', { phone: C.org.phone }))}</p></section>`;
    await render(res, { path: '/donate', title: t('Donate to Chabad of Lamorinda'), description: t('Give online once or monthly, sponsor in honor or memory, or give by Venmo, Zelle, check, donor advised fund, stock or crypto. Tax ID 47-4642750.'), body });
  }));

  return {
    mountAdmin(r2, { authed, wrap: w }) {
      if (!pool) return;
      r2.get('/api/site/forms', authed, w(async (req, res) => {
        const counts = Object.fromEntries((await q("SELECT form_id, count(*)::int AS n, count(*) FILTER (WHERE status='new')::int AS fresh FROM form_responses GROUP BY form_id")).rows.map((x) => [x.form_id, x]));
        res.json({ forms: formsOf(content()).map((f) => ({ id: f.id, title: f.title, fields: f.fields.map((x) => ({ id: x.id, label: x.label, type: x.type })), total: (counts[f.id] || {}).n || 0, fresh: (counts[f.id] || {}).fresh || 0 })) });
      }));
      r2.get('/api/site/forms/:id', authed, w(async (req, res) => res.json({ items: (await q('SELECT id, name, email, data, amount_cents, status, created_at FROM form_responses WHERE form_id=$1 ORDER BY created_at DESC LIMIT 1000', [req.params.id])).rows })));
      r2.post('/api/site/forms/response/:id', authed, express.json({ limit: '4kb' }), w(async (req, res) => {
        const s = req.body && req.body.status;
        if (!['new', 'done', 'paid'].includes(s)) return res.status(400).json({ code: 'invalid', error: 'Invalid status.' });
        await q('UPDATE form_responses SET status=$2 WHERE id=$1', [String(req.params.id).slice(0, 40), s]); res.json({ ok: true });
      }));
    },
  };
}
module.exports = { mountForms, readAnswers };
