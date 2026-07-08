import Papa from 'papaparse';

// ═══════════════════════════════════════════════════════════════════
// src/lib/reconEngine.ts — reconciliation engine (shared)
// Types, parsers and the matching logic used by BOTH the manual
// (file-upload) and live (Supabase) reconciliation tabs.
// Change matching behaviour HERE and both tabs stay in sync.
// ═══════════════════════════════════════════════════════════════════

// ─── TYPES ───────────────────────────────────────────────────────────────────

export interface BookingRecord { [key: string]: string; }

export interface AvantioBooking {
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

export interface BankTx { date: string; dateObj: Date | null; name: string; amount: number; used: boolean; }

export interface AirbnbItem { type: string; code: string; listing: string; amount: number; passThrough: number; }

export interface AirbnbPayout {
  date: string; arriving: string; amount: number;
  items: AirbnbItem[];
  bankDate: string | null; bankMatched: boolean;
}

export interface BcomReservation {
  ref: string; statementDescriptor: string; property: string;
  checkin: string; checkout: string;
  payoutType: 'Gross' | 'Net';
  gross: number; commission: number; commissionInvoiced: boolean;
  serviceFee: number; payable: number; payoutDate: string;
  bankDate: string | null; bankMatched: boolean;
}

export type Bucket = 'issue' | 'onway' | 'paid' | 'hidden';

export interface ReconRow {
  channel: 'Airbnb' | 'Booking.com';
  monthKey: string;
  sortDate: Date | null;
  bucket: Bucket;
  label: string;                 // Paid / In transit / Due / Upcoming / Overdue / Short-paid / Overpaid / Unknown / Resolution
  payoutDate: string;
  bankDate: string;
  code: string;
  property: string;
  checkin: string;
  checkout: string;
  channelPaid: number | null;
  expected: number | null;
  diff: number | null;
  commissionDue: number;
  note: string;
  payoutKey: string | null;      // groups rows batch-paid in the same payout
  payoutAmount: number | null;   // total of that payout (Airbnb)
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

export function norm(s: string): string { return (s || '').toLowerCase().trim().replace(/\s+/g, ' '); }
export function fmt(v: number): string { return '\u00A3' + v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
export function fmt0(v: number): string { return '\u00A3' + Math.round(v).toLocaleString('en-GB'); }
export function cleanNum(v: string | undefined): number {
  if (!v || !String(v).trim() || String(v).trim() === '-') return 0;
  const n = parseFloat(String(v).replace(/[\u00A3$,\s%]/g, ''));
  return isNaN(n) ? 0 : n;
}
export function r2(n: number): number { return Math.round(n * 100) / 100; }

export function parseDMY(s: string): Date | null {
  if (!s) return null;
  const p = s.trim().split('/');
  return p.length === 3 ? new Date(+p[2], +p[1] - 1, +p[0]) : null;
}
export function parseMDY(s: string): Date | null {
  if (!s) return null;
  const p = s.trim().split('/');
  return p.length === 3 ? new Date(+p[2], +p[0] - 1, +p[1]) : null;
}
export function parseAny(x: string): Date | null {
  if (!x) return null;
  if (x.includes('-')) { const p = x.split('-'); return p.length === 3 ? new Date(+p[0], +p[1] - 1, +p[2]) : null; }
  return parseDMY(x);
}
export function dmy(d: Date | null, fallback = ''): string {
  if (!d) return fallback;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
export function monthKeyOf(d: Date | null): string {
  if (!d) return '';
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
export function addDays(d: Date, n: number): Date { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
export function daysBetween(a: Date, b: Date): number { return Math.round((b.getTime() - a.getTime()) / 86400000); }

export const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return MONTH_NAMES[m - 1] + ' ' + y;
}

export function resolve(b: BookingRecord, col: string): string {
  if (b[col] !== undefined) return b[col];
  const n = norm(col);
  for (const k of Object.keys(b)) { if (norm(k) === n) return b[k]; }
  if (col === 'Portal / Agent' && b['Portal/Agent']) return b['Portal/Agent'];
  if (col === 'Property name' && b['Accommodation name']) return b['Accommodation name'];
  return '';
}

export function escCsv(cell: unknown): string {
  const s = String(cell != null ? cell : '');
  return (s.includes(',') || s.includes('"') || s.includes('\n')) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
export function dlCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

// ─── AVANTIO CONVERSION ──────────────────────────────────────────────────────

export function toAvantio(bookings: BookingRecord[]): AvantioBooking[] {
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

export function parseAirbnbCsv(text: string): AirbnbPayout[] {
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  const payouts: AirbnbPayout[] = [];
  let current: AirbnbPayout | null = null;
  for (const row of parsed.data) {
    const type = (row['Type'] || '').trim();
    if (type === 'Payout') {
      // Only an exact 'Payout' row starts a new payout. 'Resolution Payout'
      // is a line item WITHIN a payout (its 'Paid out' column is empty) —
      // treating it as a header split payouts in two and stranded the items.
      if (current) payouts.push(current);
      current = {
        date: (row['Date'] || '').trim(),
        arriving: (row['Arriving by date'] || '').trim(),
        amount: r2(cleanNum(row['Paid out'])),
        items: [], bankDate: null, bankMatched: false,
      };
    } else if (current && ['Reservation', 'Resolution Payout', 'Resolution Adjustment', 'Pass Through Tot'].includes(type)) {
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

export function parseBcomCsv(text: string): BcomReservation[] {
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

export function parseMonzoCsv(text: string): BankTx[] {
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

export function reconcile(
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
    const pKey = `AB|${p.date}|${p.amount.toFixed(2)}`;
    // A payout Airbnb says it sent, still absent from the bank after 7 days,
    // is a problem — not "in transit". Surface it.
    const staleDays = !p.bankMatched && pd ? daysBetween(pd, today) : 0;
    const stale = staleDays > 7;
    if (p.items.length === 0) {
      // email-notified payout: amount + date known, per-booking detail pending
      rows.push({
        channel: 'Airbnb', monthKey: mk, sortDate: pd,
        bucket: p.bankMatched ? 'paid' : stale ? 'issue' : 'onway',
        label: p.bankMatched ? 'Breakdown pending' : stale ? 'Not in bank' : 'Breakdown pending',
        payoutDate: pdDisplay, bankDate: p.bankDate || '',
        code: '\u2014', property: `Payout ${fmt(p.amount)}`, checkin: '', checkout: '',
        channelPaid: p.amount, expected: null, diff: null, commissionDue: 0,
        note: p.bankMatched
          ? 'Landed in bank \u2014 booking detail arrives with next Airbnb CSV import'
          : stale
            ? `Paid out ${pdDisplay}, not found in bank after ${staleDays} days \u2014 check Monzo feed coverage or chase Airbnb`
            : 'Airbnb notified by email \u2014 not yet in bank',
        payoutKey: pKey, payoutAmount: p.amount,
      });
      continue;
    }
    for (const item of p.items) {
      if (item.type === 'Resolution Adjustment' || item.type === 'Resolution Payout') {
        // Resolutions aren't booking payments — never match them against
        // Avantio expected values. They ride the payout's bank status.
        rows.push({
          channel: 'Airbnb', monthKey: mk, sortDate: pd,
          bucket: p.bankMatched ? 'paid' : stale ? 'issue' : 'onway', label: 'Resolution',
          payoutDate: pdDisplay, bankDate: p.bankDate || '',
          code: item.code, property: item.listing, checkin: '', checkout: '',
          channelPaid: item.amount, expected: null, diff: null, commissionDue: 0,
          note: item.type === 'Resolution Payout' ? 'Resolution payout' : 'Resolution adjustment',
          payoutKey: pKey, payoutAmount: p.amount,
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
          code: item.code, property: item.listing, checkin: '', checkout: '',
          channelPaid, expected: null, diff: null, commissionDue: 0,
          note: 'Not in the Avantio export \u2014 widen the booking list dates (Airbnb pays ~24h after check-in)',
          payoutKey: pKey, payoutAmount: p.amount,
        });
        continue;
      }
      const diff = r2(channelPaid - av.expected);
      let bucket: Bucket; let label: string; let note = '';
      if (!p.bankMatched) {
        if (stale) {
          bucket = 'issue'; label = 'Not in bank';
          note = `Payout ${fmt(p.amount)} sent ${pdDisplay}, not found in bank after ${staleDays} days`;
        } else {
          bucket = 'onway'; label = 'In transit';
          note = p.arriving ? `Arrives ${dmy(parseMDY(p.arriving), p.arriving)}` : 'Not yet in bank';
        }
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
        code: item.code, property: av.property, checkin: av.checkin, checkout: av.checkout,
        channelPaid, expected: av.expected, diff, commissionDue: 0, note,
        payoutKey: pKey, payoutAmount: p.amount,
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
      code: av.code, property: av.property, checkin: av.checkin, checkout: av.checkout,
      channelPaid: null, expected: av.expected, diff: null, commissionDue: 0, note,
      payoutKey: null, payoutAmount: null,
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

  const bcKeyOf = (r: BcomReservation): string =>
    `BC|${(r.statementDescriptor || '').trim() || r.payoutDate}`;
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
        code: r.ref, property: r.property, checkin: r.checkin, checkout: r.checkout,
        channelPaid: r.payable, expected: null, diff: null, commissionDue: 0,
        note: 'Not in the Avantio export \u2014 widen the booking list dates',
        payoutKey: bcKeyOf(r), payoutAmount: null,
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
      code: r.ref, property: av.property, checkin: av.checkin, checkout: av.checkout,
      channelPaid: r.payable, expected: av.expected, diff, commissionDue, note,
      payoutKey: bcKeyOf(r), payoutAmount: null,
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
      code: av.code, property: av.property, checkin: av.checkin, checkout: av.checkout,
      channelPaid: null, expected: av.expected, diff: null, commissionDue: 0, note,
      payoutKey: null, payoutAmount: null,
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


export interface UnmatchedBankTx {
  channel: 'Airbnb' | 'Booking.com';
  date: string;
  monthKey: string;
  amount: number;
}

export interface ReconEngineResult {
  rows: ReconRow[];
  unmatchedBank: UnmatchedBankTx[];
}
