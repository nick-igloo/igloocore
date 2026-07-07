import { useEffect, useState, useCallback } from 'react';
import { Flame, Droplets, Loader2, CheckCircle2, AlertTriangle, Calendar, Home } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const PROPERTY_ID = 'd921f6ce-f500-42cd-9f81-0327e712ae8e';
const PROPERTY_NAME = 'Woodland House';

type VacancyKey = 'few_days' | 'one_week' | 'two_weeks';
type FireItemKey = 'alarms' | 'torches';

interface FireOption {
  key: FireItemKey;
  label: string;
  subtitle: string;
  action: string;
}

const FIRE_OPTIONS: FireOption[] = [
  { key: 'alarms', label: 'Fire alarms', subtitle: 'Press test button on an alarm until all sound', action: 'Press test button until all sound' },
  { key: 'torches', label: 'Emergency torches', subtitle: 'Check location and working', action: 'Check location and working' },
];

interface VacancyOption {
  key: VacancyKey;
  label: string;
  subtitle: string;
  action: string;
  tone: 'green' | 'amber' | 'rose';
}

const VACANCY_OPTIONS: VacancyOption[] = [
  { key: 'few_days', label: 'A few days', subtitle: 'Unoccupied for under a week', action: 'No action required', tone: 'green' },
  { key: 'one_week', label: 'About a week', subtitle: 'Unoccupied around 7 days', action: 'Run all taps for at least 2 minutes', tone: 'amber' },
  { key: 'two_weeks', label: 'Two weeks or more', subtitle: 'Unoccupied 14+ days', action: 'Run tanks until empty, then refill', tone: 'rose' },
];

const TONE_CLASSES: Record<VacancyOption['tone'], { border: string; bg: string; text: string }> = {
  green: { border: 'border-emerald-200', bg: 'bg-emerald-50', text: 'text-emerald-800' },
  amber: { border: 'border-amber-200', bg: 'bg-amber-50', text: 'text-amber-800' },
  rose: { border: 'border-rose-200', bg: 'bg-rose-50', text: 'text-rose-800' },
};

interface LogEntry { by: string; at: string }

const startOfTodayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T00:00:00.000Z`;
};

export default function WoodlandSafety() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [performerName, setPerformerName] = useState(() => localStorage.getItem('woodland_performer') || '');
  const [nameSubmitted, setNameSubmitted] = useState(() => !!localStorage.getItem('woodland_performer'));
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [fireAlarms, setFireAlarms] = useState<LogEntry | null>(null);
  const [fireTorches, setFireTorches] = useState<LogEntry | null>(null);
  const [legionella, setLegionella] = useState<{ vacancy: VacancyKey; by: string; at: string } | null>(null);

  const [showVacancy, setShowVacancy] = useState(false);

  useEffect(() => {
    document.title = 'Woodland House — Safety Checks';
  }, []);

  const loadToday = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error: err } = await supabase
        .from('property_safety_checks')
        .select('id, check_type, performed_by_name, performed_at, notes')
        .eq('property_id', PROPERTY_ID)
        .in('check_type', ['fire_alarm', 'legionella'])
        .gte('performed_at', startOfTodayISO())
        .order('performed_at', { ascending: false });
      if (err) throw err;

      let alarms: LogEntry | null = null;
      let torches: LogEntry | null = null;
      let leg: { vacancy: VacancyKey; by: string; at: string } | null = null;

      for (const r of data ?? []) {
        const entry = { by: r.performed_by_name || '', at: r.performed_at };
        const notes = (r.notes as string) || '';
        if (r.check_type === 'fire_alarm') {
          const match = notes.match(/item:(\w+)/i);
          const item = match?.[1] as FireItemKey | undefined;
          if (item === 'alarms' && !alarms) alarms = entry;
          else if (item === 'torches' && !torches) torches = entry;
          else if (!item && !alarms) alarms = entry;
        }
        if (r.check_type === 'legionella' && !leg) {
          const match = notes.match(/vacancy:(\w+)/i);
          leg = { vacancy: (match?.[1] as VacancyKey) || 'few_days', ...entry };
        }
      }

      setFireAlarms(alarms);
      setFireTorches(torches);
      setLegionella(leg);
    } catch (e: any) {
      setError(e?.message || JSON.stringify(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (nameSubmitted) void loadToday();
  }, [nameSubmitted, loadToday]);

  const showToastMsg = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 3000);
  };

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!performerName.trim()) return;
    localStorage.setItem('woodland_performer', performerName.trim());
    setNameSubmitted(true);
  };

  const handleFire = async (option: FireOption) => {
    setSaving(`fire:${option.key}`);
    try {
      const { error: err } = await supabase.from('property_safety_checks').insert({
        property_id: PROPERTY_ID,
        property_name: PROPERTY_NAME,
        check_type: 'fire_alarm',
        performed_by_name: performerName,
        result: 'pass',
        details: {},
        notes: `item:${option.key} — ${option.label}. Action: ${option.action}`,
      });
      if (err) throw err;
      const entry = { by: performerName, at: new Date().toISOString() };
      if (option.key === 'alarms') setFireAlarms(entry);
      else setFireTorches(entry);
      showToastMsg(`${option.label} checked`);
    } catch (e: any) {
      setError(e?.message || JSON.stringify(e));
    } finally {
      setSaving(null);
    }
  };

  const handleLegionella = async (option: VacancyOption) => {
    setSaving('legionella');
    try {
      const { error: err } = await supabase.from('property_safety_checks').insert({
        property_id: PROPERTY_ID,
        property_name: PROPERTY_NAME,
        check_type: 'legionella',
        performed_by_name: performerName,
        result: 'pass',
        details: {},
        notes: `vacancy:${option.key} — ${option.label}. Action: ${option.action}`,
      });
      if (err) throw err;
      setLegionella({ vacancy: option.key, by: performerName, at: new Date().toISOString() });
      showToastMsg(`Legionella logged: ${option.action}`);
      setShowVacancy(false);
    } catch (e: any) {
      setError(e?.message || JSON.stringify(e));
    } finally {
      setSaving(null);
    }
  };

  if (!nameSubmitted) {
    return (
      <div className="min-h-screen bg-[#002244] flex items-center justify-center p-4">
        <div className="w-full max-w-[380px] bg-white rounded-2xl shadow-xl p-8">
          <div className="flex justify-center mb-6">
            <img src="/avantio.png" alt="Igloo Holiday Homes" className="h-14 object-contain" />
          </div>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-[#003366]/10 flex items-center justify-center">
              <Home className="w-6 h-6 text-[#003366]" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Woodland House</h1>
              <p className="text-sm text-slate-500">Safety check logger</p>
            </div>
          </div>
          <form onSubmit={handleNameSubmit}>
            <label className="text-sm font-medium text-slate-700 mb-2 block">Your name</label>
            <input
              type="text"
              value={performerName}
              onChange={(e) => setPerformerName(e.target.value)}
              placeholder="e.g. John Smith"
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#003366] focus:border-[#003366] text-lg"
              autoFocus
            />
            <button
              type="submit"
              disabled={!performerName.trim()}
              className="w-full mt-4 py-3 bg-[#003366] text-white font-semibold rounded-lg hover:bg-[#004488] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Continue
            </button>
          </form>
        </div>
      </div>
    );
  }

  const allFireDone = !!fireAlarms && !!fireTorches;
  const allDone = allFireDone && !!legionella;

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto w-full max-w-[440px] min-h-screen bg-white shadow-lg relative overflow-hidden pb-24">
        {/* Header */}
        <header className="bg-[#003366] text-white px-5 pt-6 pb-7">
          <div className="flex justify-center mb-4">
            <div className="bg-white rounded-lg px-4 py-2">
              <img src="/avantio.png" alt="Igloo Holiday Homes" className="h-8 object-contain" />
            </div>
          </div>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center">
                <Home className="w-4 h-4" />
              </div>
              <span className="text-sm font-medium text-white/80">{performerName}</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-white/70 bg-white/10 px-2.5 py-1 rounded-full">
              <Calendar className="w-3 h-3" />
              {new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
            </div>
          </div>
          <h1 className="text-2xl font-bold">Woodland House</h1>
          <p className="text-sm text-white/70 mt-1">Fire alarms & legionella checks</p>
        </header>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-7 h-7 text-[#003366] animate-spin" />
          </div>
        )}

        {/* Status banner */}
        {!loading && allDone && (
          <div className="mx-4 mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-800">All checks complete for today</p>
              <p className="text-xs text-emerald-600 mt-0.5">Both fire items and legionella logged.</p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700 flex-1">{error}</p>
            <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600 text-lg leading-none">&times;</button>
          </div>
        )}

        {/* Fire alarms section */}
        {!loading && (
          <section className="px-4 mt-6">
            <div className="flex items-center gap-2 mb-3">
              <Flame className="w-5 h-5 text-rose-500" />
              <h2 className="text-base font-bold text-slate-900">Fire safety</h2>
            </div>

            <div className="space-y-3">
              {FIRE_OPTIONS.map((opt) => {
                const done = opt.key === 'alarms' ? fireAlarms : fireTorches;
                return (
                  <div
                    key={opt.key}
                    className={`rounded-xl border-2 p-4 transition-all ${
                      done ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-slate-900">{opt.label}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{opt.subtitle}</p>
                      </div>
                      {done ? (
                        <div className="flex items-center gap-1.5 text-emerald-600">
                          <CheckCircle2 className="w-5 h-5" />
                          <span className="text-xs font-medium">Done</span>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleFire(opt)}
                          disabled={saving != null}
                          className="px-4 py-2 bg-[#003366] text-white text-sm font-semibold rounded-lg hover:bg-[#004488] disabled:opacity-50 transition-colors"
                        >
                          {saving === `fire:${opt.key}` ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            'Log'
                          )}
                        </button>
                      )}
                    </div>
                    {done && (
                      <p className="text-[11px] text-emerald-600 mt-2">
                        Logged by {done.by} at {new Date(done.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Legionella section */}
        {!loading && (
          <section className="px-4 mt-8">
            <div className="flex items-center gap-2 mb-3">
              <Droplets className="w-5 h-5 text-sky-500" />
              <h2 className="text-base font-bold text-slate-900">Legionella</h2>
            </div>

            {legionella ? (
              <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/50 p-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <p className="font-semibold text-emerald-800">Check logged</p>
                </div>
                <p className="text-sm text-slate-600 mt-2">
                  Vacancy: <span className="font-medium">{VACANCY_OPTIONS.find((v) => v.key === legionella.vacancy)?.label || legionella.vacancy}</span>
                </p>
                <p className="text-sm text-slate-600">
                  Action: <span className="font-medium">{VACANCY_OPTIONS.find((v) => v.key === legionella.vacancy)?.action || 'Done'}</span>
                </p>
                <p className="text-[11px] text-emerald-600 mt-2">
                  Logged by {legionella.by} at {new Date(legionella.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            ) : !showVacancy ? (
              <button
                onClick={() => setShowVacancy(true)}
                className="w-full py-4 border-2 border-dashed border-[#003366]/30 rounded-xl text-[#003366] font-semibold hover:bg-[#003366]/5 transition-colors"
              >
                Log legionella check
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-slate-600 font-medium">How long has the property been unoccupied?</p>
                {VACANCY_OPTIONS.map((opt) => {
                  const tc = TONE_CLASSES[opt.tone];
                  return (
                    <button
                      key={opt.key}
                      onClick={() => handleLegionella(opt)}
                      disabled={saving != null}
                      className={`w-full text-left rounded-xl border-2 p-4 transition-all hover:scale-[1.01] ${tc.border} ${tc.bg}`}
                    >
                      <p className={`font-semibold ${tc.text}`}>{opt.label}</p>
                      <p className="text-xs text-slate-600 mt-0.5">{opt.subtitle}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <span className={`text-xs font-medium ${tc.text} bg-white/60 px-2 py-0.5 rounded`}>
                          {saving === 'legionella' ? 'Saving...' : `Action: ${opt.action}`}
                        </span>
                      </div>
                    </button>
                  );
                })}
                <button
                  onClick={() => setShowVacancy(false)}
                  className="w-full py-2 text-sm text-slate-500 hover:text-slate-700"
                >
                  Cancel
                </button>
              </div>
            )}
          </section>
        )}

        {/* Toast */}
        {toast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 bg-[#003366] text-white text-sm font-medium rounded-full shadow-xl">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
