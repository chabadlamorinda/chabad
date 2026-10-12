// Dashboard: talk to the CRM (text, voice, photos) and browse people, donations, mitzvos and visits.
'use strict';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const nice = (d) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');
const LABEL = { visit: 'Visits', mezuzah: 'Mezuzos', tefillin: 'Tefillin', shabbat_candles: 'Shabbos candles', kosher: 'Kosher', holiday: 'Holiday', lifecycle: 'Lifecycle', class: 'Classes', call: 'Calls', other: 'Other' };
const TYPES = Object.keys(LABEL);

async function api(path, opts = {}) {
  const r = await fetch(path, { ...opts, headers: { 'content-type': 'application/json', ...(opts.headers || {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== '/api/login') { showLogin(); throw new Error('Please log in.'); }
  if (!r.ok) throw new Error(j.error || 'Request failed');
  return j;
}

// ---------- login ----------
function showLogin() { $('#main').hidden = true; $('#login').hidden = false; $('#password').focus(); }
function showMain() { $('#login').hidden = true; $('#main').hidden = false; loadChat(); }
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#loginError').textContent = '';
  try { await api('/api/login', { method: 'POST', body: { password: $('#password').value } }); $('#password').value = ''; showMain(); }
  catch (err) { $('#loginError').textContent = err.message; }
});
$('#logout').addEventListener('click', async () => { await api('/api/logout', { method: 'POST' }).catch(() => {}); showLogin(); });

// ---------- tabs ----------
const loaders = { talk: loadChat, overview: loadOverview, people: loadPeople, donations: loadDonations, activities: loadActivities };
$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]');
  if (!b) return;
  document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('on', x === b));
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.id === 'tab-' + b.dataset.tab));
  loaders[b.dataset.tab]();
});
const thisYear = new Date().getFullYear();
document.querySelectorAll('.yearSel').forEach((s) => {
  for (let y = thisYear + 1; y >= thisYear - 10; y--) s.add(new Option(y, y, false, y === thisYear));
});
TYPES.forEach((t) => $('#actType').add(new Option(LABEL[t], t)));
$('#ovYear').addEventListener('change', loadOverview);
$('#donYear').addEventListener('change', loadDonations);
$('#actYear').addEventListener('change', loadActivities);
$('#actType').addEventListener('change', loadActivities);

// ---------- talk ----------
const chat = $('#chat');
const pending = { photos: [], voice: null };

function bubble(html, who, meta = '') {
  const d = document.createElement('div');
  d.className = 'msg ' + who;
  d.innerHTML = html + (meta ? `<div class="meta">${esc(meta)}</div>` : '');
  chat.appendChild(d);
  chat.scrollTop = chat.scrollHeight;
  return d;
}
function renderMine(m) {
  let h = '';
  for (const a of m.attachments || []) {
    if (a.kind === 'photo') h += `<a href="/api/attachments/${a.id}" target="_blank"><img src="/api/attachments/${a.id}" alt="photo"></a>`;
    if (a.kind === 'voice') h += `<audio controls preload="none" src="/api/attachments/${a.id}"></audio>`;
  }
  if (m.transcript) h += `🎙 “${esc(m.transcript)}”\n`;
  if (m.text) h += esc(m.text);
  return h || '(empty)';
}
async function loadChat() {
  const msgs = (await api('/api/messages')).reverse();
  chat.innerHTML = '';
  if (!msgs.length) bubble('Shalom! Tell me what happened (type, record a voice note 🎙 or send a photo 📷), or ask a question like “How much did we raise this year?”', 'bot');
  for (const m of msgs) {
    bubble(renderMine(m), 'me', `${m.channel} · ${new Date(m.created_at + 'Z').toLocaleString()}`);
    if (m.reply) bubble(esc(m.reply), 'bot');
  }
}

function renderPending() {
  const p = $('#pending');
  p.innerHTML = '';
  pending.photos.forEach((ph, i) => {
    const c = document.createElement('span');
    c.className = 'chip';
    c.innerHTML = `<img src="data:${ph.mime};base64,${ph.base64}" alt=""> <button type="button" class="x">✕</button>`;
    c.querySelector('button').onclick = () => { pending.photos.splice(i, 1); renderPending(); };
    p.appendChild(c);
  });
  if (pending.voice) {
    const c = document.createElement('span');
    c.className = 'chip';
    c.innerHTML = `🎙 voice note (${pending.voice.seconds}s) <button type="button" class="x">✕</button>`;
    c.querySelector('button').onclick = () => { pending.voice = null; renderPending(); };
    p.appendChild(c);
  }
}

// Photos: shrink to at most 1600px and convert to JPEG (also turns iPhone HEIC into something readable).
function toJpeg(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve({ mime: 'image/jpeg', base64: c.toDataURL('image/jpeg', 0.85).split(',')[1] });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
    img.src = url;
  });
}
$('#photoInput').addEventListener('change', async (e) => {
  for (const f of e.target.files) {
    try { pending.photos.push(await toJpeg(f)); } catch (err) { alert(err.message); }
  }
  e.target.value = '';
  renderPending();
});

