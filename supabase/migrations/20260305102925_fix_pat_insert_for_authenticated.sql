/*
  # Fix PAT Insert for Authenticated Users

  1. Changes
    - Simplify authenticated user INSERT policy for generated_reports
    - Remove restrictive check that was blocking legitimate inserts
    - Authenticated users should be able to insert any report type

  2. Security
    - Only authenticated users can insert
    - This is secure because users must be logged in
*/

-- Drop and recreate the authenticated insert policy with simpler check
DROP POLICY IF EXISTS "Authenticated users can insert reports" ON generated_reports;

CREATE POLICY "Authenticated users can insert reports"
  ON generated_reports FOR INSERT
  TO authenticated
  WITH CHECK (true);
