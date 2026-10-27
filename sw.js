// ============================================================
// Service Worker — NSE Option Chain Scanner PWA
// Caches all app files for 100% offline use
// ============================================================

const CACHE_NAME = 'oc-scanner-v1';

// All files the app needs to work offline
const FILES_TO_CACHE = [
  './index.html',
  './style.css',
  './app.js',
  './papaparse.min.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

// ── Install: cache all files ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(FILES_TO_CACHE.map(url => {
        // Use Request with cache:'reload' to bypass HTTP cache on install
        return new Request(url, { cache: 'reload' });
      })).catch(() => {
        // If icons don't exist yet, cache what we can
        return cache.addAll(['./index.html', './style.css', './app.js', './papaparse.min.js', './manifest.json']);
      });
    })
  );
  // Take control immediately without waiting for page refresh
  self.skipWaiting();
});

// ── Activate: delete old caches ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keyList =>
      Promise.all(
        keyList
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: serve from cache, fall back to network ──
self.addEventListener('fetch', event => {
  // Only handle GET requests for our own files
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) return cachedResponse;
      // Not in cache — try network
      return fetch(event.request).then(networkResponse => {
        // Cache successful network responses
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
        }
        return networkResponse;
      }).catch(() => {
        // Network failed — return offline fallback if available
        return caches.match('./index.html');
      });
    })
  );
});
