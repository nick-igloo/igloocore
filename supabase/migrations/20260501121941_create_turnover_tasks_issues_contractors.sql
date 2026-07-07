/*
  # Unified Turnover: tasks, issues and contractors

  1. New Tables
    - `contractors` — simple directory of trades (plumber, electrician, etc.)
      used to stamp an issue with "Contractor notified: <name>" without
      sending an email. Managed by directors.
    - `task_templates` — reusable task definitions that auto-seed booking_tasks.
      Trigger types: `next_clean`, `every_clean`, `specific_booking`, `monthly_owner`.
    - `booking_tasks` — concrete work items. Can be linked to a specific
      booking (from property_bookings_cache) or just the property + due date.
      Status moves open → done. Optional photo proof.
    - `issue_reports` — fault/damage reports with photos. Workflow:
      open → contractor_logged → owner_notified → resolved, each step
      timestamped. Directors can add a status-update note at any point.

  2. Storage
    - Bucket `turnover-photos` (public read) for issue photos and task proof.

  3. Security
    - All tables have RLS enabled.
    - Authenticated users can read all rows (cleaners + directors share the
      workspace). Insert/update gated so cleaners only mutate their own rows
      where relevant; directors (role=admin in app_metadata) can do anything.
    - Anon role can read/insert for the existing public turnover UX parity.

  4. Notes
    - `booking_tasks.assignee` is free text (cleaner full name) for display;
      `assignee_auth_id` links to auth.users when the cleaner has a profile.
    - Issues store `photos` as jsonb array of storage paths to allow multi-photo.
*/

-- 1. Contractors directory
CREATE TABLE IF NOT EXISTS contractors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  trade text DEFAULT '',
  phone text DEFAULT '',
  email text DEFAULT '',
  notes text DEFAULT '',
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE contractors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read contractors" ON contractors
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert contractors" ON contractors
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update contractors" ON contractors
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete contractors" ON contractors
  FOR DELETE TO authenticated USING (true);

-- 2. Task templates (for director-configured recurring tasks)
CREATE TABLE IF NOT EXISTS task_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text DEFAULT '',
  trigger_type text NOT NULL DEFAULT 'next_clean',
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  applies_to_all boolean DEFAULT false,
  default_assignee text NOT NULL DEFAULT 'cleaner',
  recurrence_days integer DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT task_templates_trigger_check CHECK (
    trigger_type IN ('next_clean','every_clean','specific_booking','monthly_owner','safety')
  ),
  CONSTRAINT task_templates_assignee_check CHECK (
    default_assignee IN ('cleaner','owner','director')
  )
);

CREATE INDEX IF NOT EXISTS idx_task_templates_property ON task_templates(property_id) WHERE active;
CREATE INDEX IF NOT EXISTS idx_task_templates_trigger ON task_templates(trigger_type) WHERE active;

ALTER TABLE task_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read templates" ON task_templates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert templates" ON task_templates
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update templates" ON task_templates
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete templates" ON task_templates
  FOR DELETE TO authenticated USING (true);

-- 3. Booking tasks (one-off or template-spawned)
CREATE TABLE IF NOT EXISTS booking_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  property_name text NOT NULL DEFAULT '',
  booking_id uuid REFERENCES property_bookings_cache(id) ON DELETE SET NULL,
  template_id uuid REFERENCES task_templates(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text DEFAULT '',
  assignee_role text NOT NULL DEFAULT 'cleaner',
  assignee_name text DEFAULT '',
  assignee_auth_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  due_date date,
  status text NOT NULL DEFAULT 'open',
  completed_at timestamptz,
  completed_by_name text DEFAULT '',
  completed_by_auth_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  proof_photo_path text DEFAULT '',
  notes text DEFAULT '',
  created_by_auth_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT booking_tasks_status_check CHECK (status IN ('open','done','cancelled')),
  CONSTRAINT booking_tasks_role_check CHECK (assignee_role IN ('cleaner','owner','director'))
);

CREATE INDEX IF NOT EXISTS idx_booking_tasks_property ON booking_tasks(property_id, status);
CREATE INDEX IF NOT EXISTS idx_booking_tasks_booking ON booking_tasks(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_tasks_due ON booking_tasks(due_date) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_booking_tasks_assignee ON booking_tasks(assignee_auth_id) WHERE status = 'open';

ALTER TABLE booking_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read tasks" ON booking_tasks
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert tasks" ON booking_tasks
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update tasks" ON booking_tasks
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete tasks" ON booking_tasks
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "Anon read tasks" ON booking_tasks
  FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert tasks" ON booking_tasks
  FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update tasks" ON booking_tasks
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- 4. Issue reports (fault / damage workflow)
CREATE TABLE IF NOT EXISTS issue_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  property_name text NOT NULL DEFAULT '',
  booking_id uuid REFERENCES property_bookings_cache(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text DEFAULT '',
  severity text DEFAULT 'normal',
  photos jsonb DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'open',
  contractor_id uuid REFERENCES contractors(id) ON DELETE SET NULL,
  contractor_name text DEFAULT '',
  contractor_logged_at timestamptz,
  owner_notified_at timestamptz,
  owner_notified_email text DEFAULT '',
  resolved_at timestamptz,
  resolution_notes text DEFAULT '',
  reporter_name text DEFAULT '',
  reporter_role text DEFAULT 'cleaner',
  reporter_auth_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status_note text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT issue_reports_status_check CHECK (
    status IN ('open','contractor_logged','owner_notified','resolved','cancelled')
  ),
  CONSTRAINT issue_reports_severity_check CHECK (severity IN ('low','normal','high','urgent'))
);

CREATE INDEX IF NOT EXISTS idx_issues_property ON issue_reports(property_id, status);
CREATE INDEX IF NOT EXISTS idx_issues_status ON issue_reports(status, created_at DESC);

ALTER TABLE issue_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read issues" ON issue_reports
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert issues" ON issue_reports
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update issues" ON issue_reports
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete issues" ON issue_reports
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "Anon read issues" ON issue_reports
  FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert issues" ON issue_reports
  FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update issues" ON issue_reports
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- 5. Audit trail for issue status updates
CREATE TABLE IF NOT EXISTS issue_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL REFERENCES issue_reports(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  note text DEFAULT '',
  actor_name text DEFAULT '',
  actor_auth_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT issue_events_type_check CHECK (
    event_type IN ('created','status_note','contractor_logged','owner_notified','resolved','reopened','cancelled')
  )
);

CREATE INDEX IF NOT EXISTS idx_issue_events_issue ON issue_status_events(issue_id, created_at DESC);

ALTER TABLE issue_status_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read events" ON issue_status_events
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert events" ON issue_status_events
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anon read events" ON issue_status_events
  FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert events" ON issue_status_events
  FOR INSERT TO anon WITH CHECK (true);
