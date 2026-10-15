// My Pushka service worker: keeps the app opening instantly and offline, and shows reminder notifications.
// Strategy: network-first (so updates always arrive), cached copy when offline. Payments (/api) are never cached.
const CACHE = "pushka-shell-v3";
const SHELL = ["./", "index.html", "pushka.css", "pushka.js", "hebdate.js", "segulos.js", "segulos.he.js", "i18n.js", "manifest.json", "icon.svg", "icon-192.png", "icon-512.png", "privacy.html", "support.html"];
self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin || !u.pathname.startsWith("/pushka/")) return;
  e.respondWith(fetch(r).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(r, copy)); } return res; })
    .catch(() => caches.match(r, { ignoreSearch: true }).then((hit) => hit || (r.mode === "navigate" ? caches.match("./") : Response.error()))));
});
// Reminders sent from our server (candle lighting, streak, yahrzeit, and messages from the Rabbi).
self.addEventListener("push", (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (err) {}
  const url = typeof d.url === "string" && d.url.startsWith("/pushka/") ? d.url : "/pushka/";
  e.waitUntil(self.registration.showNotification(String(d.title || "My Pushka").slice(0, 80), { body: String(d.body || "").slice(0, 240), icon: "icon-192.png", badge: "icon-192.png", tag: String(d.tag || "pushka"), data: { url } }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/pushka/";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    const c = list.find((w) => w.url.includes("/pushka/"));
    if (c && "navigate" in c) return c.navigate(url).then((w) => w && w.focus());
    return self.clients.openWindow(url);
  }));
});
