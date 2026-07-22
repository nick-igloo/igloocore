import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Home,
  Users,
  Landmark,
  BadgePoundSterling,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Search,
  Shield,
  PackagePlus,
  Wand2,
} from 'lucide-react';
import {
  getProperties,
  updatePropertyOps,
  getSettlementConfig,
  updateSettlementConfig,
  invalidatePropertiesCache,
  type Property,
  type WelcomePackSize,
} from '../lib/properties';
import { OwnerManagement } from '../components/OwnerManagement';
import BankSettingsModal from '../components/BankSettingsModal';
import { DirectorAccess } from '../components/DirectorAccess';
import OnboardingPage from './OnboardingPage';
import NewPropertyWizard from './NewPropertyWizard';

type TabKey =
  | 'properties'
  | 'owners'
  | 'onboard'
  | 'bank'
  | 'pricing'
  | 'access'
  | 'setup';

interface Tab {
  key: TabKey;
  label: string;
  icon: React.ElementType;
  blurb: string;
}

const TABS: Tab[] = [
  { key: 'properties', label: 'Properties', icon: Home, blurb: 'Names, cleaners, prices, welcome packs, rules' },
  { key: 'owners', label: 'Owners', icon: Users, blurb: 'Owner accounts, approvals, portal access' },
  { key: 'onboard', label: 'Onboard Property', icon: Wand2, blurb: 'Step-by-step wizard for adding a new property' },
  { key: 'bank', label: 'Bank & Mapping', icon: Landmark, blurb: 'Owner bank details and property mapping' },
  { key: 'pricing', label: 'Pricing', icon: BadgePoundSterling, blurb: 'Welcome pack prices and settlement defaults' },
  { key: 'access', label: 'User Access', icon: Shield, blurb: 'Director accounts and project permissions' },
  { key: 'setup', label: 'Setup', icon: PackagePlus, blurb: 'Initial onboarding and data imports' },
];

interface TabGroup {
  label: string;
  keys: TabKey[];
}

const TAB_GROUPS: TabGroup[] = [
  { label: 'Portfolio', keys: ['properties', 'owners', 'onboard'] },
  { label: 'Money', keys: ['bank', 'pricing'] },
  { label: 'System', keys: ['access', 'setup'] },
];

