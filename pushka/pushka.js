// ===== Chabad of Lamorinda · My Pushka =====
const DONATE_URL = "https://www.chabadoflamorinda.com/donate"; // replace with the real donation page
const ORG = "Chabad of Lamorinda";
const CAP = 36;                 // pushka is "full" at this amount
const CANDLE_ZIP = "94549";     // Lafayette, CA — used for Shabbat candle-lighting times
const KEY = "lamorinda-pushka-v2";

const CURRENCIES = [
  ["US", "United States", "USD", "🇺🇸"], ["CA", "Canada", "CAD", "🇨🇦"], ["GB", "United Kingdom", "GBP", "🇬🇧"],
  ["EU", "Europe", "EUR", "🇪🇺"], ["IL", "Israel", "ILS", "🇮🇱"], ["AU", "Australia", "AUD", "🇦🇺"],
];
const EMPTY_MODES = { full: "When Full", friday: "Every Friday", monthly: "Monthly", manual: "Manually" };

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);

const defaults = () => ({
  name: "", email: "", currency: "USD", empty: "full", presets: [1, 5, 10],
  sound: true, jingle: true, vibrate: true, addlPay: false,
  pushkas: [{ id: "p1", name: "My Pushka" }], cur: "p1",
  gifts: [], history: [], wallet: 0,
  reminders: [{ id: "candle", type: "candle", mins: 15, on: false }],
  lastEmptied: Date.now(), candleNext: null, notified: {},
});
let S;
try { S = Object.assign(defaults(), JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) { S = defaults(); }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };

const money = (n) => new Intl.NumberFormat(undefined, { style: "currency", currency: S.currency }).format(n);
const sym = () => (new Intl.NumberFormat(undefined, { style: "currency", currency: S.currency }).formatToParts(0).find((p) => p.type === "currency") || {}).value || "$";
const curPushka = () => S.pushkas.find((p) => p.id === S.cur) || S.pushkas[0];
const giftsOf = (id) => S.gifts.filter((g) => g.p === id);
const totalOf = (id) => Math.round(giftsOf(id).reduce((s, g) => s + g.amt, 0) * 100) / 100;

// ---------- icons ----------
const ic = {
  home: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 11l8-7 8 7v9H4z"/><path d="M9 20v-6h6v6"/></svg>',
  wallet: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/></svg>',
  bell: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M6 17V11a6 6 0 0112 0v6l2 2H4z"/><path d="M10 21h4"/></svg>',
  hist: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 12a9 9 0 109-9 9 9 0 00-7 3.5"/><path d="M3 4v4h4M12 7v5l3 2"/></svg>',
  gear: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5l1.6 2.4 2.8-.6.9 2.7 2.7.9-.6 2.8 2.4 1.6-2.4 1.6.6 2.8-2.7.9-.9 2.7-2.8-.6L12 21.5l-1.6-2.4-2.8.6-.9-2.7-2.7-.9.6-2.8L2.5 12l2.4-1.6-.6-2.8 2.7-.9.9-2.7 2.8.6z"/></svg>',
  help: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 114 2c-1 .7-1.5 1.2-1.5 2.5M12 17h.01"/></svg>',
  bellp: '<svg width="56" height="56" viewBox="0 0 24 24" fill="currentColor"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.1-1.6-5.6-4.5-6.3V4a1.5 1.5 0 00-3 0v.7C7.6 5.4 6 7.9 6 11v5l-2 2v1h16v-1z"/><path d="M19 2v6M16 5h6" stroke="currentColor" stroke-width="1.8"/></svg>',
  trash: '<svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19a2 2 0 002 2h8a2 2 0 002-2V7H6zM19 4h-3.5l-1-1h-5l-1 1H5v2h14z"/></svg>',
};

