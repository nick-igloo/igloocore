import { useState, useRef, useMemo, useCallback, CSSProperties } from 'react';
import Papa from 'papaparse';

// ═══════════════════════════════════════════════════════════════════
// RECONCILIATION TAB — month-scoped view
// Upload version (no database). Engine: statement-level Booking.com
// matching, date-windowed bank matching, extras-aware comparison,
// coverage-aware statuses. UI: month selector, issues first.
// ═══════════════════════════════════════════════════════════════════

// ─── TYPES ───────────────────────────────────────────────────────────────────

interface BookingRecord { [key: string]: string; }

interface AvantioBooking {
  bookingNumber: string;
  code: string;
  portal: 'airbnb' | 'booking.com' | 'other';
  property: string;
  checkin: string;
  checkout: string;
  checkinDate: Date | null;
  checkoutDate: Date | null;
  paid: number;
  commission: number;
  extras: number;
  expected: number;
}

interface BankTx { date: string; dateObj: Date | null; name: string; amount: number; used: boolean; }

interface AirbnbItem { type: string; code: string; listing: string; amount: number; passThrough: number; }

interface AirbnbPayout {
  date: string; arriving: string; amount: number;
  items: AirbnbItem[];
  bankDate: string | null; bankMatched: boolean;
}

interface BcomReservation {
  ref: string; statementDescriptor: string; property: string;
  checkin: string; checkout: string;
  payoutType: 'Gross' | 'Net';
  gross: number; commission: number; commissionInvoiced: boolean;
  serviceFee: number; payable: number; payoutDate: string;
  bankDate: string | null; bankMatched: boolean;
}

type Bucket = 'issue' | 'onway' | 'paid' | 'hidden';

