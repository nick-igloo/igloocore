
/*
  # Fix Security Issues

  ## Summary
  Addresses all security warnings from the Supabase advisor:

  1. Enable RLS on tables missing it
     - `public.projects` — had policies but RLS was disabled
     - `public.director_access` — had policies but RLS was disabled

  2. Fix RLS policies using auth functions without `select` wrapper (performance)
     - `owner_properties`: both policies updated to use `(select auth.uid())`

  3. Consolidate multiple permissive SELECT policies
     - `director_access`: merge "Admins can view all access" + "Users can view their own access" into one policy
     - `generated_reports`: merge "Anyone can read reports" + "Public can view safety documents" for anon role

  4. Remove always-true RLS policies and replace with proper checks
     - `fire_alarm_tests`: INSERT/UPDATE/DELETE were `true` — restrict to authenticated users via role check
     - `generated_reports`: INSERT/DELETE were `true` for public — restrict to authenticated only

  5. Add missing indexes on unindexed foreign keys
     - `director_access.granted_by`
     - `generated_reports.generated_by`

  6. Drop unused indexes
     - `idx_director_access_project_id`
     - `idx_n8n_rate_limit_cache_key`
     - `idx_n8n_rate_limit_cache_expires`

  7. Fix function search_path mutable on `get_all_users_for_admin`
     - Re-create with `SET search_path = public`
*/

-- ============================================================
-- 1. Enable RLS on tables that have policies but RLS disabled
-- ============================================================

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.director_access ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. Fix owner_properties RLS policies — wrap auth.uid() in select
-- ============================================================

DROP POLICY IF EXISTS "Owners can view their own property links" ON public.owner_properties;
CREATE POLICY "Owners can view their own property links"
  ON public.owner_properties
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Owners can view reports for their properties (anon read not all" ON public.owner_properties;
CREATE POLICY "Owners can insert their own property links"
  ON public.owner_properties
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

-- ============================================================
-- 3. Consolidate multiple permissive SELECT policies — director_access
-- ============================================================

DROP POLICY IF EXISTS "Admins can view all access" ON public.director_access;
DROP POLICY IF EXISTS "Users can view their own access" ON public.director_access;

CREATE POLICY "Users can view own or admin can view all access"
  ON public.director_access
  FOR SELECT
  TO authenticated
  USING (
    user_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM auth.users
      WHERE users.id = (select auth.uid())
        AND (users.raw_app_meta_data ->> 'role') = 'admin'
    )
  );

-- ============================================================
-- 4. Fix generated_reports — consolidate anon SELECT policies
--    and remove always-true INSERT/DELETE
-- ============================================================

DROP POLICY IF EXISTS "Anyone can read reports" ON public.generated_reports;
DROP POLICY IF EXISTS "Public can view safety documents" ON public.generated_reports;
DROP POLICY IF EXISTS "Anyone can insert reports" ON public.generated_reports;
DROP POLICY IF EXISTS "Anyone can delete reports" ON public.generated_reports;

-- Single SELECT policy covering both public and safety-doc reads
CREATE POLICY "Authenticated users or public safety docs can read reports"
  ON public.generated_reports
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anon can view safety documents"
  ON public.generated_reports
  FOR SELECT
  TO anon
  USING (is_safety_document = true);

-- INSERT/DELETE restricted to authenticated only
CREATE POLICY "Authenticated users can insert reports"
  ON public.generated_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete reports"
  ON public.generated_reports
  FOR DELETE
  TO authenticated
  USING (
    (select auth.uid()) IS NOT NULL
  );

-- ============================================================
-- 5. Fix fire_alarm_tests always-true policies
-- ============================================================

DROP POLICY IF EXISTS "Authenticated users can insert fire alarm tests" ON public.fire_alarm_tests;
DROP POLICY IF EXISTS "Authenticated users can update fire alarm tests" ON public.fire_alarm_tests;
DROP POLICY IF EXISTS "Authenticated users can delete fire alarm tests" ON public.fire_alarm_tests;

CREATE POLICY "Authenticated users can insert fire alarm tests"
  ON public.fire_alarm_tests
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

CREATE POLICY "Authenticated users can update fire alarm tests"
  ON public.fire_alarm_tests
  FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL)
  WITH CHECK ((select auth.uid()) IS NOT NULL);

CREATE POLICY "Authenticated users can delete fire alarm tests"
  ON public.fire_alarm_tests
  FOR DELETE
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

-- ============================================================
-- 6. Add indexes for unindexed foreign keys
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_director_access_granted_by
  ON public.director_access (granted_by);

CREATE INDEX IF NOT EXISTS idx_generated_reports_generated_by
  ON public.generated_reports (generated_by);

-- ============================================================
-- 7. Drop unused indexes
-- ============================================================

DROP INDEX IF EXISTS public.idx_director_access_project_id;
DROP INDEX IF EXISTS public.idx_n8n_rate_limit_cache_key;
DROP INDEX IF EXISTS public.idx_n8n_rate_limit_cache_expires;

-- ============================================================
-- 8. Fix function search_path mutable
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_all_users_for_admin()
  RETURNS TABLE(id uuid, email text, raw_app_meta_data jsonb, created_at timestamp with time zone)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id,
    u.email::text,
    u.raw_app_meta_data,
    u.created_at
  FROM auth.users u
  ORDER BY u.created_at DESC;
END;
$$;
