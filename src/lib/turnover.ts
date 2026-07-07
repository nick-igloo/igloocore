import { supabase } from './supabase';

export type TaskStatus = 'open' | 'done' | 'cancelled';
export type AssigneeRole = 'cleaner' | 'owner' | 'director';
export type TemplateTrigger = 'next_clean' | 'every_clean' | 'specific_booking' | 'monthly_owner' | 'safety';
export type IssueStatus = 'open' | 'contractor_logged' | 'owner_notified' | 'resolved' | 'cancelled';
export type IssueSeverity = 'low' | 'normal' | 'high' | 'urgent';

export interface Contractor {
  id: string;
  name: string;
  trade: string;
  phone: string;
  email: string;
  notes: string;
  active: boolean;
}

export interface TaskTemplate {
  id: string;
  title: string;
  description: string;
  trigger_type: TemplateTrigger;
  property_id: string | null;
  applies_to_all: boolean;
  default_assignee: AssigneeRole;
  recurrence_days: number;
  active: boolean;
}

export interface BookingTask {
  id: string;
  property_id: string | null;
  property_name: string;
  booking_id: string | null;
  template_id: string | null;
  title: string;
  description: string;
  assignee_role: AssigneeRole;
  assignee_name: string;
  assignee_auth_id: string | null;
  due_date: string | null;
  status: TaskStatus;
  completed_at: string | null;
  completed_by_name: string;
  proof_photo_path: string;
  notes: string;
  created_at: string;
}

export interface IssueReport {
  id: string;
  property_id: string | null;
  property_name: string;
  booking_id: string | null;
  title: string;
  description: string;
  severity: IssueSeverity;
  photos: string[];
  status: IssueStatus;
  contractor_id: string | null;
  contractor_name: string;
  contractor_logged_at: string | null;
  owner_notified_at: string | null;
  owner_notified_email: string;
  resolved_at: string | null;
  resolution_notes: string;
  reporter_name: string;
  reporter_role: string;
  status_note: string;
  created_at: string;
}

export interface IssueEvent {
  id: string;
  issue_id: string;
  event_type: string;
  note: string;
  actor_name: string;
  created_at: string;
}

// ---------- Contractors ----------

export const listContractors = async (): Promise<Contractor[]> => {
  const { data, error } = await supabase
    .from('contractors')
    .select('*')
    .eq('active', true)
    .order('name', { ascending: true });
  if (error) throw error;
  return data ?? [];
};

export const upsertContractor = async (c: Partial<Contractor> & { name: string }): Promise<Contractor> => {
  const payload = {
    name: c.name,
    trade: c.trade ?? '',
    phone: c.phone ?? '',
    email: c.email ?? '',
    notes: c.notes ?? '',
    active: c.active ?? true,
    updated_at: new Date().toISOString(),
  };
  if (c.id) {
    const { data, error } = await supabase.from('contractors').update(payload).eq('id', c.id).select('*').maybeSingle();
    if (error) throw error;
    return data as Contractor;
  }
  const { data, error } = await supabase.from('contractors').insert(payload).select('*').maybeSingle();
  if (error) throw error;
  return data as Contractor;
};

export const deleteContractor = async (id: string): Promise<void> => {
  const { error } = await supabase.from('contractors').update({ active: false }).eq('id', id);
  if (error) throw error;
};

// ---------- Task templates ----------

export const listTemplates = async (): Promise<TaskTemplate[]> => {
  const { data, error } = await supabase
    .from('task_templates')
    .select('*')
    .eq('active', true)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
};

