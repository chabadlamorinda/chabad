// ===== My Pushka · Chabad of Lamorinda =====
// Visual system from the design handoff ("Classical"). Features: pushkas, wallet, reminders,
// maaser calculator, segulos & prayers, settings, profile.
const DONATE_URL = "https://www.chabadoflamorinda.com/donate"; // replace with the real donation page
const CANDLE_ZIP = "94549";                                      // Lafayette, CA
const SITE_EMAIL = "rabbi@chabadoflamorinda.com";
const KEY = "lamorinda-pushka-v4";
const MERIT = "In the merit of Rabbi Meir Baal HaNes";

const FUNDS = [
  { id: "general", name: "General Fund", desc: "Where it’s needed most", long: "Supports the day-to-day work of Chabad of Lamorinda: holiday programs, Shabbat dinners and outreach across Lafayette, Moraga and Orinda." },
  { id: "school", name: "Hebrew School", desc: "Tuition aid and classroom supplies", long: "Helps every child attend Hebrew School regardless of means, and keeps classrooms stocked with books and materials." },
  { id: "shabbat", name: "Shabbat & Kiddush", desc: "Weekly meals for the community", long: "Sponsors the weekly Kiddush and community Shabbat meals that bring families together." },
  { id: "chesed", name: "Chesed Fund", desc: "Quiet help for families in need", long: "Provides confidential assistance with groceries, rent and emergencies for local families." },
];
const GIVE_AMTS = [18, 36, 72, 180];
const METHOD = { online: "Online", check: "Check", wire: "Wire", daf: "DAF" };
const EMPTY_MODES = { manual: "Manual empty", full: "When full", friday: "Every Friday", monthly: "Monthly" };

// Payment seam. Until a payment server + Stripe exist, gifts are completed on the donation page.
const PAY = { connected: false, card: null, charge: null };

// ---------- helpers ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nl = (s) => esc(s).replace(/\n/g, "<br>");
const uid = () => Math.random().toString(36).slice(2, 10);
const r2 = (n) => Math.round(n * 100) / 100;
const fundOf = (id) => FUNDS.find((f) => f.id === id) || FUNDS[0];
const money = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: Number.isInteger(+n) ? 0 : 2, maximumFractionDigits: 2 }).format(n);
const money2 = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
const dkey = (d) => d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate();
const isWk = (d) => d.getDay() >= 1 && d.getDay() <= 5;
const hebFull = (d) => new Intl.DateTimeFormat("en-u-ca-hebrew", { day: "numeric", month: "long", year: "numeric" }).format(d).replace(/ AM$/, "");
const hebYear = (d) => new Intl.DateTimeFormat("en-u-ca-hebrew", { year: "numeric" }).format(d).replace(/\D/g, "");
const hebDay = (d) => +new Intl.DateTimeFormat("en-u-ca-hebrew", { day: "numeric" }).format(d).replace(/\D/g, "");
const greg = (d) => new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(d);
const clock = (d) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const when = (t) => {
  const d = new Date(t), now = new Date(), y = new Date(now - 864e5);
  if (d.toDateString() === now.toDateString()) return "Today · " + clock(d);
  if (d.toDateString() === y.toDateString()) return "Yesterday · " + clock(d);
  return greg(d);
};

// ---------- state ----------
const walletId = () => { const n = String(Math.floor(Math.random() * 1e6)).padStart(6, "0"); return n.slice(0, 3) + "-" + n.slice(3); };
const def = () => ({
  name: "", email: "", billingEmail: "", phone: "", address: "",
  pushkas: [{ id: "p1", name: "", balance: 0, drops: 0 }], cur: "p1",
  goal: 36, presets: [1.8, 5, 18], emptyMode: "manual",
  sound: true, jingle: true, confetti: true, vibrate: true, partial: false, addl: false, bio: "",
  wallet: { id: walletId(), balance: 0 },
  history: [], recurring: null,
  rem: { candle: { on: false, mins: 15 }, streak: { on: false }, custom: [] },
  candles: [], notified: {}, maaser: 10, lastEmptied: Date.now(), prompted: "",
});
function load() {
  let o = null;
  try { o = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  if (!o) { try { const v = JSON.parse(localStorage.getItem("lamorinda-pushka-v3")); if (v) o = { name: v.name, email: v.email, history: v.history, pushkas: [{ id: "p1", name: "", balance: v.balance || 0, drops: v.drops || 0 }] }; } catch (e) {} }
  const b = def(), s = Object.assign({}, b, o || {});
  s.rem = Object.assign({}, b.rem, (o && o.rem) || {}); s.rem.candle = Object.assign({}, b.rem.candle, s.rem.candle);
  s.wallet = Object.assign({}, b.wallet, (o && o.wallet) || {});
  if (!Array.isArray(s.pushkas) || !s.pushkas.length) s.pushkas = b.pushkas;
  if (!s.pushkas.find((p) => p.id === s.cur)) s.cur = s.pushkas[0].id;
  return s;
}
let S = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
const P = () => S.pushkas.find((p) => p.id === S.cur) || S.pushkas[0];
const firstName = () => (S.name || "").trim().split(/\s+/)[0];
const pTitle = (p) => p.name || (firstName() ? firstName() + "’s Pushka" : "My Pushka");
const U = { page: "home", stack: [], sheet: null, giveFund: null, giveAmt: 36, freq: "once", dedication: "", pending: null, segQ: "", segCat: "All", segId: null, maaserAmt: "", drawn: "" };
const pushHist = (h) => { S.history.unshift(h); if (S.history.length > 1000) S.history.length = 1000; };

// ---------- streak ----------
function streak() {
  const days = new Set(S.history.filter((h) => h.kind === "coin").map((h) => dkey(new Date(h.t))));
  let n = 0; const d = new Date();
  for (let i = 0; i < 800; i++) {
    if (isWk(d)) { if (days.has(dkey(d))) n++; else if (i > 0) break; }
    d.setDate(d.getDate() - 1);
  }
  return n;
}
const gaveToday = () => S.history.some((h) => h.kind === "coin" && dkey(new Date(h.t)) === dkey(new Date()));

// ---------- Tehillim monthly cycle ----------
const TEH = [[1, 9], [10, 17], [18, 22], [23, 28], [29, 34], [35, 38], [39, 43], [44, 48], [49, 54], [55, 59], [60, 65], [66, 68], [69, 71], [72, 76], [77, 78], [79, 82], [83, 87], [88, 89], [90, 96], [97, 103], [104, 105], [106, 107], [108, 112], [113, 118], [119, 119, "1-96"], [119, 119, "97-176"], [120, 134], [135, 139], [140, 144], [145, 150]];
function tehillimToday() {
  const d = new Date(), n = hebDay(d), tomorrow = new Date(d.getTime() + 864e5);
  const combined = n === 29 && hebDay(tomorrow) === 1;
  const lo = combined ? 140 : TEH[n - 1][0], hi = combined ? 150 : TEH[n - 1][1], part = combined ? "" : TEH[n - 1][2];
  const links = [];
  for (let c = lo; c <= hi; c++) links.push({ t: "Psalm " + c + (part ? ":" + part : ""), u: "https://www.sefaria.org/Psalms." + c + (part ? "." + part : "") });
  return { day: combined ? "29–30" : n, label: lo === hi ? "Psalm " + lo + (part ? ":" + part : "") : "Psalms " + lo + "–" + hi, links };
}

// ---------- icons (Lucide, 1.5 stroke) ----------
const ico = (d, s = 22, extra = "") => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
const I = {
  home: '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/>',
  give: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  profile: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  chev: '<path d="m9 18 6-6-6-6"/>', back: '<path d="m15 18-6-6 6-6"/>', check: '<path d="M20 6 9 17l-5-5"/>',
  card: '<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/>',
  gear: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  book: '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
  calc: '<rect width="16" height="20" x="4" y="2" rx="2"/><line x1="8" x2="16" y1="6" y2="6"/><path d="M16 10h.01M12 10h.01M8 10h.01M12 14h.01M8 14h.01M16 14v4M12 18h.01M8 18h.01"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  swap: '<path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>', lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  ext: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
};

// ---------- sound / feel ----------
let ac;
function tone(f, delay, dur, type = "sine", vol = 0.15) {
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === "suspended") ac.resume();
    const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + delay;
    o.type = type; o.frequency.value = f; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + 0.05);
  } catch (e) {}
}
function clink(n = 1, gap = 0.07, delay = 0.42) { // metallic clink per design spec
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === "suspended") ac.resume();
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
const buzz = (p) => { if (S.vibrate && navigator.vibrate) navigator.vibrate(p); };
function fanfare() { if (S.confetti) [[784, 0], [988, 0.1], [1175, 0.2], [1568, 0.3]].forEach(([f, t]) => tone(f, t, 0.35, "triangle", 0.12)); }
function confetti() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const c = document.createElement("canvas"); c.className = "confetti"; c.width = innerWidth; c.height = innerHeight; document.body.append(c);
  const g = c.getContext("2d"), cols = ["#b68235", "#e1ad66", "#2a5a9e", "#3b6cb3", "#facb8d", "#7d5411"];
  const ps = Array.from({ length: 140 }, () => ({ x: innerWidth / 2 + (Math.random() - 0.5) * 80, y: innerHeight * 0.55, vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 16 - 6, w: 5 + Math.random() * 6, h: 3 + Math.random() * 5, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: cols[(Math.random() * cols.length) | 0] }));
  let t = 0;
  (function f() {
    g.clearRect(0, 0, c.width, c.height);
    ps.forEach((p) => { p.vy += 0.45; p.x += p.vx; p.y += p.vy; p.vx *= 0.99; p.r += p.vr; g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); g.restore(); });
    if (++t < 150) requestAnimationFrame(f); else c.remove();
  })();
}
function toast(msg) {
  const t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); t.textContent = msg; document.body.append(t);
  setTimeout(() => t.remove(), 2600);
}

