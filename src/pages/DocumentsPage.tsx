import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { User } from '@supabase/supabase-js';
import { AdminAuth } from '../components/AdminAuth';
import { AdminReports } from '../components/AdminReports';
import { OwnerManagement } from '../components/OwnerManagement';
import { Loader2, FileStack, FileText, Users, LogOut, ArrowLeft, ChevronRight } from 'lucide-react';

const ADMIN_EMAIL = 'nick@igloo.scot';

type Tab = 'reports' | 'owners';

function DocumentsView({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const [activeTab, setActiveTab] = useState<Tab>('reports');

  const tabs: { id: Tab; label: string; icon: React.ElementType; description: string }[] = [
    { id: 'reports', label: 'Generated Reports', icon: FileText, description: 'All property reports and files' },
    { id: 'owners', label: 'Owner Access', icon: Users, description: 'Manage owner portal access' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <a
                href="/"
                className="flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors text-slate-600 hover:text-slate-900 flex-shrink-0"
                title="Back to Director Portal"
              >
                <ArrowLeft className="w-4 h-4" />
              </a>

              <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                <FileStack className="w-4 h-4 text-white" />
              </div>
              <div className="hidden sm:block">
                <p className="text-base font-bold text-slate-900 leading-none">Document Manager</p>
                <p className="text-xs text-slate-500 mt-0.5">{user.email}</p>
              </div>

              <div className="hidden md:flex items-center gap-0.5 ml-4 bg-slate-100 rounded-lg p-1">
                {tabs.map(tab => {
                  const Icon = tab.icon;
                  const active = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-md transition-all ${
                        active
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700 hover:bg-white/60'
                      }`}
                    >
                      <Icon className={`w-4 h-4 ${active ? 'text-blue-600' : ''}`} />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              onClick={onSignOut}
              className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 px-3 py-2 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>

          <div className="md:hidden flex gap-0.5 pb-2">
            {tabs.map(tab => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 text-sm font-semibold rounded-md transition-all ${
                    active
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <nav className="flex items-center gap-1.5 text-xs text-slate-400">
          <a href="/" className="font-medium text-slate-500 hover:text-slate-700 transition-colors">Director Portal</a>
          <ChevronRight className="w-3 h-3" />
          <span className="font-medium text-slate-500">Document Manager</span>
          <ChevronRight className="w-3 h-3" />
          <span className="font-semibold text-slate-700">
            {tabs.find(t => t.id === activeTab)?.label}
          </span>
        </nav>
      </div>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 pb-12">
        {activeTab === 'reports' ? <AdminReports /> : <OwnerManagement />}
      </main>
    </div>
  );
}

export default function DocumentsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null;
      setUser(u?.email === ADMIN_EMAIL ? u : null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      const u = session?.user ?? null;
      setUser(u?.email === ADMIN_EMAIL ? u : null);
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

  return <DocumentsView user={user} onSignOut={handleSignOut} />;
}
