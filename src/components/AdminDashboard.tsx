import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { CountUp } from './CountUp';
import {
  Building2, FileText, Users, ShieldAlert, Moon, FileBarChart2,
  Loader2, RefreshCw, AlertCircle, TrendingUp, ClipboardList, ArrowRight, Banknote, PackagePlus, ReceiptText, ClipboardCheck
} from 'lucide-react';

interface Metric {
  metric_key: string;
  metric_value: number;
  metric_label: string;
  metric_sublabel: string | null;
  updated_at: string;
}

const METRIC_ICONS: Record<string, React.FC<{ className?: string }>> = {
  total_properties: Building2,
  total_reports: FileText,
  total_owners: Users,
  safety_docs_expiring: ShieldAlert,
  total_nights: Moon,
  reports_this_month: FileBarChart2,
};

const METRIC_COLORS: Record<string, { bg: string; icon: string; accent: string }> = {
  total_properties:    { bg: 'bg-sky-50',     icon: 'text-sky-600',     accent: 'border-sky-200' },
  total_reports:       { bg: 'bg-blue-50',    icon: 'text-blue-600',    accent: 'border-blue-200' },
  total_owners:        { bg: 'bg-teal-50',    icon: 'text-teal-600',    accent: 'border-teal-200' },
  safety_docs_expiring:{ bg: 'bg-amber-50',   icon: 'text-amber-600',   accent: 'border-amber-200' },
  total_nights:        { bg: 'bg-slate-50',   icon: 'text-slate-600',   accent: 'border-slate-200' },
  reports_this_month:  { bg: 'bg-emerald-50', icon: 'text-emerald-600', accent: 'border-emerald-200' },
};

const KEY_ORDER = [
  'total_properties',
  'total_reports',
  'total_owners',
  'reports_this_month',
  'total_nights',
  'safety_docs_expiring',
];

