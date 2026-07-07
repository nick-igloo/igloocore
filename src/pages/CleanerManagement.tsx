import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, UserPlus, Users, Home, Trash2, Loader2, Check, X, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getProperties, Property } from '../lib/properties';
import { CleanerProfile } from '../lib/guestReady';

interface Assignment {
  id: string;
  cleaner_id: string;
  property_id: string;
}

export default function CleanerManagement() {
  const [cleaners, setCleaners] = useState<CleanerProfile[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');

  const [selectedCleaner, setSelectedCleaner] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [cl, props, { data: asg }] = await Promise.all([
        supabase.from('cleaner_profiles').select('*').order('full_name'),
        getProperties(true),
        supabase.from('cleaner_property_assignments').select('*'),
      ]);
      setCleaners((cl.data as CleanerProfile[]) || []);
      setProperties(props);
      setAssignments((asg as Assignment[]) || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const addCleaner = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('cleaner_profiles').insert({
        full_name: newName.trim(),
        email: newEmail.trim(),
        phone: newPhone.trim(),
        active: true,
      });
      if (error) throw error;
      setNewName(''); setNewEmail(''); setNewPhone('');
      setShowAdd(false);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (c: CleanerProfile) => {
    await supabase.from('cleaner_profiles').update({ active: !c.active }).eq('id', c.id);
    await load();
  };

  const removeCleaner = async (id: string) => {
    if (!confirm('Remove this cleaner?')) return;
    await supabase.from('cleaner_profiles').delete().eq('id', id);
    if (selectedCleaner === id) setSelectedCleaner(null);
    await load();
  };

  const toggleAssignment = async (cleanerId: string, propertyId: string) => {
    const existing = assignments.find(a => a.cleaner_id === cleanerId && a.property_id === propertyId);
    if (existing) {
      await supabase.from('cleaner_property_assignments').delete().eq('id', existing.id);
    } else {
      await supabase.from('cleaner_property_assignments').insert({ cleaner_id: cleanerId, property_id: propertyId });
    }
    await load();
  };

  const isAssigned = (cleanerId: string, propertyId: string) =>
    assignments.some(a => a.cleaner_id === cleanerId && a.property_id === propertyId);

  const selected = cleaners.find(c => c.id === selectedCleaner);

  if (loading) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><Loader2 className="w-8 h-8 text-teal-600 animate-spin" /></div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link to="/" className="text-slate-500 hover:text-slate-700"><ArrowLeft className="w-5 h-5" /></Link>
          <div className="flex-1">
            <h1 className="font-bold text-slate-900">Cleaner Management</h1>
            <p className="text-xs text-slate-500">Manage cleaner profiles and property assignments</p>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium py-2 px-4 rounded-lg shadow-sm"
          >
            <UserPlus className="w-4 h-4" /> Add cleaner
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
        )}

        {showAdd && (
          <div className="mb-6 bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Add new cleaner</h2>
              <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Full name" className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500" />
              <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="Email (optional)" className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500" />
              <input type="tel" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="Phone (optional)" className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
            <button
              onClick={addCleaner}
              disabled={saving || !newName.trim()}
              className="inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-medium py-2 px-4 rounded-lg"
            >
              <Plus className="w-4 h-4" /> {saving ? 'Saving...' : 'Add'}
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-1 bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-500" />
              <h2 className="font-semibold text-slate-900">Cleaners ({cleaners.length})</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {cleaners.length === 0 && (
                <p className="p-6 text-center text-sm text-slate-500">No cleaners yet. Add one to get started.</p>
              )}
              {cleaners.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCleaner(c.id)}
                  className={`w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 ${selectedCleaner === c.id ? 'bg-teal-50' : ''}`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${c.active ? 'bg-teal-100 text-teal-700' : 'bg-slate-200 text-slate-500'}`}>
                    {c.full_name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-900 truncate">{c.full_name}</div>
                    <div className="text-xs text-slate-500 truncate">{c.email || c.phone || 'No contact'}</div>
                  </div>
                  {!c.active && <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">Inactive</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="lg:col-span-2">
            {!selected ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-slate-500">
                <Users className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                Select a cleaner to manage property assignments
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <h2 className="font-bold text-slate-900">{selected.full_name}</h2>
                    <p className="text-xs text-slate-500">{selected.email || 'No email'} · {selected.phone || 'No phone'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => toggleActive(selected)} className={`text-xs px-3 py-1.5 rounded-lg font-medium ${selected.active ? 'bg-slate-100 text-slate-700' : 'bg-teal-600 text-white'}`}>
                      {selected.active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button onClick={() => removeCleaner(selected.id)} className="text-red-600 hover:bg-red-50 p-1.5 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
                <div className="p-5">
                  <p className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2"><Home className="w-4 h-4" /> Assigned properties</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {properties.map((p) => {
                      const assigned = isAssigned(selected.id, p.id);
                      return (
                        <button
                          key={p.id}
                          onClick={() => toggleAssignment(selected.id, p.id)}
                          className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                            assigned ? 'border-teal-500 bg-teal-50' : 'border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div className={`w-6 h-6 rounded-md flex items-center justify-center ${assigned ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                            {assigned && <Check className="w-4 h-4" />}
                          </div>
                          <span className="flex-1 text-sm font-medium text-slate-900">{p.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
