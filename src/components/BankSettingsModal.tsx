import React, { useEffect, useState, useRef } from 'react';
import { X, Plus, Save, Trash2, Check, Loader2, AlertCircle, Upload, Edit2, Building2, Users, FileUp } from 'lucide-react';
import { supabase } from '../lib/supabase';

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

type Tab = 'owners' | 'mappings' | 'import';

interface Props {
  knownProperties: string[];
  onClose: () => void;
  onSaved: () => void;
}

const BLANK_OWNER: Omit<OwnerRecord, 'id'> = {
  payee_name: '',
  sort_code: '',
  account_number: '',
  account_type: 'Personal',
  payment_reference_prefix: 'igloo',
};

function formatSortCode(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 6) return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4, 6)}`;
  return raw;
}

export default function BankSettingsModal({ knownProperties, onClose, onSaved }: Props) {
  const [tab, setTab] = useState<Tab>('owners');
  const [owners, setOwners] = useState<OwnerRecord[]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Omit<OwnerRecord, 'id'>>(BLANK_OWNER);
  const [addForm, setAddForm] = useState<Omit<OwnerRecord, 'id'>>(BLANK_OWNER);
  const [showAdd, setShowAdd] = useState(false);
  const [savingOwner, setSavingOwner] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [savingMappings, setSavingMappings] = useState(false);
  const [mappingsSaved, setMappingsSaved] = useState(false);

  const [importParsed, setImportParsed] = useState<Omit<OwnerRecord, 'id'>[]>([]);
  const [importSaving, setImportSaving] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    const [{ data: ownerRows }, { data: mapRows }] = await Promise.all([
      supabase.from('owner_bank_details').select('*').order('payee_name'),
      supabase.from('property_owner_mapping').select('property_name, owner_id'),
    ]);
    if (ownerRows) setOwners(ownerRows);
    const existing: Record<string, string> = {};
    if (mapRows) for (const m of mapRows) existing[m.property_name] = m.owner_id;
    const initial: Record<string, string> = {};
    for (const p of knownProperties) initial[p] = existing[p] || '';
    setMappings(initial);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  const startEdit = (owner: OwnerRecord) => {
    setEditingId(owner.id);
    setEditForm({
      payee_name: owner.payee_name,
      sort_code: owner.sort_code,
      account_number: owner.account_number,
      account_type: owner.account_type,
      payment_reference_prefix: owner.payment_reference_prefix,
    });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setSavingOwner(true);
    setError(null);
    const { error: err } = await supabase
      .from('owner_bank_details')
      .update({
        ...editForm,
        sort_code: formatSortCode(editForm.sort_code),
        account_number: editForm.account_number.replace(/\D/g, ''),
      })
      .eq('id', editingId);
    if (err) { setError(err.message); } else {
      setEditingId(null);
      await loadData();
      onSaved();
    }
    setSavingOwner(false);
  };

  const deleteOwner = async (id: string) => {
    setDeletingId(id);
    setError(null);
    const { error: err } = await supabase.from('owner_bank_details').delete().eq('id', id);
    if (err) { setError(err.message); } else {
      await loadData();
      onSaved();
    }
    setDeletingId(null);
  };

  const saveAdd = async () => {
    if (!addForm.payee_name || !addForm.sort_code || !addForm.account_number) return;
    setSavingOwner(true);
    setError(null);
    const { error: err } = await supabase.from('owner_bank_details').insert({
      ...addForm,
      sort_code: formatSortCode(addForm.sort_code),
      account_number: addForm.account_number.replace(/\D/g, ''),
    });
    if (err) { setError(err.message); } else {
      setShowAdd(false);
      setAddForm(BLANK_OWNER);
      await loadData();
      onSaved();
    }
    setSavingOwner(false);
  };

  const saveMappings = async () => {
    setSavingMappings(true);
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
      setMappingsSaved(true);
      setTimeout(() => { setMappingsSaved(false); onSaved(); }, 1000);
    } catch (err: any) {
      setError(err.message || 'Failed to save mappings.');
    }
    setSavingMappings(false);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) { setImportError('File appears empty.'); return; }
      const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
      const headers = lines[0].split(',').map(h => normalise(h.replace(/^"|"$/g, '')));
      const col = (keywords: string[]): number => {
        for (const kw of keywords) {
          const i = headers.findIndex(h => h.includes(normalise(kw)));
          if (i >= 0) return i;
        }
        return -1;
      };
      const nameIdx = col(['payeename', 'name', 'payee']);
      const sortIdx = col(['sortcode', 'sort']);
      const accIdx = col(['accountnumber', 'accountno', 'account']);
      const typeIdx = col(['accounttype', 'bankaccounttype', 'type']);
      const refIdx = col(['paymentreference', 'reference', 'ref']);
      if (nameIdx < 0 || sortIdx < 0 || accIdx < 0) {
        setImportError('Could not find required columns. File must have Name, Sort Code, and Account Number columns.');
        return;
      }
      const rows: Omit<OwnerRecord, 'id'>[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        const name = cols[nameIdx] || '';
        const sort = formatSortCode(cols[sortIdx] || '');
        const acc = (cols[accIdx] || '').replace(/\D/g, '');
        const type = typeIdx >= 0 ? (cols[typeIdx] || 'Personal') : 'Personal';
        const ref = refIdx >= 0 ? (cols[refIdx] || '') : '';
        if (!name || !sort || !acc) continue;
        const prefix = ref.replace(/\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec).*/i, '').trim() || 'igloo';
        rows.push({ payee_name: name, sort_code: sort, account_number: acc, account_type: type, payment_reference_prefix: prefix });
      }
      if (!rows.length) { setImportError('No valid rows found.'); return; }
      setImportParsed(rows);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleImportSave = async () => {
    setImportSaving(true);
    setImportError(null);
    try {
      const { error: delErr } = await supabase.from('owner_bank_details').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (delErr) throw delErr;
      const { error: insErr } = await supabase.from('owner_bank_details').insert(importParsed);
      if (insErr) throw insErr;
      setImportParsed([]);
      await loadData();
      onSaved();
      setTab('owners');
    } catch (err: any) {
      setImportError(err.message || 'Failed to save.');
    }
    setImportSaving(false);
  };

  const mappedCount = Object.values(mappings).filter(Boolean).length;

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'owners', label: 'Owners', icon: <Users className="w-3.5 h-3.5" /> },
    { key: 'mappings', label: 'Property Mapping', icon: <Building2 className="w-3.5 h-3.5" /> },
    { key: 'import', label: 'Bulk Import', icon: <FileUp className="w-3.5 h-3.5" /> },
  ];

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <div>
            <h2 className="font-bold text-slate-900 text-base">Bank Settings</h2>
            <p className="text-xs text-slate-500 mt-0.5">Manage owners, bank details and property mappings</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex gap-1 px-6 pt-4 border-b border-slate-100 flex-shrink-0">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-teal-600 text-teal-700 bg-teal-50'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Loading...</span>
            </div>
          ) : (
            <>
              {tab === 'owners' && (
                <div className="p-6 space-y-4">
                  {error && (
                    <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">
                      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      {error}
                    </div>
                  )}

                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2.5 text-left text-slate-500 font-semibold">Payee name</th>
                          <th className="px-3 py-2.5 text-left text-slate-500 font-semibold">Sort code</th>
                          <th className="px-3 py-2.5 text-left text-slate-500 font-semibold">Account no.</th>
                          <th className="px-3 py-2.5 text-left text-slate-500 font-semibold">Type</th>
                          <th className="px-3 py-2.5" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {owners.map(owner => (
                          <tr key={owner.id} className="hover:bg-slate-50">
                            {editingId === owner.id ? (
                              <>
                                <td className="px-2 py-1.5">
                                  <input
                                    value={editForm.payee_name}
                                    onChange={e => setEditForm(f => ({ ...f, payee_name: e.target.value }))}
                                    className="w-full border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                                    placeholder="Payee name"
                                  />
                                </td>
                                <td className="px-2 py-1.5">
                                  <input
                                    value={editForm.sort_code}
                                    onChange={e => setEditForm(f => ({ ...f, sort_code: e.target.value }))}
                                    className="w-24 border border-slate-300 rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
                                    placeholder="00-00-00"
                                  />
                                </td>
                                <td className="px-2 py-1.5">
                                  <input
                                    value={editForm.account_number}
                                    onChange={e => setEditForm(f => ({ ...f, account_number: e.target.value }))}
                                    className="w-24 border border-slate-300 rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
                                    placeholder="12345678"
                                  />
                                </td>
                                <td className="px-2 py-1.5">
                                  <select
                                    value={editForm.account_type}
                                    onChange={e => setEditForm(f => ({ ...f, account_type: e.target.value }))}
                                    className="border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                                  >
                                    <option>Personal</option>
                                    <option>Business</option>
                                  </select>
                                </td>
                                <td className="px-2 py-1.5">
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={saveEdit}
                                      disabled={savingOwner}
                                      className="flex items-center gap-1 text-xs bg-teal-600 text-white px-2.5 py-1 rounded hover:bg-teal-700 transition-colors disabled:opacity-60"
                                    >
                                      {savingOwner ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                      Save
                                    </button>
                                    <button
                                      onClick={() => setEditingId(null)}
                                      className="text-xs text-slate-400 hover:text-slate-700 px-2 py-1 rounded hover:bg-slate-100 transition-colors"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="px-3 py-2.5 text-slate-800 font-medium">{owner.payee_name}</td>
                                <td className="px-3 py-2.5 text-slate-600 font-mono">{owner.sort_code}</td>
                                <td className="px-3 py-2.5 text-slate-600 font-mono">{owner.account_number}</td>
                                <td className="px-3 py-2.5 text-slate-400">{owner.account_type}</td>
                                <td className="px-3 py-2.5">
                                  <div className="flex items-center gap-1 justify-end">
                                    <button
                                      onClick={() => startEdit(owner)}
                                      className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors"
                                    >
                                      <Edit2 className="w-3 h-3" />
                                    </button>
                                    <button
                                      onClick={() => deleteOwner(owner.id)}
                                      disabled={deletingId === owner.id}
                                      className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                                    >
                                      {deletingId === owner.id
                                        ? <Loader2 className="w-3 h-3 animate-spin" />
                                        : <Trash2 className="w-3 h-3" />}
                                    </button>
                                  </div>
                                </td>
                              </>
                            )}
                          </tr>
                        ))}

                        {owners.length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-3 py-8 text-center text-slate-400 text-xs">
                              No owners yet. Add one below or use Bulk Import.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {showAdd ? (
                    <div className="border border-teal-200 bg-teal-50 rounded-xl p-4 space-y-3">
                      <p className="text-xs font-semibold text-teal-800">Add new owner</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-slate-500 block mb-1">Payee name *</label>
                          <input
                            value={addForm.payee_name}
                            onChange={e => setAddForm(f => ({ ...f, payee_name: e.target.value }))}
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                            placeholder="John Smith"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 block mb-1">Account type</label>
                          <select
                            value={addForm.account_type}
                            onChange={e => setAddForm(f => ({ ...f, account_type: e.target.value }))}
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                          >
                            <option>Personal</option>
                            <option>Business</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 block mb-1">Sort code *</label>
                          <input
                            value={addForm.sort_code}
                            onChange={e => setAddForm(f => ({ ...f, sort_code: e.target.value }))}
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
                            placeholder="00-00-00"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 block mb-1">Account number *</label>
                          <input
                            value={addForm.account_number}
                            onChange={e => setAddForm(f => ({ ...f, account_number: e.target.value }))}
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
                            placeholder="12345678"
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={saveAdd}
                          disabled={savingOwner || !addForm.payee_name || !addForm.sort_code || !addForm.account_number}
                          className="flex items-center gap-1.5 bg-teal-600 text-white text-xs font-medium px-4 py-2 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-60"
                        >
                          {savingOwner ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                          Add owner
                        </button>
                        <button
                          onClick={() => { setShowAdd(false); setAddForm(BLANK_OWNER); }}
                          className="text-xs text-slate-500 hover:text-slate-800 px-3 py-2 rounded-lg hover:bg-white transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowAdd(true)}
                      className="flex items-center gap-2 text-sm text-teal-600 hover:text-teal-800 font-medium px-3 py-2 rounded-lg hover:bg-teal-50 transition-colors border border-dashed border-teal-300 w-full justify-center"
                    >
                      <Plus className="w-4 h-4" />
                      Add new owner
                    </button>
                  )}
                </div>
              )}

              {tab === 'mappings' && (
                <div className="p-6 space-y-4">
                  {error && (
                    <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">
                      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      {error}
                    </div>
                  )}
                  <p className="text-xs text-slate-500">Assign each property to its owner. Saved and reused every month.</p>
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2.5 text-left text-slate-500 font-semibold w-1/2">Property</th>
                          <th className="px-3 py-2.5 text-left text-slate-500 font-semibold">Owner</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {knownProperties.map(prop => (
                          <tr key={prop} className={mappings[prop] ? 'hover:bg-slate-50' : 'bg-amber-50 hover:bg-amber-100'}>
                            <td className="px-3 py-2 text-slate-800 font-medium">{prop}</td>
                            <td className="px-3 py-2">
                              <select
                                value={mappings[prop] || ''}
                                onChange={e => setMappings(prev => ({ ...prev, [prop]: e.target.value }))}
                                className="w-full text-xs border border-slate-200 rounded-md px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
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
                  <div className="flex items-center justify-between pt-1">
                    <p className="text-xs text-slate-400">
                      {mappedCount} of {knownProperties.length} mapped
                      {mappedCount < knownProperties.length && <span className="text-amber-600"> — unmapped will be skipped</span>}
                    </p>
                    <button
                      onClick={saveMappings}
                      disabled={savingMappings || !mappedCount}
                      className="flex items-center gap-2 bg-teal-600 text-white text-xs font-medium px-4 py-2 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-60"
                    >
                      {savingMappings ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : mappingsSaved ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                      {mappingsSaved ? 'Saved!' : 'Save mappings'}
                    </button>
                  </div>
                </div>
              )}

              {tab === 'import' && (
                <div className="p-6 space-y-4">
                  <p className="text-xs text-slate-500">Upload a CSV to replace all owner bank details. Columns: Name, Sort Code, Account Number (and optionally Type, Reference).</p>
                  {importError && (
                    <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">
                      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      {importError}
                    </div>
                  )}

                  {!importParsed.length ? (
                    <label className="relative flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-xl p-10 cursor-pointer hover:border-teal-400 transition-colors bg-slate-50">
                      <input type="file" accept=".csv" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleImportFile} />
                      <Upload className="w-7 h-7 text-slate-400 mb-2" />
                      <span className="text-sm font-medium text-slate-600">Drop CSV file here</span>
                      <span className="text-xs text-slate-400 mt-1">This will replace all existing owner records</span>
                    </label>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 text-xs text-teal-700 bg-teal-50 rounded-lg px-3 py-2">
                        <Check className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>{importParsed.length} owners parsed — review before saving</span>
                      </div>
                      <div className="border border-slate-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50 sticky top-0 border-b border-slate-200">
                            <tr>
                              <th className="px-3 py-2 text-left text-slate-500 font-semibold">Payee name</th>
                              <th className="px-3 py-2 text-left text-slate-500 font-semibold">Sort code</th>
                              <th className="px-3 py-2 text-left text-slate-500 font-semibold">Account no.</th>
                              <th className="px-3 py-2 text-left text-slate-500 font-semibold">Type</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {importParsed.map((o, i) => (
                              <tr key={i} className="hover:bg-slate-50">
                                <td className="px-3 py-2 text-slate-800">{o.payee_name}</td>
                                <td className="px-3 py-2 text-slate-600 font-mono">{o.sort_code}</td>
                                <td className="px-3 py-2 text-slate-600 font-mono">{o.account_number}</td>
                                <td className="px-3 py-2 text-slate-400">{o.account_type}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setImportParsed([])}
                          className="text-xs text-slate-500 hover:text-slate-800 px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors"
                        >
                          Re-upload
                        </button>
                        <button
                          onClick={handleImportSave}
                          disabled={importSaving}
                          className="flex items-center gap-2 bg-teal-600 text-white text-xs font-medium px-4 py-2 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-60"
                        >
                          {importSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          Replace with {importParsed.length} owners
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
