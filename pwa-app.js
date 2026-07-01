// ── ShiftFuel PWA app-home launcher ────────────────────────────────────────────
// Purely additive, standalone-only. When the site is launched from a phone home
// screen (installed PWA), each portal shows a role "app home": a grid of large
// shortcut tiles. Tiles don't rebuild navigation — they trigger the page's EXISTING
// nav primitives (worker: switchWorkerTab via the tabbar buttons; admin: the
// .admin-page-tabs buttons; customer: plain links), so nothing about the desktop or
// mobile-web behaviour changes. In a normal browser this file is inert.
(function () {
  function init() {
    const isStandalonePage = () => document.documentElement.classList.contains('sf-standalone');
    const isCompactPage = () => !window.matchMedia || window.matchMedia('(max-width: 760px)').matches;
    const isCustomerSurface = () => document.body?.classList.contains('customer-account-page')
      || document.body?.classList.contains('booking-page')
      || document.body?.classList.contains('track-page')
      || document.body?.classList.contains('account-page');
    const isCustomerSignedIn = () => {
      try {
        const s = JSON.parse(localStorage.getItem('shiftfuel_customer_account') || 'null');
        return !!(s && s.phone && s.email);
      } catch (_) { return false; }
    };

    // Installed PWA only: keep in-page links inside the app shell instead of the
    // public marketing site. The logo + Home tab are handled by
    // syncCustomerNavTargets (they must follow sign-in state), so skip them here.
    function keepCustomerLinksInApp() {
      if (!isStandalonePage() || !isCompactPage() || !isCustomerSurface()) return;
      document.querySelectorAll('a[href="index.html"], a[href^="index.html#"], a[href="/"]').forEach((link) => {
        if (link.classList.contains('logo') || link.hasAttribute('data-cust-tab')) return;
        link.setAttribute('href', '/account');
      });
      document.querySelectorAll('a[href^="returning.html"]').forEach((link) => {
        const href = link.getAttribute('href') || '';
        const queryStart = href.indexOf('?');
        const hashStart = href.indexOf('#');
        const query = queryStart > -1 ? href.slice(queryStart, hashStart > -1 ? hashStart : undefined) : '';
        link.setAttribute('href', `/book${query}#booking-flow`);
      });
    }

    // Top-left logo + Home tab, sign-in aware and mode-independent:
    //   signed in  → the customer dashboard (/account)
    //   signed out → the public home (/)
    // The logo must NEVER route to the Account settings tab — only the Account tab
    // does that. Runs in every mode: browser, mobile web, and installed PWA.
    function syncCustomerNavTargets() {
      if (!isCustomerSurface()) return;
      const signedIn = isCustomerSignedIn();
      const homeHref = signedIn ? '/account' : '/';
      const logo = document.querySelector('.site-header .logo');
      if (logo) {
        logo.setAttribute('href', homeHref);
        logo.setAttribute('aria-label', signedIn ? 'ShiftFuel Concierge home' : 'ShiftFuel Concierge');
      }
      const homeTab = document.querySelector('.customer-tabbar [data-cust-tab="home"]');
      if (homeTab) homeTab.setAttribute('href', homeHref);
    }

    // Highlight the bottom tab that matches the current route. Home (/account) and
    // Account (/account/settings) are distinct paths so they never both light up.
    function syncCustomerTabbarActive() {
      if (!isCustomerSurface()) return;
      const tabs = Array.from(document.querySelectorAll('.customer-tabbar .app-tab'));
      if (!tabs.length) return;
      const path = (window.location.pathname || '/').replace(/\/$/, '') || '/';
      let key = 'home';
      if (path === '/book') key = 'book';
      else if (path === '/track') key = 'track';
      else if (path === '/account/settings' || path === '/settings') key = 'account';
      else key = 'home'; // /account, /my-account, or any other customer surface

      tabs.forEach((tab) => {
        const isActive = tab.getAttribute('data-cust-tab') === key;
        tab.classList.toggle('is-active', isActive);
        if (isActive) tab.setAttribute('aria-current', 'page');
        else tab.removeAttribute('aria-current');
      });
    }

    keepCustomerLinksInApp();
    syncCustomerNavTargets();
    syncCustomerTabbarActive();
    window.addEventListener('hashchange', syncCustomerTabbarActive);
    window.addEventListener('popstate', syncCustomerTabbarActive);

    const launcher = document.querySelector('[data-sf-applauncher]');
    if (!launcher) return; // page has no app-home → nothing to do

    const body = document.body;
    const isStandalone = isStandalonePage;
    const isCompact = isCompactPage;
    // App-home is a phone-app experience: installed AND phone-width. A desktop-
    // installed PWA (rare) keeps the full desktop dashboard instead.
    const canApp = () => isStandalone() && isCompact();
    const open = () => {
      if (!canApp()) return;
      launcher.hidden = false;
      body.classList.add('sf-launcher-open');
      window.scrollTo(0, 0);
    };
    const close = () => {
      launcher.hidden = true;
      body.classList.remove('sf-launcher-open');
    };

    // Tile behaviour, all of which dismiss the launcher:
    //   data-sf-goto="<selector>" → clicks the matching EXISTING nav control
    //                               (worker tabbar / admin page tabs) and lands there.
    //   <a href="…">              → normal navigation or same-page #anchor scroll.
    //   data-sf-close             → just reveal the page underneath (e.g. dashboard).
    launcher.addEventListener('click', (e) => {
      if (e.target.closest('[data-sf-dismiss]')) { close(); return; } // reveal page underneath
      const tile = e.target.closest('.sf-tile, [data-sf-goto]');
      if (!tile) return;
      const gotoSel = tile.getAttribute('data-sf-goto');
      if (gotoSel) {
        e.preventDefault();
        const target = document.querySelector(gotoSel);
        close();
        if (target) target.click();
        return;
      }
      close(); // plain link / close tile — let the anchor's own behaviour run
    });

    // Leaving Home via the bottom tab bar should dismiss the launcher.
    ['[data-app-tabbar]', '#worker-tabbar'].forEach((sel) => {
      const bar = document.querySelector(sel);
      if (bar) bar.addEventListener('click', (e) => { if (e.target.closest('[data-tab]')) close(); }, true);
    });

    // A Home affordance in the app header re-opens the launcher (standalone only).
    // Injected so we don't have to touch three different header markups. Staff
    // portals (worker/admin) opt out — they open straight to their dashboard with
    // no header home button.
    const isStaffPortal = body.classList.contains('worker-portal-page')
      || body.classList.contains('admin-portal-page');
    const header = document.querySelector('header.portal-header, header.site-header');
    if (header && !isStaffPortal && !header.querySelector('.sf-apphome-btn')) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sf-apphome-btn';
      btn.setAttribute('aria-label', 'App home');
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5 10v9h14v-9"/></svg>';
      btn.addEventListener('click', open);
      header.insertBefore(btn, header.firstChild);
    }

    // Manifest shortcuts / deep links. The app icon's long-press menu points here:
    //   /worker/dashboard?tab=jobs   → clicks the worker tabbar
    //   /admin/dashboard?page=workers → clicks the admin page tabs
    // Run on `load` so it lands AFTER each page's own init default, then wins.
    const params = new URLSearchParams(location.search);
    const deepTab = params.get('tab');
    const deepPage = params.get('page');
    const deepLinked = !!(deepTab || deepPage);
    if (deepLinked) {
      window.addEventListener('load', () => {
        if (deepPage) document.querySelector(".admin-page-tabs [data-page='" + deepPage + "']")?.click();
        if (deepTab) document.querySelector("#worker-tabbar [data-tab='" + deepTab + "']")?.click();
      });
    }

    // Keep installed apps on the real dashboard by default. The launcher remains
    // available from the header home button, but it should never cover the first
    // screen after opening the app or signing in.
    close();
    window.addEventListener('sf-mode-change', () => { keepCustomerLinksInApp(); syncCustomerNavTargets(); if (!canApp()) close(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
