// Director stats engine — 1:1 port of the n8n "Calculate Logic" node from
// the Avantio Director Dashboard workflow, operating on raw Avantio export
// rows from the single source of truth (property_bookings_cache.raw).
// Metric definitions preserved exactly: VAT 1.20, commission 15% applied to
// (booking total − portal fee) × commRate × VAT; occupancy capacity derived
// from each property's first-seen check-in; pace = last year's nights from
// bookings created by this date last year.

export interface PulseStat { count: number; bookingValue: number; ourCommission: number; }
export interface PerformanceRow {
  month: string; count: number; bookingValue: number; ourCommission: number;
  ownerValue: number; ownerValueLast: number;
  nights: number;
  occupancy: number; pacingOcc: number; finalOccLast: number;
  pacingStatus: 'ahead' | 'behind' | 'neutral';
}
export interface PropertyStat {
  name: string; revenue: number; commission: number; bookings: number; nights: number;
  revenueLast: number; bookingsLast: number; nightsLast: number;
}
export interface RecentBooking {
  property: string; created: string; checkin: string | null;
  leadDays: number | null; nights: number; value: number;
}
export interface UpcomingBooking { property: string; checkin: string; nights: number; }
export interface DirectorStats {
  targetYear: number; compYear: number;
  pulse24h: PulseStat; pulse7d: PulseStat; pulse30d: PulseStat;
  occupancyCurrent: number; occupancyPace: number; occupancyStatus: 'ahead' | 'behind';
  totalRevenue: number; totalCommission: number;
  totalOwnerValue: number; totalOwnerValueLast: number;
  performanceTable: PerformanceRow[];
  propertyStats: PropertyStat[];
  recentBookings: RecentBooking[];
  upcomingBookings: UpcomingBooking[];
  totalNights: number; totalNightsLast: number;
  portfolio: {
    activeThisYear: number; activeLastYear: number; newThisYear: number;
    sameStoreCount: number; sameStoreNights: number; sameStoreNightsLast: number;
    sameStoreRevenue: number; sameStoreRevenueLast: number;
  };
  bookingsProcessed: number;
}

type Row = Record<string, unknown>;

const VAT_RATE = 1.2;
const COMM_RATE = 0.15;

const toNum = (val: unknown): number => {
  if (val === null || val === undefined || val === '' || val === '-') return 0;
  const n = parseFloat(String(val).replace(/[^0-9.-]+/g, ''));
  return isNaN(n) ? 0 : n;
};

