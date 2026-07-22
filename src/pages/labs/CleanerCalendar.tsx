import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2, AlertCircle, X, FlaskConical, ChevronLeft, ChevronRight, RefreshCw,
  AlarmClock, Leaf, Sparkles,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════
// LABS · Cleaner Calendar
// The Booking Planner reframed for cleaner eyes: bookings fade to
// background tape, and the SEAMS become the content — every
// departure is a cleaning job, urgent red when a new guest arrives
// the same day, relaxed green when the property sits empty after.
// Same webhook as the planner; live version filters to the signed-in
// cleaner's assigned properties from Supabase.
// ═══════════════════════════════════════════════════════════════════

const WEBHOOK_URL =
  import.meta.env.VITE_N8N_CALENDAR_WEBHOOK_URL ||
  'https://igloo.app.n8n.cloud/webhook/booking-calendar';

const DAY = 86_400_000;
const CELL_W = 34;
const ROW_H = 40;
const NAME_W = 160;

interface RawBooking {
  id?: string | number;
  reference?: string;
  accommodationId?: string | number;
  stayDates?: { arrival?: string; departure?: string };
  status?: string;
  [key: string]: unknown;
}

interface BookingVM {
  id: string;
  accommodationId: string;
  arrival: Date;
  departure: Date;
}

