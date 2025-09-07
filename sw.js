// sw.js — safe, opt-in caching only
const VERSION = 'v6-' + Date.now();

self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', event => {
  const u = new URL(event.request.url);
  if (u.searchParams.get('enableSW') !== '1') return; // no caching unless ?enableSW=1
  event.respondWith(
    caches.open(VERSION).then(async cache => {
      const hit = await cache.match(event.request);
      if (hit) return hit;
      const resp = await fetch(event.request);
      if (resp.ok && event.request.method === 'GET' && resp.type !== 'opaque') {
        cache.put(event.request, resp.clone());
      }
      return resp;
    })
  );
});