// ---------- sound / haptics ----------
let actx;
function tone(freq, start, dur, type = "sine", vol = 0.15) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.value = freq;
    const t = actx.currentTime + start;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur);
  } catch (e) {}
}
function feedback() {
  if (S.sound) tone(180, 0.55, 0.08, "triangle", 0.2);
  if (S.jingle) { tone(1320, 0.05, 0.25, "triangle"); tone(1760, 0.12, 0.3, "triangle"); tone(2093, 0.2, 0.35, "triangle", 0.1); }
  if (S.vibrate && navigator.vibrate) navigator.vibrate(40);
}

// ---------- modal ----------
function modal({ icon = "", title = "", body = "", buttons }) {
  return new Promise((res) => {
    const root = $("#modalRoot");
    const el = document.createElement("div");
    el.className = "back";
    el.innerHTML = `<div class="modal" role="dialog"><div class="mi">${icon}</div>${title ? `<h3>${esc(title)}</h3>` : ""}${body}<div class="btns"></div></div>`;
    (buttons || [{ label: "OK", v: true }]).forEach((b) => {
      const btn = document.createElement("button");
      btn.textContent = b.label; if (b.sec) btn.className = "sec";
      btn.onclick = () => { const v = b.get ? b.get(el) : b.v; el.remove(); res(v); };
      $(".btns", el).append(btn);
    });
    root.append(el);
    const f = $("input,select", el); if (f) setTimeout(() => f.focus(), 50);
  });
}

// ---------- shell ----------
const NAV = [["pushka", "My Pushka", ic.home], ["wallet", "Wallet", ic.wallet], ["reminders", "Reminders", ic.bell], "-", ["history", "History", ic.hist], ["settings", "Settings", ic.gear], ["support", "Support", ic.help]];
function drawer(active) {
  $("#drawer").innerHTML = `<div class="hi">Hi${S.name ? " " + esc(S.name.split(" ")[0]) : ""}</div>` +
    NAV.map((n) => (n === "-" ? "<hr>" : `<a href="#${n[0]}" class="${n[0] === active ? "active" : ""}">${n[2]}<span>${n[1]}</span></a>`)).join("");
}
const openMenu = (o) => { $("#drawer").classList.toggle("open", o); $("#scrim").hidden = !o; };
$("#menuBtn").onclick = () => openMenu(true);
$("#scrim").onclick = () => openMenu(false);
$("#shareBtn").onclick = async () => {
  const data = { title: `${ORG} · Pushka`, text: `Give tzedakah every day with the ${ORG} Pushka.`, url: location.href.split("#")[0] };
  try { if (navigator.share) await navigator.share(data); else { await navigator.clipboard.writeText(data.url); modal({ title: "Link copied", body: "<p>Share it with family and friends.</p>" }); } } catch (e) {}
};

