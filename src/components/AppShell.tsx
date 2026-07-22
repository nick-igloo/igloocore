import { IglooLogo } from './IglooLogo';
import { useState } from 'react';
import { Outlet, NavLink, Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Calculator, Activity, TrendingUp, FileText, Receipt, ShieldCheck, Zap,
  Home, FolderSync, Settings as SettingsIcon,
  BarChart3, Menu, X, FlaskConical,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════
// AppShell — persistent frame for all admin pages.
// Navy top bar + grouped sidebar. Pages render in <Outlet />.
// Wire-up: in src/App.tsx wrap the admin <Route>s inside
//   <Route element={<AppShell />}> ... </Route>
// ═══════════════════════════════════════════════════════════════════

const NAV = [
  {
    group: 'Finance',
    items: [
      { to: '/booking-processor', label: 'Booking Processor', icon: Calculator },
      { to: '/live-reconciliation', label: 'Live Reconciliation', icon: Activity },
      { to: '/settlement-converter', label: 'Settlement Converter', icon: FileText },
      { to: '/expenses', label: 'Director Expenses', icon: Receipt },
    ],
  },
  {
    group: 'Safety',
    items: [
      { to: '/daily-safety', label: 'Daily Checks', icon: ShieldCheck },
      { to: '/pat-testing', label: 'PAT Testing', icon: Zap },
    ],
  },
  {
    group: 'Property',
    items: [
      { to: '/onboard-property', label: 'Onboard Property', icon: Home },
      { to: '/drive-sync', label: 'Drive Sync', icon: FolderSync },
      { to: '/settings', label: 'Settings', icon: SettingsIcon },
    ],
  },
  {
    group: 'Reports',
    items: [
      { to: '/reports', label: 'Owner Reports', icon: FileText },
      { to: '/stats', label: 'Director Stats', icon: TrendingUp },
    ],
  },
  {
    group: 'Labs',
    items: [
      { to: '/labs/property-publisher', label: 'Property Publisher', icon: FlaskConical },
      { to: '/labs/review-responder', label: 'Review Responder', icon: FlaskConical },
      { to: '/labs/gap-finder', label: 'Gap Finder', icon: FlaskConical },
    ],
  },
];

export default function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  // find current page label for the top bar
  const current = NAV.flatMap(g => g.items).find(i =>
    location.pathname === i.to || location.pathname.startsWith(i.to + '/'));

  return (
    <div className="min-h-screen bg-[#f0f4f9]">
      {/* ── Top bar ── */}
      <header className="sticky top-0 z-50 h-13 bg-[#1a4a7a] flex items-center px-4 gap-3" style={{ height: 52 }}>
        <button
          className="lg:hidden text-white/80 hover:text-white p-1"
          onClick={() => setSidebarOpen(o => !o)}
          aria-label="Toggle menu">
          {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
        <Link to="/" className="text-white hover:opacity-90 flex items-center" style={{ color: '#fff' }}><IglooLogo width={62} title="igloo — dashboard" /></Link>
        <span className="text-white/40 text-sm hidden sm:inline">/</span>
        <span className="text-white/70 text-sm font-medium hidden sm:inline">{current?.label || 'Dashboard'}</span>
        <div className="flex-1" />
        <Link
          to="/"
          className="text-white/80 hover:text-white hover:bg-white/10 text-xs font-semibold px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-colors">
          <LayoutDashboard className="w-3.5 h-3.5" />
          Dashboard
        </Link>
      </header>

      <div className="flex">
        {/* ── Sidebar ── */}
        <aside
          className={`
            fixed lg:sticky top-[52px] z-40 h-[calc(100vh-52px)] w-60 shrink-0
            bg-white border-r border-[#d4e2ef] overflow-y-auto
            transition-transform duration-200
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0
          `}>
          <nav className="py-4">
            {NAV.map(group => (
              <div key={group.group} className="mb-5">
                <div className="px-5 mb-1.5 text-[10px] font-bold uppercase tracking-[1.8px] text-[#9ab0c5]">
                  {group.group}
                </div>
                {group.items.map(item => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={() => setSidebarOpen(false)}
                      className={({ isActive }) => `
                        flex items-center gap-2.5 px-5 py-2 text-[13px] font-medium
                        border-l-[3px] transition-colors
                        ${isActive
                          ? 'border-[#1a4a7a] bg-[#eef3f9] text-[#0d2850] font-semibold'
                          : 'border-transparent text-[#5a7a9a] hover:bg-[#f0f4f9] hover:text-[#0d2850]'}
                      `}>
                      <Icon className="w-4 h-4 shrink-0" />
                      {item.label}
                    </NavLink>
                  );
                })}
              </div>
            ))}
          </nav>
        </aside>

        {/* mobile backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 top-[52px] z-30 bg-black/20 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* ── Page content ── */}
        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
