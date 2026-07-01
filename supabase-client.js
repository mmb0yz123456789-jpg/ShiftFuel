const SHIFTFUEL_CONFIG = window.SHIFTFUEL_CONFIG || {};
const SUPABASE_URL = SHIFTFUEL_CONFIG.supabaseUrl || "";
const SUPABASE_ANON_KEY = SHIFTFUEL_CONFIG.supabaseAnonKey || "";

const supabaseClient = SUPABASE_URL && SUPABASE_ANON_KEY
  ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

if (!supabaseClient) {
  console.error("ShiftFuel Supabase public config is missing. Set SUPABASE_URL and SUPABASE_ANON_KEY for the current Vercel environment.");
}

window.ShiftFuelSupabase = supabaseClient;

(function loadSharedPolish() {
  if (!document.querySelector('link[data-mobile-polish]')) {
    const mobile = document.createElement('link');
    mobile.rel = 'stylesheet';
    mobile.href = 'mobile-polish.css';
    mobile.dataset.mobilePolish = '1';
    document.head.appendChild(mobile);
  }
})();

// ── Interface mode: display-mode × screen size × role ──────────────────────────
// One shared detector so the SAME codebase can present three intentionally
// different experiences: full desktop web, lightweight mobile web, and an
// app-like installed PWA. It sets html/body classes every page can key off:
//   .sf-standalone / .sf-browser   → installed PWA vs normal browser
//   .sf-compact    / .sf-wide      → phone-width vs desktop-width
//   body.sf-role-admin|worker|customer|guest
// and exposes window.SF_MODE = { role, standalone, compact }. The html classes are
// ALSO set by a tiny inline <head> snippet on app pages (anti-FOUC); idempotent.
(function setupInterfaceMode() {
  const root = document.documentElement;
  const mqCompact = window.matchMedia ? window.matchMedia('(max-width: 760px)') : null;
  const mqStandalone = window.matchMedia ? window.matchMedia('(display-mode: standalone)') : null;
  const isStandalone = () => (mqStandalone && mqStandalone.matches) || window.navigator.standalone === true;

  function detectRole() {
    try {
      if (sessionStorage.getItem('shiftfuel_admin') === 'true') return 'admin';
      if (sessionStorage.getItem('shiftfuel_worker_token')) return 'worker';
      if (localStorage.getItem('shiftfuel_customer_account')) return 'customer';
    } catch (_) {}
    return 'guest';
  }

  function apply() {
    const standalone = isStandalone();
    const compact = mqCompact ? mqCompact.matches : window.innerWidth <= 760;
    const role = detectRole();

    root.classList.toggle('sf-standalone', standalone);
    root.classList.toggle('sf-browser', !standalone);
    root.classList.toggle('sf-compact', compact);
    root.classList.toggle('sf-wide', !compact);

    const body = document.body;
    if (body) {
      body.classList.toggle('sf-standalone', standalone);
      body.classList.toggle('sf-browser', !standalone);
      body.classList.toggle('sf-compact', compact);
      body.classList.toggle('sf-wide', !compact);
      ['admin', 'worker', 'customer', 'guest'].forEach((r) => body.classList.toggle('sf-role-' + r, r === role));
    }

    window.SF_MODE = { role, standalone, compact };
    window.dispatchEvent(new CustomEvent('sf-mode-change', { detail: window.SF_MODE }));
  }

  apply();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
  const listen = (mq) => { if (!mq) return; mq.addEventListener ? mq.addEventListener('change', apply) : (mq.addListener && mq.addListener(apply)); };
  listen(mqCompact);
  listen(mqStandalone); // some UAs flip display-mode without a reload
})();

