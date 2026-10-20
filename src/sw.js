'use strict';
/* Offline: wszystkie pliki aplikacji są zapisywane w pamięci przeglądarki.
   Dane użytkownika (localStorage) nie są tutaj kopiowane. */

const CACHE_NAME = 'ogarniacz-v1.3.0';

const APP_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/themes.css',
  './css/app.css',
  './css/mobile.css',
  './js/seed.js',
  './js/storage.js',
  './js/store.js',
  './js/ui.js',
  './js/dnd.js',
  './js/sidebar.js',
  './js/board.js',
  './js/card.js',
  './js/app.js',
  './js/pwa.js',
  './assets/logo.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  /* Strona: najpierw sieć, żeby po wdrożeniu od razu była nowa wersja.
     Bez internetu wracamy do zapisanej kopii. */
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
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
