/*
  # Fix projects RLS to recognise admins via app_metadata.role

  1. Changes
    - Drop existing projects policies that check `auth.jwt() ->> 'user_role'`
      (a key that is not present in Supabase JWTs).
    - Recreate them to check `auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'`
      which matches how the `admin` role is actually stored on users.
  2. Security
    - RLS remains enabled on `projects`.
    - Non-admin authenticated users continue to see only projects granted via
      `director_access`.
    - Admins regain the ability to SELECT/INSERT/UPDATE/DELETE all projects.
*/

DROP POLICY IF EXISTS "Users can view projects they have access to or admins see all" ON projects;
DROP POLICY IF EXISTS "Admins can insert projects" ON projects;
DROP POLICY IF EXISTS "Admins can update projects" ON projects;
DROP POLICY IF EXISTS "Admins can delete projects" ON projects;

CREATE POLICY "Users view accessible projects or admins see all"
  ON projects FOR SELECT
  TO authenticated
  USING (
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
    OR (id IN (
      SELECT director_access.project_id
      FROM director_access
      WHERE director_access.user_id = auth.uid()
    ))
  );

CREATE POLICY "Admins can insert projects"
  ON projects FOR INSERT
  TO authenticated
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Admins can update projects"
  ON projects FOR UPDATE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Admins can delete projects"
  ON projects FOR DELETE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
