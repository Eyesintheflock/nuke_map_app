self.addEventListener('install',e=>{self.skipWaiting();});
self.addEventListener('activate',e=>{clients.claim();});
self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET') return;
  e.respondWith((async()=>{
    try{ return await fetch(req); }catch{ return caches.match(req) || new Response('',{status:504}); }
  })());
});
