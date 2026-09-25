const CACHE='klup-dosyasi-v4';
const APP=['./','./index.html','./manifest.json','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(APP)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  e.respondWith(caches.match(e.request).then(cached=>cached||fetch(e.request).then(r=>{
    if(r && r.ok && new URL(e.request.url).protocol.startsWith('http')){
      const copy=r.clone(); caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{});
    }
    return r;
  }).catch(()=>caches.match('./index.html'))));
});