// ---------- sheets ----------
function sheet(html, onOpen) {
  $("#overlay").innerHTML = `<div class="scrim" data-act="closeSheet"></div><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
  if (onOpen) onOpen($("#overlay"));
}
const closeSheet = () => { $("#overlay").innerHTML = ""; };
const sheetBtns = (primary, secondary) => `<button class="btn btn-primary cta" data-act="${primary[0]}" ${primary[2] ? `data-v="${esc(primary[2])}"` : ""}>${primary[1]}</button>${secondary ? `<button class="btn btn-ghost" data-act="${secondary[0]}">${secondary[1]}</button>` : ""}`;
const infoSheet = (title, body) => sheet(`<div><h3>${esc(title)}</h3><div class="h-s" style="font-size:13px;margin-top:4px">${body}</div></div><button class="btn btn-primary cta" data-act="closeSheet">OK</button>`);

// ---------- candle times & notifications ----------
async function loadCandles() {
  try {
    const j = await (await fetch(`https://www.hebcal.com/shabbat?cfg=json&zip=${CANDLE_ZIP}&M=on`)).json();
    S.candles = (j.items || []).filter((i) => i.category === "candles").map((i) => i.date); save(); if (U.page === "home") draw();
  } catch (e) {}
}
const nextCandle = () => (S.candles || []).map((d) => new Date(d)).filter((d) => d > Date.now()).sort((a, b) => a - b)[0];
async function ensureNotify() {
  if (!("Notification" in window)) { toast("This browser can’t show notifications"); return false; }
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") { toast("Notifications are blocked in your browser settings"); return false; }
  const ok = await new Promise((res) => { sheet(`<div class="done"><div class="ck" style="color:var(--accent)">${ico(I.bell, 24)}</div><h3>Allow notifications</h3><div style="font-size:14px;max-width:280px">Please allow notifications so we can send you reminders.</div></div><button class="btn btn-primary cta" id="nyes">Confirm</button><button class="btn btn-ghost" id="nno">Cancel</button>`, (o) => { $("#nyes", o).onclick = () => { closeSheet(); res(true); }; $("#nno", o).onclick = () => { closeSheet(); res(false); }; }); });
  return ok && (await Notification.requestPermission()) === "granted";
}
async function notify(body) {
  try {
    const reg = navigator.serviceWorker && (await navigator.serviceWorker.getRegistration());
    if (reg) reg.showNotification("My Pushka", { body, icon: "icon.svg", tag: "pushka" }); else new Notification("My Pushka", { body, icon: "icon.svg" });
  } catch (e) {}
}
function mark(k) { S.notified[k] = 1; const ks = Object.keys(S.notified); if (ks.length > 80) ks.slice(0, ks.length - 80).forEach((x) => delete S.notified[x]); save(); }
function tick() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const now = Date.now(), d = new Date(), at = (h, m) => new Date(d).setHours(h, m, 0, 0), within = (t) => now >= t && now < t + 600e3;
  if (S.rem.candle.on) (S.candles || []).forEach((c) => { const t = new Date(c) - S.rem.candle.mins * 60e3, k = "c" + c; if (within(t) && !S.notified[k]) { mark(k); notify(`Candle lighting is in ${S.rem.candle.mins} minutes — it’s customary to give tzedakah first.`); } });
  if (S.rem.streak.on && !gaveToday()) {
    const candleDay = (S.candles || []).some((c) => dkey(new Date(c)) === dkey(d)), early = d.getDay() === 5 || candleDay;
    const t = early ? at(13, 0) : at(20, 0), k = "s" + dkey(d);
    if ((early || isWk(d)) && d.getDay() !== 6 && within(t) && !S.notified[k]) { mark(k); notify("Keep your streak alive — drop a coin in your pushka."); }
  }
  S.rem.custom.filter((r) => r.on).forEach((r) => {
    const [h, m] = r.time.split(":").map(Number), k = r.id + dkey(d), okDay = r.days === "daily" || (r.days === "weekdays" && isWk(d)) || (r.days === "friday" && d.getDay() === 5);
    if (okDay && within(at(h, m)) && !S.notified[k]) { mark(k); notify(r.text || "Time to give tzedakah!"); }
  });
}

// ---------- biometric lock (device passkey; local app lock) ----------
const b64 = (b) => btoa(String.fromCharCode(...new Uint8Array(b)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function bioSupported() { try { return !!(window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())); } catch (e) { return false; } }
async function bioEnable() {
  const cred = await navigator.credentials.create({ publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), rp: { name: "Chabad of Lamorinda" }, user: { id: crypto.getRandomValues(new Uint8Array(16)), name: "pushka", displayName: "My Pushka" }, pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }], authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" }, timeout: 60000 } });
  S.bio = b64(cred.rawId); save();
}
const bioUnlock = () => navigator.credentials.get({ publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), allowCredentials: [{ type: "public-key", id: unb64(S.bio) }], userVerification: "required", timeout: 60000 } });
function showLock() { const el = $("#lock"); el.hidden = false; el.innerHTML = `<div class="lock-in"><span style="color:var(--accent)">${ico(I.lock, 40)}</span><h2>My Pushka is locked</h2><button class="btn btn-primary" data-act="unlock" style="width:220px">Unlock</button><button class="btn btn-ghost" data-act="resetApp">Can’t unlock? Reset this app</button></div>`; }

