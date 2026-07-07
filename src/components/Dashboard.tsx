import React, { useEffect, useState } from 'react';
import { LogOut, ExternalLink, Loader2, Settings, Home, ChevronRight } from 'lucide-react';
import * as Icons from 'lucide-react';
import { supabase, Project } from '../lib/supabase';
import { User } from '@supabase/supabase-js';
import { quickAccessCards, colorClasses, applyPrefs, DashboardPrefs } from '../lib/dashboardCards';

interface DashboardProps {
  user: User | null;
  onSignOut: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ user, onSignOut }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<DashboardPrefs | null>(null);

  useEffect(() => {
    fetchAll();
  }, [user?.id]);

  const fetchAll = async () => {
    try {
      const [projectsRes, prefsRes] = await Promise.all([
        supabase.from('projects').select('*').eq('is_active', true).order('display_order'),
        user?.id
          ? supabase
              .from('director_dashboard_prefs')
              .select('hidden_cards, card_order')
              .eq('user_id', user.id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      if (projectsRes.error) throw projectsRes.error;
      setProjects(projectsRes.data || []);
      if (prefsRes && !prefsRes.error) {
        setPrefs(prefsRes.data as DashboardPrefs | null);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getIcon = (iconName: string) => {
    const Icon = (Icons as any)[iconName] || Icons.FolderOpen;
    return <Icon className="w-8 h-8" />;
  };

  const handleProjectClick = (url: string) => {
    if (url.startsWith('http')) {
      window.open(url, '_blank');
    } else {
      window.location.href = url;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading your projects...</p>
        </div>
      </div>
    );
  }

  const visibleCards = applyPrefs(quickAccessCards, prefs);
  const hasAny = projects.length > 0 || visibleCards.length > 0;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                <Icons.Building2 className="w-5 h-5 text-white" />
              </div>
              <div className="hidden sm:block">
                <p className="text-base font-bold text-slate-900 leading-none">Director Portal</p>
                <p className="text-xs text-slate-500 mt-0.5">{user?.email}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <a
                href="/settings"
                className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 px-3 py-2 rounded-lg transition-colors"
              >
                <Settings className="w-4 h-4" />
                <span className="hidden sm:inline">Settings</span>
              </a>
              <a
                href="/owner"
                className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 px-3 py-2 rounded-lg transition-colors"
              >
                <Home className="w-4 h-4" />
                <span className="hidden sm:inline">Owner Portal</span>
              </a>
              <button
                onClick={onSignOut}
                className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 px-3 py-2 rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-8 p-4 bg-red-50 text-red-800 border border-red-200 rounded-lg">
            {error}
          </div>
        )}

        {!hasAny ? (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-100 rounded-full mb-4">
              <Icons.FolderOpen className="w-8 h-8 text-slate-400" />
            </div>
            <h2 className="text-xl font-semibold text-slate-800 mb-2">No Projects Available</h2>
            <p className="text-slate-500">Contact your administrator to get access to projects.</p>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <h2 className="text-xl font-bold text-slate-900">Your Projects</h2>
              <p className="text-sm text-slate-500 mt-0.5">Select a project to access</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {projects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => handleProjectClick(project.url)}
                  className="group bg-white rounded-xl shadow-sm hover:shadow-md border border-slate-200 hover:border-blue-300 transition-all p-6 text-left"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-50 group-hover:bg-blue-100 rounded-xl transition-colors text-blue-600">
                      {getIcon(project.icon)}
                    </div>
                    <ExternalLink className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition-colors mt-1" />
                  </div>

                  <h3 className="text-base font-bold text-slate-900 mb-1.5 group-hover:text-blue-600 transition-colors">
                    {project.name}
                  </h3>

                  {project.description && (
                    <p className="text-sm text-slate-500 line-clamp-2">{project.description}</p>
                  )}

                  {project.category && (
                    <div className="mt-4 pt-3 border-t border-slate-100">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                        {project.category}
                      </span>
                    </div>
                  )}
                </button>
              ))}

              {visibleCards.map((card) => {
                const colors = colorClasses[card.color];
                const Icon = card.icon;
                return (
                  <button
                    key={card.id}
                    onClick={() =>
                      card.external ? window.open(card.url, '_blank') : (window.location.href = card.url)
                    }
                    className={`group bg-white rounded-xl shadow-sm hover:shadow-md border border-slate-200 ${colors.border} transition-all p-6 text-left`}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div
                        className={`inline-flex items-center justify-center w-14 h-14 ${colors.bg} ${colors.bgHover} rounded-xl transition-colors ${colors.text}`}
                      >
                        <Icon className="w-8 h-8" />
                      </div>
                      <ChevronRight className={`w-4 h-4 text-slate-300 group-hover:${colors.text} transition-colors mt-1`} />
                    </div>

                    <h3 className={`text-base font-bold text-slate-900 mb-1.5 group-hover:${colors.text} transition-colors`}>
                      {card.name}
                    </h3>

                    <p className="text-sm text-slate-500">{card.description}</p>

                    <div className="mt-4 pt-3 border-t border-slate-100">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors.badge}`}>
                        {card.category}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
};
