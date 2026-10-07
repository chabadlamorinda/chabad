// ===== My Pushka · Chabad of Lamorinda =====
// Visual system from the design handoff ("Classical"). English and Hebrew (RTL).
// Cards are saved and charged through our own Stripe-backed server (/api); the donation-page
// redirect below is only a fallback used when the server has no Stripe keys yet.
const DONATE_URL = "https://www.chabadoflamorinda.com/donate";
const CANDLE_ZIP = "94549";                                      // Lafayette, CA
const SITE_EMAIL = "rabbi@chabadoflamorinda.com";
const KEY = "lamorinda-pushka-v4";

const FUNDS = [
  { id: "general", name: "General Fund", desc: "Where it’s needed most", long: "Supports the day-to-day work of Chabad of Lamorinda: holiday programs, Shabbat dinners and outreach across Lafayette, Moraga and Orinda." },
  { id: "school", name: "Hebrew School", desc: "Tuition aid and classroom supplies", long: "Helps every child attend Hebrew School regardless of means, and keeps classrooms stocked with books and materials." },
  { id: "shabbat", name: "Shabbat & Kiddush", desc: "Weekly meals for the community", long: "Sponsors the weekly Kiddush and community Shabbat meals that bring families together." },
  { id: "chesed", name: "Chesed Fund", desc: "Quiet help for families in need", long: "Provides confidential assistance with groceries, rent and emergencies for local families." },
];
const GIVE_AMTS = [18, 36, 72, 180];
const METHOD = { online: "Online", check: "Check", wire: "Wire", daf: "DAF" };
const EMPTY_MODES = { manual: "Manual empty", full: "When full", friday: "Every Friday", monthly: "Monthly" };
const API = { enabled: false, pk: "", live: false, card: null, subs: null };

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

// ---------- state ----------
const walletId = () => { const n = String(Math.floor(Math.random() * 1e6)).padStart(6, "0"); return n.slice(0, 3) + "-" + n.slice(3); };
const detectLang = () => (/^he\b/i.test(navigator.language || "") ? "he" : "en");
const def = () => ({
  lang: detectLang(), name: "", email: "", billingEmail: "", phone: "", address: "", token: "", synced: "",
  pushkas: [{ id: "p1", name: "", balance: 0, drops: 0 }], cur: "p1",
  goal: 36, presets: [1.8, 5, 18], emptyMode: "manual",
  sound: true, jingle: true, confetti: true, vibrate: true, partial: false, addl: false, bio: "",
  wallet: { id: walletId(), balance: 0 },
  history: [],
  rem: { candle: { on: false, mins: 15 }, streak: { on: false }, custom: [] },
  candles: [], notified: {}, maaser: 10, lastEmptied: Date.now(), prompted: "",
});
function load() {
  let o = null;
  try { o = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  if (!o) { try { const v = JSON.parse(localStorage.getItem("lamorinda-pushka-v3")); if (v) o = { name: v.name, email: v.email, history: v.history, pushkas: [{ id: "p1", name: "", balance: v.balance || 0, drops: v.drops || 0 }] }; } catch (e) {} }
  const b = def(), s = Object.assign({}, b, o || {});
  s.rem = Object.assign({}, b.rem, (o && o.rem) || {}); s.rem.candle = Object.assign({}, b.rem.candle, s.rem.candle); s.rem.streak = Object.assign({}, b.rem.streak, s.rem.streak);
  if (!Array.isArray(s.rem.custom)) s.rem.custom = [];
  s.wallet = Object.assign({}, b.wallet, (o && o.wallet) || {});
  if (!Array.isArray(s.pushkas) || !s.pushkas.length) s.pushkas = b.pushkas;
  if (!s.pushkas.find((p) => p.id === s.cur)) s.cur = s.pushkas[0].id;
  return s;
}
let S = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
const P = () => S.pushkas.find((p) => p.id === S.cur) || S.pushkas[0];
const U = { page: "home", stack: [], pending: null, giveFund: null, giveAmt: 36, freq: "once", dedication: "", segQ: "", segCat: "All", segId: null, maaserAmt: "", drawn: "", busy: false, onClose: null };
const pushHist = (h) => { S.history.unshift(h); if (S.history.length > 1000) S.history.length = 1000; };

// ---------- language ----------
let LANG = S.lang === "he" ? "he" : "en";
const tpl = (k) => (LANG === "he" && typeof HE !== "undefined" && HE[k]) || k;
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (m, n) => (v && n in v ? v[n] : m));
const tt = (k, v) => fill(tpl(k), v);                 // plain text (toasts, notifications, attributes you escape yourself)
const t = (k, v) => fill(esc(tpl(k)), v);              // HTML-safe text; values in v must already be safe
const loc = () => (LANG === "he" ? "he-IL" : "en-US");
const hebFull = (d) => new Intl.DateTimeFormat(LANG === "he" ? "he-u-ca-hebrew" : "en-u-ca-hebrew", { day: "numeric", month: "long", year: "numeric" }).format(d).replace(/ AM$/, "");
const hebYearNum = (d) => new Intl.DateTimeFormat("en-u-ca-hebrew", { year: "numeric" }).format(d).replace(/\D/g, "");
const hebYearLabel = (d) => (LANG === "he" ? new Intl.DateTimeFormat("he-u-ca-hebrew", { year: "numeric" }).format(d) : hebYearNum(d));
const hebDay = (d) => +new Intl.DateTimeFormat("en-u-ca-hebrew", { day: "numeric" }).format(d).replace(/\D/g, "");
const greg = (d) => new Intl.DateTimeFormat(loc(), { weekday: "short", month: "short", day: "numeric" }).format(d);
const clock = (d) => d.toLocaleTimeString(loc(), { hour: "numeric", minute: "2-digit" });
const when = (ts) => {
  const d = new Date(ts), now = new Date(), y = new Date(now - 864e5);
  if (d.toDateString() === now.toDateString()) return tt("Today · {time}", { time: clock(d) });
  if (d.toDateString() === y.toDateString()) return tt("Yesterday · {time}", { time: clock(d) });
  return greg(d);
};
function applyLang() {
  LANG = S.lang === "he" ? "he" : "en";
  document.documentElement.lang = LANG; document.documentElement.dir = LANG === "he" ? "rtl" : "ltr";
  document.title = tt("My Pushka · Chabad of Lamorinda"); stripeP = null;
}
const firstName = () => (S.name || "").trim().split(/\s+/)[0];
const pTitle = (p) => p.name || (firstName() ? tt("{name}’s Pushka", { name: firstName() }) : tt("My Pushka"));
const catL = (c) => (LANG === "he" && typeof SEG_CATS_HE !== "undefined" && SEG_CATS_HE[c]) || c;
const SG = (s) => { if (LANG !== "he" || typeof SEGULOS_HE === "undefined" || !SEGULOS_HE[s.id]) return s; const h = SEGULOS_HE[s.id]; return Object.assign({}, s, { title: h.t, blurb: h.b, how: h.h || s.how, src: h.s || s.src, tr: "", en: "" }); };
const QUOTES = () => (LANG === "he" && typeof REBBE_QUOTES_HE !== "undefined" ? REBBE_QUOTES_HE : REBBE_QUOTES);
const linkText = (txt) => { if (LANG !== "he") return txt; const m = /^(?:Read )?Psalm (\d+)(?::([\d-]+))?$/.exec(txt); if (m) return tt("Psalm") + " " + m[1] + (m[2] ? ":" + m[2] : ""); return tt(txt); };

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
  const d = new Date(), n = hebDay(d), tomorrow = new Date(d.getTime() + 864e5), combined = n === 29 && hebDay(tomorrow) === 1;
  const lo = combined ? 140 : TEH[n - 1][0], hi = combined ? 150 : TEH[n - 1][1], part = combined ? "" : TEH[n - 1][2], links = [];
  for (let c = lo; c <= hi; c++) links.push({ t: "Psalm " + c + (part ? ":" + part : ""), u: "https://www.sefaria.org/Psalms." + c + (part ? "." + part : "") });
  const label = lo === hi ? tt("Psalm") + " " + lo + (part ? ":" + part : "") : tt("Psalms") + " " + lo + "–" + hi;
  return { day: combined ? "29–30" : n, label, links };
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
const FLIP = 'class="flip"';

// ---------- sound / feel ----------
let ac;
function tone(f, delay, dur, type = "sine", vol = 0.15) {
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === "suspended") ac.resume();
    const o = ac.createOscillator(), g = ac.createGain(), at = ac.currentTime + delay;
    o.type = type; o.frequency.value = f; g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(ac.destination); o.start(at); o.stop(at + dur + 0.05);
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
function fanfare() { if (S.confetti) [[784, 0], [988, 0.1], [1175, 0.2], [1568, 0.3]].forEach(([f, d]) => tone(f, d, 0.35, "triangle", 0.12)); }
function confetti() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const c = document.createElement("canvas"); c.className = "confetti"; c.width = innerWidth; c.height = innerHeight; document.body.append(c);
  const g = c.getContext("2d"), cols = ["#b68235", "#e1ad66", "#2a5a9e", "#3b6cb3", "#facb8d", "#7d5411"];
  const ps = Array.from({ length: 140 }, () => ({ x: innerWidth / 2 + (Math.random() - 0.5) * 80, y: innerHeight * 0.55, vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 16 - 6, w: 5 + Math.random() * 6, h: 3 + Math.random() * 5, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: cols[(Math.random() * cols.length) | 0] }));
  let n = 0;
  (function f() {
    g.clearRect(0, 0, c.width, c.height);
    ps.forEach((p) => { p.vy += 0.45; p.x += p.vx; p.y += p.vy; p.vx *= 0.99; p.r += p.vr; g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); g.restore(); });
    if (++n < 150) requestAnimationFrame(f); else c.remove();
  })();
}
function toast(msg) {
  const el = document.createElement("div"); el.className = "toast"; el.setAttribute("role", "status"); el.textContent = msg; document.body.append(el);
  setTimeout(() => el.remove(), 2800);
}

