// Director Stats — live from the single source of truth.
// Computes the full Executive Pulse metric set (ported 1:1 from the
// n8n dashboard workflow) directly from property_bookings_cache.raw,
// so the numbers can never go stale behind a broken pipeline again.
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { computeDirectorStats, DirectorStats as Stats } from '../lib/statsEngine';
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

const C = {
  navyDeep: '#0d2850', navy: '#1a4a7a', blue: '#2e7cc7', bluePale: '#e8f1fa',
  green: '#1a6e42', greenPale: '#d8f0e5', coral: '#c0392b', coralPale: '#fde0d8',
  amber: '#9a6a10', amberPale: '#fdf8ec',
  surface: '#ffffff', surface2: '#eef2f7', border: '#dde5ee',
  muted: '#5a7a9a', dim: '#8aa0b5',
};

const gbp0 = (n: number) => '£' + Math.round(n).toLocaleString('en-GB');
const pct = (n: number) => n.toFixed(1) + '%';

const sCard: React.CSSProperties = {
  background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`,
  overflow: 'hidden', marginBottom: 16,
};

function StatusPill({ status }: { status: 'ahead' | 'behind' | 'neutral' }) {
  const map = {
    ahead: { bg: C.greenPale, fg: C.green, label: 'Ahead' },
    behind: { bg: C.coralPale, fg: '#9a2a1a', label: 'Behind' },
    neutral: { bg: C.surface2, fg: C.muted, label: '—' },
  }[status];
  return (
    <span style={{ background: map.bg, color: map.fg, padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
      {map.label}
    </span>
  );
}

export default function DirectorStats() {
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showAllProps, setShowAllProps] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Paginate past Supabase's 1000-row default limit
      const all: Record<string, unknown>[] = [];
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('property_bookings_cache')
          .select('raw')
          .not('raw', 'is', null)
          .range(from, from + PAGE - 1);
        if (cancelled) return;
        if (error) { setErr(error.message); return; }
        const chunk = ((data || []) as { raw: Record<string, unknown> }[]).map(d => d.raw);
        all.push(...chunk);
        if (chunk.length < PAGE) break;
      }
      setRows(all);
    })();
    return () => { cancelled = true; };
  }, [refreshKey]);

  const stats: Stats | null = useMemo(() => (rows && rows.length ? computeDirectorStats(rows) : null), [rows]);

  if (err) {
    return <div style={{ padding: 32, color: '#9a2a1a' }}>Couldn't load bookings: {err}</div>;
  }
  if (!rows) {
    return <div style={{ padding: 32, color: C.muted }}>Loading bookings…</div>;
  }
  if (!stats) {
    return (
      <div style={{ padding: 32, maxWidth: 640 }}>
        <h1 style={{ color: C.navyDeep, fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Director Stats</h1>
        <p style={{ color: C.muted, fontSize: 14 }}>
          No synced bookings yet. Stats compute live from the Avantio bookings feed — once the
          source-of-truth sync has run, the full year view appears here automatically.
        </p>
      </div>
    );
  }

  const pulses: { label: string; p: typeof stats.pulse24h }[] = [
    { label: 'Last 24 hours', p: stats.pulse24h },
    { label: 'Last 7 days', p: stats.pulse7d },
    { label: 'Last 30 days', p: stats.pulse30d },
  ];
  const propsShown = showAllProps ? stats.propertyStats : stats.propertyStats.slice(0, 12);
  const nowMonth = new Date().getMonth();

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
        <h1 style={{ color: C.navyDeep, fontSize: 22, fontWeight: 800 }}>Director Stats</h1>
        <span style={{ color: C.dim, fontSize: 12 }}>
          {stats.targetYear} · live from the Avantio feed · {stats.bookingsProcessed.toLocaleString()} bookings
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => { setRows(null); setRefreshKey(k => k + 1); }}
          style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 14px', fontSize: 12.5, fontWeight: 600, color: C.navy, cursor: 'pointer' }}
        >
          ↻ Refresh
        </button>
      </div>

      {/* Hero: the pacing story */}
      <div style={{ ...sCard, padding: '20px 24px', display: 'flex', gap: 36, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {stats.targetYear} occupancy
          </div>
          <div style={{ fontSize: 40, fontWeight: 800, color: C.navyDeep, lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}>
            {pct(stats.occupancyCurrent)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {stats.compYear} pace at this date
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: C.muted, lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>
            {pct(stats.occupancyPace)}
          </div>
        </div>
        <StatusPill status={stats.occupancyStatus} />
        <div style={{ flex: 1 }} />
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {stats.targetYear} booking value · our commission
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.navyDeep, fontVariantNumeric: 'tabular-nums' }}>
            {gbp0(stats.totalRevenue)} <span style={{ color: C.green }}>· {gbp0(stats.totalCommission)}</span>
          </div>
        </div>
      </div>

      {/* Sales pulse */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 16 }}>
        {pulses.map(({ label, p }) => (
          <div key={label} style={{ ...sCard, marginBottom: 0, padding: '16px 20px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: C.navyDeep, fontVariantNumeric: 'tabular-nums' }}>
              {p.count} <span style={{ fontSize: 13, fontWeight: 600, color: C.muted }}>bookings</span>
            </div>
            <div style={{ fontSize: 13, color: C.muted, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
              {gbp0(p.bookingValue)} value · <span style={{ color: C.green, fontWeight: 700 }}>{gbp0(p.ourCommission)} commission</span>
            </div>
          </div>
        ))}
      </div>


      {/* Revenue + occupancy chart */}
      <div style={{ ...sCard, padding: '18px 20px 6px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
          {stats.targetYear} monthly booking value (bars) and occupancy vs {stats.compYear} pace (lines)
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={stats.performanceTable.map(r => ({
            m: r.month.slice(0, 3), value: Math.round(r.bookingValue),
            occ: +r.occupancy.toFixed(1), pace: +r.pacingOcc.toFixed(1),
          }))} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={C.surface2} vertical={false} />
            <XAxis dataKey="m" tick={{ fontSize: 11, fill: C.muted }} axisLine={false} tickLine={false} />
            <YAxis yAxisId="v" tickFormatter={(v: number) => '£' + (v / 1000) + 'k'} tick={{ fontSize: 11, fill: C.muted }} axisLine={false} tickLine={false} width={44} />
            <YAxis yAxisId="o" orientation="right" tickFormatter={(v: number) => v + '%'} tick={{ fontSize: 11, fill: C.muted }} axisLine={false} tickLine={false} width={40} />
            <Tooltip formatter={(val: number, name: string) => name === 'value' ? ['£' + val.toLocaleString(), 'Booking value'] : [val + '%', name === 'occ' ? 'Occupancy' : 'Last-year pace']} />
            <Bar yAxisId="v" dataKey="value" fill={C.blue} radius={[4, 4, 0, 0]} />
            <Line yAxisId="o" dataKey="occ" stroke={C.navyDeep} strokeWidth={2.5} dot={false} />
            <Line yAxisId="o" dataKey="pace" stroke={C.dim} strokeWidth={2} strokeDasharray="5 4" dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Monthly performance */}
      <div style={sCard}>
        <div style={{ padding: '12px 20px', background: C.bluePale, borderBottom: `1px solid ${C.border}`, fontWeight: 700, color: C.navy, fontSize: 13 }}>
          {stats.targetYear} by month — departures, value, commission, occupancy vs {stats.compYear} pace
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ color: C.dim, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                {['Month', 'Bookings', 'Value', 'Commission', 'Occupancy', `${stats.compYear} pace`, `${stats.compYear} final`, 'Status'].map(h => (
                  <th key={h} style={{ textAlign: h === 'Month' ? 'left' : 'right', padding: '10px 16px', borderBottom: `1px solid ${C.surface2}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stats.performanceTable.map((r, i) => (
                <tr key={r.month} style={{ background: i === nowMonth ? C.amberPale : undefined }}>
                  <td style={{ padding: '9px 16px', fontWeight: i === nowMonth ? 800 : 600, color: C.navyDeep }}>{r.month}</td>
                  <td style={{ padding: '9px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.count}</td>
                  <td style={{ padding: '9px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{gbp0(r.bookingValue)}</td>
                  <td style={{ padding: '9px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: C.green, fontWeight: 700 }}>{gbp0(r.ourCommission)}</td>
                  <td style={{ padding: '9px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{pct(r.occupancy)}</td>
                  <td style={{ padding: '9px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: C.muted }}>{pct(r.pacingOcc)}</td>
                  <td style={{ padding: '9px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: C.dim }}>{pct(r.finalOccLast)}</td>
                  <td style={{ padding: '9px 16px', textAlign: 'right' }}><StatusPill status={r.pacingStatus} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Property breakdown */}
      <div style={sCard}>
        <div style={{ padding: '12px 20px', background: C.surface2, borderBottom: `1px solid ${C.border}`, fontWeight: 700, color: C.navy, fontSize: 13 }}>
          Property breakdown — {stats.targetYear} departures, by revenue
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ color: C.dim, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                {['Property', 'Bookings', 'Nights', 'Revenue', 'Commission'].map(h => (
                  <th key={h} style={{ textAlign: h === 'Property' ? 'left' : 'right', padding: '10px 16px', borderBottom: `1px solid ${C.surface2}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {propsShown.map(p => (
                <tr key={p.name}>
                  <td style={{ padding: '8px 16px', fontWeight: 600, color: C.navyDeep }}>{p.name}</td>
                  <td style={{ padding: '8px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{p.bookings}</td>
                  <td style={{ padding: '8px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{p.nights}</td>
                  <td style={{ padding: '8px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{gbp0(p.revenue)}</td>
                  <td style={{ padding: '8px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: C.green, fontWeight: 700 }}>{gbp0(p.commission)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {stats.propertyStats.length > 12 && (
          <div
            style={{ padding: '10px 20px', fontSize: 12.5, color: C.blue, cursor: 'pointer', borderTop: `1px solid ${C.surface2}`, fontWeight: 600 }}
            onClick={() => setShowAllProps(s => !s)}
          >
            {showAllProps ? 'Show top 12' : `Show all ${stats.propertyStats.length} properties`}
          </div>
        )}
      </div>
    </div>
  );
}