// Voice: tap to start, tap again to stop.
let rec = null;
let recStart = 0;
$('#micBtn').addEventListener('click', async () => {
  const btn = $('#micBtn');
  if (rec) { rec.stop(); return; }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch { alert('Microphone permission is needed to record a voice note.'); return; }
  const chunks = [];
  rec = new MediaRecorder(stream);
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.onstop = async () => {
    stream.getTracks().forEach((t) => t.stop());
    const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    pending.voice = { mime: blob.type, base64: btoa(bin), seconds: Math.round((Date.now() - recStart) / 1000) };
    rec = null;
    btn.classList.remove('rec'); btn.textContent = '🎙';
    renderPending();
  };
  recStart = Date.now();
  rec.start();
  btn.classList.add('rec'); btn.textContent = '⏹';
});

const textEl = $('#text');
textEl.addEventListener('input', () => { textEl.style.height = 'auto'; textEl.style.height = textEl.scrollHeight + 'px'; });
textEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(pointer: coarse)').matches) { e.preventDefault(); $('#composer').requestSubmit(); } });
$('#composer').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (rec) { alert('Stop the recording first (tap ⏹).'); return; }
  const text = textEl.value.trim();
  if (!text && !pending.photos.length && !pending.voice) return;
  const body = { text, photos: pending.photos.map(({ mime, base64 }) => ({ mime, base64 })), voice: pending.voice && { mime: pending.voice.mime, base64: pending.voice.base64 } };
  const preview = (pending.photos.length ? `📷 ×${pending.photos.length}\n` : '') + (pending.voice ? '🎙 voice note\n' : '') + text;
  bubble(esc(preview), 'me');
  textEl.value = ''; textEl.style.height = 'auto';
  pending.photos = []; pending.voice = null; renderPending();
  const wait = bubble('<span class="typing">Working on it…</span>', 'bot');
  $('#sendBtn').disabled = true;
  try {
    const r = await api('/api/message', { method: 'POST', body });
    wait.innerHTML = (r.transcript ? `🎙 “${esc(r.transcript)}”\n\n` : '') + esc(r.reply);
  } catch (err) { wait.innerHTML = `<span class="error">${esc(err.message)}</span>`; }
  $('#sendBtn').disabled = false;
});

// ---------- overview ----------
const rows = (list, f) => (list.length ? list.map(f).join('') : '<p class="muted">Nothing yet.</p>');
async function loadOverview() {
  const s = await api('/api/summary?year=' + $('#ovYear').value);
  const act = Object.fromEntries(s.activities.map((a) => [a.type, a]));
  const q = (t) => (act[t] ? act[t].quantity : 0);
  $('#stats').innerHTML = [
    [money(s.donations.total), 'donated'], [s.donations.gifts, 'gifts'], [s.donations.donors, 'donors'],
    [act.visit ? act.visit.times : 0, 'visits'], [q('mezuzah'), 'mezuzos'], [q('tefillin'), 'tefillin'], [s.people, 'people in CRM'],
  ].map(([v, l]) => `<div class="stat"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('');
  $('#byFund').innerHTML = rows(s.donations.by_fund, (r) => `<div class="bar"><span>${esc(r.fund)}</span><b>${money(r.total)}</b></div>`);
  $('#topDonors').innerHTML = rows(s.donations.top_donors, (r) => `<div class="bar"><a href="#" data-person="${r.person_id || ''}">${esc(r.name || 'Anonymous')}</a><b>${money(r.total)}</b></div>`);
  $('#byMonth').innerHTML = rows(s.donations.by_month, (r) => `<div class="bar"><span>${esc(new Date(r.month + '-15').toLocaleString('en-US', { month: 'long' }))}</span><b>${money(r.total)}</b></div>`);
  $('#followUps').innerHTML = rows(s.follow_ups, (r) => `<div class="bar"><span><a href="#" data-person="${r.person_id || ''}">${esc(r.name || '—')}</a>: ${esc(LABEL[r.type] || r.type)} ${esc(r.details)}</span><span>${esc(nice(r.follow_up_date))}</span></div>`);
}

// ---------- people ----------
let searchTimer;
$('#peopleSearch').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(loadPeople, 250); });
async function loadPeople() {
  const list = await api('/api/people?q=' + encodeURIComponent($('#peopleSearch').value));
  $('#peopleCount').textContent = `${list.length} people`;
  $('#peopleList').innerHTML = `<table class="table"><tr><th>Name</th><th class="hide-sm">Phone</th><th class="hide-sm">City</th><th class="num">Given ${thisYear}</th><th>Last visit</th></tr>` +
    list.map((p) => `<tr class="click" data-person="${p.id}"><td>${esc(p.name)}${p.hebrew_name ? `<div class="muted">${esc(p.hebrew_name)}</div>` : ''}</td><td class="hide-sm">${esc(p.phone)}</td><td class="hide-sm">${esc(p.city)}</td><td class="num">${p.given_this_year ? money(p.given_this_year) : ''}</td><td>${esc(nice(p.last_visit))}</td></tr>`).join('') + '</table>';
}

async function openPerson(id) {
  const p = await api('/api/people/' + id);
  const fields = [['Hebrew name', p.hebrew_name], ['Phone', p.phone], ['Email', p.email], ['Address', [p.address, p.city].filter(Boolean).join(', ')], ['Spouse', p.spouse], ['Children', p.children], ['Birthday', p.birthday], ['Yahrzeits', p.yahrzeits], ['Tags', p.tags], ['Notes', p.notes]].filter(([, v]) => v);
  $('#personBody').innerHTML = `<h1>${esc(p.name)}</h1>
    <dl class="kv">${fields.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
    <h3 style="margin-top:1rem">Giving by year</h3>${rows(p.donations_by_year, (r) => `<div class="bar"><span>${esc(r.year)} (${r.gifts} gifts)</span><b>${money(r.total)}</b></div>`)}
    <h3 style="margin-top:1rem">Mitzvos &amp; visits</h3>${rows(p.activity_counts, (r) => `<div class="bar"><span>${esc(LABEL[r.type] || r.type)}</span><span>${r.quantity} (last ${esc(nice(r.last))})</span></div>`)}
    <h3 style="margin-top:1rem">Donations</h3>${rows(p.donations, (d) => `<div class="bar"><span>${esc(nice(d.date))} · ${esc(d.method)} ${d.check_number ? '#' + esc(d.check_number) : ''} ${esc(d.fund)} ${esc(d.note)}</span><b>${money(d.amount)}</b></div>`)}
    <h3 style="margin-top:1rem">History</h3>${rows(p.activities, (a) => `<div class="bar"><span>${esc(nice(a.date))} · ${esc(LABEL[a.type] || a.type)}${a.quantity > 1 ? ' ×' + a.quantity : ''} ${esc(a.details)}</span></div>`)}
    <p class="muted" style="margin-top:1rem">To change anything, just tell the CRM in the Talk tab (e.g. “Change ${esc(p.first_name || p.name)}'s phone to …”).</p>`;
  $('#personDlg').showModal();
}
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-person]');
  if (el && el.dataset.person) { e.preventDefault(); openPerson(el.dataset.person); }
});

