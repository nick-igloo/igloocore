import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2, RefreshCw, AlertCircle, X, FlaskConical, CalendarRange, Moon,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════
// LABS · Gap Finder
// Demo: scan every accommodation's availability calendar (Avantio
// GET /accommodations/{id}/availabilities via n8n) and surface the
// bookable gaps — orphan nights and short windows — over the next
// six months. Read-only; groundwork for gap-driven ad campaigns and
// orphan-night offers.
// ═══════════════════════════════════════════════════════════════════

const WEBHOOK_URL =
  import.meta.env.VITE_N8N_GAPFINDER_WEBHOOK_URL ||
  'https://igloo.app.n8n.cloud/webhook/gap-finder';

const WINDOW_DAYS = 183; // ~6 months

// Availability season shape isn't expanded in the API reference —
// normalise defensively across likely field names.
interface RawSeason {
  from?: string; to?: string;
  startDate?: string; endDate?: string;
  start?: string; end?: string;
  status?: string; state?: string;
  available?: boolean;
  [key: string]: unknown;
}

interface PropertyScan {
  id: string;
  name: string;
  seasons?: RawSeason[];
  availabilities?: RawSeason[] | { seasons?: RawSeason[] };
  data?: RawSeason[] | { seasons?: RawSeason[] };
  error?: string;
  [key: string]: unknown;
}

interface Season { from: Date; to: Date; available: boolean }
interface Gap { from: Date; to: Date; nights: number; kind: 'orphan' | 'short' | 'long' }
interface PropertyVM { id: string; name: string; seasons: Season[]; gaps: Gap[]; error?: string }

const DAY = 86_400_000;
const clampDate = (d: Date, min: Date, max: Date) => new Date(Math.min(Math.max(d.getTime(), min.getTime()), max.getTime()));

function extractSeasons(p: PropertyScan): RawSeason[] {
  const candidates: unknown[] = [
    p.seasons, p.availabilities, p.data,
    (p.availabilities as { seasons?: RawSeason[] } | undefined)?.seasons,
    (p.data as { seasons?: RawSeason[] } | undefined)?.seasons,
  ];
  for (const c of candidates) if (Array.isArray(c) && c.length) return c as RawSeason[];
  return [];
}

function isAvailable(s: RawSeason): boolean {
  if (typeof s.available === 'boolean') return s.available;
  const status = String(s.status ?? s.state ?? '').toUpperCase();
  return status.includes('AVAILABLE') && !status.includes('UN') && !status.includes('NOT');
}

function normalise(p: PropertyScan, windowStart: Date, windowEnd: Date): PropertyVM {
  const seasons: Season[] = extractSeasons(p)
    .map(s => {
      const fromRaw = s.from ?? s.startDate ?? s.start;
      const toRaw = s.to ?? s.endDate ?? s.end;
      if (!fromRaw || !toRaw) return null;
      const from = new Date(String(fromRaw));
      const to = new Date(String(toRaw));
      if (Number.isNaN(+from) || Number.isNaN(+to) || to <= windowStart || from >= windowEnd) return null;
      return { from: clampDate(from, windowStart, windowEnd), to: clampDate(to, windowStart, windowEnd), available: isAvailable(s) };
    })
    .filter((s): s is Season => s !== null)
    .sort((a, b) => +a.from - +b.from);

  const gaps: Gap[] = seasons
    .filter(s => s.available)
    .map(s => {
      const nights = Math.max(0, Math.round((+s.to - +s.from) / DAY));
      const kind: Gap['kind'] = nights <= 3 ? 'orphan' : nights <= 7 ? 'short' : 'long';
      return { from: s.from, to: s.to, nights, kind };
    })
    .filter(g => g.nights > 0);

  return { id: p.id, name: p.name || p.id, seasons, gaps, error: p.error };
}

