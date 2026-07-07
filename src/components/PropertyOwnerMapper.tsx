import React, { useEffect, useState } from 'react';
import { Loader2, Save, AlertCircle, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Owner {
  id: string;
  payee_name: string;
}

interface Props {
  knownProperties: string[];
  onComplete: () => void;
}

export default function PropertyOwnerMapper({ knownProperties, onComplete }: Props) {
  const [owners, setOwners] = useState<Owner[]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [{ data: ownerRows }, { data: mapRows }] = await Promise.all([
        supabase.from('owner_bank_details').select('id, payee_name').order('payee_name'),
        supabase.from('property_owner_mapping').select('property_name, owner_id'),
      ]);

      if (ownerRows) setOwners(ownerRows);

      const existing: Record<string, string> = {};
      if (mapRows) {
        for (const m of mapRows) existing[m.property_name] = m.owner_id;
      }
      const initial: Record<string, string> = {};
      for (const p of knownProperties) {
        initial[p] = existing[p] || '';
      }
      setMappings(initial);
      setLoading(false);
    };
    load();
  }, [knownProperties]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const toUpsert = Object.entries(mappings)
        .filter(([, ownerId]) => ownerId)
        .map(([property_name, owner_id]) => ({ property_name, owner_id }));

      const { error: delErr } = await supabase
        .from('property_owner_mapping')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      if (delErr) throw delErr;

      if (toUpsert.length) {
        const { error: insErr } = await supabase.from('property_owner_mapping').insert(toUpsert);
        if (insErr) throw insErr;
      }

      setSaved(true);
      setTimeout(() => { setSaved(false); onComplete(); }, 800);
    } catch (err: any) {
      setError(err.message || 'Failed to save mappings.');
    } finally {
      setSaving(false);
    }
  };

  const mappedCount = Object.values(mappings).filter(Boolean).length;

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Loading...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-800 mb-1">Property → Owner Mapping</h3>
        <p className="text-xs text-slate-500">Assign each property to its owner. This is saved and reused every month.</p>
      </div>

      <div className="border border-slate-200 rounded-xl overflow-hidden max-h-96 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left text-slate-500 font-semibold w-1/2">Property</th>
              <th className="px-3 py-2 text-left text-slate-500 font-semibold">Owner</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {knownProperties.map(prop => (
              <tr key={prop} className={mappings[prop] ? '' : 'bg-amber-50'}>
                <td className="px-3 py-2 text-slate-800 font-medium">{prop}</td>
                <td className="px-3 py-2">
                  <select
                    value={mappings[prop] || ''}
                    onChange={e => setMappings(prev => ({ ...prev, [prop]: e.target.value }))}
                    className="w-full text-xs border border-slate-200 rounded-md px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  >
                    <option value="">— not mapped —</option>
                    {owners.map(o => (
                      <option key={o.id} value={o.id}>{o.payee_name}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">
          {mappedCount} of {knownProperties.length} properties mapped
          {mappedCount < knownProperties.length && <span className="text-amber-600"> — unmapped properties will be skipped</span>}
        </p>
        <button
          onClick={handleSave}
          disabled={saving || !mappedCount}
          className="flex items-center gap-2 bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-60"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saved ? 'Saved!' : 'Save mappings'}
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}
    </div>
  );
}
