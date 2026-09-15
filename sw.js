/* Scope-relative shell cache; never caches weather or third-party map tiles. */
const CACHE_VERSION = 'v2026-09-15-1';
const SCOPE = new URL(self.registration.scope);
const CACHE_PREFIX = `nuke_map_app_${SCOPE.pathname}_`;
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`;
const CORE_ASSETS = ['./','index.html','app.js?v=2026-09-15-1','app/platform.js?v=2026-09-15-1','styles.css?v=2026-09-15-1','manifest.webmanifest','Icon-192.png','Icon-512.png'].map(p=>new URL(p,SCOPE).href);
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(CORE_ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE_NAME && (k.startsWith(CACHE_PREFIX) || (SCOPE.pathname==='/nuke_map_app/' && /^nuke_map_app_v/.test(k)))).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event=>{
  const req=event.request,url=new URL(req.url);
  if(req.method!=='GET'||url.origin!==SCOPE.origin||!url.pathname.startsWith(SCOPE.pathname))return;
  const navigation=req.mode==='navigate';
  if(!navigation&&!CORE_ASSETS.includes(url.href))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE_NAME);
    try{
      const response=await fetch(req,{cache:'no-cache'});
      if(!response.ok)throw new Error('HTTP '+response.status);
      await cache.put(req,response.clone());return response;
    }catch{
      const cached=await cache.match(req) || (navigation && await cache.match(new URL('index.html',SCOPE).href));
      return cached || new Response('Unavailable offline. Open this app online once to cache its shell.',{status:503,headers:{'Content-Type':'text/plain'}});
    }
  })());
});