const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export default function GapFinder() {
  const [properties, setProperties] = useState<PropertyVM[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const windowStart = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const windowEnd = useMemo(() => new Date(+windowStart + WINDOW_DAYS * DAY), [windowStart]);

  const scan = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'scan' }),
      });
      if (!res.ok) throw new Error(`Webhook returned ${res.status} — is the n8n workflow active?`);
      const payload = await res.json();
      const list: PropertyScan[] = payload?.properties ?? (Array.isArray(payload) ? payload : []);
      setProperties(list.map(p => normalise(p, windowStart, windowEnd)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan failed');
    } finally {
      setLoading(false);
    }
  }, [windowStart, windowEnd]);

  useEffect(() => { scan(); }, [scan]);

  const totals = useMemo(() => {
    const gaps = properties.flatMap(p => p.gaps);
    return {
      orphanNights: gaps.filter(g => g.kind === 'orphan').reduce((n, g) => n + g.nights, 0),
      orphanWindows: gaps.filter(g => g.kind === 'orphan').length,
      shortWindows: gaps.filter(g => g.kind === 'short').length,
      soon: gaps.filter(g => +g.from - +windowStart < 30 * DAY).length,
    };
  }, [properties, windowStart]);

  const pct = (d: Date) => `${(((+d - +windowStart) / (WINDOW_DAYS * DAY)) * 100).toFixed(2)}%`;
  const widthPct = (a: Date, b: Date) => `${Math.max(0.5, ((+b - +a) / (WINDOW_DAYS * DAY)) * 100).toFixed(2)}%`;

  const monthTicks = useMemo(() => {
    const ticks: { label: string; left: string }[] = [];
    const d = new Date(windowStart.getFullYear(), windowStart.getMonth() + 1, 1);
    while (d < windowEnd) {
      ticks.push({ label: d.toLocaleDateString('en-GB', { month: 'short' }), left: pct(d) });
      d.setMonth(d.getMonth() + 1);
    }
    return ticks;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowStart, windowEnd]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex items-center gap-2.5 mb-6">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-100 text-violet-700 text-[11px] font-bold uppercase tracking-wider">
          <FlaskConical className="w-3.5 h-3.5" /> Labs
        </span>
        <h1 className="text-xl font-bold text-slate-900">Gap Finder</h1>
        <span className="text-xs text-slate-400 hidden sm:inline">
          Next 6 months · Avantio test credentials · read-only
        </span>
        <div className="flex-1" />
        <button
          onClick={scan}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Rescan
        </button>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-red-700 text-sm flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      {!loading && !error && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Orphan nights', value: totals.orphanNights, accent: 'text-amber-600' },
            { label: 'Orphan windows (≤3 nights)', value: totals.orphanWindows, accent: 'text-amber-600' },
            { label: 'Short windows (4–7)', value: totals.shortWindows, accent: 'text-blue-600' },
            { label: 'Gaps in next 30 days', value: totals.soon, accent: 'text-slate-900' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <div className={`text-2xl font-bold ${s.accent}`}>{s.value}</div>
              <div className="text-[11px] text-slate-400 font-semibold mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {loading && (
        <div className="text-center py-16 text-slate-400">
          <Loader2 className="w-8 h-8 mx-auto animate-spin mb-3" />
          <p className="text-sm">Scanning availability calendars…</p>
        </div>
      )}

      {!loading && properties.length === 0 && !error && (
        <div className="text-center py-16 text-slate-400">
          <CalendarRange className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No accommodations returned from the scan.</p>
        </div>
      )}

      <div className="space-y-3">
        {properties.map(p => (
          <div key={p.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-semibold text-slate-900">{p.name}</span>
              <span className="text-[11px] text-slate-400">#{p.id}</span>
              {p.gaps.some(g => g.kind === 'orphan') && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-600 text-[11px] font-semibold">
                  <Moon className="w-3 h-3" /> orphan nights
                </span>
              )}
              {p.error && <span className="text-[11px] text-red-500">{p.error}</span>}
            </div>

            <div className="relative h-7 rounded-lg bg-slate-100 overflow-hidden">
              {p.seasons.map((s, i) => (
                <div
                  key={i}
                  title={`${fmt(s.from)} → ${fmt(s.to)} · ${s.available ? 'available' : 'unavailable'}`}
                  className={`absolute top-0 h-full ${s.available ? 'bg-emerald-300' : 'bg-slate-300'}`}
                  style={{ left: pct(s.from), width: widthPct(s.from, s.to) }}
                />
              ))}
              {p.gaps.filter(g => g.kind !== 'long').map((g, i) => (
                <div
                  key={`g${i}`}
                  title={`${g.nights}-night ${g.kind} gap · ${fmt(g.from)} → ${fmt(g.to)}`}
                  className={`absolute top-0 h-full ${g.kind === 'orphan' ? 'bg-amber-400' : 'bg-blue-300'}`}
                  style={{ left: pct(g.from), width: widthPct(g.from, g.to) }}
                />
              ))}
              {monthTicks.map(t => (
                <div key={t.label + t.left} className="absolute top-0 h-full border-l border-white/70" style={{ left: t.left }}>
                  <span className="absolute top-0.5 left-1 text-[9px] font-semibold text-slate-500/70">{t.label}</span>
                </div>
              ))}
            </div>

            {p.gaps.filter(g => g.kind !== 'long').length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {p.gaps.filter(g => g.kind !== 'long').slice(0, 8).map((g, i) => (
                  <span
                    key={i}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                      g.kind === 'orphan' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'
                    }`}
                  >
                    {g.nights}n · {fmt(g.from)}–{fmt(g.to)}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {!loading && properties.length > 0 && (
        <p className="mt-4 text-[11px] text-slate-400">
          Green = available · amber = orphan window (≤3 nights) · blue = short window (4–7 nights) · grey = booked/unavailable.
          Windows over 7 nights are left green — those aren't gaps, they're just availability.
        </p>
      )}
    </div>
  );
}
