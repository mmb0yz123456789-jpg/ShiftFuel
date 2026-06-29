import { useState } from "react";
import { Link, useLocation } from "wouter";

export default function SiteHeader() {
  const [navOpen, setNavOpen] = useState(false);
  const [location] = useLocation();

  function closeNav() {
    setNavOpen(false);
  }

  return (
    <header className="site-header landing-header">
      <Link className="logo" href="/" aria-label="ShiftFuel Concierge home" onClick={closeNav}>
        <span className="logo-mark"><img src="/icon-main.svg" alt="" aria-hidden="true" /></span>
        <span>ShiftFuel Concierge</span>
      </Link>
      <button
        className="mobile-menu-button"
        type="button"
        aria-expanded={navOpen}
        aria-controls="site-nav"
        onClick={() => setNavOpen(!navOpen)}
      >
        <span>Menu</span>
        <span aria-hidden="true">&#9776;</span>
      </button>
      <nav
        id="site-nav"
        className={`nav${navOpen ? " is-open" : ""}`}
        aria-label="Main navigation"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a")) closeNav();
        }}
      >
        <a href="/#how">How It Works</a>
        <a href="/#services">Services &amp; Pricing</a>
        <a href="/#trust">Safety &amp; Trust</a>
        <Link className="nav-cta" href="/book" onClick={closeNav}>Book Now</Link>
        <Link className="nav-returning" href="/account" onClick={closeNav}>My Account</Link>
        <Link className="nav-outline" href="/track" onClick={closeNav}>Track My Vehicle</Link>
      </nav>
    </header>
  );
}
