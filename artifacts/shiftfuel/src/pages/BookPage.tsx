import { useEffect } from "react";
import { Link } from "wouter";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import FinalCta from "@/components/FinalCta";
import { useScriptLoader } from "@/hooks/useScriptLoader";

export default function BookPage() {
  const loaded = useScriptLoader([
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
    "https://js.stripe.com/v3/",
  ]);

  useEffect(() => {
    document.title = "Book Now | ShiftFuel Concierge";
    document.body.className = "landing-page booking-page";
    return () => { document.body.className = ""; };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const scripts = ["/supabase-client.js", "/date-picker.js", "/booking-flow.js"];
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
      <main className="booking-flow-shell">
        <section className="booking-flow-hero">
          <div className="booking-flow-hero-copy">
            <p className="eyebrow">Book in minutes, we handle the rest</p>
            <h1>Book your ShiftFuel service.</h1>
            <p>We make it easy. Follow the simple steps below and we'll take care of the fuel fill-up, car wash, or quick vehicle care while you focus on what matters.</p>
            <div className="hero-trust-row">
              <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="8" r="3.4"/><path d="M5 20c0-3.3 3.1-6 7-6s7 2.7 7 6"/></svg>Trusted professionals</span>
              <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z"/></svg>Premium experience</span>
              <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/></svg>Real-time updates</span>
              <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="5" y="10.5" width="14" height="9.5" rx="1.6"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>Secure &amp; protected</span>
            </div>
          </div>
          <figure className="booking-flow-hero-image">
            <img src="https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1200&q=80" alt="A vehicle ready for ShiftFuel concierge service" />
          </figure>
        </section>
        <section id="booking-flow" className="booking-flow" data-booking-flow="book-now" aria-label="Book Now flow" />
      </main>
      <FinalCta />
      <SiteFooter />
    </>
  );
}
