/*
  # Property owner tasks (Guest Ready config)

  1. Purpose
    - Allow per-property, recurring tasks that owners require (e.g. oil level
      reading, electricity reading, fault check). Tasks appear on the next
      Guest Ready turnover card once their recurrence has elapsed since the
      last completion; once performed, an optional notification is sent to
      the property's owner.

  2. New tables
    a) `property_owner_tasks`
       - id uuid pk
       - property_id uuid not null fk -> properties(id)
       - name text not null
       - instructions text default ''
       - recurrence_days integer not null default 30
       - requires_value boolean default false
       - value_label text default ''
       - notify_owner_email boolean default true
       - active boolean default true
       - created_at, updated_at timestamptz
    b) `property_owner_task_completions`
       - id uuid pk
       - task_id uuid not null fk -> property_owner_tasks(id) ON DELETE CASCADE
       - property_id uuid not null
       - session_id uuid null fk -> guest_ready_sessions(id) ON DELETE SET NULL
       - performed_by_name text default ''
       - performed_at timestamptz default now()
       - value text default ''
       - notes text default ''
       - owner_notified_at timestamptz null
       - created_at timestamptz default now()

  3. Security
    - RLS enabled on both tables.
    - Authenticated users can read all, insert, update. (This app uses
      authenticated role for staff and single-role auth.)
    - Anon can read completions (used by an owner portal page later if
      needed); cannot write.
*/

CREATE TABLE IF NOT EXISTS property_owner_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name text NOT NULL,
  instructions text DEFAULT '',
  recurrence_days integer NOT NULL DEFAULT 30,
  requires_value boolean DEFAULT false,
  value_label text DEFAULT '',
  notify_owner_email boolean DEFAULT true,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_property_owner_tasks_property
  ON property_owner_tasks(property_id) WHERE active = true;

CREATE TABLE IF NOT EXISTS property_owner_task_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES property_owner_tasks(id) ON DELETE CASCADE,
  property_id uuid NOT NULL,
  session_id uuid REFERENCES guest_ready_sessions(id) ON DELETE SET NULL,
  performed_by_name text DEFAULT '',
  performed_at timestamptz DEFAULT now(),
  value text DEFAULT '',
  notes text DEFAULT '',
  owner_notified_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_owner_task_completions_task_time
  ON property_owner_task_completions(task_id, performed_at DESC);

ALTER TABLE property_owner_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_owner_task_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read owner tasks"
  ON property_owner_tasks FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated insert owner tasks"
  ON property_owner_tasks FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated update owner tasks"
  ON property_owner_tasks FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated delete owner tasks"
  ON property_owner_tasks FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated read owner task completions"
  ON property_owner_task_completions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated insert owner task completions"
  ON property_owner_task_completions FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated update owner task completions"
  ON property_owner_task_completions FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
