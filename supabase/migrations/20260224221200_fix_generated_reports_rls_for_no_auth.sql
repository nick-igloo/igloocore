/*
  # Fix generated_reports RLS for unauthenticated access

  The app does not use authentication, so the existing RLS policies
  block all reads and writes because auth.uid() is always null.

  Changes:
  - Drop the restrictive INSERT policy and replace with one that allows
    any request (authenticated or not) to insert reports
  - Drop the restrictive SELECT policies and replace with one that allows
    any request to read all reports
  - Storage bucket policies remain unchanged
*/

DROP POLICY IF EXISTS "Authenticated users can insert reports" ON generated_reports;
DROP POLICY IF EXISTS "Authenticated users can read all reports for admin" ON generated_reports;
DROP POLICY IF EXISTS "Owners can view reports for their properties" ON generated_reports;

CREATE POLICY "Anyone can insert reports"
  ON generated_reports
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can read reports"
  ON generated_reports
  FOR SELECT
  USING (true);
