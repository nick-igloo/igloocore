import { useState, useEffect, useMemo, useCallback, useRef, CSSProperties, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import {
  BookingRecord, AvantioBooking, AirbnbPayout, AirbnbItem, BcomReservation, BankTx, ReconRow,
  toAvantio, parseAirbnbCsv, parseAny, reconcile, r2, dmy, fmt, fmt0, monthLabel, escCsv, dlCsv,
} from '../lib/reconEngine';

// ═══════════════════════════════════════════════════════════════════
// src/pages/LiveReconciliationTab.tsx — LIVE reconciliation
// Two views: reconciliation summary + bank transaction log
// ═══════════════════════════════════════════════════════════════════

const C = {
  navy: '#1a4a7a', navyDeep: '#0d2850', blue: '#3a8fd1', bluePale: '#ddeeff',
  coral: '#e8513a', amber: '#e8a020', green: '#3ab87a',
  bg: '#f0f4f9', surface: '#ffffff', surface2: '#eef3f9',
  border: '#d4e2ef', muted: '#5a7a9a', dim: '#9ab0c5',
};


// ── Celebration: confetti + cha-ching when a payout newly lands in the bank ──
const SEEN_KEY = 'igloo_recon_seen_landed_v1';

function chaChing() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const ping = (freq: number, t0: number, dur: number, vol: number) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0, ctx.currentTime + t0);
      g.gain.linearRampToValueAtTime(vol, ctx.currentTime + t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t0 + dur);
      o.connect(g); g.connect(ctx.destination);
      o.start(ctx.currentTime + t0); o.stop(ctx.currentTime + t0 + dur + 0.05);
    };
    // two-note till chime
    ping(1318.5, 0, 0.5, 0.18);   // E6
    ping(1760.0, 0.09, 0.7, 0.18); // A6
  } catch { /* audio blocked before user gesture — confetti still fires */ }
}

function fireConfetti() {
  const cv = document.createElement('canvas');
  Object.assign(cv.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: '9999' });
  cv.width = window.innerWidth; cv.height = window.innerHeight;
  document.body.appendChild(cv);
  const cx = cv.getContext('2d')!;
  const COLORS = ['#2fbf71', '#1a4a7a', '#f4a825', '#e2574c', '#7c5cff', '#3aa7e0'];
  const N = 160;
  const parts = Array.from({ length: N }, () => ({
    x: cv.width / 2 + (Math.random() - 0.5) * cv.width * 0.3,
    y: cv.height * 0.35,
    vx: (Math.random() - 0.5) * 14,
    vy: -6 - Math.random() * 9,
    w: 6 + Math.random() * 6, h: 8 + Math.random() * 8,
    rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  }));
  const t0 = performance.now();
  const tick = (t: number) => {
    const el = (t - t0) / 1000;
    cx.clearRect(0, 0, cv.width, cv.height);
    for (const p of parts) {
      p.vy += 0.25; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.vx *= 0.99;
      cx.save(); cx.translate(p.x, p.y); cx.rotate(p.rot);
      cx.globalAlpha = Math.max(0, 1 - el / 3);
      cx.fillStyle = p.color; cx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      cx.restore();
    }
    if (el < 3) requestAnimationFrame(tick); else cv.remove();
  };
  requestAnimationFrame(tick);
}

const LABEL_STYLE: Record<string, { bg: string; fg: string }> = {
  'Paid': { bg: '#d8f0e5', fg: '#1a6e42' },
  'Resolution': { bg: '#ece9f7', fg: '#4a3d8f' },
  'Pending': { bg: '#dcecfb', fg: '#1a4a7a' },
  'Due': { bg: '#dcecfb', fg: '#1a4a7a' },
  'Upcoming': { bg: '#eef1f5', fg: '#5a6b7d' },
  'Overdue': { bg: '#fde0d8', fg: '#9a2a1a' },
  'Not in bank': { bg: '#fde0d8', fg: '#9a2a1a' },
  'Short-paid': { bg: '#fde0d8', fg: '#9a2a1a' },
  'Overpaid': { bg: '#fdefd5', fg: '#7a4e10' },
  'Unknown': { bg: '#fdefd5', fg: '#7a4e10' },
  'Breakdown pending': { bg: '#dcecfb', fg: '#1a4a7a' },
};

const sCard: CSSProperties = {
  background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
  boxShadow: '0 1px 4px rgba(26,74,122,0.07)',
};
const sBtn = (active = false): CSSProperties => ({
  padding: '7px 16px', borderRadius: 8, border: `1px solid ${active ? C.navy : C.border}`,
  background: active ? C.navy : C.surface, color: active ? '#fff' : C.muted,
  cursor: 'pointer', fontWeight: 600, fontSize: 12,
  fontFamily: "'Outfit', sans-serif", display: 'inline-flex', alignItems: 'center', gap: 6,
});

function thisMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
// A booking belongs to the month it CHECKS OUT; payout-level rows
// (no stay dates) belong to their payout month.
function rowMonthKey(r: ReconRow): string {
  const iso = isoFromDMY(r.checkout);
  if (iso) return iso.slice(0, 7);
  return r.sortDate ? `${r.sortDate.getFullYear()}-${String(r.sortDate.getMonth() + 1).padStart(2, '0')}` : '';
}
// Month in which payment lands (bank date if landed, else payout date)
function rowPayMonthKey(r: ReconRow): string | null {
  const iso = isoFromDMY(r.bankDate) || isoFromDMY(r.payoutDate);
  return iso ? iso.slice(0, 7) : null;
}

interface Props { bookings: BookingRecord[]; }

function isoFromDMY(s: string): string | null {
  const p = (s || '').trim().split('/');
  return p.length === 3 ? `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}` : null;
}
function isoFromMDY(s: string): string | null {
  const p = (s || '').trim().split('/');
  return p.length === 3 ? `${p[2]}-${p[0].padStart(2, '0')}-${p[1].padStart(2, '0')}` : null;
}

export default function LiveReconciliationTab({ bookings }: Props) {
  const [tab, setTab] = useState<'recon' | 'bank'>('recon');
  const [monthKey, setMonthKey] = useState<string>(thisMonthKey());
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [setupMsg, setSetupMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ issues: false, received: false, transit: false, due: false, nextMonth: false });
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [showDismissed, setShowDismissed] = useState(false);

  useEffect(() => {
    supabase.from('recon_dismissed').select('key').then(({ data }) => {
      if (data) setDismissed(new Set(data.map((d: any) => d.key)));
    });
  }, [refreshKey]);

  const dismissIssue = async (key: string) => {
    setDismissed(prev => new Set(prev).add(key));
    await supabase.from('recon_dismissed').insert({ key });
  };
  const restoreIssue = async (key: string) => {
    setDismissed(prev => { const n = new Set(prev); n.delete(key); return n; });
    await supabase.from('recon_dismissed').delete().eq('key', key);
  };
  const abRef = useRef<HTMLInputElement>(null);

  const [avantio, setAvantio] = useState<AvantioBooking[]>([]);
  const [airbnbPayouts, setAirbnbPayouts] = useState<AirbnbPayout[]>([]);
  const [bcomReservations, setBcomReservations] = useState<BcomReservation[]>([]);
  const [bank, setBank] = useState<BankTx[]>([]);
  const [counts, setCounts] = useState({ avantio: 0, payouts: 0, bcom: 0, bank: 0 });

  useEffect(() => {
    (async () => {
      setLoading(true); setLoadErr(null);
      try {
        const [avRes, apRes, aiRes, bcRes, bkRes] = await Promise.all([
          supabase.from('recon_avantio_bookings').select('*'),
          supabase.from('recon_airbnb_payouts').select('*').eq('superseded', false),
          supabase.from('recon_airbnb_payout_items').select('*'),
          supabase.from('recon_bcom_reservations').select('*'),
          supabase.from('recon_bank_transactions').select('*'),
        ]);
        const firstErr = [avRes, apRes, aiRes, bcRes, bkRes].find(r => r.error);
        if (firstErr?.error) throw firstErr.error;

        const av: AvantioBooking[] = (avRes.data || []).map((r: any) => ({
          bookingNumber: r.booking_number, code: r.code, portal: r.portal,
          property: r.property,
          checkin: dmy(r.checkin ? parseAny(r.checkin) : null),
          checkout: dmy(r.checkout ? parseAny(r.checkout) : null),
          checkinDate: r.checkin ? parseAny(r.checkin) : null,
          checkoutDate: r.checkout ? parseAny(r.checkout) : null,
          paid: Number(r.paid), commission: Number(r.commission),
          extras: Number(r.extras ?? 0), expected: Number(r.expected),
        }));

        const itemsByPayout: Record<string, AirbnbItem[]> = {};
        for (const it of (aiRes.data || []) as any[]) {
          if (!itemsByPayout[it.payout_id]) itemsByPayout[it.payout_id] = [];
          itemsByPayout[it.payout_id].push({
            type: it.item_type, code: it.code, listing: it.listing || '',
            amount: Number(it.amount), passThrough: Number(it.pass_through),
          });
        }
        const ap: AirbnbPayout[] = ((apRes.data || []) as any[]).map(p => {
          const d = p.payout_date ? parseAny(p.payout_date) : null;
          const arr = p.arriving_date ? parseAny(p.arriving_date) : null;
          return {
            date: d ? `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}` : '',
            arriving: arr ? `${String(arr.getMonth()+1).padStart(2,'0')}/${String(arr.getDate()).padStart(2,'0')}/${arr.getFullYear()}` : '',
            amount: Number(p.amount),
            items: itemsByPayout[p.id] || [],
            bankDate: null, bankMatched: false,
          };
        });

        const bc: BcomReservation[] = ((bcRes.data || []) as any[]).map(r => ({
          ref: r.ref, statementDescriptor: r.statement_descriptor || '',
          property: r.property || '',
          checkin: r.checkin || '', checkout: r.checkout || '',
          payoutType: r.payout_type, gross: Number(r.gross), commission: Number(r.commission),
          commissionInvoiced: r.commission_invoiced, serviceFee: Number(r.service_fee),
          payable: Number(r.payable), payoutDate: r.payout_date,
          bankDate: null, bankMatched: false,
        }));

        const bk: BankTx[] = ((bkRes.data || []) as any[]).map(t => ({
          date: dmy(parseAny(t.tx_date)),
          dateObj: parseAny(t.tx_date),
          name: t.counterparty, amount: Number(t.amount), used: false,
        }));

        setAvantio(av); setAirbnbPayouts(ap); setBcomReservations(bc); setBank(bk);
        setCounts({ avantio: av.length, payouts: ap.length, bcom: bc.length, bank: bk.length });
        setLastRefresh(new Date());
      } catch (e: any) {
        setLoadErr(e?.message || 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshKey]);

  // filter to selected time window
  const windowDays = 90;
  const cutoff = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - windowDays);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [windowDays]);

  const filteredBank = useMemo(() =>
    bank.filter(t => t.dateObj && t.dateObj >= cutoff).sort((a, b) => (b.dateObj?.getTime() || 0) - (a.dateObj?.getTime() || 0)), 
    [bank, cutoff]);

  // Matching ALWAYS runs on the full dataset — a June payout must be able to
  // find its June bank transaction regardless of the display window. The
  // 7/30/90-day selector only filters which rows are SHOWN below.
  const engine = useMemo(() => {
    if (!airbnbPayouts.length && !bcomReservations.length && !bank.length) return null;
    return reconcile(
      avantio,
      airbnbPayouts.map(p => ({ ...p, bankDate: null, bankMatched: false, items: [...p.items] })),
      bcomReservations.map(r => ({ ...r, bankDate: null, bankMatched: false })),
      bank.map(t => ({ ...t, used: false })),
    );
  }, [avantio, airbnbPayouts, bcomReservations, bank]);

  // separate issues from ok transactions; window applies to received/due.
  // Issues always show regardless of window — an unresolved problem doesn't
  // stop needing attention because it aged out of the last 7 days.
  const dismissKeyOf = (r: ReconRow) =>
    `${r.channel}|${r.code}|${r.label}|${r.channelPaid ?? ''}|${r.expected ?? ''}`;

  const allRows = useMemo(() => {
    if (!engine) return { issues: [], dismissedIssues: [], received: [], transit: [], due: [], nextMonth: [] };
    const rows = engine.rows.filter(r => r.bucket !== 'hidden' && rowMonthKey(r) === monthKey);
    const issuePri = (l: string) => l === 'Short-paid' ? 0 : l === 'Overdue' ? 1 : l === 'Overpaid' ? 2 : 3;
    const issuesAll = rows.filter(r => r.bucket === 'issue').sort((a, b) => issuePri(a.label) - issuePri(b.label));
    const nonIssue = rows.filter(r => r.bucket !== 'issue');
    // stays in this month whose payment lands in a LATER month
    const crossMonth = (r: ReconRow) => { const pm = rowPayMonthKey(r); return pm !== null && pm > monthKey; };
    return {
      issues: issuesAll.filter(r => !dismissed.has(dismissKeyOf(r))),
      dismissedIssues: issuesAll.filter(r => dismissed.has(dismissKeyOf(r))),
      nextMonth: nonIssue.filter(crossMonth).sort((a, b) => (b.sortDate?.getTime() || 0) - (a.sortDate?.getTime() || 0)),
      received: nonIssue.filter(r => r.bucket === 'paid' && !crossMonth(r)).sort((a, b) => (b.sortDate?.getTime() || 0) - (a.sortDate?.getTime() || 0)),
      transit: nonIssue.filter(r => r.bucket === 'onway' && r.payoutKey !== null && !crossMonth(r)).sort((a, b) => (b.sortDate?.getTime() || 0) - (a.sortDate?.getTime() || 0)),
      due: nonIssue.filter(r => r.bucket === 'onway' && r.payoutKey === null && !crossMonth(r)).sort((a, b) => (a.sortDate?.getTime() || 0) - (b.sortDate?.getTime() || 0)),
    };
  }, [engine, monthKey, dismissed]);

  const stats = useMemo(() => {
    if (!engine) return null;
    const amt = (r: ReconRow) => r.channelPaid ?? r.expected ?? 0;
    const received = allRows.received.reduce((s, r) => s + (r.channelPaid || 0), 0)
      + allRows.nextMonth.filter(r => r.bucket === 'paid').reduce((s, r) => s + (r.channelPaid || 0), 0);
    const transit = allRows.transit.reduce((s, r) => s + amt(r), 0);
    const due = allRows.due.reduce((s, r) => s + amt(r), 0)
      + allRows.nextMonth.filter(r => r.bucket !== 'paid').reduce((s, r) => s + amt(r), 0);
    return {
      issues: allRows.issues.length,
      received: r2(received),
      transit: r2(transit),
      due: r2(due + transit),
    };
  }, [engine, allRows]);

  // setup actions
  const syncAvantio = useCallback(async () => {
    const rows = toAvantio(bookings).map(a => ({
      booking_number: a.bookingNumber, code: a.code, portal: a.portal, property: a.property,
      checkin: isoFromDMY(a.checkin), checkout: isoFromDMY(a.checkout),
      paid: a.paid, commission: a.commission, extras: a.extras, expected: a.expected,
    }));
    if (!rows.length) { setSetupMsg('Load the Avantio CSV on the Processor tab first'); return; }
    setBusy(true); setSetupMsg('Syncing…');
    const { error } = await supabase.from('recon_avantio_bookings').upsert(rows, { onConflict: 'booking_number' });
    setSetupMsg(error ? 'Failed: ' + error.message : `${rows.length} bookings synced`);
    setBusy(false);
    if (!error) setRefreshKey(k => k + 1);
  }, [bookings]);

  const importAirbnbCsv = useCallback((file: File) => {
    setBusy(true); setSetupMsg('Importing ' + file.name + '…');
    const r = new FileReader();
    r.onload = async e => {
      try {
        const payouts = parseAirbnbCsv(e.target?.result as string);
        // Integrity guard: every payout's items (incl. pass-through) must sum
        // to its amount. A mismatch means Airbnb changed the CSV format or a
        // row type we don't recognise — surface it loudly, don't import quietly.
        const badSums = payouts.filter(p => {
          if (!p.items.length) return p.amount !== 0;
          const sum = p.items.reduce((s, i) => s + i.amount + i.passThrough, 0);
          return Math.abs(sum - p.amount) > 0.02;
        });
        let imported = 0;
        for (const p of payouts) {
          const payoutRow = {
            payout_date: isoFromMDY(p.date), arriving_date: isoFromMDY(p.arriving),
            amount: r2(p.amount), airbnb_ref: null as string | null, source: 'csv' as const,
          };
          const { data: existing } = await supabase.from('recon_airbnb_payouts').select('id')
            .eq('payout_date', payoutRow.payout_date).eq('amount', payoutRow.amount)
            .eq('source', 'csv').maybeSingle();
          let payoutId: string;
          if (existing) { payoutId = existing.id; }
          else {
            const { data: up, error } = await supabase.from('recon_airbnb_payouts').insert(payoutRow).select('id').single();
            if (error || !up) continue;
            payoutId = up.id;
          }
          if (p.items.length) {
            await supabase.from('recon_airbnb_payout_items').upsert(
              p.items.map(i => ({ payout_id: payoutId, item_type: i.type, code: i.code, listing: i.listing, amount: r2(i.amount), pass_through: r2(i.passThrough) })),
              { onConflict: 'payout_id,code,item_type' }
            );
          }
          imported++;
        }
        setSetupMsg(
          badSums.length
            ? `${imported} payouts imported — \u26A0 ${badSums.length} with item sums that don't match the payout total (${badSums.map(p => `${p.date} \u00A3${p.amount.toFixed(2)}`).join(', ')}) — check for a new Airbnb row type`
            : `${imported} payouts imported — all item sums verified ✓`
        );
      } catch (err: any) { setSetupMsg('Import failed: ' + (err?.message || String(err))); }
      setBusy(false);
      setRefreshKey(k => k + 1);
    };
    r.readAsText(file);
  }, []);


  // Celebrate newly-landed payouts (confetti + cha-ching + toast)
  const [celebrateMsg, setCelebrateMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!engine) return;
    const landed = new Map<string, { amount: number | null; date: string }>();
    for (const r of engine.rows) {
      if (r.payoutKey && r.bankDate) {
        if (!landed.has(r.payoutKey)) landed.set(r.payoutKey, { amount: r.payoutAmount, date: r.bankDate });
      }
    }
    let seen: string[] = [];
    let first = false;
    try {
      const raw = localStorage.getItem(SEEN_KEY);
      if (raw === null) first = true; else seen = JSON.parse(raw);
    } catch { first = true; }
    const seenSet = new Set(seen);
    const fresh = [...landed.keys()].filter(k => !seenSet.has(k));
    try { localStorage.setItem(SEEN_KEY, JSON.stringify([...landed.keys()])); } catch { /* ignore */ }
    if (first || fresh.length === 0) return;
    fireConfetti();
    chaChing();
    const total = fresh.reduce((s, k) => s + (landed.get(k)?.amount || 0), 0);
    setCelebrateMsg(fresh.length === 1
      ? `\u{1F389} ${fmt(total)} landed in the bank!`
      : `\u{1F389} ${fresh.length} payouts landed — ${fmt(total)}!`);
    const t = setTimeout(() => setCelebrateMsg(null), 6000);
    return () => clearTimeout(t);
  }, [engine]);

  const [expanded, setExpanded] = useState<string | null>(null);


  const downloadMonthCsv = () => {
    const rows = [...allRows.received, ...allRows.transit, ...allRows.due, ...allRows.nextMonth, ...allRows.issues, ...allRows.dismissedIssues];
    const header = ['Channel', 'Status', 'Property', 'Code', 'Check-in', 'Check-out', 'Payout sent', 'Landed in bank', 'Channel paid', 'Expected (Avantio)', 'Difference', 'Commission due', 'Note'];
    const lines = [header.map(escCsv).join(',')];
    for (const r of rows) {
      lines.push([
        r.channel, r.label + (dismissed.has(dismissKeyOf(r)) ? ' (resolved)' : ''), r.property, r.code,
        r.checkin, r.checkout, r.payoutDate, r.bankDate,
        r.channelPaid ?? '', r.expected ?? '', r.diff ?? '', r.commissionDue || '', r.note,
      ].map(escCsv).join(','));
    }
    lines.push('');
    lines.push(['Channel', 'Received', 'Outstanding'].map(escCsv).join(','));
    for (const ch of ['Airbnb', 'Booking.com'] as const) {
      const recd = rows.filter(r => r.channel === ch && r.bucket === 'paid').reduce((s, r) => s + (r.channelPaid || 0), 0);
      const out = rows.filter(r => r.channel === ch && r.bucket === 'onway').reduce((s, r) => s + (r.channelPaid ?? r.expected ?? 0), 0);
      lines.push([ch, r2(recd).toFixed(2), r2(out).toFixed(2)].map(escCsv).join(','));
    }
    const recdT = rows.filter(r => r.bucket === 'paid').reduce((s, r) => s + (r.channelPaid || 0), 0);
    const outT = rows.filter(r => r.bucket === 'onway').reduce((s, r) => s + (r.channelPaid ?? r.expected ?? 0), 0);
    lines.push(['TOTAL', r2(recdT).toFixed(2), r2(outT).toFixed(2)].map(escCsv).join(','));
    dlCsv(lines.join('\n'), `igloo-recon-${monthKey}.csv`);
  };

  const detailField = (label: string, value: string | null | undefined) =>
    value ? (
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
        <div style={{ fontSize: 12.5, color: C.navyDeep, fontWeight: 600, marginTop: 1 }}>{value}</div>
      </div>
    ) : null;

  const rowLine = (r: ReconRow, rid: string, indent: boolean) => {
    const st = LABEL_STYLE[r.label] || (r.bucket === 'issue' ? { bg: '#fde0d8', fg: '#9a2a1a' } : { bg: '#d8f0e5', fg: '#1a6e42' });
    const amount = r.label === 'Short-paid' && r.diff != null ? r.diff : (r.channelPaid ?? r.expected ?? null);
    const isOpen = expanded === rid;
    const stay = r.checkin && r.checkout ? `${r.checkin} \u2192 ${r.checkout}` : (r.checkout || r.checkin || '');
    return (
      <div key={rid}>
        <div
          onClick={() => setExpanded(isOpen ? null : rid)}
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: `8px 20px 8px ${indent ? 36 : 20}px`, borderBottom: `1px solid ${C.surface2}`, fontSize: 13, cursor: 'pointer', background: isOpen ? '#f7f9fc' : undefined }}
        >
          <span style={{ ...st, display: 'inline-block', padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, width: 80, textAlign: 'center', flexShrink: 0 }}>{r.label}</span>
          <span style={{ fontWeight: 600, color: C.navyDeep, width: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.property}>{r.property}</span>
          <span style={{ fontFamily: 'monospace', fontSize: 11, color: C.dim, width: 100 }}>{r.code}</span>
          <span style={{ color: C.muted, fontSize: 11.5, width: 150, whiteSpace: 'nowrap' }} title="Stay dates (check-in → check-out)">{stay}</span>
          <span style={{ color: C.dim, fontSize: 11.5, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.note}</span>
          <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: r.bucket === 'issue' ? C.coral : C.green, minWidth: 84, textAlign: 'right' }}>
            {amount != null ? fmt(amount) : ''}
          </span>
          <span style={{ color: C.dim, fontSize: 10, width: 12 }}>{isOpen ? '\u25B4' : '\u25BE'}</span>
        </div>
        {isOpen && (
          <div style={{ padding: `12px 20px 14px ${indent ? 36 : 20}px`, background: '#f7f9fc', borderBottom: `1px solid ${C.surface2}`, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px 18px' }}>
            {detailField('Property', r.property)}
            {detailField('Booking code', r.code)}
            {detailField('Check-in', r.checkin)}
            {detailField('Check-out', r.checkout)}
            {detailField('Channel', r.channel)}
            {detailField('Payout sent', r.payoutDate)}
            {detailField('Landed in bank', r.bankDate || (r.payoutDate ? 'Not yet' : ''))}
            {detailField('Payout batch total', r.payoutAmount != null ? fmt(r.payoutAmount) : '')}
            {detailField('Channel paid', r.channelPaid != null ? fmt(r.channelPaid) : '')}
            {detailField('Expected (Avantio)', r.expected != null ? fmt(r.expected) : '')}
            {detailField('Difference', r.diff != null && Math.abs(r.diff) >= 0.005 ? fmt(r.diff) : '')}
            {detailField('Commission to invoice', r.commissionDue ? fmt(r.commissionDue) : '')}
            {r.note && (
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: 0.4 }}>Status</div>
                <div style={{ fontSize: 12.5, color: C.navyDeep, marginTop: 1 }}>{r.note}</div>
              </div>
            )}
            {r.bucket === 'issue' && (
              <div style={{ gridColumn: '1 / -1', marginTop: 4 }}>
                {dismissed.has(dismissKeyOf(r)) ? (
                  <button style={{ ...sBtn(false), fontSize: 12 }} onClick={(e) => { e.stopPropagation(); restoreIssue(dismissKeyOf(r)); }}>
                    ↩ Restore issue
                  </button>
                ) : (
                  <button style={{ ...sBtn(false), fontSize: 12, color: '#1a6e42', borderColor: '#1a6e42' }} onClick={(e) => { e.stopPropagation(); dismissIssue(dismissKeyOf(r)); }}>
                    ✓ Mark resolved — sorted in Avantio
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Group a bucket's rows: rows sharing a payoutKey render under a payout
  // header (batch-paid together); rows without one render standalone.
  const groupedRows = (rows: ReconRow[], keyPrefix: string) => {
    const groups: { key: string | null; rows: ReconRow[] }[] = [];
    const byKey = new Map<string, { key: string; rows: ReconRow[] }>();
    for (const r of rows) {
      if (r.payoutKey) {
        let g = byKey.get(r.payoutKey);
        if (!g) { g = { key: r.payoutKey, rows: [] }; byKey.set(r.payoutKey, g); groups.push(g); }
        g.rows.push(r);
      } else groups.push({ key: null, rows: [r] });
    }
    const out: ReactNode[] = [];
    groups.forEach((g, gi) => {
      const showHeader = g.key !== null;
      if (showHeader) {
        const first = g.rows[0];
        const batchTotal = first.payoutAmount ?? r2(g.rows.reduce((s, r) => s + (r.channelPaid || 0), 0));
        out.push(
          <div key={`${keyPrefix}-h-${gi}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 20px', background: '#f0f4f9', borderBottom: `1px solid ${C.surface2}`, fontSize: 11.5, fontWeight: 700, color: C.navy }}>
            <span>{first.channel} payout {fmt(batchTotal)}</span>
            <span style={{ fontWeight: 500, color: C.muted }}>· {g.rows.length} booking{g.rows.length === 1 ? '' : 's'}</span>
            {first.payoutDate && <span style={{ fontWeight: 500, color: C.muted }}>· sent {first.payoutDate}</span>}
            <span style={{ fontWeight: 600, color: first.bankDate ? C.green : g.rows.some(r => r.bucket === 'issue') ? C.coral : '#9a6a10' }}>
              · {first.bankDate ? `landed in bank ${first.bankDate} ✓`
                  : g.rows.some(r => r.bucket === 'issue') ? 'not in bank'
                  : `awaiting bank${(() => { const a = /Arrives (\S+)/.exec(g.rows[0].note || ''); return a ? ` · arrives ${a[1]}` : ''; })()}`}
            </span>
          </div>
        );
      }
      g.rows.forEach((r, ri) => out.push(rowLine(r, `${keyPrefix}-${gi}-${ri}-${r.code}`, showHeader)));
    });
    return out;
  };

  const bankLine = (t: BankTx, i: number) => (
    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 20px', borderBottom: `1px solid ${C.surface2}`, fontSize: 13 }}>
      <span style={{ color: C.muted, fontSize: 12, width: 78 }}>{t.date}</span>
      <span style={{ fontWeight: 500, color: C.navyDeep, flex: 1 }}>{t.name}</span>
      <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: C.green, minWidth: 84, textAlign: 'right' }}>
        {fmt(t.amount)}
      </span>
    </div>
  );

  if (loading) return (
    <div style={{ ...sCard, padding: '48px 24px', textAlign: 'center', color: C.muted, fontSize: 13 }}>Loading…</div>
  );

  if (loadErr) return (
    <div style={{ ...sCard, padding: '20px 24px', borderLeft: `3px solid ${C.coral}` }}>
      <div style={{ fontWeight: 600, fontSize: 13, color: C.coral, marginBottom: 4 }}>Couldn't load live data</div>
      <div style={{ color: C.muted, fontSize: 12 }}>{loadErr}</div>
    </div>
  );

  return (
    <div>
      {/* ── TAB SELECTOR ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <button style={sBtn(tab === 'recon')} onClick={() => setTab('recon')}>Reconciliation</button>
        <button style={sBtn(tab === 'bank')} onClick={() => setTab('bank')}>Bank Transactions</button>
        <div style={{ flex: 1 }} />
        {lastRefresh && (
          <span style={{ fontSize: 11.5, color: C.dim }}>
            {lastRefresh.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
        <button style={sBtn()} onClick={() => setRefreshKey(k => k + 1)}>↻ Refresh</button>
        <button style={{ ...sBtn(), color: C.dim }} onClick={() => setShowSetup(s => !s)}>
          ⚙ {showSetup ? '▴' : '▾'}
        </button>
      </div>

      {/* ── SETUP DRAWER ── */}
      {showSetup && (
        <div style={{ ...sCard, padding: '16px 20px', marginBottom: 20, background: C.surface2, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>Setup / backfill</span>
          <div style={{ width: 1, height: 20, background: C.border }} />
          <button style={sBtn()} onClick={syncAvantio} disabled={busy}>
            Sync Avantio {bookings.length ? `(${bookings.length} loaded)` : ''}
          </button>
          <button style={sBtn()} onClick={() => abRef.current?.click()} disabled={busy}>
            Import Airbnb CSV
          </button>
          <input ref={abRef} type="file" accept=".csv" style={{ display: 'none' }}
            onChange={e => { if (e.target.files?.[0]) importAirbnbCsv(e.target.files[0]); e.target.value = ''; }} />
          {setupMsg && <span style={{ fontSize: 12, color: C.muted }}>{setupMsg}</span>}
        </div>
      )}

      {/* ── RECONCILIATION TAB ── */}
      {tab === 'recon' && (
        <>
          {/* Month selector — the report is a ledger of the month's DEPARTURES */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
            <button style={sBtn(false)} onClick={() => setMonthKey(m => shiftMonth(m, -1))}>{'‹'}</button>
            <div style={{ fontWeight: 800, fontSize: 16, color: C.navyDeep, minWidth: 150, textAlign: 'center' }}>{monthLabel(monthKey)}</div>
            <button style={sBtn(false)} onClick={() => setMonthKey(m => shiftMonth(m, 1))}>{'›'}</button>
            {monthKey !== thisMonthKey() && (
              <button style={sBtn(false)} onClick={() => setMonthKey(thisMonthKey())}>This month</button>
            )}
            <div style={{ flex: 1 }} />
            <button style={sBtn(false)} onClick={downloadMonthCsv}>{'⤓'} Download {monthLabel(monthKey)} CSV</button>
          </div>

          {/* Summary strip */}
          {stats && (
            <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
              <div style={{ ...sCard, flex: 1, padding: '16px 20px' }}>
                <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Received</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: C.green }}>{fmt0(stats.received)}</div>
              </div>
              <div style={{ ...sCard, flex: 1, padding: '16px 20px' }}>
                <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Due</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: C.navy }}>{fmt0(stats.due)}</div>
              </div>
              <div style={{ ...sCard, flex: 1, padding: '16px 20px' }}>
                <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Issues</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: stats.issues > 0 ? C.coral : C.green }}>
                  {stats.issues > 0 ? stats.issues : '✓'}
                </div>
              </div>
            </div>
          )}

          {/* Issues box */}
          {allRows.issues.length > 0 && (
            <div style={{ ...sCard, marginBottom: 20, borderLeft: `4px solid ${C.coral}` }}>
              <div style={{ padding: '12px 20px', background: '#fef5f4', borderBottom: `1px solid ${C.border}`, fontWeight: 700, color: C.coral, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={() => setCollapsed(c => ({ ...c, issues: !c.issues }))}>
                <span>{collapsed.issues ? '▾' : '▸'}</span>
                <span>⚠ {allRows.issues.length} issue{allRows.issues.length !== 1 ? 's' : ''} need attention</span>
              </div>
              {!collapsed.issues && groupedRows(allRows.issues, 'iss')}
              {!collapsed.issues && allRows.dismissedIssues.length > 0 && (
                <div style={{ padding: '8px 20px', fontSize: 12, color: C.muted, borderTop: `1px solid ${C.surface2}` }}>
                  <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => setShowDismissed(s => !s)}>
                    {allRows.dismissedIssues.length} resolved {showDismissed ? '— hide' : '— show'}
                  </span>
                </div>
              )}
              {!collapsed.issues && showDismissed && groupedRows(allRows.dismissedIssues, 'dis')}
            </div>
          )}

          {/* Received box */}
          {allRows.received.length > 0 && (
            <div style={{ ...sCard, marginBottom: 20 }}>
              <div style={{ padding: '12px 20px', background: '#f5fdf9', borderBottom: `1px solid ${C.border}`, fontWeight: 700, color: C.green, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={() => setCollapsed(c => ({ ...c, received: !c.received }))}>
                <span>{collapsed.received ? '▾' : '▸'}</span>
                <span>✓ Received — {fmt0(stats?.received || 0)} ({allRows.received.length} txs)</span>
              </div>
              {!collapsed.received && groupedRows(allRows.received, 'rcv')}
            </div>
          )}

          {celebrateMsg && (
            <div style={{ position: 'fixed', top: 18, left: '50%', transform: 'translateX(-50%)', zIndex: 10000, background: '#1a6e42', color: '#fff', padding: '12px 22px', borderRadius: 12, fontWeight: 700, fontSize: 14, boxShadow: '0 6px 24px rgba(0,0,0,0.25)' }}>
              {celebrateMsg}
            </div>
          )}

          {/* Pays next month box */}
          {allRows.nextMonth.length > 0 && (
            <div style={{ ...sCard }}>
              <div style={{ padding: '12px 20px', background: '#f2edfb', borderBottom: `1px solid ${C.border}`, fontWeight: 700, color: '#4a3d8f', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={() => setCollapsed(c => ({ ...c, nextMonth: !c.nextMonth }))}>
                <span>{collapsed.nextMonth ? '▾' : '▸'}</span>
                <span>↪ {monthLabel(monthKey)} stays paying in {monthLabel(shiftMonth(monthKey, 1))} — {fmt0(r2(allRows.nextMonth.reduce((s, r) => s + (r.channelPaid ?? r.expected ?? 0), 0)))} ({allRows.nextMonth.length} txs)</span>
              </div>
              {!collapsed.nextMonth && groupedRows(allRows.nextMonth, 'nxt')}
            </div>
          )}

          {/* Sent — awaiting bank box */}
          {allRows.transit.length > 0 && (
            <div style={{ ...sCard }}>
              <div style={{ padding: '12px 20px', background: '#fdf8ec', borderBottom: `1px solid ${C.border}`, fontWeight: 700, color: '#9a6a10', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={() => setCollapsed(c => ({ ...c, transit: !c.transit }))}>
                <span>{collapsed.transit ? '▾' : '▸'}</span>
                <span>↗ Sent — awaiting bank — {fmt0(stats?.transit || 0)} ({allRows.transit.length} txs)</span>
              </div>
              {!collapsed.transit && groupedRows(allRows.transit, 'trn')}
            </div>
          )}

          {/* Due box */}
          {allRows.due.length > 0 && (
            <div style={{ ...sCard }}>
              <div style={{ padding: '12px 20px', background: C.bluePale, borderBottom: `1px solid ${C.border}`, fontWeight: 700, color: C.navy, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={() => setCollapsed(c => ({ ...c, due: !c.due }))}>
                <span>{collapsed.due ? '▾' : '▸'}</span>
                <span>→ Due — awaiting payout — {fmt0(r2((stats?.due || 0) - (stats?.transit || 0)))} ({allRows.due.length} txs)</span>
              </div>
              {!collapsed.due && groupedRows(allRows.due, 'due')}
            </div>
          )}

          {/* No data */}
          {!engine && (
            <div style={{ ...sCard, padding: '48px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.navyDeep, marginBottom: 4 }}>No activity in this window</div>
              <div style={{ color: C.dim, fontSize: 12.5 }}>Try widening the window, or check the n8n workflows are running.</div>
            </div>
          )}
        </>
      )}

      {/* ── BANK TRANSACTIONS TAB ── */}
      {tab === 'bank' && (
        <>
          <div style={{ ...sCard }}>
            <div style={{ padding: '12px 20px', background: C.bluePale, borderBottom: `1px solid ${C.border}`, fontWeight: 700, color: C.navy, fontSize: 13 }}>
              Most recent ({filteredBank.length} in {WINDOWS.find(w => w.key === window)?.label.toLowerCase()})
            </div>
            {filteredBank.length > 0 ? (
              filteredBank.map((t, i) => bankLine(t, i))
            ) : (
              <div style={{ padding: '32px 20px', textAlign: 'center', color: C.muted, fontSize: 13 }}>
                No bank transactions in this window
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