// ---------- views ----------
const V = {};
function canSVG(p) {
  const total = totalOf(p.id), frac = Math.min(total / CAP, 1);
  const top = 48, bot = 292, h = bot - top, fy = bot - frac * h;
  return `<svg viewBox="0 0 360 340" aria-label="Pushka">
  <defs>
    <linearGradient id="bodyg" x1="0" x2="1"><stop offset="0" stop-color="#dfe6ee"/><stop offset=".5" stop-color="#f7fafd"/><stop offset="1" stop-color="#e6edf4"/></linearGradient>
    <linearGradient id="coing" x1="0" x2="1"><stop offset="0" stop-color="#d9a91d"/><stop offset=".5" stop-color="#f7d54a"/><stop offset="1" stop-color="#c8960f"/></linearGradient>
    <clipPath id="clipc"><path d="M100 ${top} V${bot} a80 22 0 0 0 160 0 V${top}z"/></clipPath>
    <filter id="sh" x="-30%" y="-10%" width="160%" height="130%"><feDropShadow dx="0" dy="14" stdDeviation="14" flood-opacity=".22"/></filter>
  </defs>
  <g filter="url(#sh)"><path d="M100 ${top} V${bot} a80 22 0 0 0 160 0 V${top}z" fill="url(#bodyg)"/></g>
  <g clip-path="url(#clipc)">
    <rect x="100" y="${fy}" width="160" height="${bot + 30 - fy}" fill="url(#coing)" opacity=".92"/>
    <ellipse cx="180" cy="${fy}" rx="80" ry="22" fill="#f9e06f" opacity="${frac > 0 ? 0.9 : 0}"/>
  </g>
  <ellipse cx="180" cy="${bot}" rx="80" ry="22" fill="#fff" opacity="${frac > 0 ? 0 : 1}"/>
  <g transform="rotate(-90 180 170)" font-family="Montserrat,sans-serif" text-anchor="middle">
    <text x="180" y="196" font-size="72" font-family="Heebo,Arial,sans-serif" font-weight="900" fill="#3f64ae" direction="rtl">צדקה</text>
    <text x="180" y="222" font-size="12" fill="#222" font-weight="700" letter-spacing=".5">CHABAD OF LAMORINDA</text>
    <text x="180" y="238" font-size="9.5" fill="#444">Tzedakah · Lafayette · Moraga · Orinda</text>
  </g>
  <ellipse cx="180" cy="${top}" rx="80" ry="22" fill="#a9a9b3" stroke="#555" stroke-width="7"/>
  <path d="M148 ${top - 9} L206 ${top + 8}" stroke="#4a4a52" stroke-width="7" stroke-linecap="round"/>
  <g id="coinG" opacity="0"><circle cx="180" cy="${top - 5}" r="13" fill="#f2c93c" stroke="#a37c0a" stroke-width="3"/></g>
  <text class="can-lbl" x="92" y="${top + 6}" text-anchor="end">${esc(money(CAP))} -</text>
  <text class="can-lbl b" x="268" y="${Math.max(fy, top + 14) + 6}">- ${esc(money(total))}</text>
</svg>`;
}
V.pushka = () => {
  const p = curPushka(), total = totalOf(p.id);
  $("#title").textContent = p.name;
  const tabs = S.pushkas.length > 1 ? `<div class="tabs">${S.pushkas.map((x) => `<button data-p="${x.id}" class="${x.id === p.id ? "on" : ""}">${esc(x.name)}</button>`).join("")}</div>` : "";
  $("#view").innerHTML = `${tabs}
    <div class="msg"><h2>${total > 0 ? `Your Pushka has ${esc(money(total))}` : "Your Pushka is empty"}</h2><p>Give Tzedakah</p></div>
    <div class="can-wrap" id="canWrap">${canSVG(p)}</div>
    <div class="presets">${S.presets.map((a) => `<button data-a="${a}">${esc(money(a))}</button>`).join("")}<button data-a="other">Other</button></div>
    <div class="actions"><button class="link" id="donateNow">Donate Now</button><button class="link ${total > 0 ? "" : "dim"}" id="emptyBtn">Empty Pushka</button><button class="gear" id="gearBtn" aria-label="Settings">${ic.gear}</button></div>`;
  $("#view").querySelectorAll(".tabs button").forEach((b) => (b.onclick = () => { S.cur = b.dataset.p; save(); render(); }));
  $("#view").querySelectorAll(".presets button").forEach((b) => (b.onclick = () => (b.dataset.a === "other" ? otherAmount() : addGift(parseFloat(b.dataset.a)))));
  $("#donateNow").onclick = donateNow;
  $("#emptyBtn").onclick = () => emptyPushka(false);
  $("#gearBtn").onclick = () => (location.hash = "settings");
};
async function otherAmount() {
  const methods = S.addlPay ? `<select class="select" id="mth" style="margin-bottom:14px"><option>Pushka</option><option>Check</option><option>Wire</option><option>DAF</option><option>Cash</option></select>` : "";
  const v = await modal({
    title: "Enter amount", body: `<input class="field" id="oa" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="${esc(sym())} 0.00">${methods}`,
    buttons: [{ label: "Cancel", sec: true, v: null }, { label: "Add", get: (el) => ({ a: parseFloat($("#oa", el).value), m: $("#mth", el) ? $("#mth", el).value : "Pushka" }) }],
  });
  if (v && v.a > 0) addGift(v.a, v.m);
}
function addGift(amt, method = "Pushka") {
  const p = curPushka();
  S.gifts.push({ id: uid(), p: p.id, amt: Math.round(amt * 100) / 100, t: Date.now() });
  S.history.unshift({ id: uid(), t: Date.now(), type: "gift", amt, pushka: p.name, method });
  save(); feedback(); animateCoin();
  setTimeout(() => { render(); autoEmptyCheck(); }, 850);
}
function animateCoin() {
  const g = $("#coinG"); if (!g) return;
  g.style.opacity = 1; g.classList.add("coin-drop");
  $("#canWrap svg").classList.add("shake");
}
async function donateNow() {
  const p = curPushka();
  const v = await modal({
    icon: "", title: "Donate Now", body: `<p>Enter an amount to donate to ${ORG}.</p><input class="field" id="dn" type="number" min="1" step="0.01" inputmode="decimal" value="${totalOf(p.id) || ""}" placeholder="${esc(sym())} 0.00">`,
    buttons: [{ label: "Cancel", sec: true, v: null }, { label: "Donate", get: (el) => parseFloat($("#dn", el).value) }],
  });
  if (v > 0) await processDonation(v, null);
}
async function emptyPushka(auto) {
  const p = curPushka(), total = totalOf(p.id);
  if (total <= 0) { if (!auto) modal({ title: "Pushka is empty", body: "<p>Drop in a coin first!</p>" }); return; }
  const ok = await modal({
    icon: "", title: auto ? "Your Pushka is full!" : "Empty Pushka", body: `<p>Donate ${esc(money(total))} to ${ORG} and empty your pushka?</p>`,
    buttons: [{ label: "Not now", sec: true, v: false }, { label: "Donate", v: true }],
  });
  if (ok) await processDonation(total, p.id);
}
// Payment layer. Today: opens the donation page, then asks the donor to confirm.
// Card-on-file / automatic charge plugs in here (PAY.charge) once a payment server exists.
const PAY = { connected: false, charge: null };
async function processDonation(amt, emptyId) {
  let done = false;
  if (PAY.connected && PAY.charge) {
    try { done = await PAY.charge(amt); } catch (e) { await modal({ title: "Payment failed", body: `<p>${esc(e.message || "Please try again.")}</p>` }); return; }
  } else {
    window.open(`${DONATE_URL}?amount=${encodeURIComponent(amt)}`, "_blank", "noopener");
    done = await modal({ title: "Complete your donation", body: `<p>Finish donating ${esc(money(amt))} on the page that just opened. Once you're done, tap Done.</p>`, buttons: [{ label: "Cancel", sec: true, v: false }, { label: "Done", v: true }] });
  }
  if (!done) return;
  S.history.unshift({ id: uid(), t: Date.now(), type: "donation", amt, pushka: emptyId ? curPushka().name : "—", method: PAY.connected ? "Card" : "Online" });
  if (emptyId) { S.gifts = S.gifts.filter((g) => g.p !== emptyId); S.lastEmptied = Date.now(); }
  save(); render();
  modal({ title: "Thank you!", body: `<p>Your donation of ${esc(money(amt))} to ${ORG} is a great mitzvah. Tizku l'mitzvos!</p>` });
}
function autoEmptyCheck() {
  const p = curPushka(), total = totalOf(p.id);
  if (total <= 0) return;
  const now = new Date(), last = new Date(S.lastEmptied);
  const due = (S.empty === "full" && total >= CAP) ||
    (S.empty === "friday" && now.getDay() === 5 && last.toDateString() !== now.toDateString()) ||
    (S.empty === "monthly" && (now.getMonth() !== last.getMonth() || now.getFullYear() !== last.getFullYear()));
  if (due && !document.querySelector(".modal")) emptyPushka(true);
}

