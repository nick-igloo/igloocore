import { NavLink } from 'react-router-dom';
import { Home, ListChecks, AlertOctagon } from 'lucide-react';

export function TurnoverNav({ openCount = 0, issueCount = 0 }: { openCount?: number; issueCount?: number }) {
  const base = 'flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold transition-colors';
  const idle = 'text-slate-400';
  const active = 'text-teal-700';

  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-slate-200 shadow-[0_-4px_16px_rgba(15,23,42,0.05)]">
      <div className="max-w-3xl mx-auto flex items-stretch">
        <NavLink to="/guest-ready" className={({ isActive }) => `${base} ${isActive ? active : idle}`} end>
          <Home className="w-5 h-5" />
          Guest Ready
        </NavLink>
        <NavLink to="/turnover/tasks" className={({ isActive }) => `${base} ${isActive ? active : idle}`}>
          <div className="relative">
            <ListChecks className="w-5 h-5" />
            {openCount > 0 && (
              <span className="absolute -top-1.5 -right-2 bg-amber-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-[16px] px-1 flex items-center justify-center">
                {openCount > 9 ? '9+' : openCount}
              </span>
            )}
          </div>
          Tasks
        </NavLink>
        <NavLink to="/turnover/issues" className={({ isActive }) => `${base} ${isActive ? active : idle}`}>
          <div className="relative">
            <AlertOctagon className="w-5 h-5" />
            {issueCount > 0 && (
              <span className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-[16px] px-1 flex items-center justify-center">
                {issueCount > 9 ? '9+' : issueCount}
              </span>
            )}
          </div>
          Issues
        </NavLink>
      </div>
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}
