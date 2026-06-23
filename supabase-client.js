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
})();
