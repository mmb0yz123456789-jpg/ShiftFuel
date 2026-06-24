// Shared Web Push client. Registers the service worker, requests permission, and
// stores the subscription server-side. Exposes window.ShiftFuelPush.
//
// iOS note: web push only works for a PWA added to the Home Screen (iOS 16.4+),
// never in a normal Safari tab. Android Chrome and desktop work in-browser.
(function () {
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
  }

  function pushSupported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }

  async function getConfigKey() {
    try {
      const r = await fetch('/api/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'config' }),
      });
      const d = await r.json();
      return d.publicKey || null;
    } catch (_) {
      return null;
    }
  }

  // opts: { type: 'worker'|'customer', workerToken?, phone?, email? }
  // returns { ok, reason }
  async function enablePush(opts) {
    if (!pushSupported()) return { ok: false, reason: 'unsupported' };

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return { ok: false, reason: 'denied' };

    let reg;
    try {
      reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
    } catch (_) {
      return { ok: false, reason: 'no-sw' };
    }

    const publicKey = await getConfigKey();
    if (!publicKey) return { ok: false, reason: 'not-configured' };

    let sub;
    try {
      sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }
    } catch (_) {
      return { ok: false, reason: 'subscribe-failed' };
    }

    try {
      const r = await fetch('/api/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'subscribe',
          subscription: sub.toJSON(),
          subscriber_type: opts.type,
          worker_token: opts.workerToken,
          phone: opts.phone,
          email: opts.email,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        return { ok: false, reason: d.error || 'save-failed' };
      }
    } catch (_) {
      return { ok: false, reason: 'save-failed' };
    }

    return { ok: true, endpoint: sub.endpoint };
  }

  // Fire a test notification to the caller's own subscription so they can confirm
  // delivery end-to-end without orchestrating a real job event.
  async function sendTest(endpoint, workerToken) {
    try {
      const r = await fetch('/api/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test', endpoint, worker_token: workerToken }),
      });
      return await r.json().catch(() => ({ ok: r.ok }));
    } catch (_) {
      return { ok: false, error: 'network error' };
    }
  }

  function friendlyReason(reason) {
    switch (reason) {
      case 'unsupported': return 'Notifications aren’t supported here. On iPhone, add this app to your Home Screen first.';
      case 'denied': return 'Notifications are blocked. Enable them for this site in your browser settings.';
      case 'not-configured': return 'Notifications aren’t set up on the server yet.';
      default: return 'Could not enable notifications. Please try again.';
    }
  }

  window.ShiftFuelPush = { enablePush, sendTest, pushSupported, friendlyReason };
})();
