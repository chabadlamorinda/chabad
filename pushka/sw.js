// My Pushka service worker: keeps the app opening instantly and offline, and shows reminder notifications.
// Strategy: network-first (so updates always arrive), cached copy when offline. Payments (/api) are never cached.
const CACHE = "pushka-shell-v2";
const SHELL = ["./", "index.html", "pushka.css", "pushka.js", "segulos.js", "segulos.he.js", "i18n.js", "manifest.json", "icon.svg", "icon-192.png", "icon-512.png", "privacy.html", "support.html"];
self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin || !u.pathname.startsWith("/pushka/")) return;
  e.respondWith(fetch(r).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(r, copy)); } return res; })
    .catch(() => caches.match(r, { ignoreSearch: true }).then((hit) => hit || (r.mode === "navigate" ? caches.match("./") : Response.error()))));
});
self.addEventListener("notificationclick", (e) => { e.notification.close(); e.waitUntil(self.clients.openWindow("/pushka/")); });
