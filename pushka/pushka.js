// ===== My Pushka · Chabad of Lamorinda =====
// Built from the "Pushka App" design handoff (Classical system).
const DONATE_URL = "https://www.chabadoflamorinda.com/donate"; // replace with the real donation page
const CANDLE_ZIP = "94549";                                      // Lafayette, CA
const KEY = "lamorinda-pushka-v3";

const FUNDS = [
  { id: "general", name: "General Fund", desc: "Where it’s needed most", long: "Supports the day-to-day work of Chabad of Lamorinda: holiday programs, Shabbat dinners and outreach across Lafayette, Moraga and Orinda." },
  { id: "school", name: "Hebrew School", desc: "Tuition aid and classroom supplies", long: "Helps every child attend Hebrew School regardless of means, and keeps classrooms stocked with books and materials." },
  { id: "shabbat", name: "Shabbat & Kiddush", desc: "Weekly meals for the community", long: "Sponsors the weekly Kiddush and community Shabbat meals that bring families together." },
  { id: "chesed", name: "Chesed Fund", desc: "Quiet help for families in need", long: "Provides confidential assistance with groceries, rent and emergencies for local families." },
];
const QUICK = [1.8, 5, 18, 36]; // multiples of chai
const GIVE_AMTS = [18, 36, 72, 180];

// Payment seam. Until a payment server + Stripe exist, gifts are completed on the donation page.
// When connected, set PAY.connected = true and implement PAY.charge({amount, fundId, frequency, dedication}).
const PAY = { connected: false, card: null, charge: null };

// ---------- state ----------
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fund = (id) => FUNDS.find((f) => f.id === id) || FUNDS[0];
const fmt = (n) => "$" + n.toFixed(2).replace(/\.00$/, "");
const fmt2 = (n) => "$" + n.toFixed(2);

const def = () => ({ name: "", email: "", balance: 0, drops: 0, history: [], recurring: null, rem: { shabbat: false, daily: false }, candles: [], notified: {} });
let S;
try { S = Object.assign(def(), JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) { S = def(); }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
const U = { tab: "home", sheet: null, fund: "general", giveFund: null, giveAmt: 36, freq: "once", dedication: "", sent: null, pending: null };

// ---------- calendars ----------
const hebYear = (d) => new Intl.DateTimeFormat("en-u-ca-hebrew", { year: "numeric" }).format(d).replace(/\D/g, "");
const hebFull = (d) => new Intl.DateTimeFormat("en-u-ca-hebrew", { day: "numeric", month: "long", year: "numeric" }).format(d).replace(/ AM$/, "");
const greg = (d) => new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(d);
const when = (t) => {
  const d = new Date(t), now = new Date(), y = new Date(now - 864e5);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return "Today · " + time;
  if (d.toDateString() === y.toDateString()) return "Yesterday · " + time;
  return greg(d);
};

// ---------- icons (Lucide, 1.5 stroke) ----------
const ico = (d, s = 22, extra = "") => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
const I = {
  home: '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/>',
  give: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  profile: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  chev: '<path d="m9 18 6-6-6-6"/>', back: '<path d="m15 18-6-6 6-6"/>', check: '<path d="M20 6 9 17l-5-5"/>',
  card: '<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>',
};

// ---------- sound: metallic clink (per spec) ----------
let ac;
function clink(n = 1, gap = 0.07, delay = 0.42) {
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === "suspended") ac.resume();
    for (let i = 0; i < n; i++) {
      const t0 = ac.currentTime + delay + i * gap, base = 2100 + Math.random() * 900;
      [[1, 0.22, 0.5], [1.51, 0.12, 0.35], [2.76, 0.07, 0.2]].forEach(([m, g, d]) => {
        const o = ac.createOscillator(), v = ac.createGain();
        o.type = "sine"; o.frequency.value = base * m;
        v.gain.setValueAtTime(0, t0); v.gain.linearRampToValueAtTime(g, t0 + 0.003); v.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
        o.connect(v).connect(ac.destination); o.start(t0); o.stop(t0 + d + 0.05);
      });
    }
  } catch (e) {}
}

