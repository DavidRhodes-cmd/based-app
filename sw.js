// BASED service worker.
// Keeps a copy of BASED's own app files (the page, icons, manifest) so the app opens quickly
// and still shows something when there's no signal.
// It never touches requests to other sites — Supabase (profiles, answers, messages), photos,
// payments, checks — so none of that is ever stored on the device by it. Addresses are stored
// without their ?… part, so links carrying tokens are never kept either.
const CACHE = 'based-v4';
const ASSETS = ['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});

// Removes every older cache, including anything earlier versions stored
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // Other sites, and anything that isn't a plain read: leave it entirely to the browser
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  const isPage = req.mode === 'navigate';
  const key = isPage ? '/index.html' : url.origin + url.pathname; // never the ?… part
  e.respondWith(
    fetch(req).then((fresh) => {
      if (fresh.ok && fresh.type === 'basic') {
        const copy = fresh.clone();
        caches.open(CACHE).then((c) => c.put(key, copy)).catch(() => {});
      }
      return fresh;
    }).catch(() => caches.match(key).then((cached) => cached || caches.match('/index.html')))
  );
});