interface ReconRow {
  channel: 'Airbnb' | 'Booking.com';
  monthKey: string;
  sortDate: Date | null;
  bucket: Bucket;
  label: string;                 // Paid / In transit / Due / Upcoming / Overdue / Short-paid / Overpaid / Unknown / Resolution
  payoutDate: string;
  bankDate: string;
  code: string;
  property: string;
  checkout: string;
  channelPaid: number | null;
  expected: number | null;
  diff: number | null;
  commissionDue: number;
  note: string;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function norm(s: string): string { return (s || '').toLowerCase().trim().replace(/\s+/g, ' '); }
function fmt(v: number): string { return '\u00A3' + v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmt0(v: number): string { return '\u00A3' + Math.round(v).toLocaleString('en-GB'); }
function cleanNum(v: string | undefined): number {
  if (!v || !String(v).trim() || String(v).trim() === '-') return 0;
  const n = parseFloat(String(v).replace(/[\u00A3$,\s%]/g, ''));
  return isNaN(n) ? 0 : n;
}
function r2(n: number): number { return Math.round(n * 100) / 100; }

function parseDMY(s: string): Date | null {
  if (!s) return null;
  const p = s.trim().split('/');
  return p.length === 3 ? new Date(+p[2], +p[1] - 1, +p[0]) : null;
}
function parseMDY(s: string): Date | null {
  if (!s) return null;
  const p = s.trim().split('/');
  return p.length === 3 ? new Date(+p[2], +p[0] - 1, +p[1]) : null;
}
function parseAny(x: string): Date | null {
  if (!x) return null;
  if (x.includes('-')) { const p = x.split('-'); return p.length === 3 ? new Date(+p[0], +p[1] - 1, +p[2]) : null; }
  return parseDMY(x);
}
function dmy(d: Date | null, fallback = ''): string {
  if (!d) return fallback;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
function monthKeyOf(d: Date | null): string {
  if (!d) return '';
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
function addDays(d: Date, n: number): Date { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function daysBetween(a: Date, b: Date): number { return Math.round((b.getTime() - a.getTime()) / 86400000); }

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return MONTH_NAMES[m - 1] + ' ' + y;
}

function resolve(b: BookingRecord, col: string): string {
  if (b[col] !== undefined) return b[col];
  const n = norm(col);
  for (const k of Object.keys(b)) { if (norm(k) === n) return b[k]; }
  if (col === 'Portal / Agent' && b['Portal/Agent']) return b['Portal/Agent'];
  if (col === 'Property name' && b['Accommodation name']) return b['Accommodation name'];
  return '';
}

function escCsv(cell: unknown): string {
  const s = String(cell != null ? cell : '');
  return (s.includes(',') || s.includes('"') || s.includes('\n')) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function dlCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

// ─── AVANTIO CONVERSION ──────────────────────────────────────────────────────

function toAvantio(bookings: BookingRecord[]): AvantioBooking[] {
  return bookings
    .map(b => {
      const bookingNumber = (resolve(b, 'Booking number') || '').trim();
      if (!bookingNumber || bookingNumber === 'TOTALS') return null;
      const portalRaw = norm(resolve(b, 'Portal / Agent'));
      let portal: AvantioBooking['portal'] = 'other';
      if (portalRaw.includes('airbnb')) portal = 'airbnb';
      else if (portalRaw.includes('booking.com')) portal = 'booking.com';
      let code = bookingNumber;
      const hm = bookingNumber.match(/HM[A-Z0-9]+/);
      if (portal === 'airbnb' && hm) code = hm[0];
      else if (portal === 'booking.com') {
        const parts = bookingNumber.split('-');
        if (parts.length >= 2) code = parts[1];
      }
      const paid = cleanNum(resolve(b, 'Paid'));
      const commission = cleanNum(resolve(b, 'Portal/Intermediary Commission: calculated commission'));
      const extras = cleanNum(resolve(b, 'Extras with VAT on top')) || cleanNum(resolve(b, 'Extras without VAT'));
      const checkout = resolve(b, 'Check-out date');
      const checkin = resolve(b, 'Check-in date');
      return {
        bookingNumber, code, portal,
        property: (resolve(b, 'Property name') || '').trim(),
        checkin, checkout,
        checkinDate: parseDMY(checkin),
        checkoutDate: parseDMY(checkout),
        paid: r2(paid), commission: r2(commission), extras: r2(extras),
        expected: r2(paid - commission),
      } as AvantioBooking;
    })
    .filter((b): b is AvantioBooking => b !== null);
}

// ─── CHANNEL FILE PARSERS ────────────────────────────────────────────────────

function parseAirbnbCsv(text: string): AirbnbPayout[] {
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  const payouts: AirbnbPayout[] = [];
  let current: AirbnbPayout | null = null;
  for (const row of parsed.data) {
    const type = (row['Type'] || '').trim();
    if (type === 'Payout' || type === 'Resolution Payout') {
      if (current) payouts.push(current);
      current = {
        date: (row['Date'] || '').trim(),
        arriving: (row['Arriving by date'] || '').trim(),
        amount: r2(cleanNum(row['Paid out'])),
        items: [], bankDate: null, bankMatched: false,
      };
    } else if (current && ['Reservation', 'Resolution Adjustment', 'Pass Through Tot'].includes(type)) {
      current.items.push({
        type,
        code: (row['Confirmation Code'] || '').trim(),
        listing: (row['Listing'] || '').trim(),
        amount: r2(cleanNum(row['Amount'])),
        passThrough: 0,
      });
    }
  }
  if (current) payouts.push(current);
  for (const p of payouts) {
    const pt: Record<string, number> = {};
    for (const item of p.items) {
      if (item.type === 'Pass Through Tot') pt[item.code] = r2((pt[item.code] || 0) + item.amount);
    }
    p.items = p.items.filter(i => i.type !== 'Pass Through Tot');
    for (const item of p.items) {
      if (item.type === 'Reservation' && pt[item.code]) item.passThrough = pt[item.code];
    }
  }
  return payouts;
}

function parseBcomCsv(text: string): BcomReservation[] {
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  const out: BcomReservation[] = [];
  for (const row of parsed.data) {
    if ((row['Type/Transaction type'] || '').trim() !== 'Reservation') continue;
    const commRaw = (row['Commission'] || '').trim();
    const invoiced = /invoiced/i.test(commRaw);
    out.push({
      ref: (row['Reference number'] || '').trim(),
      statementDescriptor: (row['Statement Descriptor'] || '').trim(),
      property: (row['Property name'] || '').trim(),
      checkin: (row['Check-in date'] || '').trim(),
      checkout: (row['Check-out date'] || '').trim(),
      payoutType: ((row['Payout type'] || '').trim() === 'Net' ? 'Net' : 'Gross'),
      gross: r2(cleanNum(row['Gross amount'])),
      commission: invoiced ? 0 : r2(cleanNum(commRaw)),
      commissionInvoiced: invoiced,
      serviceFee: /invoiced/i.test(row['Payments Service Fee'] || '') ? 0 : r2(cleanNum(row['Payments Service Fee'])),
      payable: r2(cleanNum(row['Payable amount'])),
      payoutDate: (row['Payout date'] || '').trim(),
      bankDate: null, bankMatched: false,
    });
  }
  return out;
}

function parseMonzoCsv(text: string): BankTx[] {
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
  let rows = parsed.data as string[][];
  if (!rows.length) return [];
  if (rows[0].some(c => /transaction id|^date$/i.test((c || '').trim()))) rows = rows.slice(1);
  return rows
    .map(r => {
      const date = (r[1] || '').trim();
      const name = (r[4] || '').trim();
      const amount = cleanNum(r[7]);
      if (!date || !name || amount <= 0) return null;
      return { date, dateObj: parseDMY(date), name, amount: r2(amount), used: false } as BankTx;
    })
    .filter((t): t is BankTx => t !== null);
}

// ─── ENGINE ──────────────────────────────────────────────────────────────────

function reconcile(
  avantio: AvantioBooking[],
  airbnbPayouts: AirbnbPayout[],
  bcomReservations: BcomReservation[],
  bank: BankTx[],
): { rows: ReconRow[]; unmatchedBank: { channel: 'Airbnb' | 'Booking.com'; date: string; monthKey: string; amount: number }[] } {
  const rows: ReconRow[] = [];
  const today = new Date();

  const citiTxs = bank.filter(t => /citibank|airbnb/i.test(t.name));
  const bcomTxs = bank.filter(t => /booking\.com/i.test(t.name));

  const txInWindow = (tx: BankTx, payoutDate: Date | null, maxDays: number) =>
    !tx.used && payoutDate !== null && tx.dateObj !== null &&
    tx.dateObj >= payoutDate && daysBetween(payoutDate, tx.dateObj) <= maxDays;

  for (const p of airbnbPayouts) {
    const pd = parseMDY(p.date);
    const tx = citiTxs.find(t => txInWindow(t, pd, 10) && Math.abs(t.amount - p.amount) < 0.005);
    if (tx) { tx.used = true; p.bankMatched = true; p.bankDate = tx.date; }
  }

  const abCoverageStart = airbnbPayouts.length
    ? airbnbPayouts.map(p => parseMDY(p.date)).filter((d): d is Date => d !== null).sort((a, b) => a.getTime() - b.getTime())[0]
    : null;
  const bcCoverageStart = bcomReservations.length
    ? bcomReservations.map(r => parseAny(r.payoutDate)).filter((d): d is Date => d !== null).sort((a, b) => a.getTime() - b.getTime())[0]
    : null;

  const abAvantio = avantio.filter(a => a.portal === 'airbnb');
  const abByCode = new Map(abAvantio.map(a => [a.code, a]));
  const airbnbCodesPaidOut = new Set<string>();

  for (const p of airbnbPayouts) {
    const pd = parseMDY(p.date);
    const mk = monthKeyOf(pd);
    const pdDisplay = dmy(pd, p.date);
    for (const item of p.items) {
      if (item.type === 'Resolution Adjustment') {
        rows.push({
          channel: 'Airbnb', monthKey: mk, sortDate: pd, bucket: 'paid', label: 'Resolution',
          payoutDate: pdDisplay, bankDate: p.bankDate || '',
          code: item.code, property: item.listing, checkout: '',
          channelPaid: item.amount, expected: null, diff: null, commissionDue: 0,
          note: 'Resolution adjustment',
        });
        continue;
      }
      airbnbCodesPaidOut.add(item.code);
      const channelPaid = r2(item.amount + item.passThrough);
      const av = abByCode.get(item.code);
      if (!av) {
        rows.push({
          channel: 'Airbnb', monthKey: mk, sortDate: pd, bucket: 'issue', label: 'Unknown',
          payoutDate: pdDisplay, bankDate: p.bankDate || '',
          code: item.code, property: item.listing, checkout: '',
          channelPaid, expected: null, diff: null, commissionDue: 0,
          note: 'Not in the Avantio export \u2014 widen the booking list dates (Airbnb pays ~24h after check-in)',
        });
        continue;
      }
      const diff = r2(channelPaid - av.expected);
      let bucket: Bucket; let label: string; let note = '';
      if (!p.bankMatched) {
        bucket = 'onway'; label = 'In transit';
        note = p.arriving ? `Arrives ${dmy(parseMDY(p.arriving), p.arriving)}` : 'Not yet in bank';
      } else if (Math.abs(diff) < 0.02) { bucket = 'paid'; label = 'Paid'; }
      else if (av.extras > 0 && Math.abs(diff + av.extras) < 0.02) {
        bucket = 'paid'; label = 'Paid';
        note = `${fmt(av.extras)} extras collected outside Airbnb`;
      } else if (diff < 0) {
        bucket = 'issue'; label = 'Short-paid';
        note = `Short ${fmt(-diff)}${av.extras > 0 ? ` (has ${fmt(av.extras)} extras recorded \u2014 partial mismatch)` : ''}`;
      } else { bucket = 'issue'; label = 'Overpaid'; note = `Over ${fmt(diff)}`; }
      if (item.passThrough) note = (note ? note + ' \u00B7 ' : '') + `incl. pass-through ${fmt(item.passThrough)}`;
      rows.push({
        channel: 'Airbnb', monthKey: mk, sortDate: pd, bucket, label,
        payoutDate: pdDisplay, bankDate: p.bankDate || '',
        code: item.code, property: av.property, checkout: av.checkout,
        channelPaid, expected: av.expected, diff, commissionDue: 0, note,
      });
    }
  }

  for (const av of abAvantio) {
    if (airbnbCodesPaidOut.has(av.code)) continue;
    const trigger = av.checkinDate ? addDays(av.checkinDate, 1) : null;
    const mk = monthKeyOf(trigger);
    let bucket: Bucket; let label: string; let note: string;
    if (trigger && trigger > today) {
      bucket = 'onway'; label = 'Upcoming'; note = 'Pays ~24h after check-in';
    } else if (trigger && abCoverageStart && trigger < abCoverageStart) {
      bucket = 'hidden'; label = 'Outside data'; note = 'Predates uploaded Airbnb data';
    } else if (trigger && daysBetween(trigger, today) > 3) {
      bucket = 'issue'; label = 'Overdue'; note = `Due ${daysBetween(trigger, today)} days ago \u2014 chase with Airbnb`;
    } else {
      bucket = 'onway'; label = 'Due'; note = 'Payment due any day';
    }
    rows.push({
      channel: 'Airbnb', monthKey: mk, sortDate: trigger, bucket, label,
      payoutDate: '', bankDate: '',
      code: av.code, property: av.property, checkout: av.checkout,
      channelPaid: null, expected: av.expected, diff: null, commissionDue: 0, note,
    });
  }

  // Booking.com
  const bcByStmt: Record<string, BcomReservation[]> = {};
  const bcNoStmt: BcomReservation[] = [];
  for (const r of bcomReservations) {
    const key = (r.statementDescriptor || '').trim();
    if (key) { if (!bcByStmt[key]) bcByStmt[key] = []; bcByStmt[key].push(r); }
    else bcNoStmt.push(r);
  }
  for (const resList of Object.values(bcByStmt)) {
    const stmtTotal = r2(resList.reduce((s, r) => s + r.payable, 0));
    const pd = parseAny(resList[0].payoutDate);
    const tx = bcomTxs.find(t => txInWindow(t, pd, 7) && Math.abs(t.amount - stmtTotal) < 0.005);
    if (tx) { tx.used = true; for (const r of resList) { r.bankMatched = true; r.bankDate = tx.date; } }
  }
  if (bcNoStmt.length) {
    const bcByDate: Record<string, BcomReservation[]> = {};
    for (const r of bcNoStmt) {
      if (!bcByDate[r.payoutDate]) bcByDate[r.payoutDate] = [];
      bcByDate[r.payoutDate].push(r);
    }
    for (const resList of Object.values(bcByDate)) {
      const dailyTotal = r2(resList.reduce((s, r) => s + r.payable, 0));
      const pd = parseAny(resList[0].payoutDate);
      const tx = bcomTxs.find(t => txInWindow(t, pd, 7) && Math.abs(t.amount - dailyTotal) < 0.005);
      if (tx) { tx.used = true; for (const r of resList) { r.bankMatched = true; r.bankDate = tx.date; } }
    }
  }

  const bcAvantio = avantio.filter(a => a.portal === 'booking.com');
  const bcByRef = new Map(bcAvantio.map(a => [a.code, a]));
  const bcomRefsPaidOut = new Set<string>();

  for (const r of bcomReservations) {
    bcomRefsPaidOut.add(r.ref);
    const pd = parseAny(r.payoutDate);
    const mk = monthKeyOf(pd);
    const pdDisplay = pd ? `${String(pd.getDate()).padStart(2, '0')}/${String(pd.getMonth() + 1).padStart(2, '0')}/${pd.getFullYear()}` : r.payoutDate;
    const av = bcByRef.get(r.ref);
    if (!av) {
      rows.push({
        channel: 'Booking.com', monthKey: mk, sortDate: pd, bucket: 'issue', label: 'Unknown',
        payoutDate: pdDisplay, bankDate: r.bankDate || '',
        code: r.ref, property: r.property, checkout: r.checkout,
        channelPaid: r.payable, expected: null, diff: null, commissionDue: 0,
        note: 'Not in the Avantio export \u2014 widen the booking list dates',
      });
      continue;
    }
    let diff: number; let note = ''; let commissionDue = 0;
    if (r.payoutType === 'Gross') {
      diff = r2(r.payable - av.paid);
      commissionDue = av.commission;
      note = `gross \u00B7 ${fmt(av.commission)} commission to be invoiced`;
    } else {
      diff = r2(r.payable - av.expected);
    }
    let bucket: Bucket; let label: string;
    const extrasExplained = av.extras > 0 && Math.abs(diff + av.extras) < 0.02;
    if (!r.bankMatched) { bucket = 'onway'; label = 'In transit'; note = ('Not yet in bank' + (note ? ' \u00B7 ' + note : '')); }
    else if (Math.abs(diff) < 0.02) { bucket = 'paid'; label = 'Paid'; }
    else if (extrasExplained) {
      bucket = 'paid'; label = 'Paid';
      note = `${fmt(av.extras)} extras collected outside Booking.com${note ? ' \u00B7 ' + note : ''}`;
    } else if (diff < 0) {
      bucket = 'issue'; label = 'Short-paid';
      note = `Short ${fmt(-diff)}${av.extras > 0 ? ` (has ${fmt(av.extras)} extras recorded \u2014 partial mismatch)` : ''}${note ? ' \u00B7 ' + note : ''}`;
    } else { bucket = 'issue'; label = 'Overpaid'; note = `Over ${fmt(diff)}${note ? ' \u00B7 ' + note : ''}`; }
    rows.push({
      channel: 'Booking.com', monthKey: mk, sortDate: pd, bucket, label,
      payoutDate: pdDisplay, bankDate: r.bankDate || '',
      code: r.ref, property: av.property, checkout: av.checkout,
      channelPaid: r.payable, expected: av.expected, diff, commissionDue, note,
    });
  }

  for (const av of bcAvantio) {
    if (bcomRefsPaidOut.has(av.code)) continue;
    const trigger = av.checkoutDate;
    const mk = monthKeyOf(trigger);
    let bucket: Bucket; let label: string; let note: string;
    if (trigger && trigger > today) {
      bucket = 'onway'; label = 'Upcoming'; note = 'Pays on statement cycle after checkout';
    } else if (trigger && bcCoverageStart && trigger < bcCoverageStart) {
      bucket = 'hidden'; label = 'Outside data'; note = 'Predates uploaded Booking.com data';
    } else if (trigger && daysBetween(trigger, today) > 7) {
      bucket = 'issue'; label = 'Overdue'; note = `Checked out ${daysBetween(trigger, today)} days ago \u2014 chase with Booking.com`;
    } else {
      bucket = 'onway'; label = 'Due'; note = 'Checked out \u2014 pays on next statement';
    }
    rows.push({
      channel: 'Booking.com', monthKey: mk, sortDate: trigger, bucket, label,
      payoutDate: '', bankDate: '',
      code: av.code, property: av.property, checkout: av.checkout,
      channelPaid: null, expected: av.expected, diff: null, commissionDue: 0, note,
    });
  }

  const unmatchedBank = [...citiTxs, ...bcomTxs]
    .filter(t => !t.used)
    .map(t => ({
      channel: (/citibank|airbnb/i.test(t.name) ? 'Airbnb' : 'Booking.com') as 'Airbnb' | 'Booking.com',
      date: t.date, monthKey: monthKeyOf(t.dateObj), amount: t.amount,
    }));

  return { rows, unmatchedBank };
}

// ─── BRAND TOKENS ────────────────────────────────────────────────────────────

const C = {
  navyDeep: '#0d2850', navy: '#1a4a7a', blue: '#3a8fd1', bluePale: '#ddeeff',
  coral: '#e8513a', amber: '#e8a020', green: '#3ab87a',
  bg: '#f0f4f9', surface: '#ffffff', surface2: '#eef3f9',
  border: '#d4e2ef', muted: '#5a7a9a', dim: '#9ab0c5',
};

const LABEL_STYLE: Record<string, { bg: string; fg: string }> = {
  'Paid': { bg: '#d8f0e5', fg: '#1a6e42' },
  'Resolution': { bg: C.surface2, fg: C.muted },
  'In transit': { bg: C.bluePale, fg: C.navy },
  'Due': { bg: C.bluePale, fg: C.navy },
  'Upcoming': { bg: C.surface2, fg: C.muted },
  'Overdue': { bg: '#fde0d8', fg: '#9a2a1a' },
  'Short-paid': { bg: '#fde0d8', fg: '#9a2a1a' },
  'Overpaid': { bg: '#fdefd5', fg: '#7a4e10' },
  'Unknown': { bg: '#fdefd5', fg: '#7a4e10' },
};

// ─── COMPONENT ───────────────────────────────────────────────────────────────

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
  const [selectedMonth, setSelectedMonth] = useState<string>(monthKeyOf(new Date()));
  const [showPaid, setShowPaid] = useState<Record<string, boolean>>({});
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

  const availableMonths = useMemo(() => {
    if (!engine) return [];
    const s = new Set<string>();
    engine.rows.forEach(r => { if (r.monthKey && r.bucket !== 'hidden') s.add(r.monthKey); });
    return [...s].sort().reverse();
  }, [engine]);

  const activeMonth = availableMonths.includes(selectedMonth)
    ? selectedMonth
    : (availableMonths[0] || selectedMonth);

  const channels = useMemo(() => {
    if (!engine) return [];
    return (['Airbnb', 'Booking.com'] as const).map(ch => {
      const chRows = engine.rows.filter(r => r.channel === ch && r.monthKey === activeMonth && r.bucket !== 'hidden');
      const issuePriority = (l: string) => l === 'Short-paid' ? 0 : l === 'Overdue' ? 1 : 2;
      const issues = chRows.filter(r => r.bucket === 'issue')
        .sort((a, b) => issuePriority(a.label) - issuePriority(b.label));
      const onway = chRows.filter(r => r.bucket === 'onway')
        .sort((a, b) => (a.sortDate?.getTime() || 0) - (b.sortDate?.getTime() || 0));
      const paid = chRows.filter(r => r.bucket === 'paid')
        .sort((a, b) => (b.sortDate?.getTime() || 0) - (a.sortDate?.getTime() || 0));
      const bankIssues = engine.unmatchedBank.filter(t => t.channel === ch && t.monthKey === activeMonth);
      const sumPaid = r2(paid.reduce((s, r) => s + (r.channelPaid || 0), 0));
      return {
        channel: ch, issues, onway, paid, bankIssues,
        received: sumPaid,
        onwayTotal: r2(onway.reduce((s, r) => s + (r.channelPaid ?? r.expected ?? 0), 0)),
        shortTotal: r2(issues.filter(r => r.label === 'Short-paid').reduce((s, r) => s + (r.diff || 0), 0)),
        commissionDue: r2(chRows.reduce((s, r) => s + r.commissionDue, 0)),
      };
    });
  }, [engine, activeMonth]);

  const exportCsv = () => {
    if (!engine) return;
    const monthRows = engine.rows.filter(r => r.monthKey === activeMonth && r.bucket !== 'hidden');
    const h = ['Channel', 'Status', 'Payout date', 'Bank date', 'Code', 'Property', 'Check-out', 'Channel paid', 'Avantio expected', 'Diff', 'Note'];
    const rows = monthRows.map(r => [
      r.channel, r.label, r.payoutDate, r.bankDate, r.code, r.property, r.checkout,
      r.channelPaid != null ? r.channelPaid.toFixed(2) : '',
      r.expected != null ? r.expected.toFixed(2) : '',
      r.diff != null ? r.diff.toFixed(2) : '',
      r.note,
    ]);
    dlCsv([h.map(escCsv).join(','), ...rows.map(rr => rr.map(escCsv).join(','))].join('\n'),
      `reconciliation_${activeMonth}.csv`);
  };

  // ── STYLES ──
  const sCard: CSSProperties = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: '0 1px 4px rgba(26,74,122,0.07), 0 4px 16px rgba(26,74,122,0.06)', overflow: 'hidden' };
  const sBadge = (bg: string, fg: string): CSSProperties => ({ display: 'inline-block', padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, background: bg, color: fg, letterSpacing: '0.3px', whiteSpace: 'nowrap' });
  const sBtn: CSSProperties = { padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12, fontFamily: "'Outfit', sans-serif", display: 'inline-flex', alignItems: 'center', gap: 6 };
  const sPill = (active: boolean): CSSProperties => ({
    padding: '6px 14px', borderRadius: 20, border: `1px solid ${active ? C.navy : C.border}`,
    background: active ? C.navy : C.surface, color: active ? '#fff' : C.muted,
    cursor: 'pointer', fontWeight: 600, fontSize: 12, fontFamily: "'Outfit', sans-serif",
  });

  const rowLine = (r: ReconRow, i: number) => {
    const st = LABEL_STYLE[r.label] || LABEL_STYLE['Paid'];
    const amount = r.label === 'Short-paid' && r.diff != null ? r.diff
      : (r.channelPaid ?? r.expected ?? null);
    return (
      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 20px', borderBottom: `1px solid ${C.surface2}`, fontSize: 13 }}>
        <span style={{ ...sBadge(st.bg, st.fg), width: 76, textAlign: 'center' }}>{r.label}</span>
        <span style={{ fontWeight: 600, color: C.navyDeep, width: 190, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.property}>{r.property}</span>
        <span style={{ fontFamily: 'monospace', fontSize: 11, color: C.dim, width: 110 }}>{r.code}</span>
        <span style={{ color: C.muted, fontSize: 12, width: 78 }}>{r.checkout || r.payoutDate}</span>
        <span style={{ color: C.dim, fontSize: 11.5, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.note}>{r.note}</span>
        <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: r.label === 'Short-paid' ? C.coral : C.navyDeep, minWidth: 84, textAlign: 'right' }}>
          {amount != null ? fmt(amount) : ''}
        </span>
      </div>
    );
  };

  if (!bookings.length) {
    return (
      <div style={{ ...sCard, padding: '48px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: C.navyDeep, marginBottom: 4 }}>Load the Avantio export first</div>
        <div style={{ color: C.dim, fontSize: 12.5 }}>Export the Avantio booking list covering last month through next month, and load it on the Processor tab.</div>
      </div>
    );
  }

  return (
    <div>
      {/* ── TOP BAR: sources + months + export ── */}
      <div style={{ ...sCard, padding: '12px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {SLOTS.map(slot => {
          const loaded = !!fileNames[slot.key];
          const count = parseCounts[slot.key];
          const empty = loaded && count === 0;
          return (
            <button key={slot.key}
              style={{
                ...sBtn, padding: '6px 12px',
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

        {engine && <div style={{ width: 1, height: 22, background: C.border, margin: '0 6px' }} />}
        {availableMonths.map(m => (
          <button key={m} style={sPill(m === activeMonth)} onClick={() => setSelectedMonth(m)}>{monthLabel(m)}</button>
        ))}
        {engine && (
          <button style={{ ...sBtn, marginLeft: 'auto', background: C.navy, color: '#fff' }} onClick={exportCsv}>&#8595; Export</button>
        )}
      </div>

      {!engine && (
        <div style={{ ...sCard, padding: '40px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.navyDeep, marginBottom: 4 }}>Add at least one channel file</div>
          <div style={{ color: C.dim, fontSize: 12.5 }}>Upload the Airbnb and/or Booking.com CSV, plus the Monzo statement for bank matching.</div>
        </div>
      )}

      {engine && channels.map(ch => {
        const showingPaid = !!showPaid[ch.channel + activeMonth];
        const issueCount = ch.issues.length + ch.bankIssues.length;
        return (
          <div key={ch.channel} style={{ ...sCard, marginBottom: 20 }}>
            {/* Channel header with month totals */}
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, background: ch.channel === 'Airbnb' ? '#fdf6f4' : '#f4f9fd', display: 'flex', alignItems: 'baseline', gap: 20, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: C.navyDeep, letterSpacing: '-0.3px', minWidth: 120 }}>{ch.channel}</span>
              <span style={{ fontSize: 13, color: C.muted }}>
                Received <b style={{ color: '#1a6e42', fontSize: 15 }}>{fmt0(ch.received)}</b>
                <span style={{ color: C.dim }}> ({ch.paid.length})</span>
              </span>
              <span style={{ fontSize: 13, color: C.muted }}>
                On its way <b style={{ color: C.navy, fontSize: 15 }}>{fmt0(ch.onwayTotal)}</b>
                <span style={{ color: C.dim }}> ({ch.onway.length})</span>
              </span>
              {issueCount > 0
                ? <span style={{ fontSize: 13, color: C.muted }}>
                    Issues <b style={{ color: C.coral, fontSize: 15 }}>{issueCount}</b>
                    {ch.shortTotal < 0 && <span style={{ color: C.coral }}> ({fmt(ch.shortTotal)})</span>}
                  </span>
                : <span style={{ fontSize: 13, color: '#1a6e42', fontWeight: 600 }}>&#10003; No issues</span>}
              {ch.commissionDue > 0 && (
                <span style={{ fontSize: 12, color: '#7a4e10', marginLeft: 'auto' }}>
                  Commission to be invoiced: <b>{fmt(ch.commissionDue)}</b>
                </span>
              )}
            </div>

            {/* Issues (always visible) */}
            {ch.issues.map((r, i) => rowLine(r, i))}
            {ch.bankIssues.map((t, i) => (
              <div key={'b' + i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 20px', borderBottom: `1px solid ${C.surface2}`, fontSize: 13 }}>
                <span style={{ ...sBadge('#fdefd5', '#7a4e10'), width: 76, textAlign: 'center' }}>Bank?</span>
                <span style={{ fontWeight: 600, color: C.navyDeep, width: 190 }}>Unmatched payment</span>
                <span style={{ width: 110 }} />
                <span style={{ color: C.muted, fontSize: 12, width: 78 }}>{t.date}</span>
                <span style={{ color: C.dim, fontSize: 11.5, flex: 1 }}>In bank, no matching payout in uploaded data (often prior-period)</span>
                <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', minWidth: 84, textAlign: 'right' }}>{fmt(t.amount)}</span>
              </div>
            ))}

            {/* On its way */}
            {ch.onway.map((r, i) => rowLine(r, 1000 + i))}

            {/* Paid — collapsed */}
            {ch.paid.length > 0 && (
              <div>
                <button
                  style={{ width: '100%', padding: '10px 20px', border: 'none', background: C.surface2, color: C.muted, fontSize: 12, fontWeight: 600, fontFamily: "'Outfit', sans-serif", cursor: 'pointer', textAlign: 'left' }}
                  onClick={() => setShowPaid(p => ({ ...p, [ch.channel + activeMonth]: !showingPaid }))}>
                  {showingPaid ? '\u25BE Hide' : '\u25B8 Show'} {ch.paid.length} paid bookings ({fmt0(ch.received)})
                </button>
                {showingPaid && ch.paid.map((r, i) => rowLine(r, 2000 + i))}
              </div>
            )}

            {ch.issues.length === 0 && ch.bankIssues.length === 0 && ch.onway.length === 0 && ch.paid.length === 0 && (
              <div style={{ padding: '24px 20px', textAlign: 'center', color: C.dim, fontSize: 12.5 }}>No activity for {monthLabel(activeMonth)}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default ReconciliationTab;