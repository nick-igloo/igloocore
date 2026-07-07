import { useState, useRef, useMemo, useCallback, CSSProperties } from 'react';
import ReconView from '../components/ReconView';
import {
  BookingRecord, toAvantio, parseAirbnbCsv, parseBcomCsv, parseMonzoCsv, reconcile,
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
    <>
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
      <input ref={refs.airbnb} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) loadFile('airbnb', e.target.files[0]); e.target.value = ''; }} />
      <input ref={refs.bcom} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) loadFile('bcom', e.target.files[0]); e.target.value = ''; }} />
      <input ref={refs.bank} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) loadFile('bank', e.target.files[0]); e.target.value = ''; }} />
    </>
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