// ---------- sheets ----------
function sheet(html, onOpen, onClose, lock) {
  const prev = U.onClose; U.onClose = null; if (prev) prev();
  U.onClose = onClose || null;
  $("#overlay").innerHTML = `<div class="scrim" ${lock ? "" : 'data-act="closeSheet"'}></div><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
  if (onOpen) onOpen($("#overlay"));
}
function closeSheet() { const f = U.onClose; U.onClose = null; $("#overlay").innerHTML = ""; if (f) f(); }
const sheetBtns = (primary, secondary) => `<button class="btn btn-primary cta" data-act="${primary[0]}" ${primary[2] ? `data-v="${esc(primary[2])}"` : ""}>${primary[1]}</button>${secondary ? `<button class="btn btn-ghost" data-act="${secondary[0]}">${secondary[1]}</button>` : ""}`;
const infoSheet = (title, body) => sheet(`<div><h3>${esc(title)}</h3><div class="h-s" style="font-size:13px;margin-top:4px">${body}</div></div><button class="btn btn-primary cta" data-act="closeSheet">${t("OK")}</button>`);

// ---------- payments (our Stripe-backed server) ----------
const ERRS = { no_card: "Please add a card first.", invalid_amount: "Please enter an amount between $1 and $10,000.", invalid_fund: "Please choose a fund.", invalid_name: "Please enter your name.", invalid_email: "Please enter a valid email address.", unauthorized: "Please add your card again.", rate_limited: "Too many requests. Please wait a moment.", not_configured: "Card payments are not set up yet.", forbidden: "Not allowed.", network: "Can’t reach the server. Check your connection and try again.", authentication_required: "Your bank needs extra verification. Please try again." };
function errText(e) {
  if (e && e.code === "card_error") return LANG === "he" ? tt("Your card was declined. Please try another card.") : (e.message || tt("Your card was declined. Please try another card."));
  return tt(ERRS[e && e.code] || "Something went wrong. Please try again.");
}
async function api(path, opts = {}) {
  const headers = { "Content-Type": "application/json" }; if (S.token) headers.Authorization = "Bearer " + S.token;
  let r; try { r = await fetch("/api" + path, { method: opts.method || "GET", headers, body: opts.body ? JSON.stringify(opts.body) : undefined }); } catch (e) { throw Object.assign(new Error("network"), { code: "network" }); }
  let j = {}; try { j = await r.json(); } catch (e) {}
  if (!r.ok) { if (r.status === 401 && S.token) { S.token = ""; S.synced = ""; API.card = null; save(); } throw Object.assign(new Error(j.error || "Request failed"), { code: j.code || "server_error", status: r.status }); }
  return j;
}
const BRANDS = { visa: "Visa", mastercard: "Mastercard", amex: "American Express", discover: "Discover", diners: "Diners Club", jcb: "JCB", unionpay: "UnionPay" };
const cardLabel = () => (API.card ? (BRANDS[API.card.brand] || API.card.brand) + " •••• " + API.card.last4 : "");
async function refreshCard() { try { API.card = (await api("/payment-method")).card; } catch (e) { API.card = null; } }
async function loadSubs() { try { API.subs = (await api("/subscriptions")).subscriptions; } catch (e) { API.subs = []; } if (U.page === "profile") draw(); }
async function initPay() { try { const c = await api("/config"); if (c.enabled && c.publishableKey) { API.enabled = true; API.pk = c.publishableKey; API.live = !!c.livemode; if (S.token) await refreshCard(); } } catch (e) {} draw(); }
let stripeP = null;
function loadStripe() {
  if (stripeP) return stripeP;
  stripeP = new Promise((res, rej) => {
    const make = () => res(window.Stripe(API.pk, { locale: LANG === "he" ? "he" : "en" }));
    if (window.Stripe) return make();
    const s = document.createElement("script"); s.src = "https://js.stripe.com/v3/"; s.onload = make; s.onerror = () => { stripeP = null; rej(Object.assign(new Error("stripe-js"), { code: "network" })); };
    document.head.append(s);
  });
  return stripeP;
}
function askDetails() {
  return new Promise((res) => {
    sheet(`<div><h3>${t("Your details")}</h3><div class="h-s" style="font-size:13px">${t("We need your name and email to send your receipt.")}</div></div>
      <div class="field"><label for="dn1">${t("Name")}</label><input class="input" id="dn1" autocomplete="name" maxlength="100" value="${esc(S.name)}"></div>
      <div class="field"><label for="dn2">${t("Email")}</label><input class="input" id="dn2" type="email" autocomplete="email" maxlength="254" value="${esc(S.email)}"></div>
      <div id="dnErr" class="err" role="alert"></div><button class="btn btn-primary cta" id="dnGo">${t("Continue")}</button><button class="btn btn-ghost" data-act="closeSheet">${t("Cancel")}</button>`,
    (o) => { $("#dnGo", o).onclick = () => { const n = $("#dn1", o).value.trim(), e = $("#dn2", o).value.trim(); if (!n) { $("#dnErr", o).textContent = tt("Please enter your name."); return; } if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) { $("#dnErr", o).textContent = tt("Please enter a valid email address."); return; } S.name = n; S.email = e; save(); res(true); closeSheet(); }; },
    () => res(false));
  });
}
async function ensureCustomer() {
  if (!S.name || !S.email) { if (!(await askDetails())) return false; }
  const sig = S.name + "|" + S.email;
  if (S.token && S.synced === sig) return true;
  const r = await api("/customer", { method: "POST", body: { name: S.name, email: S.email } }); S.token = r.token; S.synced = sig; save(); return true;
}
async function addCard() {
  try { if (!(await ensureCustomer())) return false; } catch (e) { toast(errText(e)); return false; }
  return new Promise(async (res) => {
    sheet(`<div><h3>${t("Add a card")}</h3><div class="h-s" style="font-size:13px">${t("Your card is stored securely by Stripe. Chabad of Lamorinda never sees your card number.")}</div></div>
      <div id="payEl" class="payel"><div class="h-s">${t("Loading…")}</div></div><div id="payErr" class="err" role="alert"></div>
      <button class="btn btn-primary cta" id="paySave" disabled>${t("Save card")}</button><button class="btn btn-ghost" data-act="closeSheet">${t("Cancel")}</button>`, null, () => res(false));
    try {
      const { clientSecret } = await api("/setup-intent", { method: "POST" });
      const stripe = await loadStripe();
      const elements = stripe.elements({ clientSecret, appearance: { variables: { colorPrimary: "#b68235", colorText: "#201f1d", fontFamily: "Lora, Georgia, serif", borderRadius: "4px" } } });
      $("#payEl").innerHTML = ""; elements.create("payment", { layout: "tabs" }).mount("#payEl");
      const btn = $("#paySave"); if (!btn) return; btn.disabled = false;
      btn.onclick = async () => {
        btn.disabled = true; $("#payErr").textContent = "";
        const { error } = await stripe.confirmSetup({ elements, redirect: "if_required", confirmParams: { payment_method_data: { billing_details: { name: S.name, email: S.email } } } });
        if (error) { $("#payErr").textContent = error.message; btn.disabled = false; return; }
        await refreshCard(); res(true); closeSheet(); toast(tt("Card saved")); draw();
      };
    } catch (e) { const el = $("#payErr"); if (el) el.textContent = errText(e); }
  });
}
async function removeCard() { try { await api("/payment-method", { method: "DELETE" }); API.card = null; toast(tt("Card removed")); } catch (e) { toast(errText(e)); } draw(); }
function failSheet(e, p) {
  sheet(`<div><h3>${t("We couldn’t complete your gift")}</h3><div class="h-s" style="font-size:13px;margin-top:4px">${esc(errText(e))}</div></div>
    <button class="btn btn-primary cta" id="retry">${t("Try again")}</button><button class="btn btn-secondary cta" id="swapCard">${t("Use a different card")}</button><button class="btn btn-ghost" data-act="closeSheet">${t("Close")}</button>`,
  (o) => { $("#retry", o).onclick = () => { closeSheet(); chargeFlow(p); }; $("#swapCard", o).onclick = async () => { closeSheet(); if (await addCard()) chargeFlow(p); }; });
}
async function chargeFlow(p) {
  if (U.busy) return;
  if (!API.card) { if (!(await addCard())) return; }
  U.busy = true;
  sheet(`<div class="done"><div class="spin" aria-hidden="true"></div><h3>${t("Processing your gift…")}</h3><div class="h-s">${t("Please don’t close this window.")}</div></div>`, null, null, true);
  try {
    const body = { amount: p.amt, fund: p.fund, dedication: p.ded || "", idem: uid() + uid() + uid() };
    let r = await api(p.freq === "monthly" ? "/subscribe" : "/donate", { method: "POST", body });
    if (r.status === "requires_action") {
      const stripe = await loadStripe();
      const { error, paymentIntent } = await stripe.confirmCardPayment(r.clientSecret, { payment_method: r.paymentMethodId });
      if (error) throw Object.assign(new Error(error.message), { code: "card_error" });
      r = await api("/payment/" + paymentIntent.id);
    }
    if (r.status !== "succeeded" && r.status !== "active") throw Object.assign(new Error("Payment not completed"), { code: "card_error" });
    p.receiptUrl = r.receiptUrl || ""; U.busy = false; if (p.freq === "monthly") API.subs = null; completeGift(p);
  } catch (e) { U.busy = false; failSheet(e, p); }
}

// ---------- candle times & notifications ----------
async function loadCandles() {
  try {
    const j = await (await fetch(`https://www.hebcal.com/shabbat?cfg=json&zip=${CANDLE_ZIP}&M=on`)).json();
    S.candles = (j.items || []).filter((i) => i.category === "candles").map((i) => i.date); save(); if (U.page === "home") draw();
  } catch (e) {}
}
const nextCandle = () => (S.candles || []).map((d) => new Date(d)).filter((d) => d > Date.now()).sort((a, b) => a - b)[0];
async function ensureNotify() {
  if (!("Notification" in window)) { toast(tt("This browser can’t show notifications")); return false; }
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") { toast(tt("Notifications are blocked in your browser settings")); return false; }
  const ok = await new Promise((res) => { sheet(`<div class="done"><div class="ck" style="color:var(--accent)">${ico(I.bell, 24)}</div><h3>${t("Allow notifications")}</h3><div style="font-size:14px;max-width:280px">${t("Please allow notifications so we can send you reminders.")}</div></div><button class="btn btn-primary cta" id="nyes">${t("Confirm")}</button><button class="btn btn-ghost" id="nno">${t("Cancel")}</button>`, (o) => { $("#nyes", o).onclick = () => { res(true); closeSheet(); }; $("#nno", o).onclick = () => closeSheet(); }, () => res(false)); });
  return ok && (await Notification.requestPermission()) === "granted";
}
async function notify(body) {
  try {
    const reg = navigator.serviceWorker && (await navigator.serviceWorker.getRegistration());
    if (reg) reg.showNotification(tt("My Pushka"), { body, icon: "icon.svg", tag: "pushka" }); else new Notification(tt("My Pushka"), { body, icon: "icon.svg" });
  } catch (e) {}
}
function mark(k) { S.notified[k] = 1; const ks = Object.keys(S.notified); if (ks.length > 80) ks.slice(0, ks.length - 80).forEach((x) => delete S.notified[x]); save(); }
function tick() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const now = Date.now(), d = new Date(), at = (h, m) => new Date(d).setHours(h, m, 0, 0), within = (ts) => now >= ts && now < ts + 600e3;
  if (S.rem.candle.on) (S.candles || []).forEach((c) => { const ts = new Date(c) - S.rem.candle.mins * 60e3, k = "c" + c; if (within(ts) && !S.notified[k]) { mark(k); notify(tt("Candle lighting is in {mins} minutes — it’s customary to give tzedakah first.", { mins: S.rem.candle.mins })); } });
  if (S.rem.streak.on && !gaveToday()) {
    const candleDay = (S.candles || []).some((c) => dkey(new Date(c)) === dkey(d)), early = d.getDay() === 5 || candleDay, ts = early ? at(13, 0) : at(20, 0), k = "s" + dkey(d);
    if ((early || isWk(d)) && d.getDay() !== 6 && within(ts) && !S.notified[k]) { mark(k); notify(tt("Keep your streak alive — drop a coin in your pushka.")); }
  }
  S.rem.custom.filter((r) => r.on).forEach((r) => {
    const [h, m] = r.time.split(":").map(Number), k = r.id + dkey(d), okDay = r.days === "daily" || (r.days === "weekdays" && isWk(d)) || (r.days === "friday" && d.getDay() === 5);
    if (okDay && within(at(h, m)) && !S.notified[k]) { mark(k); notify(r.text || tt("Time to give tzedakah!")); }
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
function showLock() { const el = $("#lock"); el.hidden = false; el.innerHTML = `<div class="lock-in"><span style="color:var(--accent)">${ico(I.lock, 40)}</span><h2>${t("My Pushka is locked")}</h2><button class="btn btn-primary" data-act="unlock" style="width:220px">${t("Unlock")}</button><button class="btn btn-ghost" data-act="resetApp">${t("Can’t unlock? Reset this app")}</button></div>`; }

// ---------- page chrome ----------
const TABS = [["home", "Pushka", I.home], ["give", "Give", I.give], ["wallet", "Wallet", I.wallet], ["history", "History", I.history], ["more", "More", I.more]];
const tabOf = (pg) => (["home", "give", "wallet", "history"].includes(pg) ? pg : "more");
const sub = (title, body) => `<div class="head sub"><button class="icon-btn" data-act="back" aria-label="${t("Back")}">${ico(I.back, 24, FLIP)}</button><h1>${esc(title)}</h1><span style="width:44px"></span></div><div class="scroll"><div class="col tight" style="padding-top:var(--s4)">${body}</div></div>`;
const chev = () => `<span style="color:var(--accent)">${ico(I.chev, 18, FLIP)}</span>`;
const rowLink = (act, v, icon, title, subt) => `<button class="row-btn" data-act="${act}" data-v="${esc(v)}"><span style="color:var(--accent);flex:none">${ico(icon, 22)}</span><div class="grow"><div class="fund-n">${esc(title)}</div>${subt ? `<div class="fund-d">${esc(subt)}</div>` : ""}</div>${chev()}</button>`;
const tg = (act, v, title, subt, on) => `<button class="row-btn" role="switch" aria-checked="${on}" data-act="${act}" data-v="${esc(v)}"><div class="grow"><div class="h-t">${title}</div>${subt ? `<div class="h-s">${subt}</div>` : ""}</div><div class="sw ${on ? "on" : ""}"></div></button>`;
const sec = (title) => `<h6 style="color:var(--n700);margin:var(--s3) 0 var(--s1)">${title}</h6>`;

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
<text x="110" y="122" text-anchor="middle" fill="#173766" style="font:600 38px 'Frank Ruhl Libre','Cormorant Garamond',Georgia,serif" direction="rtl">צדקה</text></svg>`;
}
const hex = (n) => `<svg width="44" height="50" viewBox="0 0 46 52" fill="none" aria-hidden="true"><path d="M23 2l19 11v26L23 50 4 39V13z" stroke="var(--accent)" stroke-width="1.5" stroke-linejoin="round"/><text x="23" y="33" text-anchor="middle" fill="var(--a800)" style="font:600 20px 'Cormorant Garamond',Georgia,serif">${n}</text></svg>`;

PG.home = () => {
  const p = P(), now = new Date(), c = nextCandle(), st = streak(), frac = Math.min(p.balance / S.goal, 1), top = 62, bot = 228, lvl = bot - frac * (bot - top);
  let reminder = "";
  if (c) {
    const title = c.getDay() === 5 ? tt("Shabbat candles Friday, {time}", { time: clock(c) }) : tt("Candle lighting {day}, {time}", { day: c.toLocaleDateString(loc(), { weekday: "long" }), time: clock(c) });
    const subt = S.rem.candle.on ? tt("It's customary to give before lighting. We'll remind you at {time}.", { time: clock(new Date(c - S.rem.candle.mins * 60e3)) }) : tt("It's customary to give before lighting. Turn on the reminder in Reminders.");
    reminder = `<div class="card">${ico(I.flame, 22, 'style="color:var(--accent);flex:none"')}<div style="flex:1"><div class="card-title">${esc(title)}</div><div class="h-s">${esc(subt)}</div></div></div>`;
  }
  const chips = S.pushkas.length > 1 ? `<div class="chips">${S.pushkas.map((x) => `<button class="chip ${x.id === p.id ? "on" : ""}" data-act="setCur" data-v="${x.id}">${esc(pTitle(x))}</button>`).join("")}</div>` : "";
  const since = greg(new Date(S.lastEmptied));
  const msg = p.balance > 0 ? `<div class="h-t" style="font-size:20px">${t("Your pushka has {amt}", { amt: money2(p.balance) })}</div><div class="h-s">${p.drops === 1 ? t("1 coin since {date}", { date: esc(since) }) : t("{n} coins since {date}", { n: p.drops, date: esc(since) })}</div>` : `<div class="h-t" style="font-size:20px">${t("Your pushka is empty")}</div><div class="h-s">${t("Add some coins now")}</div>`;
  return `<div class="head home-head"><div class="hd-top"><div class="kicker">${t("Chabad of Lamorinda")}</div><div class="hd-tools"><button class="lang-btn" data-act="toggleLang" lang="${LANG === "he" ? "en" : "he"}">${LANG === "he" ? "English" : "עברית"}</button><button class="icon-btn sm" data-act="share" aria-label="${t("Share")}">${ico(I.share, 20)}</button></div></div><div class="hd-main"><h1>${esc(pTitle(p))}</h1><div class="dates"><div>${esc(greg(now))}</div><i>${esc(hebFull(now))}</i></div></div></div>
  <div class="scroll"><div class="col">${chips}
    <div class="streak">${hex(st)}<span>${t("Weekday streak")}</span></div>
    <div class="msg">${msg}</div>
    <div class="tin"><div class="anchor" id="coinAnchor"></div><div class="wrap" data-act="dropPrimary" role="button" tabindex="0" aria-label="${esc(tt("Drop {amt} in the pushka", { amt: money(S.presets[0]) }))}">${tin()}<div class="bal">${money2(p.balance)}</div>
      <div class="lv" style="top:${top - 10}px;left:-6px;transform:translateX(-100%)">${money(S.goal)} —</div><div class="lv" style="top:${lvl - 10}px;right:-6px;transform:translateX(100%)">— ${money2(p.balance)}</div></div></div>
    <div><div class="tap">${t("Tap to drop a coin")}</div><div class="quick">${S.presets.map((a) => `<button class="btn btn-secondary" data-act="drop" data-v="${a}">${money(a)}</button>`).join("")}<button class="btn btn-secondary" data-act="other">${t("Other")}</button></div></div>
    <button class="btn btn-primary cta" data-act="openEmpty" ${p.balance <= 0 ? "disabled" : ""}>${t("Empty pushka to Chabad")}</button>
    <div class="row2"><button class="btn btn-ghost" data-act="donateNow">${t("Donate now")}</button><button class="btn btn-ghost" data-act="go" data-v="settings">${ico(I.gear, 16)} ${t("Pushka settings")}</button></div>
    ${reminder}
  </div></div>`;
};

PG.give = () => {
  if (!U.giveFund) return `<div class="scroll" style="padding-top:calc(var(--s3) + env(safe-area-inset-top))"><div class="col" style="padding-top:0"><div class="page-h"><h1>${t("Give")}</h1><div class="sub">${t("A direct gift to one of our funds.")}</div></div>
    <div>${FUNDS.map((f) => `<button class="row-btn" data-act="fund" data-v="${f.id}"><div class="grow"><div class="fund-n">${t(f.name)}</div><div class="fund-d">${t(f.desc)}</div></div>${chev()}</button>`).join("")}</div></div></div>`;
  const f = fundOf(U.giveFund), cta = U.freq === "monthly" ? t("Give {amt} monthly", { amt: money(U.giveAmt) }) : t("Give {amt}", { amt: money(U.giveAmt) });
  return `<div class="scroll" style="padding-top:calc(var(--s3) + env(safe-area-inset-top))"><div class="col tight" style="padding-top:0">
    <button class="btn btn-ghost" data-act="allFunds" style="align-self:flex-start;padding-inline-start:0">${ico(I.back, 16, FLIP)}${t("All funds")}</button>
    <div class="page-h"><div class="kicker">${t("Give to")}</div><h2 style="margin:2px 0 4px">${t(f.name)}</h2><p style="margin:0;font-size:13px;text-align:justify;color:var(--n800)">${t(f.long)}</p></div>
    <div class="field"><label>${t("Amount")}</label><div class="amts">${GIVE_AMTS.map((a) => `<button class="btn btn-secondary ${U.giveAmt === a ? "sel" : ""}" data-act="amt" data-v="${a}">${money(a)}</button>`).join("")}</div>
      <input class="input" id="giveCustom" data-inp="giveCustom" type="number" min="1" step="0.01" inputmode="decimal" aria-label="${t("Other amount")}" placeholder="${t("Other amount")}" style="margin-top:6px"></div>
    <div class="field"><label>${t("Frequency")}</label><div class="seg"><label><input type="radio" name="freq" value="once" data-chg="freq" ${U.freq === "once" ? "checked" : ""}>${t("One time")}</label><label><input type="radio" name="freq" value="monthly" data-chg="freq" ${U.freq === "monthly" ? "checked" : ""}>${t("Monthly")}</label></div></div>
    <div class="field"><label for="ded">${t("Dedication (optional)")}</label><input class="input" id="ded" data-inp="ded" maxlength="80" placeholder="${t("In honor of / in memory of…")}" value="${esc(U.dedication)}"></div>
    <div class="h-s" style="display:flex;align-items:center;gap:8px;font-size:13px">${ico(I.card, 16)}${API.enabled ? (API.card ? esc(cardLabel()) : t("You’ll add a card when you give")) : t("Payment completes on our secure donation page")}</div>
    <button class="btn btn-primary cta" id="giveCta" data-act="submitGive">${cta}</button></div></div>`;
};

PG.wallet = () => `<div class="scroll" style="padding-top:calc(var(--s3) + env(safe-area-inset-top))"><div class="col" style="padding-top:0">
  <div class="page-h"><h1>${t("Wallet")}</h1><div class="sub">${t("Set aside funds now for emptying your pushka later.")} <button class="link" data-act="walletLearn">${t("Learn more")}</button></div></div>
  <div class="card" style="flex-direction:column;align-items:center;gap:4px;padding:var(--s4)"><div class="h-s" style="text-transform:uppercase;letter-spacing:.1em;font-size:11px">${t("Your Wallet ID")}</div><div style="font:400 34px var(--heading);letter-spacing:.18em;color:var(--a700);font-feature-settings:'tnum';direction:ltr">${esc(S.wallet.id)}</div></div>
  <div style="text-align:center"><div class="h-s" style="text-transform:uppercase;letter-spacing:.1em;font-size:11px">${t("Balance")}</div><div style="font:400 56px/1.1 var(--heading);font-feature-settings:'tnum'">${money2(S.wallet.balance)}</div></div>
  <button class="btn btn-secondary cta" data-act="addFunds">${ico(I.plus, 16)} ${t("Add funds")}</button>
  <div>${rowLink("walletSend", "", I.swap, tt("Send / request between wallets"), tt("Empower friends and family with giving tzedakah"))}${rowLink("autoRefill", "", I.gear, tt("Manage wallet auto refill"), tt("Auto refill inactive"))}${rowLink("walletHist", "", I.file, tt("Wallet transaction history"), "")}</div>
  <p class="note">${t("Wallet features are coming soon.")}</p>
</div></div>`;

function histTitle(h) { if (h.title) return h.title; if (h.kind === "coin") return tt(h.ttl === "maaser" ? "Maaser added" : "Coin dropped"); return (h.fp ? tt("Pushka emptied →") + " " : "") + tt(fundOf(h.fund).name); }
function histMeta(h) {
  if (h.kind === "gift" && h.fund) { const a = []; if (h.freq === "monthly") a.push(tt("Monthly")); else if (!h.fp) a.push(tt("One time")); if (h.method && h.method !== "online") a.push(tt(METHOD[h.method]) + " (" + tt("pending") + ")"); if (h.ded) a.push(h.ded); return a.join(" · "); }
  return h.meta || "";
}
PG.history = () => {
  const yr = hebYearNum(new Date()), total = S.history.filter((h) => h.kind === "gift" && hebYearNum(new Date(h.t)) === yr).reduce((a, h) => a + h.amt, 0);
  const pn = (id) => { const x = S.pushkas.find((q) => q.id === id); return x ? pTitle(x) : ""; };
  const rows = S.history.length ? S.history.map((h) => `<div class="row-btn" style="cursor:default"><div class="grow"><div class="h-t">${esc(histTitle(h))}</div><div class="h-s">${esc(when(h.t))}${histMeta(h) ? " · " + esc(histMeta(h)) : ""}${h.kind === "coin" && S.pushkas.length > 1 && pn(h.pid) ? " · " + esc(pn(h.pid)) : ""}</div></div><div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px"><div class="h-a">${money2(h.amt)}</div>${h.receiptUrl ? `<a class="tag-accent" href="${esc(h.receiptUrl)}" target="_blank" rel="noopener">${t("Receipt")}</a>` : h.receipt ? `<span class="tag-accent">${t("Receipt")}</span>` : ""}</div></div>`).join("") : `<div class="rowp">${t("Nothing yet. Drop your first coin on the Pushka tab.")}</div>`;
  return `<div class="scroll" style="padding-top:calc(var(--s3) + env(safe-area-inset-top))"><div class="col tight" style="padding-top:0">
    <div class="page-h" style="display:flex;justify-content:space-between;align-items:flex-end"><h1>${t("History")}</h1><div class="year"><div class="k">${t("Given in {year}", { year: esc(hebYearLabel(new Date())) })}</div><div class="v">${money2(total)}</div></div></div>
    <div>${rows}</div><p class="note">${t("Coins in your pushka are given when you empty it.")} ${API.enabled ? t("A receipt is emailed for every gift.") : t("Your receipt comes from our donation page after each gift.")}</p></div></div>`;
};

PG.more = () => `<div class="scroll" style="padding-top:calc(var(--s3) + env(safe-area-inset-top))"><div class="col" style="padding-top:0"><div class="page-h"><h1>${t("More")}</h1></div><div>
  ${rowLink("go", "segulot", I.book, tt("Segulot & Prayers"), tt("Prayers, customs and blessings"))}${rowLink("go", "maaser", I.calc, tt("Maaser Calculator"), tt("Calculate your tenth"))}${rowLink("go", "reminders", I.bell, tt("Reminders"), tt("Candle lighting and daily coin"))}
  ${rowLink("go", "settings", I.gear, tt("Settings"), tt("Goal, amounts, sounds, pushkas, language"))}${rowLink("go", "profile", I.profile, tt("Profile"), S.name || tt("Name, email, address"))}${rowLink("go", "support", I.help, tt("Support"), tt("We’re happy to help"))}</div>
  <a class="btn btn-ghost" href="../" style="align-self:flex-start;padding-inline-start:0">${ico(I.back, 16, FLIP)} ${t("Back to chabadoflamorinda.com")}</a></div></div>`;

// ----- segulos -----
const segFeat = () => SEG_FEATURED.map((id) => SEGULOS.find((s) => s.id === id));
const segHit = (raw) => { const s = SG(raw), q = U.segQ.trim().toLowerCase(); return (!q || (s.title + " " + s.blurb + " " + catL(raw.cat)).toLowerCase().includes(q)) && (U.segCat === "All" || raw.cat === U.segCat); };
const segRow = (raw, showCat) => { const s = SG(raw); return `<button class="row-btn" data-act="seg" data-v="${raw.id}"><div class="grow"><div class="fund-n">${esc(s.title)}</div>${showCat ? `<div class="kicker" style="margin-top:2px">${esc(catL(raw.cat))}</div>` : ""}<div class="fund-d clamp">${esc(s.blurb)}</div></div>${chev()}</button>`; };
function segList() {
  if (U.segQ.trim() || U.segCat !== "All") { const l = SEGULOS.filter(segHit); return l.length ? l.map((s) => segRow(s, true)).join("") : `<div class="rowp">${t("No matches. Try another word.")}</div>`; }
  return `<div>${segFeat().map((s) => segRow(s, false)).join("")}</div>` + SEG_CATS.map((c) => `<h6 style="color:var(--n700);margin:var(--s4) 0 var(--s1)">${esc(catL(c))}</h6>${SEGULOS.filter((s) => s.cat === c && !SEG_FEATURED.includes(s.id)).map((s) => segRow(s, false)).join("")}`).join("");
}
const segChips = () => ["All", ...SEG_CATS].map((c) => `<button class="chip ${U.segCat === c ? "on" : ""}" data-act="segCat" data-v="${esc(c)}">${c === "All" ? t("All") : esc(catL(c))}</button>`).join("");
PG.segulot = () => sub(tt("Segulot & Prayers"), `<div class="field"><input class="input" id="segQ" data-inp="segQ" type="search" placeholder="${esc(tt("Search {n} segulos…", { n: SEGULOS.length }))}" aria-label="${t("Search segulos")}" value="${esc(U.segQ)}"></div>
  <div class="chips" id="segChips">${segChips()}</div><div id="segList">${segList()}</div>
  <p class="note">${t("Segulos are traditional customs and sources of inspiration, not guarantees. For questions of Jewish law, ask the Rabbi. Texts are provided for convenience.")}</p>`);
PG.segulah = () => {
  const raw = SEGULOS.find((x) => x.id === U.segId) || SEGULOS[0];
  if (raw.kind === "quotes") return PG.quotes();
  const s = SG(raw);
  const acts = (raw.act || []).map((a) => ({
    coin: `<button class="btn btn-primary cta" data-act="dropPrimary">${t("Drop a coin in my pushka")}</button>`,
    give: `<button class="btn btn-secondary cta" data-act="giveGeneral">${t("Give tzedakah")}</button>`,
    maaser: `<button class="btn btn-primary cta" data-act="go" data-v="maaser">${t("Open the Maaser Calculator")}</button>`,
    reminders: `<button class="btn btn-secondary cta" data-act="go" data-v="reminders">${t("Set a reminder")}</button>`,
  }[a] || "")).join("");
  let teh = "", links = raw.links || [];
  if (raw.kind === "tehillim") { const th = tehillimToday(); teh = `<div class="card" style="flex-direction:column;align-items:flex-start"><div class="kicker">${t("Hebrew day {n} of the month", { n: th.day })}</div><div class="card-title" style="font-size:24px">${esc(th.label)}</div><div class="h-s">${t("The Hebrew date changes at nightfall; this uses today’s calendar date.")}</div></div>`; links = th.links; }
  return sub(s.title, `<div class="kicker">${esc(catL(raw.cat))}</div>${teh}<p class="body-p">${nl(s.blurb)}</p>
    ${s.how ? `<h6 style="color:var(--n700)">${t("How")}</h6><ol class="how">${s.how.map((h) => `<li>${esc(h)}</li>`).join("")}</ol>` : ""}
    ${raw.he ? `<div class="hebrew" dir="rtl" lang="he">${nl(raw.he)}</div>` : ""}${s.tr ? `<div class="tr">${esc(s.tr)}</div>` : ""}${s.en ? `<blockquote>${nl(s.en)}</blockquote>` : ""}
    ${s.src ? `<div class="src">${t("Source: {src}", { src: esc(s.src) })}</div>` : ""}
    ${links.length ? `<div class="chips wrapchips">${links.map((l) => `<a class="chip" href="${esc(l.u)}" target="_blank" rel="noopener">${esc(linkText(l.t))} ${ico(I.ext, 12)}</a>`).join("")}</div>` : ""}${acts}`);
};
PG.quotes = () => sub(tt("Selected Quotes from the Rebbe"), `<p class="note">${t("Paraphrased teachings and sayings, shared for inspiration. Please check exact wording against the Rebbe’s own words and sources.")}</p>${QUOTES().map((q) => `<blockquote class="big"><p>“${esc(q.q)}”</p><footer>${esc(q.n)}</footer></blockquote>`).join("")}<button class="btn btn-primary cta" data-act="dropPrimary">${t("Drop a coin in my pushka")}</button>`);

// ----- maaser -----
const maaserOut = () => { const a = parseFloat(U.maaserAmt) || 0; return r2((a * S.maaser) / 100); };
PG.maaser = () => sub(tt("Maaser Calculator"), `<div class="field"><label for="maa">${t("Enter amount")}</label><div class="amt"><span>$</span><input class="input" id="maa" data-inp="maaserAmt" type="number" min="0" step="0.01" inputmode="decimal" placeholder="${t("Income or profit")}" value="${esc(U.maaserAmt)}"></div></div>
  <div class="card" style="flex-direction:column;align-items:stretch;gap:var(--s2)"><div style="display:flex;justify-content:space-between;align-items:center"><div class="kicker" style="color:var(--n700)">${t("Maaser percentage")}</div><span class="tag-accent" id="maaPct" style="font-size:14px;padding:2px 12px">${S.maaser}%</span></div>
    <input type="range" id="maaRange" data-inp="maaserPct" data-chg="maaserSave" min="1" max="20" step="1" value="${S.maaser}" aria-label="${t("Maaser percentage")}"><div style="display:flex;justify-content:space-between" class="h-s"><span>1%</span><span>10%</span><span>20%</span></div></div>
  <div class="card" style="flex-direction:column;gap:2px;padding:var(--s4)"><div class="h-s">${t("Maaser amount")}</div><div id="maaOut" style="font:400 48px var(--heading);font-feature-settings:'tnum'">${money2(maaserOut())}</div></div>
  <button class="btn btn-secondary cta maaBtn" data-act="maaserPushka" ${maaserOut() > 0 ? "" : "disabled"}>${t("Add to pushka")}</button>
  <button class="btn btn-secondary cta maaBtn" data-act="maaserWallet" ${maaserOut() > 0 ? "" : "disabled"}>${t("Add to wallet")}</button>
  <button class="btn btn-primary cta maaBtn" data-act="maaserDonate" ${maaserOut() > 0 ? "" : "disabled"}>${t("Donate now")}</button>
  <p class="note">${t("Maaser (a tenth of income) is a traditional guideline; some give up to a fifth. Ask the Rabbi how it applies to your situation.")}</p>`);

// ----- reminders -----
const DAYS = { weekdays: "Weekdays", daily: "Every day", friday: "Fridays" };
PG.reminders = () => {
  const c = S.rem.candle, st = S.rem.streak;
  return sub(tt("Reminders"), `<div>
    <div class="row-btn"><button class="grow" data-act="candleMins" style="all:unset;cursor:pointer;flex:1"><div class="h-t">${t("Before Candle Lighting")}</div><div class="h-s">${t("Friday & Holidays · {mins} mins before", { mins: c.mins })}</div></button><button role="switch" aria-checked="${c.on}" aria-label="${t("Before Candle Lighting")}" data-act="remToggle" data-v="candle" style="all:unset;cursor:pointer"><div class="sw ${c.on ? "on" : ""}"></div></button></div>
    ${tg("remToggle", "streak", t("Streak Reminder"), `${t("Weekdays · 8:00 pm")}<br>${t("Every Friday & before holidays · 1:00 pm")}`, st.on)}
    ${S.rem.custom.map((r) => `<div class="row-btn"><div class="grow"><div class="h-t">${esc(r.text || tt("Give tzedakah"))}</div><div class="h-s">${t(DAYS[r.days])} · ${esc(clock(new Date("2000-01-01T" + r.time)))}</div></div><button class="icon-btn sm" data-act="remDel" data-v="${r.id}" aria-label="${t("Delete reminder")}">${ico(I.trash, 18)}</button><button role="switch" aria-checked="${r.on}" aria-label="${t("Reminder on")}" data-act="remToggle" data-v="${r.id}" style="all:unset;cursor:pointer"><div class="sw ${r.on ? "on" : ""}"></div></button></div>`).join("")}</div>
    <button class="btn btn-secondary cta" data-act="addRem">${ico(I.plus, 16)} ${t("Add reminder")}</button>
    <p class="note">${t("Reminders arrive while the app is open or installed on your home screen. Candle times are for Lafayette, CA.")}</p>`);
};

// ----- settings & profile -----
PG.settings = () => sub(tt("Settings"), `${sec(t("Pushka"))}
  <div class="field"><label for="goal">${t("Pushka goal")}</label><div class="amt"><span>$</span><input class="input" id="goal" type="number" min="1" step="0.01" inputmode="decimal" data-chg="setGoal" value="${S.goal.toFixed(2)}"></div></div>
  <div class="field"><label>${t("Preset amounts")}</label><div class="row3">${S.presets.map((a, i) => `<div class="amt">${i === 0 ? `<b class="primary-tag">${t("Primary")}</b>` : ""}<span>$</span><input class="input" type="number" min="0.01" step="0.01" inputmode="decimal" aria-label="${esc(tt("Preset {n}", { n: i + 1 }))}" data-chg="setPreset" data-i="${i}" value="${a.toFixed(2)}"></div>`).join("")}</div></div>
  <div class="field"><label for="emp">${t("Empty pushka")}</label><select class="input" id="emp" data-chg="setEmpty">${Object.entries(EMPTY_MODES).map(([k, v]) => `<option value="${k}" ${S.emptyMode === k ? "selected" : ""}>${t(v)}</option>`).join("")}</select></div>
  <div class="field"><label for="lng">${t("Language")}</label><select class="input" id="lng" data-chg="setLang"><option value="en" ${LANG === "en" ? "selected" : ""}>English</option><option value="he" ${LANG === "he" ? "selected" : ""}>עברית</option></select></div>
  <div>${tg("tgl", "sound", t("Sound"), t("Coin clink when you drop a coin"), S.sound)}${tg("tgl", "jingle", t("Coin jingle"), t("A shower of coins when you empty the pushka"), S.jingle)}${tg("tgl", "confetti", t("Confetti sound"), t("A celebration when your goal is reached"), S.confetti)}${tg("tgl", "vibrate", t("Vibration"), "", S.vibrate)}${tg("tgl", "partial", t("Partial payments"), t("Give part of your pushka and keep the rest"), S.partial)}${tg("tgl", "addl", t("Additional payment options"), t("Including check, wire, DAF"), S.addl)}${tg("bio", "", t("Biometric lock"), t("Unlock the app with your fingerprint, face or screen lock"), !!S.bio)}</div>
  ${sec(t("My pushkas"))}<div>${S.pushkas.map((p) => `<button class="row-btn" data-act="editPushka" data-v="${p.id}"><span style="color:var(--accent);flex:none">${ico(I.home, 22)}</span><div class="grow"><div class="fund-n">${esc(pTitle(p))}</div><div class="fund-d">${money2(p.balance)}${p.id === S.cur ? " · " + t("current") : ""}</div></div><span style="color:var(--accent)">${ico(I.pencil, 16)}</span></button>`).join("")}</div>
  <button class="btn btn-secondary cta" data-act="addPushka">${ico(I.plus, 16)} ${t("Add pushka")}</button>
  ${sec(t("Profile"))}<div>${rowLink("go", "profile", I.profile, S.name || tt("Your profile"), S.email || tt("Name, email, phone, address"))}</div>`);

PG.profile = () => {
  const f = (k, label, v) => `<div class="row-btn" style="cursor:default"><div class="grow"><div class="h-s" style="text-transform:uppercase;letter-spacing:.08em;font-size:11px">${label}</div><div style="font-size:16px">${v ? esc(v) : "—"}</div></div><button class="icon-btn sm" data-act="editField" data-v="${k}" aria-label="${esc(tt("Edit"))} ${label}">${ico(I.pencil, 18)}</button></div>`;
  let rec;
  if (!API.enabled) rec = `<div class="rowp">${t("Monthly gifts are available once card payments are switched on.")}</div>`;
  else if (API.subs === null) rec = `<div class="rowp">${t("Loading…")}</div>`;
  else if (!API.subs.length) rec = `<div class="rowp">${t("No monthly gifts. Choose “Monthly” when giving to a fund.")}</div>`;
  else rec = API.subs.map((s) => `<div class="row-btn" style="cursor:default"><div class="grow"><div class="h-t">${t("{amt} monthly · {fund}", { amt: money(s.amount), fund: t(fundOf(s.fund).name) })}</div><div class="h-s">${s.next ? t("Next gift {date}", { date: esc(greg(new Date(s.next))) }) : ""}</div></div><button class="btn btn-ghost" data-act="cancelSub" data-v="${esc(s.id)}">${t("Cancel")}</button></div>`).join("");
  const payRow = API.enabled
    ? `<div class="row-btn" style="cursor:default"><span style="color:var(--accent)">${ico(I.card, 20)}</span><div class="grow" style="font-size:14px;direction:ltr;text-align:start">${API.card ? esc(cardLabel()) : t("No card saved")}</div><button class="btn btn-ghost" data-act="addCard">${API.card ? t("Change") : t("Add")}</button>${API.card ? `<button class="btn btn-ghost" data-act="removeCard">${t("Remove")}</button>` : ""}</div>`
    : `<div class="rowp">${t("Card payments are not switched on yet. Gifts are completed on our donation page.")}</div>`;
  return sub(tt("Profile"), `${f("name", t("Name"), S.name)}${f("email", t("Email"), S.email)}${f("billingEmail", t("Billing email"), S.billingEmail)}${f("phone", t("Phone number"), S.phone)}${f("address", t("Mailing address"), S.address)}
    ${sec(t("Recurring"))}${rec}${sec(t("Payment"))}${payRow}
    ${sec(t("Manage account"))}<button class="row-btn" data-act="deleteAcct" style="color:#9b1c5a"><span style="flex:none">${ico(I.trash, 22)}</span><div class="grow" style="font-size:16px">${t("Delete account?")}</div></button>`);
};
PG.support = () => sub(tt("Support"), `<p class="body-p">${t("Questions about the pushka, your gifts or receipts? We’re happy to help.")}</p><div class="card" style="flex-direction:column;align-items:flex-start;gap:4px"><div class="card-title">${t("Chabad of Lamorinda")}</div><a href="mailto:${SITE_EMAIL}">${SITE_EMAIL}</a><a href="https://www.chabadoflamorinda.com" target="_blank" rel="noopener">chabadoflamorinda.com</a></div>
  <p class="note">${t("Tip: add this app to your home screen — in your browser menu choose “Add to Home Screen.”")}</p>`);

// ---------- rendering ----------
function draw() {
  const pg = PG[U.page] ? U.page : "home", prev = $(".scroll"), y = prev && U.drawn === pg ? prev.scrollTop : 0;
  $("#app").innerHTML = PG[pg]() + `<nav class="tabbar" aria-label="${t("Main")}">${TABS.map(([id, l, ic]) => `<button class="tab ${tabOf(pg) === id ? "on" : ""}" data-act="tab" data-v="${id}" ${tabOf(pg) === id ? 'aria-current="page"' : ""}>${ico(ic)}<span>${t(l)}</span></button>`).join("")}</nav>`;
  U.drawn = pg; const sc = $(".scroll"); if (sc) sc.scrollTop = y;
  if (pg === "profile" && API.enabled && S.token && API.subs === null && !U.subsLoading) { U.subsLoading = true; loadSubs().finally(() => (U.subsLoading = false)); }
}

// ---------- actions ----------
const A = {};
document.addEventListener("click", (e) => { const el = e.target.closest("[data-act]"); if (!el) return; const fn = A[el.dataset.act]; if (fn) { if (el.tagName === "A") return; e.preventDefault(); fn(el.dataset.v, el, e); } });
document.addEventListener("change", (e) => { const el = e.target.closest("[data-chg]"); if (el && A[el.dataset.chg]) A[el.dataset.chg](el.value, el, e); });
document.addEventListener("input", (e) => { const el = e.target.closest("[data-inp]"); if (el && A[el.dataset.inp]) A[el.dataset.inp](el.value, el, e); });
document.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target.matches('[role="button"][data-act]')) { e.preventDefault(); e.target.click(); } });

