/*
  # Allow Authenticated Users to Manage Properties

  1. Changes
    - Drop existing restrictive admin-only policies for INSERT, UPDATE, DELETE
    - Add new policies allowing any authenticated user to manage properties
  
  2. Security
    - Any logged-in user can now add, edit, and delete properties
    - Read access remains available to all authenticated users
*/

-- Drop existing admin-only policies
DROP POLICY IF EXISTS "Admins can insert properties" ON properties;
DROP POLICY IF EXISTS "Admins can update properties" ON properties;
DROP POLICY IF EXISTS "Admins can delete properties" ON properties;

-- Create new policies for authenticated users
CREATE POLICY "Authenticated users can insert properties"
  ON properties
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update properties"
  ON properties
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete properties"
  ON properties
  FOR DELETE
  TO authenticated
  USING (true);
