/* ============================================================
   Klüp Dosyası - Service Worker
   PWA Builder uyumlu, çevrimdışı destekli
   ============================================================ */

const CACHE_VERSION = 'v4';
const CACHE_NAME = `klup-dosyasi-${CACHE_VERSION}`;

// Uygulama kabuğu (offline çalışması için önbelleğe alınır)
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-48.png',
  './icons/icon-72.png',
  './icons/icon-96.png',
  './icons/icon-144.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// CDN kütüphaneleri (offline çalışma için önbelleğe alınır)
const CDN_LIBS = [
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];

/* ---------- INSTALL ---------- */
self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      // Uygulama kabuğunu yükle (biri başarısız olursa tümü başarısız olmasın)
      for (const url of APP_SHELL) {
        try {
          await cache.add(url);
        } catch (err) {
          console.warn('[SW] Uygulama kabuğu önbelleğe alınamadı:', url, err);
        }
      }

      // CDN kütüphanelerini yükle (opsiyonel — internet yoksa atla)
      for (const url of CDN_LIBS) {
        try {
          const response = await fetch(url, { mode: 'cors', cache: 'no-cache' });
          if (response.ok) {
            await cache.put(url, response.clone());
          }
        } catch (err) {
          console.warn('[SW] CDN kütüphanesi önbelleğe alınamadı:', url);
        }
      }

      await self.skipWaiting();
    })()
  );
});

/* ---------- ACTIVATE ---------- */
self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      // Eski sürümleri temizle
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(key => key.startsWith('klup-dosyasi-') && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      );

      // Navigation preload (varsa)
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }

      await self.clients.claim();
    })()
  );
});

/* ---------- FETCH ---------- */
self.addEventListener('fetch', event => {
  const request = event.request;

  // Sadece GET istekleri önbelleğe alınır
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Blob, data, chrome-extension gibi şemaları atla
  if (!url.protocol.startsWith('http')) return;

  // IndexedDB / blob URL'leri atla
  if (url.protocol === 'blob:') return;

  // POST/PUT/DELETE gibi istekler yukarıda filtrelendi

  // HTML navigasyon istekleri → Network First (yeni sürüm öncelikli)
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(event));
    return;
  }

  // CDN kütüphaneleri → Cache First
  if (CDN_LIBS.some(lib => request.url.startsWith(lib))) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Aynı origin statik dosyalar → Stale While Revalidate
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Diğer cross-origin istekler → Network First (fallback: cache)
  event.respondWith(networkFirst(request));
});

/* ---------- STRATEJİLER ---------- */

// Network First (navigasyon): önce ağ, başarısız olursa önbellekten index.html
async function networkFirstNavigation(event) {
  try {
    const preloadResponse = await event.preloadResponse;
    if (preloadResponse) return preloadResponse;

    const networkResponse = await fetch(event.request);
    if (networkResponse && networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(event.request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    const cached = await caches.match(event.request);
    if (cached) return cached;

    // Son çare: index.html
    const fallback = await caches.match('./index.html');
    if (fallback) return fallback;

    return new Response('Çevrimdışı — bağlantı yok.', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

// Cache First: önce önbellek, yoksa ağ
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    return new Response('', { status: 504, statusText: 'Gateway Timeout' });
  }
}

// Stale While Revalidate: önbellekten hemen dön, arka planda güncelle
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then(response => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);

  return cached || fetchPromise;
}

// Network First: önce ağ, başarısız olursa önbellek
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;

    return new Response('', { status: 504, statusText: 'Gateway Timeout' });
  }
}

/* ---------- MESSAGE ---------- */
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then(keys =>
        Promise.all(keys.map(key => caches.delete(key)))
      )
    );
  }
});

/* ---------- PUSH (opsiyonel, ileride kullanılabilir) ---------- */
self.addEventListener('push', event => {
  if (!event.data) return;

  let data = {};
  try {
    data = event.data.json();
  } catch (e) {
    data = { title: 'Klüp Dosyası', body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Klüp Dosyası', {
      body: data.body || '',
      icon: './icons/icon-192.png',
      badge: './icons/icon-96.png',
      vibrate: [200, 100, 200]
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('./index.html');
      }
    })
  );
});