export default function Settings() {
  const [tab, setTab] = useState<TabKey>(() => {
    const hash = window.location.hash.replace('#', '');
    return TABS.some(t => t.key === hash) ? (hash as TabKey) : 'properties';
  });

  useEffect(() => {
    window.location.hash = tab;
  }, [tab]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg p-2 transition-colors"
              aria-label="Back to dashboard"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-base font-bold text-slate-900 leading-none">Settings</h1>
              <p className="text-xs text-slate-500 mt-0.5">Single source of truth for properties, owners and operations</p>
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-3 overflow-x-auto">
          <nav className="flex items-end gap-4">
            {TAB_GROUPS.map((group, i) => (
              <div key={group.label} className="flex items-end gap-3">
                {i > 0 && <div className="w-px h-8 bg-slate-200 mb-1" />}
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 px-1">
                    {group.label}
                  </div>
                  <div className="flex gap-1">
                    {group.keys.map(key => {
                      const t = TABS.find(tb => tb.key === key)!;
                      const Icon = t.icon;
                      const active = t.key === tab;
                      return (
                        <button
                          key={t.key}
                          onClick={() => setTab(t.key)}
                          className={`flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-md whitespace-nowrap transition-colors ${
                            active
                              ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
                              : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                          {t.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {tab === 'properties' && <PropertiesTab />}
        {tab === 'owners' && <OwnerManagement />}
        {tab === 'onboard' && <NewPropertyWizard embedded onDone={setTab} />}
        {tab === 'bank' && <BankTab />}
        {tab === 'pricing' && <PricingTab />}
        {tab === 'access' && <DirectorAccess />}
        {tab === 'setup' && <OnboardingPage />}
      </main>
    </div>
  );
}

// ─── Properties Tab ──────────────────────────────────────────────────────────

function PropertiesTab() {
  const [rows, setRows] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Partial<Property>>>({});

  const load = async () => {
    setLoading(true);
    try {
      invalidatePropertiesCache();
      const all = await getProperties(false);
      setRows(all);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load properties');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      r.name.toLowerCase().includes(q) ||
      (r.cleaner_name || '').toLowerCase().includes(q),
    );
  }, [rows, search]);

  const getValue = <K extends keyof Property>(row: Property, key: K): Property[K] => {
    const d = drafts[row.id];
    return (d && key in d ? (d as Property)[key] : row[key]);
  };

  const setDraft = (id: string, patch: Partial<Property>) => {
    setDrafts(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const isDirty = (id: string) => drafts[id] && Object.keys(drafts[id]).length > 0;

  const save = async (row: Property) => {
    const draft = drafts[row.id];
    if (!draft) return;
    setSavingId(row.id);
    setError(null);
    try {
      await updatePropertyOps(row.id, {
        name: draft.name,
        active: draft.active,
        welcome_pack_size: draft.welcome_pack_size,
        clean_price: draft.clean_price ?? null,
        cleaner_name: draft.cleaner_name,
        match_patterns: draft.match_patterns,
        special_rule: draft.special_rule,
        notes: draft.notes,
      });
      setRows(prev => prev.map(p => (p.id === row.id ? { ...p, ...draft } as Property : p)));
      setDrafts(prev => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      setSavedId(row.id);
      setTimeout(() => setSavedId(prev => (prev === row.id ? null : prev)), 1500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <header className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Properties</h2>
          <p className="text-sm text-slate-500 mt-0.5">Canonical config used by Booking Processor, Settlement Generator and Guest Ready</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search name or cleaner..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </header>

      {error && (
        <div className="m-5 p-3 bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <th className="px-4 py-3">Property</th>
              <th className="px-4 py-3">Cleaner</th>
              <th className="px-4 py-3">Clean £</th>
              <th className="px-4 py-3">Welcome pack</th>
              <th className="px-4 py-3">Match patterns</th>
              <th className="px-4 py-3">Special rule</th>
              <th className="px-4 py-3">Active</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map(row => {
              const dirty = isDirty(row.id);
              const saving = savingId === row.id;
              const saved = savedId === row.id;
              return (
                <tr key={row.id} className={dirty ? 'bg-amber-50/40' : ''}>
                  <td className="px-4 py-2 min-w-[200px]">
                    <input
                      type="text"
                      value={getValue(row, 'name') ?? ''}
                      onChange={e => setDraft(row.id, { name: e.target.value })}
                      className="w-full px-2 py-1.5 border border-transparent hover:border-slate-200 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 rounded font-semibold text-slate-900 bg-transparent"
                    />
                  </td>
                  <td className="px-4 py-2 min-w-[140px]">
                    <input
                      type="text"
                      value={getValue(row, 'cleaner_name') ?? ''}
                      onChange={e => setDraft(row.id, { cleaner_name: e.target.value })}
                      className="w-full px-2 py-1.5 border border-transparent hover:border-slate-200 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 rounded text-slate-700 bg-transparent"
                      placeholder="—"
                    />
                  </td>
                  <td className="px-4 py-2 w-24">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={getValue(row, 'clean_price') ?? ''}
                      onChange={e => {
                        const v = e.target.value;
                        setDraft(row.id, { clean_price: v === '' ? null : Number(v) });
                      }}
                      className="w-full px-2 py-1.5 border border-transparent hover:border-slate-200 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 rounded text-slate-700 bg-transparent tabular-nums"
                      placeholder="—"
                    />
                  </td>
                  <td className="px-4 py-2 w-40">
                    <select
                      value={getValue(row, 'welcome_pack_size') ?? 'none'}
                      onChange={e => setDraft(row.id, { welcome_pack_size: e.target.value as WelcomePackSize })}
                      className="w-full px-2 py-1.5 border border-slate-200 rounded text-slate-700 bg-white"
                    >
                      <option value="none">None</option>
                      <option value="small">Small</option>
                      <option value="large">Large</option>
                    </select>
                  </td>
                  <td className="px-4 py-2 min-w-[180px]">
                    <input
                      type="text"
                      value={(getValue(row, 'match_patterns') ?? []).join(', ')}
                      onChange={e =>
                        setDraft(row.id, {
                          match_patterns: e.target.value
                            .split(',')
                            .map(s => s.trim().toLowerCase())
                            .filter(Boolean),
                        })
                      }
                      className="w-full px-2 py-1.5 border border-transparent hover:border-slate-200 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 rounded text-xs text-slate-600 font-mono bg-transparent"
                      placeholder="e.g. 10 bynack"
                    />
                  </td>
                  <td className="px-4 py-2 min-w-[160px]">
                    <select
                      value={getValue(row, 'special_rule') ?? ''}
                      onChange={e => setDraft(row.id, { special_rule: e.target.value })}
                      className="w-full px-2 py-1.5 border border-slate-200 rounded text-slate-700 bg-white text-xs"
                    >
                      <option value="">None</option>
                      <option value="ignore_owner_cleans">Ignore owner cleans</option>
                    </select>
                  </td>
                  <td className="px-4 py-2 w-20 text-center">
                    <input
                      type="checkbox"
                      checked={Boolean(getValue(row, 'active'))}
                      onChange={e => setDraft(row.id, { active: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-4 py-2 w-24 text-right">
                    <button
                      onClick={() => save(row)}
                      disabled={!dirty || saving}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                        dirty
                          ? 'bg-blue-600 text-white hover:bg-blue-700'
                          : saved
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      {saving ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : saved ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <Save className="w-3.5 h-3.5" />
                      )}
                      {saved ? 'Saved' : 'Save'}
                    </button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-slate-400 text-sm">
                  No properties match your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ─── Bank Tab ────────────────────────────────────────────────────────────────

function BankTab() {
  const [open, setOpen] = useState(false);
  const [knownProperties, setKnownProperties] = useState<string[]>([]);

  useEffect(() => {
    getProperties(false).then(ps => setKnownProperties(ps.map(p => p.name))).catch(() => {});
  }, []);

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <h2 className="text-lg font-bold text-slate-900">Bank details & property mapping</h2>
      <p className="text-sm text-slate-500 mt-1">
        Owner bank details, payment reference prefixes, and which property pays which owner.
      </p>
      <button
        onClick={() => setOpen(true)}
        className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
      >
        <Landmark className="w-4 h-4" />
        Open Bank Settings
      </button>
      {open && (
        <BankSettingsModal
          knownProperties={knownProperties}
          onClose={() => setOpen(false)}
          onSaved={() => {}}
        />
      )}
    </section>
  );
}

// ─── Pricing Tab ─────────────────────────────────────────────────────────────

function PricingTab() {
  const [smallPrice, setSmallPrice] = useState<number>(12);
  const [largePrice, setLargePrice] = useState<number>(18);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const cfg = await getSettlementConfig();
        setSmallPrice(cfg.small_price);
        setLargePrice(cfg.large_price);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load prices');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateSettlementConfig({ small_price: smallPrice, large_price: largePrice });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 max-w-xl">
      <h2 className="text-lg font-bold text-slate-900">Welcome pack pricing</h2>
      <p className="text-sm text-slate-500 mt-1">Used by Booking Processor and Settlement Generator.</p>

      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      <div className="mt-5 grid grid-cols-2 gap-4">
        <label className="block">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Small pack price</span>
          <div className="mt-1 relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">£</span>
            <input
              type="number"
              min={0}
              step={0.5}
              value={smallPrice}
              onChange={e => setSmallPrice(Number(e.target.value))}
              className="w-full pl-7 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 tabular-nums"
            />
          </div>
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Large pack price</span>
          <div className="mt-1 relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">£</span>
            <input
              type="number"
              min={0}
              step={0.5}
              value={largePrice}
              onChange={e => setLargePrice(Number(e.target.value))}
              className="w-full pl-7 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 tabular-nums"
            />
          </div>
        </label>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className={`mt-5 inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
          saved ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50'
        }`}
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
        {saved ? 'Saved' : 'Save prices'}
      </button>
    </section>
  );
}




