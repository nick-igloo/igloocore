import { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, Wrench, Save, X } from 'lucide-react';
import { Contractor, listContractors, upsertContractor, deleteContractor } from '../lib/turnover';

export function ContractorsPanel() {
  const [items, setItems] = useState<Contractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Partial<Contractor> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      setItems(await listContractors());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    if (!draft?.name?.trim()) {
      setError('Name is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await upsertContractor({ ...draft, name: draft.name.trim() } as any);
      setDraft(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (c: Contractor) => {
    if (!confirm(`Archive ${c.name}?`)) return;
    await deleteContractor(c.id);
    await load();
  };

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-slate-900 flex items-center gap-2"><Wrench className="w-4 h-4 text-orange-600" /> Contractors</h3>
          <p className="text-xs text-slate-500 mt-0.5">Trades you call or WhatsApp when issues arise.</p>
        </div>
        <button
          onClick={() => setDraft({ name: '', trade: '', phone: '' })}
          className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-700 text-white text-sm font-semibold px-3 py-1.5 rounded-lg"
        >
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>

      {error && <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{error}</div>}

      {loading ? (
        <div className="text-center py-6"><Loader2 className="w-5 h-5 animate-spin text-slate-400 mx-auto" /></div>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-4">No contractors yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((c) => (
            <li key={c.id} className="py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-slate-800">{c.name}</div>
                <div className="text-xs text-slate-500">
                  {[c.trade, c.phone, c.email].filter(Boolean).join(' · ') || '—'}
                </div>
              </div>
              <button
                onClick={() => setDraft(c)}
                className="text-xs font-semibold text-slate-600 hover:text-slate-900 px-2 py-1"
              >
                Edit
              </button>
              <button
                onClick={() => remove(c)}
                className="text-slate-400 hover:text-red-600 p-1"
                aria-label="Archive"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {draft && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center">
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <h4 className="font-bold text-slate-900">{draft.id ? 'Edit contractor' : 'Add contractor'}</h4>
              <button onClick={() => setDraft(null)} className="text-slate-400"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-3">
              <Input label="Name" value={draft.name ?? ''} onChange={(v) => setDraft({ ...draft, name: v })} />
              <Input label="Trade" value={draft.trade ?? ''} onChange={(v) => setDraft({ ...draft, trade: v })} placeholder="e.g. Plumber" />
              <Input label="Phone" value={draft.phone ?? ''} onChange={(v) => setDraft({ ...draft, phone: v })} />
              <Input label="Email" value={draft.email ?? ''} onChange={(v) => setDraft({ ...draft, email: v })} />
              <Input label="Notes" value={draft.notes ?? ''} onChange={(v) => setDraft({ ...draft, notes: v })} />
              <button
                onClick={save}
                disabled={saving}
                className="w-full bg-teal-600 hover:bg-teal-700 text-white font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4" /> Save</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Input({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
      />
    </label>
  );
}
