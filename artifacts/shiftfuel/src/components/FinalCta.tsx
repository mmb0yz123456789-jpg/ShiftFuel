import { Link } from "wouter";

export default function FinalCta() {
  return (
    <section className="landing-final-cta">
      <div className="final-cta-main">
        <span className="final-cta-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
        </span>
        <div>
          <strong>Your vehicle, our priority.</strong>
          <p>Convenient vehicle service while you work.</p>
        </div>
      </div>
      <div className="final-cta-portals final-cta-portals--desktop">
        <Link className="button portal-button portal-button-primary" href="/join-the-team">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z"/><path d="M9 12l2 2 4-4"/></svg>
          Join the Team
        </Link>
        <Link className="button portal-button" href="/worker/login">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="8" r="3.4"/><path d="M5 20c0-3.3 3.1-6 7-6s7 2.7 7 6"/></svg>
          Worker Portal
        </Link>
        <Link className="button portal-button" href="/admin/login">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          Admin Portal
        </Link>
      </div>
      <div className="final-cta-portals final-cta-portals--mobile">
        <Link className="button portal-button portal-button-primary" href="/staff-access">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="8" r="3.4"/><path d="M5 20c0-3.3 3.1-6 7-6s7 2.7 7 6"/></svg>
          Staff Access
        </Link>
      </div>
    </section>
  );
}