// ---------- candle lighting ----------
async function loadCandles() {
  try {
    const j = await (await fetch(`https://www.hebcal.com/shabbat?cfg=json&zip=${CANDLE_ZIP}&M=on`)).json();
    S.candles = (j.items || []).filter((i) => i.category === "candles").map((i) => i.date);
    save(); if (U.tab === "home") draw();
  } catch (e) {}
}
const nextCandle = () => (S.candles || []).map((d) => new Date(d)).filter((d) => d > Date.now()).sort((a, b) => a - b)[0];
const clock = (d) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).replace(" ", " ");

// ---------- notifications (work while the app is open) ----------
async function ensureNotify() {
  if (!("Notification" in window)) { alert("This browser can't show notifications. Try adding the app to your home screen."); return false; }
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") { alert("Notifications are blocked. Please allow them for this site in your browser settings."); return false; }
  return (await Notification.requestPermission()) === "granted";
}
async function notify(body) {
  try {
    const reg = navigator.serviceWorker && (await navigator.serviceWorker.getRegistration());
    if (reg) reg.showNotification("My Pushka", { body, icon: "icon.svg", tag: "pushka" }); else new Notification("My Pushka", { body, icon: "icon.svg" });
  } catch (e) {}
}
function tick() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const now = Date.now(), d = new Date();
  if (S.rem.shabbat) (S.candles || []).forEach((c) => { const t = new Date(c) - 3600e3, k = "s" + c; if (now >= t && now < t + 600e3 && !S.notified[k]) { S.notified[k] = 1; save(); notify("Candle lighting is in an hour — it's customary to give before lighting."); } });
  if (S.rem.daily && d.getDay() >= 1 && d.getDay() <= 5) { const t = new Date(d).setHours(8, 0, 0, 0), k = "d" + d.toDateString(); if (now >= t && now < t + 600e3 && !S.notified[k]) { S.notified[k] = 1; save(); notify("Time to drop your daily coin."); } }
}

// ---------- screens ----------
function tin() {
  return `<svg width="220" height="252" viewBox="0 0 220 252" fill="none" style="display:block"><defs>
<linearGradient id="bf" x1="0" x2="1"><stop offset="0" stop-color="#173766"/><stop offset=".2" stop-color="#2a5a9e"/><stop offset=".38" stop-color="#3b6cb3"/><stop offset=".7" stop-color="#24508f"/><stop offset="1" stop-color="#143059"/></linearGradient>
<linearGradient id="bt" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#4f80c4"/><stop offset="1" stop-color="#2f5fa3"/></linearGradient>
<linearGradient id="gd" x1="0" x2="1"><stop offset="0" stop-color="#a06f24"/><stop offset=".4" stop-color="#facb8d"/><stop offset="1" stop-color="#a06f24"/></linearGradient></defs>
<ellipse cx="110" cy="236" rx="92" ry="9" fill="#2d2b2b" opacity=".2"/>
<path d="M30 62H190V228Q190 232 186 232H34Q30 232 30 228Z" fill="url(#bf)"/>
<path d="M30 62L46 38H174L190 62Z" fill="url(#bt)" stroke="#173766" stroke-width="1" stroke-linejoin="round"/>
<path d="M30 62H190V70H30Z" fill="url(#gd)"/><path d="M30 218H190V228Q190 232 186 232H34Q30 232 30 228Z" fill="url(#gd)"/>
<path d="M30 62H190V228Q190 232 186 232H34Q30 232 30 228Z" stroke="#173766" stroke-width="1"/>
<rect x="78" y="46" width="64" height="7" rx="3.5" fill="#0f2442"/><rect x="78" y="46" width="64" height="2.5" rx="1.2" fill="#000" opacity=".5"/>
<rect x="44" y="82" width="132" height="124" rx="3" fill="#f8f4f4" stroke="url(#gd)" stroke-width="2.5"/>
<rect x="50" y="88" width="120" height="112" rx="1.5" stroke="#a06f24" stroke-width=".7"/>
<text x="110" y="122" text-anchor="middle" fill="#173766" style="font:600 38px 'Cormorant Garamond',Georgia,serif" direction="rtl">צדקה</text></svg>`;
}