// ---------- page chrome ----------
const TABS = [["home", "Pushka", I.home], ["give", "Give", I.give], ["wallet", "Wallet", I.wallet], ["history", "History", I.history], ["more", "More", I.more]];
const tabOf = (pg) => (["home", "give", "wallet", "history"].includes(pg) ? pg : "more");
const sub = (title, body) => `<div class="head sub"><button class="icon-btn" data-act="back" aria-label="Back">${ico(I.back, 24)}</button><h1>${esc(title)}</h1><span style="width:44px"></span></div><div class="scroll"><div class="col tight" style="padding-top:var(--s4)">${body}</div></div>`;
const tabTop = (title, right = "") => `<div class="page-h" style="display:flex;justify-content:space-between;align-items:flex-end;gap:10px"><h1>${esc(title)}</h1>${right}</div>`;
const rowLink = (act, v, icon, title, subt) => `<button class="row-btn" data-act="${act}" data-v="${esc(v)}"><span style="color:var(--accent);flex:none">${ico(icon, 22)}</span><div class="grow"><div class="fund-n">${esc(title)}</div>${subt ? `<div class="fund-d">${esc(subt)}</div>` : ""}</div><span style="color:var(--accent)">${ico(I.chev, 18)}</span></button>`;
const tg = (act, v, title, subt, on) => `<button class="row-btn" role="switch" aria-checked="${on}" data-act="${act}" data-v="${esc(v)}"><div class="grow"><div class="h-t">${title}</div>${subt ? `<div class="h-s">${subt}</div>` : ""}</div><div class="sw ${on ? "on" : ""}"></div></button>`;
const sec = (t) => `<h6 style="color:var(--n700);margin:var(--s3) 0 var(--s1)">${t}</h6>`;

// ---------- pages ----------
const PG = {};
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
const hex = (n) => `<svg width="44" height="50" viewBox="0 0 46 52" fill="none" aria-hidden="true"><path d="M23 2l19 11v26L23 50 4 39V13z" stroke="var(--accent)" stroke-width="1.5" stroke-linejoin="round"/><text x="23" y="33" text-anchor="middle" fill="var(--a800)" style="font:600 20px 'Cormorant Garamond',Georgia,serif">${n}</text></svg>`;

PG.home = () => {
  const p = P(), now = new Date(), c = nextCandle(), st = streak(), frac = Math.min(p.balance / S.goal, 1), top = 62, bot = 228, lvl = bot - frac * (bot - top);
  let reminder = "";
  if (c) {
    const title = c.getDay() === 5 ? `Shabbat candles Friday, ${clock(c)}` : `Candle lighting ${c.toLocaleDateString([], { weekday: "long" })}, ${clock(c)}`;
    const subt = S.rem.candle.on ? `It's customary to give before lighting. We'll remind you at ${clock(new Date(c - S.rem.candle.mins * 60e3))}.` : "It's customary to give before lighting. Turn on the reminder in Reminders.";
    reminder = `<div class="card">${ico(I.flame, 22, 'style="color:var(--accent);flex:none"')}<div style="flex:1"><div class="card-title">${esc(title)}</div><div class="h-s">${esc(subt)}</div></div></div>`;
  }
  const chips = S.pushkas.length > 1 ? `<div class="chips">${S.pushkas.map((x) => `<button class="chip ${x.id === p.id ? "on" : ""}" data-act="setCur" data-v="${x.id}">${esc(pTitle(x))}</button>`).join("")}</div>` : "";
  const msg = p.balance > 0 ? `<div class="h-t" style="font-size:20px">Your pushka has ${money2(p.balance)}</div><div class="h-s">${p.drops} coin${p.drops === 1 ? "" : "s"} since ${greg(new Date(S.lastEmptied))}</div>` : `<div class="h-t" style="font-size:20px">Your pushka is empty</div><div class="h-s">Add some coins now</div>`;
  return `<div class="head"><div><div class="kicker">Chabad of Lamorinda</div><h1>${esc(pTitle(p))}</h1></div><div style="display:flex;align-items:flex-end;gap:6px"><div class="dates"><div>${esc(greg(now))}</div><i>${esc(hebFull(now))}</i></div><button class="icon-btn sm" data-act="share" aria-label="Share">${ico(I.share, 20)}</button></div></div>
  <div class="scroll"><div class="col">${chips}
    <div class="streak">${hex(st)}<span>Weekday streak</span></div>
    <div class="msg">${msg}</div>
    <div class="tin"><div class="anchor" id="coinAnchor"></div><div class="wrap" data-act="dropPrimary" role="button" tabindex="0" aria-label="Drop ${money(S.presets[0])} in the pushka">${tin()}<div class="bal">${money2(p.balance)}</div>
      <div class="lv" style="top:${top - 10}px;left:-6px;transform:translateX(-100%)">${money(S.goal)} —</div><div class="lv" style="top:${lvl - 10}px;right:-6px;transform:translateX(100%)">— ${money2(p.balance)}</div></div></div>
    <div><div class="tap">Tap to drop a coin</div><div class="quick">${S.presets.map((a) => `<button class="btn btn-secondary" data-act="drop" data-v="${a}">${money(a)}</button>`).join("")}<button class="btn btn-secondary" data-act="other">Other</button></div></div>
    <button class="btn btn-primary cta" data-act="openEmpty" ${p.balance <= 0 ? "disabled" : ""}>Empty pushka to Chabad</button>
    <div class="row2"><button class="btn btn-ghost" data-act="donateNow">Donate now</button><button class="btn btn-ghost" data-act="go" data-v="settings">${ico(I.gear, 16)} Pushka settings</button></div>
    ${reminder}
  </div></div>`;
};

PG.give = () => {
  if (!U.giveFund) return `<div class="scroll" style="padding-top:calc(var(--s3) + env(safe-area-inset-top))"><div class="col" style="padding-top:0"><div class="page-h"><h1>Give</h1><div class="sub">A direct gift to one of our funds.</div></div>
    <div>${FUNDS.map((f) => `<button class="row-btn" data-act="fund" data-v="${f.id}"><div class="grow"><div class="fund-n">${esc(f.name)}</div><div class="fund-d">${esc(f.desc)}</div></div><span style="color:var(--accent)">${ico(I.chev, 18)}</span></button>`).join("")}</div></div></div>`;
  const f = fundOf(U.giveFund), cta = U.freq === "monthly" ? `Give ${money(U.giveAmt)} monthly` : `Give ${money(U.giveAmt)}`;
  return `<div class="scroll" style="padding-top:calc(var(--s3) + env(safe-area-inset-top))"><div class="col tight" style="padding-top:0">
    <button class="btn btn-ghost" data-act="allFunds" style="align-self:flex-start;padding-left:0">${ico(I.back, 16)}All funds</button>
    <div class="page-h"><div class="kicker">Give to</div><h2 style="margin:2px 0 4px">${esc(f.name)}</h2><p style="margin:0;font-size:13px;text-align:justify;color:var(--n800)">${esc(f.long)}</p></div>
    <div class="field"><label>Amount</label><div class="amts">${GIVE_AMTS.map((a) => `<button class="btn btn-secondary ${U.giveAmt === a ? "sel" : ""}" data-act="amt" data-v="${a}">${money(a)}</button>`).join("")}</div>
      <input class="input" id="giveCustom" data-inp="giveCustom" type="number" min="1" step="0.01" inputmode="decimal" placeholder="Other amount" style="margin-top:6px"></div>
    <div class="field"><label>Frequency</label><div class="seg"><label><input type="radio" name="freq" value="once" data-chg="freq" ${U.freq === "once" ? "checked" : ""}>One time</label><label><input type="radio" name="freq" value="monthly" data-chg="freq" ${U.freq === "monthly" ? "checked" : ""}>Monthly</label></div></div>
    <div class="field"><label for="ded">Dedication (optional)</label><input class="input" id="ded" data-inp="ded" maxlength="80" placeholder="In honor of / in memory of…" value="${esc(U.dedication)}"></div>
    <div class="h-s" style="display:flex;align-items:center;gap:8px;font-size:13px">${ico(I.card, 16)}${PAY.card ? esc(PAY.card) : "Payment completes on our secure donation page"}</div>
    <button class="btn btn-primary cta" id="giveCta" data-act="submitGive">${cta}</button></div></div>`;
};