V.wallet = () => {
  $("#title").textContent = "Wallet";
  $("#view").innerHTML = `<div class="wallet"><button class="learn" id="learn">Learn More</button><div class="bal-l">Balance</div><div class="bal">${esc(money(S.wallet))}</div>
    <button class="btn-o" id="addFunds">+ Add Funds</button><div class="ar">Auto Refill Inactive</div></div><button class="big-o" id="autoRef">Auto Refill</button>`;
  $("#learn").onclick = () => modal({ title: "About the Wallet", body: `<p>Keep a balance set aside for tzedakah. Your wallet balance is recorded in this app.</p>` });
  $("#addFunds").onclick = async () => {
    const v = await modal({ title: "Add Funds", body: `<input class="field" id="af" type="number" min="1" step="0.01" inputmode="decimal" placeholder="${esc(sym())} 0.00">`, buttons: [{ label: "Cancel", sec: true, v: null }, { label: "Add", get: (el) => parseFloat($("#af", el).value) }] });
    if (v > 0) { S.wallet = Math.round((S.wallet + v) * 100) / 100; S.history.unshift({ id: uid(), t: Date.now(), type: "wallet", amt: v, pushka: "Wallet", method: "Wallet" }); save(); render(); }
  };
  $("#autoRef").onclick = () => modal({ title: "Auto Refill", body: `<p>Automatic refills need a card on file. This will be available once card payments are switched on.</p>` });
};

