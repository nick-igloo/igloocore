import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, Flame, Droplets, Sparkles, Gift, CheckCircle2,
  Loader2, AlertTriangle, Search, User as UserIcon, ChevronDown, ChevronUp,
  Gauge, Filter, ListChecks, AlertOctagon, Plus,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fetchRemoteBookings } from '../lib/bookingsSupabase';
import { getProperties, Property } from '../lib/properties';
import {
  computeLegionellaAction, LegionellaAction,
  createGuestReadySession, upsertCheck, completeSession,
  logSafetyCheck, logSTLCheck,
  fetchDueOwnerTasks, completeOwnerTask, DueOwnerTask,
  CheckType,
} from '../lib/guestReady';
import { listOpenTasks, listAllIssues, BookingTask, IssueReport } from '../lib/turnover';
import { TurnoverNav } from '../components/TurnoverNav';

type StageKey = 'fire_safety' | 'legionella' | 'clean' | 'welcome_pack';

const STAGES: { key: StageKey; label: string; shortLabel: string; icon: React.ComponentType<{ className?: string }>; color: string }[] = [
  { key: 'fire_safety', label: 'Fire safety', shortLabel: 'Fire', icon: Flame, color: 'bg-red-100 text-red-700' },
  { key: 'legionella', label: 'Legionella', shortLabel: 'Legionella', icon: Droplets, color: 'bg-blue-100 text-blue-700' },
  { key: 'clean', label: 'Clean', shortLabel: 'Clean', icon: Sparkles, color: 'bg-teal-100 text-teal-700' },
  { key: 'welcome_pack', label: 'Welcome pack', shortLabel: 'Welcome', icon: Gift, color: 'bg-amber-100 text-amber-700' },
];

const stagesForRow = (row: { welcome_pack_size?: string | null; has_welcome_pack?: boolean }) => {
  const hasWelcome = row.welcome_pack_size
    ? row.welcome_pack_size !== 'none'
    : row.has_welcome_pack !== false;
  return STAGES.filter((s) => s.key !== 'welcome_pack' || hasWelcome);
};

interface SessionState {
  id: string;
  property_id: string | null;
  property_name: string;
  completed: Partial<Record<StageKey, { status: string; at: string }>>;
  notified: boolean;
}

type OccupancyState = 'occupied' | 'in_progress' | 'ready';

interface PropertyRow extends Property {
  lastDeparture: string | null;
  nextArrival: string | null;
  currentCheckOut: string | null;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  legionella: LegionellaAction;
  session: SessionState | null;
  occupancy: OccupancyState;
  dueTasks: DueOwnerTask[];
  completedTaskIds: Set<string>;
}

