import { useState, useRef } from 'react';
import Papa from 'papaparse';
import JSZip from 'jszip';
import {
  ArrowLeft, Upload, Settings, FileSpreadsheet, Download,
  Loader2, CheckCircle2, AlertTriangle, X, ChevronDown, ChevronUp,
  FileText, Banknote, Calendar, Percent
} from 'lucide-react';

interface RateRow {
  property: string;
  rate: number;
}

interface BookingRow {
  [key: string]: string;
}

interface ExpenseItem {
  type: string;
  detail: string;
  amount: number;
}

interface ProcessedProperty {
  property: string;
  owner: string;
  rate: number;
  bookings: ProcessedBooking[];
  totalBase: number;
  totalComm: number;
  totalVat: number;
  totalOwnerNet: number;
  totalExpenses: number;
  finalPayout: number;
  expenseItems: ExpenseItem[];
}

interface ProcessedBooking {
  id: string;
  period: string;
  portal: string;
  baseAmt: number;
  bookingFee: number;
  commissionBase: number;
  commission: number;
  vat: number;
  ownerNet: number;
  checkinDate: string;
}

const DEFAULT_RATES: RateRow[] = [
  { property: 'The Maltings', rate: 15 },
  { property: '10 Bynack House', rate: 15 },
  { property: 'Dalfern Lodge', rate: 12.5 },
  { property: 'The Eagles Nest', rate: 12.5 },
];