function home() {
  const now = new Date(), c = nextCandle();
  let reminder = "";
  if (c) {
    const dayName = c.toLocaleDateString([], { weekday: "long" });
    const title = c.getDay() === 5 ? `Shabbat candles Friday, ${clock(c)}` : `Candle lighting ${dayName}, ${clock(c)}`;
    const sub = S.rem.shabbat ? `It's customary to give before lighting. We'll remind you at ${clock(new Date(c - 3600e3))}.` : "It's customary to give before lighting. Turn on the Shabbat reminder in Profile.";
    reminder = `<div class="card">${ico(I.flame, 22, 'style="color:var(--accent);flex:none"')}<div style="flex:1"><div class="card-title">${esc(title)}</div><div class="h-s">${esc(sub)}</div></div></div>`;
  }
  return `<div class="head"><div><div class="kicker">Chabad of Lamorinda</div><h1>My Pushka</h1></div><div class="dates"><div>${esc(greg(now))}</div><i>${esc(hebFull(now))}</i></div></div>
  <div class="scroll"><div class="col">
    <div class="tin"><div class="anchor" id="coinAnchor"></div><div class="wrap">${tin()}<div class="bal">${fmt2(S.balance)}</div></div></div>
    <div><div class="tap">Tap to drop a coin</div><div class="quick">${QUICK.map((a) => `<button class="btn btn-secondary" data-drop="${a}">${fmt(a)}</button>`).join("")}</div></div>
    <button class="btn btn-primary cta" id="openEmpty" ${S.balance <= 0 ? "disabled" : ""}>Empty pushka to Chabad</button>
    ${reminder}
  </div></div>`;
}

function give() {
  if (!U.giveFund) {
    return `<div class="scroll" style="padding-top:calc(var(--s3) + env(safe-area-inset-top))"><div class="col" style="padding-top:0"><div class="page-h"><h1>Give</h1><div class="sub">A direct gift to one of our funds.</div></div>
      <div>${FUNDS.map((f) => `<button class="row-btn" data-fund="${f.id}"><div class="grow"><div class="fund-n">${esc(f.name)}</div><div class="fund-d">${esc(f.desc)}</div></div><span style="color:var(--accent)">${ico(I.chev, 18)}</span></button>`).join("")}</div></div></div>`;
  }
  const f = fund(U.giveFund), cta = U.freq === "monthly" ? `Give $${U.giveAmt} monthly` : `Give $${U.giveAmt}`;
  return `<div class="scroll" style="padding-top:calc(var(--s3) + env(safe-area-inset-top))"><div class="col tight" style="padding-top:0">
    <button class="btn btn-ghost" id="allFunds" style="align-self:flex-start;padding-left:0">${ico(I.back, 16)}All funds</button>
    <div class="page-h"><div class="kicker">Give to</div><h2 style="margin:2px 0 4px">${esc(f.name)}</h2><p style="margin:0;font-size:13px;text-align:justify;color:var(--n800)">${esc(f.long)}</p></div>
    <div class="field"><label>Amount</label><div class="amts">${GIVE_AMTS.map((a) => `<button class="btn btn-secondary ${U.giveAmt === a ? "sel" : ""}" data-amt="${a}">$${a}</button>`).join("")}</div></div>
    <div class="field"><label>Frequency</label><div class="seg"><label><input type="radio" name="freq" value="once" ${U.freq === "once" ? "checked" : ""}>One time</label><label><input type="radio" name="freq" value="monthly" ${U.freq === "monthly" ? "checked" : ""}>Monthly</label></div></div>
    <div class="field"><label for="ded">Dedication (optional)</label><input class="input" id="ded" maxlength="80" placeholder="In honor of / in memory of…" value="${esc(U.dedication)}"></div>
    <div class="h-s" style="display:flex;align-items:center;gap:8px;font-size:13px">${ico(I.card, 16)}${PAY.card ? esc(PAY.card) : "Payment completes on our secure donation page"}</div>
    <button class="btn btn-primary cta" id="submitGive">${cta}</button></div></div>`;
}

