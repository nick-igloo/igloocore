// Director Stats — faithful port of the original Executive Dashboard
// (igloo-stats Bolt app) over the single source of truth. Same navy hero
// with CountUp commission and ghost area chart, same pulse grid, same
// monthly pacing bars with the dashed final-target goal line —
// computed live from property_bookings_cache.raw instead of a pipeline.
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp, Building2, ArrowUp, ArrowDown, Ticket, RefreshCw,
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area } from 'recharts';
import { supabase } from '../lib/supabase';
import { CountUp } from '../components/CountUp';
import { computeDirectorStats, DirectorStats as Stats } from '../lib/statsEngine';

const formatCurrency = (n: number) => '£' + Math.round(n).toLocaleString('en-GB');
const formatNumber = (n: number) => n.toLocaleString('en-GB');

function DashboardView({ stats, heroLabel, showOwner = false }: { stats: Stats; heroLabel: string; showOwner?: boolean }) {
  const chartData = stats.performanceTable.map(r => ({ month: r.month, value: r.bookingValue }));
  const heroCommission = stats.totalCommission;
  const occCurrent = stats.occupancyCurrent;
  const occPace = stats.occupancyPace;
  const occDiff = occCurrent - occPace;
  return (
    <>
        {/* HERO CARD */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="relative bg-[#003366] rounded-2xl shadow-2xl p-12 mb-10 overflow-hidden"
        >
          <div className="absolute inset-0 opacity-[0.05] pointer-events-none">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <Area type="monotone" dataKey="value" stroke="#FFFFFF" fill="#FFFFFF" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4 text-white/70">
              <TrendingUp className="w-6 h-6" />
              <span className="text-xs font-bold tracking-widest uppercase">{heroLabel}</span>
            </div>
            <div className="font-mono-numbers text-7xl md:text-8xl font-bold text-white tracking-tighter">
              <CountUp end={heroCommission} prefix="£" decimals={0} />
            </div>
          </div>
        </motion.div>


        {/* OWNER VALUE (property view) */}
        {showOwner && (() => {
          const cur = stats.totalOwnerValue;
          const last = stats.totalOwnerValueLast;
          const delta = last > 0 ? ((cur - last) / last) * 100 : 0;
          const ahead = cur >= last;
          return (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-10 flex flex-wrap items-center gap-8">
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Owner Booking Value {stats.targetYear}</p>
                <p className="text-4xl font-bold text-[#003366] font-mono-numbers tracking-tighter">
                  <CountUp end={cur} prefix="£" decimals={0} />
                </p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">{stats.compYear} Actual</p>
                <p className="text-2xl font-bold text-slate-400 font-mono-numbers">{formatCurrency(last)}</p>
              </div>
              {last > 0 && (
                <span className={`px-2 py-1 rounded text-[10px] font-black uppercase flex items-center gap-1 ${ahead ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {ahead ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                  {Math.abs(delta).toFixed(1)}% vs {stats.compYear}
                </span>
              )}
              <div className="flex-1 text-right text-[10px] text-slate-400 uppercase font-bold tracking-widest">
                Total − channel commission − management commission − extras
              </div>
            </div>
          );
        })()}

        {/* PULSE GRID */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">

          {/* Total Occupancy Card */}
          <motion.div whileHover={{ y: -5 }} className="bg-[#003366] rounded-xl shadow-lg border border-[#003366] p-6 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10"><Building2 className="w-16 h-16" /></div>
            <div className="flex justify-between items-center mb-6 relative z-10">
              <h3 className="text-white/70 font-bold text-[10px] uppercase tracking-widest">Portfolio Occupancy</h3>
              <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase flex items-center gap-1 ${occDiff >= 0 ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                {occDiff >= 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                {Math.abs(occDiff).toFixed(1)}%
              </span>
            </div>
            <div className="space-y-1 relative z-10">
              <div className="text-4xl font-bold font-mono-numbers"><CountUp end={occCurrent} decimals={1} />%</div>
              <div className="text-[11px] text-white/60 font-medium">vs {occPace.toFixed(1)}% Pace</div>
            </div>
          </motion.div>

          {/* Sales Pulse Cards */}
          {[
            { label: 'Last 24 Hours', data: stats.pulse24h, tag: 'Live', color: 'bg-green-100 text-green-700' },
            { label: 'Last 7 Days', data: stats.pulse7d, tag: 'Week', color: 'bg-blue-100 text-blue-700' },
            { label: 'Last 30 Days', data: stats.pulse30d, tag: 'Month', color: 'bg-slate-100 text-slate-700' },
          ].map((item, idx) => (
            <div key={idx} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-slate-400 font-bold text-[10px] uppercase tracking-widest">{item.label}</h3>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${item.color}`}>{item.tag}</span>
                </div>
                <div className="mb-4">
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Commission</p>
                  <p className="text-4xl font-bold text-[#003366] font-mono-numbers tracking-tighter">
                    <CountUp end={item.data.ourCommission} prefix="£" decimals={0} />
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 border-t border-slate-50 pt-4">
                <div>
                  <p className="text-[9px] text-slate-400 uppercase font-bold mb-0.5">Bookings</p>
                  <div className="flex items-center gap-1.5 text-sm font-bold text-[#003366] font-mono-numbers">
                    <Ticket className="w-3 h-3 opacity-50" />
                    {formatNumber(item.data.count)}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[9px] text-slate-400 uppercase font-bold mb-0.5">Value</p>
                  <p className="text-sm font-bold text-slate-600 font-mono-numbers">
                    {formatCurrency(item.data.bookingValue)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* MONTHLY TABLE */}
        <div className="bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden mb-12">
          <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-50/50">
            <h2 className="text-sm font-black text-[#003366] uppercase tracking-widest">Monthly Performance Breakdown</h2>
            <div className="flex gap-6 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              <div className="flex items-center gap-2"><div className="w-6 h-2 bg-[#003366] rounded-sm"></div> {stats.targetYear}</div>
              <div className="flex items-center gap-2"><div className="w-6 h-2 bg-slate-300 rounded-sm"></div> {stats.compYear} Pace</div>
              <div className="flex items-center gap-1.5"><div className="w-0.5 h-3 bg-slate-800/40 border-l border-dashed border-slate-800"></div> {stats.compYear} Final Target</div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-widest">
                <tr>
                  <th className="text-left py-4 px-8">Month</th>
                  <th className="text-right py-4 px-8">Check-outs</th>
                  <th className="text-right py-4 px-8">Revenue</th>
                  {showOwner && <th className="text-right py-4 px-8">Owner Value</th>}
                  <th className="text-left py-4 px-8 min-w-[320px]">Occupancy Pacing</th>
                  <th className="text-right py-4 px-8 text-[#003366]">Commission</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stats.performanceTable.map((row, index) => {
                  const occ = row.occupancy;
                  const pace = row.pacingOcc;
                  const finalLast = row.finalOccLast;
                  const delta = occ - pace;
                  const isAhead = delta >= 0;

                  return (
                    <tr key={index} className="hover:bg-slate-50 transition-colors">
                      <td className="py-4 px-8 font-bold text-[#003366]">{row.month}</td>
                      <td className="py-4 px-8 text-right font-mono-numbers text-slate-500">{formatNumber(row.count)}</td>
                      <td className="py-4 px-8 text-right font-mono-numbers font-medium">{formatCurrency(row.bookingValue)}</td>
                      {showOwner && (
                        <td className="py-4 px-8 text-right font-mono-numbers">
                          <div className="font-bold text-slate-700">{formatCurrency(row.ownerValue)}</div>
                          <div className="text-[10px] text-slate-400">{row.ownerValueLast > 0 ? `LY ${formatCurrency(row.ownerValueLast)}` : '—'}</div>
                        </td>
                      )}
                      <td className="py-4 px-8">
                        <div className="flex items-center gap-6">
                          <div className="flex-1 space-y-2 relative">
                            {finalLast > 0 && (
                              <div className="absolute top-0 bottom-0 z-10 w-px border-l-2 border-dashed border-slate-800/30" style={{ left: `${Math.min(finalLast, 100)}%` }} />
                            )}
                            <div className="relative h-2.5 bg-slate-100 rounded-full overflow-hidden">
                              <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(occ, 100)}%` }} transition={{ duration: 0.8 }} className="h-full bg-[#003366] rounded-full" />
                            </div>
                            <div className="relative h-2.5 bg-slate-50 rounded-full overflow-hidden">
                              <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(pace, 100)}%` }} transition={{ duration: 0.8 }} className="h-full bg-slate-300 rounded-full" />
                            </div>
                          </div>
                          <div className="w-24 flex flex-col items-end">
                            <div className={`text-[10px] font-black flex items-center gap-0.5 ${isAhead ? 'text-green-600' : 'text-red-500'}`}>
                              {isAhead ? <ArrowUp className="w-2 h-2" /> : <ArrowDown className="w-2 h-2" />}
                              {Math.abs(delta).toFixed(1)}%
                            </div>
                            <div className="text-[11px] font-mono-numbers font-bold text-slate-700">
                              {occ.toFixed(1)}% <span className="text-slate-300 font-normal">/ {pace.toFixed(1)}%</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-8 text-right font-mono-numbers font-bold text-[#003366] bg-slate-50/30">{formatCurrency(row.ourCommission)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

    </>
  );
}

export default function DirectorStats() {
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showAllProps, setShowAllProps] = useState(false);
  const [tab, setTab] = useState<'portfolio' | 'properties'>('portfolio');
  const [selectedProp, setSelectedProp] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
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

  const stats: Stats | null = useMemo(
    () => (rows && rows.length ? computeDirectorStats(rows) : null),
    [rows],
  );

  const propStats: Stats | null = useMemo(() => {
    if (!rows || !selectedProp) return null;
    const filtered = rows.filter(r =>
      String(r['Property name'] || r['Property ID'] || 'Unknown Property') === selectedProp);
    return filtered.length ? computeDirectorStats(filtered) : null;
  }, [rows, selectedProp]);

  if (err) {
    return <div className="p-10 text-red-700">Couldn't load bookings: {err}</div>;
  }
  if (!rows) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="inline-block w-16 h-16 border-4 border-[#003366] border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-[#003366] font-bold">Loading Dashboard...</p>
        </div>
      </div>
    );
  }
  if (!stats) {
    return (
      <div className="p-10 max-w-xl">
        <h1 className="text-2xl font-bold text-[#003366] mb-2">Executive Dashboard</h1>
        <p className="text-slate-500 text-sm">
          No synced bookings yet — once the Avantio source-of-truth sync has run,
          the full year view appears here automatically.
        </p>
      </div>
    );
  }

  const propsShown = showAllProps ? stats.propertyStats : stats.propertyStats.slice(0, 12);

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900">
      <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="sticky top-0 z-40 backdrop-blur-md bg-white/90 border-b border-slate-200 py-4 px-6">
        <div className="max-w-7xl mx-auto flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#003366]">Executive Dashboard</h1>
            <p className="text-slate-500 text-[10px] uppercase font-bold tracking-widest">
              Live Pacing Analysis · {formatNumber(stats.bookingsProcessed)} bookings · straight from the Avantio feed
            </p>
          </div>
          <button
            onClick={() => { setRows(null); setRefreshKey(k => k + 1); }}
            className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-[#003366] transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </motion.div>

      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* TABS */}
        <div className="flex gap-2 mb-8">
          {([['portfolio', 'Portfolio'], ['properties', 'Properties']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => { setTab(key); if (key === 'portfolio') setSelectedProp(null); }}
              className={`px-5 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-colors ${
                tab === key ? 'bg-[#003366] text-white shadow' : 'bg-slate-100 text-slate-500 hover:text-[#003366]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'portfolio' && (
          <DashboardView stats={stats} heroLabel={`Total ${stats.targetYear} Management Commission`} />
        )}

        {tab === 'properties' && selectedProp && propStats && (
          <>
            <button
              onClick={() => setSelectedProp(null)}
              className="mb-6 text-xs font-black uppercase tracking-widest text-slate-500 hover:text-[#003366] transition-colors"
            >
              ← All properties
            </button>
            <DashboardView stats={propStats} heroLabel={`${selectedProp} — ${propStats.targetYear} Commission`} showOwner />
          </>
        )}

        {tab === 'properties' && !selectedProp && (
        <div className="bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-100 bg-slate-50/50">
            <h2 className="text-sm font-black text-[#003366] uppercase tracking-widest">Property Breakdown — {stats.targetYear} by Revenue</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-widest">
                <tr>
                  <th className="text-left py-4 px-8">Property</th>
                  <th className="text-right py-4 px-8">Bookings</th>
                  <th className="text-right py-4 px-8">Nights</th>
                  <th className="text-right py-4 px-8">Revenue</th>
                  <th className="text-right py-4 px-8 text-[#003366]">Commission</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {propsShown.map(p => (
                  <tr key={p.name} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => setSelectedProp(p.name)}>
                    <td className="py-3.5 px-8 font-bold text-[#003366]">{p.name}</td>
                    <td className="py-3.5 px-8 text-right font-mono-numbers text-slate-500">{formatNumber(p.bookings)}</td>
                    <td className="py-3.5 px-8 text-right font-mono-numbers text-slate-500">{formatNumber(p.nights)}</td>
                    <td className="py-3.5 px-8 text-right font-mono-numbers font-medium">{formatCurrency(p.revenue)}</td>
                    <td className="py-3.5 px-8 text-right font-mono-numbers font-bold text-[#003366] bg-slate-50/30">{formatCurrency(p.commission)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {stats.propertyStats.length > 12 && (
            <button
              className="w-full py-3 text-[11px] font-black uppercase tracking-widest text-slate-500 hover:text-[#003366] border-t border-slate-100 transition-colors"
              onClick={() => setShowAllProps(s => !s)}
            >
              {showAllProps ? 'Show top 12' : `Show all ${stats.propertyStats.length} properties`}
            </button>
          )}
        </div>
        )}

      </div>
    </div>
  );
}
