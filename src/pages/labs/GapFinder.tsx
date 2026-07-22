import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2, RefreshCw, AlertCircle, X, FlaskConical, CalendarRange, Moon,
  Sparkles, Copy, Check, Download,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════
// LABS · Gap Finder
// Scan availability calendars, surface orphan nights and short gaps,
// then act on them: Claude drafts offer copy (ad headline, social
// post, email snippet) per gap, and gaps export to CSV for campaigns.
// ═══════════════════════════════════════════════════════════════════

const WEBHOOK_URL =
  import.meta.env.VITE_N8N_GAPFINDER_WEBHOOK_URL ||
  'https://igloo.app.n8n.cloud/webhook/gap-finder';

const DAY = 86_400_000;

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
  data?: RawSeason[] | { seasons?: RawSeason[] };
  error?: string;
  [key: string]: unknown;
}

interface Season { from: Date; to: Date; available: boolean }
interface Gap { propertyId: string; propertyName: string; from: Date; to: Date; nights: number; kind: 'orphan' | 'short' | 'long' }
interface PropertyVM { id: string; name: string; seasons: Season[]; gaps: Gap[]; error?: string }

interface OfferCopy { headline: string; social: string; email: string }

const clampDate = (d: Date, min: Date, max: Date) => new Date(Math.min(Math.max(d.getTime(), min.getTime()), max.getTime()));

function extractSeasons(p: PropertyScan): RawSeason[] {
  const candidates: unknown[] = [p.data, (p.data as { seasons?: RawSeason[] } | undefined)?.seasons];
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
      return { propertyId: p.id, propertyName: p.name || p.id, from: s.from, to: s.to, nights, kind };
    })
    .filter(g => g.nights > 0);

  return { id: p.id, name: p.name || p.id, seasons, gaps, error: p.error };
}

const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const iso = (d: Date) => d.toISOString().slice(0, 10);

