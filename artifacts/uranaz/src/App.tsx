import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useState, useEffect } from "react";
import { getToken, clearToken } from "@/lib/auth";
import { getMe, setAuthTokenGetter } from "@workspace/api-client-react";

// Wire up the auth token getter so every API request includes Authorization: Bearer <token>
setAuthTokenGetter(getToken);

import ScrollToTop from "@/components/ScrollToTop";
import BottomNav from "@/components/BottomNav";
import TopNav from "@/components/TopNav";
import AdminLayout from "@/components/AdminLayout";
import DeviceGate from "@/components/DeviceGate";
import SpaceBackground from "@/components/SpaceBackground";
import NotFound from "@/pages/not-found";

import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import ForgotPassword from "@/pages/ForgotPassword";
import ProfileSetup from "@/pages/ProfileSetup";
import Dashboard from "@/pages/Dashboard";
import Invest from "@/pages/Invest";
import Income from "@/pages/Income";
import Transactions from "@/pages/Transactions";
import Team from "@/pages/Team";
import Share from "@/pages/Share";
import Profile from "@/pages/Profile";
import Withdrawals from "@/pages/Withdrawals";
import Ranks from "@/pages/Ranks";
import WalletPage from "@/pages/Wallet";
import Terms from "@/pages/Terms";
import Privacy from "@/pages/Privacy";
import About from "@/pages/About";
import CertEdit from "@/pages/CertEdit";

import Admin from "@/pages/admin/Admin";
import AdminUsers from "@/pages/admin/AdminUsers";
import AdminInvestments from "@/pages/admin/AdminInvestments";
import AdminWithdrawals from "@/pages/admin/AdminWithdrawals";
import AdminSettings from "@/pages/admin/AdminSettings";
import AdminSupport from "@/pages/admin/AdminSupport";
import AdminOffers from "@/pages/admin/AdminOffers";
import AdminNotices from "@/pages/admin/AdminNotices";
import AdminReports from "@/pages/admin/AdminReports";
import AdminLegal from "@/pages/admin/AdminLegal";
import AdminRanks from "@/pages/admin/AdminRanks";
import AdminRewards from "@/pages/admin/AdminRewards";
import Support from "@/pages/Support";
import Deposit from "@/pages/Deposit";
import Notifications from "@/pages/Notifications";
import NotificationDetail from "@/pages/NotificationDetail";
import Join from "@/pages/Join";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});


function RequireAuth({ children, user }: { children: React.ReactNode; user: any }) {
  const [location] = useLocation();
  if (!user) return <Redirect to={`/login?redirect=${encodeURIComponent(location)}`} />;
  return <>{children}</>;
}

function RequireAdmin({ children, user }: { children: React.ReactNode; user: any }) {
  if (!user) return <Redirect to="/login" />;
  if (!user.isAdmin) return <Redirect to="/dashboard" />;
  return <>{children}</>;
}

