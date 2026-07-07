import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';
import { GeneratedReport, SafetyDocumentType } from '../types';

type FireCheck = {
  id: string;
  property_name: string;
  performed_at: string;
  performed_by_name: string;
  result: string;
};

const publicSupabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    }
  }
);
import {
  ShieldCheck, Loader2, AlertCircle,
  Building2, RefreshCw, ChevronRight,
  BadgeCheck, Zap, FileCheck, Flame, FileText, Bell
} from 'lucide-react';

interface PropertyGroup {
  propertyName: string;
  documents: GeneratedReport[];
  hasFireAlarmTests: boolean;
  latestTestResult: string | null;
}

function propertyNameToSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

const DOC_TYPE_TAGS: Record<SafetyDocumentType, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  stl_licence: { label: 'STL', icon: BadgeCheck, color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
  eicr: { label: 'EICR', icon: Zap, color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
  pat: { label: 'PAT', icon: FileCheck, color: 'text-sky-700', bg: 'bg-sky-50 border-sky-200' },
  gas_safety: { label: 'Gas Safety', icon: Flame, color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200' },
  other: { label: 'Other', icon: FileText, color: 'text-slate-600', bg: 'bg-slate-50 border-slate-200' },
};

export default function SafetyDocumentsPage() {
  const [documents, setDocuments] = useState<GeneratedReport[]>([]);
  const [fireAlarmTests, setFireAlarmTests] = useState<FireCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Safety Compliance — Igloo Properties';
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [docsRes, testsRes] = await Promise.all([
        publicSupabase
          .from('generated_reports')
          .select('*')
          .eq('is_safety_document', true)
          .order('property_name')
          .order('created_at', { ascending: false }),
        publicSupabase
          .from('property_safety_checks')
          .select('id, property_name, performed_at, performed_by_name, result')
          .eq('check_type', 'fire_alarm')
          .order('performed_at', { ascending: false }),
      ]);

      if (docsRes.error) throw docsRes.error;
      if (testsRes.error) throw testsRes.error;

      setDocuments(docsRes.data || []);
      setFireAlarmTests(testsRes.data || []);
    } catch (err: any) {
      setError('Unable to load safety documents. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const propertyGroups: PropertyGroup[] = (() => {
    const byProp: Record<string, GeneratedReport[]> = {};
    documents.forEach(d => {
      if (!byProp[d.property_name]) byProp[d.property_name] = [];
      byProp[d.property_name].push(d);
    });

    const docProperties = new Set(Object.keys(byProp));

    fireAlarmTests.forEach(t => {
      if (!docProperties.has(t.property_name)) {
        byProp[t.property_name] = [];
      }
    });

    return Object.entries(byProp).map(([propertyName, docs]) => {
      const propNorm = propertyName.toLowerCase();
      const tests = fireAlarmTests.filter(t => {
        const testNorm = t.property_name.toLowerCase();
        return testNorm === propNorm ||
               testNorm.includes(propNorm) ||
               propNorm.includes(testNorm);
      });
      return {
        propertyName,
        documents: docs,
        hasFireAlarmTests: tests.length > 0,
        latestTestResult: tests[0]?.result ?? null,
      };
    }).sort((a, b) => a.propertyName.localeCompare(b.propertyName));
  })();

  const isEmpty = propertyGroups.length === 0;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Safety Documents</h1>
              <p className="text-slate-500 mt-1 text-sm leading-relaxed">
                Public safety and compliance documentation for all managed properties.
                These documents are provided in accordance with short-term let licence requirements.
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="bg-emerald-700 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center gap-2 text-sm">
            <ShieldCheck className="w-4 h-4 opacity-80 flex-shrink-0" />
            <span className="opacity-90">
              All documents on this page are publicly accessible for licence compliance verification.
            </span>
          </div>
        </div>
      </div>

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
            <p className="text-slate-500 text-sm">Loading safety documents...</p>
          </div>
        ) : error ? (
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-5">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-red-800 font-semibold text-sm">Error loading documents</p>
              <p className="text-red-600 text-sm mt-0.5">{error}</p>
              <button
                onClick={fetchAll}
                className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-red-700 hover:text-red-900 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Try again
              </button>
            </div>
          </div>
        ) : isEmpty ? (
          <div className="text-center py-24">
            <div className="w-20 h-20 bg-slate-200 rounded-full flex items-center justify-center mx-auto mb-5">
              <ShieldCheck className="w-10 h-10 text-slate-400" />
            </div>
            <h2 className="text-xl font-semibold text-slate-800 mb-2">No safety documents yet</h2>
            <p className="text-slate-500 text-sm">Safety documents will appear here once they have been published.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">
                {propertyGroups.length} {propertyGroups.length !== 1 ? 'properties' : 'property'} &middot; {documents.length} total document{documents.length !== 1 ? 's' : ''}
              </p>
              <button
                onClick={fetchAll}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-700 transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Refresh
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">
              {propertyGroups.map(({ propertyName, documents: docs, hasFireAlarmTests, latestTestResult }) => {
                const presentTypes = new Set(
                  docs.map(d => d.safety_document_type).filter(Boolean) as SafetyDocumentType[]
                );

                return (
                  <Link
                    key={propertyName}
                    to={`/safety/${propertyNameToSlug(propertyName)}`}
                    className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50 transition-colors group"
                  >
                    <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center flex-shrink-0 border border-emerald-200 group-hover:bg-emerald-100 transition-colors">
                      <Building2 className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-900 truncate">{propertyName}</p>
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        {presentTypes.size > 0
                          ? Array.from(presentTypes).map(type => {
                              const tag = DOC_TYPE_TAGS[type];
                              const TagIcon = tag.icon;
                              return (
                                <span
                                  key={type}
                                  className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded border ${tag.color} ${tag.bg}`}
                                >
                                  <TagIcon className="w-3 h-3" />
                                  {tag.label}
                                </span>
                              );
                            })
                          : docs.length > 0 && (
                              <span className="text-xs text-slate-400">
                                {docs.length} document{docs.length !== 1 ? 's' : ''}
                              </span>
                            )
                        }
                        {hasFireAlarmTests && (
                          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded border ${
                            latestTestResult === 'pass'
                              ? 'text-rose-700 bg-rose-50 border-rose-200'
                              : 'text-red-700 bg-red-50 border-red-200'
                          }`}>
                            <Bell className="w-3 h-3" />
                            Fire Alarm Log
                          </span>
                        )}
                        {docs.length === 0 && !hasFireAlarmTests && (
                          <span className="text-xs text-slate-400">No documents uploaded</span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-700 flex-shrink-0 transition-colors" />
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white mt-auto">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span>These documents are maintained for public licence compliance. For queries, please contact the property manager.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
