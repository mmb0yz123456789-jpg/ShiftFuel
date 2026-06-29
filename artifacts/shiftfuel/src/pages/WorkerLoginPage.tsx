import { useEffect } from "react";
import { Link } from "wouter";
import { useScriptLoader } from "@/hooks/useScriptLoader";

export default function WorkerLoginPage() {
  const loaded = useScriptLoader([
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
  ]);

  useEffect(() => {
    document.title = "Worker Login | ShiftFuel Concierge";
    document.body.className = "landing-page portal-login-page worker-login-page";
    // Add worker manifest
    const link = document.createElement("link");
    link.rel = "manifest";
    link.href = "/manifest-worker.webmanifest";
    link.dataset.workerManifest = "1";
    document.head.appendChild(link);
    // Check if already logged in
    const token = sessionStorage.getItem("shiftfuel_worker_token");
    const expires = Number(sessionStorage.getItem("shiftfuel_worker_expires") || 0);
    if (token && expires > Date.now()) {
      window.location.replace("/worker/dashboard");
    }
    return () => {
      document.body.className = "";
      document.querySelector("link[data-worker-manifest]")?.remove();
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const scripts = ["/supabase-client.js", "/password-toggle.js", "/worker-login.js"];
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
            <circle cx="12" cy="10" r="2.3"/>
            <path d="M8.4 16.4a3.8 3.8 0 0 1 7.2 0"/>
          </svg>
          <span>Worker Portal</span>
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
              <circle cx="12" cy="8" r="3.2"/>
              <path d="M5.5 19.5c0-3.2 2.9-5.6 6.5-5.6s6.5 2.4 6.5 5.6"/>
            </svg>
            Worker Access
          </span>
          <h1>ShiftFuel Worker Portal</h1>
          <p className="portal-login-intro">Sign in to view jobs, update requests, and complete services.</p>

          <form id="worker-login-form" className="booking-form">
            <label>
              Username or phone number
              <span className="portal-input-group">
                <svg className="portal-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                  <circle cx="12" cy="8" r="3.2"/>
                  <path d="M5.5 19.5c0-3.2 2.9-5.6 6.5-5.6s6.5 2.4 6.5 5.6"/>
                </svg>
                <input id="worker-login-name" type="text" placeholder="Username or phone number" autoComplete="username" autoCapitalize="none" spellCheck={false} required />
              </span>
            </label>
            <label>
              Password
              <span className="portal-input-group">
                <svg className="portal-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                  <rect x="5" y="10.5" width="14" height="9.5" rx="2.2"/>
                  <path d="M8 10.5V7.6a4 4 0 0 1 8 0v2.9"/>
                </svg>
                <input id="worker-password" type="password" placeholder="Enter your password" required />
              </span>
            </label>
            <button className="button primary" type="submit">Sign In</button>
          </form>
          <p id="worker-login-message" className="form-status"></p>

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
