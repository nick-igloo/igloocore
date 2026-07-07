import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Loader2, Wallet, Camera, Trash2, Download, Plus, X, Check,
  PoundSterling, Calendar, Building2, FileText, Image as ImageIcon, Tag, Percent,
  Sparkles, CheckCircle2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { User } from '@supabase/supabase-js';

interface PropertyOption {
  id: string;
  name: string;
}

type ExpenseCategory = 'purchase_for_property' | 'service_for_property' | 'purchase_for_igloo';

interface ExpenseRow {
  id: string;
  user_id: string;
  property_id: string | null;
  property_name: string;
  amount: number;
  description: string;
  expense_date: string;
  receipt_path: string | null;
  has_vat: boolean;
  vat_amount: number | null;
  zero_rated_amount: number | null;
  standard_rated_amount: number | null;
  category: ExpenseCategory;
  created_at: string;
}

const RECEIPT_BUCKET = 'expense-receipts';

const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  purchase_for_property: 'Purchase for property',
  service_for_property: 'Service for property',
  purchase_for_igloo: 'Purchase for Igloo',
};

function csvCategory(row: Pick<ExpenseRow, 'category' | 'has_vat'>): string {
  return `${CATEGORY_LABEL[row.category]} - ${row.has_vat ? 'with VAT' : 'no VAT'}`;
}

