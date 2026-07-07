/*
  # Fix all projects table policies to use auth.jwt() instead of auth.users

  ## Problem
  All four policies on the projects table were querying auth.users directly,
  which the authenticated role cannot access, causing "permission denied for table users" errors.

  ## Changes
  - Drop and recreate SELECT policy to use JWT claims
  - Drop and recreate INSERT policy to use JWT claims
  - Drop and recreate UPDATE policy to use JWT claims
  - Drop and recreate DELETE policy to use JWT claims

  ## Security
  - Policies still restrict admin operations to admin users only
  - Regular users can still view projects they have access to via director_access
  - Uses JWT claims which are cryptographically signed and tamper-proof
*/

-- Drop all existing projects policies
DROP POLICY IF EXISTS "Authenticated users can view active projects they have access t" ON public.projects;
DROP POLICY IF EXISTS "Admins can insert projects" ON public.projects;
DROP POLICY IF EXISTS "Admins can update projects" ON public.projects;
DROP POLICY IF EXISTS "Admins can delete projects" ON public.projects;

-- Recreate SELECT policy using JWT claims
CREATE POLICY "Users can view projects they have access to or admins see all"
  ON public.projects
  FOR SELECT
  TO authenticated
  USING (
    (is_active = true AND EXISTS (
      SELECT 1 FROM director_access
      WHERE director_access.project_id = projects.id
        AND director_access.user_id = (SELECT auth.uid())
    ))
    OR (SELECT auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- Recreate INSERT policy using JWT claims
CREATE POLICY "Admins can insert projects"
  ON public.projects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- Recreate UPDATE policy using JWT claims
CREATE POLICY "Admins can update projects"
  ON public.projects
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  )
  WITH CHECK (
    (SELECT auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- Recreate DELETE policy using JWT claims
CREATE POLICY "Admins can delete projects"
  ON public.projects
  FOR DELETE
  TO authenticated
  USING (
    (SELECT auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );
