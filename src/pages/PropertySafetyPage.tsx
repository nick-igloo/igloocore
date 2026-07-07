import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';
import { getSignedUrl } from '../lib/reportStorage';
import { GeneratedReport, SafetyDocumentType } from '../types';

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
import { ShieldCheck, FileText, Loader2, AlertCircle, Calendar, ExternalLink, ArrowLeft, Building2, Zap, Flame, FileCheck, BadgeCheck, Bell, CheckCircle2, Droplets, RefreshCw } from 'lucide-react';

type STLCheck = {
  id: string;
  checked_at: string;
  property_name: string;
  fire_checked_by: string | null;
  maintenance_notes: string | null;
};


type DocCategory = {
  type: SafetyDocumentType;
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  border: string;
  iconBg: string;
};

const DOC_CATEGORIES: DocCategory[] = [
  {
    type: 'stl_licence',
    label: 'STL Licence',
    description: 'Short-term let licence document',
    icon: BadgeCheck,
    color: 'text-green-700',
    bg: 'bg-green-50',
    border: 'border-green-200',
    iconBg: 'bg-green-600',
  },
  {
    type: 'eicr',
    label: 'EICR',
    description: 'Electrical Installation Condition Report',
    icon: Zap,
    color: 'text-green-700',
    bg: 'bg-green-50',
    border: 'border-green-200',
    iconBg: 'bg-green-600',
  },
  {
    type: 'pat',
    label: 'PAT Certificate',
    description: 'Portable Appliance Testing certificate',
    icon: Zap,
    color: 'text-green-700',
    bg: 'bg-green-50',
    border: 'border-green-200',
    iconBg: 'bg-green-600',
  },
  {
    type: 'gas_safety',
    label: 'Gas Safety',
    description: 'Gas Safety Record / Certificate',
    icon: Flame,
    color: 'text-green-700',
    bg: 'bg-green-50',
    border: 'border-green-200',
    iconBg: 'bg-green-600',
  },
  {
    type: 'other',
    label: 'Other Documents',
    description: 'Additional compliance documents',
    icon: FileText,
    color: 'text-green-700',
    bg: 'bg-green-50',
    border: 'border-green-200',
    iconBg: 'bg-green-600',
  },
];

function slugToPropertyName(slug: string): string {
  return slug.replace(/-/g, ' ');
}

export default function PropertySafetyPage() {
  const { propertySlug } = useParams<{ propertySlug: string }>();
  const [documents, setDocuments] = useState<GeneratedReport[]>([]);
  const [stlChecks, setStlChecks] = useState<STLCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [propertyName, setPropertyName] = useState<string>('');
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [showAllFireTests, setShowAllFireTests] = useState(false);

  useEffect(() => {
    if (propertySlug) fetchAll(propertySlug);
  }, [propertySlug]);

  useEffect(() => {
    if (propertyName) {
      document.title = `${propertyName} — Safety Compliance`;
    }
  }, [propertyName]);

  const fetchAll = async (slug: string) => {
    setLoading(true);
    setError(null);
    try {
      const slugNorm = slug.toLowerCase().replace(/-/g, ' ').trim();

      // Find the canonical property from the properties table using exact match
      const { data: properties } = await publicSupabase
        .from('properties')
        .select('id, name')
        .ilike('name', slugNorm);

      const property = properties && properties.length > 0 ? properties[0] : null;

      if (property) {
        setPropertyId(property.id);
        setPropertyName(property.name);
      }

      // Fetch documents and STL checks filtered by property
      const [docsRes, checksRes] = await Promise.all([
        publicSupabase
          .from('generated_reports')
          .select('*')
          .eq('is_safety_document', true)
          .order('created_at', { ascending: false }),
        publicSupabase
          .from('property_safety_checks')
          .select('id, property_id, property_name, performed_at, performed_by_name, notes')
          .eq('check_type', 'fire_alarm')
          .order('performed_at', { ascending: false })
      ]);

      if (docsRes.error) throw docsRes.error;
      if (checksRes.error) throw checksRes.error;

      const allDocs = docsRes.data || [];
      const allChecks: STLCheck[] = (checksRes.data || []).map((c: {
        id: string;
        property_id: string | null;
        property_name: string;
        performed_at: string;
        performed_by_name: string;
        notes: string | null;
      }) => ({
        id: c.id,
        checked_at: c.performed_at,
        property_name: c.property_name,
        fire_checked_by: c.performed_by_name,
        maintenance_notes: c.notes ?? '',
      }));

      // ROBUST matching: prioritize property_id, then exact name match only
      let matchedDocs: typeof allDocs = [];
      let matchedChecks: typeof allChecks = [];

      if (property) {
        // Match by property_id first (most reliable)
        matchedDocs = allDocs.filter(d => d.property_id === property.id);

        // If no ID matches, fall back to exact case-insensitive name match only
        if (matchedDocs.length === 0) {
          matchedDocs = allDocs.filter(d =>
            d.property_name.toLowerCase().trim() === property.name.toLowerCase().trim()
          );
        }

        // Same for STL checks - exact match on property name only
        matchedChecks = allChecks.filter(c =>
          c.property_name.toLowerCase().trim() === property.name.toLowerCase().trim()
        );
      } else {
        // No property found in master table - try exact match on slug
        matchedDocs = allDocs.filter(d =>
          d.property_name.toLowerCase().trim() === slugNorm
        );
        matchedChecks = allChecks.filter(c =>
          c.property_name.toLowerCase().trim() === slugNorm
        );

        // Set property name from matched data or slug
        if (matchedDocs.length > 0) {
          setPropertyName(matchedDocs[0].property_name);
        } else if (matchedChecks.length > 0) {
          setPropertyName(matchedChecks[0].property_name);
        } else {
          setPropertyName(slugToPropertyName(slug));
        }
      }

      setDocuments(matchedDocs);
      setStlChecks(matchedChecks);
    } catch (err: any) {
      setError('Unable to load safety documents. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = async (doc: GeneratedReport) => {
    setOpeningId(doc.id);
    try {
      const url = await getSignedUrl(doc.storage_path);
      if (!url) throw new Error('Could not generate link');

      if (doc.file_name.endsWith('.html')) {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch file');
        const htmlContent = await response.text();
        const blob = new Blob([htmlContent], { type: 'text/html' });
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, '_blank', 'noopener,noreferrer');
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch {
      setError('Failed to open document. Please try again.');
    } finally {
      setOpeningId(null);
    }
  };


  const uncategorised = documents.filter(d => !d.safety_document_type || d.safety_document_type === 'other');
  const hasAnyDocs = documents.length > 0;
  const hasChecks = stlChecks.length > 0;
  const latestCheck = stlChecks[0] ?? null;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-[#1e5a8e] text-white shadow-lg">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="mb-6">
            <img
              src="/logo.svg"
              alt="Igloo Holiday Homes"
              className="h-12 w-auto brightness-0 invert"
            />
          </div>
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0 backdrop-blur-sm">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">
                {loading ? 'Loading...' : propertyName || 'Property'}
              </h1>
              <p className="text-white/80 mt-1 text-sm leading-relaxed">
                Safety and compliance documents for this property.
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="bg-[#2c74b3] text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center gap-2 text-sm">
            <ShieldCheck className="w-4 h-4 opacity-80 flex-shrink-0" />
            <span className="opacity-90">
              Documents published for short-term let licence compliance verification.
            </span>
          </div>
        </div>
      </div>

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-8">
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
                onClick={() => propertySlug && fetchAll(propertySlug)}
                className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-red-700 hover:text-red-900 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Try again
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Compliance document categories */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-slate-800">Compliance Documents</h2>
                <button
                  onClick={() => propertySlug && fetchAll(propertySlug)}
                  className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-700 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  Refresh
                </button>
              </div>

              {!hasAnyDocs ? (
                <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
                  <ShieldCheck className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500 text-sm font-medium">No compliance documents published yet.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {DOC_CATEGORIES.map(cat => {
                    const docs = cat.type === 'other'
                      ? documents.filter(d => !d.safety_document_type || d.safety_document_type === 'other')
                      : documents.filter(d => d.safety_document_type === cat.type);

                    if (docs.length === 0 && cat.type !== 'stl_licence' && cat.type !== 'eicr' && cat.type !== 'pat' && cat.type !== 'gas_safety') {
                      if (uncategorised.length === 0) return null;
                    }

                    const Icon = cat.icon;
                    const hasDoc = docs.length > 0;
                    const latest = docs[0] ?? null;

                    return (
                      <div
                        key={cat.type}
                        className={`rounded-2xl border-2 overflow-hidden transition-all ${
                          hasDoc ? `${cat.border} ${cat.bg}` : 'border-slate-200 bg-white'
                        }`}
                      >
                        <div className="px-5 py-4">
                          <div className="flex items-start gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${hasDoc ? cat.iconBg : 'bg-slate-200'}`}>
                              <Icon className="w-5 h-5 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className={`text-sm font-bold ${hasDoc ? cat.color : 'text-slate-500'}`}>{cat.label}</h3>
                                {hasDoc ? (
                                  <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full">
                                    <CheckCircle2 className="w-3 h-3" />
                                    On file
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 bg-slate-100 text-slate-400 rounded-full">
                                    Not uploaded
                                  </span>
                                )}
                              </div>
                              <p className={`text-xs mt-0.5 ${hasDoc ? cat.color + ' opacity-70' : 'text-slate-400'}`}>{cat.description}</p>
                            </div>
                          </div>

                          {hasDoc && (
                            <div className="mt-4 space-y-2">
                              {docs.map(doc => {
                                const isOpening = openingId === doc.id;
                                const expiryDate = doc.expiry_date
                                  ? new Date(doc.expiry_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                                  : null;
                                return (
                                  <div key={doc.id} className="bg-white/70 rounded-xl px-3 py-2.5 border border-white/60">
                                    <div className="flex items-center gap-3">
                                      <FileText className={`w-4 h-4 flex-shrink-0 ${cat.color}`} />
                                      <div className="flex-1 min-w-0">
                                        {doc.uploaded_file_type && (
                                          <p className="text-xs font-medium text-slate-700 mb-0.5">{doc.uploaded_file_type}</p>
                                        )}
                                        {expiryDate && (
                                          <div className="flex items-center gap-1">
                                            <Calendar className="w-3 h-3 text-slate-400" />
                                            <span className="text-xs text-slate-400">Expires {expiryDate}</span>
                                          </div>
                                        )}
                                      </div>
                                      <button
                                        onClick={() => handleOpen(doc)}
                                        disabled={isOpening}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 flex-shrink-0 ${cat.iconBg} hover:opacity-90`}
                                      >
                                        {isOpening ? (
                                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                          <ExternalLink className="w-3.5 h-3.5" />
                                        )}
                                        <span className="hidden sm:inline">Open</span>
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Fire Alarm Tests */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-[#1e5a8e] rounded-lg flex items-center justify-center flex-shrink-0">
                  <Bell className="w-4 h-4 text-white" />
                </div>
                <h2 className="text-base font-bold text-slate-800">Fire Alarm Tests</h2>
                {hasChecks && latestCheck && (
                  <span className="ml-auto text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">
                    Last test: {new Date(latestCheck.checked_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </span>
                )}
              </div>

              {!hasChecks ? (
                <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
                  <Bell className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500 text-sm font-medium">No fire alarm test records found.</p>
                </div>
              ) : (
                <>
                  {/* Most Recent Test - Featured */}
                  {latestCheck && latestCheck.fire_checked_by && (
                    <div className="bg-gradient-to-br from-rose-50 to-orange-50 rounded-2xl border-2 border-rose-200 shadow-sm overflow-hidden mb-4">
                      <div className="px-6 py-5">
                        <div className="flex items-start gap-4">
                          <div className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 bg-rose-600 shadow-lg">
                            <Bell className="w-7 h-7 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-2">
                              <span className="text-lg font-bold text-rose-900">Most Recent Test</span>
                              <span className="text-xs font-semibold px-2.5 py-1 bg-rose-600 text-white rounded-full">Latest</span>
                            </div>
                            <div className="flex items-center gap-2 mb-4">
                              <Calendar className="w-4 h-4 text-rose-700" />
                              <span className="text-sm font-semibold text-rose-800">
                                {new Date(latestCheck.checked_at).toLocaleDateString('en-GB', {
                                  day: 'numeric', month: 'long', year: 'numeric'
                                })}
                              </span>
                            </div>
                            <div className="bg-white rounded-xl px-4 py-3 border border-rose-200">
                              <p className="text-sm font-semibold text-rose-900 mb-1">Fire alarms and emergency lights checked</p>
                              <p className="text-sm text-rose-700">Property: <span className="font-bold">{latestCheck.property_name}</span></p>
                              <p className="text-sm text-rose-700">Tested by: <span className="font-bold">{latestCheck.fire_checked_by}</span></p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Previous Tests — deduplicated by day, excluding the latest test's day */}
                  {(() => {
                    const latestDate = latestCheck
                      ? new Date(latestCheck.checked_at).toDateString()
                      : null;
                    const seen = new Set<string>();
                    const previous = stlChecks
                      .filter(c => c.fire_checked_by)
                      .filter(c => {
                        const day = new Date(c.checked_at).toDateString();
                        if (day === latestDate) return false;
                        if (seen.has(day)) return false;
                        seen.add(day);
                        return true;
                      });
                    if (previous.length === 0) return null;
                    return (
                      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
                          <h3 className="text-sm font-bold text-slate-700">Previous Tests</h3>
                        </div>
                        <div className="divide-y divide-slate-100">
                          {previous
                            .slice(0, showAllFireTests ? undefined : 10)
                            .map((check) => {
                              const checkDate = new Date(check.checked_at).toLocaleDateString('en-GB', {
                                day: 'numeric', month: 'short', year: 'numeric'
                              });

                              return (
                                <div key={check.id} className="px-4 py-3 hover:bg-slate-50 transition-colors">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-rose-100">
                                      <Bell className="w-4 h-4 text-rose-600" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 text-xs text-slate-500 mb-0.5">
                                        <Calendar className="w-3 h-3" />
                                        <span>{checkDate}</span>
                                      </div>
                                      <p className="text-sm text-slate-700 mb-0.5">
                                        <span className="font-semibold text-slate-900">{check.property_name}</span>
                                      </p>
                                      <p className="text-xs text-slate-600">
                                        Tested by {check.fire_checked_by}
                                      </p>
                                    </div>
                                    <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                        {previous.length > 10 && !showAllFireTests && (
                          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50">
                            <button
                              onClick={() => setShowAllFireTests(true)}
                              className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-[#1e5a8e] hover:text-[#2c74b3] transition-colors"
                            >
                              Load more tests ({previous.length - 10} more)
                            </button>
                          </div>
                        )}
                        {showAllFireTests && (
                          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50">
                            <button
                              onClick={() => setShowAllFireTests(false)}
                              className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-800 transition-colors"
                            >
                              Show less
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </>
              )}
            </section>

          </>
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