function history() {
  const yr = hebYear(new Date());
  const total = S.history.filter((h) => h.kind === "gift" && hebYear(new Date(h.t)) === yr).reduce((a, h) => a + h.amt, 0);
  const rows = S.history.length ? S.history.map((h) => `<div class="row-btn" style="cursor:default"><div class="grow"><div class="h-t">${esc(h.title)}</div><div class="h-s">${esc(h.sub || when(h.t))}</div></div><div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px"><div class="h-a">${fmt2(h.amt)}</div>${h.receipt ? '<span class="tag-accent">Receipt</span>' : ""}</div></div>`).join("") : `<div class="rowp">Nothing yet. Drop your first coin on the Pushka tab.</div>`;
  return `<div class="scroll" style="padding-top:calc(var(--s3) + env(safe-area-inset-top))"><div class="col tight" style="padding-top:0">
    <div class="page-h" style="display:flex;justify-content:space-between;align-items:flex-end"><h1>History</h1><div class="year"><div class="k">Given in ${esc(yr)}</div><div class="v">${fmt2(total)}</div></div></div>
    <div>${rows}</div>
    <p class="note">Coins in your pushka are given when you empty it. ${PAY.connected ? "Tax receipts are issued for every gift sent to Chabad." : "Your receipt comes from our donation page after each gift."}</p></div></div>`;
}

function profile() {
  const tg = (k, label, sub) => `<button class="row-btn" data-tg="${k}"><div class="grow"><div class="h-t">${label}</div><div class="h-s">${sub}</div></div><div class="sw ${S.rem[k] ? "on" : ""}"></div></button>`;
  const rec = S.recurring ? `<div class="row-btn" style="cursor:default"><div class="grow"><div class="h-t">$${S.recurring.amt} monthly · ${esc(fund(S.recurring.fund).name)}</div><div class="h-s">Next charge Oct 1</div></div><button class="btn btn-ghost" id="cancelRec">Cancel</button></div>` : `<div class="rowp">No monthly gifts. Choose “Monthly” when giving to a fund.</div>`;
  return `<div class="scroll" style="padding-top:calc(var(--s3) + env(safe-area-inset-top))"><div class="col" style="padding-top:0">
    <div class="page-h" style="display:flex;justify-content:space-between;align-items:flex-end;gap:10px"><div><h1>${esc(S.name || "Welcome")}</h1><div class="sub">${esc(S.email || "Add your name and email")}</div></div><button class="btn btn-ghost" id="editProfile">Edit</button></div>
    <div><h6 style="color:var(--n700);margin-bottom:var(--s1)">Reminders</h6>${tg("shabbat", "Before Shabbat", "Friday, an hour before candle lighting")}${tg("daily", "Daily coin", "Weekdays at 8:00 am")}<p class="note" style="margin-top:8px">Reminders arrive while the app is open or installed on your home screen.</p></div>
    <div><h6 style="color:var(--n700);margin-bottom:var(--s1)">Recurring</h6>${rec}</div>
    <div><h6 style="color:var(--n700);margin-bottom:var(--s1)">Payment</h6><div class="row-btn" style="cursor:default"><span style="color:var(--accent)">${ico(I.card, 20)}</span><div class="grow" style="font-size:14px">${PAY.card ? esc(PAY.card) : "No card saved"}</div><button class="btn btn-ghost" id="cardBtn">${PAY.card ? "Change" : "Add"}</button></div></div>
  </div></div>`;
}

