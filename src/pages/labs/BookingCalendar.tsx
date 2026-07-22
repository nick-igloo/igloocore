import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2, AlertCircle, X, FlaskConical, ChevronLeft, ChevronRight, RefreshCw,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════
// LABS · Booking Planner (tape chart)
// Properties as rows, days as columns, bookings as bars — the
// standard PMS planning view. Live from Avantio List Bookings per
// month; gaps read as empty tape, changeovers as butted bars.
// ═══════════════════════════════════════════════════════════════════

const WEBHOOK_URL =
  import.meta.env.VITE_N8N_CALENDAR_WEBHOOK_URL ||
  'https://igloo.app.n8n.cloud/webhook/booking-calendar';

const DAY = 86_400_000;
const CELL_W = 36;      // px per day
const ROW_H = 44;       // px per property row
const NAME_W = 180;     // sticky name column

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
  reference: string;
  accommodationId: string;
  arrival: Date;
  departure: Date;
  status: string;
  nights: number;
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const STATUS_STYLE: Record<string, string> = {
  PAID: 'bg-emerald-500 text-white',
  CONFIRMED: 'bg-emerald-500 text-white',
  UNPAID: 'bg-amber-400 text-amber-950',
  TPV_REQUEST: 'bg-blue-400 text-white',
  AVAILABILITY_REQUEST: 'bg-sky-300 text-sky-950',
  INFORMATION_REQUEST: 'bg-sky-300 text-sky-950',
  UNDER_REQUEST: 'bg-violet-300 text-violet-950',
};
const statusStyle = (s: string) => STATUS_STYLE[s.toUpperCase()] || 'bg-slate-400 text-white';