PG.wallet = () => `<div class="scroll" style="padding-top:calc(var(--s3) + env(safe-area-inset-top))"><div class="col" style="padding-top:0">
  <div class="page-h"><h1>Wallet</h1><div class="sub">Set aside funds now for emptying your pushka later. <button class="link" data-act="walletLearn">Learn more</button></div></div>
  <div class="card" style="flex-direction:column;align-items:center;gap:4px;padding:var(--s4)"><div class="h-s" style="text-transform:uppercase;letter-spacing:.1em;font-size:11px">Your Wallet ID</div><div style="font:400 34px var(--heading);letter-spacing:.18em;color:var(--a700);font-feature-settings:'tnum'">${esc(S.wallet.id)}</div></div>
  <div style="text-align:center"><div class="h-s" style="text-transform:uppercase;letter-spacing:.1em;font-size:11px">Balance</div><div style="font:400 56px/1.1 var(--heading);font-feature-settings:'tnum'">${money2(S.wallet.balance)}</div></div>
  <button class="btn btn-secondary cta" data-act="addFunds">${ico(I.plus, 16)} Add funds</button>
  <div>${rowLink("walletSend", "", I.swap, "Send / request between wallets", "Empower friends and family with giving tzedakah")}${rowLink("autoRefill", "", I.gear, "Manage wallet auto refill", "Auto refill inactive")}${rowLink("walletHist", "", I.file, "Wallet transaction history", "")}</div>
  ${PAY.connected ? "" : `<p class="note">Card payments are not switched on yet, so wallet features unlock once Chabad of Lamorinda’s payment setup is complete.</p>`}
</div></div>`;

PG.history = () => {
  const yr = hebYear(new Date()), total = S.history.filter((h) => h.kind === "gift" && hebYear(new Date(h.t)) === yr).reduce((a, h) => a + h.amt, 0);
  const pn = (id) => { const x = S.pushkas.find((q) => q.id === id); return x ? pTitle(x) : ""; };
  const rows = S.history.length ? S.history.map((h) => `<div class="row-btn" style="cursor:default"><div class="grow"><div class="h-t">${esc(h.title)}</div><div class="h-s">${esc(when(h.t))}${h.meta ? " · " + esc(h.meta) : ""}${h.kind === "coin" && S.pushkas.length > 1 && pn(h.pid) ? " · " + esc(pn(h.pid)) : ""}</div></div><div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px"><div class="h-a">${money2(h.amt)}</div>${h.receipt ? '<span class="tag-accent">Receipt</span>' : ""}</div></div>`).join("") : `<div class="rowp">Nothing yet. Drop your first coin on the Pushka tab.</div>`;
  return `<div class="scroll" style="padding-top:calc(var(--s3) + env(safe-area-inset-top))"><div class="col tight" style="padding-top:0">
    <div class="page-h" style="display:flex;justify-content:space-between;align-items:flex-end"><h1>History</h1><div class="year"><div class="k">Given in ${esc(yr)}</div><div class="v">${money2(total)}</div></div></div>
    <div>${rows}</div><p class="note">Coins in your pushka are given when you empty it. ${PAY.connected ? "Tax receipts are issued for every gift sent to Chabad." : "Your receipt comes from our donation page after each gift."}</p></div></div>`;
};

PG.more = () => `<div class="scroll" style="padding-top:calc(var(--s3) + env(safe-area-inset-top))"><div class="col" style="padding-top:0"><div class="page-h"><h1>More</h1></div><div>
  ${rowLink("go", "segulot", I.book, "Segulot & Prayers", "Prayers, customs and blessings")}${rowLink("go", "maaser", I.calc, "Maaser Calculator", "Calculate your tenth")}${rowLink("go", "reminders", I.bell, "Reminders", "Candle lighting and daily coin")}
  ${rowLink("go", "settings", I.gear, "Settings", "Goal, amounts, sounds, pushkas")}${rowLink("go", "profile", I.profile, "Profile", S.name || "Name, email, address")}${rowLink("go", "support", I.help, "Support", "We’re happy to help")}</div>
  <a class="btn btn-ghost" href="../" style="align-self:flex-start;padding-left:0">${ico(I.back, 16)} Back to chabadoflamorinda.com</a></div></div>`;

// ----- segulos -----
const segFeat = () => SEG_FEATURED.map((id) => SEGULOS.find((s) => s.id === id));
const segHit = (s) => { const q = U.segQ.trim().toLowerCase(); return (!q || (s.title + " " + s.blurb + " " + s.cat).toLowerCase().includes(q)) && (U.segCat === "All" || s.cat === U.segCat); };
const segRow = (s, showCat) => `<button class="row-btn" data-act="seg" data-v="${s.id}"><div class="grow"><div class="fund-n">${esc(s.title)}</div>${showCat ? `<div class="kicker" style="margin-top:2px">${esc(s.cat)}</div>` : ""}<div class="fund-d clamp">${esc(s.blurb)}</div></div><span style="color:var(--accent)">${ico(I.chev, 18)}</span></button>`;
function segList() {
  const filtered = U.segQ.trim() || U.segCat !== "All";
  if (filtered) { const l = SEGULOS.filter(segHit); return l.length ? l.map((s) => segRow(s, true)).join("") : `<div class="rowp">No matches. Try another word.</div>`; }
  return `<div>${segFeat().map((s) => segRow(s, false)).join("")}</div>` + SEG_CATS.map((c) => `<h6 style="color:var(--n700);margin:var(--s4) 0 var(--s1)">${esc(c)}</h6>${SEGULOS.filter((s) => s.cat === c && !SEG_FEATURED.includes(s.id)).map((s) => segRow(s, false)).join("")}`).join("");
}
PG.segulot = () => sub("Segulot & Prayers", `<div class="field"><input class="input" id="segQ" data-inp="segQ" type="search" placeholder="Search ${SEGULOS.length} segulos…" aria-label="Search segulos" value="${esc(U.segQ)}"></div>
  <div class="chips" id="segChips">${["All", ...SEG_CATS].map((c) => `<button class="chip ${U.segCat === c ? "on" : ""}" data-act="segCat" data-v="${esc(c)}">${esc(c)}</button>`).join("")}</div>
  <div id="segList">${segList()}</div>
  <p class="note">Segulos are traditional customs and sources of inspiration, not guarantees. For questions of Jewish law, ask the Rabbi. Texts are provided for convenience.</p>`);
PG.segulah = () => {
  const s = SEGULOS.find((x) => x.id === U.segId) || SEGULOS[0];
  if (s.kind === "quotes") return PG.quotes();
  if (s.kind === "pledge") return PG.pledge();
  const acts = (s.act || []).map((a) => ({
    coin: `<button class="btn btn-primary cta" data-act="dropPrimary">Drop a coin in my pushka</button>`,
    give: `<button class="btn btn-secondary cta" data-act="giveGeneral">Give tzedakah</button>`,
    pledge: `<button class="btn btn-secondary cta" data-act="go" data-v="pledge">Pledge in the merit of Rabbi Meir</button>`,
    maaser: `<button class="btn btn-primary cta" data-act="go" data-v="maaser">Open the Maaser Calculator</button>`,
    reminders: `<button class="btn btn-secondary cta" data-act="go" data-v="reminders">Set a reminder</button>`,
  }[a] || "")).join("");
  let teh = ""; let links = s.links || [];
  if (s.kind === "tehillim") { const t = tehillimToday(); teh = `<div class="card" style="flex-direction:column;align-items:flex-start"><div class="kicker">Hebrew day ${t.day} of the month</div><div class="card-title" style="font-size:24px">${esc(t.label)}</div><div class="h-s">The Hebrew date changes at nightfall; this uses today’s calendar date.</div></div>`; links = t.links; }
  return sub(s.title, `<div class="kicker">${esc(s.cat)}</div>${teh}<p class="body-p">${nl(s.blurb)}</p>
    ${s.how ? `<h6 style="color:var(--n700)">How</h6><ol class="how">${s.how.map((h) => `<li>${esc(h)}</li>`).join("")}</ol>` : ""}
    ${s.he ? `<div class="hebrew" dir="rtl" lang="he">${nl(s.he)}</div>` : ""}${s.tr ? `<div class="tr">${esc(s.tr)}</div>` : ""}${s.en ? `<blockquote>${nl(s.en)}</blockquote>` : ""}
    ${s.src ? `<div class="src">Source: ${esc(s.src)}</div>` : ""}
    ${links.length ? `<div class="chips wrapchips">${links.map((l) => `<a class="chip" href="${esc(l.u)}" target="_blank" rel="noopener">${esc(l.t)} ${ico(I.ext, 12)}</a>`).join("")}</div>` : ""}${acts}`);
};
PG.quotes = () => sub("Selected Quotes from the Rebbe", `<p class="note">Paraphrased teachings and sayings, shared for inspiration. Please check exact wording against the Rebbe’s own words and sources.</p>${REBBE_QUOTES.map((q) => `<blockquote class="big"><p>“${esc(q.q)}”</p><footer>${esc(q.n)}</footer></blockquote>`).join("")}<button class="btn btn-primary cta" data-act="dropPrimary">Drop a coin in my pushka</button>`);
PG.pledge = () => sub("Pledge in the Merit of Rabbi Meir Baal HaNes", `<p class="body-p">Rabbi Meir Baal HaNes, “master of the miracle,” is a beloved source of blessing and salvation. It is customary to give tzedakah in his merit, especially when praying for help, for health, for a match or to find a lost item.</p>
  <p class="body-p">Your pledge goes to <b>Chabad of Lamorinda</b>, to help us serve the Jewish community of Lafayette, Moraga and Orinda.</p>
  <div class="hebrew" dir="rtl" lang="he">אֱלֹהֵי מֵאִיר עֲנֵנִי</div><div class="tr">Elokei Meir, aneini.</div>
  <button class="btn btn-primary cta" data-act="pledgeGo">Pledge now</button><button class="btn btn-ghost" data-act="dropPrimary">Or drop a coin in my pushka in his merit</button>`);