// ---------- sheets ----------
function sheet() {
  const o = $("#overlay");
  if (!U.sheet) { o.innerHTML = ""; return; }
  let body = "";
  if (U.sheet === "empty") {
    body = `<div><h3>Empty your pushka</h3><div class="h-s" style="font-size:13px">${PAY.connected ? `${fmt2(S.balance)} will be charged to ${esc(PAY.card || "your card")} and sent to:` : `${fmt2(S.balance)} will be given to Chabad of Lamorinda. Choose a fund:`}</div></div>
    <div>${FUNDS.map((f) => `<label class="radio"><input type="radio" name="fund" value="${f.id}" ${U.fund === f.id ? "checked" : ""}><span class="dot"></span><span class="nm">${esc(f.name)}</span></label>`).join("")}</div>
    <button class="btn btn-primary cta" id="confirmEmpty">${PAY.connected ? "Send" : "Give"} ${fmt2(S.balance)}</button>`;
  } else if (U.sheet === "finish") {
    const p = U.pending;
    body = `<div><h3>Finish your gift</h3><div class="h-s" style="font-size:13px">We opened our secure donation page for ${fmt2(p.amt)} to the ${esc(fund(p.fund).name)}${p.freq === "monthly" ? ", monthly" : ""}. Complete it there, then come back and tap below.</div></div>
    <button class="btn btn-secondary cta" id="reopen" style="width:100%">Open donation page again</button>
    <button class="btn btn-primary cta" id="finished">I’ve completed my gift</button>
    <button class="btn btn-ghost" id="closeSheet">Not yet</button>`;
  } else if (U.sheet === "done") {
    body = `<div class="done"><div class="ck" style="color:var(--accent)">${ico(I.check, 24)}</div><h3>Todah rabah</h3><div style="font-size:14px;max-width:280px">${fmt2(U.sent.amt)} is on its way to the ${esc(fund(U.sent.fund).name)}.</div>
    <div class="h-s">${PAY.connected && S.email ? `A tax receipt is on its way to ${esc(S.email)}.` : "Your receipt will be emailed by our donation page."}</div></div><button class="btn btn-primary cta" id="closeSheet">Done</button>`;
  } else if (U.sheet === "profile") {
    body = `<h3>Your details</h3><div class="field"><label for="pn">Name</label><input class="input" id="pn" value="${esc(S.name)}" autocomplete="name"></div><div class="field"><label for="pe">Email</label><input class="input" id="pe" type="email" value="${esc(S.email)}" autocomplete="email"></div><button class="btn btn-primary cta" id="saveProfile">Save</button>`;
  } else if (U.sheet === "card") {
    body = `<div><h3>Payment</h3><div class="h-s" style="font-size:13px;margin-top:4px">Saving a card for automatic giving isn’t switched on yet. For now, each gift is completed on our secure donation page, and your card details never touch this app.</div></div><button class="btn btn-primary cta" id="closeSheet">OK</button>`;
  }
  o.innerHTML = `<div class="scrim" id="scrim"></div><div class="sheet"><div class="grab"></div>${body}</div>`;
  $("#scrim").onclick = closeSheet;
  const on = (id, fn) => { const e = $("#" + id); if (e) e.onclick = fn; };
  on("closeSheet", closeSheet);
  o.querySelectorAll('input[name="fund"]').forEach((r) => (r.onchange = () => (U.fund = r.value)));
  on("confirmEmpty", () => startGift(S.balance, U.fund, "once", "", true));
  on("reopen", () => window.open(donateLink(U.pending), "_blank", "noopener"));
  on("finished", () => completeGift(U.pending));
  on("saveProfile", () => { S.name = $("#pn").value.trim(); S.email = $("#pe").value.trim(); save(); closeSheet(); });
}
const closeSheet = () => { U.sheet = null; draw(); };

// ---------- actions ----------
const donateLink = (p) => `${DONATE_URL}?amount=${encodeURIComponent(p.amt)}&fund=${encodeURIComponent(p.fund)}&frequency=${p.freq}${p.ded ? "&dedication=" + encodeURIComponent(p.ded) : ""}`;

