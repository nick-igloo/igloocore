import { useState, useEffect, useMemo, useCallback, useRef, CSSProperties } from 'react';
import { supabase } from '../lib/supabase';
import ReconView from '../components/ReconView';
import {
  BookingRecord, AvantioBooking, AirbnbPayout, AirbnbItem, BcomReservation, BankTx,
  toAvantio, parseAirbnbCsv, parseAny, parseMDY, reconcile, cleanNum, r2, dmy,
} from '../lib/reconEngine';

// ═══════════════════════════════════════════════════════════════════
// src/pages/LiveReconciliationTab.tsx — LIVE reconciliation
// Reads from Supabase (fed by n8n: Booking.com report emails, Airbnb
// payout emails, Monzo Google Sheet). Same engine + view as Manual.
// Extra controls: refresh, "Save expected values" (pushes the Avantio
// CSV loaded on the Processor tab into Supabase until the Avantio API
// pipeline exists), and "Import Airbnb CSV" (enriches email-skeleton
// payouts with per-booking detail).
// ═══════════════════════════════════════════════════════════════════

const C = {
  navy: '#1a4a7a', surface2: '#eef3f9', border: '#d4e2ef',
  muted: '#5a7a9a', dim: '#9ab0c5', navyDeep: '#0d2850', coral: '#e8513a',
};
const sBtn: CSSProperties = { padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12, fontFamily: "'Outfit', sans-serif", display: 'inline-flex', alignItems: 'center', gap: 6 };
const sGhost: CSSProperties = { ...sBtn, background: '#eef3f9', color: '#5a7a9a', border: '1px solid #d4e2ef' };

// ISO yyyy-mm-dd from mm/dd/yyyy
function isoFromMDY(s: string): string | null {
  const p = (s || '').trim().split('/');
  return p.length === 3 ? `${p[2]}-${p[0].padStart(2, '0')}-${p[1].padStart(2, '0')}` : null;
}
function isoFromDMY(s: string): string | null {
  const p = (s || '').trim().split('/');
  return p.length === 3 ? `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}` : null;
}

// ── Airbnb monthly CSV → Supabase (enriches email skeletons) ──
async function ingestAirbnbCsv(text: string): Promise<string> {
  const payouts = parseAirbnbCsv(text);
  let imported = 0;
  for (const p of payouts) {
    const payoutRow = {
      payout_date: isoFromMDY(p.date),
      arriving_date: isoFromMDY(p.arriving),
      amount: r2(p.amount),
      airbnb_ref: null as string | null,   // Airbnb CSV has no stable ref column in this export
      source: 'csv' as const,
    };
    // upsert by (payout_date, amount): find existing csv row first
    const { data: existing } = await supabase
      .from('recon_airbnb_payouts')
      .select('id')
      .eq('payout_date', payoutRow.payout_date)
      .eq('amount', payoutRow.amount)
      .eq('source', 'csv')
      .maybeSingle();
    let payoutId: string;
    if (existing) {
      payoutId = existing.id;
    } else {
      const { data: up, error } = await supabase
        .from('recon_airbnb_payouts')
        .insert(payoutRow)
        .select('id')
        .single();
      if (error || !up) continue;
      payoutId = up.id;
    }
    const itemRows = p.items.map(i => ({
      payout_id: payoutId,
      item_type: i.type,
      code: i.code,
      listing: i.listing,
      amount: r2(i.amount),
      pass_through: r2(i.passThrough),
    }));
    if (itemRows.length) {
      await supabase.from('recon_airbnb_payout_items')
        .upsert(itemRows, { onConflict: 'payout_id,code,item_type' });
    }
    imported++;
  }
  return `${imported} payouts imported`;
}

interface Props { bookings: BookingRecord[]; }

