import React, { useState } from 'react';
import { Upload, Check, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface ParsedOwner {
  payee_name: string;
  sort_code: string;
  account_number: string;
  account_type: string;
  payment_reference_prefix: string;
}

interface Props {
  onComplete: () => void;
}

export default function BankDetailsUpload({ onComplete }: Props) {
  const [parsed, setParsed] = useState<ParsedOwner[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) { setError('File appears empty.'); return; }

      const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
      const headers = lines[0].split(',').map(h => normalise(h.replace(/^"|"$/g, '')));

      const col = (keywords: string[]): number => {
        for (const kw of keywords) {
          const i = headers.findIndex(h => h.includes(normalise(kw)));
          if (i >= 0) return i;
        }
        return -1;
      };

      const nameIdx  = col(['payeename', 'name', 'payee']);
      const sortIdx  = col(['sortcode', 'sort']);
      const accIdx   = col(['accountnumber', 'accountno', 'account']);
      const typeIdx  = col(['accounttype', 'bankaccounttype', 'type']);
      const refIdx   = col(['paymentreference', 'reference', 'ref']);

      if (nameIdx < 0 || sortIdx < 0 || accIdx < 0) {
        setError('Could not find required columns. File must have Name, Sort Code, and Account Number columns.');
        return;
      }

      const formatSortCode = (raw: string) => {
        const digits = raw.replace(/\D/g, '');
        if (digits.length === 6) return `${digits.slice(0,2)}-${digits.slice(2,4)}-${digits.slice(4,6)}`;
        return raw.trim();
      };

      const rows: ParsedOwner[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        const name = cols[nameIdx] || '';
        const sort = formatSortCode(cols[sortIdx] || '');
        const acc  = (cols[accIdx] || '').replace(/\D/g, '');
        const type = typeIdx >= 0 ? (cols[typeIdx] || 'Personal') : 'Personal';
        const ref  = refIdx >= 0 ? (cols[refIdx] || '') : '';
        if (!name || !sort || !acc) continue;
        const prefix = ref.replace(/\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec).*/i, '').trim() || 'igloo';
        rows.push({ payee_name: name, sort_code: sort, account_number: acc, account_type: type, payment_reference_prefix: prefix });
      }

      if (!rows.length) {
        setError('No valid rows found. Ensure columns have Name, Sort Code, and Account Number headers.');
        return;
      }
      setParsed(rows);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const { error: delErr } = await supabase.from('owner_bank_details').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (delErr) throw delErr;
      const { error: insErr } = await supabase.from('owner_bank_details').insert(parsed);
      if (insErr) throw insErr;
      onComplete();
    } catch (err: any) {
      setError(err.message || 'Failed to save. Are you logged in as admin?');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-slate-800 mb-1">Import Bank Details</h3>
        <p className="text-xs text-slate-500">Upload your bank payment template CSV. This replaces any previously stored details.</p>
      </div>

      {!parsed.length ? (
        <label className="relative flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-xl p-10 cursor-pointer hover:border-teal-400 transition-colors bg-slate-50">
          <input type="file" accept=".csv" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleFile} />
          <Upload className="w-7 h-7 text-slate-400 mb-2" />
          <span className="text-sm font-medium text-slate-600">Drop CSV file here</span>
          <span className="text-xs text-slate-400 mt-1">Needs columns: Name, Sort Code, Account Number (any order, extra columns fine)</span>
        </label>
      ) : (
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs text-teal-700 bg-teal-50 rounded-lg px-3 py-2">
            <Check className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{parsed.length} owners parsed — review before saving</span>
          </div>
          <div className="border border-slate-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-slate-500 font-semibold">Payee name</th>
                  <th className="px-3 py-2 text-left text-slate-500 font-semibold">Sort code</th>
                  <th className="px-3 py-2 text-left text-slate-500 font-semibold">Account no.</th>
                  <th className="px-3 py-2 text-left text-slate-500 font-semibold">Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {parsed.map((o, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-3 py-2 text-slate-800">{o.payee_name}</td>
                    <td className="px-3 py-2 text-slate-600 font-mono">{o.sort_code}</td>
                    <td className="px-3 py-2 text-slate-600 font-mono">{o.account_number}</td>
                    <td className="px-3 py-2 text-slate-500">{o.account_type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={() => setParsed([])}
              className="text-sm text-slate-500 hover:text-slate-800 px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors"
            >
              Re-upload
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Save {parsed.length} owners
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}
    </div>
  );
}