export const AdminDashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [animKey, setAnimKey] = useState(0);

  const fetchFromDB = async () => {
    const { data, error } = await supabase.from('dashboard_data').select('*');
    if (error) throw error;
    return (data || []) as Metric[];
  };

  const refreshStats = async (showSpinner = true) => {
    if (showSpinner) setRefreshing(true);
    setError(null);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-dashboard-stats`,
        {
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
        }
      );
      if (!res.ok) throw new Error('Failed to refresh stats');
      const freshMetrics = await fetchFromDB();
      setMetrics(freshMetrics);
      setLastUpdated(new Date());
      setAnimKey(k => k + 1);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const cached = await fetchFromDB();
        const hasData = cached.some(m => m.metric_value > 0);
        if (hasData) {
          setMetrics(cached);
          setLastUpdated(new Date(cached[0]?.updated_at ?? Date.now()));
          setAnimKey(1);
          setLoading(false);
          refreshStats(false);
        } else {
          setLoading(false);
          await refreshStats(false);
        }
      } catch (err: any) {
        setError(err.message);
        setLoading(false);
      }
    })();
  }, []);

  const orderedMetrics = KEY_ORDER
    .map(k => metrics.find(m => m.metric_key === k))
    .filter(Boolean) as Metric[];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-blue-600" />
          <h2 className="text-xl font-bold text-slate-800">Overview</h2>
          {lastUpdated && (
            <span className="text-xs text-slate-400 ml-1">
              Updated {lastUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        <button
          onClick={() => refreshStats()}
          disabled={refreshing}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 font-medium transition-colors px-3 py-2 rounded-lg hover:bg-slate-100 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-2">
        <a
          href="/booking-processor"
          className="group flex items-center gap-4 bg-white border border-slate-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-md transition-all"
        >
          <div className="w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-700 transition-colors">
            <ClipboardList className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-800">Booking Processor</p>
            <p className="text-xs text-slate-400 mt-0.5">Upload CSV &amp; generate settlement reports</p>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
        </a>

        <a
          href="/settlement-converter"
          className="group flex items-center gap-4 bg-white border border-slate-200 rounded-xl p-4 hover:border-teal-300 hover:shadow-md transition-all"
        >
          <div className="w-11 h-11 rounded-xl bg-teal-600 flex items-center justify-center flex-shrink-0 group-hover:bg-teal-700 transition-colors">
            <Banknote className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-800">Settlement Converter</p>
            <p className="text-xs text-slate-400 mt-0.5">Convert PDFs to bank payment CSV</p>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-teal-500 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
        </a>

        <a
          href="/settlement-generator"
          className="group flex items-center gap-4 bg-white border border-slate-200 rounded-xl p-4 hover:border-orange-300 hover:shadow-md transition-all"
        >
          <div className="w-11 h-11 rounded-xl bg-orange-500 flex items-center justify-center flex-shrink-0 group-hover:bg-orange-600 transition-colors">
            <ReceiptText className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-800">Settlement Generator</p>
            <p className="text-xs text-slate-400 mt-0.5">Upload CSVs &amp; generate owner settlements</p>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-orange-500 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
        </a>

        <a
          href="/stl-checks-import"
          className="group flex items-center gap-4 bg-white border border-slate-200 rounded-xl p-4 hover:border-green-300 hover:shadow-md transition-all"
        >
          <div className="w-11 h-11 rounded-xl bg-green-600 flex items-center justify-center flex-shrink-0 group-hover:bg-green-700 transition-colors">
            <ClipboardCheck className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-800">STL Checks Import</p>
            <p className="text-xs text-slate-400 mt-0.5">Import fire alarm &amp; legionella checks</p>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-green-500 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
        </a>

        <button
          onClick={() => window.dispatchEvent(new CustomEvent('admin-nav', { detail: 'onboarding' }))}
          className="group flex items-center gap-4 bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 hover:shadow-md transition-all text-left"
        >
          <div className="w-11 h-11 rounded-xl bg-slate-700 flex items-center justify-center flex-shrink-0 group-hover:bg-slate-800 transition-colors">
            <PackagePlus className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-800">Setup & Onboarding</p>
            <p className="text-xs text-slate-400 mt-0.5">Manage properties, owners &amp; mappings</p>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-slate-600 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {orderedMetrics.map((metric) => {
          const Icon = METRIC_ICONS[metric.metric_key] ?? FileText;
          const colors = METRIC_COLORS[metric.metric_key] ?? {
            bg: 'bg-slate-50', icon: 'text-slate-600', accent: 'border-slate-200'
          };
          const isWarning = metric.metric_key === 'safety_docs_expiring' && metric.metric_value > 0;

          return (
            <div
              key={metric.metric_key}
              className={`relative rounded-xl border p-5 transition-shadow hover:shadow-md ${
                isWarning ? 'bg-amber-50 border-amber-300' : `${colors.bg} ${colors.accent}`
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                  isWarning ? 'bg-amber-100' : 'bg-white shadow-sm'
                }`}>
                  <Icon className={`w-4.5 h-4.5 ${isWarning ? 'text-amber-600' : colors.icon}`} />
                </div>
                {isWarning && (
                  <span className="text-xs font-semibold px-2 py-0.5 bg-amber-200 text-amber-800 rounded-full">
                    Action needed
                  </span>
                )}
              </div>
              <div className={`text-3xl font-bold tracking-tight mb-1 ${
                isWarning ? 'text-amber-900' : 'text-slate-800'
              }`}>
                <CountUp key={`${metric.metric_key}-${animKey}`} to={metric.metric_value} />
              </div>
              <div className={`text-sm font-semibold ${isWarning ? 'text-amber-800' : 'text-slate-700'}`}>
                {metric.metric_label}
              </div>
              {metric.metric_sublabel && (
                <div className={`text-xs mt-0.5 ${isWarning ? 'text-amber-600' : 'text-slate-400'}`}>
                  {metric.metric_sublabel}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
