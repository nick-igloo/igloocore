/*
  # Comprehensive Security Hardening

  1. View Security
    - Recreate `bookings_with_departing` as SECURITY INVOKER (removes SECURITY DEFINER)

  2. Function Search Path
    - Set immutable `search_path = public` on all SECURITY DEFINER functions missing it:
      - check_owner_email_approved
      - archive_old_pat_reports
      - get_owner_by_email
      - get_all_owners_for_admin
      - update_owners_updated_at

  3. Revoke EXECUTE from anon on SECURITY DEFINER functions
    - archive_old_pat_reports, check_owner_email_approved, clear_drive_sync_pending,
      ensure_director_admin_role, get_all_owners_for_admin, get_all_users,
      get_all_users_for_admin, get_owner_by_email, reset_drive_sync_session,
      set_user_role, sync_owner_auth_signup, update_maintenance_logs_updated_at

  4. RLS Policy Hardening
    - Replace always-true policies with admin role check:
      `(auth.jwt()->'app_metadata'->>'role') = 'admin'`
    - Remove anon write policies (insert/update/delete) from all tables
    - Tables affected: booking_tasks, bookings, cleaner_profiles, cleaner_property_assignments,
      contractors, guest_notifications, guest_ready_checks, guest_ready_sessions,
      issue_reports, issue_status_events, owner_bank_details, pat_test_results,
      properties, property_bookings_cache, property_owner_mapping,
      property_owner_task_completions, property_owner_tasks, property_safety_checks,
      settlement_config, task_templates

  5. Revoke anon SELECT from tables (edge functions use service_role which bypasses RLS)

  6. Storage - Drop broad turnover_photos_read SELECT policy (authenticated version already exists)

  7. Important Notes
    - Edge functions use service_role key which bypasses RLS entirely
    - All frontend access is authenticated (admin users)
    - The admin check uses app_metadata.role = 'admin'
*/

-- ============================================================
-- 1. Fix bookings_with_departing view (SECURITY INVOKER)
-- ============================================================
DROP VIEW IF EXISTS public.bookings_with_departing;

CREATE VIEW public.bookings_with_departing
WITH (security_invoker = true)
AS
SELECT
  id, booking_number, property_name, property_id,
  guest_name, guest_email, guest_phone,
  check_in, check_out, status, portal,
  adults, children, babies, nights, raw,
  created_at, updated_at,
  lag(check_out) OVER (PARTITION BY property_name ORDER BY check_in, check_out) AS previous_check_out,
  lag(guest_name) OVER (PARTITION BY property_name ORDER BY check_in, check_out) AS previous_guest_name,
  lag(booking_number) OVER (PARTITION BY property_name ORDER BY check_in, check_out) AS previous_booking_number
FROM public.bookings b
WHERE status IS NULL OR status = '' OR lower(status) NOT LIKE '%cancel%';

-- ============================================================
-- 2. Fix mutable search_path on functions
-- ============================================================
ALTER FUNCTION public.check_owner_email_approved(text, text) SET search_path = public;
ALTER FUNCTION public.archive_old_pat_reports() SET search_path = public;
ALTER FUNCTION public.get_owner_by_email(text) SET search_path = public;
ALTER FUNCTION public.get_all_owners_for_admin() SET search_path = public;
ALTER FUNCTION public.update_owners_updated_at() SET search_path = public;

