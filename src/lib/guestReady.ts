import { supabase } from './supabase';

export type CheckType = 'fire_safety' | 'legionella' | 'welcome_pack' | 'clean';
export type SafetyCheckType = 'fire_alarm' | 'emergency_light' | 'legionella';

export interface CleanerProfile {
  id: string;
  auth_user_id: string | null;
  full_name: string;
  email: string;
  phone: string;
  active: boolean;
  notes: string;
}

export interface BookingCacheRow {
  id: string;
  property_id: string | null;
  property_name: string;
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  check_in: string;
  check_out: string;
}

export interface LegionellaAction {
  level: 'none' | 'taps' | 'tanks';
  label: string;
  description: string;
  daysUnoccupied: number;
}

export const computeLegionellaAction = (
  lastDeparture: string | null | undefined,
  nextArrival: string | null | undefined
): LegionellaAction => {
  if (!lastDeparture) {
    return {
      level: 'none',
      label: 'Unknown',
      description: 'No last departure on record — please select the most appropriate action.',
      daysUnoccupied: 0,
    };
  }

  const departure = new Date(lastDeparture);
  const today = new Date();
  const days = Math.max(0, Math.floor((today.getTime() - departure.getTime()) / (1000 * 60 * 60 * 24)));
  void nextArrival;

  if (days < 7) {
    return {
      level: 'none',
      label: 'A few days — no action required',
      description: 'Property was unoccupied for less than a week. No legionella action needed.',
      daysUnoccupied: days,
    };
  }

  if (days < 14) {
    return {
      level: 'taps',
      label: 'About a week — run taps for at least 2 minutes',
      description: 'Run all taps and showers for at least two minutes to flush the system.',
      daysUnoccupied: days,
    };
  }

  return {
    level: 'tanks',
    label: 'Two weeks or more — run tanks until empty',
    description: 'Run the tanks until they are empty, then refill and flush all outlets.',
    daysUnoccupied: days,
  };
};

export const getRecentBookingForProperty = async (
  propertyId: string | null,
  propertyName: string
): Promise<{ lastDeparture: BookingCacheRow | null; nextArrival: BookingCacheRow | null }> => {
  const today = new Date().toISOString().split('T')[0];

  let query = supabase
    .from('bookings')
    .select('id, property_id, property_name, guest_name, guest_email, guest_phone, check_in, check_out, status');
  if (propertyId) {
    query = query.eq('property_id', propertyId);
  } else {
    query = query.ilike('property_name', propertyName);
  }

  const { data } = await query.order('check_out', { ascending: false }).limit(50);
  const rows = ((data || []) as (BookingCacheRow & { status?: string })[]).filter(
    (r) => !r.status || !String(r.status).toLowerCase().includes('cancel')
  );

  const lastDeparture = rows.find((r) => r.check_out <= today) ?? null;
  const nextArrival = [...rows].reverse().find((r) => r.check_in >= today) ?? null;

  return { lastDeparture, nextArrival };
};

export const createGuestReadySession = async (params: {
  propertyId: string | null;
  propertyName: string;
  performerName: string;
  performerRole: 'cleaner' | 'director' | 'admin' | 'other';
  performerUser?: string | null;
  lastDeparture?: string | null;
  nextArrival?: string | null;
  guestName?: string;
  guestEmail?: string;
  guestPhone?: string;
}) => {
  const { data, error } = await supabase
    .from('guest_ready_sessions')
    .insert({
      property_id: params.propertyId,
      property_name: params.propertyName,
      started_by_name: params.performerName,
      started_by_role: params.performerRole,
      started_by_user: params.performerUser ?? null,
      last_guest_departure: params.lastDeparture ?? null,
      next_guest_arrival: params.nextArrival ?? null,
      guest_name: params.guestName ?? '',
      guest_email: params.guestEmail ?? '',
      guest_phone: params.guestPhone ?? '',
    })
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
};

export const upsertCheck = async (params: {
  sessionId: string;
  checkType: CheckType;
  status: string;
  details?: Record<string, unknown>;
  completedByName?: string;
  notes?: string;
}) => {
  const { error } = await supabase.from('guest_ready_checks').upsert(
    {
      session_id: params.sessionId,
      check_type: params.checkType,
      status: params.status,
      details: params.details ?? {},
      completed_by_name: params.completedByName ?? '',
      completed_at: new Date().toISOString(),
      notes: params.notes ?? '',
    },
    { onConflict: 'session_id,check_type' }
  );
  if (error) throw error;
};

export const logSafetyCheck = async (params: {
  propertyId: string | null;
  propertyName: string;
  checkType: SafetyCheckType;
  performedByName: string;
  result: string;
  details?: Record<string, unknown>;
  notes?: string;
}) => {
  const { error } = await supabase.from('property_safety_checks').insert({
    property_id: params.propertyId,
    property_name: params.propertyName,
    check_type: params.checkType,
    performed_by_name: params.performedByName,
    result: params.result,
    details: params.details ?? {},
    notes: params.notes ?? '',
  });
  if (error) throw error;
};

export const logFireAlarmTest = async (params: {
  propertyId: string | null;
  propertyName: string;
  testedBy: string;
  result: 'pass' | 'fail';
  notes?: string;
}) => {
  const { error } = await supabase.from('fire_alarm_tests').insert({
    property_id: params.propertyId,
    property_name: params.propertyName,
    tested_at: new Date().toISOString().split('T')[0],
    tested_by: params.testedBy,
    result: params.result,
    notes: params.notes ?? '',
  });
  if (error) throw error;
};

