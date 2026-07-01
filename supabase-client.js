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
    l.href = 'app-icon.svg';
    return l;
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
