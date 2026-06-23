// ShiftFuel service worker — conservative, network-first.
//
// Goal: make the site installable (PWA) and give a light offline fallback,
// WITHOUT ever serving stale code during a deploy. It only touches same-origin
// GET requests; Supabase, Stripe, Mapbox (cross-origin) and all POST/RPC calls
// pass straight through untouched.
//
// Strategy: always try the network first (so an online user always gets the
// latest deployed assets), and fall back to the cached copy only when offline.

const RUNTIME_CACHE = 'shiftfuel-runtime-v1';

self.addEventListener('install', () => {
  // Activate this version immediately on next load.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Drop old caches from previous SW versions.
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== RUNTIME_CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  let url;
  try { url = new URL(request.url); } catch (_) { return; }

  // Only handle same-origin GETs. Everything else (APIs, POSTs, cross-origin) is untouched.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    try {
      const fresh = await fetch(request);
      // Cache a copy for offline fallback (network-first means online is never stale).
      if (fresh && fresh.status === 200 && fresh.type === 'basic') {
        const copy = fresh.clone();
        caches.open(RUNTIME_CACHE).then((c) => c.put(request, copy)).catch(() => {});
      }
      return fresh;
    } catch (_) {
      // Offline — serve the last good cached copy if we have one.
      const cached = await caches.match(request);
      if (cached) return cached;
      throw _;
    }
  })());
});