// ----- maaser -----
const maaserOut = () => { const a = parseFloat(U.maaserAmt) || 0; return r2((a * S.maaser) / 100); };
PG.maaser = () => sub("Maaser Calculator", `<div class="field"><label for="maa">Enter amount</label><div class="amt"><span>$</span><input class="input" id="maa" data-inp="maaserAmt" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Income or profit" value="${esc(U.maaserAmt)}"></div></div>
  <div class="card" style="flex-direction:column;align-items:stretch;gap:var(--s2)"><div style="display:flex;justify-content:space-between;align-items:center"><div class="kicker" style="color:var(--n700)">Maaser percentage</div><span class="tag-accent" id="maaPct" style="font-size:14px;padding:2px 12px">${S.maaser}%</span></div>
    <input type="range" id="maaRange" data-inp="maaserPct" data-chg="maaserSave" min="1" max="20" step="1" value="${S.maaser}" aria-label="Maaser percentage"><div style="display:flex;justify-content:space-between" class="h-s"><span>1%</span><span>10%</span><span>20%</span></div></div>
  <div class="card" style="flex-direction:column;gap:2px;padding:var(--s4)"><div class="h-s">Maaser amount</div><div id="maaOut" style="font:400 48px var(--heading);font-feature-settings:'tnum'">${money2(maaserOut())}</div></div>
  <button class="btn btn-secondary cta maaBtn" data-act="maaserPushka" ${maaserOut() > 0 ? "" : "disabled"}>Add to pushka</button>
  <button class="btn btn-secondary cta maaBtn" data-act="maaserWallet" ${maaserOut() > 0 ? "" : "disabled"}>Add to wallet</button>
  <button class="btn btn-primary cta maaBtn" data-act="maaserDonate" ${maaserOut() > 0 ? "" : "disabled"}>Donate now</button>
  <p class="note">Maaser (a tenth of income) is a traditional guideline; some give up to a fifth. Ask the Rabbi how it applies to your situation.</p>`);

// ----- reminders -----
PG.reminders = () => {
  const c = S.rem.candle, st = S.rem.streak;
  return sub("Reminders", `<div>
    <div class="row-btn"><button class="grow" data-act="candleMins" style="all:unset;cursor:pointer;flex:1"><div class="h-t">Before Candle Lighting</div><div class="h-s">Friday &amp; Holidays · ${c.mins} mins before</div></button><button role="switch" aria-checked="${c.on}" aria-label="Before candle lighting" data-act="remToggle" data-v="candle" style="all:unset;cursor:pointer"><div class="sw ${c.on ? "on" : ""}"></div></button></div>
    ${tg("remToggle", "streak", "Streak Reminder", `Weekdays · 8:00 pm<br>Every Friday &amp; before holidays · 1:00 pm`, st.on)}
    ${S.rem.custom.map((r) => `<div class="row-btn"><div class="grow"><div class="h-t">${esc(r.text || "Give tzedakah")}</div><div class="h-s">${{ weekdays: "Weekdays", daily: "Every day", friday: "Fridays" }[r.days]} · ${esc(clock(new Date("2000-01-01T" + r.time)))}</div></div><button class="icon-btn sm" data-act="remDel" data-v="${r.id}" aria-label="Delete reminder">${ico(I.trash, 18)}</button><button role="switch" aria-checked="${r.on}" aria-label="Reminder on" data-act="remToggle" data-v="${r.id}" style="all:unset;cursor:pointer"><div class="sw ${r.on ? "on" : ""}"></div></button></div>`).join("")}</div>
    <button class="btn btn-secondary cta" data-act="addRem">${ico(I.plus, 16)} Add reminder</button>
    <p class="note">Reminders arrive while the app is open or installed on your home screen. Candle times are for Lafayette, CA.</p>`);
};

// ----- settings & profile -----
PG.settings = () => sub("Settings", `${sec("Pushka")}
  <div class="field"><label for="goal">Pushka goal</label><div class="amt"><span>$</span><input class="input" id="goal" type="number" min="1" step="0.01" inputmode="decimal" data-chg="setGoal" value="${S.goal.toFixed(2)}"></div></div>
  <div class="field"><label>Preset amounts</label><div class="row3">${S.presets.map((a, i) => `<div class="amt">${i === 0 ? '<b class="primary-tag">Primary</b>' : ""}<span>$</span><input class="input" type="number" min="0.01" step="0.01" inputmode="decimal" aria-label="Preset ${i + 1}" data-chg="setPreset" data-i="${i}" value="${a.toFixed(2)}"></div>`).join("")}</div></div>
  <div class="field"><label for="emp">Empty pushka</label><select class="input" id="emp" data-chg="setEmpty">${Object.entries(EMPTY_MODES).map(([k, v]) => `<option value="${k}" ${S.emptyMode === k ? "selected" : ""}>${v}</option>`).join("")}</select></div>
  <div>${tg("tgl", "sound", "Sound", "Coin clink when you drop a coin", S.sound)}${tg("tgl", "jingle", "Coin jingle", "A shower of coins when you empty the pushka", S.jingle)}${tg("tgl", "confetti", "Confetti sound", "A celebration when your goal is reached", S.confetti)}${tg("tgl", "vibrate", "Vibration", "", S.vibrate)}${tg("tgl", "partial", "Partial payments", "Give part of your pushka and keep the rest", S.partial)}${tg("tgl", "addl", "Additional payment options", "Including check, wire, DAF", S.addl)}${tg("bio", "", "Biometric lock", "Unlock the app with your fingerprint, face or screen lock", !!S.bio)}</div>
  ${sec("My pushkas")}<div>${S.pushkas.map((p) => `<button class="row-btn" data-act="editPushka" data-v="${p.id}"><span style="color:var(--accent);flex:none">${ico(I.home, 22)}</span><div class="grow"><div class="fund-n">${esc(pTitle(p))}</div><div class="fund-d">${money2(p.balance)}${p.id === S.cur ? " · current" : ""}</div></div><span style="color:var(--accent)">${ico(I.pencil, 16)}</span></button>`).join("")}</div>
  <button class="btn btn-secondary cta" data-act="addPushka">${ico(I.plus, 16)} Add pushka</button>
  ${sec("Profile")}<div>${rowLink("go", "profile", I.profile, S.name || "Your profile", S.email || "Name, email, phone, address")}</div>`);

