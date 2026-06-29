import { useEffect } from "react";
import { Link } from "wouter";

export default function StaffAccessPage() {
  useEffect(() => {
    document.title = "Staff Access | ShiftFuel Concierge";
    document.body.className = "landing-page portal-login-page staff-access-page";
    return () => { document.body.className = ""; };
  }, []);

  return (
    <>
      <header className="portal-header unified-portal-header">
        <Link className="logo" href="/">
          <span className="logo-mark"><img src="/icon-main.svg" alt="" aria-hidden="true" /></span>
          <span>ShiftFuel Concierge</span>
        </Link>
        <div className="portal-header-actions">
          <span className="portal-header-label">Staff Access</span>
        </div>
      </header>

      <main className="portal-login-shell">
        <section className="portal-login-card staff-access-card">
          <h1>Staff Access</h1>
          <p className="portal-login-intro">Choose your portal to continue. Staff and admin areas require secure login.</p>

          <div className="staff-access-buttons">
            <Link href="/worker/login" className="staff-portal-btn">
              <span className="staff-portal-btn-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <circle cx="12" cy="8" r="3.4"/>
                  <path d="M5 20c0-3.3 3.1-6 7-6s7 2.7 7 6"/>
                </svg>
              </span>
              <span className="staff-portal-btn-body">
                <strong>Worker Portal</strong>
                <small>View jobs, update requests &amp; complete services</small>
              </span>
              <svg className="staff-portal-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
            </Link>

            <Link href="/admin/login" className="staff-portal-btn">
              <span className="staff-portal-btn-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l1.9-1.3-2-3.4-2.2.7a7.6 7.6 0 0 0-2.6-1.5L14 2.5h-4l-.5 2.5a7.6 7.6 0 0 0-2.6 1.5l-2.2-.7-2 3.4 1.9 1.3a7.6 7.6 0 0 0 0 3l-1.9 1.3 2 3.4 2.2-.7a7.6 7.6 0 0 0 2.6 1.5l.5 2.5h4l.5-2.5a7.6 7.6 0 0 0 2.6-1.5l2.2.7 2-3.4z"/>
                </svg>
              </span>
              <span className="staff-portal-btn-body">
                <strong>Admin Portal</strong>
                <small>Manage requests, workers, services &amp; payments</small>
              </span>
              <svg className="staff-portal-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
            </Link>

            <Link href="/join-the-team" className="staff-portal-btn">
              <span className="staff-portal-btn-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <path d="M12 21s7-5.5 7-11.5A7 7 0 0 0 5 9.5C5 15.5 12 21 12 21z"/>
                  <circle cx="12" cy="9.5" r="2.3"/>
                </svg>
              </span>
              <span className="staff-portal-btn-body">
                <strong>Join the Team</strong>
                <small>Apply to become a ShiftFuel worker</small>
              </span>
              <svg className="staff-portal-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
            </Link>
          </div>

          <div className="portal-login-divider" aria-hidden="true">
            <span className="portal-login-divider-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                <path d="M12 2.6 5 5.2v5.4c0 4.3 2.9 8.3 7 9.4 4.1-1.1 7-5.1 7-9.4V5.2L12 2.6z"/>
                <path d="M9.2 11.7l2 2 3.6-3.9"/>
              </svg>
            </span>
          </div>
          <Link href="/" className="portal-login-back">← Back to customer site</Link>
        </section>
      </main>
    </>
  );
}
