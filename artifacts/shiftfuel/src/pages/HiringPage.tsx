import { useEffect } from "react";
import { Link } from "wouter";
import SiteFooter from "@/components/SiteFooter";
import { useScriptLoader } from "@/hooks/useScriptLoader";

export default function HiringPage() {
  const loaded = useScriptLoader([
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
  ]);

  useEffect(() => {
    document.title = "Hiring — ShiftFuel Concierge";
    document.body.className = "landing-page hiring-page";
    return () => { document.body.className = ""; };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const scripts = ["/supabase-client.js", "/hiring.js"];
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
      <style>{`
        .hiring-page .hiring-form-subheading {
          margin-top: 22px; padding-top: 20px;
          border-top: 1px solid rgba(13,59,59,0.12);
        }
        .hiring-page .applicant-consent {
          display: flex; flex-direction: row; align-items: flex-start;
          gap: 12px; margin: 18px 0 4px; padding: 14px 16px;
          background: var(--sf-sage-light,#eef4f0);
          border: 1px solid rgba(13,59,59,0.14); border-radius: 12px;
          font-size: 0.9rem; line-height: 1.45; font-weight: 500; cursor: pointer;
        }
        .hiring-page .applicant-consent input[type="checkbox"] {
          width: 20px; height: 20px; flex: 0 0 auto; margin-top: 1px;
          accent-color: var(--sf-green,#1f9d57); cursor: pointer;
        }
      `}</style>
      <header className="portal-header unified-portal-header portal-login-header">
        <Link className="logo" href="/" aria-label="ShiftFuel Concierge home">
          <span className="logo-mark"><img src="/icon-main.svg" alt="" aria-hidden="true" /></span>
          <span>ShiftFuel Concierge</span>
        </Link>
        <nav className="portal-public-nav" aria-label="Main navigation">
          <a href="/#how">How It Works</a>
          <a href="/#services">Services &amp; Pricing</a>
          <a href="/#trust">Safety &amp; Trust</a>
        </nav>
        <div className="portal-cta-links">
          <Link className="button primary" href="/book">Book Now</Link>
          <Link className="button returning" href="/account">My Account</Link>
          <Link className="button secondary" href="/track">Track My Vehicle</Link>
        </div>
      </header>

      <main className="booking-flow-shell">
        <section className="booking-flow-hero">
          <div className="booking-flow-hero-copy">
            <p className="eyebrow">Join the Team</p>
            <h1>Drive with ShiftFuel.</h1>
            <p>We bring fuel-ups and car care to people's vehicles during the workday. Tell us about yourself and your availability — we'll follow up before any customer vehicle work is assigned.</p>
            <a className="button primary hiring-hero-cta" href="#apply" style={{ marginTop: "18px", width: "fit-content" }}>Apply now</a>
          </div>
          <figure className="booking-flow-hero-image">
            <img src="https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1200&q=80" alt="A concierge service vehicle on the road" />
          </figure>
        </section>

        <section className="hiring-why">
          <div className="section-heading center">
            <p className="eyebrow">Why ShiftFuel</p>
            <h2>What you can expect</h2>
          </div>
          <div className="safety-row">
            <div>
              <span className="safety-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/></svg></span>
              <strong>Flexible hours</strong>
              <p>Pick up shifts that fit your life — days, evenings, or weekends.</p>
            </div>
            <div>
              <span className="safety-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="5" y="4" width="14" height="17" rx="1.6"/><path d="M9 3.5h6v2H9z"/><path d="M9 11h6M9 14.5h6"/></svg></span>
              <strong>Everything in one app</strong>
              <p>Jobs, schedules, and photo check-ins in one simple portal.</p>
            </div>
            <div>
              <span className="safety-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z"/><path d="M9 12l2 2 4-4"/></svg></span>
              <strong>Background-checked team</strong>
              <p>Work alongside trained, vetted professionals you can trust.</p>
            </div>
            <div>
              <span className="safety-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/></svg></span>
              <strong>Simple onboarding</strong>
              <p>Apply in minutes — we'll guide you through the rest.</p>
            </div>
          </div>
        </section>

        <section className="booking-accordion-card is-active" id="apply">
          <div className="booking-accordion-body" style={{ display: "grid", paddingTop: "24px" }}>
            <div className="section-heading hiring-form-heading">
              <p className="eyebrow">Application</p>
              <h2>Apply now</h2>
            </div>
            <form id="applicant-form" className="booking-form">
              <div className="field-grid">
                <label>First name<input type="text" name="applicantFirstName" placeholder="First name" autoComplete="given-name" required /></label>
                <label>Last name<input type="text" name="applicantLastName" placeholder="Last name" autoComplete="family-name" required /></label>
                <label>Email<input type="email" name="applicantEmail" placeholder="you@example.com" required /></label>
                <label>Phone<input type="tel" name="applicantPhone" placeholder="(302) 555-0100" required /></label>
                <label>Availability<input type="text" name="applicantAvailability" placeholder="Weekdays, weekends, evenings" /></label>
              </div>

              <div className="section-heading hiring-form-subheading">
                <h3 style={{ margin: 0, fontSize: "1.05rem" }}>Driving &amp; eligibility</h3>
                <p style={{ margin: "4px 0 0", fontSize: ".88rem", color: "var(--sf-muted,#5f6f6b)" }}>You'll be driving customers' vehicles, so a few quick checks:</p>
              </div>
              <div className="field-grid">
                <label>Valid driver's license?<select name="applicantLicense" required><option value="" disabled>Select…</option><option>Yes</option><option>No</option></select></label>
                <label>License state<input type="text" name="applicantLicenseState" placeholder="DE" autoCapitalize="characters" maxLength={2} /></label>
                <label>Date of birth<input type="date" name="applicantDob" required /></label>
                <label>Moving violations in the last 3 years?<select name="applicantViolations"><option value="" disabled>Select…</option><option>No</option><option>Yes</option></select></label>
                <label>Authorized to work in the U.S.?<select name="applicantWorkAuth" required><option value="" disabled>Select…</option><option>Yes</option><option>No</option></select></label>
                <label>Area you can cover<input type="text" name="applicantServiceArea" placeholder="e.g. Wilmington, DE" /></label>
                <label>Reliable transportation to job sites?<select name="applicantTransport"><option value="" disabled>Select…</option><option>Yes</option><option>No</option></select></label>
              </div>

              <label className="applicant-consent">
                <input type="checkbox" name="applicantBgConsent" required />
                <span>I consent to a background check as part of the hiring process, and I confirm the information above is accurate.</span>
              </label>
              <label>
                Experience or notes
                <textarea name="applicantNotes" rows={3} placeholder="Driving, customer service, car wash, or fuel service experience" />
              </label>
              <label className="file-button-control resume-upload-control" id="resume-drop-zone">
                Resume <span className="optional-mark">Optional</span>
                <input type="file" name="applicantResume" id="applicant-resume-input" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
                <span className="button primary file-button-text" aria-hidden="true">Upload Resume</span>
                <span className="selected-file-name" id="resume-file-name">No file chosen</span>
                <span className="resume-drop-hint" aria-hidden="true">or drag and drop here</span>
              </label>
              <button className="button primary" type="submit">Submit application</button>
              <p id="applicant-status" className="form-status" role="status"></p>
            </form>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
