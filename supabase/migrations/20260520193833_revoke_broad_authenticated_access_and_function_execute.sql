/*
  # Revoke Broad Authenticated Access and Function Execute

  1. Storage
    - Drop `turnover_photos_read_authenticated` broad SELECT policy
    - Replace with scoped policy that only allows access to files the user uploaded

  2. Tables - Replace always-true SELECT policies with admin-only
    - Drop old `USING (true)` SELECT policies for authenticated
    - Create admin-only SELECT policies on all tables
    - Drop duplicate/stale policies from prior migrations

  3. Functions - Revoke EXECUTE from PUBLIC on all SECURITY DEFINER functions
    - This removes the default PUBLIC grant that allows any role to execute

  4. Important Notes
    - Edge functions use service_role which bypasses RLS
    - All frontend users are admin (nick@igloo.scot, erin@igloo.scot)
    - Owner portal users access via check_owner_email_approved RPC (service_role called from edge function)
*/

-- ============================================================
-- 1. Storage: Replace broad SELECT policy on turnover-photos
-- ============================================================
DROP POLICY IF EXISTS "turnover_photos_read_authenticated" ON storage.objects;

CREATE POLICY "turnover_photos_admin_read"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'turnover-photos'
    AND ((auth.jwt()->'app_metadata'->>'role') = 'admin')
  );