export default function DirectorExpenses() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const [monthFilter, setMonthFilter] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    void loadAll();
  }, [user?.id]);

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [propsRes, expRes] = await Promise.all([
        supabase.from('properties').select('id, name').eq('active', true).order('name'),
        supabase
          .from('director_expenses')
          .select('*')
          .order('expense_date', { ascending: false })
          .order('created_at', { ascending: false }),
      ]);
      if (propsRes.error) throw propsRes.error;
      if (expRes.error) throw expRes.error;
      setProperties(propsRes.data || []);
      setExpenses(expRes.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  const filteredExpenses = useMemo(() => {
    if (!monthFilter) return expenses;
    return expenses.filter((e) => e.created_at.slice(0, 7).startsWith(monthFilter));
  }, [expenses, monthFilter]);

  const monthTotal = useMemo(
    () => filteredExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0),
    [filteredExpenses],
  );

  const deleteExpense = async (row: ExpenseRow) => {
    if (!confirm('Delete this expense?')) return;
    try {
      if (row.receipt_path) {
        await supabase.storage.from(RECEIPT_BUCKET).remove([row.receipt_path]);
      }
      const { error } = await supabase.from('director_expenses').delete().eq('id', row.id);
      if (error) throw error;
      setExpenses((list) => list.filter((e) => e.id !== row.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const openReceipt = async (path: string) => {
    const { data, error } = await supabase.storage
      .from(RECEIPT_BUCKET)
      .createSignedUrl(path, 300);
    if (error || !data) {
      setError(error?.message || 'Could not load receipt');
      return;
    }
    window.open(data.signedUrl, '_blank');
  };

  const exportCsv = () => {
    if (filteredExpenses.length === 0) {
      setError('Nothing to export for this month');
      return;
    }
    const header = [
      'Date',
      'Property',
      'Category',
      'Description',
      'Net (GBP)',
      'VAT Rate',
      'VAT (GBP)',
      'Gross (GBP)',
      'Receipt',
    ];
    const rows: string[][] = [];
    filteredExpenses.forEach((e) => {
      const zeroAmt = Number(e.zero_rated_amount || 0);
      const stdNet = Number(e.standard_rated_amount || 0);
      const vatAmt = Number(e.vat_amount || 0);
      const desc = e.description.replace(/"/g, '""');
      const receiptFlag = e.receipt_path ? 'Yes' : 'No';

      if (zeroAmt > 0 || stdNet > 0) {
        if (zeroAmt > 0) {
          rows.push([
            e.expense_date,
            e.property_name || '',
            csvCategory(e),
            desc,
            zeroAmt.toFixed(2),
            '0%',
            '0.00',
            zeroAmt.toFixed(2),
            receiptFlag,
          ]);
        }
        if (stdNet > 0) {
          const vat = vatAmt > 0 ? vatAmt : +(stdNet * 0.2).toFixed(2);
          rows.push([
            e.expense_date,
            e.property_name || '',
            csvCategory(e),
            desc,
            stdNet.toFixed(2),
            '20%',
            vat.toFixed(2),
            (stdNet + vat).toFixed(2),
            receiptFlag,
          ]);
        }
      } else {
        rows.push([
          e.expense_date,
          e.property_name || '',
          csvCategory(e),
          desc,
          Number(e.amount).toFixed(2),
          vatAmt > 0 ? '20%' : '0%',
          vatAmt.toFixed(2),
          Number(e.amount).toFixed(2),
          receiptFlag,
        ]);
      }
    });
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c)}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expenses_${monthFilter || 'all'}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <a
            href="/"
            className="p-2 -ml-2 rounded-lg hover:bg-slate-100 text-slate-600"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </a>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-emerald-600" />
              <h1 className="text-lg font-bold text-slate-900 truncate">Director Expenses</h1>
            </div>
            <p className="text-xs text-slate-500 truncate">Log spend and export monthly CSV</p>
          </div>
          <button
            onClick={exportCsv}
            className="hidden sm:inline-flex items-center gap-2 px-3 py-2 text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" /> CSV
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-4 space-y-4">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg text-sm flex items-start justify-between gap-2">
            <span>{error}</span>
            <button onClick={() => setError(null)}>
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-[160px]">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                Month logged
              </label>
              <input
                type="month"
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Total</p>
              <p className="text-2xl font-bold text-slate-900">£{monthTotal.toFixed(2)}</p>
              <p className="text-xs text-slate-500">{filteredExpenses.length} item{filteredExpenses.length === 1 ? '' : 's'}</p>
            </div>
          </div>
          <button
            onClick={exportCsv}
            className="mt-3 sm:hidden w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" /> Export CSV for {monthFilter}
          </button>
        </div>

        {filteredExpenses.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 py-12 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-slate-100 rounded-full mb-3">
              <Wallet className="w-7 h-7 text-slate-400" />
            </div>
            <h2 className="text-base font-semibold text-slate-800">No expenses logged</h2>
            <p className="text-sm text-slate-500 mt-1">Tap the + button to add one.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {filteredExpenses.map((e) => (
              <li
                key={e.id}
                className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-start gap-3"
              >
                <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center flex-shrink-0">
                  <PoundSterling className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 truncate">{e.description || '—'}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {e.property_name || 'Company'} · {new Date(e.expense_date).toLocaleDateString()}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700">
                          <Tag className="w-3 h-3" /> {CATEGORY_LABEL[e.category]}
                        </span>
                        {!e.has_vat && !e.zero_rated_amount && !e.standard_rated_amount && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">
                            <Percent className="w-3 h-3" /> No VAT
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-base font-bold text-slate-900 whitespace-nowrap">
                        £{Number(e.amount).toFixed(2)}
                      </p>
                      {(() => {
                        const zeroAmt = Number(e.zero_rated_amount || 0);
                        const stdNet = Number(e.standard_rated_amount || 0);
                        const vatAmt = Number(e.vat_amount || 0);
                        if (zeroAmt > 0 || stdNet > 0) {
                          return (
                            <div className="mt-0.5 space-y-0">
                              {zeroAmt > 0 && (
                                <p className="text-[11px] text-slate-500 whitespace-nowrap">
                                  0%: £{zeroAmt.toFixed(2)}
                                </p>
                              )}
                              {stdNet > 0 && (
                                <p className="text-[11px] text-slate-500 whitespace-nowrap">
                                  20%: £{stdNet.toFixed(2)} + £{vatAmt > 0 ? vatAmt.toFixed(2) : (stdNet * 0.2).toFixed(2)} VAT
                                </p>
                              )}
                            </div>
                          );
                        }
                        if (vatAmt > 0) {
                          return (
                            <p className="text-[11px] text-slate-500 whitespace-nowrap mt-0.5">
                              VAT £{vatAmt.toFixed(2)}
                            </p>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    {e.receipt_path ? (
                      <button
                        onClick={() => openReceipt(e.receipt_path!)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-800"
                      >
                        <ImageIcon className="w-3.5 h-3.5" /> View receipt
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">No receipt</span>
                    )}
                    <button
                      onClick={() => deleteExpense(e)}
                      className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>

      <button
        onClick={() => setShowModal(true)}
        className="fixed bottom-6 right-6 z-30 w-14 h-14 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg flex items-center justify-center transition-colors"
        aria-label="Log new expense"
      >
        <Plus className="w-7 h-7" />
      </button>

      {showModal && user && (
        <ExpenseModal
          user={user}
          properties={properties}
          onClose={() => setShowModal(false)}
          onSaved={(row) => {
            setExpenses((list) => [row, ...list]);
            const savedMonth = row.created_at?.slice(0, 7);
            if (savedMonth && savedMonth !== monthFilter) {
              setMonthFilter(savedMonth);
            }
            setShowModal(false);
          }}
        />
      )}
    </div>
  );
}

function ExpenseModal({
  user,
  properties,
  onClose,
  onSaved,
}: {
  user: User;
  properties: PropertyOption[];
  onClose: () => void;
  onSaved: (row: ExpenseRow) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [propertyId, setPropertyId] = useState<string>('');
  const [expenseDate, setExpenseDate] = useState(today);
  const [receipt, setReceipt] = useState<{ name: string; type: string; blob: Blob } | null>(null);
  const [category, setCategory] = useState<ExpenseCategory>('purchase_for_property');
  const [vatAmount, setVatAmount] = useState('');
  const [zeroRated, setZeroRated] = useState('');
  const [standardRated, setStandardRated] = useState('');
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const amtNumber = Number(amount);
  const stdNumber = standardRated ? Number(standardRated) : 0;
  const derivedVat = stdNumber > 0 ? +(stdNumber * 0.2).toFixed(2) : 0;
  const hasVat = stdNumber > 0 || (vatAmount ? Number(vatAmount) > 0 : false);

  const scanReceipt = async (file: File) => {
    setScanning(true);
    setErr(null);
    setScanResult(null);
    try {
      const formData = new FormData();
      formData.append('receipt', file);
      formData.append('property_names', JSON.stringify(properties.map((p) => p.name)));
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-receipt`;
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: formData,
      });
      const result = await res.json();
      if (!res.ok) {
        setErr(result.error || 'Failed to scan receipt');
        return;
      }
      const filled: string[] = [];
      if (result.amount != null) {
        const parsed = parseFloat(String(result.amount).replace(/[^0-9.\-]/g, ''));
        if (isFinite(parsed) && parsed > 0) {
          setAmount(String(parsed));
          filled.push(`£${parsed.toFixed(2)}`);
        }
      }
      if (result.description) {
        setDescription(result.description);
        filled.push(result.description);
      }
      if (result.date) {
        const dateStr = String(result.date).trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr) && !isNaN(Date.parse(dateStr))) {
          const diffMs = Math.abs(Date.now() - new Date(dateStr).getTime());
          const diffDays = diffMs / (1000 * 60 * 60 * 24);
          if (diffDays <= 90) {
            setExpenseDate(dateStr);
          }
        }
      }
      if (result.vat_amount != null) {
        const parsedVat = parseFloat(String(result.vat_amount));
        if (isFinite(parsedVat) && parsedVat > 0) {
          setVatAmount(String(parsedVat));
          filled.push(`VAT £${parsedVat.toFixed(2)}`);
        }
      }
      if (result.zero_rated_amount != null) {
        const parsed = parseFloat(String(result.zero_rated_amount));
        if (isFinite(parsed) && parsed >= 0) {
          setZeroRated(String(parsed));
          filled.push(`0% £${parsed.toFixed(2)}`);
        }
      }
      if (result.standard_rated_amount != null) {
        const parsed = parseFloat(String(result.standard_rated_amount));
        if (isFinite(parsed) && parsed >= 0) {
          setStandardRated(String(parsed));
          filled.push(`20% net £${parsed.toFixed(2)}`);
        }
      }
      if (result.property_name) {
        const matched = properties.find(
          (p) => p.name.toLowerCase() === result.property_name.toLowerCase()
        );
        if (matched) setPropertyId(matched.id);
      }
      if (result.category) {
        const cat = String(result.category);
        if (cat === 'purchase_for_property' || cat === 'service_for_property' || cat === 'purchase_for_igloo') {
          setCategory(cat);
        }
      }
      setScanResult(filled.length > 0 ? `Extracted: ${filled.join(' · ')}` : 'Could not read receipt details — fill in manually');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Scan failed');
    } finally {
      setScanning(false);
    }
  };

  const handleReceiptChange = async (file: File | null) => {
    if (!file) {
      setReceipt(null);
      return;
    }
    const blob = new Blob([await file.arrayBuffer()], { type: file.type });
    setReceipt({ name: file.name, type: file.type, blob });
    void scanReceipt(file);
  };

  const handleSubmit = async (e: React.FormEvent | React.MouseEvent) => {
    e.preventDefault();
    setErr(null);
    const amt = parseFloat(String(amount).replace(/[^0-9.\-]/g, ''));
    if (!isFinite(amt) || amt <= 0) {
      setErr('Enter a valid amount');
      return;
    }
    if (!description.trim()) {
      setErr('Describe what the expense is for');
      return;
    }
    // Validate date format
    const dateToSave = /^\d{4}-\d{2}-\d{2}$/.test(expenseDate) ? expenseDate : today;
    setSaving(true);
    try {
      let receiptPath: string | null = null;
      if (receipt) {
        const ext = receipt.name.split('.').pop()?.toLowerCase() || 'jpg';
        const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const contentType = receipt.type || (ext === 'pdf' ? 'application/pdf' : 'image/jpeg');
        const { error: upErr } = await supabase.storage
          .from(RECEIPT_BUCKET)
          .upload(path, receipt.blob, { contentType });
        if (upErr) throw upErr;
        receiptPath = path;
      }

      const selectedProp = properties.find((p) => p.id === propertyId);
      const parsedVat = vatAmount ? parseFloat(vatAmount) : null;
      const parsedZero = zeroRated ? parseFloat(zeroRated) : null;
      const parsedStd = standardRated ? parseFloat(standardRated) : null;
      const payload = {
        user_id: user.id,
        property_id: propertyId || null,
        property_name: selectedProp?.name || '',
        amount: amt,
        description: description.trim(),
        expense_date: dateToSave,
        receipt_path: receiptPath,
        category,
        has_vat: hasVat,
        vat_amount: hasVat ? (parsedVat != null && isFinite(parsedVat) && parsedVat > 0 ? parsedVat : derivedVat > 0 ? derivedVat : null) : null,
        zero_rated_amount: parsedZero != null && isFinite(parsedZero) && parsedZero >= 0 ? parsedZero : null,
        standard_rated_amount: parsedStd != null && isFinite(parsedStd) && parsedStd >= 0 ? parsedStd : null,
      };
      const { data, error } = await supabase
        .from('director_expenses')
        .insert(payload)
        .select('*')
        .single();
      if (error) throw error;
      onSaved(data as ExpenseRow);
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-xl max-h-[92vh] overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Wallet className="w-5 h-5 text-emerald-600" /> New Expense
          </h3>
          <button
            onClick={onClose}
            disabled={saving}
            className="text-slate-400 hover:text-slate-600 p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5 mb-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Receipt (photo or PDF) — auto-reads details
            </label>
            {receipt ? (
              <div className="space-y-2">
                <div className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg bg-slate-50">
                  <ImageIcon className="w-5 h-5 text-slate-500" />
                  <span className="text-sm text-slate-700 truncate flex-1">{receipt.name}</span>
                  <button
                    type="button"
                    onClick={() => { setReceipt(null); }}
                    className="text-red-600 hover:text-red-700 p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {scanning && (
                  <div className="flex items-center gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                    <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
                    <span className="text-xs font-medium text-amber-800">Reading receipt with AI...</span>
                  </div>
                )}
                {!scanning && scanResult && (
                  <div className="flex items-center gap-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span className="text-xs font-medium text-emerald-800">{scanResult}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex gap-2">
                <label className="flex-1 flex items-center justify-center gap-2 py-4 border-2 border-dashed border-amber-300 rounded-lg text-slate-700 bg-amber-50/50 hover:bg-amber-50 cursor-pointer transition-colors">
                  <Camera className="w-5 h-5 text-amber-600" />
                  <span className="text-sm font-medium">Snap photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => handleReceiptChange(e.target.files?.[0] ?? null)}
                  />
                </label>
                <label className="flex-1 flex items-center justify-center gap-2 py-4 border-2 border-dashed border-amber-300 rounded-lg text-slate-700 bg-amber-50/50 hover:bg-amber-50 cursor-pointer transition-colors">
                  <FileText className="w-5 h-5 text-amber-600" />
                  <span className="text-sm font-medium">Upload PDF</span>
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    className="hidden"
                    onChange={(e) => handleReceiptChange(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
            )}
          </div>

          <Field label="Amount (gross)" icon={PoundSterling}>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-3 text-lg border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              autoFocus
            />
          </Field>

          <Field label="VAT split" icon={Percent}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">
                  Zero-rated (0%)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">£</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={zeroRated}
                    onChange={(e) => setZeroRated(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-7 pr-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">
                  Standard-rated net (20%)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">£</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={standardRated}
                    onChange={(e) => setStandardRated(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-7 pr-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>
            {derivedVat > 0 && (
              <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                <span className="font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                  VAT: £{derivedVat.toFixed(2)}
                </span>
                {vatAmount && Number(vatAmount) > 0 && Math.abs(Number(vatAmount) - derivedVat) > 0.01 && (
                  <span className="text-red-500">
                    Receipt says £{Number(vatAmount).toFixed(2)} — check split
                  </span>
                )}
              </div>
            )}
            {!hasVat && amtNumber > 0 && (
              <p className="mt-2 text-[11px] text-slate-400">
                Leave both blank if the receipt has no VAT breakdown.
              </p>
            )}
          </Field>

          <Field label="Category" icon={Tag}>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
              className="w-full px-3 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
            >
              <option value="purchase_for_property">{CATEGORY_LABEL.purchase_for_property}</option>
              <option value="service_for_property">{CATEGORY_LABEL.service_for_property}</option>
              <option value="purchase_for_igloo">{CATEGORY_LABEL.purchase_for_igloo}</option>
            </select>
          </Field>

          <Field label="What for" icon={FileText}>
            <input
              type="text"
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="eg. keys cut, bulbs, hardware"
              className="w-full px-3 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </Field>

          <Field label="Property" icon={Building2}>
            <select
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className="w-full px-3 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
            >
              <option value="">Company / not property-specific</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Date" icon={Calendar}>
            <input
              type="date"
              required
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              className="w-full px-3 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </Field>

          {err && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg text-sm">
              {err}
            </div>
          )}
        </form>
        <div className="px-5 py-4 border-t border-slate-200 flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || scanning}
            className="flex-1 px-4 py-3 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg flex items-center justify-center gap-2 transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {saving ? 'Saving...' : scanning ? 'Scanning...' : 'Save expense'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
        <Icon className="w-3.5 h-3.5" /> {label}
      </label>
      {children}
    </div>
  );
}