A.closeSheet = () => closeSheet();
A.tab = (v) => { U.stack = []; U.page = v; if (v === "give") U.giveFund = null; draw(); };
A.go = (v) => { U.stack.push(U.page); U.page = v; draw(); };
A.back = () => { U.page = U.stack.pop() || "more"; draw(); };
A.share = async () => { const d = { title: tt("Chabad of Lamorinda · My Pushka"), text: tt("Give tzedakah every day with the Chabad of Lamorinda pushka."), url: location.href.split("#")[0] }; try { if (navigator.share) await navigator.share(d); else { await navigator.clipboard.writeText(d.url); toast(tt("Link copied")); } } catch (e) {} };
A.setCur = (v) => { S.cur = v; save(); closeSheet(); draw(); };
const setLang = (l) => { S.lang = l; save(); applyLang(); closeSheet(); if ($("#lock") && !$("#lock").hidden) showLock(); draw(); };
A.toggleLang = () => setLang(LANG === "he" ? "en" : "he");
A.setLang = (v) => setLang(v === "he" ? "he" : "en");

// coins
function drop(a, ttl) {
  a = r2(a); if (!(a > 0) || a > 100000) return;
  const p = P(), before = p.balance;
  p.balance = r2(p.balance + a); p.drops++;
  pushHist({ kind: "coin", t: Date.now(), ttl: ttl || "coin", amt: a, pid: p.id });
  save(); if (S.sound) clink(p.balance > 20 ? 2 : 1, 0.09); buzz(30); draw();
  const an = $("#coinAnchor"); if (an) { const c = document.createElement("div"); c.className = "coin"; c.textContent = money(a); an.append(c); setTimeout(() => c.remove(), 800); }
  if (before < S.goal && p.balance >= S.goal) setTimeout(() => { fanfare(); confetti(); toast(tt("Your pushka is full! 🎉")); if (S.emptyMode === "full") setTimeout(openEmpty, 1400); }, 700);
}
A.drop = (v) => drop(parseFloat(v));
A.dropPrimary = () => { drop(S.presets[0]); if (U.page !== "home") toast(tt("{amt} added to your pushka", { amt: money(S.presets[0]) })); };
A.other = () => sheet(`<h3>${t("Drop a coin")}</h3><div class="field"><label for="oa">${t("Amount")}</label><input class="input" id="oa" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="$0.00"></div>${sheetBtns(["otherGo", t("Drop in pushka")], ["closeSheet", t("Cancel")])}`, () => setTimeout(() => $("#oa") && $("#oa").focus(), 60));
A.otherGo = () => { const v = parseFloat($("#oa").value); if (!(v > 0) || v > 100000) return toast(tt("Enter a valid amount")); closeSheet(); drop(v); };

