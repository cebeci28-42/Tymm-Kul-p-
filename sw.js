const CACHE_VERSION='v7';
const CACHE_NAME=`klup-dosyasi-${CACHE_VERSION}`;
const APP_SHELL=['./','./index.html','./manifest.json','./icons/icon-48.png','./icons/icon-72.png','./icons/icon-96.png','./icons/icon-144.png','./icons/icon-192.png','./icons/icon-512.png'];
const CDN_LIBS=['https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js','https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js','https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js','https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'];

self.addEventListener('install',e=>{e.waitUntil((async()=>{const cache=await caches.open(CACHE_NAME);for(const url of APP_SHELL){try{await cache.add(url)}catch(err){console.warn('[SW] önbelleğe alınamadı:',url)}}for(const url of CDN_LIBS){try{const r=await fetch(url,{mode:'cors',cache:'no-cache'});if(r.ok)await cache.put(url,r.clone())}catch(err){}}await self.skipWaiting()})())});

self.addEventListener('activate',e=>{e.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('klup-dosyasi-')&&k!==CACHE_NAME).map(k=>caches.delete(k)));if(self.registration.navigationPreload)await self.registration.navigationPreload.enable();await self.clients.claim()})())});

self.addEventListener('fetch',e=>{
  const request=e.request;if(request.method!=='GET')return;
  const url=new URL(request.url);if(!url.protocol.startsWith('http'))return;if(url.protocol==='blob:')return;
  if(request.mode==='navigate'){e.respondWith(networkFirstNavigation(e));return}
  if(CDN_LIBS.some(lib=>request.url.startsWith(lib))){e.respondWith(cacheFirst(request));return}
  if(url.origin===self.location.origin){e.respondWith(staleWhileRevalidate(request));return}
  e.respondWith(networkFirst(request));
});

async function networkFirstNavigation(event){try{const preload=await event.preloadResponse;if(preload)return preload;const nr=await fetch(event.request);if(nr&&nr.ok){const c=await caches.open(CACHE_NAME);c.put(event.request,nr.clone())}return nr}catch(err){const cached=await caches.match(event.request);if(cached)return cached;const fallback=await caches.match('./index.html');if(fallback)return fallback;return new Response('Çevrimdışı',{status:503,statusText:'Service Unavailable',headers:{'Content-Type':'text/plain; charset=utf-8'}})}}
async function cacheFirst(request){const cached=await caches.match(request);if(cached)return cached;try{const nr=await fetch(request);if(nr&&nr.ok){const cache=await caches.open(CACHE_NAME);cache.put(request,nr.clone())}return nr}catch(err){return new Response('',{status:504,statusText:'Gateway Timeout'})}}
async function staleWhileRevalidate(request){const cache=await caches.open(CACHE_NAME);const cached=await cache.match(request);const fp=fetch(request).then(r=>{if(r&&r.ok)cache.put(request,r.clone());return r}).catch(()=>cached);return cached||fp}
async function networkFirst(request){try{const nr=await fetch(request);if(nr&&nr.ok){const cache=await caches.open(CACHE_NAME);cache.put(request,nr.clone())}return nr}catch(err){const cached=await caches.match(request);if(cached)return cached;return new Response('',{status:504,statusText:'Gateway Timeout'})}}

self.addEventListener('message',event=>{if(event.data==='SKIP_WAITING')self.skipWaiting();if(event.data==='CLEAR_CACHE')event.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(k=>caches.delete(k)))))});