// ---------- donations ----------
async function loadDonations() {
  const y = $('#donYear').value;
  const list = await api('/api/donations?year=' + y);
  $('#csvLink').href = '/api/donations.csv?year=' + y;
  $('#donTotal').textContent = `${money(list.reduce((s, d) => s + d.amount, 0))} · ${list.length} gifts`;
  $('#donList').innerHTML = list.length ? `<table class="table"><tr><th>Date</th><th>Donor</th><th class="num">Amount</th><th class="hide-sm">Method</th><th class="hide-sm">Fund / note</th><th></th></tr>` +
    list.map((d) => `<tr><td>${esc(nice(d.date))}</td><td>${d.person_id ? `<a href="#" data-person="${d.person_id}">${esc(d.name)}</a>` : 'Anonymous'}</td><td class="num">${money(d.amount)}</td><td class="hide-sm">${esc(d.method)}${d.check_number ? ' #' + esc(d.check_number) : ''}</td><td class="hide-sm">${esc([d.fund, d.note].filter(Boolean).join(' · '))}</td><td><button class="x" data-del="donations/${d.id}" title="Delete">✕</button></td></tr>`).join('') + '</table>'
    : '<p class="muted">No donations recorded for this year.</p>';
}

// ---------- activities ----------
async function loadActivities() {
  const y = $('#actYear').value;
  const t = $('#actType').value;
  const list = await api(`/api/activities?year=${y}${t ? '&type=' + t : ''}`);
  const totals = {};
  list.forEach((a) => { totals[a.type] = (totals[a.type] || 0) + a.quantity; });
  $('#actCounts').innerHTML = Object.entries(totals).map(([k, v]) => `<div class="stat"><b>${v}</b><span>${esc(LABEL[k] || k)}</span></div>`).join('');
  $('#actList').innerHTML = list.length ? `<table class="table"><tr><th>Date</th><th>Person</th><th>What</th><th class="hide-sm">Details</th><th></th></tr>` +
    list.map((a) => `<tr><td>${esc(nice(a.date))}</td><td>${a.person_id ? `<a href="#" data-person="${a.person_id}">${esc(a.name)}</a>` : '—'}</td><td>${esc(LABEL[a.type] || a.type)}${a.quantity > 1 ? ' ×' + a.quantity : ''}</td><td class="hide-sm">${esc(a.details)}${a.follow_up_date ? `<div class="muted">Follow up ${esc(nice(a.follow_up_date))}${a.follow_up_done ? ' ✓' : ''}</div>` : ''}</td><td><button class="x" data-del="activities/${a.id}" title="Delete">✕</button></td></tr>`).join('') + '</table>'
    : '<p class="muted">Nothing recorded yet.</p>';
}

document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-del]');
  if (!b || !confirm('Delete this record?')) return;
  await api('/api/' + b.dataset.del, { method: 'DELETE' });
  b.dataset.del.startsWith('donations') ? loadDonations() : loadActivities();
});

// ---------- start ----------
api('/api/me').then(showMain).catch(() => showLogin());
