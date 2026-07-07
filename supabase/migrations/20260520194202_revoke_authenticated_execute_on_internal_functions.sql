/*
  # Revoke Authenticated Execute on Internal/Trigger Functions

  1. Functions
    - Revoke EXECUTE from authenticated on functions that are only used by:
      - Triggers (ensure_director_admin_role, sync_owner_auth_signup, update_maintenance_logs_updated_at)
      - Edge functions via service_role (archive_old_pat_reports, check_owner_email_approved, 
        clear_drive_sync_pending, get_owner_by_email, get_all_users_for_admin)
    - Keep EXECUTE for authenticated on functions called from frontend:
      - get_all_owners_for_admin, get_all_users, set_user_role, reset_drive_sync_session

  2. Tables - GraphQL Schema Visibility
    - The scanner flags tables as "visible in GraphQL schema" because authenticated has SELECT grant
    - This grant is REQUIRED for PostgREST/Supabase JS client to work with RLS policies
    - Revoking SELECT would break all frontend data access
    - The admin-only RLS policies already prevent non-admin users from reading any rows
    - Since all authenticated users in this app are admins (enforced by auth trigger), this is acceptable
    - No action taken on table grants (would break the app)

  3. Important Notes
    - PostgREST requires table-level SELECT grant for RLS policy evaluation to work
    - Schema visibility != data access (RLS still controls row-level access)
    - All auth users are admins (whitelist: nick@igloo.scot, erin@igloo.scot)
*/

-- ============================================================
-- Revoke EXECUTE from authenticated on trigger/internal functions
-- These are never called from the frontend
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.archive_old_pat_reports() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.check_owner_email_approved(text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.clear_drive_sync_pending() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_director_admin_role() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_all_users_for_admin() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_owner_by_email(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_owner_auth_signup() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_maintenance_logs_updated_at() FROM authenticated;

-- ============================================================
-- Keep EXECUTE for these (called from frontend by admin users):
-- get_all_owners_for_admin, get_all_users, set_user_role, reset_drive_sync_session
-- Already granted in previous migration, no action needed
-- ============================================================