// ── Installable app (PWA) — injected on every page that loads this client ──────
(function setupPwa() {
  const head = document.head;
  const addOnce = (selector, build) => {
    if (!document.querySelector(selector)) head.appendChild(build());
  };

  // Web app manifest (makes it installable on Android/Chrome/desktop).
  addOnce('link[rel="manifest"]', () => {
    const l = document.createElement('link');
    l.rel = 'manifest';
    l.href = 'manifest.webmanifest';
    return l;
  });

  // Theme color for the browser/OS chrome.
  addOnce('meta[name="theme-color"]', () => {
    const m = document.createElement('meta');
    m.name = 'theme-color';
    m.content = '#0d3b3b';
    return m;
  });

  // iOS: allow full-screen "Add to Home Screen" and a home-screen icon.
  addOnce('meta[name="apple-mobile-web-app-capable"]', () => {
    const m = document.createElement('meta');
    m.name = 'apple-mobile-web-app-capable';
    m.content = 'yes';
    return m;
  });
  addOnce('meta[name="apple-mobile-web-app-status-bar-style"]', () => {
    const m = document.createElement('meta');
    m.name = 'apple-mobile-web-app-status-bar-style';
    m.content = 'black-translucent';
    return m;
  });
  addOnce('meta[name="apple-mobile-web-app-title"]', () => {
    const m = document.createElement('meta');
    m.name = 'apple-mobile-web-app-title';
    m.content = 'ShiftFuel';
    return m;
  });
  addOnce('link[rel="apple-touch-icon"]', () => {
    const l = document.createElement('link');
    l.rel = 'apple-touch-icon';
    l.href = 'apple-touch-icon.png';
    return l;
  });

  // App-shell styling for installed-PWA (standalone) mode. Every rule inside is
  // gated on html.sf-standalone, so it's completely inert in the browser and on
  // desktop — mobile web stays the lightweight fallback, desktop keeps its dashboards.
  addOnce('link[data-pwa-app]', () => {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'pwa-app.css';
    l.dataset.pwaApp = '1';
    return l;
  });

  // App-shell behaviour: the role "app home" launcher. No-ops on any page that
  // doesn't contain a [data-sf-applauncher], and only activates in standalone.
  addOnce('script[data-pwa-app]', () => {
    const s = document.createElement('script');
    s.src = 'pwa-app.js';
    s.defer = true;
    s.dataset.pwaApp = '1';
    return s;
  });

  // Register the service worker (network-first; never serves stale code online).
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('Service worker registration failed:', err);
      });
    });
  }
})();