const norm = (s: string) => (s || '').toLowerCase().replace(/[´`'''""]/g, "'").replace(/\s+/g, ' ').trim();

const parseMoney = (s: string): number => parseFloat((s || '').replace(/[£$,\s]/g, '')) || 0;

const extractRef = (fullId: string): string => {
  if (!fullId) return '';
  const m = fullId.match(/([A-Z0-9]{6,})/);
  return m ? m[1] : fullId.trim();
};

const isInSettlementMonth = (val: string, year: number, month: number): boolean => {
  if (!val) return false;
  try {
    const parts = val.includes('/') ? val.split('/') : val.split('-');
    if (val.includes('/') && parts.length === 3) {
      return parseInt(parts[1], 10) === month && parseInt(parts[2], 10) === year;
    }
    if (val.includes('-') && parts.length === 3) {
      return parseInt(parts[1], 10) === month && parseInt(parts[0], 10) === year;
    }
    const d = new Date(val);
    return d.getMonth() + 1 === month && d.getFullYear() === year;
  } catch { return false; }
};

const parseCSVFile = (file: File, skipRows = 0): Promise<BookingRow[]> =>
  new Promise((resolve, reject) => {
    Papa.parse<BookingRow>(file, {
      header: true,
      skipEmptyLines: true,
      beforeFirstChunk: skipRows > 0
        ? (chunk) => chunk.split('\n').slice(skipRows).join('\n')
        : undefined,
      complete: (res) => resolve(res.data),
      error: reject,
    });
  });

const formatCurrency = (n: number) =>
  `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const getColumn = (row: BookingRow, candidates: string[]): string => {
  for (const c of candidates) {
    const nc = norm(c);
    const keys = Object.keys(row);
    const exact = keys.find(k => norm(k) === nc);
    if (exact && row[exact]) return row[exact].trim();
    const partial = keys.find(k => {
      const nk = norm(k);
      return (nk.includes(nc) || nc.includes(nk)) && !nk.startsWith('id of') && nk !== 'id';
    });
    if (partial && row[partial]) return row[partial].trim();
  }
  return '';
};

const findBookingFee = (
  extras: BookingRow[],
  ref: string,
  guestFull: string,
  rowProp: string
): number => {
  const matched = extras.filter(e => {
    const extrasRef = getColumn(e, ['booking reference']).trim();
    if (extrasRef && extrasRef === ref) return true;
    const extrasGuest = norm(getColumn(e, ['guest']));
    const extrasProperty = norm(getColumn(e, ['property']));
    if (!extrasGuest || !guestFull) return false;
    return extrasGuest === guestFull &&
      (extrasProperty.includes(rowProp) || rowProp.includes(extrasProperty));
  });
  return matched.reduce((s, e) => s + parseMoney(getColumn(e, ['total amount'])), 0);
};

export default function SettlementGenerator() {
  const [vatRate, setVatRate] = useState(20);
  const [settlementDate, setSettlementDate] = useState('2026-02-26');
  const [settlementMonth, setSettlementMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [rates, setRates] = useState<RateRow[]>(DEFAULT_RATES);
  const [showConfig, setShowConfig] = useState(false);
  const [newProp, setNewProp] = useState('');
  const [newRate, setNewRate] = useState('');

  const [bookingFile, setBookingFile] = useState<File | null>(null);
  const [expenseFile, setExpenseFile] = useState<File | null>(null);
  const [extrasFile, setExtrasFile] = useState<File | null>(null);
  const [airbnbFile, setAirbnbFile] = useState<File | null>(null);
  const [bcomFile, setBcomFile] = useState<File | null>(null);

  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState<ProcessedProperty[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedProp, setExpandedProp] = useState<string | null>(null);

  const bookRef = useRef<HTMLInputElement>(null);
  const expRef = useRef<HTMLInputElement>(null);
  const extrasRef = useRef<HTMLInputElement>(null);
  const airRef = useRef<HTMLInputElement>(null);
  const bcomRef = useRef<HTMLInputElement>(null);

  const allFilesReady = !!(bookingFile && expenseFile && extrasFile && airbnbFile && bcomFile);

  const addRate = () => {
    if (!newProp.trim()) return;
    const r = parseFloat(newRate);
    setRates(prev => [...prev, { property: newProp.trim(), rate: isNaN(r) ? 15 : r }]);
    setNewProp('');
    setNewRate('');
  };

  const removeRate = (i: number) => setRates(prev => prev.filter((_, idx) => idx !== i));

  const updateRate = (i: number, field: 'property' | 'rate', value: string) => {
    setRates(prev => prev.map((r, idx) =>
      idx === i ? { ...r, [field]: field === 'rate' ? parseFloat(value) || r.rate : value } : r
    ));
  };

  const getRateForProp = (prop: string): number => {
    const n = norm(prop);
    const match = rates.find(r => norm(r.property) === n || n.includes(norm(r.property)) || norm(r.property).includes(n));
    return match ? match.rate / 100 : 0.15;
  };

  const getMonthLabel = () => {
    const [y, m] = settlementMonth.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  };

  const processFiles = async () => {
    if (!allFilesReady) return;
    setProcessing(true);
    setError(null);
    setResults(null);

    try {
      const [bookings, expenses, extras, airbnbRows, bcomRows] = await Promise.all([
        parseCSVFile(bookingFile!, 1),
        parseCSVFile(expenseFile!, 1),
        parseCSVFile(extrasFile!, 2),
        parseCSVFile(airbnbFile!, 0),
        parseCSVFile(bcomFile!, 0),
      ]);

      const vatMult = vatRate / 100;
      const [selYear, selMonth] = settlementMonth.split('-').map(Number);

      const checkoutKey = Object.keys(bookings[0] || {}).find(k =>
        norm(k).includes('check-out') || norm(k).includes('checkout')) || '';

      const filtered = bookings.filter(row =>
        isInSettlementMonth(row[checkoutKey], selYear, selMonth)
      );

      if (filtered.length === 0) {
        setError(`No departures found for ${getMonthLabel()}.`);
        setProcessing(false);
        return;
      }

      const byProp: Record<string, BookingRow[]> = {};
      for (const row of filtered) {
        const prop = getColumn(row, ['property name', 'property']);
        if (prop) {
          if (!byProp[prop]) byProp[prop] = [];
          byProp[prop].push(row);
        }
      }

      const processed: ProcessedProperty[] = [];

      for (const [prop, rows] of Object.entries(byProp)) {
        const rate = getRateForProp(prop);

        // Match owner & expenses from owner expenses sheet
        const propExpRows = expenses.filter(e => {
          const assocProp = getColumn(e, ['associated properties', 'property']);
          if (!assocProp) return false;
          return norm(assocProp).includes(norm(prop)) || norm(prop).includes(norm(assocProp));
        });

        const ownerName = propExpRows.length > 0
          ? `${getColumn(propExpRows[0], ["owner's name"])} ${getColumn(propExpRows[0], ['last name'])}`.trim()
          : 'Owner Unset';

        const totalExpenses = propExpRows.reduce(
          (sum, e) => sum + parseMoney(getColumn(e, ['total amount'])), 0
        );

        const expenseItems: ExpenseItem[] = propExpRows.map(e => ({
          type: getColumn(e, ['type']),
          detail: getColumn(e, ['detail']),
          amount: parseMoney(getColumn(e, ['total amount'])),
        }));

        const bookingsList: ProcessedBooking[] = rows.map((row) => {
          const fullId = getColumn(row, ['booking number', 'id']);
          const ref = extractRef(fullId);
          const portal = getColumn(row, ['portal', 'portal / agent']);

          const guestFirst = getColumn(row, ['guest: name']).trim();
          const guestLast = getColumn(row, ['guest: last names']).trim();
          const guestFull = norm(`${guestFirst} ${guestLast}`);
          const rowProp = norm(getColumn(row, ['property name', 'property']));

          const isIgloo = /igloo/i.test(portal);
          const bookingFee = isIgloo ? 0 : findBookingFee(extras, ref, guestFull, rowProp);

          let baseAmt: number;

          if (/airbnb/i.test(portal)) {
            const match = airbnbRows.find(r => getColumn(r, ['booking number']).includes(ref));
            baseAmt = match
              ? parseMoney(getColumn(match, ['expected']))
              : parseMoney(getColumn(row, ['rent with vat', 'rent without vat']));
          } else if (/booking\.com/i.test(portal)) {
            const match = bcomRows.find(r =>
              getColumn(r, ['booking number', 'reservation id']).includes(ref)
            );
            baseAmt = match
              ? parseMoney(getColumn(match, ['expected']))
              : parseMoney(getColumn(row, ['rent with vat', 'rent without vat']));
          } else {
            baseAmt = parseMoney(getColumn(row, ['rent with vat', 'rent without vat']));
          }

          const commissionBase = baseAmt - bookingFee;
          const commission = Math.round(commissionBase * rate * 100) / 100;
          const vatAmt = Math.round(commission * vatMult * 100) / 100;
          const ownerNet = Math.round((commissionBase - commission - vatAmt) * 100) / 100;

          const checkinDate = getColumn(row, ['check-in']);

          return {
            id: ref,
            period: `${checkinDate} → ${row[checkoutKey]}`,
            portal: portal || 'Direct',
            baseAmt,
            bookingFee,
            commissionBase,
            commission,
            vat: vatAmt,
            ownerNet,
            checkinDate,
          };
        }).sort((a, b) => {
          const parseDate = (dateStr: string) => {
            if (!dateStr) return 0;
            const parts = dateStr.split(/[\/\-\.]/);
            if (parts.length !== 3) return 0;
            const [day, month, year] = parts.map(Number);
            if (!day || !month || !year) return 0;
            return new Date(year, month - 1, day).getTime();
          };
          const dateA = parseDate(a.checkinDate);
          const dateB = parseDate(b.checkinDate);
          if (dateA === 0 && dateB === 0) return 0;
          if (dateA === 0) return 1;
          if (dateB === 0) return -1;
          return dateA - dateB;
        });

        const totalBase = Math.round(bookingsList.reduce((s, b) => s + b.commissionBase, 0) * 100) / 100;
        const totalComm = Math.round(bookingsList.reduce((s, b) => s + b.commission, 0) * 100) / 100;
        const totalVat = Math.round(bookingsList.reduce((s, b) => s + b.vat, 0) * 100) / 100;
        const totalOwnerNet = Math.round(bookingsList.reduce((s, b) => s + b.ownerNet, 0) * 100) / 100;

        processed.push({
          property: prop,
          owner: ownerName,
          rate,
          bookings: bookingsList,
          totalBase,
          totalComm,
          totalVat,
          totalOwnerNet,
          totalExpenses,
          finalPayout: Math.round((totalOwnerNet - totalExpenses) * 100) / 100,
          expenseItems,
        });
      }

      setResults(processed);
    } catch (err: any) {
      setError(err?.message || 'Processing Error');
    } finally {
      setProcessing(false);
    }
  };

  const downloadAll = async () => {
    if (!results) return;
    const zip = new JSZip();
    const [dlYear, dlMonth] = settlementMonth.split('-').map(Number);
    const date = new Date(dlYear, dlMonth - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

    for (const p of results) {
      const lines: string[] = [];
      lines.push(`IGLOO PROPERTIES — SETTLEMENT STATEMENT`);
      lines.push(`========================================`);
      lines.push(`Property:   ${p.property}`);
      lines.push(`Owner:      ${p.owner}`);
      lines.push(`Period:     ${date}`);
      lines.push(`Commission: ${(p.rate * 100).toFixed(1)}%`);
      lines.push(`Generated:  ${new Date().toLocaleDateString('en-GB')}`);
      lines.push(``);
      lines.push(`BOOKINGS`);
      lines.push(`--------`);
      lines.push(`Ref,Period,Portal,Base Amount,Booking Fee,Commission Base,Commission,VAT,Owner Net`);
      for (const b of p.bookings) {
        lines.push(`"${b.id}","${b.period}","${b.portal}",${b.baseAmt.toFixed(2)},${b.bookingFee.toFixed(2)},${b.commissionBase.toFixed(2)},${b.commission.toFixed(2)},${b.vat.toFixed(2)},${b.ownerNet.toFixed(2)}`);
      }
      lines.push(``);
      lines.push(`TOTALS`);
      lines.push(`------`);
      lines.push(`Total Commission Base,Total Commission,Total VAT,Total Owner Net`);
      lines.push(`${p.totalBase.toFixed(2)},${p.totalComm.toFixed(2)},${p.totalVat.toFixed(2)},${p.totalOwnerNet.toFixed(2)}`);
      lines.push(``);
      if (p.expenseItems.length > 0) {
        lines.push(`EXPENSES`);
        lines.push(`--------`);
        lines.push(`Type,Detail,Amount`);
        for (const e of p.expenseItems) {
          lines.push(`"${e.type}","${e.detail}",${e.amount.toFixed(2)}`);
        }
        lines.push(`Total Expenses,,${p.totalExpenses.toFixed(2)}`);
        lines.push(``);
      }
      lines.push(`Final Payout,,${p.finalPayout.toFixed(2)}`);

      const safeName = p.property.replace(/[^a-z0-9]/gi, '_');
      zip.file(`${safeName}_Settlement.csv`, lines.join('\n'));
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `igloo_settlements_${settlementMonth}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadSingle = (p: ProcessedProperty) => {
    const [dlYear, dlMonth] = settlementMonth.split('-').map(Number);
    const date = new Date(dlYear, dlMonth - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    const lines: string[] = [];
    lines.push(`IGLOO PROPERTIES — SETTLEMENT STATEMENT`);
    lines.push(`Property:   ${p.property}`);
    lines.push(`Owner:      ${p.owner}`);
    lines.push(`Period:     ${date}`);
    lines.push(`Commission: ${(p.rate * 100).toFixed(1)}%`);
    lines.push(``);
    lines.push(`Ref,Period,Portal,Base Amount,Booking Fee,Commission Base,Commission,VAT,Owner Net`);
    for (const b of p.bookings) {
      lines.push(`"${b.id}","${b.period}","${b.portal}",${b.baseAmt.toFixed(2)},${b.bookingFee.toFixed(2)},${b.commissionBase.toFixed(2)},${b.commission.toFixed(2)},${b.vat.toFixed(2)},${b.ownerNet.toFixed(2)}`);
    }
    lines.push(``);
    lines.push(`TOTALS`);
    lines.push(`Total Commission Base,Total Commission,Total VAT,Total Owner Net`);
    lines.push(`${p.totalBase.toFixed(2)},${p.totalComm.toFixed(2)},${p.totalVat.toFixed(2)},${p.totalOwnerNet.toFixed(2)}`);
    lines.push(``);
    if (p.expenseItems.length > 0) {
      lines.push(`EXPENSES`);
      lines.push(`Type,Detail,Amount`);
      for (const e of p.expenseItems) {
        lines.push(`"${e.type}","${e.detail}",${e.amount.toFixed(2)}`);
      }
      lines.push(`Total Expenses,,${p.totalExpenses.toFixed(2)}`);
      lines.push(``);
    }
    lines.push(`Final Payout,,${p.finalPayout.toFixed(2)}`);

    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${p.property.replace(/[^a-z0-9]/gi, '_')}_Settlement.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const FileSlot = ({
    label, hint, file, onFile, inputRef, accept = '.csv'
  }: {
    label: string; hint: string; file: File | null;
    onFile: (f: File | null) => void; inputRef: React.RefObject<HTMLInputElement>; accept?: string;
  }) => (
    <div
      onClick={() => inputRef.current?.click()}
      className={`relative cursor-pointer rounded-xl border-2 border-dashed p-4 transition-all group
        ${file ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/30'}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={e => { const f = e.target.files?.[0] ?? null; onFile(f); e.target.value = ''; }}
      />
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors
          ${file ? 'bg-emerald-100' : 'bg-slate-100 group-hover:bg-blue-100'}`}>
          {file ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <Upload className="w-5 h-5 text-slate-400 group-hover:text-blue-500" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold truncate ${file ? 'text-emerald-700' : 'text-slate-700'}`}>
            {file ? file.name : label}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">{hint}</p>
        </div>
        {file && (
          <button
            onClick={e => { e.stopPropagation(); onFile(null); }}
            className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-red-100 text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
          <a
            href="/"
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Dashboard
          </a>
          <div className="w-px h-4 bg-slate-200" />
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
              <Banknote className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-slate-800">Settlement Generator</span>
          </div>
          <div className="ml-auto text-xs text-slate-400">{getMonthLabel()}</div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Config Panel */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <button
            onClick={() => setShowConfig(v => !v)}
            className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-2 text-slate-700 font-semibold">
              <Settings className="w-4 h-4 text-slate-500" />
              Configuration
            </div>
            {showConfig ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>

          {showConfig && (
            <div className="px-6 pb-6 border-t border-slate-100 space-y-6">
              <div className="grid grid-cols-3 gap-4 mt-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                    <div className="flex items-center gap-1.5"><Percent className="w-3.5 h-3.5" /> VAT on Commission (%)</div>
                  </label>
                  <input
                    type="number"
                    value={vatRate}
                    onChange={e => setVatRate(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                    <div className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Settlement Month</div>
                  </label>
                  <input
                    type="month"
                    value={settlementMonth}
                    onChange={e => setSettlementMonth(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                    <div className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Statement Date</div>
                  </label>
                  <input
                    type="date"
                    value={settlementDate}
                    onChange={e => setSettlementDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Property Commission Rates</p>
                <div className="space-y-2">
                  {rates.map((r, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={r.property}
                        onChange={e => updateRate(i, 'property', e.target.value)}
                        className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Property name"
                      />
                      <input
                        type="number"
                        value={r.rate}
                        onChange={e => updateRate(i, 'rate', e.target.value)}
                        className="w-20 px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-right"
                      />
                      <span className="text-sm text-slate-400">%</span>
                      <button onClick={() => removeRate(i)} className="text-slate-300 hover:text-red-500 transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="text"
                      value={newProp}
                      onChange={e => setNewProp(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addRate()}
                      className="flex-1 px-3 py-1.5 border border-dashed border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
                      placeholder="Add property..."
                    />
                    <input
                      type="number"
                      value={newRate}
                      onChange={e => setNewRate(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addRate()}
                      className="w-20 px-3 py-1.5 border border-dashed border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 text-right"
                      placeholder="15"
                    />
                    <span className="text-sm text-slate-400">%</span>
                    <button onClick={addRate} className="w-8 h-8 flex items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors text-lg leading-none">+</button>
                  </div>
                </div>
                <p className="text-xs text-slate-400 mt-2">Unmatched properties default to 15% commission</p>
              </div>
            </div>
          )}
        </div>

        {/* File Upload */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <FileSpreadsheet className="w-4 h-4 text-slate-500" />
            <h2 className="font-semibold text-slate-800">Upload Source Files</h2>
          </div>
          <p className="text-sm text-slate-400">All five files are required to generate settlements.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FileSlot
              label="Booking List (22).csv"
              hint="Main export with bookings"
              file={bookingFile}
              onFile={setBookingFile}
              inputRef={bookRef}
            />
            <FileSlot
              label="Owner Expenses.csv"
              hint="Owner names and properties"
              file={expenseFile}
              onFile={setExpenseFile}
              inputRef={expRef}
            />
            <FileSlot
              label="Extras Summary.csv"
              hint="Commission & extras (skip 2 header rows)"
              file={extrasFile}
              onFile={setExtrasFile}
              inputRef={extrasRef}
            />
            <FileSlot
              label="Airbnb Export.csv"
              hint="Airbnb booking export"
              file={airbnbFile}
              onFile={setAirbnbFile}
              inputRef={airRef}
            />
            <FileSlot
              label="Booking.com Export.csv"
              hint="Booking.com channel export"
              file={bcomFile}
              onFile={setBcomFile}
              inputRef={bcomRef}
            />
          </div>

          {!allFilesReady && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
              <p className="text-sm text-amber-700">
                {[bookingFile, expenseFile, extrasFile, airbnbFile, bcomFile].filter(Boolean).length} of 5 files uploaded
              </p>
            </div>
          )}

          {allFilesReady && !results && (
            <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              <p className="text-sm text-emerald-700">All files ready — click Process to generate settlements</p>
            </div>
          )}

          <button
            onClick={processFiles}
            disabled={!allFilesReady || processing}
            className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-semibold text-sm transition-all
              disabled:opacity-40 disabled:cursor-not-allowed
              bg-blue-600 hover:bg-blue-700 text-white shadow-sm hover:shadow-md"
          >
            {processing ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Processing Settlements...</>
            ) : (
              <><FileText className="w-4 h-4" /> Process & Generate Settlements</>
            )}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-800">Processing Error</p>
              <p className="text-sm text-red-600 mt-0.5">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Results */}
        {results && results.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold text-slate-800">{results.length} Settlement{results.length !== 1 ? 's' : ''} Generated</h2>
                <p className="text-sm text-slate-400 mt-0.5">Settlement month departures</p>
              </div>
              <button
                onClick={downloadAll}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-all"
              >
                <Download className="w-4 h-4" />
                Download All (.zip)
              </button>
            </div>

            {/* Summary table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">Property</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">Owner</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600">Bookings</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600">Comm. Base</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600">Commission</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600">VAT</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600">Owner Net</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600">Expenses</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600">Final Payout</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {results.map((p) => (
                      <>
                        <tr
                          key={p.property}
                          className="hover:bg-slate-50 cursor-pointer transition-colors"
                          onClick={() => setExpandedProp(expandedProp === p.property ? null : p.property)}
                        >
                          <td className="px-4 py-3 font-medium text-slate-800">{p.property}</td>
                          <td className="px-4 py-3 text-slate-500">{p.owner}</td>
                          <td className="px-4 py-3 text-right text-slate-600">{p.bookings.length}</td>
                          <td className="px-4 py-3 text-right text-slate-700">{formatCurrency(p.totalBase)}</td>
                          <td className="px-4 py-3 text-right text-slate-700">{formatCurrency(p.totalComm)}</td>
                          <td className="px-4 py-3 text-right text-slate-700">{formatCurrency(p.totalVat)}</td>
                          <td className="px-4 py-3 text-right text-slate-700">{formatCurrency(p.totalOwnerNet)}</td>
                          <td className="px-4 py-3 text-right text-red-600">{p.totalExpenses > 0 ? `-${formatCurrency(p.totalExpenses)}` : '—'}</td>
                          <td className="px-4 py-3 text-right font-semibold text-emerald-700">{formatCurrency(p.finalPayout)}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={e => { e.stopPropagation(); downloadSingle(p); }}
                                className="p-1.5 rounded-lg hover:bg-blue-100 text-slate-400 hover:text-blue-600 transition-colors"
                                title="Download CSV"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>
                              {expandedProp === p.property
                                ? <ChevronUp className="w-4 h-4 text-slate-400" />
                                : <ChevronDown className="w-4 h-4 text-slate-400" />
                              }
                            </div>
                          </td>
                        </tr>
                        {expandedProp === p.property && (
                          <tr key={`${p.property}-exp`}>
                            <td colSpan={10} className="bg-slate-50 px-4 py-4">
                              <div className="space-y-4">
                                {/* Bookings breakdown */}
                                <div className="overflow-x-auto">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="text-slate-500 border-b border-slate-200">
                                        <th className="text-left pb-2 font-semibold">Ref</th>
                                        <th className="text-left pb-2 font-semibold">Period</th>
                                        <th className="text-left pb-2 font-semibold">Portal</th>
                                        <th className="text-right pb-2 font-semibold">Net of Fee</th>
                                        <th className="text-right pb-2 font-semibold">Booking Fee</th>
                                        <th className="text-right pb-2 font-semibold">Comm. Base</th>
                                        <th className="text-right pb-2 font-semibold">Commission</th>
                                        <th className="text-right pb-2 font-semibold">VAT</th>
                                        <th className="text-right pb-2 font-semibold">Owner Net</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {p.bookings.map((b, bi) => (
                                        <tr key={bi} className="text-slate-600">
                                          <td className="py-1.5 pr-3 font-mono">{b.id}</td>
                                          <td className="py-1.5 pr-3">{b.period}</td>
                                          <td className="py-1.5 pr-3">{b.portal}</td>
                                          <td className="py-1.5 pr-3 text-right">{formatCurrency(b.baseAmt)}</td>
                                          <td className="py-1.5 pr-3 text-right text-red-500">{b.bookingFee > 0 ? `-${formatCurrency(b.bookingFee)}` : '—'}</td>
                                          <td className="py-1.5 pr-3 text-right">{formatCurrency(b.commissionBase)}</td>
                                          <td className="py-1.5 pr-3 text-right">{formatCurrency(b.commission)}</td>
                                          <td className="py-1.5 pr-3 text-right">{formatCurrency(b.vat)}</td>
                                          <td className="py-1.5 pr-3 text-right font-semibold text-emerald-700">{formatCurrency(b.ownerNet)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                    <tfoot>
                                      <tr className="border-t-2 border-slate-200 bg-white text-slate-700 font-semibold">
                                        <td colSpan={3} className="pt-2 pr-3">Subtotal</td>
                                        <td className="pt-2 pr-3 text-right">{formatCurrency(p.bookings.reduce((s, b) => s + b.baseAmt, 0))}</td>
                                        <td className="pt-2 pr-3 text-right text-red-500">
                                          {p.bookings.some(b => b.bookingFee > 0)
                                            ? `-${formatCurrency(p.bookings.reduce((s, b) => s + b.bookingFee, 0))}`
                                            : '—'}
                                        </td>
                                        <td className="pt-2 pr-3 text-right">{formatCurrency(p.totalBase)}</td>
                                        <td className="pt-2 pr-3 text-right">{formatCurrency(p.totalComm)}</td>
                                        <td className="pt-2 pr-3 text-right">{formatCurrency(p.totalVat)}</td>
                                        <td className="pt-2 pr-3 text-right text-emerald-700">{formatCurrency(p.totalOwnerNet)}</td>
                                      </tr>
                                    </tfoot>
                                  </table>
                                </div>

                                {/* Expense breakdown */}
                                {p.expenseItems.length > 0 && (
                                  <div>
                                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Expenses</p>
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="text-slate-500 border-b border-slate-200">
                                          <th className="text-left pb-2 font-semibold">Type</th>
                                          <th className="text-left pb-2 font-semibold">Detail</th>
                                          <th className="text-right pb-2 font-semibold">Amount</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                        {p.expenseItems.map((e, ei) => (
                                          <tr key={ei} className="text-slate-600">
                                            <td className="py-1.5 pr-3">{e.type}</td>
                                            <td className="py-1.5 pr-3 text-slate-400">{e.detail}</td>
                                            <td className="py-1.5 text-right text-red-500">-{formatCurrency(e.amount)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                      <tfoot>
                                        <tr className="border-t-2 border-slate-200 font-semibold text-slate-700">
                                          <td colSpan={2} className="pt-2">Total Expenses</td>
                                          <td className="pt-2 text-right text-red-600">-{formatCurrency(p.totalExpenses)}</td>
                                        </tr>
                                      </tfoot>
                                    </table>
                                    <div className="mt-3 flex justify-end">
                                      <div className="flex items-center gap-4 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2">
                                        <span className="text-xs font-semibold text-slate-600">Final Payout</span>
                                        <span className="text-sm font-bold text-emerald-700">{formatCurrency(p.finalPayout)}</span>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 border-t-2 border-slate-200">
                      <td className="px-4 py-3 font-bold text-slate-700" colSpan={3}>Totals</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-800">{formatCurrency(results.reduce((s, p) => s + p.totalBase, 0))}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-800">{formatCurrency(results.reduce((s, p) => s + p.totalComm, 0))}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-800">{formatCurrency(results.reduce((s, p) => s + p.totalVat, 0))}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-800">{formatCurrency(results.reduce((s, p) => s + p.totalOwnerNet, 0))}</td>
                      <td className="px-4 py-3 text-right font-bold text-red-600">{formatCurrency(results.reduce((s, p) => s + p.totalExpenses, 0))}</td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-700">{formatCurrency(results.reduce((s, p) => s + p.finalPayout, 0))}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