export const upsertTemplate = async (t: Partial<TaskTemplate> & { title: string; trigger_type: TemplateTrigger }): Promise<TaskTemplate> => {
  const payload = {
    title: t.title,
    description: t.description ?? '',
    trigger_type: t.trigger_type,
    property_id: t.property_id ?? null,
    applies_to_all: t.applies_to_all ?? false,
    default_assignee: t.default_assignee ?? 'cleaner',
    recurrence_days: t.recurrence_days ?? 0,
    active: t.active ?? true,
    updated_at: new Date().toISOString(),
  };
  if (t.id) {
    const { data, error } = await supabase.from('task_templates').update(payload).eq('id', t.id).select('*').maybeSingle();
    if (error) throw error;
    return data as TaskTemplate;
  }
  const { data, error } = await supabase.from('task_templates').insert(payload).select('*').maybeSingle();
  if (error) throw error;
  return data as TaskTemplate;
};

export const deleteTemplate = async (id: string): Promise<void> => {
  const { error } = await supabase.from('task_templates').update({ active: false }).eq('id', id);
  if (error) throw error;
};

// ---------- Booking tasks ----------

export const listOpenTasks = async (opts: { propertyId?: string | null; onlyOpen?: boolean } = {}): Promise<BookingTask[]> => {
  let q = supabase.from('booking_tasks').select('*');
  if (opts.propertyId) q = q.eq('property_id', opts.propertyId);
  if (opts.onlyOpen !== false) q = q.eq('status', 'open');
  const { data, error } = await q.order('due_date', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data ?? [];
};

export const listTasksForProperty = async (propertyId: string): Promise<BookingTask[]> => {
  const { data, error } = await supabase
    .from('booking_tasks')
    .select('*')
    .eq('property_id', propertyId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return data ?? [];
};

export const createTask = async (t: {
  property_id: string | null;
  property_name: string;
  title: string;
  description?: string;
  assignee_role?: AssigneeRole;
  assignee_name?: string;
  booking_id?: string | null;
  due_date?: string | null;
  template_id?: string | null;
}): Promise<BookingTask> => {
  const payload = {
    property_id: t.property_id,
    property_name: t.property_name,
    title: t.title,
    description: t.description ?? '',
    assignee_role: t.assignee_role ?? 'cleaner',
    assignee_name: t.assignee_name ?? '',
    booking_id: t.booking_id ?? null,
    due_date: t.due_date ?? null,
    template_id: t.template_id ?? null,
    status: 'open',
  };
  const { data, error } = await supabase.from('booking_tasks').insert(payload).select('*').maybeSingle();
  if (error) throw error;
  return data as BookingTask;
};

export const completeTask = async (id: string, params: { performerName: string; photoPath?: string; notes?: string }): Promise<void> => {
  const { error } = await supabase
    .from('booking_tasks')
    .update({
      status: 'done',
      completed_at: new Date().toISOString(),
      completed_by_name: params.performerName,
      proof_photo_path: params.photoPath ?? '',
      notes: params.notes ?? '',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;
};

export const reopenTask = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('booking_tasks')
    .update({ status: 'open', completed_at: null, completed_by_name: '', updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
};

export const deleteTask = async (id: string): Promise<void> => {
  const { error } = await supabase.from('booking_tasks').delete().eq('id', id);
  if (error) throw error;
};

// ---------- Issues ----------

export const listIssues = async (opts: { propertyId?: string | null; includeResolved?: boolean } = {}): Promise<IssueReport[]> => {
  let q = supabase.from('issue_reports').select('*');
  if (opts.propertyId) q = q.eq('property_id', opts.propertyId);
  if (!opts.includeResolved) q = q.not('status', 'in', '("resolved","cancelled")');
  const { data, error } = await q.order('created_at', { ascending: false }).limit(200);
  if (error) throw error;
  return (data ?? []).map(normaliseIssue);
};

export const listAllIssues = async (): Promise<IssueReport[]> => {
  const { data, error } = await supabase
    .from('issue_reports')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data ?? []).map(normaliseIssue);
};

const normaliseIssue = (row: any): IssueReport => ({
  ...row,
  photos: Array.isArray(row.photos) ? row.photos : [],
});

export const createIssue = async (i: {
  property_id: string | null;
  property_name: string;
  title: string;
  description?: string;
  severity?: IssueSeverity;
  photos?: string[];
  booking_id?: string | null;
  reporter_name: string;
  reporter_role?: string;
}): Promise<IssueReport> => {
  const payload = {
    property_id: i.property_id,
    property_name: i.property_name,
    title: i.title,
    description: i.description ?? '',
    severity: i.severity ?? 'normal',
    photos: i.photos ?? [],
    booking_id: i.booking_id ?? null,
    reporter_name: i.reporter_name,
    reporter_role: i.reporter_role ?? 'cleaner',
    status: 'open',
  };
  const { data, error } = await supabase.from('issue_reports').insert(payload).select('*').maybeSingle();
  if (error) throw error;

  try {
    await supabase.from('issue_status_events').insert({
      issue_id: data.id,
      event_type: 'created',
      note: i.description ?? '',
      actor_name: i.reporter_name,
    });
  } catch {
    // non-fatal
  }

  return normaliseIssue(data);
};

export const logContractorOnIssue = async (id: string, params: { contractor_id?: string | null; contractor_name: string; note?: string; actorName: string }): Promise<void> => {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('issue_reports')
    .update({
      status: 'contractor_logged',
      contractor_id: params.contractor_id ?? null,
      contractor_name: params.contractor_name,
      contractor_logged_at: now,
      status_note: params.note ?? '',
      updated_at: now,
    })
    .eq('id', id);
  if (error) throw error;

  await supabase.from('issue_status_events').insert({
    issue_id: id,
    event_type: 'contractor_logged',
    note: `${params.contractor_name}${params.note ? ` — ${params.note}` : ''}`,
    actor_name: params.actorName,
  });
};

export const markOwnerNotifiedOnIssue = async (id: string, params: { ownerEmail: string; note?: string; actorName: string }): Promise<void> => {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('issue_reports')
    .update({
      status: 'owner_notified',
      owner_notified_at: now,
      owner_notified_email: params.ownerEmail,
      status_note: params.note ?? '',
      updated_at: now,
    })
    .eq('id', id);
  if (error) throw error;

  await supabase.from('issue_status_events').insert({
    issue_id: id,
    event_type: 'owner_notified',
    note: `${params.ownerEmail}${params.note ? ` — ${params.note}` : ''}`,
    actor_name: params.actorName,
  });
};

export const notifyOwnerAboutIssue = async (id: string): Promise<{ ok: boolean; email?: string; error?: string }> => {
  try {
    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notify-owner-issue`;
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ issue_id: id }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || 'Failed' };
    return { ok: true, email: data.email };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
};

export const resolveIssue = async (id: string, params: { notes: string; actorName: string }): Promise<void> => {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('issue_reports')
    .update({
      status: 'resolved',
      resolved_at: now,
      resolution_notes: params.notes,
      updated_at: now,
    })
    .eq('id', id);
  if (error) throw error;

  await supabase.from('issue_status_events').insert({
    issue_id: id,
    event_type: 'resolved',
    note: params.notes,
    actor_name: params.actorName,
  });
};

export const addIssueNote = async (id: string, params: { note: string; actorName: string }): Promise<void> => {
  const { error } = await supabase
    .from('issue_reports')
    .update({ status_note: params.note, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;

  await supabase.from('issue_status_events').insert({
    issue_id: id,
    event_type: 'status_note',
    note: params.note,
    actor_name: params.actorName,
  });
};

export const listIssueEvents = async (issueId: string): Promise<IssueEvent[]> => {
  const { data, error } = await supabase
    .from('issue_status_events')
    .select('*')
    .eq('issue_id', issueId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
};

// ---------- Photo upload ----------

export const uploadTurnoverPhoto = async (file: File, folder: 'issues' | 'tasks'): Promise<string> => {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('turnover-photos').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || 'image/jpeg',
  });
  if (error) throw error;
  return path;
};

export const getPhotoUrl = (path: string): string => {
  if (!path) return '';
  const { data } = supabase.storage.from('turnover-photos').getPublicUrl(path);
  return data.publicUrl;
};
