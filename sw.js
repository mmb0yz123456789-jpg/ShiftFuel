// ShiftFuel service worker — conservative, network-first.
//
// Goal: make the site installable (PWA) and give a light offline fallback,
// WITHOUT ever serving stale code during a deploy. It only touches same-origin
// GET requests; Supabase, Stripe, Mapbox (cross-origin) and all POST/RPC calls
// pass straight through untouched.
//
// Strategy: always try the network first (so an online user always gets the
// latest deployed assets), and fall back to the cached copy only when offline.

const RUNTIME_CACHE = 'shiftfuel-runtime-v3';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  // Activate this version immediately on next load.
  self.skipWaiting();
  event.waitUntil(caches.open(RUNTIME_CACHE).then((cache) => cache.add(OFFLINE_URL)).catch(() => {}));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Drop old caches from previous SW versions.
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== RUNTIME_CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// ── Web Push ──────────────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (_) { payload = { body: event.data && event.data.text() }; }
  const title = payload.title || 'ShiftFuel Concierge';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/pwa-icon-192.png',
    badge: '/pwa-icon-192.png',
    tag: payload.tag || undefined,        // collapses duplicate alerts for the same job
    renotify: Boolean(payload.tag),
    data: { url: payload.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Focus an existing tab on the same origin if one is open; else open a new one.
    for (const client of all) {
      try {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          client.navigate(target).catch(() => {});
          return client.focus();
        }
      } catch (_) {}
    }
    if (self.clients.openWindow) return self.clients.openWindow(target);
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  let url;
  try { url = new URL(request.url); } catch (_) { return; }

  // Only handle same-origin GETs. Everything else (POSTs, cross-origin) is untouched.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Never intercept API calls — they must always hit the network (never cached or
  // offline-served), and letting them through here just logs spurious SW errors.
  if (url.pathname.startsWith('/api/')) return;

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
      if (request.mode === 'navigate') {
        const offline = await caches.match(OFFLINE_URL);
        if (offline) return offline;
        return new Response('ShiftFuel is offline. Please reconnect and refresh.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }
      return new Response('', { status: 504, statusText: 'Gateway Timeout' });
    }
  })());
});
