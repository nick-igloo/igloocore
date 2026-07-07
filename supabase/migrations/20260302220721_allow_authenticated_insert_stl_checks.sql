/*
  # Allow Authenticated Users to Insert STL Checks

  1. Changes
    - Add INSERT policy for authenticated users to insert STL check records
    - This allows admin users to import historical check data

  2. Security
    - Only authenticated users can insert records
    - All users can still only view checks (existing SELECT policy)
    - Directors can still manage all checks (existing policy)
*/

CREATE POLICY "Authenticated users can insert STL checks"
  ON public.stl_checks
  FOR INSERT
  TO authenticated
  WITH CHECK (true);