PG.profile = () => {
  const f = (k, l, v) => `<div class="row-btn" style="cursor:default"><div class="grow"><div class="h-s" style="text-transform:uppercase;letter-spacing:.08em;font-size:11px">${l}</div><div style="font-size:16px">${v ? esc(v) : "—"}</div></div><button class="icon-btn sm" data-act="editField" data-v="${k}" aria-label="Edit ${l}">${ico(I.pencil, 18)}</button></div>`;
  const rec = S.recurring ? `<div class="row-btn" style="cursor:default"><div class="grow"><div class="h-t">${money(S.recurring.amt)} monthly · ${esc(fundOf(S.recurring.fund).name)}</div><div class="h-s">Next charge on the 1st</div></div><button class="btn btn-ghost" data-act="cancelRec">Cancel</button></div>` : `<div class="rowp">No monthly gifts. Choose “Monthly” when giving to a fund.</div>`;
  return sub("Profile", `${f("name", "Name", S.name)}${f("email", "Email", S.email)}${f("billingEmail", "Billing email", S.billingEmail)}${f("phone", "Phone number", S.phone)}${f("address", "Mailing address", S.address)}
    ${sec("Recurring")}${rec}${sec("Payment")}<div class="row-btn" style="cursor:default"><span style="color:var(--accent)">${ico(I.card, 20)}</span><div class="grow" style="font-size:14px">${PAY.card ? esc(PAY.card) : "No card saved"}</div><button class="btn btn-ghost" data-act="cardInfo">${PAY.card ? "Change" : "Add"}</button></div>
    ${sec("Manage account")}<button class="row-btn" data-act="deleteAcct" style="color:#9b1c5a"><span style="flex:none">${ico(I.trash, 22)}</span><div class="grow" style="font-size:16px">Delete account?</div></button>`);
};
PG.support = () => sub("Support", `<p class="body-p">Questions about the pushka, your gifts or receipts? We’re happy to help.</p><div class="card" style="flex-direction:column;align-items:flex-start;gap:4px"><div class="card-title">Chabad of Lamorinda</div><a href="mailto:${SITE_EMAIL}">${SITE_EMAIL}</a><a href="https://www.chabadoflamorinda.com" target="_blank" rel="noopener">chabadoflamorinda.com</a></div>
  <p class="note">Tip: add this app to your home screen — in your browser menu choose “Add to Home Screen.”</p>`);

// ---------- rendering ----------
function draw() {
  const pg = PG[U.page] ? U.page : "home", prev = $(".scroll"), y = prev && U.drawn === pg ? prev.scrollTop : 0;
  $("#app").innerHTML = PG[pg]() + `<nav class="tabbar" aria-label="Main">${TABS.map(([id, l, ic]) => `<button class="tab ${tabOf(pg) === id ? "on" : ""}" data-act="tab" data-v="${id}" ${tabOf(pg) === id ? 'aria-current="page"' : ""}>${ico(ic)}<span>${l}</span></button>`).join("")}</nav>`;
  U.drawn = pg; const s = $(".scroll"); if (s) s.scrollTop = y;
}

// ---------- actions ----------
const A = {};
document.addEventListener("click", (e) => { const el = e.target.closest("[data-act]"); if (!el) return; const fn = A[el.dataset.act]; if (fn) { if (el.tagName === "A") return; e.preventDefault(); fn(el.dataset.v, el, e); } });
document.addEventListener("change", (e) => { const el = e.target.closest("[data-chg]"); if (el && A[el.dataset.chg]) A[el.dataset.chg](el.value, el, e); });
document.addEventListener("input", (e) => { const el = e.target.closest("[data-inp]"); if (el && A[el.dataset.inp]) A[el.dataset.inp](el.value, el, e); });
document.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target.matches('[role="button"][data-act]')) { e.preventDefault(); e.target.click(); } });

A.closeSheet = closeSheet;
A.tab = (v) => { U.stack = []; U.page = v; if (v === "give") U.giveFund = null; draw(); };
A.go = (v) => { U.stack.push(U.page); U.page = v; draw(); };
A.back = () => { U.page = U.stack.pop() || "more"; draw(); };
A.share = async () => { const d = { title: "Chabad of Lamorinda · My Pushka", text: "Give tzedakah every day with the Chabad of Lamorinda pushka.", url: location.href.split("#")[0] }; try { if (navigator.share) await navigator.share(d); else { await navigator.clipboard.writeText(d.url); toast("Link copied"); } } catch (e) {} };
A.setCur = (v) => { S.cur = v; save(); draw(); };

// coins
function drop(a, title) {
  a = r2(a); if (!(a > 0) || a > 100000) return;
  const p = P(), before = p.balance;
  p.balance = r2(p.balance + a); p.drops++;
  pushHist({ kind: "coin", t: Date.now(), title: title || "Coin dropped", amt: a, pid: p.id });
  save(); if (S.sound) clink(p.balance > 20 ? 2 : 1, 0.09); buzz(30); draw();
  const an = $("#coinAnchor"); if (an) { const c = document.createElement("div"); c.className = "coin"; c.textContent = money(a); an.append(c); setTimeout(() => c.remove(), 800); }
  if (before < S.goal && p.balance >= S.goal) setTimeout(() => { fanfare(); confetti(); toast("Your pushka is full! 🎉"); if (S.emptyMode === "full") setTimeout(openEmpty, 1400); }, 700);
}
A.drop = (v) => drop(parseFloat(v));
A.dropPrimary = () => { drop(S.presets[0]); if (U.page !== "home") toast(`${money(S.presets[0])} added to your pushka`); };
A.other = () => sheet(`<h3>Drop a coin</h3><div class="field"><label for="oa">Amount</label><input class="input" id="oa" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="$0.00"></div>${sheetBtns(["otherGo", "Drop in pushka"], ["closeSheet", "Cancel"])}`, () => setTimeout(() => $("#oa") && $("#oa").focus(), 60));
A.otherGo = () => { const v = parseFloat($("#oa").value); if (!(v > 0) || v > 100000) return toast("Enter a valid amount"); closeSheet(); drop(v); };

// emptying & giving
function openEmpty() {
  const p = P(); if (p.balance <= 0) return toast("Your pushka is empty");
  sheet(`<div><h3>Empty your pushka</h3><div class="h-s" style="font-size:13px">${PAY.connected ? `${money2(p.balance)} will be charged to ${esc(PAY.card || "your card")} and sent to:` : `${money2(p.balance)} will be given to Chabad of Lamorinda. Choose a fund:`}</div></div>
    ${S.partial ? `<div class="field"><label for="ea">Amount to give (up to ${money2(p.balance)})</label><input class="input" id="ea" type="number" min="0.01" max="${p.balance}" step="0.01" value="${p.balance}"></div>` : ""}
    <div>${FUNDS.map((f, i) => `<label class="radio"><input type="radio" name="fund" value="${f.id}" ${i === 0 ? "checked" : ""}><span class="dot"></span><span class="nm">${esc(f.name)}</span></label>`).join("")}</div>
    ${S.addl ? `<div class="field"><label>Pay by</label><div class="seg">${Object.entries(METHOD).map(([k, v], i) => `<label><input type="radio" name="pm" value="${k}" ${i === 0 ? "checked" : ""}>${v}</label>`).join("")}</div></div>` : ""}
    <button class="btn btn-primary cta" data-act="confirmEmpty">${PAY.connected ? "Send" : "Give"} ${S.partial ? "" : money2(p.balance)}</button>`);
}
A.openEmpty = openEmpty;
A.confirmEmpty = () => {
  const p = P(); let amt = p.balance;
  if (S.partial) { amt = r2(parseFloat($("#ea").value)); if (!(amt > 0 && amt <= p.balance + 1e-9)) return toast("Enter an amount up to " + money2(p.balance)); }
  const fund = ($("input[name=fund]:checked") || {}).value || "general", method = ($("input[name=pm]:checked") || {}).value || "online";
  closeSheet(); startGift({ amt, fund, freq: "once", ded: "", fromPushka: true, method, pid: p.id });
};
A.donateNow = () => sheet(`<div><h3>Donate now</h3><div class="h-s" style="font-size:13px">Give directly to Chabad of Lamorinda.</div></div><div class="field"><label for="dn">Amount</label><input class="input" id="dn" type="number" min="1" step="0.01" inputmode="decimal" value="${P().balance || 18}"></div>${sheetBtns(["donateGo", "Donate"], ["closeSheet", "Cancel"])}`);
A.donateGo = () => { const v = parseFloat($("#dn").value); if (!(v > 0) || v > 100000) return toast("Enter a valid amount"); closeSheet(); startGift({ amt: r2(v), fund: "general", freq: "once", ded: "", fromPushka: false, method: "online", pid: P().id }); };
A.fund = (v) => { Object.assign(U, { giveFund: v, giveAmt: 36, freq: "once", dedication: "" }); draw(); };
A.allFunds = () => { U.giveFund = null; draw(); };
A.giveGeneral = () => { Object.assign(U, { giveFund: "general", giveAmt: 36, freq: "once", dedication: "" }); U.stack = []; U.page = "give"; draw(); };
A.pledgeGo = () => { Object.assign(U, { giveFund: "general", giveAmt: 36, freq: "once", dedication: MERIT }); U.stack = []; U.page = "give"; draw(); };
A.amt = (v) => { U.giveAmt = +v; draw(); };
A.giveCustom = (v) => { const n = parseFloat(v); if (n > 0) { U.giveAmt = r2(n); $$(".amts .btn").forEach((b) => b.classList.remove("sel")); const c = $("#giveCta"); if (c) c.textContent = U.freq === "monthly" ? `Give ${money(U.giveAmt)} monthly` : `Give ${money(U.giveAmt)}`; } };
A.freq = (v) => { U.freq = v; draw(); };
A.ded = (v) => { U.dedication = v; };
A.submitGive = () => { if (!(U.giveAmt > 0) || U.giveAmt > 100000) return toast("Enter a valid amount"); startGift({ amt: U.giveAmt, fund: U.giveFund, freq: U.freq, ded: U.dedication.trim(), fromPushka: false, method: "online", pid: P().id }); };

