import { useEffect, useState } from "react";
import { Link } from "wouter";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import FinalCta from "@/components/FinalCta";
import { supabaseClient } from "@/lib/supabase";

interface FuelPrices {
  regular_price?: number;
  midgrade_price?: number;
  premium_price?: number;
  diesel_price?: number;
}

interface ServicePricing {
  fuel_service_fee?: number;
  wash_service_fee?: number;
  quick_inspection_fee?: number;
  wash_buff_shine_price?: number;
  wash_shine_protect_price?: number;
  wash_shine_price?: number;
  wash_double_wash_price?: number;
  bundle_fuel_service_fee?: number;
  bundle_wash_service_fee?: number;
}

function fmt(v?: number) {
  if (v == null || !Number.isFinite(v)) return "$0";
  return v % 1 === 0 ? `$${v.toFixed(0)}` : `$${v.toFixed(2)}`;
}

export default function HomePage() {
  const [fuelPrices, setFuelPrices] = useState<FuelPrices | null>(null);
  const [pricing, setPricing] = useState<ServicePricing | null>(null);
  const [bundlePct, setBundlePct] = useState(0);

  useEffect(() => {
    document.title = "ShiftFuel Concierge";
    document.body.className = "landing-page";

    supabaseClient.rpc("public_get_fuel_prices").then(({ data }) => {
      if (data) setFuelPrices(data);
    });

    supabaseClient.rpc("public_get_service_pricing").then(({ data }) => {
      if (data) {
        setPricing(data);
        const full = (Number(data.fuel_service_fee) || 0) + (Number(data.wash_service_fee) || 0);
        const bundleSum = (Number(data.bundle_fuel_service_fee) || 0) + (Number(data.bundle_wash_service_fee) || 0);
        const pct = full > 0 && bundleSum > 0 && bundleSum < full ? Math.round((1 - bundleSum / full) * 100) : 0;
        setBundlePct(pct);
      }
    });

    return () => { document.body.className = ""; };
  }, []);

  return (
    <>
      <SiteHeader />
      <main>
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <p className="eyebrow">Workday vehicle services</p>
            <h1>Workday vehicle services, handled for you.</h1>
            <p className="hero-copy">Fuel fill-ups, car wash service, and quick vehicle checks&mdash;delivered while you focus on your work.</p>
            <div className="landing-actions" aria-label="Primary actions">
              <Link className="button primary" href="/book">Book Now</Link>
              <Link className="button tertiary" href="/track">Track My Vehicle</Link>
              <Link className="button returning" href="/account">My Account</Link>
            </div>
            <div className="hero-trust-row">
              <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="8" r="3.4"/><path d="M5 20c0-3.3 3.1-6 7-6s7 2.7 7 6"/></svg>Trusted professionals</span>
              <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z"/></svg>Premium experience</span>
              <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/></svg>Real-time updates</span>
            </div>
          </div>
          <figure className="landing-hero-image">
            <img src="https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1200&q=80" alt="A vehicle ready for ShiftFuel concierge service" />
          </figure>
        </section>

        <section id="how" className="landing-section">
          <div className="section-heading center">
            <h2>How it works</h2>
          </div>
          <ol className="how-it-works-grid">
            <li>
              <span className="step-number">1</span>
              <span className="step-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/></svg></span>
              <strong>Book</strong>
              <p>Choose a service, date, and time that works for you.</p>
            </li>
            <li>
              <span className="step-number">2</span>
              <span className="step-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 21s7-5.5 7-11.5A7 7 0 0 0 5 9.5C5 15.5 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.3"/></svg></span>
              <strong>We come to your vehicle</strong>
              <p>A verified worker arrives at your service location.</p>
            </li>
            <li>
              <span className="step-number">3</span>
              <span className="step-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 16l1.5-5a2 2 0 0 1 1.9-1.4h9.2A2 2 0 0 1 18.5 11L20 16"/><rect x="3" y="16" width="18" height="4" rx="1.4"/><circle cx="7.5" cy="20" r="1.1"/><circle cx="16.5" cy="20" r="1.1"/></svg></span>
              <strong>We take care of it</strong>
              <p>We deliver premium service while you stay focused on your day.</p>
            </li>
            <li>
              <span className="step-number">4</span>
              <span className="step-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z"/><path d="M9 12l2 2 4-4"/></svg></span>
              <strong>You're all set</strong>
              <p>Get real-time updates and photos when the service is complete.</p>
            </li>
          </ol>
        </section>

        <section id="services" className="landing-section">
          <div className="section-heading center">
            <h2>Services &amp; Pricing</h2>
          </div>
          {bundlePct > 0 && (
            <a className="bundle-landing-banner" href="/book?service=fuel_wash">
              <span className="bundle-landing-badge">Save {bundlePct}%</span>
              {" "}<span>Book <strong>Fuel + Car Wash</strong> together and pay one combined service fee.</span>
              {" "}<span className="bundle-landing-action">Book combo service</span>
            </a>
          )}
          <div className="pricing-card-grid">
            <article className="pricing-card">
              <span className="pricing-icon pricing-icon-fuel">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="3" width="9" height="18" rx="1.4"/><path d="M4 10h9M7.5 3v0"/><path d="M13 8h2.5a2 2 0 0 1 2 2v6.5a1.5 1.5 0 0 0 3 0V8.5L18 6"/></svg>
              </span>
              <h3>Fuel Concierge</h3>
              <p>We fuel your vehicle with quality fuel&mdash;so you don't have to leave work.</p>
              <p className="pricing-from">
                <span>Fuel service starts at </span>
                <span>{fmt(pricing?.fuel_service_fee) || "$15"}</span>
                <span>. Fuel is charged separately at actual pump price.</span>
              </p>
              <ul className="pricing-package-list">
                {fuelPrices ? (
                  [
                    ["Regular", fuelPrices.regular_price],
                    ["Mid-grade", fuelPrices.midgrade_price],
                    ["Premium", fuelPrices.premium_price],
                    ["Diesel", fuelPrices.diesel_price],
                  ].map(([label, price]) => (
                    <li key={label as string}>
                      <span>{label as string}</span>
                      <strong>${Number(price).toFixed(3)}/gal</strong>
                    </li>
                  ))
                ) : (
                  <li><span>Current fuel prices shown during booking.</span></li>
                )}
              </ul>
              <Link className="button pricing-button pricing-button-fuel" href="/book?service=fuel">Book This Service</Link>
            </article>

            <article className="pricing-card">
              <span className="pricing-icon pricing-icon-wash">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M4 16l1.5-5a2 2 0 0 1 1.9-1.4h9.2A2 2 0 0 1 18.5 11L20 16"/>
                  <rect x="3" y="16" width="18" height="4" rx="1.4"/>
                  <circle cx="7.5" cy="20" r="1.1"/>
                  <circle cx="16.5" cy="20" r="1.1"/>
                  <path d="M8 5.5c.7-1 .7-1.8 0-2.8M12 5.5c.7-1 .7-1.8 0-2.8M16 5.5c.7-1 .7-1.8 0-2.8"/>
                </svg>
              </span>
              <h3>Car Wash</h3>
              <p>Premium exterior wash. Because first impressions matter.</p>
              <p className="pricing-from">
                <span>Service fee starts at </span>
                <span>{fmt(pricing?.wash_service_fee) || "$15"}</span>
                <span> plus the selected wash package.</span>
              </p>
              <div className="wash-summary-list">
                {[
                  { label: "Double Wash", price: pricing?.wash_double_wash_price, desc: "High pH Presoak, Low pH Presoak, Double Tire & Wheel Cleaning, Drying Agent, Spot Free Rinse" },
                  { label: "Shine", price: pricing?.wash_shine_price, desc: "Everything in Double Wash, plus Tri-Foam Conditioner & Blazin' Glaze Clear Coat." },
                  { label: "Shine & Protect", price: pricing?.wash_shine_protect_price, desc: "Everything in Shine, plus ICE® Instant Shine, Salt Shield, Tire Shine & Triple Wheel Cleaning." },
                  { label: "Buff & Shine", price: pricing?.wash_buff_shine_price, desc: "Everything in Shine & Protect, plus Fire Bath, Super Hard Shell Ceramic Finish & Buff N' Shine." },
                ].map(({ label, price, desc }) => (
                  <details key={label} className="wash-summary-item">
                    <summary className="wash-summary-header">
                      <strong>{label}</strong>
                      <span>{price != null ? fmt(price) : "—"}</span>
                    </summary>
                    <p>{desc}</p>
                  </details>
                ))}
              </div>
              <p className="pricing-warning">Exterior wash only&mdash;we do not offer interior cleaning.</p>
              <Link className="button pricing-button pricing-button-wash" href="/book?service=wash">Book This Service</Link>
            </article>

            <article className="pricing-card">
              <span className="pricing-icon pricing-icon-inspect">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="5" y="4" width="14" height="17" rx="1.6"/><path d="M9 3.5h6v2H9z"/><path d="M9 11l1.8 1.8L15 9"/></svg>
              </span>
              <h3>Quick Vehicle Care</h3>
              <p>An optional add-on you can attach to any fuel or car wash request.</p>
              <p className="pricing-from"><span>{fmt(pricing?.quick_inspection_fee) || "$5"}</span> <span>add-on</span></p>
              <ul className="pricing-includes">
                <li>Tire pressure check</li>
                <li>Washer fluid top-off if needed</li>
                <li>Basic visual check</li>
              </ul>
              <p className="pricing-warning">This is not a mechanical inspection.</p>
              <Link className="button pricing-button pricing-button-inspect" href="/book?service=quick-care">Book This Service</Link>
            </article>
          </div>
          <p className="pricing-disclaimer">Service prices include payment and operating costs. Final fuel cost is based on the actual receipt. Final totals are rounded up to the nearest dollar.</p>
        </section>

        <section id="trust" className="landing-section">
          <div className="section-heading center">
            <h2>Safety &amp; Trust</h2>
          </div>
          <div className="safety-row">
            <div>
              <span className="safety-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="8" r="3.4"/><path d="M5 20c0-3.3 3.1-6 7-6s7 2.7 7 6"/></svg></span>
              <strong>Verified professionals</strong>
              <p>Background-checked, trained, and insured.</p>
            </div>
            <div>
              <span className="safety-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="5" y="10.5" width="14" height="9.5" rx="1.6"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg></span>
              <strong>Secure &amp; protected</strong>
              <p>Safe, encrypted transactions and data.</p>
            </div>
            <div>
              <span className="safety-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1-2h7l1 2h2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="12.5" r="3.2"/></svg></span>
              <strong>Photo documentation</strong>
              <p>Before &amp; after photos with every service.</p>
            </div>
            <div>
              <span className="safety-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/></svg></span>
              <strong>Real-time updates</strong>
              <p>Live status so you're always in the know.</p>
            </div>
          </div>
        </section>
      </main>

      <FinalCta />
      <SiteFooter />
    </>
  );
}
