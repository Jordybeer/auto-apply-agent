// werkzoeker — Service Worker
// Strategy:
//   - App shell (/, /queue, /saved, /applied, /insights) → Cache First
//   - API routes (/api/*) → Network Only (never cache)
//   - Static assets (/_next/static/*) → Cache First, long-lived
//   - Everything else → Network First, fall back to cache, then offline page

const CACHE_VERSION = 'v1';
const STATIC_CACHE  = `werkzoeker-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `werkzoeker-dynamic-${CACHE_VERSION}`;

const APP_SHELL = [
  '/',
  '/queue',
  '/saved',
  '/applied',
  '/insights',
  '/settings',
  '/offline',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/apple-touch-icon.png',
];

// ── Install: precache app shell ──────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: purge old caches ───────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== DYNAMIC_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: routing logic ─────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // API routes → network only, never cache
  if (url.pathname.startsWith('/api/')) return;

  // Next.js static assets → cache first (they are content-hashed)
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // App shell routes → cache first
  if (APP_SHELL.includes(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Everything else → network first, dynamic cache fallback
  event.respondWith(networkFirst(request));
});

// ── Strategies ───────────────────────────────────────────────────
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return caches.match('/offline') || new Response('Offline', { status: 503 });
  }
}

async function networkFirst(request) {
  const cache = await caches.open(DYNAMIC_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return caches.match('/offline') || new Response('Offline', { status: 503 });
  }
}