function LiveReconciliationTab({ bookings }: Props) {
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
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
          extras: Number(r.extras ?? 0),
          expected: Number(r.expected),
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
            // engine expects mm/dd/yyyy strings (Airbnb file format)
            date: d ? `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}` : '',
            arriving: arr ? `${String(arr.getMonth() + 1).padStart(2, '0')}/${String(arr.getDate()).padStart(2, '0')}/${arr.getFullYear()}` : '',
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
      } catch (e: any) {
        setLoadErr(e?.message || 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshKey]);

  const engine = useMemo(() => {
    if (!avantio.length && !airbnbPayouts.length && !bcomReservations.length) return null;
    return reconcile(
      avantio,
      airbnbPayouts.map(p => ({ ...p, bankDate: null, bankMatched: false, items: [...p.items] })),
      bcomReservations.map(r => ({ ...r, bankDate: null, bankMatched: false })),
      bank.map(t => ({ ...t, used: false })),
    );
  }, [avantio, airbnbPayouts, bcomReservations, bank]);

  const saveAvantio = useCallback(async () => {
    const rows = toAvantio(bookings).map(a => ({
      booking_number: a.bookingNumber, code: a.code, portal: a.portal,
      property: a.property,
      checkin: isoFromDMY(a.checkin), checkout: isoFromDMY(a.checkout),
      paid: a.paid, commission: a.commission, extras: a.extras, expected: a.expected,
    }));
    if (!rows.length) { setMsg('Load the Avantio CSV on the Processor tab first'); return; }
    setBusy(true); setMsg('Saving\u2026');
    const { error } = await supabase.from('recon_avantio_bookings')
      .upsert(rows, { onConflict: 'booking_number' });
    setMsg(error ? 'Save failed: ' + error.message : `${rows.length} expected values saved`);
    setBusy(false);
    if (!error) setRefreshKey(k => k + 1);
  }, [bookings]);

  const importAirbnb = useCallback((file: File) => {
    setBusy(true); setMsg('Importing ' + file.name + '\u2026');
    const r = new FileReader();
    r.onload = async e => {
      try {
        setMsg(await ingestAirbnbCsv(e.target?.result as string));
      } catch (err: any) {
        setMsg('Import failed: ' + (err?.message || String(err)));
      }
      setBusy(false);
      setRefreshKey(k => k + 1);
    };
    r.readAsText(file);
  }, []);

  const toolbar = (
    <>
      <button style={{ ...sBtn, background: C.navy, color: '#fff' }} onClick={() => setRefreshKey(k => k + 1)} disabled={busy}>
        &#8635; Refresh
      </button>
      <button style={sGhost} onClick={saveAvantio} disabled={busy || !bookings.length}
        title="Push the Avantio CSV loaded on the Processor tab into the live database">
        Save expected values{bookings.length ? ` (${bookings.length})` : ''}
      </button>
      <button style={sGhost} onClick={() => abRef.current?.click()} disabled={busy}
        title="Monthly Airbnb transaction CSV — adds per-booking detail to email-notified payouts">
        Import Airbnb CSV
      </button>
      <input ref={abRef} type="file" accept=".csv" style={{ display: 'none' }}
        onChange={e => { if (e.target.files?.[0]) importAirbnb(e.target.files[0]); e.target.value = ''; }} />
      <span style={{ fontSize: 11.5, color: C.dim }}>
        {msg || `${counts.avantio} expected \u00B7 ${counts.payouts} Airbnb payouts \u00B7 ${counts.bcom} B.com \u00B7 ${counts.bank} bank txs`}
      </span>
    </>
  );

  if (loading) {
    return <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, padding: '48px 24px', textAlign: 'center', color: C.muted, fontSize: 13 }}>Loading live position\u2026</div>;
  }
  if (loadErr) {
    return (
      <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.coral}`, borderRadius: 12, padding: '20px 24px' }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: C.coral, marginBottom: 4 }}>Couldn't load live data</div>
        <div style={{ color: C.muted, fontSize: 12 }}>{loadErr}</div>
        <div style={{ color: C.dim, fontSize: 11.5, marginTop: 6 }}>Check the recon_* tables exist in Supabase (run recon_schema.sql).</div>
      </div>
    );
  }

  return (
    <ReconView
      engine={engine}
      toolbar={toolbar}
      exportPrefix="reconciliation_live"
      emptyMessage={
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.navyDeep, marginBottom: 4 }}>No live data yet</div>
          <div style={{ color: C.dim, fontSize: 12.5 }}>Once the n8n workflows are running this fills itself. To seed it now: load the Avantio CSV on the Processor tab, click "Save expected values", then Import the Airbnb CSV.</div>
        </div>
      }
    />
  );
}

export default LiveReconciliationTab;
