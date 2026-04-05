// werkzoeker — Service Worker v2
// Strategy:
//   - App shell (/, /queue, ...) → Network First (Next.js RSC needs fresh HTML)
//   - API routes (/api/*)        → Network Only (never cache)
//   - /_next/static/*            → Cache First (content-hashed, safe)
//   - Everything else            → Network First, fall back to cache

const CACHE_VERSION = 'v2';
const STATIC_CACHE  = `werkzoeker-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `werkzoeker-dynamic-${CACHE_VERSION}`;

const PRECACHE_ASSETS = [
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/apple-touch-icon.png',
  '/offline.html',
];

// ── Install: precache only truly static assets ───────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
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

  // API routes → network only, never intercept
  if (url.pathname.startsWith('/api/')) return;

  // Next.js RSC / prefetch requests → network only
  if (url.searchParams.has('_rsc') || request.headers.get('rsc') === '1') return;

  // Next.js static assets → cache first (content-hashed, safe forever)
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Everything else (pages, icons, manifest) → network first
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
    return offlineFallback();
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
    return offlineFallback();
  }
}

async function offlineFallback() {
  const cached = await caches.match('/offline.html');
  return cached || new Response('<h1>Offline</h1>', { status: 503, headers: { 'Content-Type': 'text/html' } });
}
