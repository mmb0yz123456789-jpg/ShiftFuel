import { useEffect } from "react";

// The ShiftFuel Concierge app is a vanilla HTML/JS multi-page app.
// The static HTML files are served from the /public directory by Vite.
// This React shell handles initial redirect logic and PWA bootstrapping.
// All real app pages are .html files in /public.

export default function App() {
  useEffect(() => {
    // If the user hits "/" directly (not a specific .html page), redirect to index.html
    const path = window.location.pathname;
    const base = import.meta.env.BASE_URL || "/";

    // Normalize base (remove trailing slash for comparison)
    const normalizedBase = base.replace(/\/$/, "");

    // If we're at the base path or root, redirect to the landing page
    if (path === normalizedBase || path === normalizedBase + "/" || path === "/") {
      window.location.replace(base + "index.html");
    }
  }, []);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <p style={{ color: "#6b7280", fontSize: "14px" }}>Loading ShiftFuel...</p>
    </div>
  );
}
