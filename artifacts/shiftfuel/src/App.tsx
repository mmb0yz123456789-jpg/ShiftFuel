import { Switch, Route, Router as WouterRouter } from "wouter";
import "@/lib/supabase";
import HomePage from "@/pages/HomePage";
import BookPage from "@/pages/BookPage";
import TrackPage from "@/pages/TrackPage";
import AccountPage from "@/pages/AccountPage";
import HiringPage from "@/pages/HiringPage";
import StaffAccessPage from "@/pages/StaffAccessPage";
import WorkerLoginPage from "@/pages/WorkerLoginPage";
import WorkerDashboardPage from "@/pages/WorkerDashboardPage";
import AdminLoginPage from "@/pages/AdminLoginPage";
import AdminDashboardPage from "@/pages/AdminDashboardPage";
import { PrivacyPage, TermsPage, LiabilityWaiverPage } from "@/pages/LegalPage";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/book" component={BookPage} />
      <Route path="/track" component={TrackPage} />
      <Route path="/account" component={AccountPage} />
      <Route path="/join-the-team" component={HiringPage} />
      <Route path="/staff-access" component={StaffAccessPage} />
      <Route path="/worker/login" component={WorkerLoginPage} />
      <Route path="/worker/dashboard" component={WorkerDashboardPage} />
      <Route path="/admin/login" component={AdminLoginPage} />
      <Route path="/admin/dashboard" component={AdminDashboardPage} />
      <Route path="/privacy" component={PrivacyPage} />
      <Route path="/terms" component={TermsPage} />
      <Route path="/liability-waiver" component={LiabilityWaiverPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <Router />
    </WouterRouter>
  );
}

export default App;
