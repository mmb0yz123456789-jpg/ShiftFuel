import { Link } from "wouter";

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-main">
        <p className="footer-copy">&copy; {new Date().getFullYear()} ShiftFuel Concierge. All rights reserved.</p>
        <nav className="footer-links" aria-label="Legal links">
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms of Service</Link>
          <Link href="/liability-waiver">Liability Waiver</Link>
        </nav>
      </div>
    </footer>
  );
}
