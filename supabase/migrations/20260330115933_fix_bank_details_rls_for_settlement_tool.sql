/*
  # Fix Bank Details RLS for Settlement Converter Tool

  ## Changes
  - Drop existing admin-only policies for owner_bank_details table
  - Add new policies that allow authenticated users to manage bank details
  - This allows the Settlement Converter tool to save bank details without admin role

  ## Security Notes
  - Authenticated users can manage all bank details (appropriate for internal tool)
  - Anonymous users still cannot access bank details
*/

-- Drop existing admin-only policies
DROP POLICY IF EXISTS "Admins can select bank details" ON owner_bank_details;
DROP POLICY IF EXISTS "Admins can insert bank details" ON owner_bank_details;
DROP POLICY IF EXISTS "Admins can update bank details" ON owner_bank_details;
DROP POLICY IF EXISTS "Admins can delete bank details" ON owner_bank_details;

-- Create new policies for authenticated users
CREATE POLICY "Authenticated users can select bank details"
  ON owner_bank_details FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert bank details"
  ON owner_bank_details FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update bank details"
  ON owner_bank_details FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete bank details"
  ON owner_bank_details FOR DELETE
  TO authenticated
  USING (true);
