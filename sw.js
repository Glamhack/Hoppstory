// Service worker: caches the app shell, and map tiles as you view them.
// Bump VERSION when you change any app file so clients pick up the new shell.
const VERSION = 'v28';
const SHELL_CACHE = `shell-${VERSION}`;
const TILE_CACHE = 'tiles-v1';
const ROUTE_CACHE = 'routes-v1';
const MAX_TILES = 2000;

const SHELL = [
  './',
  'index.html',
  'event.html',
  'austragung.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/config.js',
  'js/map.js',
  'js/events.js',
  'js/timeline.js',
  'js/event-page.js',
  'js/austragung-page.js',
  'data/data.json',
  'js/app.js',
  'vendor/leaflet/leaflet.js',
  'vendor/leaflet/leaflet.css',
  'vendor/leaflet/images/layers.png',
  'vendor/leaflet/images/layers-2x.png',
  'vendor/leaflet/images/marker-icon.png',
  'vendor/leaflet/images/marker-icon-2x.png',
  'vendor/leaflet/images/marker-shadow.png',
  'icons/icon.svg',
  'icons/logo-white.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k.startsWith('shell-') && k !== SHELL_CACHE).map((k) => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

async function trimTiles() {
  const cache = await caches.open(TILE_CACHE);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_TILES; i++) await cache.delete(keys[i]);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // swisstopo tiles: cache first, then network.
  if (url.hostname === 'wmts.geo.admin.ch') {
    event.respondWith(
      caches.open(TILE_CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok || res.type === 'opaque') {
          cache.put(request, res.clone()).then(trimTiles);
        }
        return res;
      })
    );
    return;
  }

  // Road routes (OSRM): cache first, so routes already seen also work offline.
  if (url.hostname === 'router.project-osrm.org') {
    event.respondWith(
      caches.open(ROUTE_CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      })
    );
    return;
  }

  // App shell (same origin): network first so edits show up during development,
  // falling back to the cache when offline.
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(request, copy));
          return res;
        })
        // Pages with a query (event.html?id=…) fall back to the cached page without it.
        .catch(() => caches.match(request)
          .then((r) => r || caches.match(request, { ignoreSearch: true }))
          .then((r) => r || caches.match('index.html')))
    );
  }
});
