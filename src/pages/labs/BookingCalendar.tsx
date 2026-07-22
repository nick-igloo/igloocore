import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2, AlertCircle, X, FlaskConical, ChevronLeft, ChevronRight,
  LogIn, LogOut, RefreshCw, Repeat,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════
// LABS · Booking Calendar
// Month view of arrivals and departures pulled live from Avantio
// List Bookings (filtered to bookings overlapping the month), with
// accommodation names joined in and changeover days flagged.
// ═══════════════════════════════════════════════════════════════════

const WEBHOOK_URL =
  import.meta.env.VITE_N8N_CALENDAR_WEBHOOK_URL ||
  'https://igloo.app.n8n.cloud/webhook/booking-calendar';

// Booking preview shape isn't expanded in the API reference —
// normalise defensively.
interface RawBooking {
  id?: string | number;
  reference?: string;
  accommodation?: string | number | { id?: string | number; name?: string };
  accommodationId?: string | number;
  arrivalDate?: string;
  departureDate?: string;
  status?: string;
  customerName?: string;
  customer?: { name?: string } | string;
  [key: string]: unknown;
}

interface BookingVM {
  id: string;
  reference: string;
  accommodationId: string;
  accommodationName: string;
  arrival: string;   // YYYY-MM-DD
  departure: string; // YYYY-MM-DD
  status: string;
  guest: string;
  nights: number;
}

const DAY = 86_400_000;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function normalise(b: RawBooking, accNames: Record<string, string>): BookingVM | null {
  const arrival = String(b.arrivalDate || '').slice(0, 10);
  const departure = String(b.departureDate || '').slice(0, 10);
  if (!arrival || !departure) return null;
  const accRaw = b.accommodation;
  const accommodationId = String(
    (typeof accRaw === 'object' && accRaw ? accRaw.id : accRaw) ?? b.accommodationId ?? '',
  );
  const accName =
    (typeof accRaw === 'object' && accRaw?.name) || accNames[accommodationId] || (accommodationId ? `#${accommodationId}` : 'Unknown');
  const guest = String(
    b.customerName || (typeof b.customer === 'object' && b.customer ? b.customer.name : b.customer) || '',
  );
  return {
    id: String(b.id ?? b.reference ?? `${accommodationId}-${arrival}`),
    reference: String(b.reference || b.id || ''),
    accommodationId,
    accommodationName: String(accName),
    arrival,
    departure,
    status: String(b.status || ''),
    guest,
    nights: Math.max(1, Math.round((+new Date(departure) - +new Date(arrival)) / DAY)),
  };
}

