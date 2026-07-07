import { useEffect, useMemo, useState } from 'react';
import { Loader2, Search, Plus, Trash2, Save, AlertCircle, ClipboardList, CheckCircle2 } from 'lucide-react';
import { getProperties, invalidatePropertiesCache, type Property } from '../lib/properties';
import {
  listOwnerTasks,
  upsertOwnerTask,
  deleteOwnerTask,
  type OwnerTask,
} from '../lib/guestReady';

type Draft = Partial<OwnerTask> & { _new?: boolean; _localId?: string };

export function GuestReadyTasksTab() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [tasksByProperty, setTasksByProperty] = useState<Record<string, OwnerTask[]>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      invalidatePropertiesCache();
      const props = await getProperties(false);
      setProperties(props);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  const loadTasksFor = async (propertyId: string) => {
    try {
      const tasks = await listOwnerTasks(propertyId);
      setTasksByProperty((prev) => ({ ...prev, [propertyId]: tasks }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load tasks');
    }
  };

  const togglePanel = async (id: string) => {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    if (!tasksByProperty[id]) {
      await loadTasksFor(id);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? properties.filter((p) => p.name.toLowerCase().includes(q))
      : properties;
    return list.filter((p) => p.active !== false).sort((a, b) => a.name.localeCompare(b.name));
  }, [properties, search]);

  const getDraft = (taskId: string, base?: OwnerTask): Draft => {
    const d = drafts[taskId];
    if (d) return d;
    return base ? { ...base } : {};
  };

  const setDraft = (taskId: string, patch: Partial<OwnerTask>) => {
    setDrafts((prev) => ({ ...prev, [taskId]: { ...(prev[taskId] ?? {}), ...patch } }));
  };

  const addNewTask = (propertyId: string) => {
    const localId = `new-${propertyId}-${Date.now()}`;
    setDrafts((prev) => ({
      ...prev,
      [localId]: {
        _new: true,
        _localId: localId,
        property_id: propertyId,
        name: '',
        instructions: '',
        recurrence_days: 30,
        requires_value: false,
        value_label: '',
        notify_owner_email: true,
        active: true,
      },
    }));
  };

  const discardDraft = (key: string) => {
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const saveDraft = async (key: string, propertyId: string) => {
    const d = drafts[key];
    if (!d?.name?.trim()) {
      setError('Task name is required');
      return;
    }
    if (!d.recurrence_days || d.recurrence_days < 1) {
      setError('Recurrence must be at least 1 day');
      return;
    }
    setSavingId(key);
    setError(null);
    try {
      const saved = await upsertOwnerTask({
        id: d._new ? undefined : d.id,
        property_id: propertyId,
        name: d.name.trim(),
        instructions: d.instructions ?? '',
        recurrence_days: d.recurrence_days,
        requires_value: !!d.requires_value,
        value_label: d.value_label ?? '',
        notify_owner_email: d.notify_owner_email !== false,
        active: d.active !== false,
      });
      setTasksByProperty((prev) => {
        const list = prev[propertyId] ?? [];
        const idx = list.findIndex((t) => t.id === saved.id);
        const nextList = idx >= 0 ? list.map((t) => (t.id === saved.id ? saved : t)) : [...list, saved];
        return { ...prev, [propertyId]: nextList };
      });
      discardDraft(key);
      setSavedId(key);
      setTimeout(() => setSavedId((p) => (p === key ? null : p)), 1500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSavingId(null);
    }
  };

  const removeTask = async (taskId: string, propertyId: string) => {
    if (!confirm('Delete this task? This cannot be undone.')) return;
    setSavingId(taskId);
    try {
      await deleteOwnerTask(taskId);
      setTasksByProperty((prev) => ({
        ...prev,
        [propertyId]: (prev[propertyId] ?? []).filter((t) => t.id !== taskId),
      }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <header className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Guest Ready Tasks</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Per-property recurring tasks (e.g. oil level, electricity reading). Due tasks appear on the
            next Guest Ready card for the property; owner is notified by email on completion.
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search properties..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </header>

      {error && (
        <div className="m-5 p-3 bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <ul className="divide-y divide-slate-100">
        {filtered.map((p) => {
          const isOpen = openId === p.id;
          const tasks = tasksByProperty[p.id];
          const draftKeys = Object.keys(drafts).filter(
            (k) => drafts[k]?.property_id === p.id && drafts[k]?._new
          );
          const count = tasks?.filter((t) => t.active).length ?? 0;
          return (
            <li key={p.id} className="px-5 py-3">
              <button
                type="button"
                onClick={() => togglePanel(p.id)}
                className="w-full flex items-center justify-between gap-3 text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center flex-shrink-0">
                    <ClipboardList className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 truncate">{p.name}</div>
                    <div className="text-xs text-slate-500">
                      {count === 0 ? 'No tasks' : `${count} active task${count === 1 ? '' : 's'}`}
                    </div>
                  </div>
                </div>
                <span className="text-xs text-slate-400">{isOpen ? 'Close' : 'Manage'}</span>
              </button>

              {isOpen && (
                <div className="mt-4 ml-12 space-y-3">
                  {!tasks && (
                    <div className="flex items-center gap-2 text-sm text-slate-400">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading tasks...
                    </div>
                  )}
                  {tasks &&
                    tasks.map((t) => {
                      const d = drafts[t.id];
                      const draft: Draft = d ?? t;
                      const dirty = !!d;
                      const saving = savingId === t.id;
                      const saved = savedId === t.id;
                      return (
                        <TaskRow
                          key={t.id}
                          draft={draft}
                          dirty={dirty}
                          saving={saving}
                          saved={saved}
                          onChange={(patch) => setDraft(t.id, patch)}
                          onSave={() => saveDraft(t.id, p.id)}
                          onDiscard={() => discardDraft(t.id)}
                          onDelete={() => removeTask(t.id, p.id)}
                        />
                      );
                    })}

                  {draftKeys.map((k) => {
                    const d = drafts[k]!;
                    const saving = savingId === k;
                    return (
                      <TaskRow
                        key={k}
                        draft={d}
                        dirty
                        saving={saving}
                        saved={false}
                        isNew
                        onChange={(patch) => setDraft(k, patch)}
                        onSave={() => saveDraft(k, p.id)}
                        onDiscard={() => discardDraft(k)}
                      />
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => addNewTask(p.id)}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:text-blue-900"
                  >
                    <Plus className="w-4 h-4" />
                    Add task
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function TaskRow({
  draft, dirty, saving, saved, isNew, onChange, onSave, onDiscard, onDelete,
}: {
  draft: Draft;
  dirty: boolean;
  saving: boolean;
  saved: boolean;
  isNew?: boolean;
  onChange: (patch: Partial<OwnerTask>) => void;
  onSave: () => void;
  onDiscard: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className={`p-3 rounded-xl border ${dirty ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200 bg-white'}`}>
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
        <input
          type="text"
          value={draft.name ?? ''}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Task name (e.g. Oil level reading)"
          className="sm:col-span-5 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-400"
        />
        <div className="sm:col-span-3 flex items-center gap-1">
          <input
            type="number"
            min={1}
            value={draft.recurrence_days ?? 30}
            onChange={(e) => onChange({ recurrence_days: Number(e.target.value) })}
            className="w-20 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-400 tabular-nums"
          />
          <span className="text-xs text-slate-500">days</span>
        </div>
        <label className="sm:col-span-2 flex items-center gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={!!draft.requires_value}
            onChange={(e) => onChange({ requires_value: e.target.checked })}
          />
          Capture reading
        </label>
        <label className="sm:col-span-2 flex items-center gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={draft.notify_owner_email !== false}
            onChange={(e) => onChange({ notify_owner_email: e.target.checked })}
          />
          Email owner
        </label>
        {draft.requires_value && (
          <input
            type="text"
            value={draft.value_label ?? ''}
            onChange={(e) => onChange({ value_label: e.target.value })}
            placeholder="Reading label (e.g. Oil level %)"
            className="sm:col-span-6 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-400"
          />
        )}
        <textarea
          value={draft.instructions ?? ''}
          onChange={(e) => onChange({ instructions: e.target.value })}
          placeholder="Instructions for the cleaner (optional)"
          rows={2}
          className="sm:col-span-12 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-400"
        />
      </div>
      <div className="flex items-center justify-end gap-2 mt-2">
        {!isNew && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-800 px-2 py-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </button>
        )}
        {dirty && (
          <button
            type="button"
            onClick={onDiscard}
            className="text-xs font-semibold text-slate-500 hover:text-slate-800 px-2 py-1"
          >
            Discard
          </button>
        )}
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !dirty}
          className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-600 text-white disabled:opacity-40"
        >
          {saved ? <CheckCircle2 className="w-3.5 h-3.5" /> : saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {saved ? 'Saved' : saving ? 'Saving' : isNew ? 'Create' : 'Save'}
        </button>
      </div>
    </div>
  );
}
