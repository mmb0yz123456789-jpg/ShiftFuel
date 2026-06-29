import { useEffect } from "react";
import { Link } from "wouter";
import { useScriptLoader } from "@/hooks/useScriptLoader";

export default function AdminLoginPage() {
  const loaded = useScriptLoader([
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
  ]);

  useEffect(() => {
    document.title = "Admin Login | ShiftFuel Concierge";
    document.body.className = "landing-page portal-login-page admin-login-page";
    const token = sessionStorage.getItem("shiftfuel_admin_token");
    const expires = Number(sessionStorage.getItem("shiftfuel_admin_expires") || 0);
    if (token && expires > Date.now()) {
      window.location.replace("/admin/dashboard");
    }
    return () => { document.body.className = ""; };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const scripts = ["/supabase-client.js", "/password-toggle.js", "/admin-login.js"];
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
    <>
      <header className="portal-login-hero">
        <Link className="portal-hero-brand" href="/" aria-label="ShiftFuel Concierge home">
          <span className="portal-hero-mark"><img src="/icon-main.svg" alt="" aria-hidden="true" /></span>
          <span className="portal-hero-wordmark">ShiftFuel<br />Concierge</span>
        </Link>
        <div className="portal-hero-role">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
            <path d="M12 2.6 5 5.2v5.4c0 4.3 2.9 8.3 7 9.4 4.1-1.1 7-5.1 7-9.4V5.2L12 2.6z"/>
            <circle cx="12" cy="11" r="2.1"/>
          </svg>
          <span>Admin Portal</span>
        </div>
        <Link className="portal-hero-back" href="/staff-access">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>
          <span>Back to Staff Access</span>
        </Link>
      </header>

      <main className="portal-login-shell">
        <section className="portal-login-card">
          <span className="portal-login-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
              <path d="M12 2.6 5 5.2v5.4c0 4.3 2.9 8.3 7 9.4 4.1-1.1 7-5.1 7-9.4V5.2L12 2.6z"/>
              <path d="M9.2 11.7l2 2 3.6-3.9"/>
            </svg>
            Admin Access
          </span>
          <h1>ShiftFuel Admin Portal</h1>
          <p className="portal-login-intro">Sign in to manage requests, workers, services, and payments.</p>

          <form id="admin-login-form" className="booking-form">
            <label>
              Username
              <span className="portal-input-group">
                <svg className="portal-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                  <circle cx="12" cy="8" r="3.2"/>
                  <path d="M5.5 19.5c0-3.2 2.9-5.6 6.5-5.6s6.5 2.4 6.5 5.6"/>
                </svg>
                <input id="admin-username" type="text" placeholder="Enter admin username" autoComplete="username" required />
              </span>
            </label>
            <label>
              Password
              <span className="portal-input-group">
                <svg className="portal-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                  <rect x="5" y="10.5" width="14" height="9.5" rx="2.2"/>
                  <path d="M8 10.5V7.6a4 4 0 0 1 8 0v2.9"/>
                </svg>
                <input id="admin-password" type="password" placeholder="Enter your password" required />
              </span>
            </label>
            <button className="button primary" type="submit">Sign In</button>
          </form>
          <p id="login-message" className="form-status"></p>

          <div className="portal-login-divider" aria-hidden="true">
            <span className="portal-login-divider-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                <path d="M12 2.6 5 5.2v5.4c0 4.3 2.9 8.3 7 9.4 4.1-1.1 7-5.1 7-9.4V5.2L12 2.6z"/>
                <path d="M9.2 11.7l2 2 3.6-3.9"/>
              </svg>
            </span>
          </div>

          <Link className="portal-login-back" href="/">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
              <circle cx="12" cy="12" r="9"/>
              <path d="M3 12h18M12 3c2.5 2.4 3.9 5.7 3.9 9s-1.4 6.6-3.9 9c-2.5-2.4-3.9-5.7-3.9-9S9.5 5.4 12 3z"/>
            </svg>
            <span>Back to customer site</span>
          </Link>
        </section>
      </main>
    </>
  );
}
