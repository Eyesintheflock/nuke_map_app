// --- VERSION: bump this every time you deploy ---
const CACHE_VERSION = 'v2025-09-07-2';
const CACHE_NAME = `nuke_map_app_${CACHE_VERSION}`;

// Add/adjust the list of assets you want to precache.
// Tip: include the ?v= cache-buster that you use in index.html.
const CORE_ASSETS = [
  '/',                    // GitHub Pages will serve index.html for /
  '/nuke_map_app/',       // project base path (keeps Pages happy)
  '/nuke_map_app/index.html',
  '/nuke_map_app/app.js?v=2025-09-07-2',
  '/nuke_map_app/manifest.webmanifest',
  '/nuke_map_app/icon-192.png',
  '/nuke_map_app/icon-512.png',
];

// INSTALL: cache core files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  // Activate immediately after install
  self.skipWaiting();
});

// ACTIVATE: delete old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith('nuke_map_app_') && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      );
      // Take control of open clients
      await self.clients.claim();
    })()
  );
});

// FETCH strategy:
// - HTML: network-first (to pick up new deploys)
// - Other static assets: cache-first
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle same-origin requests
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // HTML documents -> network first
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req, { cache: 'no-store' });
          // Optionally update cache for nav requests
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, fresh.clone());
          return fresh;
        } catch {
          const cache = await caches.open(CACHE_NAME);
          const cached = await cache.match(req);
          return cached || cache.match('/nuke_map_app/index.html');
        }
      })()
    );
    return;
  }

  // Static assets -> cache first
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);
      if (cached) return cached;
      const fresh = await fetch(req);
      // Cache a clone for next time
      cache.put(req, fresh.clone());
      return fresh;
    })()
  );
});