// emptying & giving
function openEmpty() {
  const p = P(); if (p.balance <= 0) return toast(tt("Your pushka is empty"));
  const sub1 = API.enabled && API.card ? t("{amt} will be charged to {card} and sent to:", { amt: money2(p.balance), card: `<bdi>${esc(cardLabel())}</bdi>` }) : t("{amt} will be given to Chabad of Lamorinda. Choose a fund:", { amt: money2(p.balance) });
  sheet(`<div><h3>${t("Empty your pushka")}</h3><div class="h-s" style="font-size:13px">${sub1}</div></div>
    ${S.partial ? `<div class="field"><label for="ea">${t("Amount to give (up to {max})", { max: money2(p.balance) })}</label><input class="input" id="ea" type="number" min="0.01" max="${p.balance}" step="0.01" value="${p.balance}"></div>` : ""}
    <div>${FUNDS.map((f, i) => `<label class="radio"><input type="radio" name="fund" value="${f.id}" ${i === 0 ? "checked" : ""}><span class="dot"></span><span class="nm">${t(f.name)}</span></label>`).join("")}</div>
    ${S.addl ? `<div class="field"><label>${t("Pay by")}</label><div class="seg">${Object.entries(METHOD).map(([k, v], i) => `<label><input type="radio" name="pm" value="${k}" ${i === 0 ? "checked" : ""}>${k === "online" && API.enabled ? t("Card") : t(v)}</label>`).join("")}</div></div>` : ""}
    <button class="btn btn-primary cta" data-act="confirmEmpty">${API.enabled ? t("Send") : t("Give")} ${S.partial ? "" : money2(p.balance)}</button>`);
}
A.openEmpty = openEmpty;
A.confirmEmpty = () => {
  const p = P(); let amt = p.balance;
  if (S.partial) { amt = r2(parseFloat($("#ea").value)); if (!(amt > 0 && amt <= p.balance + 1e-9)) return toast(tt("Enter an amount up to {max}", { max: money2(p.balance) })); }
  const fund = ($("input[name=fund]:checked") || {}).value || "general", method = ($("input[name=pm]:checked") || {}).value || "online";
  closeSheet(); startGift({ amt, fund, freq: "once", ded: "", fromPushka: true, method, pid: p.id });
};
A.donateNow = () => sheet(`<div><h3>${t("Donate now")}</h3><div class="h-s" style="font-size:13px">${t("Give directly to Chabad of Lamorinda.")}</div></div><div class="field"><label for="dn">${t("Amount")}</label><input class="input" id="dn" type="number" min="1" step="0.01" inputmode="decimal" value="${P().balance || 18}"></div>${sheetBtns(["donateGo", t("Donate")], ["closeSheet", t("Cancel")])}`);
A.donateGo = () => { const v = parseFloat($("#dn").value); if (!(v > 0) || v > 100000) return toast(tt("Enter a valid amount")); closeSheet(); startGift({ amt: r2(v), fund: "general", freq: "once", ded: "", fromPushka: false, method: "online", pid: P().id }); };
A.fund = (v) => { Object.assign(U, { giveFund: v, giveAmt: 36, freq: "once", dedication: "" }); draw(); };
A.allFunds = () => { U.giveFund = null; draw(); };
A.giveGeneral = () => { Object.assign(U, { giveFund: "general", giveAmt: 36, freq: "once", dedication: "" }); U.stack = []; U.page = "give"; draw(); };
A.amt = (v) => { U.giveAmt = +v; draw(); };
const giveCtaText = () => (U.freq === "monthly" ? t("Give {amt} monthly", { amt: money(U.giveAmt) }) : t("Give {amt}", { amt: money(U.giveAmt) }));
A.giveCustom = (v) => { const n = parseFloat(v); if (n > 0) { U.giveAmt = r2(n); $$(".amts .btn").forEach((b) => b.classList.remove("sel")); const c = $("#giveCta"); if (c) c.innerHTML = giveCtaText(); } };
A.freq = (v) => { U.freq = v; draw(); };
A.ded = (v) => { U.dedication = v; };
A.submitGive = () => { if (!(U.giveAmt > 0) || U.giveAmt > 100000) return toast(tt("Enter a valid amount")); startGift({ amt: U.giveAmt, fund: U.giveFund, freq: U.freq, ded: U.dedication.trim(), fromPushka: false, method: "online", pid: P().id }); };

