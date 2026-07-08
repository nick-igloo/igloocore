import { useState, useEffect, useMemo, useCallback, useRef, CSSProperties } from 'react';
import { supabase } from '../lib/supabase';
import {
  BookingRecord, AvantioBooking, AirbnbPayout, AirbnbItem, BcomReservation, BankTx,
  toAvantio, parseAirbnbCsv, parseAny, reconcile, r2, dmy, fmt, fmt0,
} from '../lib/reconEngine';

// ═══════════════════════════════════════════════════════════════════
// src/pages/LiveReconciliationTab.tsx — LIVE reconciliation
// Monitoring dashboard: what's happening now, what's due, what's broken.
// No manual uploads needed once n8n is running.
// ═══════════════════════════════════════════════════════════════════

const C = {
  navy: '#1a4a7a', navyDeep: '#0d2850', blue: '#3a8fd1', bluePale: '#ddeeff',
  coral: '#e8513a', amber: '#e8a020', green: '#3ab87a',
  bg: '#f0f4f9', surface: '#ffffff', surface2: '#eef3f9',
  border: '#d4e2ef', muted: '#5a7a9a', dim: '#9ab0c5',
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

type Window = '7d' | '30d' | '90d';
const WINDOWS: { key: Window; label: string; days: number }[] = [
  { key: '7d', label: 'Last 7 days', days: 7 },
  { key: '30d', label: 'Last 30 days', days: 30 },
  { key: '90d', label: 'Last 90 days', days: 90 },
];

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
  const [window, setWindow] = useState<Window>('7d');
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [setupMsg, setSetupMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
  const windowDays = WINDOWS.find(w => w.key === window)?.days || 7;
  const cutoff = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - windowDays);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [windowDays]);

  const filteredBank = useMemo(() =>
    bank.filter(t => t.dateObj && t.dateObj >= cutoff), [bank, cutoff]);

  const filteredAirbnb = useMemo(() =>
    airbnbPayouts.filter(p => {
      const d = parseAny(p.date);
      return d && d >= cutoff;
    }), [airbnbPayouts, cutoff]);

  const filteredBcom = useMemo(() =>
    bcomReservations.filter(r => {
      const d = r.payoutDate ? parseAny(String(r.payoutDate)) : null;
      return d && d >= cutoff;
    }), [bcomReservations, cutoff]);

  const engine = useMemo(() => {
    if (!filteredAirbnb.length && !filteredBcom.length && !filteredBank.length) return null;
    return reconcile(
      avantio,
      filteredAirbnb.map(p => ({ ...p, bankDate: null, bankMatched: false, items: [...p.items] })),
      filteredBcom.map(r => ({ ...r, bankDate: null, bankMatched: false })),
      filteredBank.map(t => ({ ...t, used: false })),
    );
  }, [avantio, filteredAirbnb, filteredBcom, filteredBank]);

  // separate issues from ok transactions
  const allRows = useMemo(() => {
    if (!engine) return { issues: [], received: [], due: [] };
    const rows = engine.rows.filter(r => r.bucket !== 'hidden');
    return {
      issues: rows.filter(r => r.bucket === 'issue').sort((a, b) => {
        const p = (l: string) => l === 'Short-paid' ? 0 : l === 'Overdue' ? 1 : l === 'Overpaid' ? 2 : 3;
        return p(a.label) - p(b.label);
      }),
      received: rows.filter(r => r.bucket === 'paid').sort((a, b) => (b.sortDate?.getTime() || 0) - (a.sortDate?.getTime() || 0)),
      due: rows.filter(r => r.bucket === 'onway').sort((a, b) => (a.sortDate?.getTime() || 0) - (b.sortDate?.getTime() || 0)),
    };
  }, [engine]);

  const stats = useMemo(() => {
    if (!engine) return null;
    const received = allRows.received.reduce((s, r) => s + (r.channelPaid || 0), 0);
    const due = allRows.due.reduce((s, r) => s + (r.channelPaid ?? r.expected ?? 0), 0);
    return {
      issues: allRows.issues.length,
      received: r2(received),
      due: r2(due),
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
        setSetupMsg(`${imported} payouts imported`);
      } catch (err: any) { setSetupMsg('Import failed: ' + (err?.message || String(err))); }
      setBusy(false);
      setRefreshKey(k => k + 1);
    };
    r.readAsText(file);
  }, []);

  const rowLine = (r: any, i: number) => {
    const st = r.bucket === 'issue' ? { bg: '#fde0d8', fg: '#9a2a1a' } : { bg: '#d8f0e5', fg: '#1a6e42' };
    const amount = r.label === 'Short-paid' && r.diff != null ? r.diff : (r.channelPaid ?? r.expected ?? null);
    return (
      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 20px', borderBottom: `1px solid ${C.surface2}`, fontSize: 13 }}>
        <span style={{ ...st, display: 'inline-block', padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, width: 80, textAlign: 'center' }}>{r.label}</span>
        <span style={{ fontWeight: 600, color: C.navyDeep, width: 190, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.property}>{r.property}</span>
        <span style={{ fontFamily: 'monospace', fontSize: 11, color: C.dim, width: 110 }}>{r.code}</span>
        <span style={{ color: C.muted, fontSize: 12, width: 78 }}>{r.checkout || r.payoutDate}</span>
        <span style={{ color: C.dim, fontSize: 11.5, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.note}</span>
        <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: r.bucket === 'issue' ? C.coral : C.green, minWidth: 84, textAlign: 'right' }}>
          {amount != null ? fmt(amount) : ''}
        </span>
      </div>
    );
  };

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
      {/* ── HEADER BAR ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        {WINDOWS.map(w => (
          <button key={w.key} style={sBtn(window === w.key)} onClick={() => setWindow(w.key)}>{w.label}</button>
        ))}
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

      {/* ── SUMMARY STRIP ── */}
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

      {/* ── ISSUES BOX ── */}
      {allRows.issues.length > 0 && (
        <div style={{ ...sCard, marginBottom: 20, borderLeft: `4px solid ${C.coral}` }}>
          <div style={{ padding: '12px 20px', background: '#fef5f4', borderBottom: `1px solid ${C.border}`, fontWeight: 700, color: C.coral, fontSize: 13 }}>
            ⚠ {allRows.issues.length} issue{allRows.issues.length !== 1 ? 's' : ''} need attention
          </div>
          {allRows.issues.map((r, i) => rowLine(r, i))}
        </div>
      )}

      {/* ── NO DATA ── */}
      {!engine && (
        <div style={{ ...sCard, padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.navyDeep, marginBottom: 4 }}>No activity in this window</div>
          <div style={{ color: C.dim, fontSize: 12.5 }}>Try widening the window, or check the n8n workflows are running.</div>
        </div>
      )}

      {/* ── RECEIVED ── */}
      {allRows.received.length > 0 && (
        <div style={{ ...sCard, marginBottom: 20 }}>
          <div style={{ padding: '12px 20px', background: '#f5fdf9', borderBottom: `1px solid ${C.border}`, fontWeight: 700, color: C.green, fontSize: 13 }}>
            ✓ Received — {fmt0(stats?.received || 0)} ({allRows.received.length} txs)
          </div>
          {allRows.received.map((r, i) => rowLine(r, i))}
        </div>
      )}

      {/* ── DUE ── */}
      {allRows.due.length > 0 && (
        <div style={{ ...sCard }}>
          <div style={{ padding: '12px 20px', background: C.bluePale, borderBottom: `1px solid ${C.border}`, fontWeight: 700, color: C.navy, fontSize: 13 }}>
            → Due — {fmt0(stats?.due || 0)} ({allRows.due.length} txs)
          </div>
          {allRows.due.map((r, i) => rowLine(r, 1000 + i))}
        </div>
      )}
    </div>
  );
}
