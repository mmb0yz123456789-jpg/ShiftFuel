import { useEffect } from "react";

// The ShiftFuel Concierge app is a vanilla HTML/JS multi-page app.
// The static HTML files are served from the /public directory by Vite.
// This React shell handles the clean-URL → HTML redirects (mirroring vercel.json rewrites)
// and the root / → index.html redirect.
//
// Vercel rewrites ported here:
//   /staff/access       → /staff-access.html
//   /join-the-team      → /hiring.html
//   /apply              → /hiring.html
//   /worker/login       → /worker-login.html
//   /worker/dashboard   → /worker.html
//   /admin/login        → /admin-login.html
//   /admin/dashboard    → /admin.html
//   /                   → /index.html

const REWRITES: Record<string, string> = {
  "/staff/access": "/staff-access.html",
  "/join-the-team": "/hiring.html",
  "/apply": "/hiring.html",
  "/worker/login": "/worker-login.html",
  "/worker/dashboard": "/worker.html",
  "/admin/login": "/admin-login.html",
  "/admin/dashboard": "/admin.html",
};

export default function App() {
  useEffect(() => {
    const path = window.location.pathname;

    // Handle clean-URL rewrites (mirror vercel.json)
    const target = REWRITES[path] || REWRITES[path.replace(/\/$/, "")];
    if (target) {
      window.location.replace(target + window.location.search + window.location.hash);
      return;
    }

    // Root redirect to landing page
    if (path === "/" || path === "") {
      window.location.replace("/index.html");
      return;
    }

    // Any other path that lands on this shell (e.g. a 404 in prod): go home
    window.location.replace("/index.html");
  }, []);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <p style={{ color: "#6b7280", fontSize: "14px" }}>Loading ShiftFuel...</p>
    </div>
  );
}
