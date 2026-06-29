import { useEffect } from "react";
import { useScriptLoader } from "@/hooks/useScriptLoader";

export default function WorkerDashboardPage() {
  const loaded = useScriptLoader([
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
  ]);

  useEffect(() => {
    document.title = "Worker Portal | ShiftFuel Concierge";
    document.body.className = "worker-page";
    // Worker manifest
    const link = document.createElement("link");
    link.rel = "manifest";
    link.href = "/manifest-worker.webmanifest";
    link.dataset.workerManifest = "1";
    document.head.appendChild(link);
    // Worker CSS
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "/worker-app.css";
    css.dataset.workerCss = "1";
    document.head.appendChild(css);
    // Redirect if not logged in
    const token = sessionStorage.getItem("shiftfuel_worker_token");
    const expires = Number(sessionStorage.getItem("shiftfuel_worker_expires") || 0);
    if (!token || expires < Date.now()) {
      window.location.replace("/worker/login");
    }
    return () => {
      document.body.className = "";
      document.querySelector("link[data-worker-manifest]")?.remove();
      document.querySelector("link[data-worker-css]")?.remove();
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    function formatDate(value: string) {
      if (!value) return "";
      return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(value));
    }
    // @ts-ignore
    window.formatDate = formatDate;
    const scripts = [
      "/supabase-client.js",
      "/password-toggle.js",
      "/photo-utils.js",
      "/push-client.js",
      "/route-leg.js",
      "/worker.js",
      "/worker-gps-tracking.js",
      "/worker-route-map.js",
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

  // Render the full worker dashboard HTML structure
  return (
    <div id="worker-app-root" dangerouslySetInnerHTML={{ __html: WORKER_HTML }} />
  );
}

const WORKER_HTML = `
<header class="site-header worker-site-header">
  <a class="logo" href="/" aria-label="ShiftFuel Concierge home">
    <span class="logo-mark"><img src="/icon-main.svg" alt="" aria-hidden="true"></span>
    <span>ShiftFuel Concierge</span>
  </a>
  <nav class="worker-header-nav worker-desktop-only" aria-label="Worker navigation">
    <button class="app-tab active" data-tab="dashboard" type="button">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
      Dashboard
    </button>
    <button class="app-tab" data-tab="jobs" type="button">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/></svg>
      Jobs
    </button>
    <button class="app-tab" data-tab="earnings" type="button">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><path d="M12 7v2.5M12 14.5V17M9.5 9.5C9.5 8.1 10.6 7 12 7s2.5 1.1 2.5 2.5c0 2.5-5 2.5-5 5C9.5 15.9 10.6 17 12 17s2.5-1.1 2.5-2.5"/></svg>
      Earnings
    </button>
    <button class="app-tab" data-tab="profile" type="button">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="8" r="3.4"/><path d="M5 20c0-3.3 3.1-6 7-6s7 2.7 7 6"/></svg>
      Profile
    </button>
  </nav>
</header>

<main id="worker-main">
  <!-- Dashboard Tab -->
  <div id="wtab-dashboard" class="worker-tab">
    <section class="section">
      <div class="section-heading worker-dashboard-greeting-heading">
        <p class="eyebrow" id="worker-dashboard-time-greeting">Good morning</p>
        <h2 id="worker-greeting">Welcome back</h2>
        <p class="worker-dashboard-subtitle" id="worker-dashboard-subtitle">Here's your current status and upcoming jobs.</p>
      </div>
      <div class="worker-dashboard-stats" id="worker-stats-row"></div>
      <div class="worker-dashboard-card worker-next-job-card" id="worker-next-job-card" hidden>
        <div class="worker-card-heading"><h2>Next job</h2></div>
        <div id="worker-next-job-body"></div>
      </div>
      <div class="worker-dashboard-card" id="worker-active-job-card" hidden>
        <div class="worker-card-heading"><h2>Active job</h2><span class="worker-active-badge"><span class="worker-active-dot"></span>In progress</span></div>
        <div id="worker-active-job-body"></div>
      </div>
      <button class="button primary worker-view-jobs-btn" id="worker-view-jobs-btn" type="button">View all jobs</button>
    </section>
  </div>

  <!-- Jobs Tab -->
  <div id="wtab-jobs" class="worker-tab" hidden>
    <section class="section">
      <div class="section-heading"><h2>My Jobs</h2></div>
      <div class="worker-job-filters" id="worker-job-filters">
        <button class="worker-filter-btn active" data-filter="upcoming" type="button">Upcoming</button>
        <button class="worker-filter-btn" data-filter="active" type="button">Active</button>
        <button class="worker-filter-btn" data-filter="completed" type="button">Completed</button>
        <button class="worker-filter-btn" data-filter="all" type="button">All</button>
      </div>
      <div id="worker-job-list" class="request-list"></div>
    </section>
  </div>

  <!-- Earnings Tab -->
  <div id="wtab-earnings" class="worker-tab" hidden>
    <section class="section">
      <div class="section-heading"><h2>Earnings</h2></div>
      <div id="worker-earnings-summary" class="worker-dashboard-card"></div>
      <div class="worker-dashboard-card worker-pay-calculator">
        <div class="worker-card-heading"><h2>Pay Calculator</h2></div>
        <p class="field-help">Estimate your take-home and time for a job.</p>
        <div class="worker-pay-calc-inputs">
          <label>Service<select id="wcalc-service"><option value="fuel">Fuel only</option><option value="wash">Wash only</option><option value="both">Fuel + Wash</option></select></label>
          <label>Gallons<select id="wcalc-gallons"><option value="10" selected>10</option><option value="15">15</option><option value="20">20</option><option value="30">30</option><option value="40">40</option></select></label>
          <label>Extra miles to the gas station (round-trip)<input id="wcalc-station-miles" type="number" min="0" step="0.1" value="0"></label>
          <label>Miles to the car wash (round-trip)<input id="wcalc-wash-miles" type="number" min="0" step="0.1" value="0"></label>
          <label class="worker-pay-calc-check"><input id="wcalc-quick" type="checkbox"> Quick vehicle care</label>
        </div>
        <div class="worker-pay-calc-output" id="wcalc-output"></div>
      </div>
    </section>
  </div>

  <!-- Profile Tab -->
  <div id="wtab-profile" class="worker-tab" hidden>
    <section class="section">
      <div class="section-heading"><h2>My Profile</h2></div>
      <div class="worker-dashboard-card worker-profile-snapshot">
        <div class="worker-profile-mini">
          <div class="worker-profile-photo-frame worker-profile-photo-frame--mini">
            <img id="worker-dashboard-photo" class="worker-profile-photo" alt="Worker profile photo" hidden>
            <div id="worker-dashboard-photo-placeholder" class="worker-profile-photo-placeholder">No photo</div>
            <span class="worker-verified-badge" id="worker-verified-badge" hidden aria-label="Verified worker" title="Verified worker">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 1.8l2.3 1.7 2.85.2.9 2.7 2.3 1.7-.9 2.7.9 2.7-2.3 1.7-.9 2.7-2.85.2L12 22.2l-2.3-1.7-2.85-.2-.9-2.7-2.3-1.7.9-2.7-.9-2.7 2.3-1.7.9-2.7 2.85-.2z"/><path d="M8.6 12.2l2.2 2.2 4.6-4.6" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </span>
          </div>
          <div class="worker-profile-id">
            <h2 id="worker-dashboard-name">Worker</h2>
            <div class="worker-profile-rating" id="worker-profile-rating-row" hidden>
              <span class="worker-rating-star" aria-hidden="true">&#9733;</span>
              <strong id="worker-profile-rating">-</strong>
              <span class="worker-rating-count" id="worker-profile-review-count"></span>
            </div>
            <span class="worker-active-badge" id="worker-profile-status-badge" hidden><span class="worker-active-dot"></span>Active worker</span>
          </div>
        </div>
        <div class="worker-profile-actions">
          <button class="button secondary" id="worker-enable-alerts" type="button">Enable alerts</button>
          <button class="button secondary" id="worker-break-toggle" type="button" hidden>Take a break</button>
          <button class="button secondary" id="open-change-password-btn" type="button">Change password</button>
          <button class="button secondary" id="open-edit-profile-btn" type="button">Edit profile</button>
          <button class="button danger" id="worker-signout-btn" type="button">Sign out</button>
        </div>
      </div>
      <nav class="worker-app-legal" aria-label="Legal links">
        <button type="button" class="worker-legal-link" data-legal="privacy.html">Privacy</button>
        <button type="button" class="worker-legal-link" data-legal="terms.html">Terms</button>
        <button type="button" class="worker-legal-link" data-legal="liability-waiver.html">Liability Waiver</button>
      </nav>
      <p class="worker-app-copy">&copy; <span id="year"></span> ShiftFuel Concierge</p>
    </section>
  </div>
</main>

<!-- Mobile tab bar -->
<nav id="worker-tabbar" class="app-tabbar worker-mobile-only" aria-label="Worker navigation">
  <button class="app-tab active" data-tab="dashboard" type="button">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
    <span>Dashboard</span>
  </button>
  <button class="app-tab" data-tab="jobs" type="button">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/></svg>
    <span>Jobs</span>
  </button>
  <button class="app-tab" data-tab="earnings" type="button">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><path d="M12 7v2.5M12 14.5V17M9.5 9.5C9.5 8.1 10.6 7 12 7s2.5 1.1 2.5 2.5c0 2.5-5 2.5-5 5C9.5 15.9 10.6 17 12 17s2.5-1.1 2.5-2.5"/></svg>
    <span>Earnings</span>
  </button>
  <button class="app-tab" data-tab="profile" type="button">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="8" r="3.4"/><path d="M5 20c0-3.3 3.1-6 7-6s7 2.7 7 6"/></svg>
    <span>Profile</span>
  </button>
</nav>

<!-- Modals -->
<div id="worker-reviews-section" class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="wr-title" hidden>
  <div class="modal-dialog worker-modal-wide">
    <div class="modal-header"><h2 id="wr-title">My service reviews</h2><button class="modal-close" id="close-worker-reviews" type="button" aria-label="Close">&times;</button></div>
    <div class="modal-body"><div id="worker-review-list" class="request-list"></div></div>
  </div>
</div>

<div id="worker-legal-modal" class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="worker-legal-title" hidden>
  <div class="modal-dialog worker-modal-wide">
    <div class="modal-header"><h2 id="worker-legal-title">Legal</h2><button class="modal-close" id="close-worker-legal" type="button" aria-label="Close">&times;</button></div>
    <div class="modal-body"><div id="worker-legal-content" class="worker-legal-content"><p class="field-help">Loading…</p></div></div>
  </div>
</div>

<div id="worker-account" class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="wacc-title" hidden>
  <div class="modal-dialog worker-modal-wide">
    <div class="modal-header"><h2 id="wacc-title">Worker profile</h2><button class="modal-close" id="close-worker-account" type="button" aria-label="Close">&times;</button></div>
    <div class="modal-body">
      <form id="worker-profile-form" class="booking-form worker-profile-form">
        <fieldset>
          <legend>Worker profile</legend>
          <div class="worker-profile-preview">
            <div class="worker-profile-photo-frame">
              <img id="worker-profile-photo-preview" class="worker-profile-photo" alt="Worker profile photo" hidden>
              <div id="worker-profile-photo-placeholder" class="worker-profile-photo-placeholder">No photo</div>
            </div>
          </div>
          <div class="field-grid">
            <label>Worker name<input id="worker-profile-name" type="text" required></label>
            <label>Username (for login)<input id="worker-profile-username" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="Choose a username"><span class="field-help">You log in with this.</span></label>
            <label>Phone number<input id="worker-profile-phone" type="tel" placeholder="(302) 555-0100"></label>
            <label>Started<input id="worker-profile-started" type="date" disabled></label>
          </div>
          <div class="profile-photo-actions">
            <span>Profile photo</span>
            <button id="edit-worker-photo" class="button secondary" type="button">Edit profile photo</button>
            <input id="worker-profile-photo" class="visually-hidden-file" type="file" accept="image/*">
          </div>
          <div class="form-action-row">
            <button class="button primary" type="submit">Save worker profile</button>
          </div>
          <p id="worker-profile-status" class="form-status" role="status"></p>
        </fieldset>
      </form>
    </div>
  </div>
</div>

<div id="worker-password-modal" class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="wpm-title" hidden>
  <div class="modal-dialog">
    <div class="modal-header"><h2 id="wpm-title">Change password</h2><button class="modal-close" id="worker-password-modal-close" type="button" aria-label="Close">&times;</button></div>
    <div class="modal-body">
      <form id="worker-password-change-form" class="booking-form">
        <label>Current password<input id="wpc-current" type="password" autocomplete="current-password" required></label>
        <label>New password<input id="wpc-new" type="password" minlength="10" autocomplete="new-password" placeholder="At least 10 characters" required></label>
        <label>Confirm new password<input id="wpc-confirm" type="password" minlength="10" autocomplete="new-password" required></label>
        <div class="form-action-row"><button class="button primary" type="submit">Update password</button></div>
        <p id="worker-password-status" class="form-status" role="status"></p>
      </form>
    </div>
  </div>
</div>
`;