export const logSTLCheck = async (params: {
  propertyName: string;
  fireCheckedBy?: string | null;
  legionellaBy?: string | null;
  unoccupiedStatus?: string | null;
  notes?: string | null;
}) => {
  const { error } = await supabase.from('stl_checks').insert({
    checked_at: new Date().toISOString(),
    property_name: params.propertyName,
    fire_checked_by: params.fireCheckedBy ?? null,
    legionella_by: params.legionellaBy ?? null,
    unoccupied_status: params.unoccupiedStatus ?? null,
    maintenance_notes: params.notes ?? '',
    source: 'guest_ready',
  });
  if (error) throw error;
};

export const completeSession = async (sessionId: string, legionellaRecommendation: string, legionellaActionTaken: string, notes: string) => {
  const { error } = await supabase
    .from('guest_ready_sessions')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      legionella_recommendation: legionellaRecommendation,
      legionella_action_taken: legionellaActionTaken,
      notes,
    })
    .eq('id', sessionId);
  if (error) throw error;
};

export const notifyGuest = async (params: {
  sessionId: string;
  propertyName: string;
  guestName?: string;
  guestEmail?: string;
  guestPhone?: string;
  channel: 'email' | 'sms' | 'both';
}) => {
  const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notify-guest`;
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      session_id: params.sessionId,
      property_name: params.propertyName,
      guest_name: params.guestName ?? '',
      guest_email: params.guestEmail ?? '',
      guest_phone: params.guestPhone ?? '',
      channel: params.channel,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Notification failed');
  return data;
};

export interface OwnerTask {
  id: string;
  property_id: string;
  name: string;
  instructions: string;
  recurrence_days: number;
  requires_value: boolean;
  value_label: string;
  notify_owner_email: boolean;
  active: boolean;
}

export interface DueOwnerTask extends OwnerTask {
  last_performed_at: string | null;
  days_since_last: number | null;
}

export const fetchDueOwnerTasks = async (propertyIds: string[]): Promise<Map<string, DueOwnerTask[]>> => {
  const result = new Map<string, DueOwnerTask[]>();
  if (propertyIds.length === 0) return result;

  const { data: tasks, error: tasksErr } = await supabase
    .from('property_owner_tasks')
    .select('*')
    .in('property_id', propertyIds)
    .eq('active', true);
  if (tasksErr) throw tasksErr;
  if (!tasks || tasks.length === 0) return result;

  const taskIds = tasks.map(t => t.id);
  const { data: completions, error: compErr } = await supabase
    .from('property_owner_task_completions')
    .select('task_id, performed_at')
    .in('task_id', taskIds)
    .order('performed_at', { ascending: false });
  if (compErr) throw compErr;

  const lastByTask = new Map<string, string>();
  (completions ?? []).forEach(c => {
    if (!lastByTask.has(c.task_id)) lastByTask.set(c.task_id, c.performed_at);
  });

  const now = Date.now();
  tasks.forEach(t => {
    const last = lastByTask.get(t.id) ?? null;
    const days = last ? Math.floor((now - new Date(last).getTime()) / (1000 * 60 * 60 * 24)) : null;
    const due = last === null || (days ?? 0) >= t.recurrence_days;
    if (!due) return;
    const arr = result.get(t.property_id) ?? [];
    arr.push({ ...t, last_performed_at: last, days_since_last: days });
    result.set(t.property_id, arr);
  });

  return result;
};

export const completeOwnerTask = async (params: {
  task: OwnerTask;
  sessionId: string | null;
  performerName: string;
  value?: string;
  notes?: string;
}): Promise<{ completionId: string }> => {
  const { data, error } = await supabase
    .from('property_owner_task_completions')
    .insert({
      task_id: params.task.id,
      property_id: params.task.property_id,
      session_id: params.sessionId,
      performed_by_name: params.performerName,
      value: params.value ?? '',
      notes: params.notes ?? '',
    })
    .select('id')
    .single();
  if (error) throw error;

  if (params.task.notify_owner_email) {
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notify-owner-task`;
      await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ completion_id: data.id }),
      });
    } catch {
      // best-effort notify; do not block completion on email failure
    }
  }

  return { completionId: data.id };
};

export const listOwnerTasks = async (propertyId: string): Promise<OwnerTask[]> => {
  const { data, error } = await supabase
    .from('property_owner_tasks')
    .select('*')
    .eq('property_id', propertyId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
};

export const upsertOwnerTask = async (task: Partial<OwnerTask> & { property_id: string; name: string; recurrence_days: number }): Promise<OwnerTask> => {
  const payload = {
    property_id: task.property_id,
    name: task.name,
    instructions: task.instructions ?? '',
    recurrence_days: task.recurrence_days,
    requires_value: task.requires_value ?? false,
    value_label: task.value_label ?? '',
    notify_owner_email: task.notify_owner_email ?? true,
    active: task.active ?? true,
    updated_at: new Date().toISOString(),
  };
  if (task.id) {
    const { data, error } = await supabase
      .from('property_owner_tasks')
      .update(payload)
      .eq('id', task.id)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase
    .from('property_owner_tasks')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data;
};

export const deleteOwnerTask = async (id: string): Promise<void> => {
  const { error } = await supabase.from('property_owner_tasks').delete().eq('id', id);
  if (error) throw error;
};