// Fallback only: used when the server has no Stripe keys yet.
const donateLink = (p) => `${DONATE_URL}?amount=${encodeURIComponent(p.amt)}&fund=${encodeURIComponent(p.fund)}&frequency=${p.freq}${p.ded ? "&dedication=" + encodeURIComponent(p.ded) : ""}`;
async function startGift(p) {
  if (p.method && p.method !== "online") return offlineSheet(p);
  if (API.enabled) return chargeFlow(p);
  U.pending = p;
  sheet(`<div><h3>${t("Finish your gift")}</h3><div class="h-s" style="font-size:13px">${t("We opened our secure donation page for {amt} to the {fund}. Complete it there, then come back and tap below.", { amt: money2(p.amt), fund: t(fundOf(p.fund).name) })}</div></div><button class="btn btn-secondary cta" data-act="reopen">${t("Open donation page again")}</button>${sheetBtns(["finished", t("I’ve completed my gift")], ["closeSheet", t("Not yet")])}`);
  window.open(donateLink(p), "_blank", "noopener");
}
A.reopen = () => window.open(donateLink(U.pending), "_blank", "noopener");
A.finished = () => completeGift(U.pending);
function offlineSheet(p) {
  U.pending = p; const m = tt(METHOD[p.method]), body = encodeURIComponent(`Hello,\n\nI would like to give ${money2(p.amt)} to the ${fundOf(p.fund).name} by ${METHOD[p.method]}. Please send me the details.\n\nThank you,\n${S.name}`);
  sheet(`<div><h3>${t("Give by {method}", { method: esc(m) })}</h3><div class="h-s" style="font-size:13px">${t("Please contact us for {method} details for {amt} to the {fund}. Once you’ve sent it, tap below. We’ll record it as pending until it is received.", { method: esc(m), amt: money2(p.amt), fund: t(fundOf(p.fund).name) })}</div></div><a class="btn btn-secondary cta" href="mailto:${SITE_EMAIL}?subject=${encodeURIComponent("Pushka gift by " + METHOD[p.method])}&body=${body}">${t("Email for details")}</a>${sheetBtns(["finished", t("I’ve sent it")], ["closeSheet", t("Not yet")])}`);
}
function completeGift(p) {
  const f = fundOf(p.fund), ts = Date.now(), pu = S.pushkas.find((x) => x.id === p.pid) || P(), offline = p.method && p.method !== "online";
  if (p.fromPushka) { pu.balance = r2(pu.balance - p.amt); if (pu.balance < 0.005) { pu.balance = 0; pu.drops = 0; S.lastEmptied = ts; } if (S.jingle) clink(7, 0.06, 0); }
  pushHist({ kind: "gift", t: ts, amt: p.amt, fund: p.fund, fp: !!p.fromPushka, freq: p.freq, method: p.method, ded: p.ded || "", receiptUrl: p.receiptUrl || "", receipt: API.enabled && !offline });
  save(); buzz([60, 40, 60]); fanfare(); confetti(); U.pending = null; U.giveFund = null; draw();
  const note = API.enabled && !offline ? (S.email ? t("A receipt is on its way to {email}.", { email: `<bdi>${esc(S.email)}</bdi>` }) : "") : offline ? t("We’ll confirm once your gift is received.") : t("Your receipt will be emailed by our donation page.");
  sheet(`<div class="done"><div class="ck" style="color:var(--accent)">${ico(I.check, 24)}</div><h3>${t("Todah rabah")}</h3><div style="font-size:14px;max-width:280px">${t("{amt} is on its way to the {fund}.", { amt: money2(p.amt), fund: t(f.name) })}</div><div class="h-s">${note}</div>${p.receiptUrl ? `<a class="btn btn-ghost" href="${esc(p.receiptUrl)}" target="_blank" rel="noopener">${t("View receipt")}</a>` : ""}</div><button class="btn btn-primary cta" data-act="closeSheet">${t("Done")}</button>`);
}
function autoEmpty() {
  const p = P(), now = new Date(); if (p.balance <= 0 || S.emptyMode === "manual" || S.prompted === dkey(now)) return;
  const last = new Date(S.lastEmptied), due = (S.emptyMode === "full" && p.balance >= S.goal) || (S.emptyMode === "friday" && now.getDay() === 5) || (S.emptyMode === "monthly" && (now.getMonth() !== last.getMonth() || now.getFullYear() !== last.getFullYear()));
  if (due) { S.prompted = dkey(now); save(); openEmpty(); }
}