export default function GuestReady() {
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [performerName, setPerformerName] = useState('');
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [rows, setRows] = useState<PropertyRow[]>([]);
  const [search, setSearch] = useState('');
  const [welcomePackOnly, setWelcomePackOnly] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [taskValues, setTaskValues] = useState<Record<string, { value: string; notes: string }>>({});
  const [openTaskCount, setOpenTaskCount] = useState(0);
  const [openIssueCount, setOpenIssueCount] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const [tasks, issues] = await Promise.all([listOpenTasks({ onlyOpen: true }), listAllIssues()]);
        setOpenTaskCount((tasks as BookingTask[]).length);
        setOpenIssueCount((issues as IssueReport[]).filter((i) => i.status !== 'resolved' && i.status !== 'cancelled').length);
      } catch {
        // non-fatal
      }
    })();
  }, []);

  useEffect(() => {
    loadEverything();
  }, []);

  const loadEverything = async () => {
    setLoading(true);
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const u = authSession?.user;
      if (u) {
        setUserEmail(u.email ?? null);
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

      const remoteBookings = await fetchRemoteBookings();
      const bookings = remoteBookings
        .filter((b) => (b.status ?? '').toUpperCase() !== 'CANCELLED')
        .map((b) => ({
          property_name: b.property_name ?? '',
          guest_name: b.customers?.name || b.guest_name || '',
          guest_email: b.customers?.email || '',
          guest_phone: b.customers?.phone || '',
          check_in: b.arrival_date,
          check_out: b.check_out_date,
        }));

      const today = new Date().toISOString().split('T')[0];
      const byProp = new Map<string, { last: any; next: any; current: any; all: any[] }>();
      bookings.forEach((b) => {
        const key = b.property_name?.toLowerCase();
        if (!key || !b.check_in || !b.check_out) return;
        const cur = byProp.get(key) ?? { last: null, next: null, current: null, all: [] };
        cur.all.push(b);
        byProp.set(key, cur);
      });

      byProp.forEach((v) => {
        const inStay = v.all.find((b) => b.check_in <= today && today < b.check_out);
        if (inStay) v.current = inStay;

        const pastDepartures = v.all
          .filter((b) => b.check_out <= today)
          .sort((a, b) => (a.check_out < b.check_out ? 1 : -1));
        v.last = pastDepartures[0] ?? null;

        const futureArrivals = v.all
          .filter((b) => b.check_in > today)
          .sort((a, b) => (a.check_in < b.check_in ? -1 : 1));
        v.next = futureArrivals[0] ?? null;
      });

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 2);
      const cutoffIso = cutoff.toISOString();

      const { data: sessions } = await supabase
        .from('guest_ready_sessions')
        .select('id, property_id, property_name, status, started_at, completed_at')
        .gte('started_at', cutoffIso)
        .order('started_at', { ascending: false });

      const sessionByProp = new Map<string, any>();
      (sessions ?? []).forEach((s: any) => {
        const key = s.property_id as string;
        if (!key) return;
        if (!sessionByProp.has(key)) sessionByProp.set(key, s);
      });

      const sessionIds = Array.from(sessionByProp.values()).map((s: any) => s.id);
      const { data: checks } = sessionIds.length
        ? await supabase.from('guest_ready_checks').select('session_id, check_type, status, completed_at').in('session_id', sessionIds)
        : { data: [] as any[] };

      const checksBySession = new Map<string, any[]>();
      (checks ?? []).forEach((c: any) => {
        const arr = checksBySession.get(c.session_id) ?? [];
        arr.push(c);
        checksBySession.set(c.session_id, arr);
      });

      const dueTasksByProp = await fetchDueOwnerTasks(props.map(p => p.id));

      const sessionStartByProp = new Map<string, string>();
      (sessions ?? []).forEach((s: any) => {
        if (s.property_id && !sessionStartByProp.has(s.property_id)) {
          sessionStartByProp.set(s.property_id, s.started_at);
        }
      });
      const completionsToCheck: Array<{ sessionId: string; taskIds: string[] }> = [];
      const taskIdsThisRun: string[] = [];
      (sessions ?? []).forEach((s: any) => {
        const dt = dueTasksByProp.get(s.property_id) ?? [];
        if (dt.length) {
          completionsToCheck.push({ sessionId: s.id, taskIds: dt.map(t => t.id) });
          dt.forEach(t => taskIdsThisRun.push(t.id));
        }
      });

      const completedThisSession = new Map<string, Set<string>>();
      if (taskIdsThisRun.length) {
        const sessIds = completionsToCheck.map(c => c.sessionId);
        const { data: comps } = await supabase
          .from('property_owner_task_completions')
          .select('task_id, session_id')
          .in('task_id', taskIdsThisRun)
          .in('session_id', sessIds);
        (comps ?? []).forEach((c: any) => {
          if (!c.session_id) return;
          const set = completedThisSession.get(c.session_id) ?? new Set<string>();
          set.add(c.task_id);
          completedThisSession.set(c.session_id, set);
        });
      }

      const built: PropertyRow[] = props.map((p) => {
        const m = byProp.get(p.name.toLowerCase()) || { last: null, next: null, current: null, all: [] as any[] };
        const legionella = computeLegionellaAction(m.last?.check_out ?? null, m.next?.check_in ?? null);
        const existing = sessionByProp.get(p.id);
        let sessionState: SessionState | null = null;
        if (existing) {
          const sChecks = checksBySession.get(existing.id) ?? [];
          const completed: SessionState['completed'] = {};
          sChecks.forEach((c: any) => {
            if (['passed', 'action_taken', 'no_action_required', 'failed'].includes(c.status)) {
              completed[c.check_type as StageKey] = { status: c.status, at: c.completed_at };
            }
          });
          sessionState = {
            id: existing.id,
            property_id: existing.property_id,
            property_name: existing.property_name,
            completed,
            notified: existing.status === 'notified',
          };
        }
        const dueTasks = dueTasksByProp.get(p.id) ?? [];
        const completedTaskIds = existing ? (completedThisSession.get(existing.id) ?? new Set<string>()) : new Set<string>();
        const pendingTasks = dueTasks.filter(t => !completedTaskIds.has(t.id));
        const applicableStages = stagesForRow(p);
        const stageDoneCount = sessionState
          ? applicableStages.filter((s) => sessionState!.completed[s.key]).length
          : 0;
        const totalItems = applicableStages.length + dueTasks.length;
        const totalDone = stageDoneCount + completedTaskIds.size;
        const occupancy: OccupancyState = m.current
          ? 'occupied'
          : totalItems > 0 && totalDone === totalItems
            ? 'ready'
            : 'in_progress';
        return {
          ...p,
          lastDeparture: m.last?.check_out ?? null,
          nextArrival: m.next?.check_in ?? null,
          currentCheckOut: m.current?.check_out ?? null,
          guestName: m.current?.guest_name ?? m.next?.guest_name ?? '',
          guestEmail: m.current?.guest_email ?? m.next?.guest_email ?? '',
          guestPhone: m.current?.guest_phone ?? m.next?.guest_phone ?? '',
          legionella,
          session: sessionState,
          occupancy,
          dueTasks: pendingTasks,
          completedTaskIds,
        };
      });

      setRows(built);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const withLiveOccupancy = rows.map((r) => {
      if (r.occupancy === 'occupied') return r;
      const applicable = stagesForRow(r);
      const doneStages = applicable.filter((s) => r.session?.completed?.[s.key]).length;
      const totalItems = applicable.length + r.dueTasks.length + r.completedTaskIds.size;
      const doneItems = doneStages + r.completedTaskIds.size;
      const live: OccupancyState = totalItems > 0 && doneItems === totalItems ? 'ready' : 'in_progress';
      return live === r.occupancy ? r : { ...r, occupancy: live };
    });
    return withLiveOccupancy.filter((r) => {
      if (q && !r.name.toLowerCase().includes(q)) return false;
      if (welcomePackOnly) {
        const hasPack = r.welcome_pack_size
          ? r.welcome_pack_size !== 'none'
          : r.has_welcome_pack !== false;
        if (!hasPack) return false;
      }
      return true;
    });
  }, [rows, search, welcomePackOnly]);

  const occupiedRows = useMemo(() => filtered.filter((r) => r.occupancy === 'occupied'), [filtered]);
  const inProgressRows = useMemo(() => filtered.filter((r) => r.occupancy === 'in_progress'), [filtered]);
  const readyRows = useMemo(() => filtered.filter((r) => r.occupancy === 'ready'), [filtered]);

  const ensureSession = async (row: PropertyRow): Promise<string> => {
    if (row.session?.id) return row.session.id;
    const created = await createGuestReadySession({
      propertyId: row.id,
      propertyName: row.name,
      performerName: performerName.trim() || 'Unknown',
      performerRole: 'cleaner',
      lastDeparture: row.lastDeparture,
      nextArrival: row.nextArrival,
      guestName: row.guestName,
      guestEmail: row.guestEmail,
      guestPhone: row.guestPhone,
    });
    if (!created) throw new Error('Failed to create session');
    return created.id;
  };

  const markStage = async (row: PropertyRow, stage: StageKey) => {
    if (!performerName.trim()) {
      setError('Please confirm your name');
      return;
    }
    const key = `${row.id}:${stage}`;
    setSavingKey(key);
    setError(null);
    try {
      const sessionId = await ensureSession(row);

      if (stage === 'fire_safety') {
        await upsertCheck({ sessionId, checkType: 'fire_safety', status: 'passed', completedByName: performerName.trim() });
        await logSafetyCheck({ propertyId: row.id, propertyName: row.name, checkType: 'fire_alarm', performedByName: performerName.trim(), result: 'pass' });
      } else if (stage === 'legionella') {
        const level = row.legionella.level;
        const status = level === 'none' ? 'no_action_required' : 'action_taken';
        await upsertCheck({
          sessionId,
          checkType: 'legionella',
          status,
          details: { level, label: row.legionella.label, daysUnoccupied: row.legionella.daysUnoccupied },
          completedByName: performerName.trim(),
        });
        await logSafetyCheck({
          propertyId: row.id,
          propertyName: row.name,
          checkType: 'legionella',
          performedByName: performerName.trim(),
          result: status,
          details: { level, label: row.legionella.label, daysUnoccupied: row.legionella.daysUnoccupied },
        });
        await logSTLCheck({
          propertyName: row.name,
          legionellaBy: performerName.trim(),
          unoccupiedStatus: row.legionella.label,
        });
      } else if (stage === 'clean') {
        await upsertCheck({ sessionId, checkType: 'clean', status: 'passed', completedByName: performerName.trim() });
      } else if (stage === 'welcome_pack') {
        await upsertCheck({ sessionId, checkType: 'welcome_pack', status: 'passed', completedByName: performerName.trim() });
      }

      setRows((prev) => prev.map((r) => {
        if (r.id !== row.id) return r;
        const existing = r.session ?? { id: sessionId, property_id: r.id, property_name: r.name, completed: {}, notified: false };
        return {
          ...r,
          session: {
            ...existing,
            id: sessionId,
            completed: {
              ...existing.completed,
              [stage]: { status: stage === 'legionella' ? (r.legionella.level === 'none' ? 'no_action_required' : 'action_taken') : 'passed', at: new Date().toISOString() },
            },
          },
        };
      }));

      const updated = getUpdatedRow(row.id);
      if (updated && allStagesDone(updated)) {
        await finaliseSession(updated);
      }

      setToast(`${STAGES.find((s) => s.key === stage)?.label} marked done for ${row.name}`);
      setTimeout(() => setToast(null), 2500);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSavingKey(null);
    }
  };

  const getUpdatedRow = (id: string): PropertyRow | undefined => {
    return rowsRef.current.find((r) => r.id === id);
  };

  const rowsRef = { current: rows };
  rowsRef.current = rows;

  const allStagesDone = (r: PropertyRow) =>
    stagesForRow(r).every((s) => r.session?.completed?.[s.key]) &&
    r.dueTasks.length === 0;

  const finaliseSession = async (row: PropertyRow) => {
    if (!row.session) return;
    try {
      await completeSession(
        row.session.id,
        row.legionella.label,
        row.legionella.level === 'none' ? 'no action required' : row.legionella.level === 'taps' ? 'ran taps' : 'drained tanks',
        ''
      );
    } catch (e: any) {
      setError(e.message);
    }
  };

  const markOwnerTask = async (row: PropertyRow, task: DueOwnerTask) => {
    if (!performerName.trim()) {
      setError('Please confirm your name');
      return;
    }
    const key = `${row.id}:task:${task.id}`;
    setSavingKey(key);
    setError(null);
    try {
      const sessionId = await ensureSession(row);
      const tv = taskValues[task.id] ?? { value: '', notes: '' };
      await completeOwnerTask({
        task,
        sessionId,
        performerName: performerName.trim(),
        value: tv.value,
        notes: tv.notes,
      });
      setRows((prev) => prev.map((r) => {
        if (r.id !== row.id) return r;
        const newCompleted = new Set(r.completedTaskIds);
        newCompleted.add(task.id);
        return {
          ...r,
          dueTasks: r.dueTasks.filter((t) => t.id !== task.id),
          completedTaskIds: newCompleted,
        };
      }));
      setTaskValues((prev) => {
        const next = { ...prev };
        delete next[task.id];
        return next;
      });
      setToast(`${task.name} done for ${row.name}`);
      setTimeout(() => setToast(null), 2500);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSavingKey(null);
    }
  };

  const progressCount = (r: PropertyRow) => {
    const stageDone = stagesForRow(r).filter((s) => r.session?.completed?.[s.key]).length;
    return stageDone + r.completedTaskIds.size;
  };
  const totalItems = (r: PropertyRow) => stagesForRow(r).length + r.dueTasks.length + r.completedTaskIds.size;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 pb-24">
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/" className="text-slate-500 hover:text-slate-700"><ArrowLeft className="w-5 h-5" /></Link>
          <div className="flex-1">
            <h1 className="text-base font-bold text-slate-900">Guest Ready</h1>
            <p className="text-xs text-slate-500">Safety checks, clean, tasks and issues</p>
          </div>
          {performerName && (
            <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500 bg-slate-100 rounded-full px-3 py-1.5">
              <UserIcon className="w-3.5 h-3.5" />
              <span className="font-medium text-slate-700">{performerName}</span>
            </div>
          )}
        </div>
        <div className="max-w-3xl mx-auto px-4 pb-3 flex items-center gap-2">
          <Link
            to="/turnover/tasks"
            className="flex-1 inline-flex items-center justify-center gap-1.5 bg-teal-50 hover:bg-teal-100 text-teal-800 text-sm font-semibold px-3 py-2 rounded-lg border border-teal-200"
          >
            <ListChecks className="w-4 h-4" />
            Tasks
            {openTaskCount > 0 && (
              <span className="ml-1 bg-amber-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
                {openTaskCount > 99 ? '99+' : openTaskCount}
              </span>
            )}
          </Link>
          <Link
            to="/turnover/issues"
            className="flex-1 inline-flex items-center justify-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-800 text-sm font-semibold px-3 py-2 rounded-lg border border-red-200"
          >
            <AlertOctagon className="w-4 h-4" />
            Issues
            {openIssueCount > 0 && (
              <span className="ml-1 bg-red-600 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
                {openIssueCount > 99 ? '99+' : openIssueCount}
              </span>
            )}
          </Link>
          <Link
            to="/turnover/issues?new=1"
            className="inline-flex items-center justify-center gap-1 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-3 py-2 rounded-lg"
            title="Report an issue"
          >
            <Plus className="w-4 h-4" />
            Report
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {toast && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-30 bg-slate-900 text-white text-sm px-4 py-2 rounded-full shadow-lg flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            {toast}
          </div>
        )}

        <section className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Your name</label>
            <input
              type="text"
              value={performerName}
              onChange={(e) => setPerformerName(e.target.value)}
              placeholder="Your full name"
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            {userEmail && <p className="text-xs text-slate-500 mt-1">Signed in as {userEmail}</p>}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search properties"
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <Filter className="w-3.5 h-3.5" />
              Filter
            </div>
            <button
              type="button"
              onClick={() => setWelcomePackOnly((v) => !v)}
              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                welcomePackOnly
                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-amber-300'
              }`}
            >
              <Gift className="w-3.5 h-3.5" />
              Welcome packs only
            </button>
          </div>
        </section>

        {inProgressRows.length > 0 && (
          <section>
            <div className="flex items-baseline justify-between mb-2 px-1">
              <h2 className="text-xs font-bold uppercase tracking-wide text-amber-700">To do</h2>
              <span className="text-xs text-slate-500">{inProgressRows.length}</span>
            </div>
            <ul className="space-y-2">
              {inProgressRows.map((row) => renderCard(row))}
            </ul>
          </section>
        )}

        {readyRows.length > 0 && (
          <section>
            <div className="flex items-baseline justify-between mb-2 px-1">
              <h2 className="text-xs font-bold uppercase tracking-wide text-emerald-700">Ready</h2>
              <span className="text-xs text-slate-500">{readyRows.length}</span>
            </div>
            <ul className="space-y-2">
              {readyRows.map((row) => renderCard(row))}
            </ul>
          </section>
        )}

        {occupiedRows.length > 0 && (
          <section>
            <div className="flex items-baseline justify-between mb-2 px-1">
              <h2 className="text-xs font-bold uppercase tracking-wide text-sky-700">Occupied</h2>
              <span className="text-xs text-slate-500">{occupiedRows.length}</span>
            </div>
            <ul className="space-y-2">
              {occupiedRows.map((row) => renderCard(row))}
            </ul>
          </section>
        )}

        {filtered.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-sm text-slate-500">
            No properties match
          </div>
        )}
      </main>
      <TurnoverNav openCount={openTaskCount} issueCount={openIssueCount} />
    </div>
  );

  function renderCard(row: PropertyRow) {
    const applicable = stagesForRow(row);
    const total = totalItems(row);
    const done = progressCount(row);
    const allDone = total > 0 && done === total;
    const isExpanded = expanded === row.id;
    const isOccupied = row.occupancy === 'occupied';
    const isReady = row.occupancy === 'ready';

    const cardBorder = isOccupied
      ? 'border-sky-300 bg-sky-50/40'
      : isReady
        ? 'border-emerald-300 ring-1 ring-emerald-100 bg-emerald-50/30'
        : 'border-amber-200';

    const today = new Date().toISOString().split('T')[0];
    const departedToday = row.lastDeparture === today;
    const arrivesToday = row.nextArrival === today;
    const sameDayChangeover = !isOccupied && departedToday && arrivesToday;

    const fmtDate = (iso: string) => {
      const d = new Date(iso + 'T00:00:00');
      const todayDate = new Date(today + 'T00:00:00');
      const diffDays = Math.round((d.getTime() - todayDate.getTime()) / 86400000);
      if (diffDays === 0) return 'Today';
      if (diffDays === 1) return 'Tomorrow';
      if (diffDays === -1) return 'Yesterday';
      return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    };

    const occupiedStatus = isOccupied
      ? `Occupied${row.currentCheckOut ? ` · departs ${fmtDate(row.currentCheckOut)}` : ''}`
      : null;
    const daysSince = row.legionella.daysUnoccupied;
    const sinceLabel = row.lastDeparture
      ? daysSince === 0 ? 'today' : `${daysSince}d ago`
      : null;

    return (
      <li key={row.id} className={`relative overflow-hidden bg-white rounded-2xl border transition-all ${cardBorder} ${sameDayChangeover ? 'ring-2 ring-red-400' : ''}`}>
        {sameDayChangeover && (
          <>
            <div
              aria-hidden
              className="pointer-events-none absolute -top-8 -right-8 w-24 h-24 bg-red-500 rotate-45 shadow-[0_2px_6px_rgba(0,0,0,0.15)]"
            />
            <span className="pointer-events-none absolute top-[10px] right-[4px] rotate-45 text-[9px] font-bold uppercase tracking-wider text-white">
              Same day
            </span>
          </>
        )}
        <button
          onClick={() => setExpanded(isExpanded ? null : row.id)}
          className="w-full p-4 text-left"
          disabled={isOccupied}
        >
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-slate-900 truncate">{row.name}</span>
                {isOccupied && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-sky-100 text-sky-700">
                    Occupied
                  </span>
                )}
                {!isOccupied && allDone && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                    Ready
                  </span>
                )}
              </div>
              {isOccupied ? (
                <div className="text-xs text-slate-500 mt-0.5 truncate">{occupiedStatus}</div>
              ) : (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {row.lastDeparture && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                      <span className="text-slate-400">Out</span>
                      <span className="tabular-nums">{fmtDate(row.lastDeparture)}</span>
                      {sinceLabel && <span className="text-slate-400">· {sinceLabel}</span>}
                    </span>
                  )}
                  {row.nextArrival && (
                    <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${
                      arrivesToday ? 'bg-red-100 text-red-700' : 'bg-emerald-50 text-emerald-800'
                    }`}>
                      <span className={arrivesToday ? 'text-red-400' : 'text-emerald-500'}>In</span>
                      <span className="tabular-nums">{fmtDate(row.nextArrival)}</span>
                    </span>
                  )}
                  {!row.lastDeparture && !row.nextArrival && (
                    <span className="text-[11px] text-slate-400">No bookings on record</span>
                  )}
                </div>
              )}
            </div>
            {!isOccupied && (
              <>
                <div className="text-xs font-semibold text-slate-500 tabular-nums">
                  {done}/{total}
                </div>
                {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </>
            )}
          </div>

          {!isOccupied && (
            <div className={`mt-3 grid gap-1 ${applicable.length === 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
              {applicable.map((s) => {
                const isDone = !!row.session?.completed?.[s.key];
                return (
                  <div key={s.key} className="flex flex-col items-center gap-1">
                    <div className={`h-1.5 w-full rounded-full ${isDone ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                    <div className={`text-[10px] font-medium truncate ${isDone ? 'text-emerald-700' : 'text-slate-400'}`}>
                      {s.shortLabel}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </button>

        {!isOccupied && isExpanded && (
                  <div className="border-t border-slate-100 p-4 space-y-3 bg-slate-50/50 rounded-b-2xl">
                    <div className="flex flex-wrap gap-2">
                      <Link
                        to={`/turnover/issues?new=1&property=${encodeURIComponent(row.id)}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold px-3 py-1.5 rounded-full border border-red-200"
                      >
                        <AlertOctagon className="w-3.5 h-3.5" /> Report issue
                      </Link>
                      <Link
                        to={`/turnover/tasks?property=${encodeURIComponent(row.id)}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1.5 bg-teal-50 hover:bg-teal-100 text-teal-700 text-xs font-semibold px-3 py-1.5 rounded-full border border-teal-200"
                      >
                        <ListChecks className="w-3.5 h-3.5" /> View tasks
                      </Link>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {applicable.map((s) => {
                        const isDone = !!row.session?.completed?.[s.key];
                        const saving = savingKey === `${row.id}:${s.key}`;
                        const Icon = s.icon;
                        const legionellaHint = s.key === 'legionella' ? row.legionella.label : null;
                        return (
                          <button
                            key={s.key}
                            onClick={(e) => { e.stopPropagation(); if (!isDone) markStage(row, s.key); }}
                            disabled={isDone || saving || !performerName.trim()}
                            className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                              isDone
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                : 'bg-white border-slate-200 hover:border-teal-400 active:scale-[0.99]'
                            }`}
                          >
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                              isDone ? 'bg-emerald-100 text-emerald-700' : s.color
                            }`}>
                              {isDone ? <CheckCircle2 className="w-5 h-5" /> : <Icon className="w-4 h-4" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold">{s.label}</div>
                              <div className="text-xs text-slate-500 truncate">
                                {saving ? 'Saving...' : isDone ? 'Done' : legionellaHint || 'Tap to mark done'}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {row.dueTasks.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 pt-2">
                          <Gauge className="w-4 h-4 text-amber-600" />
                          <div className="text-xs font-bold uppercase tracking-wide text-amber-700">
                            Owner tasks due
                          </div>
                        </div>
                        {row.dueTasks.map((t) => {
                          const saving = savingKey === `${row.id}:task:${t.id}`;
                          const tv = taskValues[t.id] ?? { value: '', notes: '' };
                          const overdueDays = t.days_since_last !== null
                            ? t.days_since_last - t.recurrence_days
                            : null;
                          return (
                            <div
                              key={t.id}
                              onClick={(e) => e.stopPropagation()}
                              className="p-3 rounded-xl border border-amber-200 bg-white space-y-2"
                            >
                              <div>
                                <div className="text-sm font-semibold text-slate-900">{t.name}</div>
                                <div className="text-xs text-slate-500">
                                  Every {t.recurrence_days} day{t.recurrence_days === 1 ? '' : 's'}
                                  {t.last_performed_at
                                    ? ` · Last ${t.days_since_last}d ago${overdueDays !== null && overdueDays > 0 ? ` (+${overdueDays}d)` : ''}`
                                    : ' · Never done'}
                                </div>
                                {t.instructions && (
                                  <div className="text-xs text-slate-600 mt-1 whitespace-pre-wrap">{t.instructions}</div>
                                )}
                              </div>
                              {t.requires_value && (
                                <input
                                  type="text"
                                  value={tv.value}
                                  onChange={(e) => setTaskValues((prev) => ({ ...prev, [t.id]: { ...tv, value: e.target.value } }))}
                                  placeholder={t.value_label || 'Reading'}
                                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                                />
                              )}
                              <input
                                type="text"
                                value={tv.notes}
                                onChange={(e) => setTaskValues((prev) => ({ ...prev, [t.id]: { ...tv, notes: e.target.value } }))}
                                placeholder="Notes (optional)"
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                              />
                              <button
                                onClick={() => markOwnerTask(row, t)}
                                disabled={saving || !performerName.trim() || (t.requires_value && !tv.value.trim())}
                                className="w-full py-2.5 rounded-lg text-sm font-semibold bg-gradient-to-r from-amber-500 to-orange-500 text-white disabled:opacity-40"
                              >
                                {saving ? 'Saving...' : 'Mark done & notify owner'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
  }
}

// Suppress unused CheckType warning in strict builds
export type _Unused = CheckType;