-- ============================================================
-- 3. Revoke EXECUTE from anon on all SECURITY DEFINER functions
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.archive_old_pat_reports() FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_owner_email_approved(text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.clear_drive_sync_pending() FROM anon;
REVOKE EXECUTE ON FUNCTION public.ensure_director_admin_role() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_all_owners_for_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_all_users() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_all_users_for_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_owner_by_email(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reset_drive_sync_session() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_user_role(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_owner_auth_signup() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_maintenance_logs_updated_at() FROM anon;

-- ============================================================
-- 4. Revoke SELECT from anon on all public tables
-- ============================================================
REVOKE SELECT ON public.booking_tasks FROM anon;
REVOKE SELECT ON public.bookings FROM anon;
REVOKE SELECT ON public.cleaner_profiles FROM anon;
REVOKE SELECT ON public.cleaner_property_assignments FROM anon;
REVOKE SELECT ON public.contractors FROM anon;
REVOKE SELECT ON public.dashboard_data FROM anon;
REVOKE SELECT ON public.director_access FROM anon;
REVOKE SELECT ON public.director_dashboard_prefs FROM anon;
REVOKE SELECT ON public.director_expenses FROM anon;
REVOKE SELECT ON public.drive_sync_folders FROM anon;
REVOKE SELECT ON public.drive_sync_queue FROM anon;
REVOKE SELECT ON public.fire_alarm_tests FROM anon;
REVOKE SELECT ON public.generated_reports FROM anon;
REVOKE SELECT ON public.guest_notifications FROM anon;
REVOKE SELECT ON public.guest_ready_checks FROM anon;
REVOKE SELECT ON public.guest_ready_sessions FROM anon;
REVOKE SELECT ON public.issue_reports FROM anon;
REVOKE SELECT ON public.issue_status_events FROM anon;
REVOKE SELECT ON public.maintenance_logs FROM anon;
REVOKE SELECT ON public.n8n_rate_limit_cache FROM anon;
REVOKE SELECT ON public.owner_bank_details FROM anon;
REVOKE SELECT ON public.owner_properties FROM anon;
REVOKE SELECT ON public.owners FROM anon;
REVOKE SELECT ON public.pat_test_results FROM anon;
REVOKE SELECT ON public.projects FROM anon;
REVOKE SELECT ON public.properties FROM anon;
REVOKE SELECT ON public.property_bookings_cache FROM anon;
REVOKE SELECT ON public.property_owner_mapping FROM anon;
REVOKE SELECT ON public.property_owner_task_completions FROM anon;
REVOKE SELECT ON public.property_owner_tasks FROM anon;
REVOKE SELECT ON public.property_safety_checks FROM anon;
REVOKE SELECT ON public.settlement_config FROM anon;
REVOKE SELECT ON public.stl_checks FROM anon;
REVOKE SELECT ON public.task_templates FROM anon;

-- Also revoke INSERT/UPDATE/DELETE from anon where granted
REVOKE INSERT, UPDATE, DELETE ON public.booking_tasks FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.cleaner_profiles FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.cleaner_property_assignments FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.guest_notifications FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.guest_ready_checks FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.guest_ready_sessions FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.issue_reports FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.issue_status_events FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.owner_bank_details FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.property_bookings_cache FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.property_owner_mapping FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.property_safety_checks FROM anon;

-- Revoke view access from anon
REVOKE SELECT ON public.bookings_with_departing FROM anon;

-- ============================================================
-- 5. Drop always-true anon RLS policies
-- ============================================================

-- booking_tasks
DROP POLICY IF EXISTS "Anon insert tasks" ON public.booking_tasks;
DROP POLICY IF EXISTS "Anon update tasks" ON public.booking_tasks;

-- cleaner_profiles
DROP POLICY IF EXISTS "Anon delete cleaner profiles" ON public.cleaner_profiles;
DROP POLICY IF EXISTS "Anon insert cleaner profiles" ON public.cleaner_profiles;
DROP POLICY IF EXISTS "Anon update cleaner profiles" ON public.cleaner_profiles;

-- cleaner_property_assignments
DROP POLICY IF EXISTS "Anon delete cleaner assignments" ON public.cleaner_property_assignments;
DROP POLICY IF EXISTS "Anon insert cleaner assignments" ON public.cleaner_property_assignments;
DROP POLICY IF EXISTS "Anon update cleaner assignments" ON public.cleaner_property_assignments;

-- guest_notifications
DROP POLICY IF EXISTS "Anon insert gn" ON public.guest_notifications;

-- guest_ready_checks
DROP POLICY IF EXISTS "Anon delete grc" ON public.guest_ready_checks;
DROP POLICY IF EXISTS "Anon insert grc" ON public.guest_ready_checks;
DROP POLICY IF EXISTS "Anon update grc" ON public.guest_ready_checks;

-- guest_ready_sessions
DROP POLICY IF EXISTS "Anon delete grs" ON public.guest_ready_sessions;
DROP POLICY IF EXISTS "Anon insert grs" ON public.guest_ready_sessions;
DROP POLICY IF EXISTS "Anon update grs" ON public.guest_ready_sessions;

-- issue_reports
DROP POLICY IF EXISTS "Anon insert issues" ON public.issue_reports;
DROP POLICY IF EXISTS "Anon update issues" ON public.issue_reports;

-- issue_status_events
DROP POLICY IF EXISTS "Anon insert events" ON public.issue_status_events;

-- owner_bank_details
DROP POLICY IF EXISTS "Anonymous users can delete bank details" ON public.owner_bank_details;
DROP POLICY IF EXISTS "Anonymous users can insert bank details" ON public.owner_bank_details;
DROP POLICY IF EXISTS "Anonymous users can update bank details" ON public.owner_bank_details;

-- property_bookings_cache
DROP POLICY IF EXISTS "Anon delete pbc" ON public.property_bookings_cache;
DROP POLICY IF EXISTS "Anon insert pbc" ON public.property_bookings_cache;
DROP POLICY IF EXISTS "Anon update pbc" ON public.property_bookings_cache;

-- property_owner_mapping
DROP POLICY IF EXISTS "Anonymous users can delete property mappings" ON public.property_owner_mapping;
DROP POLICY IF EXISTS "Anonymous users can insert property mappings" ON public.property_owner_mapping;
DROP POLICY IF EXISTS "Anonymous users can update property mappings" ON public.property_owner_mapping;

-- property_safety_checks
DROP POLICY IF EXISTS "Anon delete psc" ON public.property_safety_checks;
DROP POLICY IF EXISTS "Anon insert psc" ON public.property_safety_checks;
DROP POLICY IF EXISTS "Anon update psc" ON public.property_safety_checks;

-- ============================================================
-- 6. Replace always-true authenticated policies with admin check
-- ============================================================

-- booking_tasks
DROP POLICY IF EXISTS "Authenticated delete tasks" ON public.booking_tasks;
DROP POLICY IF EXISTS "Authenticated insert tasks" ON public.booking_tasks;
DROP POLICY IF EXISTS "Authenticated update tasks" ON public.booking_tasks;

CREATE POLICY "Admin insert tasks" ON public.booking_tasks
  FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') = 'admin');

CREATE POLICY "Admin update tasks" ON public.booking_tasks
  FOR UPDATE TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin')
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') = 'admin');

CREATE POLICY "Admin delete tasks" ON public.booking_tasks
  FOR DELETE TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- bookings
DROP POLICY IF EXISTS "Authenticated can delete bookings" ON public.bookings;
DROP POLICY IF EXISTS "Authenticated can insert bookings" ON public.bookings;
DROP POLICY IF EXISTS "Authenticated can update bookings" ON public.bookings;

CREATE POLICY "Admin insert bookings" ON public.bookings
  FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') = 'admin');

CREATE POLICY "Admin update bookings" ON public.bookings
  FOR UPDATE TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin')
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') = 'admin');

CREATE POLICY "Admin delete bookings" ON public.bookings
  FOR DELETE TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- cleaner_profiles
DROP POLICY IF EXISTS "Authenticated delete cleaner profiles" ON public.cleaner_profiles;
DROP POLICY IF EXISTS "Authenticated insert cleaner profiles" ON public.cleaner_profiles;
DROP POLICY IF EXISTS "Authenticated update cleaner profiles" ON public.cleaner_profiles;

CREATE POLICY "Admin insert cleaner profiles" ON public.cleaner_profiles
  FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') = 'admin');

CREATE POLICY "Admin update cleaner profiles" ON public.cleaner_profiles
  FOR UPDATE TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin')
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') = 'admin');

CREATE POLICY "Admin delete cleaner profiles" ON public.cleaner_profiles
  FOR DELETE TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- cleaner_property_assignments
DROP POLICY IF EXISTS "Authenticated delete cleaner assignments" ON public.cleaner_property_assignments;
DROP POLICY IF EXISTS "Authenticated insert cleaner assignments" ON public.cleaner_property_assignments;
DROP POLICY IF EXISTS "Authenticated update cleaner assignments" ON public.cleaner_property_assignments;

CREATE POLICY "Admin insert cleaner assignments" ON public.cleaner_property_assignments
  FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') = 'admin');

CREATE POLICY "Admin update cleaner assignments" ON public.cleaner_property_assignments
  FOR UPDATE TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin')
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') = 'admin');

CREATE POLICY "Admin delete cleaner assignments" ON public.cleaner_property_assignments
  FOR DELETE TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- contractors
DROP POLICY IF EXISTS "Authenticated delete contractors" ON public.contractors;
DROP POLICY IF EXISTS "Authenticated insert contractors" ON public.contractors;
DROP POLICY IF EXISTS "Authenticated update contractors" ON public.contractors;

CREATE POLICY "Admin insert contractors" ON public.contractors
  FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') = 'admin');

CREATE POLICY "Admin update contractors" ON public.contractors
  FOR UPDATE TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin')
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') = 'admin');

CREATE POLICY "Admin delete contractors" ON public.contractors
  FOR DELETE TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- guest_notifications
DROP POLICY IF EXISTS "Authenticated insert gn" ON public.guest_notifications;

CREATE POLICY "Admin insert guest notifications" ON public.guest_notifications
  FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- guest_ready_checks
DROP POLICY IF EXISTS "Authenticated delete grc" ON public.guest_ready_checks;
DROP POLICY IF EXISTS "Authenticated insert grc" ON public.guest_ready_checks;
DROP POLICY IF EXISTS "Authenticated update grc" ON public.guest_ready_checks;

CREATE POLICY "Admin insert guest ready checks" ON public.guest_ready_checks
  FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') = 'admin');

CREATE POLICY "Admin update guest ready checks" ON public.guest_ready_checks
  FOR UPDATE TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin')
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') = 'admin');

CREATE POLICY "Admin delete guest ready checks" ON public.guest_ready_checks
  FOR DELETE TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- guest_ready_sessions
DROP POLICY IF EXISTS "Authenticated delete grs" ON public.guest_ready_sessions;
DROP POLICY IF EXISTS "Authenticated insert grs" ON public.guest_ready_sessions;
DROP POLICY IF EXISTS "Authenticated update grs" ON public.guest_ready_sessions;

CREATE POLICY "Admin insert guest ready sessions" ON public.guest_ready_sessions
  FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') = 'admin');

CREATE POLICY "Admin update guest ready sessions" ON public.guest_ready_sessions
  FOR UPDATE TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin')
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') = 'admin');

CREATE POLICY "Admin delete guest ready sessions" ON public.guest_ready_sessions
  FOR DELETE TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- issue_reports
DROP POLICY IF EXISTS "Authenticated delete issues" ON public.issue_reports;
DROP POLICY IF EXISTS "Authenticated insert issues" ON public.issue_reports;
DROP POLICY IF EXISTS "Authenticated update issues" ON public.issue_reports;

CREATE POLICY "Admin insert issues" ON public.issue_reports
  FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') = 'admin');

CREATE POLICY "Admin update issues" ON public.issue_reports
  FOR UPDATE TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin')
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') = 'admin');

CREATE POLICY "Admin delete issues" ON public.issue_reports
  FOR DELETE TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- issue_status_events
DROP POLICY IF EXISTS "Authenticated insert events" ON public.issue_status_events;

CREATE POLICY "Admin insert status events" ON public.issue_status_events
  FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- owner_bank_details
DROP POLICY IF EXISTS "Authenticated users can delete bank details" ON public.owner_bank_details;
DROP POLICY IF EXISTS "Authenticated users can insert bank details" ON public.owner_bank_details;
DROP POLICY IF EXISTS "Authenticated users can update bank details" ON public.owner_bank_details;

CREATE POLICY "Admin insert bank details" ON public.owner_bank_details
  FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') = 'admin');

CREATE POLICY "Admin update bank details" ON public.owner_bank_details
  FOR UPDATE TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin')
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') = 'admin');

CREATE POLICY "Admin delete bank details" ON public.owner_bank_details
  FOR DELETE TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- pat_test_results
DROP POLICY IF EXISTS "Authenticated users can delete PAT tests" ON public.pat_test_results;
DROP POLICY IF EXISTS "Authenticated users can insert PAT tests" ON public.pat_test_results;
DROP POLICY IF EXISTS "Authenticated users can update PAT tests" ON public.pat_test_results;

CREATE POLICY "Admin insert PAT tests" ON public.pat_test_results
  FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') = 'admin');

CREATE POLICY "Admin update PAT tests" ON public.pat_test_results
  FOR UPDATE TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin')
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') = 'admin');

CREATE POLICY "Admin delete PAT tests" ON public.pat_test_results
  FOR DELETE TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- properties
DROP POLICY IF EXISTS "Authenticated users can delete properties" ON public.properties;
DROP POLICY IF EXISTS "Authenticated users can insert properties" ON public.properties;
DROP POLICY IF EXISTS "Authenticated users can update properties" ON public.properties;

CREATE POLICY "Admin insert properties" ON public.properties
  FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') = 'admin');

CREATE POLICY "Admin update properties" ON public.properties
  FOR UPDATE TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin')
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') = 'admin');

CREATE POLICY "Admin delete properties" ON public.properties
  FOR DELETE TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- property_bookings_cache
DROP POLICY IF EXISTS "Authenticated delete pbc" ON public.property_bookings_cache;
DROP POLICY IF EXISTS "Authenticated insert pbc" ON public.property_bookings_cache;
DROP POLICY IF EXISTS "Authenticated update pbc" ON public.property_bookings_cache;

CREATE POLICY "Admin insert property bookings cache" ON public.property_bookings_cache
  FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') = 'admin');

CREATE POLICY "Admin update property bookings cache" ON public.property_bookings_cache
  FOR UPDATE TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin')
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') = 'admin');

CREATE POLICY "Admin delete property bookings cache" ON public.property_bookings_cache
  FOR DELETE TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- property_owner_mapping
DROP POLICY IF EXISTS "Authenticated users can delete property mappings" ON public.property_owner_mapping;
DROP POLICY IF EXISTS "Authenticated users can insert property mappings" ON public.property_owner_mapping;
DROP POLICY IF EXISTS "Authenticated users can update property mappings" ON public.property_owner_mapping;

CREATE POLICY "Admin insert property mappings" ON public.property_owner_mapping
  FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') = 'admin');

CREATE POLICY "Admin update property mappings" ON public.property_owner_mapping
  FOR UPDATE TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin')
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') = 'admin');

CREATE POLICY "Admin delete property mappings" ON public.property_owner_mapping
  FOR DELETE TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- property_owner_task_completions
DROP POLICY IF EXISTS "Authenticated insert owner task completions" ON public.property_owner_task_completions;
DROP POLICY IF EXISTS "Authenticated update owner task completions" ON public.property_owner_task_completions;

CREATE POLICY "Admin insert owner task completions" ON public.property_owner_task_completions
  FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') = 'admin');

CREATE POLICY "Admin update owner task completions" ON public.property_owner_task_completions
  FOR UPDATE TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin')
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- property_owner_tasks
DROP POLICY IF EXISTS "Authenticated delete owner tasks" ON public.property_owner_tasks;
DROP POLICY IF EXISTS "Authenticated insert owner tasks" ON public.property_owner_tasks;
DROP POLICY IF EXISTS "Authenticated update owner tasks" ON public.property_owner_tasks;

CREATE POLICY "Admin insert owner tasks" ON public.property_owner_tasks
  FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') = 'admin');

CREATE POLICY "Admin update owner tasks" ON public.property_owner_tasks
  FOR UPDATE TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin')
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') = 'admin');

CREATE POLICY "Admin delete owner tasks" ON public.property_owner_tasks
  FOR DELETE TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- property_safety_checks
DROP POLICY IF EXISTS "Authenticated delete psc" ON public.property_safety_checks;
DROP POLICY IF EXISTS "Authenticated insert psc" ON public.property_safety_checks;
DROP POLICY IF EXISTS "Authenticated update psc" ON public.property_safety_checks;

CREATE POLICY "Admin insert safety checks" ON public.property_safety_checks
  FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') = 'admin');

CREATE POLICY "Admin update safety checks" ON public.property_safety_checks
  FOR UPDATE TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin')
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') = 'admin');

CREATE POLICY "Admin delete safety checks" ON public.property_safety_checks
  FOR DELETE TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- settlement_config
DROP POLICY IF EXISTS "Authenticated can update settlement config" ON public.settlement_config;

CREATE POLICY "Admin update settlement config" ON public.settlement_config
  FOR UPDATE TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin')
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- task_templates
DROP POLICY IF EXISTS "Authenticated delete templates" ON public.task_templates;
DROP POLICY IF EXISTS "Authenticated insert templates" ON public.task_templates;
DROP POLICY IF EXISTS "Authenticated update templates" ON public.task_templates;

CREATE POLICY "Admin insert templates" ON public.task_templates
  FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') = 'admin');

CREATE POLICY "Admin update templates" ON public.task_templates
  FOR UPDATE TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin')
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') = 'admin');

CREATE POLICY "Admin delete templates" ON public.task_templates
  FOR DELETE TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- ============================================================
-- 7. Fix storage policy for turnover-photos bucket
--    Drop the broad public listing policy; authenticated version already exists
-- ============================================================
DROP POLICY IF EXISTS "turnover_photos_read" ON storage.objects;

-- Also restrict the anon insert policy on turnover-photos
DROP POLICY IF EXISTS "turnover_photos_insert_anon" ON storage.objects;

-- ============================================================
-- 8. Remove anon SELECT policies (now redundant with revoked grants)
-- ============================================================
DROP POLICY IF EXISTS "Anon can read bookings" ON public.bookings;
DROP POLICY IF EXISTS "Anon read booking tasks" ON public.booking_tasks;
DROP POLICY IF EXISTS "Anon read cleaner profiles" ON public.cleaner_profiles;
DROP POLICY IF EXISTS "Anon read cleaner assignments" ON public.cleaner_property_assignments;
DROP POLICY IF EXISTS "Anon read grc" ON public.guest_ready_checks;
DROP POLICY IF EXISTS "Anon read grs" ON public.guest_ready_sessions;
DROP POLICY IF EXISTS "Anon read gn" ON public.guest_notifications;
DROP POLICY IF EXISTS "Anon read issues" ON public.issue_reports;
DROP POLICY IF EXISTS "Anon read events" ON public.issue_status_events;
DROP POLICY IF EXISTS "Anon read pbc" ON public.property_bookings_cache;
DROP POLICY IF EXISTS "Anon read psc" ON public.property_safety_checks;
DROP POLICY IF EXISTS "Anonymous users can read bank details" ON public.owner_bank_details;
DROP POLICY IF EXISTS "Anonymous users can read property mappings" ON public.property_owner_mapping;