async function startGift(amt, fundId, freq, ded, fromPushka) {
  const p = { amt, fund: fundId, freq, ded, fromPushka };
  if (PAY.connected && PAY.charge) {
    try { await PAY.charge({ amount: amt, fundId, frequency: freq, dedication: ded }); } catch (e) { alert(e.message || "Payment failed. Please try again."); return; }
    return completeGift(p);
  }
  U.pending = p; U.sheet = "finish"; draw();
  window.open(donateLink(p), "_blank", "noopener");
}
function completeGift(p) {
  const f = fund(p.fund), t = Date.now();
  if (p.fromPushka) { clink(7, 0.06, 0); S.balance = 0; S.drops = 0; }
  S.history.unshift({ kind: "gift", t, amt: p.amt, receipt: PAY.connected, title: p.fromPushka ? `Pushka emptied → ${f.name}` : f.name, sub: p.fromPushka ? when(t) : `${when(t)} · ${p.freq === "monthly" ? "Monthly" : "One time"}${p.ded ? " · " + p.ded : ""}` });
  if (PAY.connected && p.freq === "monthly") S.recurring = { amt: p.amt, fund: p.fund };
  save();
  U.sent = { amt: p.amt, fund: p.fund }; U.sheet = "done"; U.pending = null; U.giveFund = null; draw();
}
function drop(a) {
  clink(S.balance > 20 ? 2 : 1, 0.09);
  S.balance = Math.round((S.balance + a) * 100) / 100; S.drops++;
  S.history.unshift({ kind: "coin", t: Date.now(), title: "Coin dropped", sub: "Just now", amt: a });
  save(); draw();
  const anchor = $("#coinAnchor");
  if (anchor) { const c = document.createElement("div"); c.className = "coin"; c.textContent = fmt(a); anchor.append(c); setTimeout(() => c.remove(), 800); }
}

// ---------- shell ----------
const TABS = [["home", "Pushka"], ["give", "Give"], ["history", "History"], ["profile", "Profile"]];
function draw() {
  const body = { home, give, history, profile }[U.tab]();
  $("#app").innerHTML = body + `<nav class="tabbar">${TABS.map(([id, l]) => `<button class="tab ${U.tab === id ? "on" : ""}" data-tab="${id}">${ico(I[id])}<span>${l}</span></button>`).join("")}</nav>`;
  const a = $("#app"), on = (sel, fn) => a.querySelectorAll(sel).forEach((e) => (e.onclick = () => fn(e)));
  on("[data-tab]", (e) => { U.tab = e.dataset.tab; if (U.tab === "give") U.giveFund = null; draw(); });
  on("[data-drop]", (e) => drop(parseFloat(e.dataset.drop)));
  on("#openEmpty", () => { U.sheet = "empty"; draw(); });
  on("[data-fund]", (e) => { Object.assign(U, { giveFund: e.dataset.fund, giveAmt: 36, freq: "once", dedication: "" }); draw(); });
  on("#allFunds", () => { U.giveFund = null; draw(); });
  on("[data-amt]", (e) => { U.giveAmt = +e.dataset.amt; draw(); });
  a.querySelectorAll('input[name="freq"]').forEach((r) => (r.onchange = () => { U.freq = r.value; draw(); }));
  const ded = $("#ded"); if (ded) ded.oninput = () => (U.dedication = ded.value);
  on("#submitGive", () => startGift(U.giveAmt, U.giveFund, U.freq, U.dedication.trim(), false));
  on("[data-tg]", async (e) => { const k = e.dataset.tg; if (!S.rem[k] && !(await ensureNotify())) return; S.rem[k] = !S.rem[k]; save(); if (S.rem[k]) loadCandles(); draw(); });
  on("#cancelRec", () => { S.recurring = null; save(); draw(); });
  on("#editProfile", () => { U.sheet = "profile"; draw(); });
  on("#cardBtn", () => { U.sheet = "card"; draw(); });
  sheet();
}

draw();
loadCandles(); setInterval(tick, 30000); setTimeout(tick, 2000);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
