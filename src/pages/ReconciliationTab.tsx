import { useState, useRef, useMemo, useCallback, CSSProperties } from 'react';
import { supabase } from '../lib/supabase';
import ReconView from '../components/ReconView';
import {
  BookingRecord, toAvantio, parseAirbnbCsv, parseBcomCsv, parseMonzoCsv, reconcile, parseAny, dmy,
} from '../lib/reconEngine';

// ═══════════════════════════════════════════════════════════════════
// src/pages/ReconciliationTab.tsx — MANUAL reconciliation (file uploads)
// Thin wrapper: parses the three channel CSVs and hands the result to
// the shared engine + ReconView. Matching logic lives in lib/reconEngine.
// ═══════════════════════════════════════════════════════════════════

const C = {
  navy: '#1a4a7a', surface2: '#eef3f9', border: '#d4e2ef',
  muted: '#5a7a9a', dim: '#9ab0c5', navyDeep: '#0d2850',
};
const sBtn: CSSProperties = { padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12, fontFamily: "'Outfit', sans-serif", display: 'inline-flex', alignItems: 'center', gap: 6 };

interface Props { bookings: BookingRecord[]; }

interface FileSlot { key: 'airbnb' | 'bcom' | 'bank'; label: string; }
const SLOTS: FileSlot[] = [
  { key: 'airbnb', label: 'Airbnb' },
  { key: 'bcom', label: 'Booking.com' },
  { key: 'bank', label: 'Monzo' },
];

function ReconciliationTab({ bookings }: Props) {
  const [airbnbText, setAirbnbText] = useState<string | null>(null);
  const [bcomText, setBcomText] = useState<string | null>(null);
  const [bankText, setBankText] = useState<string | null>(null);
  const [fileNames, setFileNames] = useState<Record<string, string>>({});
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [loadingBank, setLoadingBank] = useState(false);
  const [bankErr, setBankErr] = useState<string | null>(null);
  const refs = { airbnb: useRef<HTMLInputElement>(null), bcom: useRef<HTMLInputElement>(null), bank: useRef<HTMLInputElement>(null) };

  const setters: Record<FileSlot['key'], (t: string) => void> = {
    airbnb: setAirbnbText, bcom: setBcomText, bank: setBankText,
  };
  const loadFile = useCallback((key: FileSlot['key'], file: File) => {
    const r = new FileReader();
    r.onload = e => {
      setters[key](e.target?.result as string);
      setFileNames(prev => ({ ...prev, [key]: file.name }));
    };
    r.readAsText(file);
  }, []);

  const loadBankFromLive = useCallback(async () => {
    if (!fromDate || !toDate) { setBankErr('Set both from and to dates'); return; }
    setBankErr(null); setLoadingBank(true);
    try {
      const { data, error } = await supabase.from('recon_bank_transactions').select('*')
        .gte('tx_date', fromDate).lte('tx_date', toDate).order('tx_date', { ascending: false });
      if (error) throw error;
      if (!data?.length) { setBankErr('No transactions in this date range'); setLoadingBank(false); return; }
      // Convert to CSV format for Monzo parser
      const csv = ['Date,Time,Type,Name,Amount,Currency', ...data.map(t => {
        const d = parseAny(t.tx_date);
        const dateStr = d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` : t.tx_date;
        return `${dateStr},00:00:00,Payment,${t.counterparty},${t.amount},GBP`;
      })].join('\n');
      setBankText(csv);
      setFileNames(prev => ({ ...prev, bank: `bank_${fromDate}_to_${toDate}.csv` }));
    } catch (e: any) {
      setBankErr(e?.message || 'Failed to load bank data');
    } finally {
      setLoadingBank(false);
    }
  }, [fromDate, toDate]);

  const avantio = useMemo(() => toAvantio(bookings), [bookings]);

  const parseCounts = useMemo(() => ({
    airbnb: airbnbText ? parseAirbnbCsv(airbnbText).length : null,
    bcom: bcomText ? parseBcomCsv(bcomText).length : null,
    bank: bankText ? parseMonzoCsv(bankText).length : null,
  }), [airbnbText, bcomText, bankText]);

  const engine = useMemo(() => {
    if (!avantio.length) return null;
    const airbnbPayouts = airbnbText ? parseAirbnbCsv(airbnbText) : [];
    const bcomReservations = bcomText ? parseBcomCsv(bcomText) : [];
    const bank = bankText ? parseMonzoCsv(bankText) : [];
    if (!airbnbPayouts.length && !bcomReservations.length) return null;
    return reconcile(avantio, airbnbPayouts, bcomReservations, bank);
  }, [avantio, airbnbText, bcomText, bankText]);

  const chips = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {SLOTS.map(slot => {
        const loaded = !!fileNames[slot.key];
        const count = parseCounts[slot.key];
        const empty = loaded && count === 0;
        return (
          <button key={slot.key}
            style={{
              ...sBtn,
              background: empty ? '#fdefd5' : loaded ? '#d8f0e5' : C.surface2,
              color: empty ? '#7a4e10' : loaded ? '#1a6e42' : C.muted,
              border: `1px solid ${empty ? '#e8c98a' : loaded ? '#a8dcc0' : C.border}`,
            }}
            onClick={() => refs[slot.key].current?.click()}
            title={fileNames[slot.key] || 'Click to upload CSV'}>
            {empty ? '\u26A0' : loaded ? '\u2713' : '\u2191'} {slot.label}{count !== null ? ` (${empty ? 'empty file!' : count})` : ''}
          </button>
        );
      })}
      <div style={{ width: 1, height: 20, background: C.border }} />
      <span style={{ fontSize: 11, color: C.dim, fontWeight: 600, textTransform: 'uppercase' }}>Or load bank from:</span>
      <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={{ padding: '4px 8px', borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 12 }} title="From date" />
      <span style={{ color: C.dim, fontSize: 12 }}>to</span>
      <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={{ padding: '4px 8px', borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 12 }} title="To date" />
      <button style={{ ...sBtn, background: loadingBank ? C.surface2 : '#d8f0e5', color: loadingBank ? C.muted : '#1a6e42', border: `1px solid ${loadingBank ? C.border : '#a8dcc0'}` }} onClick={loadBankFromLive} disabled={loadingBank}>
        {loadingBank ? '⟳' : '⬇'} Load bank
      </button>
      {bankErr && <span style={{ fontSize: 11, color: '#e8513a' }}>{bankErr}</span>}
      <input ref={refs.airbnb} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) loadFile('airbnb', e.target.files[0]); e.target.value = ''; }} />
      <input ref={refs.bcom} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) loadFile('bcom', e.target.files[0]); e.target.value = ''; }} />
      <input ref={refs.bank} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) loadFile('bank', e.target.files[0]); e.target.value = ''; }} />
    </div>
  );

  if (!bookings.length) {
    return (
      <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, padding: '48px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: C.navyDeep, marginBottom: 4 }}>Load the Avantio export first</div>
        <div style={{ color: C.dim, fontSize: 12.5 }}>Export the Avantio booking list covering last month through next month, and load it on the Processor tab.</div>
      </div>
    );
  }

  return (
    <ReconView
      engine={engine}
      toolbar={chips}
      exportPrefix="reconciliation"
      emptyMessage={
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.navyDeep, marginBottom: 4 }}>Add at least one channel file</div>
          <div style={{ color: C.dim, fontSize: 12.5 }}>Upload the Airbnb and/or Booking.com CSV, plus the Monzo statement for bank matching.</div>
        </div>
      }
    />
  );
}

export default ReconciliationTab;