const donateLink = (p) => `${DONATE_URL}?amount=${encodeURIComponent(p.amt)}&fund=${encodeURIComponent(p.fund)}&frequency=${p.freq}${p.ded ? "&dedication=" + encodeURIComponent(p.ded) : ""}`;
async function startGift(p) {
  if (p.method && p.method !== "online") return offlineSheet(p);
  if (PAY.connected && PAY.charge) { try { await PAY.charge({ amount: p.amt, fundId: p.fund, frequency: p.freq, dedication: p.ded }); } catch (e) { return toast(e.message || "Payment failed. Please try again."); } return completeGift(p); }
  U.pending = p;
  sheet(`<div><h3>Finish your gift</h3><div class="h-s" style="font-size:13px">We opened our secure donation page for ${money2(p.amt)} to the ${esc(fundOf(p.fund).name)}${p.freq === "monthly" ? ", monthly" : ""}. Complete it there, then come back and tap below.</div></div><button class="btn btn-secondary cta" data-act="reopen">Open donation page again</button>${sheetBtns(["finished", "I’ve completed my gift"], ["closeSheet", "Not yet"])}`);
  window.open(donateLink(p), "_blank", "noopener");
}
A.reopen = () => window.open(donateLink(U.pending), "_blank", "noopener");
A.finished = () => completeGift(U.pending);
function offlineSheet(p) {
  U.pending = p; const m = METHOD[p.method], body = encodeURIComponent(`Hello,\n\nI would like to give ${money2(p.amt)} to the ${fundOf(p.fund).name} by ${m}. Please send me the details.\n\nThank you,\n${S.name}`);
  sheet(`<div><h3>Give by ${m.toLowerCase()}</h3><div class="h-s" style="font-size:13px">Please contact us for ${m.toLowerCase()} details for ${money2(p.amt)} to the ${esc(fundOf(p.fund).name)}. Once you’ve sent it, tap below. We’ll record it as pending until it is received.</div></div><a class="btn btn-secondary cta" href="mailto:${SITE_EMAIL}?subject=${encodeURIComponent("Pushka gift by " + m)}&body=${body}">Email for details</a>${sheetBtns(["finished", "I’ve sent it"], ["closeSheet", "Not yet"])}`);
}
function completeGift(p) {
  const f = fundOf(p.fund), t = Date.now(), pu = S.pushkas.find((x) => x.id === p.pid) || P(), offline = p.method && p.method !== "online";
  if (p.fromPushka) { pu.balance = r2(pu.balance - p.amt); if (pu.balance < 0.005) { pu.balance = 0; pu.drops = 0; S.lastEmptied = t; } if (S.jingle) clink(7, 0.06, 0); }
  pushHist({ kind: "gift", t, amt: p.amt, receipt: PAY.connected && !offline, title: (p.fromPushka ? "Pushka emptied → " : "") + f.name, meta: [p.freq === "monthly" ? "Monthly" : p.fromPushka ? "" : "One time", offline ? METHOD[p.method] + " (pending)" : "", p.ded].filter(Boolean).join(" · ") });
  if (PAY.connected && p.freq === "monthly") S.recurring = { amt: p.amt, fund: p.fund };
  save(); buzz([60, 40, 60]); fanfare(); confetti(); U.pending = null; U.giveFund = null; draw();
  sheet(`<div class="done"><div class="ck" style="color:var(--accent)">${ico(I.check, 24)}</div><h3>Todah rabah</h3><div style="font-size:14px;max-width:280px">${money2(p.amt)} is on its way to the ${esc(f.name)}.</div><div class="h-s">${PAY.connected && S.email ? `A tax receipt is on its way to ${esc(S.email)}.` : offline ? "We’ll confirm once your gift is received." : "Your receipt will be emailed by our donation page."}</div></div><button class="btn btn-primary cta" data-act="closeSheet">Done</button>`);
}
function autoEmpty() {
  const p = P(), now = new Date(); if (p.balance <= 0 || S.emptyMode === "manual" || S.prompted === dkey(now)) return;
  const last = new Date(S.lastEmptied), due = (S.emptyMode === "full" && p.balance >= S.goal) || (S.emptyMode === "friday" && now.getDay() === 5) || (S.emptyMode === "monthly" && (now.getMonth() !== last.getMonth() || now.getFullYear() !== last.getFullYear()));
  if (due) { S.prompted = dkey(now); save(); openEmpty(); }
}

// wallet
A.walletLearn = () => infoSheet("About the wallet", "Your wallet holds funds you set aside for tzedakah, so emptying your pushka later is quick and simple. Add funds, send or request between friends’ wallets, and set auto refill. These features switch on once card payments are connected.");
const needPay = (what) => infoSheet(what, "This isn’t available yet. Chabad of Lamorinda’s card payments haven’t been switched on, so we can’t safely hold or move money. It will turn on as soon as payments are connected.");
A.addFunds = () => needPay("Add funds"); A.walletSend = () => needPay("Send / request between wallets"); A.autoRefill = () => needPay("Wallet auto refill");
A.walletHist = () => infoSheet("Wallet transaction history", "No wallet transactions yet.");

// maaser
A.maaserAmt = (v) => { U.maaserAmt = v; const o = maaserOut(); $("#maaOut").textContent = money2(o); $$(".maaBtn").forEach((b) => (b.disabled = !(o > 0))); };
A.maaserPct = (v) => { S.maaser = +v; $("#maaPct").textContent = v + "%"; const o = maaserOut(); $("#maaOut").textContent = money2(o); $$(".maaBtn").forEach((b) => (b.disabled = !(o > 0))); };
A.maaserSave = () => save();
A.maaserPushka = () => { const o = maaserOut(); if (o > 0) { drop(o, "Maaser added"); toast(money2(o) + " added to your pushka"); } };
A.maaserWallet = () => needPay("Add to wallet");
A.maaserDonate = () => { const o = maaserOut(); if (o > 0) startGift({ amt: o, fund: "general", freq: "once", ded: "Maaser", fromPushka: false, method: "online", pid: P().id }); };

