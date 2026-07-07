import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, Flame, Droplets, Loader2, Search, CheckCircle2, AlertTriangle,
  Calendar, ChevronRight, X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getProperties, Property } from '../lib/properties';
import { logSafetyCheck } from '../lib/guestReady';

type VacancyKey = 'few_days' | 'one_week' | 'two_weeks';
type FireItemKey = 'alarms' | 'torches';

interface FireOption {
  key: FireItemKey;
  label: string;
  subtitle: string;
  action: string;
  tone: 'rose' | 'amber';
}

const FIRE_OPTIONS: FireOption[] = [
  {
    key: 'alarms',
    label: 'Fire alarms',
    subtitle: 'Press test button',
    action: 'Press test button',
    tone: 'rose',
  },
  {
    key: 'torches',
    label: 'Emergency torches',
    subtitle: 'Check location and working',
    action: 'Check location and working',
    tone: 'amber',
  },
];

interface VacancyOption {
  key: VacancyKey;
  label: string;
  subtitle: string;
  action: string;
  tone: 'emerald' | 'amber' | 'rose';
}

const VACANCY_OPTIONS: VacancyOption[] = [
  {
    key: 'few_days',
    label: 'A few days',
    subtitle: 'Unoccupied for under a week',
    action: 'No action required',
    tone: 'emerald',
  },
  {
    key: 'one_week',
    label: 'About a week',
    subtitle: 'Unoccupied around 7 days',
    action: 'Run all taps for at least 2 minutes',
    tone: 'amber',
  },
  {
    key: 'two_weeks',
    label: 'Two weeks or more',
    subtitle: 'Unoccupied 14+ days',
    action: 'Run tanks until empty, then refill',
    tone: 'rose',
  },
];

const TONE_CLASSES: Record<VacancyOption['tone'], { border: string; bg: string; text: string; dot: string }> = {
  emerald: {
    border: 'border-emerald-200', bg: 'bg-emerald-50', text: 'text-emerald-800',
    dot: 'bg-emerald-500',
  },
  amber: {
    border: 'border-amber-200', bg: 'bg-amber-50', text: 'text-amber-800',
    dot: 'bg-amber-500',
  },
  rose: {
    border: 'border-rose-200', bg: 'bg-rose-50', text: 'text-rose-800',
    dot: 'bg-rose-500',
  },
};

interface FireItemLog {
  id: string;
  by: string;
  at: string;
}

interface Row extends Property {
  fireAlarms?: FireItemLog;
  fireTorches?: FireItemLog;
  legionellaLogId?: string;
  legionellaBy?: string;
  legionellaAt?: string;
  legionellaVacancy?: VacancyKey;
}

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const startOfTodayISO = () => `${todayISO()}T00:00:00.000Z`;

