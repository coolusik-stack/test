// Offline cache for the game shell. Bump VERSION when files change.
const VERSION = 'af-v5';
const SHELL = [
  './',
  './index.html',
  './css/style.css',
  './vendor/planck.min.js',
  './vendor/peerjs.min.js',
  './js/main.js',
  './js/game.js',
  './js/terrain.js',
  './js/scene.js',
  './js/fx.js',
  './js/camera.js',
  './js/ai.js',
  './js/art.js',
  './js/audio.js',
  './js/levels.js',
  './js/obstacles.js',
  './js/net.js',
  './js/online.js',
  './js/haptics.js',
  './js/events.js',
  './js/config.js',
  './js/util.js',
  './manifest.webmanifest',
  './assets/icon-192.png',
  './assets/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

// Network first for our own files (so updates show up), cache as fallback offline.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const own = url.origin === self.location.origin;
  const font = url.hostname.endsWith('gstatic.com') || url.hostname.endsWith('googleapis.com');
  if (!own && !font) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined))),
  );
});
