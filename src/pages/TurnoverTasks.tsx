import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Loader2, ListChecks, CheckCircle2, Plus, X, Search,
  User as UserIcon, Calendar, MapPin, Trash2, CheckSquare,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getProperties, Property } from '../lib/properties';
import {
  BookingTask, listOpenTasks, completeTask, createTask, deleteTask,
  AssigneeRole,
} from '../lib/turnover';
import { TurnoverNav } from '../components/TurnoverNav';
import { PhotoPicker } from '../components/PhotoPicker';

const ADMIN_EMAILS = ['nick@igloo.scot', 'erin@igloo.scot'];

export default function TurnoverTasks() {
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<BookingTask[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [performerName, setPerformerName] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'mine' | 'all'>('all');
  const [searchParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const initialPropertyId = searchParams.get('property') ?? '';
  const [activePhoto, setActivePhoto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = userEmail ? ADMIN_EMAILS.includes(userEmail.toLowerCase()) : false;

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const u = session?.user;
      setUserEmail(u?.email ?? null);
      if (u) {
        const { data: cp } = await supabase
          .from('cleaner_profiles')
          .select('full_name')
          .eq('auth_user_id', u.id)
          .maybeSingle();
        if (cp?.full_name) setPerformerName(cp.full_name);
        else if (u.user_metadata?.full_name) setPerformerName(u.user_metadata.full_name);
        else if (u.email) setPerformerName(u.email.split('@')[0]);
      }
      const [t, p] = await Promise.all([listOpenTasks({ onlyOpen: true }), getProperties(true)]);
      setTasks(t);
      setProperties(p);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (initialPropertyId && t.property_id !== initialPropertyId) return false;
      if (filter === 'mine' && performerName && !t.assignee_name.toLowerCase().includes(performerName.toLowerCase())) return false;
      if (!q) return true;
      return `${t.property_name} ${t.title} ${t.description} ${t.assignee_name}`.toLowerCase().includes(q);
    });
  }, [tasks, search, filter, performerName, initialPropertyId]);

  const grouped = useMemo(() => {
    const map = new Map<string, BookingTask[]>();
    filtered.forEach((t) => {
      const key = t.property_name || 'Unassigned';
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const handleComplete = async (t: BookingTask, photoPath?: string) => {
    if (!performerName.trim()) {
      setError('Please enter your name first.');
      return;
    }
    try {
      await completeTask(t.id, { performerName: performerName.trim(), photoPath });
      setTasks((prev) => prev.filter((x) => x.id !== t.id));
      setActivePhoto(null);
    } catch (e: any) {
      setError(e.message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 pb-24">
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/guest-ready" className="text-slate-500 hover:text-slate-700"><ArrowLeft className="w-5 h-5" /></Link>
          <div className="flex-1">
            <h1 className="text-base font-bold text-slate-900 flex items-center gap-2"><ListChecks className="w-4 h-4 text-teal-600" /> Tasks</h1>
            <p className="text-xs text-slate-500">{tasks.length} open</p>
          </div>
          {isAdmin && (
            <button
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold px-3 py-1.5 rounded-lg"
            >
              <Plus className="w-4 h-4" /> New
            </button>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>}

        <section className="bg-white rounded-2xl border border-slate-200 p-3 space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={performerName}
                onChange={(e) => setPerformerName(e.target.value)}
                placeholder="Your name"
                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search"
                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div className="flex bg-slate-100 rounded-lg p-1">
              <button
                onClick={() => setFilter('all')}
                className={`px-3 text-xs font-semibold rounded-md ${filter === 'all' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500'}`}
              >
                All
              </button>
              <button
                onClick={() => setFilter('mine')}
                className={`px-3 text-xs font-semibold rounded-md ${filter === 'mine' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500'}`}
              >
                Mine
              </button>
            </div>
          </div>
        </section>

        {grouped.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700">All caught up</p>
            <p className="text-xs text-slate-500 mt-1">No open tasks right now.</p>
          </div>
        ) : (
          grouped.map(([propName, rows]) => (
            <section key={propName}>
              <div className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-slate-500 mb-2 px-1">
                <MapPin className="w-3 h-3" /> {propName} <span className="text-slate-400 font-normal">· {rows.length}</span>
              </div>
              <ul className="space-y-2">
                {rows.map((t) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    onComplete={handleComplete}
                    onDelete={isAdmin ? async () => {
                      if (!confirm('Delete this task?')) return;
                      await deleteTask(t.id);
                      setTasks((prev) => prev.filter((x) => x.id !== t.id));
                    } : undefined}
                    photoOpen={activePhoto === t.id}
                    onTogglePhoto={() => setActivePhoto(activePhoto === t.id ? null : t.id)}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </main>

      {creating && isAdmin && (
        <NewTaskSheet
          properties={properties}
          onClose={() => setCreating(false)}
          onCreated={(task) => {
            setTasks((prev) => [task, ...prev]);
            setCreating(false);
          }}
        />
      )}

      <TurnoverNav openCount={tasks.length} />
    </div>
  );
}

function TaskCard({
  task, onComplete, onDelete, photoOpen, onTogglePhoto,
}: {
  task: BookingTask;
  onComplete: (t: BookingTask, photoPath?: string) => void;
  onDelete?: () => void;
  photoOpen: boolean;
  onTogglePhoto: () => void;
}) {
  const [photos, setPhotos] = useState<string[]>([]);
  const overdue = task.due_date && task.due_date < new Date().toISOString().split('T')[0];

  return (
    <li className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="p-4 flex items-start gap-3">
        <button
          onClick={() => onComplete(task, photos[0])}
          className="mt-0.5 w-7 h-7 rounded-full border-2 border-slate-300 hover:border-teal-500 hover:bg-teal-50 flex items-center justify-center transition-colors flex-shrink-0"
          aria-label="Mark complete"
        >
          <CheckSquare className="w-4 h-4 text-teal-600 opacity-0 hover:opacity-100" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-slate-900">{task.title}</div>
          {task.description && <div className="text-xs text-slate-600 mt-0.5">{task.description}</div>}
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 capitalize">
              {task.assignee_role}{task.assignee_name ? ` · ${task.assignee_name}` : ''}
            </span>
            {task.due_date && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${overdue ? 'bg-red-100 text-red-700' : 'bg-amber-50 text-amber-800'}`}>
                <Calendar className="w-3 h-3" />
                Due {task.due_date}
              </span>
            )}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={onTogglePhoto}
              className="text-xs font-semibold text-teal-700 hover:text-teal-800"
            >
              {photoOpen ? 'Hide photo' : 'Add photo proof'}
            </button>
            {onDelete && (
              <button onClick={onDelete} className="ml-auto text-xs text-slate-400 hover:text-red-600 inline-flex items-center gap-1">
                <Trash2 className="w-3 h-3" /> Delete
              </button>
            )}
          </div>
          {photoOpen && (
            <div className="mt-3">
              <PhotoPicker folder="tasks" paths={photos} onChange={setPhotos} max={1} />
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function NewTaskSheet({
  properties, onClose, onCreated,
}: {
  properties: Property[];
  onClose: () => void;
  onCreated: (t: BookingTask) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [propertyId, setPropertyId] = useState<string>('');
  const [assigneeRole, setAssigneeRole] = useState<AssigneeRole>('cleaner');
  const [assigneeName, setAssigneeName] = useState('');
  const [dueDate, setDueDate] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!title.trim() || !propertyId) {
      setError('Title and property are required.');
      return;
    }
    const prop = properties.find((p) => p.id === propertyId);
    setSaving(true);
    setError(null);
    try {
      const task = await createTask({
        property_id: propertyId,
        property_name: prop?.name ?? '',
        title: title.trim(),
        description: description.trim(),
        assignee_role: assigneeRole,
        assignee_name: assigneeName.trim(),
        due_date: dueDate || null,
      });
      onCreated(task);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
          <h2 className="font-bold text-slate-900">New task</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-3">
          <Field label="Property">
            <select
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm"
            >
              <option value="">Select property…</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Task">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Make up twin beds"
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm"
            />
          </Field>
          <Field label="Notes (optional)">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Any extra detail…"
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Assign to">
              <select
                value={assigneeRole}
                onChange={(e) => setAssigneeRole(e.target.value as AssigneeRole)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm"
              >
                <option value="cleaner">Cleaner</option>
                <option value="owner">Owner</option>
                <option value="director">Director</option>
              </select>
            </Field>
            <Field label="Due date">
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm"
              />
            </Field>
          </div>
          <Field label="Specific person (optional)">
            <input
              value={assigneeName}
              onChange={(e) => setAssigneeName(e.target.value)}
              placeholder="e.g. Sarah"
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm"
            />
          </Field>
          {error && <div className="text-sm text-red-700">{error}</div>}
          <button
            onClick={submit}
            disabled={saving}
            className="w-full bg-teal-600 hover:bg-teal-700 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create task'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{label}</span>
      {children}
    </label>
  );
}