// cards & monthly gifts
A.addCard = () => addCard();
A.removeCard = () => sheet(`<div><h3>${t("Remove this card?")}</h3><div class="h-s" style="font-size:13px">${t("You’ll need to add a card again before your next gift.")}</div></div><button class="btn btn-primary cta" data-act="removeCardGo">${t("Remove card")}</button><button class="btn btn-ghost" data-act="closeSheet">${t("Cancel")}</button>`);
A.removeCardGo = () => { closeSheet(); removeCard(); };
A.cancelSub = (v) => sheet(`<div><h3>${t("Cancel this monthly gift?")}</h3><div class="h-s" style="font-size:13px">${t("No further gifts will be charged.")}</div></div><button class="btn btn-primary cta" data-act="cancelSubGo" data-v="${esc(v)}">${t("Cancel monthly gift")}</button><button class="btn btn-ghost" data-act="closeSheet">${t("Keep it")}</button>`);
A.cancelSubGo = async (v) => { closeSheet(); try { await api("/subscriptions/" + encodeURIComponent(v), { method: "DELETE" }); toast(tt("Monthly gift cancelled")); } catch (e) { toast(errText(e)); } API.subs = null; draw(); };

// wallet
A.walletLearn = () => infoSheet(tt("About the wallet"), t("Your wallet will hold funds you set aside for tzedakah, so emptying your pushka later is quick and simple. This feature is coming soon."));
const soon = (what) => infoSheet(what, t("This feature is coming soon."));
A.addFunds = () => soon(tt("Add funds")); A.walletSend = () => soon(tt("Send / request between wallets")); A.autoRefill = () => soon(tt("Manage wallet auto refill"));
A.walletHist = () => infoSheet(tt("Wallet transaction history"), t("No wallet transactions yet."));

