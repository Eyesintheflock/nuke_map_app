// sw.js — safe, opt-in only
const VERSION = 'v5-' + Date.now();

// Only activate if URL contains enableSW=1
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const u = new URL(event.request.url);
  const enabled = u.searchParams.get('enableSW') === '1';
  if (!enabled) return; // bypass cache entirely unless explicitly opted in

  event.respondWith(
    caches.open(VERSION).then(async cache => {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      const resp = await fetch(event.request);
      if (resp.ok && event.request.method === 'GET' && resp.type !== 'opaque') {
        cache.put(event.request, resp.clone());
      }
      return resp;
    })
  );
});