// segulos
A.seg = (v) => { U.segId = v; const s = SEGULOS.find((x) => x.id === v); U.stack.push(U.page); U.page = s.kind === "quotes" ? "quotes" : s.kind === "pledge" ? "pledge" : "segulah"; draw(); };
A.segQ = (v) => { U.segQ = v; $("#segList").innerHTML = segList(); };
A.segCat = (v) => { U.segCat = v; $("#segChips").innerHTML = ["All", ...SEG_CATS].map((c) => `<button class="chip ${U.segCat === c ? "on" : ""}" data-act="segCat" data-v="${esc(c)}">${esc(c)}</button>`).join(""); $("#segList").innerHTML = segList(); };

// reminders
A.remToggle = async (v) => {
  const r = v === "candle" ? S.rem.candle : v === "streak" ? S.rem.streak : S.rem.custom.find((x) => x.id === v); if (!r) return;
  if (!r.on && !(await ensureNotify())) return;
  r.on = !r.on; save(); if (r.on && v === "candle") loadCandles(); draw();
};
A.remDel = (v) => { S.rem.custom = S.rem.custom.filter((x) => x.id !== v); save(); draw(); };
A.candleMins = () => sheet(`<h3>Before candle lighting</h3><div class="field"><label>Remind me</label><div class="seg">${[10, 15, 30, 60].map((m) => `<label><input type="radio" name="cm" value="${m}" ${S.rem.candle.mins === m ? "checked" : ""}>${m} min</label>`).join("")}</div></div>${sheetBtns(["candleSave", "Save"], ["closeSheet", "Cancel"])}`);
A.candleSave = () => { S.rem.candle.mins = +($("input[name=cm]:checked") || { value: 15 }).value; save(); closeSheet(); draw(); };
A.addRem = () => sheet(`<h3>Add reminder</h3><div class="field"><label for="rt">Time</label><input class="input" id="rt" type="time" value="09:00"></div><div class="field"><label>Repeat</label><div class="seg"><label><input type="radio" name="rd" value="weekdays" checked>Weekdays</label><label><input type="radio" name="rd" value="daily">Every day</label><label><input type="radio" name="rd" value="friday">Fridays</label></div></div><div class="field"><label for="rx">Message (optional)</label><input class="input" id="rx" maxlength="60" placeholder="Time to give tzedakah!"></div>${sheetBtns(["remSave", "Save"], ["closeSheet", "Cancel"])}`);
A.remSave = async () => { const time = $("#rt").value; if (!time) return toast("Choose a time"); const r = { id: uid(), time, days: ($("input[name=rd]:checked") || {}).value || "weekdays", text: $("#rx").value.trim(), on: true }; closeSheet(); if (!(await ensureNotify())) return; S.rem.custom.push(r); save(); draw(); };

// settings
A.setGoal = (v) => { const n = parseFloat(v); if (n >= 1 && n <= 100000) { S.goal = r2(n); save(); } draw(); };
A.setPreset = (v, el) => { const n = parseFloat(v); if (n > 0 && n <= 10000) { S.presets[+el.dataset.i] = r2(n); save(); } draw(); };
A.setEmpty = (v) => { S.emptyMode = v; save(); };
A.tgl = (k) => { S[k] = !S[k]; save(); if (S[k] && k === "sound") clink(1, 0, 0); draw(); };
A.bio = async () => {
  if (S.bio) { S.bio = ""; save(); draw(); return toast("Biometric lock off"); }
  if (!(await bioSupported())) return toast("This device doesn’t support a screen-lock unlock");
  try { await bioEnable(); toast("Biometric lock on"); } catch (e) { toast("Couldn’t turn on the lock"); } draw();
};
A.unlock = async () => { try { await bioUnlock(); $("#lock").hidden = true; } catch (e) { toast("Unlock failed. Try again."); } };
A.addPushka = () => sheet(`<h3>Add pushka</h3><div class="field"><label for="np">Name</label><input class="input" id="np" maxlength="24" placeholder="e.g. Kids’ pushka"></div>${sheetBtns(["pushkaAdd", "Add"], ["closeSheet", "Cancel"])}`, () => setTimeout(() => $("#np") && $("#np").focus(), 60));
A.pushkaAdd = () => { const n = $("#np").value.trim(); if (!n) return toast("Enter a name"); const p = { id: uid(), name: n, balance: 0, drops: 0 }; S.pushkas.push(p); S.cur = p.id; save(); closeSheet(); draw(); };
A.editPushka = (v) => { const p = S.pushkas.find((x) => x.id === v); sheet(`<h3>${esc(pTitle(p))}</h3><div class="field"><label for="rn">Name</label><input class="input" id="rn" maxlength="24" value="${esc(p.name)}" placeholder="${esc(pTitle({ name: "" }))}"></div><button class="btn btn-primary cta" data-act="pushkaSave" data-v="${p.id}">Save</button><button class="btn btn-secondary cta" data-act="setCur" data-v="${p.id}">Make current</button>${S.pushkas.length > 1 ? `<button class="btn btn-ghost" data-act="pushkaDel" data-v="${p.id}">Delete this pushka</button>` : ""}`); };
A.pushkaSave = (v) => { const p = S.pushkas.find((x) => x.id === v); p.name = $("#rn").value.trim(); save(); closeSheet(); draw(); };
A.pushkaDel = (v) => { const p = S.pushkas.find((x) => x.id === v); if (p.balance > 0) return sheet(`<div><h3>Delete this pushka?</h3><div class="h-s" style="font-size:13px">It holds ${money2(p.balance)}. Deleting it removes that amount from your pushka. Consider emptying it first.</div></div><button class="btn btn-primary cta" data-act="pushkaDelGo" data-v="${p.id}" style="color:#9b1c5a;border-color:#9b1c5a">Delete anyway</button><button class="btn btn-ghost" data-act="closeSheet">Cancel</button>`); A.pushkaDelGo(v); };
A.pushkaDelGo = (v) => { S.pushkas = S.pushkas.filter((x) => x.id !== v); if (S.cur === v) S.cur = S.pushkas[0].id; save(); closeSheet(); draw(); };
const FIELDS = { name: ["Name", "text", "name"], email: ["Email", "email", "email"], billingEmail: ["Billing email", "email", "email"], phone: ["Phone number", "tel", "tel"], address: ["Mailing address", "text", "street-address"] };
A.editField = (k) => { const [l, t, ac] = FIELDS[k]; sheet(`<h3>${l}</h3><div class="field"><label for="ef">${l}</label><input class="input" id="ef" type="${t}" autocomplete="${ac}" maxlength="120" value="${esc(S[k])}"></div><button class="btn btn-primary cta" data-act="fieldSave" data-v="${k}">Save</button>`, () => setTimeout(() => $("#ef") && $("#ef").focus(), 60)); };
A.fieldSave = (k) => { S[k] = $("#ef").value.trim(); save(); closeSheet(); draw(); };
A.cancelRec = () => { S.recurring = null; save(); draw(); };
A.cardInfo = () => infoSheet("Payment", "Saving a card for automatic giving isn’t switched on yet. For now each gift is completed on our secure donation page, and your card details never touch this app.");
const wipe = () => { try { localStorage.removeItem(KEY); } catch (e) {} location.reload(); };
A.deleteAcct = () => sheet(`<div><h3>Delete account?</h3><div class="h-s" style="font-size:13px">This erases your pushkas, history and settings from this device. Gifts you already made are not affected.</div></div><button class="btn btn-primary cta" data-act="wipe" style="color:#9b1c5a;border-color:#9b1c5a">Delete everything</button><button class="btn btn-ghost" data-act="closeSheet">Cancel</button>`);
A.wipe = wipe;
A.resetApp = (v, el) => { if (el.dataset.armed) return wipe(); el.dataset.armed = "1"; el.textContent = "Tap again to erase this app’s data"; setTimeout(() => { el.dataset.armed = ""; el.textContent = "Can’t unlock? Reset this app"; }, 5000); };

// ---------- start ----------
draw();
if (S.bio) { showLock(); A.unlock(); }
loadCandles(); setInterval(tick, 30000); setTimeout(tick, 2000); setTimeout(autoEmpty, 1500);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