// maaser
const maaserRefresh = () => { const o = maaserOut(); $("#maaOut").textContent = money2(o); $$(".maaBtn").forEach((b) => (b.disabled = !(o > 0))); };
A.maaserAmt = (v) => { U.maaserAmt = v; maaserRefresh(); };
A.maaserPct = (v) => { S.maaser = +v; $("#maaPct").textContent = v + "%"; maaserRefresh(); };
A.maaserSave = () => save();
A.maaserPushka = () => { const o = maaserOut(); if (o > 0) { drop(o, "maaser"); toast(tt("{amt} added to your pushka", { amt: money2(o) })); } };
A.maaserWallet = () => soon(tt("Add to wallet"));
A.maaserDonate = () => { const o = maaserOut(); if (o > 0) startGift({ amt: o, fund: "general", freq: "once", ded: tt("Maaser"), fromPushka: false, method: "online", pid: P().id }); };

// segulos
A.seg = (v) => { U.segId = v; const s = SEGULOS.find((x) => x.id === v); U.stack.push(U.page); U.page = s.kind === "quotes" ? "quotes" : "segulah"; draw(); };
A.segQ = (v) => { U.segQ = v; $("#segList").innerHTML = segList(); };
A.segCat = (v) => { U.segCat = v; $("#segChips").innerHTML = segChips(); $("#segList").innerHTML = segList(); };