function Router({ user, setUser }: { user: any; setUser: (u: any) => void }) {
  const [location] = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [location]);

  const isLoggedIn = !!user;
  const isPublic = ["/", "/login", "/register", "/join", "/forgot-password", "/terms", "/privacy", "/about", "/cert-edit"].includes(location) ||
    location.startsWith("/terms") || location.startsWith("/privacy");
  const isAuth = ["/login", "/register", "/join", "/forgot-password"].includes(location);

  return (
    <DeviceGate user={user} path={location}>
      {isLoggedIn && !isAuth && (
        <TopNav user={user} onLogout={() => setUser(null)} />
      )}
      <Switch>
        {/* Public */}
        <Route path="/" component={Landing} />
        <Route path="/terms" component={Terms} />
        <Route path="/privacy" component={Privacy} />
        <Route path="/about" component={About} />
        <Route path="/cert-edit" component={CertEdit} />
        <Route path="/login">
          {isLoggedIn ? <Redirect to="/dashboard" /> : <Login onLogin={setUser} />}
        </Route>
        <Route path="/register">
          {isLoggedIn ? <Redirect to="/dashboard" /> : <Register onLogin={setUser} />}
        </Route>
        <Route path="/join">
          {isLoggedIn ? <Redirect to="/dashboard" /> : <Join />}
        </Route>
        <Route path="/forgot-password">
          {isLoggedIn ? <Redirect to="/dashboard" /> : <ForgotPassword />}
        </Route>

        {/* Profile Setup */}
        <Route path="/profile-setup">
          <RequireAuth user={user}>
            <ProfileSetup onUpdate={setUser} />
          </RequireAuth>
        </Route>

        {/* Protected User Pages */}
        <Route path="/dashboard">
          <RequireAuth user={user}>
            <Dashboard user={user} />
          </RequireAuth>
        </Route>
        <Route path="/invest">
          <RequireAuth user={user}>
            <Invest user={user} />
          </RequireAuth>
        </Route>
        <Route path="/income">
          <RequireAuth user={user}>
            <Income />
          </RequireAuth>
        </Route>
        <Route path="/transactions">
          <RequireAuth user={user}>
            <Transactions />
          </RequireAuth>
        </Route>
        <Route path="/team">
          <RequireAuth user={user}>
            <Team user={user} />
          </RequireAuth>
        </Route>
        <Route path="/share">
          <RequireAuth user={user}>
            <Share />
          </RequireAuth>
        </Route>
        <Route path="/profile">
          <RequireAuth user={user}>
            <Profile user={user} onUpdate={setUser} />
          </RequireAuth>
        </Route>
        <Route path="/wallet">
          <RequireAuth user={user}>
            <WalletPage user={user} />
          </RequireAuth>
        </Route>
        <Route path="/withdrawals">
          <RequireAuth user={user}>
            <Withdrawals user={user} />
          </RequireAuth>
        </Route>
        <Route path="/ranks">
          <RequireAuth user={user}>
            <Ranks user={user} />
          </RequireAuth>
        </Route>
        <Route path="/deposit">
          <RequireAuth user={user}>
            <Deposit user={user} />
          </RequireAuth>
        </Route>
        <Route path="/support">
          <RequireAuth user={user}>
            <Support user={user} />
          </RequireAuth>
        </Route>
        <Route path="/notifications">
          <RequireAuth user={user}>
            <Notifications />
          </RequireAuth>
        </Route>
        <Route path="/notifications/:id">
          <RequireAuth user={user}>
            <NotificationDetail />
          </RequireAuth>
        </Route>

        {/* Admin */}
        <Route path="/admin">
          <RequireAdmin user={user}><AdminLayout><Admin /></AdminLayout></RequireAdmin>
        </Route>
        <Route path="/admin/users">
          <RequireAdmin user={user}><AdminLayout><AdminUsers /></AdminLayout></RequireAdmin>
        </Route>
        <Route path="/admin/investments">
          <RequireAdmin user={user}><AdminLayout><AdminInvestments /></AdminLayout></RequireAdmin>
        </Route>
        <Route path="/admin/withdrawals">
          <RequireAdmin user={user}><AdminLayout><AdminWithdrawals /></AdminLayout></RequireAdmin>
        </Route>
        <Route path="/admin/settings">
          <RequireAdmin user={user}><AdminLayout><AdminSettings /></AdminLayout></RequireAdmin>
        </Route>
        <Route path="/admin/support">
          <RequireAdmin user={user}><AdminLayout><AdminSupport /></AdminLayout></RequireAdmin>
        </Route>
        <Route path="/admin/offers">
          <RequireAdmin user={user}><AdminLayout><AdminOffers /></AdminLayout></RequireAdmin>
        </Route>
        <Route path="/admin/notices">
          <RequireAdmin user={user}><AdminLayout><AdminNotices /></AdminLayout></RequireAdmin>
        </Route>
        <Route path="/admin/reports">
          <RequireAdmin user={user}><AdminLayout><AdminReports /></AdminLayout></RequireAdmin>
        </Route>
        <Route path="/admin/legal">
          <RequireAdmin user={user}><AdminLayout><AdminLegal /></AdminLayout></RequireAdmin>
        </Route>
        <Route path="/admin/ranks">
          <RequireAdmin user={user}><AdminLayout><AdminRanks /></AdminLayout></RequireAdmin>
        </Route>
        <Route path="/admin/rewards">
          <RequireAdmin user={user}><AdminLayout><AdminRewards /></AdminLayout></RequireAdmin>
        </Route>

        <Route component={NotFound} />
      </Switch>

      {!location.startsWith("/admin") && <BottomNav isLoggedIn={isLoggedIn} />}
      <ScrollToTop />
    </DeviceGate>
  );
}

function AppInner() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    getMe()
      .then(me => setUser(me))
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#050C0A" }}>
        <SpaceBackground />
        <div className="relative z-10 flex flex-col items-center gap-4">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, rgba(0,255,148,0.2), rgba(0,204,119,0.1))",
              border: "1px solid rgba(0,255,148,0.4)",
              boxShadow: "0 0 30px rgba(0,255,148,0.3)",
            }}
          >
            <span style={{ color: "#00FF94", fontFamily: "'Sora',sans-serif", fontWeight: 700 }}>WA</span>
          </div>
          <div
            className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: "rgba(0,255,148,0.6)", borderTopColor: "transparent" }}
          />
        </div>
      </div>
    );
  }

  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <ScrollToTop />
      <SpaceBackground />
      <div className="relative z-10 min-h-screen">
        <Router user={user} setUser={setUser} />
      </div>
    </WouterRouter>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppInner />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
