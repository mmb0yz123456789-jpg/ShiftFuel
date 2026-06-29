import { useEffect } from "react";
import { Link } from "wouter";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import FinalCta from "@/components/FinalCta";
import { useScriptLoader } from "@/hooks/useScriptLoader";

export default function AccountPage() {
  const loaded = useScriptLoader([
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
    "https://js.stripe.com/v3/",
  ]);

  useEffect(() => {
    document.title = "My Account | ShiftFuel Concierge";
    document.body.className = "landing-page customer-account-page";
    return () => { document.body.className = ""; };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const scripts = ["/supabase-client.js", "/customer-account.js"];
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
      <main className="booking-flow-shell customer-account-shell">
        <section className="booking-flow-hero customer-account-hero">
          <div className="booking-flow-hero-copy">
            <p className="eyebrow">Customer account</p>
            <h1>Book faster and track everything in one place.</h1>
            <p>My Account is your optional home for saved vehicles, saved service addresses, recent bookings, and account-only offers. Guest booking and guest tracking are still available.</p>
            <div className="landing-actions">
              <a className="button primary" href="#customer-account-panel">Open My Account</a>
              <Link className="button tertiary" href="/book">Book as guest</Link>
              <Link className="button returning" href="/track">Track without logging in</Link>
            </div>
          </div>
          <figure className="booking-flow-hero-image">
            <img src="https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1200&q=80" alt="A vehicle ready for ShiftFuel concierge service" />
          </figure>
        </section>

        <section id="customer-account-panel" className="customer-account-panel" aria-label="Customer account sign in">
          <div className="customer-account-panel-copy">
            <h2>Access My Account</h2>
            <p>Enter the phone number and email used on your bookings to open your account dashboard.</p>
          </div>
          <form className="customer-account-form" data-customer-login-form>
            <label>
              Phone number
              <input name="phone" type="tel" inputMode="numeric" autoComplete="tel" placeholder="(302) 555-0100" required />
            </label>
            <label>
              Email address
              <input name="email" type="email" autoComplete="email" placeholder="you@example.com" required />
            </label>
            <button className="button primary" type="submit">Open My Account</button>
            <p className="form-status" data-customer-account-status></p>
          </form>
        </section>

        <section className="customer-dashboard" data-customer-dashboard hidden aria-label="My Account dashboard">
          <div className="customer-dashboard-header">
            <div>
              <p className="customer-dashboard-kicker">My Account</p>
              <h2 data-customer-greeting>Your dashboard</h2>
              <p className="customer-dashboard-subtitle">Book a saved vehicle, track active services, or review your recent requests.</p>
            </div>
            <button className="button secondary customer-dashboard-signout" data-customer-signout type="button">Sign out</button>
          </div>
          <div id="customer-dashboard-body" />
        </section>
      </main>
      <FinalCta />
      <SiteFooter />
    </>
  );
}
