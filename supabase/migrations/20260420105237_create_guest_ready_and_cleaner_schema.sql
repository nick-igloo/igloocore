/*
  # Guest Ready, Cleaner Profiles & Property Safety Checks

  ## Summary
  Creates schema for the Guest Ready mobile tool, cleaner user profiles
  with property assignments, and an extended property safety check system
  covering fire alarm, emergency light and legionella.

  ## New Tables
  1. `cleaner_profiles` - cleaner accounts linked to auth.users
  2. `cleaner_property_assignments` - which cleaner covers which property
  3. `property_safety_checks` - unified log of fire alarm / emergency light / legionella checks
  4. `guest_ready_sessions` - one session per turnover
  5. `guest_ready_checks` - individual checks within a session
  6. `guest_notifications` - audit trail of guest notifications
  7. `property_bookings_cache` - optional cache of recent bookings for last departure lookup

  ## Security
  - RLS enabled on all new tables
  - Authenticated users can access (admins + cleaners via their auth account)
  - Anon access also permitted for internal tools (matching existing pattern)
*/

-- 1. Cleaner profiles
CREATE TABLE IF NOT EXISTS cleaner_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  active boolean DEFAULT true,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cleaner_profiles_auth_user ON cleaner_profiles(auth_user_id);
ALTER TABLE cleaner_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read cleaner profiles" ON cleaner_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert cleaner profiles" ON cleaner_profiles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update cleaner profiles" ON cleaner_profiles FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete cleaner profiles" ON cleaner_profiles FOR DELETE TO authenticated USING (true);
CREATE POLICY "Anon read cleaner profiles" ON cleaner_profiles FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert cleaner profiles" ON cleaner_profiles FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update cleaner profiles" ON cleaner_profiles FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon delete cleaner profiles" ON cleaner_profiles FOR DELETE TO anon USING (true);

-- 2. Cleaner property assignments
CREATE TABLE IF NOT EXISTS cleaner_property_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cleaner_id uuid REFERENCES cleaner_profiles(id) ON DELETE CASCADE NOT NULL,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (cleaner_id, property_id)
);

CREATE INDEX IF NOT EXISTS idx_cleaner_assignments_cleaner ON cleaner_property_assignments(cleaner_id);
CREATE INDEX IF NOT EXISTS idx_cleaner_assignments_property ON cleaner_property_assignments(property_id);
ALTER TABLE cleaner_property_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read cleaner assignments" ON cleaner_property_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert cleaner assignments" ON cleaner_property_assignments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update cleaner assignments" ON cleaner_property_assignments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete cleaner assignments" ON cleaner_property_assignments FOR DELETE TO authenticated USING (true);
CREATE POLICY "Anon read cleaner assignments" ON cleaner_property_assignments FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert cleaner assignments" ON cleaner_property_assignments FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update cleaner assignments" ON cleaner_property_assignments FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon delete cleaner assignments" ON cleaner_property_assignments FOR DELETE TO anon USING (true);

-- 3. Property safety checks (fire alarm, emergency light, legionella)
CREATE TABLE IF NOT EXISTS property_safety_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES properties(id) ON DELETE SET NULL,
  property_name text NOT NULL DEFAULT '',
  check_type text NOT NULL CHECK (check_type IN ('fire_alarm', 'emergency_light', 'legionella')),
  performed_by_name text NOT NULL DEFAULT '',
  performed_by_user uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  performed_at timestamptz NOT NULL DEFAULT now(),
  result text NOT NULL DEFAULT 'pass' CHECK (result IN ('pass', 'fail', 'action_taken', 'no_action_required')),
  details jsonb DEFAULT '{}'::jsonb,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_psc_property ON property_safety_checks(property_id);
CREATE INDEX IF NOT EXISTS idx_psc_type_date ON property_safety_checks(check_type, performed_at DESC);
ALTER TABLE property_safety_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read psc" ON property_safety_checks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert psc" ON property_safety_checks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update psc" ON property_safety_checks FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete psc" ON property_safety_checks FOR DELETE TO authenticated USING (true);
CREATE POLICY "Anon read psc" ON property_safety_checks FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert psc" ON property_safety_checks FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update psc" ON property_safety_checks FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon delete psc" ON property_safety_checks FOR DELETE TO anon USING (true);