export default function DailySafetyChecks() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [performerName, setPerformerName] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [vacancyFor, setVacancyFor] = useState<Row | null>(null);
  const [fireFor, setFireFor] = useState<Row | null>(null);

  useEffect(() => { void load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const u = session?.user;
      if (u) {
        const { data: cp } = await supabase
          .from('cleaner_profiles')
          .select('full_name')
          .eq('auth_user_id', u.id)
          .maybeSingle();
        if (cp?.full_name) setPerformerName(cp.full_name);
        else if (u.user_metadata?.full_name) setPerformerName(u.user_metadata.full_name);
        else if (u.email) setPerformerName(u.email.split('@')[0]);
      }

      const props = await getProperties(true);

      const { data: todaysLogs, error: logsErr } = await supabase
        .from('property_safety_checks')
        .select('id, property_id, property_name, check_type, performed_by_name, performed_at, notes')
        .in('check_type', ['fire_alarm', 'legionella'])
        .gte('performed_at', startOfTodayISO())
        .order('performed_at', { ascending: false });
      if (logsErr) throw logsErr;

      const fireAlarmsByProp = new Map<string, FireItemLog>();
      const fireTorchesByProp = new Map<string, FireItemLog>();
      const legByProp = new Map<string, { id: string; by: string; at: string; vacancy?: VacancyKey }>();
      for (const r of todaysLogs ?? []) {
        const key = (r.property_id as string) || `name:${r.property_name}`;
        const entry = { id: r.id as string, by: (r.performed_by_name as string) || '', at: r.performed_at as string };
        const notes = (r.notes as string) || '';
        if (r.check_type === 'fire_alarm') {
          const match = notes.match(/item:(\w+)/i);
          const item = match?.[1] as FireItemKey | undefined;
          if (item === 'alarms' && !fireAlarmsByProp.has(key)) {
            fireAlarmsByProp.set(key, entry);
          } else if (item === 'torches' && !fireTorchesByProp.has(key)) {
            fireTorchesByProp.set(key, entry);
          } else if (!item && !fireAlarmsByProp.has(key)) {
            fireAlarmsByProp.set(key, entry);
          }
        }
        if (r.check_type === 'legionella' && !legByProp.has(key)) {
          const match = notes.match(/vacancy:(\w+)/i);
          legByProp.set(key, { ...entry, vacancy: match?.[1] as VacancyKey | undefined });
        }
      }

      const merged: Row[] = props.map((p) => {
        const key = p.id || `name:${p.name}`;
        const l = legByProp.get(key);
        return {
          ...p,
          fireAlarms: fireAlarmsByProp.get(key),
          fireTorches: fireTorchesByProp.get(key),
          legionellaLogId: l?.id,
          legionellaBy: l?.by,
          legionellaAt: l?.at,
          legionellaVacancy: l?.vacancy,
        };
      });

      merged.sort((a, b) => {
        const aFireDone = a.fireAlarms && a.fireTorches ? 1 : 0;
        const bFireDone = b.fireAlarms && b.fireTorches ? 1 : 0;
        const aDone = aFireDone && a.legionellaLogId ? 1 : 0;
        const bDone = bFireDone && b.legionellaLogId ? 1 : 0;
        if (aDone !== bDone) return aDone - bDone;
        return a.name.localeCompare(b.name);
      });

      setRows(merged);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q));
  }, [rows, search]);

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  };

  const handleFire = async (row: Row, option: FireOption) => {
    setSaving(`${row.id}:fire_alarm:${option.key}`);
    try {
      await logSafetyCheck({
        propertyId: row.id || null,
        propertyName: row.name,
        checkType: 'fire_alarm',
        performedByName: performerName || 'Unknown',
        result: 'pass',
        notes: `item:${option.key} — ${option.label}. Action: ${option.action}`,
      });
      const logEntry: FireItemLog = { id: 'local', by: performerName || 'Unknown', at: new Date().toISOString() };
      const patch = option.key === 'alarms' ? { fireAlarms: logEntry } : { fireTorches: logEntry };
      setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, ...patch } : r));
      const updatedRow = { ...row, ...patch };
      if (updatedRow.fireAlarms && updatedRow.fireTorches) {
        showToast('Fire safety complete: both items checked');
        setFireFor(null);
      } else {
        showToast(`Logged: ${option.label} — 1 item remaining`);
        setFireFor(updatedRow);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(null);
    }
  };

  const handleLegionella = async (row: Row, option: VacancyOption) => {
    setSaving(`${row.id}:legionella`);
    try {
      await logSafetyCheck({
        propertyId: row.id || null,
        propertyName: row.name,
        checkType: 'legionella',
        performedByName: performerName || 'Unknown',
        result: 'pass',
        notes: `vacancy:${option.key} — ${option.label}. Action: ${option.action}`,
      });
      setRows((prev) => prev.map((r) => r.id === row.id
        ? {
          ...r, legionellaLogId: 'local', legionellaBy: performerName || 'Unknown',
          legionellaAt: new Date().toISOString(), legionellaVacancy: option.key,
        }
        : r));
      showToast(`Legionella logged: ${option.action}`);
      setVacancyFor(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-sky-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="mx-auto w-full max-w-[440px] min-h-screen bg-gradient-to-b from-slate-50 to-white shadow-[0_0_40px_rgba(15,23,42,0.35)] relative overflow-hidden pb-24">
        <header className="sticky top-0 z-20 bg-slate-900 text-white">
          <div className="px-5 pt-5 pb-6">
            <div className="flex items-center justify-between">
              <Link
                to="/"
                className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
                aria-label="Back"
              >
                <ArrowLeft className="w-4 h-4" />
              </Link>
              <div className="flex items-center gap-1.5 text-[11px] text-white/70 bg-white/10 px-2.5 py-1 rounded-full">
                <Calendar className="w-3 h-3" />
                {new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
              </div>
            </div>

            <div className="mt-5 mb-2">
              <p className="text-xs uppercase tracking-[0.18em] text-white/60 font-semibold">Today</p>
              <h1 className="text-2xl font-bold mt-0.5">Safety checks</h1>
              <p className="text-sm text-white/70 mt-1">Log fire & legionella across every property in one tap.</p>
            </div>
          </div>
          <div className="h-5 bg-slate-50 rounded-t-3xl -mt-1" />
        </header>

        <main className="px-5 space-y-4 -mt-2">
          {error && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-rose-800 text-sm flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span className="flex-1">{error}</span>
              <button onClick={() => setError(null)} className="text-rose-600"><X className="w-4 h-4" /></button>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-sm">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search properties"
                className="w-full pl-9 pr-3 py-2.5 border border-slate-200 bg-slate-50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white"
              />
            </div>
          </div>

          <div className="space-y-2.5">
            {filtered.map((row) => {
              const fireDoneRow = Boolean(row.fireAlarms && row.fireTorches);
              const firePartial = Boolean(row.fireAlarms || row.fireTorches) && !fireDoneRow;
              const legDoneRow = Boolean(row.legionellaLogId);
              const bothDone = fireDoneRow && legDoneRow;
              const vacancy = row.legionellaVacancy
                ? VACANCY_OPTIONS.find((v) => v.key === row.legionellaVacancy)
                : null;
              return (
                <div
                  key={row.id || row.name}
                  className={`bg-white border rounded-2xl p-4 transition-all shadow-sm ${
                    bothDone ? 'border-emerald-200 bg-gradient-to-br from-emerald-50/60 to-white' : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 text-[15px] truncate">{row.name}</div>
                      {bothDone ? (
                        <div className="text-[11px] text-emerald-700 font-medium flex items-center gap-1 mt-0.5">
                          <CheckCircle2 className="w-3 h-3" /> Both logged today
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {fireDoneRow ? '' : firePartial ? 'Fire 1/2 done' : 'Fire pending'}
                          {!fireDoneRow && !legDoneRow ? ' · ' : ''}
                          {legDoneRow ? '' : 'Legionella pending'}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <FireButton
                      done={fireDoneRow}
                      partial={firePartial}
                      alarmsLog={row.fireAlarms}
                      torchesLog={row.fireTorches}
                      saving={saving?.startsWith(`${row.id}:fire_alarm`) || false}
                      onClick={() => setFireFor(row)}
                    />
                    <LegionellaButton
                      done={legDoneRow}
                      doneBy={row.legionellaBy}
                      doneAt={row.legionellaAt}
                      vacancy={vacancy || null}
                      saving={saving === `${row.id}:legionella`}
                      onClick={() => setVacancyFor(row)}
                    />
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-500">
                No properties found
              </div>
            )}
          </div>
        </main>

        {toast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-sm font-medium px-4 py-2.5 rounded-full shadow-lg z-40 max-w-[88%] text-center">
            {toast}
          </div>
        )}

        {vacancyFor && (
          <VacancySheet
            row={vacancyFor}
            saving={saving === `${vacancyFor.id}:legionella`}
            onClose={() => setVacancyFor(null)}
            onPick={(opt) => handleLegionella(vacancyFor, opt)}
          />
        )}

        {fireFor && (
          <FireSheet
            row={fireFor}
            saving={saving}
            onClose={() => setFireFor(null)}
            onPick={(opt) => handleFire(fireFor, opt)}
          />
        )}
      </div>
    </div>
  );
}

function FireButton({
  done, partial, alarmsLog, torchesLog, saving, onClick,
}: {
  done: boolean; partial: boolean;
  alarmsLog?: FireItemLog; torchesLog?: FireItemLog;
  saving: boolean; onClick: () => void;
}) {
  if (done) {
    const lastAt = torchesLog?.at || alarmsLog?.at;
    const t = lastAt ? new Date(lastAt) : null;
    const timeStr = t ? t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
    return (
      <div className="border border-emerald-200 bg-emerald-50 rounded-xl px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-emerald-800 text-xs font-semibold">
          <CheckCircle2 className="w-3.5 h-3.5" /> Fire safety
        </div>
        <div className="text-[11px] text-emerald-700 mt-0.5 truncate">
          Both checked{timeStr ? ` · ${timeStr}` : ''}
        </div>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={saving}
      className={`border rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:scale-[0.98] ${
        partial ? 'border-amber-200 bg-amber-50/60 hover:border-amber-300' : 'border-slate-200 bg-white hover:border-rose-300 hover:bg-rose-50/60'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-600" /> : <Flame className="w-3.5 h-3.5 text-rose-600" />}
          Fire safety
        </div>
        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
      </div>
      <div className="text-[11px] text-slate-500 mt-0.5 font-normal">
        {partial
          ? `${alarmsLog ? 'Alarms done' : 'Torches done'} — 1 remaining`
          : 'Check both items'}
      </div>
    </button>
  );
}

function FireSheet({
  row, saving, onClose, onPick,
}: {
  row: Row;
  saving: string | null;
  onClose: () => void;
  onPick: (opt: FireOption) => void;
}) {
  const doneMap: Record<FireItemKey, FireItemLog | undefined> = {
    alarms: row.fireAlarms,
    torches: row.fireTorches,
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[440px] bg-white rounded-t-3xl shadow-2xl pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-slate-300" />
        </div>
        <div className="px-5 pt-3 pb-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-700">
              <Flame className="w-3.5 h-3.5" /> FIRE SAFETY CHECK
            </div>
            <h3 className="text-lg font-bold text-slate-900 mt-0.5 truncate">{row.name}</h3>
            <p className="text-xs text-slate-500 mt-0.5">Check both items below</p>
          </div>
          <button
            onClick={onClose}
            disabled={saving !== null}
            className="text-slate-400 hover:text-slate-600 p-1 -mt-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 pt-3 space-y-2">
          {FIRE_OPTIONS.map((opt) => {
            const c = TONE_CLASSES[opt.tone];
            const alreadyDone = Boolean(doneMap[opt.key]);
            const isSaving = saving === `${row.id}:fire_alarm:${opt.key}`;

            if (alreadyDone) {
              const log = doneMap[opt.key]!;
              const t = new Date(log.at);
              const timeStr = t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
              return (
                <div
                  key={opt.key}
                  className="w-full text-left border border-emerald-200 bg-emerald-50 rounded-2xl p-4 flex items-start gap-3"
                >
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-emerald-800">{opt.label}</div>
                    <div className="text-xs text-emerald-700 mt-0.5">Done by {log.by} at {timeStr}</div>
                  </div>
                </div>
              );
            }

            return (
              <button
                key={opt.key}
                onClick={() => onPick(opt)}
                disabled={isSaving}
                className={`w-full text-left border ${c.border} ${c.bg} rounded-2xl p-4 flex items-start gap-3 hover:brightness-95 active:scale-[0.99] transition-all disabled:opacity-50`}
              >
                <div className={`w-2.5 h-2.5 rounded-full ${c.dot} mt-1.5 flex-shrink-0`} />
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-bold ${c.text}`}>{opt.label}</div>
                  <div className="text-xs text-slate-600 mt-0.5">{opt.subtitle}</div>
                  <div className={`text-xs font-semibold mt-2 ${c.text}`}>{opt.action}</div>
                </div>
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin text-slate-400 mt-1" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-slate-400 mt-1" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function LegionellaButton({
  done, doneBy, doneAt, vacancy, saving, onClick,
}: {
  done: boolean; doneBy?: string; doneAt?: string;
  vacancy: VacancyOption | null;
  saving: boolean; onClick: () => void;
}) {
  if (done) {
    const t = doneAt ? new Date(doneAt) : null;
    const timeStr = t ? t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
    return (
      <div className="border border-emerald-200 bg-emerald-50 rounded-xl px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-emerald-800 text-xs font-semibold">
          <CheckCircle2 className="w-3.5 h-3.5" /> Legionella
        </div>
        <div className="text-[11px] text-emerald-700 mt-0.5 truncate">
          {vacancy ? vacancy.label : (doneBy || 'Logged')}{timeStr ? ` · ${timeStr}` : ''}
        </div>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={saving}
      className="border border-slate-200 bg-white rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-slate-900 hover:border-sky-300 hover:bg-sky-50/60 disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:scale-[0.98]"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-600" /> : <Droplets className="w-3.5 h-3.5 text-sky-600" />}
          Legionella
        </div>
        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
      </div>
      <div className="text-[11px] text-slate-500 mt-0.5 font-normal">How long vacant?</div>
    </button>
  );
}

function VacancySheet({
  row, saving, onClose, onPick,
}: {
  row: Row;
  saving: boolean;
  onClose: () => void;
  onPick: (opt: VacancyOption) => void;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[440px] bg-white rounded-t-3xl shadow-2xl pb-6 animate-[slideUp_0.2s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-slate-300" />
        </div>
        <div className="px-5 pt-3 pb-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-700">
              <Droplets className="w-3.5 h-3.5" /> LEGIONELLA CHECK
            </div>
            <h3 className="text-lg font-bold text-slate-900 mt-0.5 truncate">{row.name}</h3>
            <p className="text-xs text-slate-500 mt-0.5">How long has the property been unoccupied?</p>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="text-slate-400 hover:text-slate-600 p-1 -mt-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 pt-3 space-y-2">
          {VACANCY_OPTIONS.map((opt) => {
            const c = TONE_CLASSES[opt.tone];
            return (
              <button
                key={opt.key}
                onClick={() => onPick(opt)}
                disabled={saving}
                className={`w-full text-left border ${c.border} ${c.bg} rounded-2xl p-4 flex items-start gap-3 hover:brightness-95 active:scale-[0.99] transition-all disabled:opacity-50`}
              >
                <div className={`w-2.5 h-2.5 rounded-full ${c.dot} mt-1.5 flex-shrink-0`} />
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-bold ${c.text}`}>{opt.label}</div>
                  <div className="text-xs text-slate-600 mt-0.5">{opt.subtitle}</div>
                  <div className={`text-xs font-semibold mt-2 ${c.text}`}>{opt.action}</div>
                </div>
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin text-slate-400 mt-1" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-slate-400 mt-1" />
                )}
              </button>
            );
          })}
        </div>

        <div className="px-5 pt-4">
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Logs the legionella check for today with the action you've taken. You can change it by tapping again tomorrow.
          </p>
        </div>
      </div>
    </div>
  );
}