// ── "Install the app" story ───────────────────────────────────────────────────
// ShiftFuel is a PWA (there's no App/Play Store download). Customers rarely realise
// they can install it, so surface a tasteful, dismissible prompt: a real Install
// button on Android/desktop (beforeinstallprompt), and an "Add to Home Screen" hint
// on iOS Safari (which has no install event). Shown only on customer-facing pages,
// never in the already-installed app, and never again once dismissed.
(function setupInstallPrompt() {
  const DISMISS_KEY = 'sf_install_dismissed';
  let deferredPrompt = null;
  let banner = null;

  const onReady = (fn) => (document.readyState !== 'loading'
    ? fn()
    : document.addEventListener('DOMContentLoaded', fn));
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent || '') && !window.MSStream;
  // Installing to a home screen only makes sense on phones/tablets — never show
  // the prompt on the desktop website (narrow viewport or a touch-first device).
  const isMobile = () => (window.matchMedia
    && window.matchMedia('(max-width: 768px), (pointer: coarse)').matches);
  const isStandalone = () => (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
    || window.navigator.standalone === true;
  const dismissed = () => { try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch (_) { return false; } };
  const remember = () => { try { localStorage.setItem(DISMISS_KEY, '1'); } catch (_) {} };

  // Customer surfaces only (landing / account / track) — never staff or hiring.
  function eligible() {
    const b = document.body;
    if (!b) return false;
    const customer = b.classList.contains('landing-page')
      || b.classList.contains('account-page')
      || b.classList.contains('track-page');
    // Not on staff pages, and not mid-booking (don't interrupt an active flow).
    const excluded = b.classList.contains('portal-login-page')
      || b.classList.contains('hiring-page')
      || b.classList.contains('admin-portal-page')
      || b.classList.contains('worker-portal-page')
      || b.classList.contains('booking-page');
    return customer && !excluded && isMobile() && !isStandalone() && !dismissed();
  }

  function injectStyleOnce() {
    if (document.getElementById('sf-install-style')) return;
    const s = document.createElement('style');
    s.id = 'sf-install-style';
    s.textContent = `
      .sf-install-banner{position:fixed;left:50%;bottom:16px;transform:translateX(-50%) translateY(150%);z-index:9998;display:flex;align-items:center;gap:12px;max-width:min(560px,calc(100vw - 24px));width:max-content;padding:12px 14px;background:#0d3b3b;color:#fff;border-radius:14px;box-shadow:0 12px 34px rgba(0,0,0,.3);transition:transform .34s cubic-bezier(.2,.7,.2,1);font-family:inherit}
      .sf-install-banner.is-visible{transform:translateX(-50%) translateY(0)}
      .sf-install-icon{font-size:1.5rem;line-height:1;flex:none}
      .sf-install-text{display:flex;flex-direction:column;gap:2px;min-width:0}
      .sf-install-text strong{font-size:.98rem;font-weight:800}
      .sf-install-sub{font-size:.82rem;opacity:.86;line-height:1.3}
      .sf-install-cta{flex:none;background:#1e7d52;color:#fff;border:0;border-radius:10px;padding:9px 15px;font-weight:800;font-size:.9rem;cursor:pointer}
      .sf-install-cta:hover{background:#249863}
      .sf-install-close{flex:none;background:transparent;border:0;color:#fff;opacity:.7;font-size:1.35rem;line-height:1;cursor:pointer;padding:2px 6px}
      .sf-install-close:hover{opacity:1}
      @media(max-width:520px){.sf-install-banner{left:12px;right:12px;width:auto;max-width:none;transform:translateY(150%)}.sf-install-banner.is-visible{transform:translateY(0)}}
    `;
    document.head.appendChild(s);
  }

  function close() {
    remember();
    if (banner) { banner.classList.remove('is-visible'); const b = banner; setTimeout(() => b.remove(), 340); banner = null; }
  }

  function show(kind) {
    onReady(() => {
      if (!eligible() || banner) return;
      injectStyleOnce();
      banner = document.createElement('div');
      banner.className = 'sf-install-banner';
      banner.setAttribute('role', 'dialog');
      banner.setAttribute('aria-label', 'Install ShiftFuel');
      const strong = kind === 'ios' ? 'Add ShiftFuel to your home screen' : 'Install the ShiftFuel app';
      const sub = kind === 'ios'
        ? 'Tap the Share icon, then “Add to Home Screen.”'
        : 'One-tap booking and live tracking, right from your home screen.';
      banner.innerHTML = `
        <span class="sf-install-icon" aria-hidden="true">📲</span>
        <div class="sf-install-text"><strong></strong><span class="sf-install-sub"></span></div>
        ${kind === 'ios' ? '' : '<button class="sf-install-cta" type="button">Install</button>'}
        <button class="sf-install-close" type="button" aria-label="Dismiss">&times;</button>`;
      banner.querySelector('strong').textContent = strong;
      banner.querySelector('.sf-install-sub').textContent = sub;
      banner.querySelector('.sf-install-close').addEventListener('click', close);
      const cta = banner.querySelector('.sf-install-cta');
      if (cta) {
        cta.addEventListener('click', async () => {
          if (!deferredPrompt) return;
          deferredPrompt.prompt();
          try { await deferredPrompt.userChoice; } catch (_) {}
          deferredPrompt = null;
          close();
        });
      }
      document.body.appendChild(banner);
      requestAnimationFrame(() => banner.classList.add('is-visible'));
    });
  }

  // Android / desktop Chromium: the browser tells us the app is installable.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    show('android');
  });
  window.addEventListener('appinstalled', () => { remember(); if (banner) banner.remove(); });

  // iOS Safari has no install event — offer the manual hint on load instead.
  onReady(() => { if (isIOS() && eligible()) show('ios'); });
})();
