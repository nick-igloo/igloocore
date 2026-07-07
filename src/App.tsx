import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useState, useEffect, lazy, Suspense } from 'react';
import { supabase } from './lib/supabase';
import { Dashboard } from './components/Dashboard';
import { AdminAuth } from './components/AdminAuth';
import AppShell from './components/AppShell';
import { Loader2 } from 'lucide-react';
import { User } from '@supabase/supabase-js';

const ReportApp = lazy(() => import('./ReportApp'));
const OwnerPortal = lazy(() => import('./pages/OwnerPortal'));
const DocumentsPage = lazy(() => import('./pages/DocumentsPage'));
const SafetyDocumentsPage = lazy(() => import('./pages/SafetyDocumentsPage'));
const PropertySafetyPage = lazy(() => import('./pages/PropertySafetyPage'));
const ExecutiveDashboard = lazy(() => import('./pages/ExecutiveDashboard'));
const BookingProcessor = lazy(() => import('./pages/BookingProcessor'));
const SettlementConverter = lazy(() => import('./pages/SettlementConverter'));
const SettlementGenerator = lazy(() => import('./pages/SettlementGenerator'));
const STLChecksImport = lazy(() => import('./pages/STLChecksImport'));
const PATTestingTool = lazy(() => import('./pages/PATTestingTool'));
const GuestReady = lazy(() => import('./pages/GuestReady'));
const DailySafetyChecks = lazy(() => import('./pages/DailySafetyChecks'));
const PropertySafetyCheck = lazy(() => import('./pages/PropertySafetyCheck'));
const TurnoverTasks = lazy(() => import('./pages/TurnoverTasks'));
const TurnoverIssues = lazy(() => import('./pages/TurnoverIssues'));
const CleanerManagement = lazy(() => import('./pages/CleanerManagement'));
const Settings = lazy(() => import('./pages/Settings'));
const DirectorExpenses = lazy(() => import('./pages/DirectorExpenses'));
const NewPropertyWizard = lazy(() => import('./pages/NewPropertyWizard'));
const DriveSync = lazy(() => import('./pages/DriveSync'));
const WoodlandSafety = lazy(() => import('./pages/WoodlandSafety'));

const ADMIN_EMAILS = ['nick@igloo.scot', 'erin@igloo.scot'];

function isAdminUser(u: User | null | undefined): boolean {
  if (!u) return false;
  const role = (u.app_metadata as Record<string, unknown> | undefined)?.role;
  if (role === 'admin') return true;
  const email = u.email?.toLowerCase() ?? '';
  return ADMIN_EMAILS.includes(email);
}

function PageFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
    </div>
  );
}

function AdminRoute() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const sessionUser = session?.user ?? null;
      setUser(isAdminUser(sessionUser) ? sessionUser : null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      const sessionUser = session?.user ?? null;
      setUser(isAdminUser(sessionUser) ? sessionUser : null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <AdminAuth onAuthenticated={() => {}} />;
  }

  return <Dashboard user={user} onSignOut={handleSignOut} />;
}

function App() {
  const hostname = window.location.hostname;
  const isCoreDomain = hostname === 'core.igloo.scot';
  const isSafeDomain = hostname === 'safe.igloo.scot';
  const isStlDomain = hostname === 'stl.igloo.scot';

  if (isCoreDomain) {
    return (
      <BrowserRouter>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/" element={<AdminRoute />} />
            <Route element={<AppShell />}>
              <Route path="/reports" element={<ReportApp />} />
              <Route path="/executive" element={<ExecutiveDashboard />} />
              <Route path="/booking-processor" element={<BookingProcessor />} />
              <Route path="/settlement-converter" element={<SettlementConverter />} />
              <Route path="/settlement-generator" element={<SettlementGenerator />} />
              <Route path="/stl-checks-import" element={<STLChecksImport />} />
              <Route path="/pat-testing" element={<PATTestingTool />} />
              <Route path="/guest-ready" element={<GuestReady />} />
              <Route path="/daily-safety" element={<DailySafetyChecks />} />
              <Route path="/turnover/tasks" element={<TurnoverTasks />} />
              <Route path="/turnover/issues" element={<TurnoverIssues />} />
              <Route path="/property-safety-check" element={<PropertySafetyCheck />} />
              <Route path="/cleaner-management" element={<CleanerManagement />} />
              <Route path="/expenses" element={<DirectorExpenses />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/onboard-property" element={<NewPropertyWizard />} />
              <Route path="/drive-sync" element={<DriveSync />} />
              <Route path="/woodland-safety" element={<WoodlandSafety />} />
            </Route>
            <Route path="*" element={<AdminRoute />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    );
  }

  if (isSafeDomain) {
    return (
      <BrowserRouter>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/" element={<OwnerPortal />} />
            <Route path="/documents" element={<DocumentsPage />} />
            <Route path="*" element={<OwnerPortal />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    );
  }

  if (isStlDomain) {
    return (
      <BrowserRouter>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/" element={<SafetyDocumentsPage />} />
            <Route path="/:propertySlug" element={<PropertySafetyPage />} />
            <Route path="*" element={<SafetyDocumentsPage />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    );
  }

  return (
    <BrowserRouter>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/" element={<AdminRoute />} />
          <Route element={<AppShell />}>
            <Route path="/reports" element={<ReportApp />} />
          </Route>
          <Route path="/owner" element={<OwnerPortal />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/safety" element={<SafetyDocumentsPage />} />
          <Route path="/safety/:propertySlug" element={<PropertySafetyPage />} />
          <Route element={<AppShell />}>
            <Route path="/executive" element={<ExecutiveDashboard />} />
            <Route path="/booking-processor" element={<BookingProcessor />} />
            <Route path="/settlement-converter" element={<SettlementConverter />} />
            <Route path="/settlement-generator" element={<SettlementGenerator />} />
            <Route path="/stl-checks-import" element={<STLChecksImport />} />
            <Route path="/pat-testing" element={<PATTestingTool />} />
            <Route path="/guest-ready" element={<GuestReady />} />
            <Route path="/daily-safety" element={<DailySafetyChecks />} />
            <Route path="/turnover/tasks" element={<TurnoverTasks />} />
            <Route path="/turnover/issues" element={<TurnoverIssues />} />
            <Route path="/property-safety-check" element={<PropertySafetyCheck />} />
            <Route path="/cleaner-management" element={<CleanerManagement />} />
            <Route path="/expenses" element={<DirectorExpenses />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/onboard-property" element={<NewPropertyWizard />} />
            <Route path="/drive-sync" element={<DriveSync />} />
            <Route path="/woodland-safety" element={<WoodlandSafety />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;