export default function BookingCalendar() {
  const [anchor, setAnchor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [bookings, setBookings] = useState<BookingVM[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<BookingVM | null>(null);

  const monthStart = anchor;
  const monthEnd = useMemo(() => new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0), [anchor]);

  const load = useCallback(async () => {
    setLoading(true); setError(null); setSelected(null);
    try {
      const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'month', from: iso(monthStart), to: iso(monthEnd) }),
      });
      if (!res.ok) throw new Error(`Webhook returned ${res.status} — is the n8n workflow active?`);
      const payload = await res.json();
      const accNames: Record<string, string> = {};
      for (const a of payload?.accommodations ?? []) accNames[String(a.id)] = a.name || String(a.id);
      const list: RawBooking[] = payload?.bookings ?? [];
      setBookings(list.map(b => normalise(b, accNames)).filter((b): b is BookingVM => b !== null));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load bookings');
    } finally {
      setLoading(false);
    }
  }, [monthStart, monthEnd]);

  useEffect(() => { load(); }, [load]);

  // Build the grid: weeks of 7 days, Monday-first.
  const weeks = useMemo(() => {
    const firstDow = (monthStart.getDay() + 6) % 7; // Mon=0
    const gridStart = new Date(+monthStart - firstDow * DAY);
    const cells: Date[] = [];
    for (let i = 0; i < 42; i++) cells.push(new Date(+gridStart + i * DAY));
    const w: Date[][] = [];
    for (let i = 0; i < 6; i++) w.push(cells.slice(i * 7, i * 7 + 7));
    // Drop trailing weeks entirely outside the month
    return w.filter(week => week.some(d => d.getMonth() === monthStart.getMonth()));
  }, [monthStart]);

  const byDay = useMemo(() => {
    const map: Record<string, { arrivals: BookingVM[]; departures: BookingVM[] }> = {};
    for (const b of bookings) {
      (map[b.arrival] ??= { arrivals: [], departures: [] }).arrivals.push(b);
      (map[b.departure] ??= { arrivals: [], departures: [] }).departures.push(b);
    }
    return map;
  }, [bookings]);

  const changeoverDays = useMemo(() => {
    const set = new Set<string>();
    for (const [day, ev] of Object.entries(byDay)) {
      const outProps = new Set(ev.departures.map(b => b.accommodationId));
      if (ev.arrivals.some(b => outProps.has(b.accommodationId))) set.add(day);
    }
    return set;
  }, [byDay]);

  const monthLabel = anchor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const todayIso = iso(new Date());
  const move = (delta: number) => setAnchor(a => new Date(a.getFullYear(), a.getMonth() + delta, 1));

  const monthTotals = useMemo(() => ({
    arrivals: bookings.filter(b => b.arrival >= iso(monthStart) && b.arrival <= iso(monthEnd)).length,
    departures: bookings.filter(b => b.departure >= iso(monthStart) && b.departure <= iso(monthEnd)).length,
    changeovers: [...changeoverDays].filter(d => d >= iso(monthStart) && d <= iso(monthEnd)).length,
  }), [bookings, changeoverDays, monthStart, monthEnd]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex items-center gap-2.5 mb-5 flex-wrap">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-100 text-violet-700 text-[11px] font-bold uppercase tracking-wider">
          <FlaskConical className="w-3.5 h-3.5" /> Labs
        </span>
        <h1 className="text-xl font-bold text-slate-900">Booking Calendar</h1>
        <span className="text-xs text-slate-400 hidden sm:inline">Live from Avantio · test credentials · read-only</span>
        <div className="flex-1" />
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
        <div className="flex-1" />
        {!loading && !error && (
          <div className="flex items-center gap-3 text-xs font-semibold text-slate-500">
            <span className="inline-flex items-center gap-1"><LogIn className="w-3.5 h-3.5 text-emerald-500" /> {monthTotals.arrivals} in</span>
            <span className="inline-flex items-center gap-1"><LogOut className="w-3.5 h-3.5 text-rose-500" /> {monthTotals.departures} out</span>
            <span className="inline-flex items-center gap-1"><Repeat className="w-3.5 h-3.5 text-violet-500" /> {monthTotals.changeovers} changeover days</span>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-red-700 text-sm flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      {selected && (
        <div className="mb-4 bg-white rounded-2xl border border-blue-200 shadow-sm p-4 flex items-start gap-4 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <div className="text-sm font-bold text-slate-900">{selected.accommodationName}</div>
            <div className="text-xs text-slate-500 mt-0.5">
              {selected.guest && <span className="font-semibold">{selected.guest} · </span>}
              {selected.arrival} → {selected.departure} · {selected.nights} night{selected.nights === 1 ? '' : 's'}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Ref {selected.reference || '—'}{selected.status && ` · ${selected.status}`}
            </div>
          </div>
          <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-slate-400">
          <Loader2 className="w-8 h-8 mx-auto animate-spin mb-3" />
          <p className="text-sm">Loading bookings for {monthLabel}…</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="grid grid-cols-7 border-b border-slate-100">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
              <div key={d} className="px-2 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 text-center">{d}</div>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 border-b border-slate-100 last:border-b-0">
              {week.map(day => {
                const dIso = iso(day);
                const inMonth = day.getMonth() === monthStart.getMonth();
                const ev = byDay[dIso];
                const isToday = dIso === todayIso;
                const isChangeover = changeoverDays.has(dIso);
                return (
                  <div key={dIso}
                    className={`min-h-[92px] border-r border-slate-100 last:border-r-0 p-1.5 ${inMonth ? '' : 'bg-slate-50/60'}`}>
                    <div className="flex items-center gap-1 mb-1">
                      <span className={`text-[11px] font-bold w-5 h-5 flex items-center justify-center rounded-full ${
                        isToday ? 'bg-blue-600 text-white' : inMonth ? 'text-slate-600' : 'text-slate-300'
                      }`}>
                        {day.getDate()}
                      </span>
                      {isChangeover && inMonth && (
                        <span title="Changeover: same property out and in today">
                          <Repeat className="w-3 h-3 text-violet-500" />
                        </span>
                      )}
                    </div>
                    <div className="space-y-0.5">
                      {ev?.departures.map(b => (
                        <button key={`o${b.id}`} onClick={() => setSelected(b)}
                          title={`OUT · ${b.accommodationName} · ${b.guest || b.reference}`}
                          className="w-full flex items-center gap-1 px-1 py-0.5 rounded bg-rose-50 hover:bg-rose-100 text-left">
                          <LogOut className="w-3 h-3 text-rose-500 shrink-0" />
                          <span className="text-[10px] font-semibold text-rose-700 truncate">{b.accommodationName}</span>
                        </button>
                      ))}
                      {ev?.arrivals.map(b => (
                        <button key={`i${b.id}`} onClick={() => setSelected(b)}
                          title={`IN · ${b.accommodationName} · ${b.guest || b.reference}`}
                          className="w-full flex items-center gap-1 px-1 py-0.5 rounded bg-emerald-50 hover:bg-emerald-100 text-left">
                          <LogIn className="w-3 h-3 text-emerald-500 shrink-0" />
                          <span className="text-[10px] font-semibold text-emerald-700 truncate">{b.accommodationName}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {!loading && !error && (
        <p className="mt-3 text-[11px] text-slate-400">
          Green = arrival · red = departure · <Repeat className="w-3 h-3 inline text-violet-500" /> = changeover day (same property out and in).
          Click any booking for details. Showing up to 100 bookings overlapping the month.
        </p>
      )}
    </div>
  );
}
