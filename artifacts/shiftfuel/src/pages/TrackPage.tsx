import { useEffect } from "react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import FinalCta from "@/components/FinalCta";
import { useScriptLoader } from "@/hooks/useScriptLoader";

export default function TrackPage() {
  const loaded = useScriptLoader([
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
  ]);

  useEffect(() => {
    document.title = "Track My Vehicle | ShiftFuel Concierge";
    document.body.className = "track-page";
    // Add track-redesign CSS
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/track-redesign.css";
    link.dataset.trackCss = "1";
    document.head.appendChild(link);
    return () => {
      document.body.className = "";
      document.querySelector("link[data-track-css]")?.remove();
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const scripts = ["/supabase-client.js", "/track.js"];
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
      <SiteHeader />
      <main className="booking-flow-shell track-shell">
        <section className="booking-flow-hero track-hero-redesign">
          <div className="booking-flow-hero-copy">
            <p className="eyebrow">Track your request</p>
            <h1>Track My Vehicle</h1>
            <p>Enter your phone number, email address, or request number to find your request and get real-time updates.</p>
          </div>
          <figure className="booking-flow-hero-image">
            <img src="https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1600&q=80" alt="Concierge vehicle service pickup with a parked car" />
          </figure>
        </section>

        <section className="track-search-card">
          <form id="track-form" className="track-search-form">
            <div className="track-search-heading">
              <span className="track-search-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.5-4.5"/></svg></span>
              <div>
                <h2>Find your request</h2>
                <p>Enter at least two options below to look up your request.</p>
              </div>
            </div>
            <div className="track-field-grid">
              <label>
                Phone number
                <input id="tracking-phone" type="tel" inputMode="numeric" autoComplete="tel" maxLength={14} placeholder="(555) 123-4567" />
              </label>
              <label>
                Email address
                <input id="tracking-email" type="email" placeholder="you@example.com" />
              </label>
              <label>
                Request / Ticket Number
                <input id="tracking-id" type="text" placeholder="SF-DDDFBBC5" />
              </label>
              <div className="track-search-actions">
                <button className="button primary" type="submit">Track Request</button>
                <button id="refresh-status-btn" className="button secondary" type="button" hidden>Refresh Status</button>
              </div>
            </div>
          </form>
        </section>

        <div id="track-results" className="track-results-area" />
      </main>
      <FinalCta />
      <SiteFooter />
    </>
  );
}
