// Keeps the app working without internet: app files come from the cache, then refresh in the background.
const CACHE = "mywarehouse-v2";
const FILES = ["./", "index.html", "app.js", "plan.js", "account.js", "config.js", "manifest.webmanifest", "icons/icon.svg", "icons/icon-192.png",
  "vendor/qrcode.js", "vendor/jsQR.js", "vendor/jspdf.umd.min.js", "vendor/supabase.js"];

self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const hit = await cache.match(e.request, {ignoreSearch: true});
    const net = fetch(e.request).then(res => { if (res.ok || res.type === "opaque") cache.put(e.request, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});