interface Job {
  id: string;
  accommodationId: string;
  propertyName: string;
  date: Date;           // departure day = clean day
  urgent: boolean;      // same-day incoming guest
  nextArrival: Date | null;
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmtDay = (d: Date) => d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtShort = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export default function CleanerCalendar() {
  const [anchor, setAnchor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [bookings, setBookings] = useState<BookingVM[]>([]);
  const [accNames, setAccNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [propertyFilter, setPropertyFilter] = useState<string>('all');

  const monthStart = anchor;
  const daysInMonth = useMemo(() => new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate(), [anchor]);
  const monthEnd = useMemo(() => new Date(anchor.getFullYear(), anchor.getMonth(), daysInMonth), [anchor, daysInMonth]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'month', from: iso(monthStart), to: iso(monthEnd) }),
      });
      if (!res.ok) throw new Error(`Webhook returned ${res.status} — is the n8n workflow active?`);
      const payload = await res.json();
      const names: Record<string, string> = {};
      for (const a of payload?.accommodations ?? []) names[String(a.id)] = a.name || `#${a.id}`;
      setAccNames(names);
      const list: RawBooking[] = payload?.bookings ?? [];
      setBookings(list
        .map((b): BookingVM | null => {
          const a = String(b.stayDates?.arrival || '').slice(0, 10);
          const d = String(b.stayDates?.departure || '').slice(0, 10);
          if (!a || !d) return null;
          if (String(b.status || '').toUpperCase() === 'CANCELLED') return null;
          return { id: String(b.id ?? ''), accommodationId: String(b.accommodationId ?? ''), arrival: new Date(a), departure: new Date(d) };
        })
        .filter((b): b is BookingVM => b !== null));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load bookings');
    } finally {
      setLoading(false);
    }
  }, [monthStart, monthEnd]);

  useEffect(() => { load(); }, [load]);

  // Derive jobs: every departure inside the month is a clean.
  const jobs = useMemo<Job[]>(() => {
    const byProp = new Map<string, BookingVM[]>();
    for (const b of bookings) (byProp.get(b.accommodationId) ?? byProp.set(b.accommodationId, []).get(b.accommodationId)!).push(b);
    const out: Job[] = [];
    for (const [propId, list] of byProp) {
      const arrivals = list.map(b => +b.arrival).sort((x, y) => x - y);
      for (const b of list) {
        if (b.departure < monthStart || b.departure > monthEnd) continue;
        const depT = +b.departure;
        const nextT = arrivals.find(a => a >= depT);
        out.push({
          id: `${propId}-${b.id}`,
          accommodationId: propId,
          propertyName: accNames[propId] || `#${propId}`,
          date: b.departure,
          urgent: nextT === depT,
          nextArrival: nextT != null ? new Date(nextT) : null,
        });
      }
    }
    return out
      .filter(j => propertyFilter === 'all' || j.accommodationId === propertyFilter)
      .sort((a, b) => +a.date - +b.date || Number(b.urgent) - Number(a.urgent));
  }, [bookings, accNames, monthStart, monthEnd, propertyFilter]);

  const jobsByDay = useMemo(() => {
    const map = new Map<string, Job[]>();
    for (const j of jobs) (map.get(iso(j.date)) ?? map.set(iso(j.date), []).get(iso(j.date))!).push(j);
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [jobs]);

  const rowsWithJobs = useMemo(() => {
    const ids = [...new Set(jobs.map(j => j.accommodationId))];
    return ids.map(id => ({
      id,
      name: accNames[id] || `#${id}`,
      bookings: bookings.filter(b => b.accommodationId === id && b.departure > monthStart && b.arrival <= monthEnd),
      jobs: jobs.filter(j => j.accommodationId === id),
    }));
  }, [jobs, bookings, accNames, monthStart, monthEnd]);

  const propertyOptions = useMemo(() => {
    const ids = [...new Set(bookings.map(b => b.accommodationId))];
    return ids.map(id => ({ id, name: accNames[id] || `#${id}` })).sort((a, b) => a.name.localeCompare(b.name));
  }, [bookings, accNames]);

  const monthLabel = anchor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const todayIdx = Math.floor((+new Date(iso(new Date())) - +monthStart) / DAY);
  const move = (delta: number) => setAnchor(a => new Date(a.getFullYear(), a.getMonth() + delta, 1));
  const urgentCount = jobs.filter(j => j.urgent).length;

  const SLANT = 8;
  const barPos = (b: BookingVM) => {
    const startDays = (+b.arrival - +monthStart) / DAY + 0.5;
    const endDays = (+b.departure - +monthStart) / DAY + 0.5;
    const clippedStart = startDays < 0;
    const clippedEnd = endDays > daysInMonth;
    const left = (clippedStart ? 0 : startDays) * CELL_W;
    const width = ((clippedEnd ? daysInMonth : endDays) - (clippedStart ? 0 : startDays)) * CELL_W;
    const tl = clippedStart ? 0 : SLANT;
    const br = clippedEnd ? 0 : SLANT;
    return { left, width, clipPath: `polygon(${tl}px 0, 100% 0, calc(100% - ${br}px) 100%, 0 100%)` };
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex items-center gap-2.5 mb-5 flex-wrap">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-100 text-violet-700 text-[11px] font-bold uppercase tracking-wider">
          <FlaskConical className="w-3.5 h-3.5" /> Labs
        </span>
        <h1 className="text-xl font-bold text-slate-900">Cleaner Calendar</h1>
        <span className="text-xs text-slate-400 hidden sm:inline">Jobs derived live from Avantio departures · test credentials</span>
        <div className="flex-1" />
        <select
          value={propertyFilter}
          onChange={e => setPropertyFilter(e.target.value)}
          className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-200 text-slate-600"
        >
          <option value="all">All properties</option>
          {propertyOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button onClick={load} disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-40">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => move(-1)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><ChevronLeft className="w-5 h-5" /></button>
        <h2 className="text-lg font-bold text-slate-900 w-44 text-center">{monthLabel}</h2>
        <button onClick={() => move(1)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><ChevronRight className="w-5 h-5" /></button>
        <button onClick={() => setAnchor(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); })}
          className="px-3 py-1 text-xs font-semibold rounded-lg text-slate-600 bg-white border border-slate-200 hover:bg-slate-50">
          Today
        </button>
        {!loading && !error && (
          <span className="text-xs font-semibold text-slate-500 ml-2">
            {jobs.length} clean{jobs.length === 1 ? '' : 's'} · <span className="text-red-600">{urgentCount} same-day changeover{urgentCount === 1 ? '' : 's'}</span>
          </span>
        )}
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-red-700 text-sm flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-slate-400">
          <Loader2 className="w-8 h-8 mx-auto animate-spin mb-3" />
          <p className="text-sm">Working out the cleans for {monthLabel}…</p>
        </div>
      ) : jobs.length === 0 && !error ? (
        <div className="text-center py-16 text-slate-400">
          <Sparkles className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No cleans this month{propertyFilter !== 'all' ? ' for this property' : ''}.</p>
        </div>
      ) : (
        <>
          {/* Muted tape with job markers */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto mb-6">
            <div style={{ minWidth: NAME_W + daysInMonth * CELL_W }}>
              <div className="flex border-b border-slate-200 bg-white">
                <div className="shrink-0 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 sticky left-0 bg-white z-30 border-r border-slate-100" style={{ width: NAME_W }}>
                  Property
                </div>
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const d = new Date(+monthStart + i * DAY);
                  const dow = d.getDay();
                  const weekend = dow === 0 || dow === 6;
                  return (
                    <div key={i} className={`shrink-0 text-center py-1.5 border-r border-slate-50 ${weekend ? 'bg-slate-50' : ''} ${i === todayIdx ? 'bg-blue-50' : ''}`} style={{ width: CELL_W }}>
                      <div className="text-[9px] font-semibold text-slate-400">{['S','M','T','W','T','F','S'][dow]}</div>
                      <div className={`text-[11px] font-bold ${i === todayIdx ? 'text-blue-600' : 'text-slate-600'}`}>{i + 1}</div>
                    </div>
                  );
                })}
              </div>
              {rowsWithJobs.map(row => (
                <div key={row.id} className="flex border-b border-slate-100 last:border-b-0 relative" style={{ height: ROW_H }}>
                  <div className="shrink-0 px-3 flex items-center sticky left-0 bg-white z-10 border-r border-slate-100" style={{ width: NAME_W }}>
                    <span className="text-xs font-semibold text-slate-800 truncate" title={row.name}>{row.name}</span>
                  </div>
                  <div className="relative" style={{ width: daysInMonth * CELL_W }}>
                    {Array.from({ length: daysInMonth }).map((_, i) => {
                      const dow = new Date(+monthStart + i * DAY).getDay();
                      const weekend = dow === 0 || dow === 6;
                      return <div key={i} className={`absolute top-0 h-full border-r border-slate-50 ${weekend ? 'bg-slate-50/70' : ''} ${i === todayIdx ? 'bg-blue-50/60' : ''}`} style={{ left: i * CELL_W, width: CELL_W }} />;
                    })}
                    {/* faded booking tape */}
                    {row.bookings.map(b => {
                      const { left, width, clipPath } = barPos(b);
                      return <div key={b.id} className="absolute bg-slate-200/80" style={{ left, width: Math.max(width, 12), top: 8, height: ROW_H - 16, clipPath }} />;
                    })}
                    {/* job markers on departure days */}
                    {row.jobs.map(j => {
                      const dayIdx = Math.floor((+j.date - +monthStart) / DAY);
                      return (
                        <div key={j.id}
                          title={j.urgent ? `Same-day changeover · clean by check-in` : `Checkout clean · next guest ${j.nextArrival ? fmtShort(j.nextArrival) : 'not booked yet'}`}
                          className={`absolute rounded-full flex items-center justify-center ${j.urgent ? 'bg-red-500' : 'bg-emerald-500'}`}
                          style={{ left: dayIdx * CELL_W + CELL_W / 2 - 8, top: ROW_H / 2 - 8, width: 16, height: 16 }}>
                          <Sparkles className="w-2.5 h-2.5 text-white" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Job list, day by day */}
          <div className="space-y-4">
            {jobsByDay.map(([day, dayJobs]) => (
              <div key={day}>
                <h3 className="text-sm font-bold text-slate-700 mb-2">{fmtDay(new Date(day))}</h3>
                <div className="space-y-2">
                  {dayJobs.map(j => (
                    <div key={j.id} className={`bg-white rounded-xl border shadow-sm p-3.5 flex items-center gap-3 ${j.urgent ? 'border-red-200' : 'border-slate-200'}`}>
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${j.urgent ? 'bg-red-50' : 'bg-emerald-50'}`}>
                        {j.urgent ? <AlarmClock className="w-4.5 h-4.5 text-red-500" /> : <Leaf className="w-4.5 h-4.5 text-emerald-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-900 truncate">{j.propertyName}</div>
                        <div className="text-xs text-slate-500">
                          {j.urgent
                            ? 'Same-day changeover — guest arriving today, clean by check-in'
                            : j.nextArrival
                              ? `Checkout clean — next guest arrives ${fmtShort(j.nextArrival)}`
                              : 'Checkout clean — no incoming booking yet'}
                        </div>
                      </div>
                      <span className={`px-2 py-1 rounded-md text-[11px] font-bold ${j.urgent ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                        {j.urgent ? 'BY 4PM' : 'FLEXIBLE'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <p className="mt-4 text-[11px] text-slate-400">
            Every departure is a clean. Red = same-day changeover (new guest arrives that day). Green = flexible (property empty after checkout).
            Live version filters to the signed-in cleaner's assigned properties and adds welcome pack size + special rules from Supabase.
          </p>
        </>
      )}
    </div>
  );
}
