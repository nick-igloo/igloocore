import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Users, Link2, Upload, Plus, Trash2, CreditCard as Edit2, Check, X, Loader2, AlertCircle, Save, ArrowRight, CheckCircle2, FileUp, Info, ChevronRight, Wand2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { invalidatePropertiesCache } from '../lib/properties';

interface Property {
  id: string;
  name: string;
  notes: string;
  active: boolean;
}

interface Owner {
  id: string;
  payee_name: string;
  sort_code: string;
  account_number: string;
  account_type: string;
  payment_reference_prefix: string;
}

interface Mapping {
  id: string;
  property_name: string;
  property_id: string | null;
  owner_id: string;
}

type Tab = 'properties' | 'owners' | 'mappings';

function formatSortCode(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 6) return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4, 6)}`;
  return raw;
}

const BLANK_PROPERTY = { name: '', notes: '' };
const BLANK_OWNER = { payee_name: '', sort_code: '', account_number: '', account_type: 'Personal', payment_reference_prefix: 'igloo' };

export default function OnboardingPage() {
  const [tab, setTab] = useState<Tab>('properties');

  const [properties, setProperties] = useState<Property[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [propForm, setPropForm] = useState(BLANK_PROPERTY);
  const [showPropAdd, setShowPropAdd] = useState(false);
  const [editingPropId, setEditingPropId] = useState<string | null>(null);
  const [editPropForm, setEditPropForm] = useState(BLANK_PROPERTY);
  const [savingProp, setSavingProp] = useState(false);
  const [deletingPropId, setDeletingPropId] = useState<string | null>(null);

  const [ownerForm, setOwnerForm] = useState(BLANK_OWNER);
  const [showOwnerAdd, setShowOwnerAdd] = useState(false);
  const [editingOwnerId, setEditingOwnerId] = useState<string | null>(null);
  const [editOwnerForm, setEditOwnerForm] = useState(BLANK_OWNER);
  const [savingOwner, setSavingOwner] = useState(false);
  const [deletingOwnerId, setDeletingOwnerId] = useState<string | null>(null);

  const [mappingDraft, setMappingDraft] = useState<Record<string, string>>({});
  const [savingMappings, setSavingMappings] = useState(false);
  const [mappingsSaved, setMappingsSaved] = useState(false);

  const [importOwnersParsed, setImportOwnersParsed] = useState<Omit<Owner, 'id'>[]>([]);
  const [importOwnersSaving, setImportOwnersSaving] = useState(false);
  const [importOwnersError, setImportOwnersError] = useState<string | null>(null);

  const [importPropsParsed, setImportPropsParsed] = useState<string[]>([]);
  const [importPropsSaving, setImportPropsSaving] = useState(false);
  const [importPropsError, setImportPropsError] = useState<string | null>(null);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ data: propRows, error: pErr }, { data: ownerRows, error: oErr }, { data: mapRows, error: mErr }] = await Promise.all([
        supabase.from('properties').select('*').order('name'),
        supabase.from('owner_bank_details').select('*').order('payee_name'),
        supabase.from('property_owner_mapping').select('id, property_name, property_id, owner_id'),
      ]);

      if (pErr) throw pErr;
      if (oErr) throw oErr;
      if (mErr) throw mErr;

      setProperties(propRows || []);
      setOwners(ownerRows || []);
      setMappings(mapRows || []);

      const draft: Record<string, string> = {};
      for (const m of (mapRows || [])) {
        draft[m.property_id || m.property_name] = m.owner_id;
      }
      setMappingDraft(draft);

      invalidatePropertiesCache();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const addProperty = async () => {
    if (!propForm.name.trim()) return;
    setSavingProp(true);
    setError(null);
    try {
      const { error: err } = await supabase.from('properties').insert({ name: propForm.name.trim(), notes: propForm.notes.trim() });
      if (err) throw err;
      setPropForm(BLANK_PROPERTY);
      setShowPropAdd(false);
      await loadAll();
    } catch (err: any) {
      setError(err.message?.includes('unique') ? 'A property with that name already exists.' : err.message);
    } finally {
      setSavingProp(false);
    }
  };

  const saveEditProperty = async () => {
    if (!editingPropId || !editPropForm.name.trim()) return;
    setSavingProp(true);
    setError(null);
    try {
      const { error: err } = await supabase.from('properties').update({ name: editPropForm.name.trim(), notes: editPropForm.notes.trim(), updated_at: new Date().toISOString() }).eq('id', editingPropId);
      if (err) throw err;
      setEditingPropId(null);
      await loadAll();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingProp(false);
    }
  };

  const togglePropertyActive = async (prop: Property) => {
    const { error: err } = await supabase.from('properties').update({ active: !prop.active, updated_at: new Date().toISOString() }).eq('id', prop.id);
    if (err) { setError(err.message); return; }
    await loadAll();
  };

  const deleteProperty = async (id: string) => {
    if (!confirm('Remove this property? This will not delete any reports or files.')) return;
    setDeletingPropId(id);
    const { error: err } = await supabase.from('properties').delete().eq('id', id);
    if (err) setError(err.message);
    else await loadAll();
    setDeletingPropId(null);
  };

  const addOwner = async () => {
    if (!ownerForm.payee_name || !ownerForm.sort_code || !ownerForm.account_number) return;
    setSavingOwner(true);
    setError(null);
    try {
      const { error: err } = await supabase.from('owner_bank_details').insert({
        ...ownerForm,
        sort_code: formatSortCode(ownerForm.sort_code),
        account_number: ownerForm.account_number.replace(/\D/g, ''),
      });
      if (err) throw err;
      setOwnerForm(BLANK_OWNER);
      setShowOwnerAdd(false);
      await loadAll();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingOwner(false);
    }
  };

  const saveEditOwner = async () => {
    if (!editingOwnerId) return;
    setSavingOwner(true);
    setError(null);
    try {
      const { error: err } = await supabase.from('owner_bank_details').update({
        ...editOwnerForm,
        sort_code: formatSortCode(editOwnerForm.sort_code),
        account_number: editOwnerForm.account_number.replace(/\D/g, ''),
      }).eq('id', editingOwnerId);
      if (err) throw err;
      setEditingOwnerId(null);
      await loadAll();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingOwner(false);
    }
  };

  const deleteOwner = async (id: string) => {
    if (!confirm('Remove this owner? Their property mappings will also be removed.')) return;
    setDeletingOwnerId(id);
    const { error: err } = await supabase.from('owner_bank_details').delete().eq('id', id);
    if (err) setError(err.message);
    else await loadAll();
    setDeletingOwnerId(null);
  };

  const saveMappings = async () => {
    setSavingMappings(true);
    setError(null);
    try {
      const toUpsert = properties
        .filter(p => mappingDraft[p.id])
        .map(p => ({ property_id: p.id, property_name: p.name, owner_id: mappingDraft[p.id] }));

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
      setTimeout(() => setMappingsSaved(false), 2000);
      await loadAll();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingMappings(false);
    }
  };

  const handleImportOwners = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportOwnersError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) { setImportOwnersError('File appears empty.'); return; }
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
      const headers = lines[0].split(',').map(h => norm(h.replace(/^"|"$/g, '')));
      const col = (kws: string[]) => { for (const kw of kws) { const i = headers.findIndex(h => h.includes(norm(kw))); if (i >= 0) return i; } return -1; };
      const nameIdx = col(['payeename', 'name', 'payee']);
      const sortIdx = col(['sortcode', 'sort']);
      const accIdx = col(['accountnumber', 'accountno', 'account']);
      const typeIdx = col(['accounttype', 'bankaccounttype', 'type']);
      const refIdx = col(['paymentreference', 'reference', 'ref']);
      if (nameIdx < 0 || sortIdx < 0 || accIdx < 0) { setImportOwnersError('Need Name, Sort Code and Account Number columns.'); return; }
      const rows: Omit<Owner, 'id'>[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        const name = cols[nameIdx] || '';
        const sort = formatSortCode(cols[sortIdx] || '');
        const acc = (cols[accIdx] || '').replace(/\D/g, '');
        if (!name || !sort || !acc) continue;
        const type = typeIdx >= 0 ? (cols[typeIdx] || 'Personal') : 'Personal';
        const ref = refIdx >= 0 ? (cols[refIdx] || '') : '';
        const prefix = ref.replace(/\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec).*/i, '').trim() || 'igloo';
        rows.push({ payee_name: name, sort_code: sort, account_number: acc, account_type: type, payment_reference_prefix: prefix });
      }
      if (!rows.length) { setImportOwnersError('No valid rows found.'); return; }
      setImportOwnersParsed(rows);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const saveImportOwners = async (replace: boolean) => {
    setImportOwnersSaving(true);
    setImportOwnersError(null);
    try {
      if (replace) {
        const { error: delErr } = await supabase.from('owner_bank_details').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (delErr) throw delErr;
      }
      const { error: insErr } = await supabase.from('owner_bank_details').insert(importOwnersParsed);
      if (insErr) throw insErr;
      setImportOwnersParsed([]);
      await loadAll();
    } catch (err: any) {
      setImportOwnersError(err.message);
    } finally {
      setImportOwnersSaving(false);
    }
  };

  const handleImportProperties = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportPropsError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 1) { setImportPropsError('File appears empty.'); return; }
      const names = lines.filter(l => l && !l.toLowerCase().startsWith('name') && !l.toLowerCase().startsWith('property'));
      if (!names.length) { setImportPropsError('No property names found.'); return; }
      setImportPropsParsed(names);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const saveImportProperties = async () => {
    setImportPropsSaving(true);
    setImportPropsError(null);
    try {
      const rows = importPropsParsed.map(name => ({ name: name.replace(/^"|"$/g, '').trim() })).filter(r => r.name);
      const { error: err } = await supabase.from('properties').insert(rows);
      if (err) throw err;
      setImportPropsParsed([]);
      await loadAll();
    } catch (err: any) {
      setImportPropsError(err.message?.includes('unique') ? 'Some properties already exist. Add them individually to avoid duplicates.' : err.message);
    } finally {
      setImportPropsSaving(false);
    }
  };

  const mappedCount = properties.filter(p => mappingDraft[p.id]).length;
  const unmappedCount = properties.filter(p => p.active && !mappingDraft[p.id]).length;

  const TABS: { key: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { key: 'properties', label: 'Properties', icon: <Building2 className="w-4 h-4" />, badge: properties.length },
    { key: 'owners', label: 'Owners & Bank Details', icon: <Users className="w-4 h-4" />, badge: owners.length },
    { key: 'mappings', label: 'Property → Owner', icon: <Link2 className="w-4 h-4" />, badge: unmappedCount > 0 ? unmappedCount : undefined },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Setup & Onboarding</h2>
          <p className="text-sm text-slate-500 mt-1">Manage your properties, owner bank details, and payment mappings — the single source of truth for the whole system.</p>
        </div>
        <Link
          to="/onboard-property"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-colors whitespace-nowrap"
        >
          <Wand2 className="w-4 h-4" />
          Onboard New Property
        </Link>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-red-700 text-sm">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="flex gap-2 border-b border-slate-200">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors relative -mb-px ${
              tab === t.key
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
            }`}
          >
            {t.icon}
            {t.label}
            {t.badge !== undefined && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                tab === t.key ? 'bg-blue-100 text-blue-700' :
                t.key === 'mappings' && unmappedCount > 0 ? 'bg-amber-100 text-amber-700' :
                'bg-slate-100 text-slate-500'
              }`}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'properties' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">{properties.filter(p => p.active).length} active · {properties.filter(p => !p.active).length} inactive</p>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 cursor-pointer border border-slate-200 rounded-lg px-3 py-2 hover:bg-slate-50 transition-colors">
                <FileUp className="w-3.5 h-3.5" />
                Import CSV
                <input type="file" accept=".csv,.txt" className="hidden" onChange={handleImportProperties} />
              </label>
              <button
                onClick={() => setShowPropAdd(v => !v)}
                className="flex items-center gap-1.5 text-xs font-semibold bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Property
              </button>
            </div>
          </div>

          {importPropsParsed.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-blue-800">
                <CheckCircle2 className="w-4 h-4" />
                {importPropsParsed.length} properties ready to import
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                {importPropsParsed.map((name, i) => (
                  <span key={i} className="text-xs px-2 py-1 bg-white border border-blue-200 text-blue-700 rounded-md">{name}</span>
                ))}
              </div>
              {importPropsError && <p className="text-xs text-red-600">{importPropsError}</p>}
              <div className="flex items-center gap-2">
                <button
                  onClick={saveImportProperties}
                  disabled={importPropsSaving}
                  className="flex items-center gap-1.5 text-xs font-semibold bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60"
                >
                  {importPropsSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Import {importPropsParsed.length} properties
                </button>
                <button onClick={() => setImportPropsParsed([])} className="text-xs text-slate-500 hover:text-slate-800">Cancel</button>
              </div>
            </div>
          )}

          {showPropAdd && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
              <p className="text-sm font-semibold text-blue-800">Add new property</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Property name *</label>
                  <input
                    autoFocus
                    value={propForm.name}
                    onChange={e => setPropForm(f => ({ ...f, name: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && addProperty()}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. Harbour View Cottage"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Notes (optional)</label>
                  <input
                    value={propForm.notes}
                    onChange={e => setPropForm(f => ({ ...f, notes: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Internal notes..."
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={addProperty}
                  disabled={savingProp || !propForm.name.trim()}
                  className="flex items-center gap-1.5 text-xs font-semibold bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60"
                >
                  {savingProp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Add property
                </button>
                <button onClick={() => { setShowPropAdd(false); setPropForm(BLANK_PROPERTY); }} className="text-xs text-slate-500 hover:text-slate-800">Cancel</button>
              </div>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Property name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">Notes</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 w-24" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {properties.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-slate-400 text-sm">
                      No properties yet. Add one above or import from CSV.
                    </td>
                  </tr>
                )}
                {properties.map(prop => (
                  <tr key={prop.id} className={`hover:bg-slate-50 transition-colors ${!prop.active ? 'opacity-50' : ''}`}>
                    {editingPropId === prop.id ? (
                      <>
                        <td className="px-3 py-2">
                          <input
                            autoFocus
                            value={editPropForm.name}
                            onChange={e => setEditPropForm(f => ({ ...f, name: e.target.value }))}
                            className="w-full border border-slate-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-3 py-2 hidden sm:table-cell">
                          <input
                            value={editPropForm.notes}
                            onChange={e => setEditPropForm(f => ({ ...f, notes: e.target.value }))}
                            className="w-full border border-slate-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-3 py-2" />
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <button onClick={saveEditProperty} disabled={savingProp} className="p-1.5 rounded text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-40">
                              {savingProp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            </button>
                            <button onClick={() => setEditingPropId(null)} className="p-1.5 rounded text-slate-400 hover:bg-slate-100 transition-colors">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 font-medium text-slate-800">{prop.name}</td>
                        <td className="px-4 py-3 text-slate-400 text-xs hidden sm:table-cell">{prop.notes || '—'}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => togglePropertyActive(prop)}
                            className={`text-xs px-2 py-1 rounded-full font-semibold transition-colors ${prop.active ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                          >
                            {prop.active ? 'Active' : 'Inactive'}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 justify-end">
                            <button
                              onClick={() => { setEditingPropId(prop.id); setEditPropForm({ name: prop.name, notes: prop.notes }); }}
                              className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => deleteProperty(prop.id)}
                              disabled={deletingPropId === prop.id}
                              className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                            >
                              {deletingPropId === prop.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-start gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500">
            <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            Property names here are the source of truth for the whole system — settlement parsing, bank payments, owner portal access, and report storage all reference this list. Names must match exactly what appears in your booking CSVs.
          </div>
        </div>
      )}

      {tab === 'owners' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">{owners.length} owner{owners.length !== 1 ? 's' : ''} with bank details</p>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 cursor-pointer border border-slate-200 rounded-lg px-3 py-2 hover:bg-slate-50 transition-colors">
                <FileUp className="w-3.5 h-3.5" />
                Import CSV
                <input type="file" accept=".csv" className="hidden" onChange={handleImportOwners} />
              </label>
              <button
                onClick={() => setShowOwnerAdd(v => !v)}
                className="flex items-center gap-1.5 text-xs font-semibold bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Owner
              </button>
            </div>
          </div>

          {importOwnersParsed.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-blue-800">
                <CheckCircle2 className="w-4 h-4" />
                {importOwnersParsed.length} owners parsed — choose how to save
              </div>
              <div className="border border-blue-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-white border-b border-blue-100">
                    <tr>
                      <th className="px-3 py-2 text-left text-slate-500 font-semibold">Name</th>
                      <th className="px-3 py-2 text-left text-slate-500 font-semibold">Sort code</th>
                      <th className="px-3 py-2 text-left text-slate-500 font-semibold">Account</th>
                      <th className="px-3 py-2 text-left text-slate-500 font-semibold">Type</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-blue-50">
                    {importOwnersParsed.map((o, i) => (
                      <tr key={i} className="bg-white">
                        <td className="px-3 py-2 text-slate-800 font-medium">{o.payee_name}</td>
                        <td className="px-3 py-2 font-mono text-slate-600">{o.sort_code}</td>
                        <td className="px-3 py-2 font-mono text-slate-600">{o.account_number}</td>
                        <td className="px-3 py-2 text-slate-400">{o.account_type}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {importOwnersError && <p className="text-xs text-red-600">{importOwnersError}</p>}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => saveImportOwners(false)}
                  disabled={importOwnersSaving}
                  className="flex items-center gap-1.5 text-xs font-semibold bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60"
                >
                  {importOwnersSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Add to existing
                </button>
                <button
                  onClick={() => saveImportOwners(true)}
                  disabled={importOwnersSaving}
                  className="flex items-center gap-1.5 text-xs font-semibold bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-60"
                >
                  Replace all
                </button>
                <button onClick={() => setImportOwnersParsed([])} className="text-xs text-slate-500 hover:text-slate-800">Cancel</button>
              </div>
            </div>
          )}

          {showOwnerAdd && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
              <p className="text-sm font-semibold text-blue-800">Add new owner</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <label className="text-xs text-slate-500 block mb-1">Payee name *</label>
                  <input value={ownerForm.payee_name} onChange={e => setOwnerForm(f => ({ ...f, payee_name: e.target.value }))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="John Smith" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Sort code *</label>
                  <input value={ownerForm.sort_code} onChange={e => setOwnerForm(f => ({ ...f, sort_code: e.target.value }))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="00-00-00" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Account number *</label>
                  <input value={ownerForm.account_number} onChange={e => setOwnerForm(f => ({ ...f, account_number: e.target.value }))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="12345678" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Account type</label>
                  <select value={ownerForm.account_type} onChange={e => setOwnerForm(f => ({ ...f, account_type: e.target.value }))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option>Personal</option>
                    <option>Business</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Payment ref prefix</label>
                  <input value={ownerForm.payment_reference_prefix} onChange={e => setOwnerForm(f => ({ ...f, payment_reference_prefix: e.target.value }))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="igloo" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={addOwner} disabled={savingOwner || !ownerForm.payee_name || !ownerForm.sort_code || !ownerForm.account_number} className="flex items-center gap-1.5 text-xs font-semibold bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60">
                  {savingOwner ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Add owner
                </button>
                <button onClick={() => { setShowOwnerAdd(false); setOwnerForm(BLANK_OWNER); }} className="text-xs text-slate-500 hover:text-slate-800">Cancel</button>
              </div>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Payee name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Sort code</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Account no.</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">Type</th>
                  <th className="px-4 py-3 w-24" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {owners.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-slate-400 text-sm">
                      No owners yet. Add one above or import from CSV.
                    </td>
                  </tr>
                )}
                {owners.map(owner => (
                  <tr key={owner.id} className="hover:bg-slate-50 transition-colors">
                    {editingOwnerId === owner.id ? (
                      <>
                        <td className="px-3 py-2">
                          <input autoFocus value={editOwnerForm.payee_name} onChange={e => setEditOwnerForm(f => ({ ...f, payee_name: e.target.value }))} className="w-full border border-slate-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </td>
                        <td className="px-3 py-2">
                          <input value={editOwnerForm.sort_code} onChange={e => setEditOwnerForm(f => ({ ...f, sort_code: e.target.value }))} className="w-28 border border-slate-300 rounded px-2 py-1 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </td>
                        <td className="px-3 py-2">
                          <input value={editOwnerForm.account_number} onChange={e => setEditOwnerForm(f => ({ ...f, account_number: e.target.value }))} className="w-28 border border-slate-300 rounded px-2 py-1 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </td>
                        <td className="px-3 py-2 hidden sm:table-cell">
                          <select value={editOwnerForm.account_type} onChange={e => setEditOwnerForm(f => ({ ...f, account_type: e.target.value }))} className="border border-slate-300 rounded px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                            <option>Personal</option><option>Business</option>
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            <button onClick={saveEditOwner} disabled={savingOwner} className="p-1.5 rounded text-emerald-600 hover:bg-emerald-50 transition-colors">
                              {savingOwner ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            </button>
                            <button onClick={() => setEditingOwnerId(null)} className="p-1.5 rounded text-slate-400 hover:bg-slate-100"><X className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 font-medium text-slate-800">{owner.payee_name}</td>
                        <td className="px-4 py-3 font-mono text-slate-500 text-xs">{owner.sort_code}</td>
                        <td className="px-4 py-3 font-mono text-slate-500 text-xs">{owner.account_number}</td>
                        <td className="px-4 py-3 text-slate-400 text-xs hidden sm:table-cell">{owner.account_type}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 justify-end">
                            <button onClick={() => { setEditingOwnerId(owner.id); setEditOwnerForm({ payee_name: owner.payee_name, sort_code: owner.sort_code, account_number: owner.account_number, account_type: owner.account_type, payment_reference_prefix: owner.payment_reference_prefix }); }} className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => deleteOwner(owner.id)} disabled={deletingOwnerId === owner.id} className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40">
                              {deletingOwnerId === owner.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'mappings' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">
              {mappedCount} of {properties.filter(p => p.active).length} active properties mapped
              {unmappedCount > 0 && <span className="text-amber-600 ml-1">· {unmappedCount} unmapped</span>}
            </p>
            <button
              onClick={saveMappings}
              disabled={savingMappings}
              className="flex items-center gap-2 bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60"
            >
              {savingMappings ? <Loader2 className="w-4 h-4 animate-spin" /> : mappingsSaved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {mappingsSaved ? 'Saved!' : 'Save mappings'}
            </button>
          </div>

          {owners.length === 0 && (
            <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-800">No owners set up yet</p>
                <p className="text-xs text-amber-700 mt-0.5">Go to the Owners tab to add owner bank details before mapping properties.</p>
                <button onClick={() => setTab('owners')} className="flex items-center gap-1 text-xs font-semibold text-amber-700 mt-2 hover:text-amber-900">
                  Set up owners <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Property</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Owner (for bank payments)</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {properties.filter(p => p.active).map(prop => {
                  const selectedOwnerId = mappingDraft[prop.id] || '';
                  const selectedOwner = owners.find(o => o.id === selectedOwnerId);
                  return (
                    <tr key={prop.id} className={`hover:bg-slate-50 transition-colors ${!selectedOwnerId ? 'bg-amber-50/50' : ''}`}>
                      <td className="px-4 py-3 font-medium text-slate-800">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                          {prop.name}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={selectedOwnerId}
                          onChange={e => setMappingDraft(prev => ({ ...prev, [prop.id]: e.target.value }))}
                          className={`w-full max-w-xs text-sm border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white transition-colors ${
                            selectedOwnerId ? 'border-emerald-200 text-slate-800' : 'border-amber-200 text-amber-700'
                          }`}
                        >
                          <option value="">— not mapped —</option>
                          {owners.map(o => (
                            <option key={o.id} value={o.id}>{o.payee_name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        {selectedOwnerId ? (
                          <span className="flex items-center gap-1 text-xs text-emerald-700 font-medium">
                            <Check className="w-3 h-3" />
                            <span className="font-mono text-slate-400">{selectedOwner?.sort_code}</span>
                            <ChevronRight className="w-3 h-3 text-slate-300" />
                            <span className="font-mono text-slate-400">{selectedOwner?.account_number}</span>
                          </span>
                        ) : (
                          <span className="text-xs text-amber-600 font-medium">Not mapped</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {properties.filter(p => p.active).length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-10 text-center text-slate-400 text-sm">
                      No active properties. Add properties in the Properties tab first.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-start gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500">
            <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            These mappings drive the bank payments CSV. When you process settlement PDFs, each property is matched by ID to its owner and their bank details are automatically pulled in — no manual matching needed.
          </div>
        </div>
      )}
    </div>
  );
}