V.reminders = () => {
  $("#title").textContent = "Reminders";
  const label = (r) => (r.type === "candle" ? ["Before Candle Lighting", `Friday & Holidays - ${r.mins} Mins Before`] : [r.text || "Give Tzedakah", `Every day at ${r.time}`]);
  $("#view").innerHTML = `<div>${S.reminders.map((r) => { const [t, s] = label(r); return `<div class="rem"><div><h3>${esc(t)}</h3><p>${esc(s)}</p></div><div style="display:flex;align-items:center">${r.type !== "candle" ? `<button class="x" data-del="${r.id}" aria-label="Delete">✕</button>` : ""}<label class="sw"><input type="checkbox" data-r="${r.id}" ${r.on ? "checked" : ""}><i></i></label></div></div>`; }).join("")}
    <button class="add-rem" id="addRem">+ Add Reminder</button></div>`;
  $("#view").querySelectorAll("[data-r]").forEach((c) => (c.onchange = async () => {
    const r = S.reminders.find((x) => x.id === c.dataset.r);
    if (c.checked && !(await askNotify())) { c.checked = false; return; }
    r.on = c.checked; save(); if (r.on) loadCandles();
  }));
  $("#view").querySelectorAll("[data-del]").forEach((b) => (b.onclick = () => { S.reminders = S.reminders.filter((x) => x.id !== b.dataset.del); save(); render(); }));
  $("#addRem").onclick = async () => {
    const v = await modal({ title: "Add Reminder", body: `<input class="field" id="rt" type="time" value="09:00"><input class="field" id="rx" maxlength="40" placeholder="Message (optional)">`, buttons: [{ label: "Cancel", sec: true, v: null }, { label: "Save", get: (el) => ({ time: $("#rt", el).value, text: $("#rx", el).value.trim() }) }] });
    if (v && v.time && (await askNotify())) { S.reminders.push({ id: uid(), type: "daily", time: v.time, text: v.text, on: true }); save(); render(); }
  };
};
async function askNotify() {
  if (!("Notification" in window)) { await modal({ title: "Not supported", body: "<p>This browser can't show notifications. Try adding the app to your home screen.</p>" }); return false; }
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") { await modal({ title: "Notifications blocked", body: "<p>Please allow notifications for this site in your browser settings.</p>" }); return false; }
  const ok = await modal({ icon: ic.bellp, title: "Allow Notifications", body: "<p>Please allow notifications to enable us to send you reminders</p>", buttons: [{ label: "Cancel", v: false }, { label: "Confirm", v: true }] });
  if (!ok) return false;
  return (await Notification.requestPermission()) === "granted";
}
async function notify(body) {
  try {
    const reg = navigator.serviceWorker && (await navigator.serviceWorker.getRegistration());
    if (reg) reg.showNotification("My Pushka · " + ORG, { body, icon: "icon.svg", tag: "pushka" });
    else new Notification("My Pushka · " + ORG, { body, icon: "icon.svg" });
  } catch (e) {}
}
async function loadCandles() {
  try {
    const r = await fetch(`https://www.hebcal.com/shabbat?cfg=json&zip=${CANDLE_ZIP}&M=on`);
    const j = await r.json();
    S.candleNext = (j.items || []).filter((i) => i.category === "candles").map((i) => i.date).filter((d) => new Date(d) > Date.now());
    save();
  } catch (e) {}
}
function reminderTick() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const now = Date.now();
  S.reminders.filter((r) => r.on).forEach((r) => {
    if (r.type === "candle") {
      (S.candleNext || []).forEach((d) => { const t = new Date(d).getTime() - r.mins * 60000; const k = "c" + d; if (now >= t && now < t + 10 * 60000 && !S.notified[k]) { S.notified[k] = 1; save(); notify("Candle lighting is soon — drop a coin in your pushka before Shabbat."); } });
    } else {
      const [h, m] = r.time.split(":").map(Number), d = new Date(); d.setHours(h, m, 0, 0);
      const k = r.id + d.toDateString();
      if (now >= d && now < +d + 10 * 60000 && !S.notified[k]) { S.notified[k] = 1; save(); notify(r.text || "Time to give tzedakah!"); }
    }
  });
}

