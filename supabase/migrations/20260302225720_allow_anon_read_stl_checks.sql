/*
  # Allow anonymous users to view STL checks

  1. Changes
    - Add policy to allow anonymous (unauthenticated) users to view STL checks
    - This enables the public property safety pages to display fire alarm test records
    - Read-only access for public compliance verification

  2. Security
    - Only SELECT permission granted to anon role
    - No insert, update, or delete permissions for anonymous users
    - Data remains publicly viewable for transparency and compliance
*/

CREATE POLICY "Anyone can view STL checks"
  ON stl_checks
  FOR SELECT
  TO anon, authenticated
  USING (true);
