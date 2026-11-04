'use strict';
/* Offline: wszystkie pliki aplikacji są zapisywane w pamięci przeglądarki.
   Dane użytkownika (localStorage) nie są tutaj kopiowane. */

const APP_VERSION = '1.4.0';
const CACHE_NAME = 'ogarniacz-v1.4.0';
const V = '?v=' + APP_VERSION;

const APP_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/themes.css' + V,
  './css/app.css' + V,
  './css/mobile.css' + V,
  './js/seed.js' + V,
  './js/storage.js' + V,
  './js/sync-core.js' + V,
  './js/store.js' + V,
  './js/ui.js' + V,
  './js/dnd.js' + V,
  './js/sidebar.js' + V,
  './js/board.js' + V,
  './js/card.js' + V,
  './js/sync.js' + V,
  './js/app.js' + V,
  './js/pwa.js' + V,
  './assets/logo.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    /* Wymuszamy świeże pobranie także index.html - przeglądarka nie może
       podstawić starej wersji z pamięci HTTP. */
    await Promise.all(APP_FILES.map(async (file) => {
      const response = await fetch(file, { cache: 'reload' });
      if (!response || !response.ok) throw new Error('Nie udało się pobrać ' + file);
      await cache.put(file, response);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  /* Strona: najpierw sieć, z pominięciem starej pamięci HTTP, żeby po
     wdrożeniu od razu była nowa wersja. Bez internetu wracamy do kopii. */
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'reload' })
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  /* Pliki aplikacji: z pamięci, a w tle odświeżamy z sieci. */
  event.respondWith(
    caches.match(request).then((cached) => {
      const fresh = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || fresh;
    })
  );
});