-- 4. Guest Ready sessions
CREATE TABLE IF NOT EXISTS guest_ready_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES properties(id) ON DELETE SET NULL,
  property_name text NOT NULL DEFAULT '',
  started_by_name text NOT NULL DEFAULT '',
  started_by_user uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  started_by_role text NOT NULL DEFAULT 'cleaner' CHECK (started_by_role IN ('cleaner','director','admin','other')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed','notified','cancelled')),
  last_guest_departure date,
  next_guest_arrival date,
  guest_name text DEFAULT '',
  guest_email text DEFAULT '',
  guest_phone text DEFAULT '',
  legionella_recommendation text DEFAULT '',
  legionella_action_taken text DEFAULT '',
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_grs_property ON guest_ready_sessions(property_id);
CREATE INDEX IF NOT EXISTS idx_grs_status ON guest_ready_sessions(status);
CREATE INDEX IF NOT EXISTS idx_grs_started ON guest_ready_sessions(started_at DESC);
ALTER TABLE guest_ready_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read grs" ON guest_ready_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert grs" ON guest_ready_sessions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update grs" ON guest_ready_sessions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete grs" ON guest_ready_sessions FOR DELETE TO authenticated USING (true);
CREATE POLICY "Anon read grs" ON guest_ready_sessions FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert grs" ON guest_ready_sessions FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update grs" ON guest_ready_sessions FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon delete grs" ON guest_ready_sessions FOR DELETE TO anon USING (true);

-- 5. Individual checks inside a session
CREATE TABLE IF NOT EXISTS guest_ready_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES guest_ready_sessions(id) ON DELETE CASCADE,
  check_type text NOT NULL CHECK (check_type IN ('fire_safety','legionella','welcome_pack','clean')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','passed','failed','skipped','action_taken','no_action_required')),
  details jsonb DEFAULT '{}'::jsonb,
  completed_by_name text DEFAULT '',
  completed_by_user uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at timestamptz,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  UNIQUE (session_id, check_type)
);

CREATE INDEX IF NOT EXISTS idx_grc_session ON guest_ready_checks(session_id);
ALTER TABLE guest_ready_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read grc" ON guest_ready_checks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert grc" ON guest_ready_checks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update grc" ON guest_ready_checks FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete grc" ON guest_ready_checks FOR DELETE TO authenticated USING (true);
CREATE POLICY "Anon read grc" ON guest_ready_checks FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert grc" ON guest_ready_checks FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update grc" ON guest_ready_checks FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon delete grc" ON guest_ready_checks FOR DELETE TO anon USING (true);

-- 6. Guest notifications log
CREATE TABLE IF NOT EXISTS guest_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES guest_ready_sessions(id) ON DELETE SET NULL,
  property_name text NOT NULL DEFAULT '',
  guest_name text DEFAULT '',
  channel text NOT NULL CHECK (channel IN ('email','sms','both')),
  recipient text NOT NULL DEFAULT '',
  subject text DEFAULT '',
  message text DEFAULT '',
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','failed','queued')),
  error_message text DEFAULT '',
  sent_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gn_session ON guest_notifications(session_id);
ALTER TABLE guest_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read gn" ON guest_notifications FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert gn" ON guest_notifications FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anon read gn" ON guest_notifications FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert gn" ON guest_notifications FOR INSERT TO anon WITH CHECK (true);

-- 7. Bookings cache (for last departure / next arrival lookup; populated by n8n or csv import)
CREATE TABLE IF NOT EXISTS property_bookings_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  property_name text NOT NULL DEFAULT '',
  guest_name text DEFAULT '',
  guest_email text DEFAULT '',
  guest_phone text DEFAULT '',
  check_in date,
  check_out date,
  source text DEFAULT 'csv',
  external_id text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pbc_property_dates ON property_bookings_cache(property_id, check_out DESC);
CREATE INDEX IF NOT EXISTS idx_pbc_name_dates ON property_bookings_cache(property_name, check_out DESC);
ALTER TABLE property_bookings_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read pbc" ON property_bookings_cache FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert pbc" ON property_bookings_cache FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update pbc" ON property_bookings_cache FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete pbc" ON property_bookings_cache FOR DELETE TO authenticated USING (true);
CREATE POLICY "Anon read pbc" ON property_bookings_cache FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert pbc" ON property_bookings_cache FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update pbc" ON property_bookings_cache FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon delete pbc" ON property_bookings_cache FOR DELETE TO anon USING (true);
