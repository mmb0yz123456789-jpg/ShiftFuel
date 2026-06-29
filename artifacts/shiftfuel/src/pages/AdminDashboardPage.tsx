import { useEffect } from "react";
import { useScriptLoader } from "@/hooks/useScriptLoader";

export default function AdminDashboardPage() {
  const loaded = useScriptLoader([
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
  ]);

  useEffect(() => {
    document.title = "ShiftFuel Admin";
    document.body.className = "admin-page";
    // Admin manifest + CSS
    const link = document.createElement("link");
    link.rel = "manifest";
    link.href = "/manifest-admin.webmanifest";
    link.dataset.adminManifest = "1";
    document.head.appendChild(link);
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "/admin-dashboard-polish.css";
    css.dataset.adminCss = "1";
    document.head.appendChild(css);
    // Redirect if not logged in
    const token = sessionStorage.getItem("shiftfuel_admin_token");
    const expires = Number(sessionStorage.getItem("shiftfuel_admin_expires") || 0);
    if (!token || expires < Date.now()) {
      window.location.replace("/admin/login");
    }
    return () => {
      document.body.className = "";
      document.querySelector("link[data-admin-manifest]")?.remove();
      document.querySelector("link[data-admin-css]")?.remove();
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const scripts = [
      "/supabase-client.js",
      "/password-toggle.js",
      "/photo-utils.js",
      "/push-client.js",
      "/route-leg.js",
      "/admin-service-area.js",
      "/admin.js",
    ];
    const elements: HTMLScriptElement[] = [];
    let idx = 0;
    function loadNext() {
      if (idx >= scripts.length) return;
      const el = document.createElement("script");
      el.src = scripts[idx++];
      el.onload = loadNext;
      document.body.appendChild(el);
      elements.push(el);
    }
    loadNext();
    return () => { elements.forEach(el => el.remove()); };
  }, [loaded]);

  return (
    <div id="admin-app-root" dangerouslySetInnerHTML={{ __html: ADMIN_HTML }} />
  );
}

const ADMIN_HTML = `
<header class="site-header admin-site-header" id="admin-header">
  <a class="logo" href="/" aria-label="ShiftFuel Concierge home">
    <span class="logo-mark"><img src="/icon-main.svg" alt="" aria-hidden="true"></span>
    <span>ShiftFuel Admin</span>
  </a>
  <nav class="admin-header-nav" id="admin-tab-nav" aria-label="Admin navigation">
    <button class="app-tab active" data-tab="requests" type="button">Requests</button>
    <button class="app-tab" data-tab="workers" type="button">Workers</button>
    <button class="app-tab" data-tab="promos" type="button">Promos</button>
    <button class="app-tab" data-tab="pricing" type="button">Pricing</button>
    <button class="app-tab" data-tab="service-area" type="button">Service Area</button>
    <button class="app-tab" data-tab="payments" type="button">Payments</button>
    <button class="app-tab" data-tab="settings" type="button">Settings</button>
  </nav>
  <div class="admin-header-actions">
    <span id="admin-greeting" class="admin-greeting"></span>
    <button class="button secondary" id="admin-signout" type="button">Sign out</button>
  </div>
</header>

<main id="admin-main">
  <!-- Requests Tab -->
  <div id="atab-requests" class="admin-tab">
    <section class="section">
      <div class="section-heading admin-tab-heading">
        <h2>Service Requests</h2>
        <div class="admin-request-filters" id="admin-request-filters">
          <button class="worker-filter-btn active" data-filter="pending" type="button">Pending</button>
          <button class="worker-filter-btn" data-filter="assigned" type="button">Assigned</button>
          <button class="worker-filter-btn" data-filter="in_progress" type="button">In Progress</button>
          <button class="worker-filter-btn" data-filter="completed" type="button">Completed</button>
          <button class="worker-filter-btn" data-filter="cancelled" type="button">Cancelled</button>
          <button class="worker-filter-btn" data-filter="all" type="button">All</button>
        </div>
      </div>
      <div id="admin-request-list" class="request-list"></div>
    </section>
  </div>

  <!-- Workers Tab -->
  <div id="atab-workers" class="admin-tab" hidden>
    <section class="section">
      <div class="section-heading admin-tab-heading">
        <h2>Workers</h2>
        <button class="button primary" id="admin-add-worker-btn" type="button">Add worker</button>
      </div>
      <div id="admin-worker-list" class="worker-list"></div>
    </section>
  </div>

  <!-- Promos Tab -->
  <div id="atab-promos" class="admin-tab" hidden>
    <section class="section">
      <div class="section-heading admin-tab-heading">
        <h2>Promo Codes</h2>
        <button class="button primary" id="admin-add-promo-btn" type="button">Add promo</button>
      </div>
      <div id="admin-promo-list"></div>
    </section>
  </div>

  <!-- Pricing Tab -->
  <div id="atab-pricing" class="admin-tab" hidden>
    <section class="section">
      <div class="section-heading"><h2>Service Pricing</h2></div>
      <div id="admin-pricing-panel"></div>
    </section>
  </div>

  <!-- Service Area Tab -->
  <div id="atab-service-area" class="admin-tab" hidden>
    <section class="section">
      <div class="section-heading"><h2>Service Area</h2></div>
      <div id="admin-service-area-panel"></div>
    </section>
  </div>

  <!-- Payments Tab -->
  <div id="atab-payments" class="admin-tab" hidden>
    <section class="section">
      <div class="section-heading"><h2>Payments</h2></div>
      <div id="admin-payments-panel"></div>
    </section>
  </div>

  <!-- Settings Tab -->
  <div id="atab-settings" class="admin-tab" hidden>
    <section class="section">
      <div class="section-heading"><h2>Settings</h2></div>
      <div id="admin-settings-panel"></div>
    </section>
  </div>
</main>

<!-- Mobile tab bar -->
<nav id="admin-tabbar" class="app-tabbar admin-mobile-tabbar" aria-label="Admin navigation">
  <button class="app-tab active" data-tab="requests" type="button"><span>Requests</span></button>
  <button class="app-tab" data-tab="workers" type="button"><span>Workers</span></button>
  <button class="app-tab" data-tab="promos" type="button"><span>Promos</span></button>
  <button class="app-tab" data-tab="pricing" type="button"><span>Pricing</span></button>
  <button class="app-tab" data-tab="settings" type="button"><span>Settings</span></button>
</nav>
`;
