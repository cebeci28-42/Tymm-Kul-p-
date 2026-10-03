const CACHE='klup-dosyasi-v3';
const APP_SHELL=[
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];
const CDN_LIBS=[
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];

self.addEventListener('install',e=>{
  e.waitUntil(
    caches.open(CACHE).then(async c=>{
      await c.addAll(APP_SHELL);
      for(const u of CDN_LIBS){
        try{const r=await fetch(u,{mode:'cors',cache:'no-cache'});if(r.ok)await c.put(u,r.clone())}catch(_){}
      }
    }).then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',e=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const url=new URL(e.request.url);
  // Blob URL'leri servis etme
  if(url.protocol==='blob:')return;
  e.respondWith(
    caches.match(e.request).then(cached=>{
      if(cached)return cached;
      return fetch(e.request).then(r=>{
        if(r&&r.ok&&(url.origin===location.origin||CDN_LIBS.some(l=>e.request.url.startsWith(l)))){
          const copy=r.clone();
          caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{});
        }
        return r;
      }).catch(()=>caches.match('./index.html'));
    })
  );
});