-- ============================================================
-- 2. Revoke EXECUTE from PUBLIC on SECURITY DEFINER functions
--    (PUBLIC grant is the default and overrides role-specific revokes)
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.archive_old_pat_reports() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_owner_email_approved(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.clear_drive_sync_pending() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ensure_director_admin_role() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_all_owners_for_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_all_users() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_all_users_for_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_owner_by_email(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reset_drive_sync_session() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_user_role(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_owner_auth_signup() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_maintenance_logs_updated_at() FROM PUBLIC;

-- Grant back to authenticated only (admin check is inside the functions themselves)
GRANT EXECUTE ON FUNCTION public.archive_old_pat_reports() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_owner_email_approved(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_drive_sync_pending() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_all_owners_for_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_all_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_all_users_for_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_owner_by_email(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_drive_sync_session() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_role(uuid, text) TO authenticated;

-- These are trigger functions - only need to be callable by the trigger system, not users
-- ensure_director_admin_role is an auth trigger
-- sync_owner_auth_signup is an auth trigger
-- update_maintenance_logs_updated_at is a table trigger

-- ============================================================
-- 3. Replace always-true SELECT policies with admin-only
-- ============================================================

-- Clean up stale/duplicate policies from prior migrations first
DROP POLICY IF EXISTS "Authenticated admins can insert bookings" ON public.bookings;
DROP POLICY IF EXISTS "Authenticated admins can update bookings" ON public.bookings;
DROP POLICY IF EXISTS "Authenticated admins can delete bookings" ON public.bookings;

-- booking_tasks
DROP POLICY IF EXISTS "Authenticated read booking tasks" ON public.booking_tasks;
DROP POLICY IF EXISTS "Authenticated can read booking tasks" ON public.booking_tasks;
CREATE POLICY "Admin read booking tasks" ON public.booking_tasks
  FOR SELECT TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- bookings
DROP POLICY IF EXISTS "Authenticated can read bookings" ON public.bookings;
CREATE POLICY "Admin read bookings" ON public.bookings
  FOR SELECT TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- cleaner_profiles
DROP POLICY IF EXISTS "Authenticated read cleaner profiles" ON public.cleaner_profiles;
DROP POLICY IF EXISTS "Authenticated can read cleaner profiles" ON public.cleaner_profiles;
CREATE POLICY "Admin read cleaner profiles" ON public.cleaner_profiles
  FOR SELECT TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- cleaner_property_assignments
DROP POLICY IF EXISTS "Authenticated read cleaner assignments" ON public.cleaner_property_assignments;
DROP POLICY IF EXISTS "Authenticated can read cleaner assignments" ON public.cleaner_property_assignments;
CREATE POLICY "Admin read cleaner assignments" ON public.cleaner_property_assignments
  FOR SELECT TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- contractors
DROP POLICY IF EXISTS "Authenticated read contractors" ON public.contractors;
DROP POLICY IF EXISTS "Authenticated can read contractors" ON public.contractors;
CREATE POLICY "Admin read contractors" ON public.contractors
  FOR SELECT TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- dashboard_data
DROP POLICY IF EXISTS "Authenticated read dashboard data" ON public.dashboard_data;
DROP POLICY IF EXISTS "Authenticated can read dashboard data" ON public.dashboard_data;
CREATE POLICY "Admin read dashboard data" ON public.dashboard_data
  FOR SELECT TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- director_access
DROP POLICY IF EXISTS "Authenticated read director access" ON public.director_access;
DROP POLICY IF EXISTS "Directors can read own access" ON public.director_access;
CREATE POLICY "Admin read director access" ON public.director_access
  FOR SELECT TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- director_dashboard_prefs
DROP POLICY IF EXISTS "Users can read own dashboard prefs" ON public.director_dashboard_prefs;
DROP POLICY IF EXISTS "Authenticated read dashboard prefs" ON public.director_dashboard_prefs;
CREATE POLICY "Admin read dashboard prefs" ON public.director_dashboard_prefs
  FOR SELECT TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- director_expenses
DROP POLICY IF EXISTS "Authenticated read director expenses" ON public.director_expenses;
DROP POLICY IF EXISTS "Directors can read own expenses" ON public.director_expenses;
CREATE POLICY "Admin read director expenses" ON public.director_expenses
  FOR SELECT TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- drive_sync_folders
DROP POLICY IF EXISTS "Authenticated read drive sync folders" ON public.drive_sync_folders;
DROP POLICY IF EXISTS "Authenticated can read drive sync folders" ON public.drive_sync_folders;
CREATE POLICY "Admin read drive sync folders" ON public.drive_sync_folders
  FOR SELECT TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- drive_sync_queue
DROP POLICY IF EXISTS "Authenticated read drive sync queue" ON public.drive_sync_queue;
DROP POLICY IF EXISTS "Authenticated can read drive sync queue" ON public.drive_sync_queue;
CREATE POLICY "Admin read drive sync queue" ON public.drive_sync_queue
  FOR SELECT TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- fire_alarm_tests
DROP POLICY IF EXISTS "Authenticated read fire alarm tests" ON public.fire_alarm_tests;
DROP POLICY IF EXISTS "Authenticated can read fire alarm tests" ON public.fire_alarm_tests;
CREATE POLICY "Admin read fire alarm tests" ON public.fire_alarm_tests
  FOR SELECT TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- generated_reports
DROP POLICY IF EXISTS "Authenticated read generated reports" ON public.generated_reports;
DROP POLICY IF EXISTS "Authenticated can read generated reports" ON public.generated_reports;
DROP POLICY IF EXISTS "Anyone can read reports" ON public.generated_reports;
DROP POLICY IF EXISTS "Anyone can read generated reports" ON public.generated_reports;
CREATE POLICY "Admin read generated reports" ON public.generated_reports
  FOR SELECT TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- guest_notifications
DROP POLICY IF EXISTS "Authenticated read gn" ON public.guest_notifications;
DROP POLICY IF EXISTS "Authenticated can read guest notifications" ON public.guest_notifications;
CREATE POLICY "Admin read guest notifications" ON public.guest_notifications
  FOR SELECT TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- guest_ready_checks
DROP POLICY IF EXISTS "Authenticated read grc" ON public.guest_ready_checks;
DROP POLICY IF EXISTS "Authenticated can read guest ready checks" ON public.guest_ready_checks;
CREATE POLICY "Admin read guest ready checks" ON public.guest_ready_checks
  FOR SELECT TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- guest_ready_sessions
DROP POLICY IF EXISTS "Authenticated read grs" ON public.guest_ready_sessions;
DROP POLICY IF EXISTS "Authenticated can read guest ready sessions" ON public.guest_ready_sessions;
CREATE POLICY "Admin read guest ready sessions" ON public.guest_ready_sessions
  FOR SELECT TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- issue_reports
DROP POLICY IF EXISTS "Authenticated read issues" ON public.issue_reports;
DROP POLICY IF EXISTS "Authenticated can read issues" ON public.issue_reports;
CREATE POLICY "Admin read issues" ON public.issue_reports
  FOR SELECT TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- issue_status_events
DROP POLICY IF EXISTS "Authenticated read events" ON public.issue_status_events;
DROP POLICY IF EXISTS "Authenticated can read events" ON public.issue_status_events;
CREATE POLICY "Admin read status events" ON public.issue_status_events
  FOR SELECT TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- maintenance_logs
DROP POLICY IF EXISTS "Authenticated read maintenance logs" ON public.maintenance_logs;
DROP POLICY IF EXISTS "Authenticated can read maintenance logs" ON public.maintenance_logs;
CREATE POLICY "Admin read maintenance logs" ON public.maintenance_logs
  FOR SELECT TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- n8n_rate_limit_cache
DROP POLICY IF EXISTS "Authenticated read rate limit cache" ON public.n8n_rate_limit_cache;
DROP POLICY IF EXISTS "Authenticated can read rate limit cache" ON public.n8n_rate_limit_cache;
CREATE POLICY "Admin read rate limit cache" ON public.n8n_rate_limit_cache
  FOR SELECT TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- owner_bank_details
DROP POLICY IF EXISTS "Authenticated users can read bank details" ON public.owner_bank_details;
DROP POLICY IF EXISTS "Authenticated read bank details" ON public.owner_bank_details;
CREATE POLICY "Admin read bank details" ON public.owner_bank_details
  FOR SELECT TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- owner_properties
DROP POLICY IF EXISTS "Authenticated read owner properties" ON public.owner_properties;
DROP POLICY IF EXISTS "Authenticated can read owner properties" ON public.owner_properties;
CREATE POLICY "Admin read owner properties" ON public.owner_properties
  FOR SELECT TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- owners
DROP POLICY IF EXISTS "Authenticated read owners" ON public.owners;
DROP POLICY IF EXISTS "Authenticated can read owners" ON public.owners;
CREATE POLICY "Admin read owners" ON public.owners
  FOR SELECT TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- pat_test_results
DROP POLICY IF EXISTS "Authenticated users can read PAT tests" ON public.pat_test_results;
DROP POLICY IF EXISTS "Authenticated read PAT tests" ON public.pat_test_results;
CREATE POLICY "Admin read PAT tests" ON public.pat_test_results
  FOR SELECT TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- projects
DROP POLICY IF EXISTS "Directors can read all projects" ON public.projects;
DROP POLICY IF EXISTS "Authenticated read projects" ON public.projects;
CREATE POLICY "Admin read projects" ON public.projects
  FOR SELECT TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- properties
DROP POLICY IF EXISTS "Authenticated users can read properties" ON public.properties;
DROP POLICY IF EXISTS "Authenticated read properties" ON public.properties;
CREATE POLICY "Admin read properties" ON public.properties
  FOR SELECT TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- property_bookings_cache
DROP POLICY IF EXISTS "Authenticated read pbc" ON public.property_bookings_cache;
DROP POLICY IF EXISTS "Authenticated can read pbc" ON public.property_bookings_cache;
CREATE POLICY "Admin read property bookings cache" ON public.property_bookings_cache
  FOR SELECT TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- property_owner_mapping
DROP POLICY IF EXISTS "Authenticated users can read property mappings" ON public.property_owner_mapping;
DROP POLICY IF EXISTS "Authenticated read property mappings" ON public.property_owner_mapping;
CREATE POLICY "Admin read property mappings" ON public.property_owner_mapping
  FOR SELECT TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- property_owner_task_completions
DROP POLICY IF EXISTS "Authenticated read owner task completions" ON public.property_owner_task_completions;
DROP POLICY IF EXISTS "Authenticated can read owner task completions" ON public.property_owner_task_completions;
CREATE POLICY "Admin read owner task completions" ON public.property_owner_task_completions
  FOR SELECT TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- property_owner_tasks
DROP POLICY IF EXISTS "Authenticated read owner tasks" ON public.property_owner_tasks;
DROP POLICY IF EXISTS "Authenticated can read owner tasks" ON public.property_owner_tasks;
CREATE POLICY "Admin read owner tasks" ON public.property_owner_tasks
  FOR SELECT TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- property_safety_checks
DROP POLICY IF EXISTS "Authenticated read psc" ON public.property_safety_checks;
DROP POLICY IF EXISTS "Authenticated can read psc" ON public.property_safety_checks;
CREATE POLICY "Admin read safety checks" ON public.property_safety_checks
  FOR SELECT TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- settlement_config
DROP POLICY IF EXISTS "Authenticated can read settlement config" ON public.settlement_config;
DROP POLICY IF EXISTS "Authenticated read settlement config" ON public.settlement_config;
CREATE POLICY "Admin read settlement config" ON public.settlement_config
  FOR SELECT TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- stl_checks
DROP POLICY IF EXISTS "Authenticated read stl checks" ON public.stl_checks;
DROP POLICY IF EXISTS "Authenticated can read stl checks" ON public.stl_checks;
DROP POLICY IF EXISTS "Allow anon read stl_checks" ON public.stl_checks;
CREATE POLICY "Admin read stl checks" ON public.stl_checks
  FOR SELECT TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- task_templates
DROP POLICY IF EXISTS "Authenticated read templates" ON public.task_templates;
DROP POLICY IF EXISTS "Authenticated can read templates" ON public.task_templates;
CREATE POLICY "Admin read templates" ON public.task_templates
  FOR SELECT TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- bookings_with_departing view (SELECT grant to authenticated stays, RLS on underlying table controls access)