export default function BookingCalendar() {
  const [anchor, setAnchor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [bookings, setBookings] = useState<BookingVM[]>([]);
  const [accNames, setAccNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<BookingVM | null>(null);
  const [showAll, setShowAll] = useState(false);

  const monthStart = anchor;
  const daysInMonth = useMemo(() => new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate(), [anchor]);
  const monthEnd = useMemo(() => new Date(anchor.getFullYear(), anchor.getMonth(), daysInMonth), [anchor, daysInMonth]);

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
          const arrival = new Date(a); const departure = new Date(d);
          return {
            id: String(b.id ?? ''),
            reference: String(b.reference || b.id || ''),
            accommodationId: String(b.accommodationId ?? ''),
            arrival, departure,
            status: String(b.status || ''),
            nights: Math.max(1, Math.round((+departure - +arrival) / DAY)),
          };
        })
        .filter((b): b is BookingVM => b !== null && b.departure > monthStart && b.arrival <= monthEnd));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load bookings');
    } finally {
      setLoading(false);
    }
  }, [monthStart, monthEnd]);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    const withBookings = new Map<string, BookingVM[]>();
    for (const b of bookings) (withBookings.get(b.accommodationId) ?? withBookings.set(b.accommodationId, []).get(b.accommodationId)!).push(b);
    const ids = showAll
      ? [...new Set([...Object.keys(accNames), ...withBookings.keys()])]
      : [...withBookings.keys()];
    return ids
      .map(id => ({ id, name: accNames[id] || `#${id}`, bookings: withBookings.get(id) ?? [] }))
      .sort((a, b) => b.bookings.length - a.bookings.length || a.name.localeCompare(b.name));
  }, [bookings, accNames, showAll]);

  const monthLabel = anchor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const todayIdx = Math.floor((+new Date(iso(new Date())) - +monthStart) / DAY);
  const move = (delta: number) => setAnchor(a => new Date(a.getFullYear(), a.getMonth() + delta, 1));

  // Bar geometry: half-day insets so back-to-back bookings butt at the
  // changeover cell instead of overlapping (standard tape-chart look).
  const barPos = (b: BookingVM) => {
    const startDays = Math.max(0, (+b.arrival - +monthStart) / DAY + 0.5);
    const endDays = Math.min(daysInMonth, (+b.departure - +monthStart) / DAY + 0.5);
    const clippedStart = b.arrival < monthStart;
    const clippedEnd = b.departure > monthEnd;
    return {
      left: (clippedStart ? 0 : startDays) * CELL_W,
      width: ((clippedEnd ? daysInMonth : endDays) - (clippedStart ? 0 : startDays)) * CELL_W,
      clippedStart, clippedEnd,
    };
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex items-center gap-2.5 mb-5 flex-wrap">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-100 text-violet-700 text-[11px] font-bold uppercase tracking-wider">
          <FlaskConical className="w-3.5 h-3.5" /> Labs
        </span>
        <h1 className="text-xl font-bold text-slate-900">Booking Planner</h1>
        <span className="text-xs text-slate-400 hidden sm:inline">Live from Avantio · test credentials · read-only</span>
        <div className="flex-1" />
        <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 cursor-pointer mr-2">
          <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} className="rounded" />
          Show empty properties
        </label>
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
            {bookings.length} booking{bookings.length === 1 ? '' : 's'} · {rows.filter(r => r.bookings.length).length} propert{rows.filter(r => r.bookings.length).length === 1 ? 'y' : 'ies'}
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

      {selected && (
        <div className="mb-4 bg-white rounded-2xl border border-blue-200 shadow-sm p-4 flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-slate-900">{accNames[selected.accommodationId] || `#${selected.accommodationId}`}</div>
            <div className="text-xs text-slate-500 mt-0.5">
              {iso(selected.arrival)} → {iso(selected.departure)} · {selected.nights} night{selected.nights === 1 ? '' : 's'}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">Ref {selected.reference} · {selected.status}</div>
          </div>
          <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-slate-400">
          <Loader2 className="w-8 h-8 mx-auto animate-spin mb-3" />
          <p className="text-sm">Loading bookings for {monthLabel}…</p>
        </div>
      ) : rows.length === 0 && !error ? (
        <div className="text-center py-16 text-slate-400">
          <p className="text-sm">No bookings overlap {monthLabel}.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          <div style={{ minWidth: NAME_W + daysInMonth * CELL_W }}>
            {/* Day header */}
            <div className="flex border-b border-slate-200 sticky top-0 bg-white z-20">
              <div className="shrink-0 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 sticky left-0 bg-white z-30 border-r border-slate-100"
                style={{ width: NAME_W }}>
                Property
              </div>
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const d = new Date(+monthStart + i * DAY);
                const dow = d.getDay();
                const weekend = dow === 0 || dow === 6;
                return (
                  <div key={i}
                    className={`shrink-0 text-center py-1.5 border-r border-slate-50 ${weekend ? 'bg-slate-50' : ''} ${i === todayIdx ? 'bg-blue-50' : ''}`}
                    style={{ width: CELL_W }}>
                    <div className="text-[9px] font-semibold text-slate-400">{['S', 'M', 'T', 'W', 'T', 'F', 'S'][dow]}</div>
                    <div className={`text-[11px] font-bold ${i === todayIdx ? 'text-blue-600' : 'text-slate-600'}`}>{i + 1}</div>
                  </div>
                );
              })}
            </div>

            {/* Rows */}
            {rows.map(row => (
              <div key={row.id} className="flex border-b border-slate-100 last:border-b-0 relative" style={{ height: ROW_H }}>
                <div className="shrink-0 px-3 flex items-center sticky left-0 bg-white z-10 border-r border-slate-100"
                  style={{ width: NAME_W }}>
                  <span className="text-xs font-semibold text-slate-800 truncate" title={`${row.name} (#${row.id})`}>{row.name}</span>
                </div>
                {/* Day cells backdrop */}
                <div className="relative" style={{ width: daysInMonth * CELL_W }}>
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const dow = new Date(+monthStart + i * DAY).getDay();
                    const weekend = dow === 0 || dow === 6;
                    return (
                      <div key={i}
                        className={`absolute top-0 h-full border-r border-slate-50 ${weekend ? 'bg-slate-50/70' : ''} ${i === todayIdx ? 'bg-blue-50/60' : ''}`}
                        style={{ left: i * CELL_W, width: CELL_W }} />
                    );
                  })}
                  {/* Booking bars */}
                  {row.bookings.map(b => {
                    const { left, width, clippedStart, clippedEnd } = barPos(b);
                    return (
                      <button key={b.id} onClick={() => setSelected(b)}
                        title={`${row.name} · ${iso(b.arrival)} → ${iso(b.departure)} · ${b.nights}n · ${b.status}`}
                        className={`absolute flex items-center px-1.5 text-[10px] font-bold truncate shadow-sm hover:brightness-95 ${statusStyle(b.status)} ${
                          clippedStart ? 'rounded-r-md' : clippedEnd ? 'rounded-l-md' : 'rounded-md'
                        }`}
                        style={{ left, width: Math.max(width, 14), top: 7, height: ROW_H - 14 }}>
                        {width > 50 ? `${b.nights}n` : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="mt-3 flex items-center gap-3 flex-wrap text-[11px] text-slate-400">
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500 inline-block" /> paid/confirmed</span>
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-400 inline-block" /> unpaid</span>
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-400 inline-block" /> payment pending</span>
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-sky-300 inline-block" /> enquiry</span>
          <span>· empty tape = gap · butted bars = changeover · click a bar for details</span>
        </div>
      )}
    </div>
  );
}
