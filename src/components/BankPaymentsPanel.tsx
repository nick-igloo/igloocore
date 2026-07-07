import React, { useEffect, useState } from 'react';
import { Download, Loader2, Settings, AlertCircle, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import BankDetailsUpload from './BankDetailsUpload';
import PropertyOwnerMapper from './PropertyOwnerMapper';
import BankSettingsModal from './BankSettingsModal';
import { getPropertyNames } from '../lib/properties';

interface SettlementRow {
  property: string;
  total: string;
}

interface OwnerRecord {
  id: string;
  payee_name: string;
  sort_code: string;
  account_number: string;
  account_type: string;
  payment_reference_prefix: string;
}

interface MappingRecord {
  property_name: string;
  owner_id: string;
}

interface PaymentRow {
  property: string;
  payee_name: string;
  sort_code: string;
  account_number: string;
  account_type: string;
  amount: string;
  matched: boolean;
}

const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

type SetupStep = 'loading' | 'upload-bank' | 'map-properties' | 'ready';

interface Props {
  settlements: SettlementRow[];
}

export default function BankPaymentsPanel({ settlements }: Props) {
  const [step, setStep] = useState<SetupStep>('loading');
  const [owners, setOwners] = useState<OwnerRecord[]>([]);
  const [mappings, setMappings] = useState<MappingRecord[]>([]);
  const [knownProperties, setKnownProperties] = useState<string[]>([]);
  const [paymentRef, setPaymentRef] = useState(() => {
    const d = new Date();
    return `igloo ${MONTHS[d.getMonth()]}`;
  });
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setStep('loading');
    setError(null);
    try {
      const [{ data: ownerRows, error: owErr }, { data: mapRows, error: mapErr }, propNames] = await Promise.all([
        supabase.from('owner_bank_details').select('*'),
        supabase.from('property_owner_mapping').select('property_name, owner_id'),
        getPropertyNames().catch(() => [] as string[]),
      ]);

      if (owErr) throw owErr;
      if (mapErr) throw mapErr;

      setKnownProperties(propNames);

      if (!ownerRows?.length) { setStep('upload-bank'); return; }
      if (!mapRows?.length) { setOwners(ownerRows); setStep('map-properties'); return; }

      setOwners(ownerRows);
      setMappings(mapRows);
      setStep('ready');
    } catch (err: any) {
      setError(err.message || 'Failed to load. Are you logged in as admin?');
      setStep('ready');
    }
  };

  useEffect(() => { loadData(); }, []);

  const buildPayments = (): PaymentRow[] => {
    const ownerMap = new Map(owners.map(o => [o.id, o]));
    const propMap = new Map(mappings.map(m => [m.property_name, m.owner_id]));

    return settlements
      .filter(s => parseFloat(s.total.replace(/,/g, '')) > 0)
      .map(s => {
        const ownerId = propMap.get(s.property);
        const owner = ownerId ? ownerMap.get(ownerId) : undefined;
        return {
          property: s.property,
          payee_name: owner?.payee_name || '',
          sort_code: owner?.sort_code || '',
          account_number: owner?.account_number || '',
          account_type: owner?.account_type || '',
          amount: s.total.replace(/,/g, ''),
          matched: !!owner,
        };
      });
  };

  const handleDownload = () => {
    const rows = buildPayments();
    const header = 'Payment reference,Payee name,Sort code,Bank account number,Bank account type,Amount\n';
    const body = rows.map(r =>
      r.matched
        ? `${paymentRef},${r.payee_name},${r.sort_code},${r.account_number},${r.account_type},${r.amount}`
        : `# UNMATCHED: ${r.property},,,,,${r.amount}`
    ).join('\n');
    const blob = new Blob([header + body], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bank_payments_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (step === 'loading') {
    return (
      <div className="flex items-center gap-2 py-6 text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Loading bank details...</span>
      </div>
    );
  }

  if (step === 'upload-bank') {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-6 mt-4">
        <BankDetailsUpload onComplete={loadData} />
      </div>
    );
  }

  if (step === 'map-properties') {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-6 mt-4">
        <PropertyOwnerMapper knownProperties={knownProperties} onComplete={loadData} />
      </div>
    );
  }

  const payments = buildPayments();
  const matched = payments.filter(p => p.matched);
  const unmatched = payments.filter(p => !p.matched);
  const totalAmount = matched.reduce((s, p) => s + parseFloat(p.amount || '0'), 0);

  return (
    <>
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden mt-4">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-800">Bank Payments</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {matched.length} payment{matched.length !== 1 ? 's' : ''} matched
              {unmatched.length > 0 && <span className="text-amber-600"> — {unmatched.length} unmatched</span>}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={loadData}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              title="Bank settings"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <label className="text-xs font-medium text-slate-600 whitespace-nowrap">Payment reference</label>
          <input
            type="text"
            value={paymentRef}
            onChange={e => setPaymentRef(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 w-40 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            placeholder="igloo jan"
          />
          <button
            onClick={handleDownload}
            disabled={!matched.length}
            className="ml-auto flex items-center gap-2 bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Download payments CSV
          </button>
        </div>

        {unmatched.length > 0 && (
          <div className="px-6 py-3 bg-amber-50 border-b border-amber-100 flex items-start gap-2 text-xs text-amber-800">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              <strong>Unmatched properties</strong> (open settings to fix):&nbsp;
              {[...new Set(unmatched.map(p => p.property))].join(', ')}
            </span>
          </div>
        )}

        {error && (
          <div className="px-6 py-3 bg-red-50 border-b border-red-100 flex items-start gap-2 text-xs text-red-700">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b-2 border-slate-100">
                <th className="px-6 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Property</th>
                <th className="px-6 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Payee</th>
                <th className="px-6 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Sort code</th>
                <th className="px-6 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Account</th>
                <th className="px-6 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {payments.map((p, i) => (
                <tr key={i} className={p.matched ? 'hover:bg-slate-50' : 'bg-amber-50'}>
                  <td className="px-6 py-3 font-medium text-slate-900 text-sm">{p.property}</td>
                  <td className="px-6 py-3 text-slate-700">
                    {p.matched ? p.payee_name : <span className="text-amber-600 text-xs font-medium">No owner mapped</span>}
                  </td>
                  <td className="px-6 py-3 font-mono text-slate-500 text-xs">{p.sort_code || '—'}</td>
                  <td className="px-6 py-3 font-mono text-slate-500 text-xs">{p.account_number || '—'}</td>
                  <td className="px-6 py-3 text-right font-bold text-slate-900">£{parseFloat(p.amount || '0').toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 border-t-2 border-slate-200">
                <td colSpan={4} className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Total ({matched.length} payments)</td>
                <td className="px-6 py-4 text-right font-bold text-teal-700 text-base">£{totalAmount.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {showSettings && (
        <BankSettingsModal
          knownProperties={knownProperties}
          onClose={() => setShowSettings(false)}
          onSaved={() => { loadData(); }}
        />
      )}
    </>
  );
}