V.history = () => {
  $("#title").textContent = "History";
  const label = { gift: "Added to pushka", donation: "Donation", wallet: "Wallet funds" };
  $("#view").innerHTML = S.history.length ? `<ul class="hist">${S.history.map((h) => `<li class="${h.type === "donation" ? "don" : ""}"><div><b>${esc(money(h.amt))}</b><small>${esc(label[h.type] || h.type)} · ${esc(h.pushka)}${h.method && h.method !== "Pushka" ? " · " + esc(h.method) : ""}</small></div><small>${new Date(h.t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</small></li>`).join("")}</ul>` : `<p class="empty-note">No activity yet.</p>`;
};

V.settings = () => {
  $("#title").textContent = "Settings";
  const tg = (id, t, sub, on) => `<div class="tgl-row"><div class="t">${t}${sub ? `<small>${sub}</small>` : ""}</div><label class="sw"><input type="checkbox" id="${id}" ${on ? "checked" : ""}><i></i></label></div>`;
  $("#view").innerHTML = `
    <div class="sec-title">PUSHKA</div>
    <label class="lbl" style="margin-top:0">Empty Pushka</label>
    <select class="select" id="emp">${Object.entries(EMPTY_MODES).map(([k, v]) => `<option value="${k}" ${S.empty === k ? "selected" : ""}>${v}</option>`).join("")}</select>
    <label class="lbl">Preset Amounts</label>
    <div class="row3">${S.presets.map((a, i) => `<div class="amt"><span>${esc(sym())}</span><input class="field" data-i="${i}" type="number" min="0.01" step="0.01" inputmode="decimal" value="${a.toFixed(2)}"></div>`).join("")}</div>
    <label class="lbl">Currency</label>
    <select class="select" id="cur">${CURRENCIES.map((c) => `<option value="${c[2]}" ${S.currency === c[2] ? "selected" : ""}>${c[3]} ${c[1]} — ${c[2]}</option>`).join("")}</select>
    ${tg("sd", "Sound", "", S.sound)}${tg("jg", "Coin Jingle", "", S.jingle)}${tg("vb", "Vibration", "", S.vibrate)}${tg("ap", "Additional Payment", "Including check, wire, DAF", S.addlPay)}
    <div class="tgl-row"><div class="t">Add Additional Pushka</div><button class="add-btn" id="addP" aria-label="Add pushka">+</button></div>
    <div class="divider"></div>
    <div class="sec-title">PROFILE</div>
    <label class="prof-l" style="margin-top:0">Name</label><input class="prof-in" id="pn" value="${esc(S.name)}" placeholder="Your name" autocomplete="name">
    <label class="prof-l">Email</label><input class="prof-in" id="pe" type="email" value="${esc(S.email)}" placeholder="you@example.com" autocomplete="email">
    <label class="prof-l">Manage Account</label><button class="del" id="delAcc">${ic.trash}<span>Delete Account?</span></button>`;
  $("#emp").onchange = (e) => { S.empty = e.target.value; save(); };
  $("#cur").onchange = (e) => { S.currency = e.target.value; save(); render(); };
  $("#view").querySelectorAll("[data-i]").forEach((i) => (i.onchange = () => { const v = parseFloat(i.value); if (v > 0) { S.presets[+i.dataset.i] = v; i.value = v.toFixed(2); save(); } }));
  [["sd", "sound"], ["jg", "jingle"], ["vb", "vibrate"], ["ap", "addlPay"]].forEach(([id, k]) => ($("#" + id).onchange = (e) => { S[k] = e.target.checked; save(); if (e.target.checked && k !== "addlPay") feedback(); }));
  $("#pn").onchange = (e) => { S.name = e.target.value.trim(); save(); drawer("settings"); };
  $("#pe").onchange = (e) => { S.email = e.target.value.trim(); save(); };
  $("#addP").onclick = async () => {
    const v = await modal({ title: "Add Additional Pushka", body: `<input class="field" id="np" maxlength="24" placeholder="Name, e.g. Kids' Pushka">`, buttons: [{ label: "Cancel", sec: true, v: null }, { label: "Add", get: (el) => $("#np", el).value.trim() }] });
    if (v) { const p = { id: uid(), name: v }; S.pushkas.push(p); S.cur = p.id; save(); location.hash = "pushka"; }
  };
  $("#delAcc").onclick = async () => {
    const ok = await modal({ title: "Delete Account?", body: "<p>This erases your pushka, history and settings from this device.</p>", buttons: [{ label: "Cancel", sec: true, v: false }, { label: "Delete", v: true }] });
    if (ok) { S = defaults(); save(); location.hash = "pushka"; render(); }
  };
};

V.support = () => {
  $("#title").textContent = "Support";
  $("#view").innerHTML = `<div class="support"><p>Questions about the pushka or your donations? We're happy to help.</p>
    <p><b>${ORG}</b><br>Email: <a href="mailto:rabbi@chabadoflamorinda.com">rabbi@chabadoflamorinda.com</a><br>Web: <a href="https://www.chabadoflamorinda.com" target="_blank" rel="noopener">chabadoflamorinda.com</a></p>
    <p><a href="../">← Back to our website</a></p></div>`;
};

// ---------- router ----------
function render() {
  const r = (location.hash || "#pushka").slice(1);
  const name = V[r] ? r : "pushka";
  drawer(name); openMenu(false); V[name]();
}
window.addEventListener("hashchange", render);
render();
$("#app").hidden = false;
setTimeout(() => { $("#splash").classList.add("out"); setTimeout(() => $("#splash").remove(), 450); }, 900);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
loadCandles(); setInterval(reminderTick, 30000); setTimeout(reminderTick, 2000); setTimeout(autoEmptyCheck, 1500);