export default function GapFinder() {
  const [properties, setProperties] = useState<PropertyVM[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Controls
  const [windowDays, setWindowDays] = useState(183);
  const [hideGapless, setHideGapless] = useState(true);

  // Offer drafting
  const [selectedGap, setSelectedGap] = useState<Gap | null>(null);
  const [offer, setOffer] = useState<OfferCopy | null>(null);
  const [offerLoading, setOfferLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const windowStart = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const windowEnd = useMemo(() => new Date(+windowStart + windowDays * DAY), [windowStart, windowDays]);

  const [rawScan, setRawScan] = useState<PropertyScan[]>([]);

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
      setRawScan(payload?.properties ?? (Array.isArray(payload) ? payload : []));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { scan(); }, [scan]);

  // Re-normalise locally when window changes — no refetch needed.
  useEffect(() => {
    setProperties(rawScan.map(p => normalise(p, windowStart, windowEnd)));
  }, [rawScan, windowStart, windowEnd]);

  const visible = useMemo(
    () => {
      const list = hideGapless
        ? properties.filter(p => p.gaps.some(g => g.kind !== 'long'))
        : properties;
      return [...list].sort((a, b) => {
        const an = a.gaps.filter(g => g.kind === 'orphan').reduce((n, g) => n + g.nights, 0);
        const bn = b.gaps.filter(g => g.kind === 'orphan').reduce((n, g) => n + g.nights, 0);
        return bn - an;
      });
    },
    [properties, hideGapless],
  );

  const totals = useMemo(() => {
    const gaps = properties.flatMap(p => p.gaps);
    return {
      orphanNights: gaps.filter(g => g.kind === 'orphan').reduce((n, g) => n + g.nights, 0),
      orphanWindows: gaps.filter(g => g.kind === 'orphan').length,
      shortWindows: gaps.filter(g => g.kind === 'short').length,
      soon: gaps.filter(g => g.kind !== 'long' && +g.from - +windowStart < 30 * DAY).length,
    };
  }, [properties, windowStart]);

  const pct = (d: Date) => `${(((+d - +windowStart) / (windowDays * DAY)) * 100).toFixed(2)}%`;
  const widthPct = (a: Date, b: Date) => `${Math.max(0.5, ((+b - +a) / (windowDays * DAY)) * 100).toFixed(2)}%`;

  const monthTicks = useMemo(() => {
    const ticks: { label: string; left: string }[] = [];
    const d = new Date(windowStart.getFullYear(), windowStart.getMonth() + 1, 1);
    while (d < windowEnd) {
      ticks.push({ label: d.toLocaleDateString('en-GB', { month: 'short' }), left: `${(((+d - +windowStart) / (windowDays * DAY)) * 100).toFixed(2)}%` });
      d.setMonth(d.getMonth() + 1);
    }
    return ticks;
  }, [windowStart, windowEnd, windowDays]);

  const draftOffer = async (gap: Gap) => {
    setSelectedGap(gap); setOffer(null); setOfferLoading(true); setError(null);
    try {
      const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'draft_offer',
          gap: {
            propertyName: gap.propertyName,
            from: iso(gap.from),
            to: iso(gap.to),
            nights: gap.nights,
            kind: gap.kind,
          },
        }),
      });
      if (!res.ok) throw new Error(`Draft failed (${res.status})`);
      const data = await res.json();
      if (!data.headline && !data.social && !data.email) throw new Error('No offer copy returned');
      setOffer({ headline: data.headline || '', social: data.social || '', email: data.email || '' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Offer drafting failed');
      setSelectedGap(null);
    } finally {
      setOfferLoading(false);
    }
  };

  const copyText = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(c => (c === key ? null : c)), 1500);
  };

  const exportCsv = () => {
    const rows = [
      ['property_id', 'property', 'from', 'to', 'nights', 'kind'],
      ...properties.flatMap(p => p.gaps.filter(g => g.kind !== 'long').map(g =>
        [g.propertyId, g.propertyName, iso(g.from), iso(g.to), String(g.nights), g.kind],
      )),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `igloo-gaps-${iso(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex items-center gap-2.5 mb-4 flex-wrap">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-100 text-violet-700 text-[11px] font-bold uppercase tracking-wider">
          <FlaskConical className="w-3.5 h-3.5" /> Labs
        </span>
        <h1 className="text-xl font-bold text-slate-900">Gap Finder</h1>
        <span className="text-xs text-slate-400 hidden sm:inline">Avantio test credentials · read-only scan</span>
        <div className="flex-1" />
        <button
          onClick={exportCsv}
          disabled={loading || totals.orphanWindows + totals.shortWindows === 0}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
        >
          <Download className="w-3.5 h-3.5" /> Export gaps CSV
        </button>
        <button
          onClick={scan}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Rescan
        </button>
      </div>

      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="inline-flex rounded-lg bg-white border border-slate-200 p-0.5">
          {[{ d: 92, l: '3 months' }, { d: 183, l: '6 months' }, { d: 365, l: '12 months' }].map(o => (
            <button
              key={o.d}
              onClick={() => setWindowDays(o.d)}
              className={`px-3 py-1 text-xs font-semibold rounded-md ${
                windowDays === o.d ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {o.l}
            </button>
          ))}
        </div>
        <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 cursor-pointer">
          <input type="checkbox" checked={hideGapless} onChange={e => setHideGapless(e.target.checked)} className="rounded" />
          Only properties with gaps
        </label>
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

      {/* Offer panel */}
      {selectedGap && (
        <div className="mb-6 bg-white rounded-2xl border border-violet-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-violet-600" />
            <span className="text-sm font-bold text-slate-900">
              Offer for {selectedGap.propertyName} · {selectedGap.nights} nights · {fmt(selectedGap.from)}–{fmt(selectedGap.to)}
            </span>
            <div className="flex-1" />
            <button onClick={() => { setSelectedGap(null); setOffer(null); }} className="text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          {offerLoading && (
            <div className="flex items-center gap-2 text-sm text-slate-400 py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Drafting offer copy…
            </div>
          )}
          {offer && (
            <div className="space-y-3">
              {[
                { key: 'headline', label: 'Ad headline', text: offer.headline },
                { key: 'social', label: 'Social post', text: offer.social },
                { key: 'email', label: 'Email snippet', text: offer.email },
              ].filter(v => v.text).map(v => (
                <div key={v.key} className="border border-slate-100 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{v.label}</span>
                    <div className="flex-1" />
                    <button
                      onClick={() => copyText(v.key, v.text)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800"
                    >
                      {copied === v.key ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied === v.key ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{v.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {loading && (
        <div className="text-center py-16 text-slate-400">
          <Loader2 className="w-8 h-8 mx-auto animate-spin mb-3" />
          <p className="text-sm">Scanning availability calendars…</p>
        </div>
      )}

      {!loading && visible.length === 0 && !error && (
        <div className="text-center py-16 text-slate-400">
          <CalendarRange className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm">
            {hideGapless && properties.length > 0
              ? 'No properties with orphan or short gaps in this window — untick the filter to see everything.'
              : 'No accommodations returned from the scan.'}
          </p>
        </div>
      )}

      <div className="space-y-3">
        {visible.map(p => (
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
                <button
                  key={`g${i}`}
                  onClick={() => draftOffer(g)}
                  title={`${g.nights}-night ${g.kind} gap · ${fmt(g.from)} → ${fmt(g.to)} — click to draft an offer`}
                  className={`absolute top-0 h-full cursor-pointer hover:opacity-80 ${g.kind === 'orphan' ? 'bg-amber-400' : 'bg-blue-300'}`}
                  style={{ left: pct(g.from), width: widthPct(g.from, g.to) }}
                />
              ))}
              {monthTicks.map(t => (
                <div key={t.label + t.left} className="absolute top-0 h-full border-l border-white/70 pointer-events-none" style={{ left: t.left }}>
                  <span className="absolute top-0.5 left-1 text-[9px] font-semibold text-slate-500/70">{t.label}</span>
                </div>
              ))}
            </div>

            {p.gaps.filter(g => g.kind !== 'long').length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {p.gaps.filter(g => g.kind !== 'long').slice(0, 8).map((g, i) => (
                  <button
                    key={i}
                    onClick={() => draftOffer(g)}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition-colors ${
                      g.kind === 'orphan'
                        ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                        : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                    }`}
                  >
                    <Sparkles className="w-3 h-3 inline mr-1 -mt-0.5" />
                    {g.nights}n · {fmt(g.from)}–{fmt(g.to)}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {!loading && visible.length > 0 && (
        <p className="mt-4 text-[11px] text-slate-400">
          Green = available · amber = orphan window (≤3 nights) · blue = short window (4–7 nights) · grey = booked/unavailable.
          Click any gap to draft offer copy for it.
        </p>
      )}
    </div>
  );
}