// reminders
A.remToggle = async (v) => {
  const r = v === "candle" ? S.rem.candle : v === "streak" ? S.rem.streak : S.rem.custom.find((x) => x.id === v); if (!r) return;
  if (!r.on && !(await ensureNotify())) return;
  r.on = !r.on; save(); if (r.on && v === "candle") loadCandles(); draw();
};
A.remDel = (v) => { S.rem.custom = S.rem.custom.filter((x) => x.id !== v); save(); draw(); };
A.candleMins = () => sheet(`<h3>${t("Before Candle Lighting")}</h3><div class="field"><label>${t("Remind me")}</label><div class="seg">${[10, 15, 30, 60].map((m) => `<label><input type="radio" name="cm" value="${m}" ${S.rem.candle.mins === m ? "checked" : ""}>${t("{n} min", { n: m })}</label>`).join("")}</div></div>${sheetBtns(["candleSave", t("Save")], ["closeSheet", t("Cancel")])}`);
A.candleSave = () => { S.rem.candle.mins = +($("input[name=cm]:checked") || { value: 15 }).value; save(); closeSheet(); draw(); };
A.addRem = () => sheet(`<h3>${t("Add reminder")}</h3><div class="field"><label for="rt">${t("Time")}</label><input class="input" id="rt" type="time" value="09:00"></div><div class="field"><label>${t("Repeat")}</label><div class="seg"><label><input type="radio" name="rd" value="weekdays" checked>${t("Weekdays")}</label><label><input type="radio" name="rd" value="daily">${t("Every day")}</label><label><input type="radio" name="rd" value="friday">${t("Fridays")}</label></div></div><div class="field"><label for="rx">${t("Message (optional)")}</label><input class="input" id="rx" maxlength="60" placeholder="${t("Time to give tzedakah!")}"></div>${sheetBtns(["remSave", t("Save")], ["closeSheet", t("Cancel")])}`);
A.remSave = async () => { const time = $("#rt").value; if (!time) return toast(tt("Choose a time")); const r = { id: uid(), time, days: ($("input[name=rd]:checked") || {}).value || "weekdays", text: $("#rx").value.trim(), on: true }; closeSheet(); if (!(await ensureNotify())) return; S.rem.custom.push(r); save(); draw(); };

// settings
A.setGoal = (v) => { const n = parseFloat(v); if (n >= 1 && n <= 100000) { S.goal = r2(n); save(); } draw(); };
A.setPreset = (v, el) => { const n = parseFloat(v); if (n > 0 && n <= 10000) { S.presets[+el.dataset.i] = r2(n); save(); } draw(); };
A.setEmpty = (v) => { S.emptyMode = v; save(); };
A.tgl = (k) => { S[k] = !S[k]; save(); if (S[k] && k === "sound") clink(1, 0, 0); draw(); };
A.bio = async () => {
  if (S.bio) { S.bio = ""; save(); draw(); return toast(tt("Biometric lock off")); }
  if (!(await bioSupported())) return toast(tt("This device doesn’t support a screen-lock unlock"));
  try { await bioEnable(); toast(tt("Biometric lock on")); } catch (e) { toast(tt("Couldn’t turn on the lock")); } draw();
};
A.unlock = async () => { try { await bioUnlock(); $("#lock").hidden = true; } catch (e) { toast(tt("Unlock failed. Try again.")); } };
A.addPushka = () => sheet(`<h3>${t("Add pushka")}</h3><div class="field"><label for="np">${t("Name")}</label><input class="input" id="np" maxlength="24" placeholder="${t("e.g. Kids’ pushka")}"></div>${sheetBtns(["pushkaAdd", t("Add")], ["closeSheet", t("Cancel")])}`, () => setTimeout(() => $("#np") && $("#np").focus(), 60));
A.pushkaAdd = () => { const n = $("#np").value.trim(); if (!n) return toast(tt("Enter a name")); const p = { id: uid(), name: n, balance: 0, drops: 0 }; S.pushkas.push(p); S.cur = p.id; save(); closeSheet(); draw(); };
A.editPushka = (v) => { const p = S.pushkas.find((x) => x.id === v); sheet(`<h3>${esc(pTitle(p))}</h3><div class="field"><label for="rn">${t("Name")}</label><input class="input" id="rn" maxlength="24" value="${esc(p.name)}" placeholder="${esc(pTitle({ name: "" }))}"></div><button class="btn btn-primary cta" data-act="pushkaSave" data-v="${p.id}">${t("Save")}</button><button class="btn btn-secondary cta" data-act="setCur" data-v="${p.id}">${t("Make current")}</button>${S.pushkas.length > 1 ? `<button class="btn btn-ghost" data-act="pushkaDel" data-v="${p.id}">${t("Delete this pushka")}</button>` : ""}`); };
A.pushkaSave = (v) => { const p = S.pushkas.find((x) => x.id === v); p.name = $("#rn").value.trim(); save(); closeSheet(); draw(); };
A.pushkaDel = (v) => { const p = S.pushkas.find((x) => x.id === v); if (p.balance > 0) return sheet(`<div><h3>${t("Delete this pushka?")}</h3><div class="h-s" style="font-size:13px">${t("It holds {amt}. Deleting it removes that amount from your pushka. Consider emptying it first.", { amt: money2(p.balance) })}</div></div><button class="btn btn-primary cta" data-act="pushkaDelGo" data-v="${p.id}" style="color:#9b1c5a;border-color:#9b1c5a">${t("Delete anyway")}</button><button class="btn btn-ghost" data-act="closeSheet">${t("Cancel")}</button>`); A.pushkaDelGo(v); };
A.pushkaDelGo = (v) => { S.pushkas = S.pushkas.filter((x) => x.id !== v); if (S.cur === v) S.cur = S.pushkas[0].id; save(); closeSheet(); draw(); };
const FIELDS = { name: ["Name", "text", "name"], email: ["Email", "email", "email"], billingEmail: ["Billing email", "email", "email"], phone: ["Phone number", "tel", "tel"], address: ["Mailing address", "text", "street-address"] };
A.editField = (k) => { const [label, type, auto] = FIELDS[k]; sheet(`<h3>${t(label)}</h3><div class="field"><label for="ef">${t(label)}</label><input class="input" id="ef" type="${type}" autocomplete="${auto}" maxlength="120" value="${esc(S[k])}"></div><button class="btn btn-primary cta" data-act="fieldSave" data-v="${k}">${t("Save")}</button>`, () => setTimeout(() => $("#ef") && $("#ef").focus(), 60)); };
A.fieldSave = (k) => { S[k] = $("#ef").value.trim(); save(); closeSheet(); draw(); };
const wipe = () => { try { localStorage.removeItem(KEY); } catch (e) {} location.reload(); };
A.deleteAcct = () => sheet(`<div><h3>${t("Delete account?")}</h3><div class="h-s" style="font-size:13px">${t("This erases your pushkas, history and settings from this device, stops any monthly gifts and removes your saved card. Gifts you already made are not affected.")}</div></div><button class="btn btn-primary cta" data-act="wipe" style="color:#9b1c5a;border-color:#9b1c5a">${t("Delete everything")}</button><button class="btn btn-ghost" data-act="closeSheet">${t("Cancel")}</button>`);
A.wipe = async () => { if (API.enabled && S.token) { try { await api("/account", { method: "DELETE" }); } catch (e) { if (e.code !== "unauthorized") { closeSheet(); return toast(errText(e)); } } } wipe(); };
A.resetApp = (v, el) => { if (el.dataset.armed) return wipe(); el.dataset.armed = "1"; el.textContent = tt("Tap again to erase this app’s data"); setTimeout(() => { el.dataset.armed = ""; el.textContent = tt("Can’t unlock? Reset this app"); }, 5000); };

// ---------- start ----------
applyLang(); draw();
if (S.bio) { showLock(); A.unlock(); }
initPay(); loadCandles(); setInterval(tick, 30000); setTimeout(tick, 2000); setTimeout(autoEmpty, 1500);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
