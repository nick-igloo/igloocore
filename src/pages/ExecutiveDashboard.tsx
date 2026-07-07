import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, ArrowUp, ArrowDown, Building2, Ticket, LayoutGrid, X, ArrowLeft } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { CountUp } from '../components/CountUp';
import { supabase } from '../lib/supabase';

interface Revenue2026Total {
  ourCommission: number | string;
  bookingValue: number | string;
}

interface SalesPulseData {
  count: number | string;
  bookingValue: number | string;
  ourCommission: number | string;
}

interface OccupancyPulseData {
  current: number | string;
  pace: number | string;
  status: 'ahead' | 'behind';
}

interface PerformanceRow {
  month: string;
  count: number | string;
  bookingValue: number | string;
  ourCommission: number | string;
  occupancy: number | string;
  pacingOcc: number | string;
  finalOcc2025: number | string;
  pacingStatus: 'ahead' | 'behind' | 'neutral';
}

interface SalesPulse {
  last24h: SalesPulseData;
  last7d: SalesPulseData;
  last30d: SalesPulseData;
  totalOccupancy: OccupancyPulseData;
}

interface DashboardData {
  revenue2026Total: Revenue2026Total;
  salesPulse: SalesPulse;
  performanceTable: PerformanceRow[];
}

function ExecutiveDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [expandMobileStats, setExpandMobileStats] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    fetchData();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const fetchData = async () => {
    try {
      setError(null);
      setLoading(true);

      const { data: dbData, error: dbError } = await supabase
        .from('dashboard_data')
        .select('data, updated_at')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (dbError) {
        throw new Error(`Database error: ${dbError.message}`);
      }

      if (!dbData || !dbData.data) {
        const empty: DashboardData = {
          revenue2026Total: { ourCommission: 0, bookingValue: 0 },
          salesPulse: {
            last24h: { count: 0, bookingValue: 0, ourCommission: 0 },
            last7d: { count: 0, bookingValue: 0, ourCommission: 0 },
            last30d: { count: 0, bookingValue: 0, ourCommission: 0 },
            totalOccupancy: { current: 0, pace: 0, status: 'ahead' },
          },
          performanceTable: [],
        };
        setData(empty);
        return;
      }

      setData(dbData.data as DashboardData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const parseValue = (value: number | string) => typeof value === 'string' ? parseFloat(value) : value;
  const formatCurrency = (val: number | string) => `£${parseValue(val).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const formatNumber = (val: number | string) => Math.round(parseValue(val)).toString();

  if (loading && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="inline-block w-16 h-16 border-4 border-[#003366] border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-[#003366] font-bold">Loading Dashboard...</p>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-6">
        <div className="max-w-xl bg-red-50 border border-red-200 rounded-xl p-8 shadow-lg">
          <h3 className="text-red-800 font-bold text-xl mb-3">Connection Error</h3>
          <p className="text-red-600 mb-6 leading-relaxed">{error}</p>
          <button
            onClick={fetchData}
            className="w-full bg-[#003366] text-white px-6 py-3 rounded-lg hover:bg-[#004488] transition-colors font-semibold"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const chartData = data.performanceTable.map((row) => ({ month: row.month, value: parseValue(row.bookingValue) }));
  const heroCommission = parseValue(data.revenue2026Total?.ourCommission || 0);
  const occCurrent = parseValue(data.salesPulse.totalOccupancy?.current || 0);
  const occPace = parseValue(data.salesPulse.totalOccupancy?.pace || 0);
  const occDiff = occCurrent - occPace;

  if (isMobile) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 pb-20">
        <div className="flex items-center gap-3 mb-6">
          <a href="/" className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 text-sm font-medium transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back
          </a>
          <h1 className="text-lg font-bold text-[#003366]">Executive Dashboard</h1>
        </div>

        <div className="space-y-4">
          <motion.div whileTap={{ scale: 0.98 }} className="bg-[#003366] rounded-xl p-6 text-white shadow-lg">
            <div className="flex items-center gap-2 opacity-80 mb-2">
              <TrendingUp className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-widest">2026 Commission</span>
            </div>
            <div className="text-5xl font-bold tracking-tighter">
              <CountUp end={heroCommission} prefix="£" decimals={0} />
            </div>
          </motion.div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
            <div className="flex justify-between items-start mb-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Occupancy</span>
              <span className={`text-xs font-bold px-2 py-1 rounded ${data.salesPulse.totalOccupancy.status === 'ahead' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {data.salesPulse.totalOccupancy.status === 'ahead' ? 'AHEAD' : 'BEHIND'}
              </span>
            </div>
            <div className="text-4xl font-bold text-[#003366]">{occCurrent.toFixed(1)}%</div>
            <div className="text-xs text-slate-400 mt-1">vs {occPace.toFixed(1)}% last year</div>
          </div>
        </div>

        <div className="mt-6">
          <button onClick={() => setExpandMobileStats(!expandMobileStats)} className="w-full py-3 bg-white border border-slate-200 rounded-lg text-slate-600 font-bold text-sm shadow-sm flex items-center justify-center gap-2">
            {expandMobileStats ? <X className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
            {expandMobileStats ? 'Close Stats' : 'View Pulse Stats'}
          </button>
        </div>

        <AnimatePresence>
          {expandMobileStats && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mt-4">
              <div className="space-y-4">
                {[
                  { label: '24h', data: data.salesPulse.last24h },
                  { label: '7 Days', data: data.salesPulse.last7d },
                  { label: '30 Days', data: data.salesPulse.last30d }
                ].map((item, idx) => (
                  <div key={idx} className="bg-white p-4 rounded-lg border border-slate-100 flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-500 uppercase">{item.label}</span>
                    <div className="text-right">
                      <div className="font-bold text-[#003366]">{formatCurrency(item.data.ourCommission)}</div>
                      <div className="text-xs text-slate-400">{item.data.count} bookings</div>
                    </div>
                  </div>
                ))}
                <div className="text-center text-xs text-slate-400 py-4">Full tables available on desktop</div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900">
      <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="sticky top-0 z-50 backdrop-blur-md bg-white/90 border-b border-slate-200 py-4 px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#003366]">Executive Dashboard</h1>
            <p className="text-slate-500 text-[10px] uppercase font-bold tracking-widest">Live Pacing Analysis</p>
          </div>
          <a
            href="/"
            className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100 px-3 py-2 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Portal
          </a>
        </div>
      </motion.div>

      <div className="max-w-7xl mx-auto px-6 py-8">

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
              <span className="text-xs font-bold tracking-widest uppercase">Total 2026 Management Commission</span>
            </div>
            <div className="text-7xl md:text-8xl font-bold text-white tracking-tighter">
              <CountUp end={heroCommission} prefix="£" decimals={0} />
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">

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
              <div className="text-4xl font-bold"><CountUp end={occCurrent} decimals={1} />%</div>
              <div className="text-[11px] text-white/60 font-medium">vs {occPace.toFixed(1)}% Pace</div>
            </div>
          </motion.div>

          {[
            { label: 'Last 24 Hours', data: data.salesPulse.last24h, tag: 'Live', color: 'bg-green-100 text-green-700' },
            { label: 'Last 7 Days', data: data.salesPulse.last7d, tag: 'Week', color: 'bg-blue-100 text-blue-700' },
            { label: 'Last 30 Days', data: data.salesPulse.last30d, tag: 'Month', color: 'bg-slate-100 text-slate-700' }
          ].map((item, idx) => (
            <div key={idx} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-slate-400 font-bold text-[10px] uppercase tracking-widest">{item.label}</h3>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${item.color}`}>{item.tag}</span>
                </div>
                <div className="mb-4">
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Commission</p>
                  <p className="text-4xl font-bold text-[#003366] tracking-tighter">
                    <CountUp end={parseValue(item.data?.ourCommission || 0)} prefix="£" decimals={0} />
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 border-t border-slate-50 pt-4">
                <div>
                  <p className="text-[9px] text-slate-400 uppercase font-bold mb-0.5">Bookings</p>
                  <div className="flex items-center gap-1.5 text-sm font-bold text-[#003366]">
                    <Ticket className="w-3 h-3 opacity-50" />
                    {formatNumber(item.data?.count || 0)}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[9px] text-slate-400 uppercase font-bold mb-0.5">Value</p>
                  <p className="text-sm font-bold text-slate-600">
                    {formatCurrency(item.data?.bookingValue || 0)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-50/50">
            <h2 className="text-sm font-black text-[#003366] uppercase tracking-widest">Monthly Performance Breakdown</h2>
            <div className="flex gap-6 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              <div className="flex items-center gap-2"><div className="w-6 h-2 bg-[#003366] rounded-sm"></div> 2026</div>
              <div className="flex items-center gap-2"><div className="w-6 h-2 bg-slate-300 rounded-sm"></div> 2025 Pace</div>
              <div className="flex items-center gap-1.5"><div className="w-0.5 h-3 bg-slate-800/40 border-l border-dashed border-slate-800"></div> 2025 Final Target</div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-widest">
                <tr>
                  <th className="text-left py-4 px-8">Month</th>
                  <th className="text-right py-4 px-8">Check-outs</th>
                  <th className="text-right py-4 px-8">Revenue</th>
                  <th className="text-left py-4 px-8 min-w-[320px]">Occupancy Pacing</th>
                  <th className="text-right py-4 px-8 text-[#003366]">Commission</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.performanceTable.map((row, index) => {
                  const occ2026 = parseValue(row.occupancy);
                  const occ2025 = parseValue(row.pacingOcc);
                  const final2025 = parseValue(row.finalOcc2025);
                  const delta = occ2026 - occ2025;
                  const isAhead = delta >= 0;

                  return (
                    <tr key={index} className="hover:bg-slate-50 transition-colors">
                      <td className="py-4 px-8 font-bold text-[#003366]">{row.month}</td>
                      <td className="py-4 px-8 text-right text-slate-500">{formatNumber(row.count)}</td>
                      <td className="py-4 px-8 text-right font-medium">{formatCurrency(row.bookingValue)}</td>
                      <td className="py-4 px-8">
                        <div className="flex items-center gap-6">
                          <div className="flex-1 space-y-2 relative">
                            {final2025 > 0 && (
                              <div className="absolute top-0 bottom-0 z-10 w-px border-l-2 border-dashed border-slate-800/30" style={{ left: `${Math.min(final2025, 100)}%` }} />
                            )}
                            <div className="relative h-2.5 bg-slate-100 rounded-full overflow-hidden">
                              <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(occ2026, 100)}%` }} transition={{ duration: 0.8 }} className="h-full bg-[#003366] rounded-full" />
                            </div>
                            <div className="relative h-2.5 bg-slate-50 rounded-full overflow-hidden">
                              <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(occ2025, 100)}%` }} transition={{ duration: 0.8 }} className="h-full bg-slate-300 rounded-full" />
                            </div>
                          </div>
                          <div className="w-24 flex flex-col items-end">
                            <div className={`text-[10px] font-black flex items-center gap-0.5 ${isAhead ? 'text-green-600' : 'text-red-500'}`}>
                              {isAhead ? <ArrowUp className="w-2 h-2" /> : <ArrowDown className="w-2 h-2" />}
                              {Math.abs(delta).toFixed(1)}%
                            </div>
                            <div className="text-[11px] font-bold text-slate-700">
                              {occ2026.toFixed(1)}% <span className="text-slate-300 font-normal">/ {occ2025.toFixed(1)}%</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-8 text-right font-bold text-[#003366] bg-slate-50/30">{formatCurrency(row.ourCommission)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}

export default ExecutiveDashboard;