const parseDate = (val: unknown): Date | null => {
  if (!val) return null;
  const str = String(val);
  if (str.includes('/')) {
    const p = str.split('/');
    if (p.length >= 3) return new Date(+p[2], +p[1] - 1, +p[0], 12, 0, 0);
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
};

export function computeDirectorStats(rows: Row[], now: Date = new Date()): DirectorStats {
  const lastYearCutoff = new Date(now);
  lastYearCutoff.setFullYear(now.getFullYear() - 1);
  const targetYear = now.getFullYear();
  const compYear = targetYear - 1;

  const statsCurrentYear = Array.from({ length: 12 }, () => ({ revenue: 0, commission: 0, ownerValue: 0, count: 0, soldNights: 0 }));
  const statsLastYearPace = Array.from({ length: 12 }, () => ({ soldNights: 0 }));
  const statsLastYearFinal = Array.from({ length: 12 }, () => ({ soldNights: 0, ownerValue: 0, revenue: 0 }));

  const propertyMap = new Map<string, PropertyStat>();
  const propertyFirstSeen = new Map<string, Date>();
  const processedIds = new Set<string>();

  const pulse24h = { count: 0, val: 0, comm: 0 };
  const pulse7d = { count: 0, val: 0, comm: 0 };
  const pulse30d = { count: 0, val: 0, comm: 0 };
  const recentBookings: RecentBooking[] = [];
  const upcomingBookings: UpcomingBooking[] = [];

  for (const row of rows) {
    const id = String(row['Booking number'] ?? '');
    if (!id || processedIds.has(id)) continue;
    processedIds.add(id);

    const pid = String(row['Property name'] || row['Property ID'] || 'Unknown Property');
    const created = parseDate(row['Date']);
    const checkIn = parseDate(row['Check-in date']);
    const checkOut = parseDate(row['Check-out date']);
    // Recent bookings feed (pattern analysis): captured BEFORE the report
    // window so next-year stays booked recently are visible to the analyst.
    if (created) {
      const dAge = (now.getTime() - created.getTime()) / 86400000;
      if (dAge >= 0 && dAge <= 30) {
        recentBookings.push({
          property: pid,
          created: created.toISOString().slice(0, 10),
          checkin: checkIn ? checkIn.toISOString().slice(0, 10) : null,
          leadDays: checkIn ? Math.round((checkIn.getTime() - created.getTime()) / 86400000) : null,
          nights: toNum(row['nights'] ?? row['Nights']),
          value: toNum(row['Booking total with tax']),
        });
      }
    }

    // Forward calendar feed: every confirmed stay from a week ago onward
    // (any year) — enables gap/open-week analysis per property.
    if (checkIn && (checkIn.getTime() - now.getTime()) / 86400000 >= -7) {
      upcomingBookings.push({
        property: pid,
        checkin: checkIn.toISOString().slice(0, 10),
        nights: toNum(row['nights'] ?? row['Nights']),
      });
    }

    // Report window: this is a departures-based revenue report. Only
    // bookings checking out within [Jan compYear .. Dec targetYear] exist
    // for its purposes — pulse, occupancy and revenue alike — making the
    // stats invariant to however wide the source sheet's range grows.
    if (!checkOut) continue;
    const coYear = checkOut.getFullYear();
    if (coYear < compYear || coYear > targetYear) continue;

    const nights = toNum(row['nights'] ?? row['Nights']);
    const totalVal = toNum(row['Booking total with tax']);
    const portalFee = toNum(row['Portal/Intermediary Commission: calculated commission']);
    const commission = (totalVal - portalFee) * COMM_RATE * VAT_RATE;
    // Owner's share: total minus channel commission, management commission,
    // and extras/booking fees (which are Igloo revenue, not the owner's)
    const extrasVal = row['Extras with VAT on top'] !== undefined && row['Extras with VAT on top'] !== ''
      ? toNum(row['Extras with VAT on top'])
      : toNum(row['Extras without VAT']);
    const ownerValue = totalVal - portalFee - commission - extrasVal;

    if (pid && checkIn) {
      const cur = propertyFirstSeen.get(pid);
      if (!cur || checkIn < cur) propertyFirstSeen.set(pid, checkIn);
    }

    if (!propertyMap.has(pid)) {
      propertyMap.set(pid, { name: pid, revenue: 0, commission: 0, bookings: 0, nights: 0, revenueLast: 0, bookingsLast: 0, nightsLast: 0 });
    }
    const pStats = propertyMap.get(pid)!;

    if (created) {
      const diffDays = (now.getTime() - created.getTime()) / 86400000;
      if (diffDays >= 0) {
        if (diffDays <= 1) { pulse24h.count++; pulse24h.val += totalVal; pulse24h.comm += commission; }
        if (diffDays <= 7) { pulse7d.count++; pulse7d.val += totalVal; pulse7d.comm += commission; }
        if (diffDays <= 30) { pulse30d.count++; pulse30d.val += totalVal; pulse30d.comm += commission; }
      }
    }

    if (checkOut && checkOut.getFullYear() === targetYear) {
      const m = checkOut.getMonth();
      statsCurrentYear[m].revenue += totalVal;
      statsCurrentYear[m].commission += commission;
      statsCurrentYear[m].ownerValue += ownerValue;
      statsCurrentYear[m].count += 1;
      pStats.revenue += totalVal;
      pStats.commission += commission;
      pStats.bookings += 1;
    }
    if (checkOut && checkOut.getFullYear() === compYear) {
      const m = checkOut.getMonth();
      statsLastYearFinal[m].ownerValue += ownerValue;
      statsLastYearFinal[m].revenue += totalVal;
      pStats.revenueLast += totalVal;
      pStats.bookingsLast += 1;
    }

    if (checkIn && nights > 0) {
      for (let i = 0; i < nights; i++) {
        const nightDate = new Date(checkIn);
        nightDate.setDate(nightDate.getDate() + i);
        const y = nightDate.getFullYear();
        const m = nightDate.getMonth();
        if (y === targetYear) {
          statsCurrentYear[m].soldNights += 1;
          pStats.nights += 1;
        }
        if (y === compYear) {
          statsLastYearFinal[m].soldNights += 1;
          pStats.nightsLast += 1;
          if (created && created <= lastYearCutoff) statsLastYearPace[m].soldNights += 1;
        }
      }
    }
  }

  const getMonthlyCapacity = (year: number, monthIndex: number): number => {
    const endOfMonth = new Date(year, monthIndex + 1, 0, 23, 59, 59);
    let activeProps = 0;
    for (const [, firstDate] of propertyFirstSeen) {
      if (firstDate <= endOfMonth) activeProps++;
    }
    return (activeProps || 1) * endOfMonth.getDate();
  };

  let totalNightsCur = 0, totalCapCur = 0, totalNightsPace = 0, totalCapLast = 0;

  const performanceTable: PerformanceRow[] = statsCurrentYear.map((stat, index) => {
    const capCurrent = getMonthlyCapacity(targetYear, index);
    const capLast = getMonthlyCapacity(compYear, index);
    totalNightsCur += stat.soldNights;
    totalCapCur += capCurrent;
    totalNightsPace += statsLastYearPace[index].soldNights;
    totalCapLast += capLast;

    const occCurrent = capCurrent > 0 ? (stat.soldNights / capCurrent) * 100 : 0;
    const occLastPace = capLast > 0 ? (statsLastYearPace[index].soldNights / capLast) * 100 : 0;
    const occLastFinal = capLast > 0 ? (statsLastYearFinal[index].soldNights / capLast) * 100 : 0;

    let status: PerformanceRow['pacingStatus'] = 'neutral';
    if (occCurrent > occLastPace + 0.1) status = 'ahead';
    if (occCurrent < occLastPace - 0.1) status = 'behind';

    return {
      month: new Date(targetYear, index).toLocaleString('default', { month: 'long' }),
      count: stat.count,
      bookingValue: stat.revenue,
      ourCommission: stat.commission,
      ownerValue: stat.ownerValue,
      ownerValueLast: statsLastYearFinal[index].ownerValue,
      nights: stat.soldNights,
      occupancy: occCurrent,
      pacingOcc: occLastPace,
      finalOccLast: occLastFinal,
      pacingStatus: status,
    };
  });

  const aggOccCur = totalCapCur > 0 ? (totalNightsCur / totalCapCur) * 100 : 0;
  const aggPaceLast = totalCapLast > 0 ? (totalNightsPace / totalCapLast) * 100 : 0;

  const propertyStats = Array.from(propertyMap.values())
    .filter(p => p.revenue > 0 || p.revenueLast > 0)
    .sort((a, b) => b.revenue - a.revenue);

  // Portfolio growth context: same-store = active both years (like-for-like)
  const allProps = Array.from(propertyMap.values());
  const activeCur = allProps.filter(p => p.nights > 0 || p.revenue > 0);
  const activeLast = allProps.filter(p => p.nightsLast > 0 || p.revenueLast > 0);
  const sameStore = allProps.filter(p => (p.nights > 0 || p.revenue > 0) && (p.nightsLast > 0 || p.revenueLast > 0));
  const portfolio = {
    activeThisYear: activeCur.length,
    activeLastYear: activeLast.length,
    newThisYear: activeCur.filter(p => !(p.nightsLast > 0 || p.revenueLast > 0)).length,
    sameStoreCount: sameStore.length,
    sameStoreNights: sameStore.reduce((a, p) => a + p.nights, 0),
    sameStoreNightsLast: sameStore.reduce((a, p) => a + p.nightsLast, 0),
    sameStoreRevenue: sameStore.reduce((a, p) => a + p.revenue, 0),
    sameStoreRevenueLast: sameStore.reduce((a, p) => a + p.revenueLast, 0),
  };

  const fmtPulse = (p: { count: number; val: number; comm: number }): PulseStat =>
    ({ count: p.count, bookingValue: p.val, ourCommission: p.comm });

  return {
    targetYear, compYear,
    pulse24h: fmtPulse(pulse24h), pulse7d: fmtPulse(pulse7d), pulse30d: fmtPulse(pulse30d),
    occupancyCurrent: aggOccCur, occupancyPace: aggPaceLast,
    occupancyStatus: aggOccCur >= aggPaceLast ? 'ahead' : 'behind',
    totalRevenue: performanceTable.reduce((a, m) => a + m.bookingValue, 0),
    totalCommission: performanceTable.reduce((a, m) => a + m.ourCommission, 0),
    totalOwnerValue: performanceTable.reduce((a, m) => a + m.ownerValue, 0),
    totalOwnerValueLast: performanceTable.reduce((a, m) => a + m.ownerValueLast, 0),
    performanceTable,
    propertyStats,
    recentBookings: recentBookings.sort((a, b) => b.created.localeCompare(a.created)).slice(0, 120),
    upcomingBookings: upcomingBookings.sort((a, b) => a.checkin.localeCompare(b.checkin)).slice(0, 600),
    totalNights: statsCurrentYear.reduce((a, m) => a + m.soldNights, 0),
    totalNightsLast: statsLastYearFinal.reduce((a, m) => a + m.soldNights, 0),
    portfolio,
    bookingsProcessed: processedIds.size,
  };
}
