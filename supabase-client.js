const SUPABASE_URL = "https://nhdsokqxndhlkbsvmxio.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oZHNva3F4bmRobGtic3ZteGlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1NDU3ODgsImV4cCI6MjA5NzEyMTc4OH0.Fd7y0eVy-lCDYQ9UXVoDi6kWxdgmGk1QZ_SeVrmIP8I";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

window.ShiftFuelSupabase = supabaseClient;

(function loadSharedPolish() {
  if (!document.querySelector('link[data-mobile-polish]')) {
    const mobile = document.createElement('link');
    mobile.rel = 'stylesheet';
    mobile.href = 'mobile-polish.css';
    mobile.dataset.mobilePolish = '1';
    document.head.appendChild(mobile);
  }

  if (document.body?.classList.contains('admin-portal-page')) {
    if (!document.querySelector('link[data-admin-production-polish]')) {
      const adminCss = document.createElement('link');
      adminCss.rel = 'stylesheet';
      adminCss.href = 'admin-production-polish.css';
      adminCss.dataset.adminProductionPolish = '1';
      document.head.appendChild(adminCss);
    }

    if (!document.querySelector('script[data-admin-production-polish]')) {
      const adminScript = document.createElement('script');
      adminScript.src = 'admin-production-polish.js';
      adminScript.defer = true;
      adminScript.dataset.adminProductionPolish = '1';
      document.body.appendChild(adminScript);
    }
  }
})();
