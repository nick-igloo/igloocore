/*
  # Fix PAT Report Insert for Authenticated Users

  1. Changes
    - Update the authenticated insert policy to explicitly allow PAT safety documents
    - This ensures both anonymous and authenticated users can insert PAT reports
    - Prevents any edge cases where the broad "true" policy might not work

  2. Security
    - Still restricts PAT inserts to proper safety document fields
    - Maintains all existing security constraints
*/

-- Drop the overly broad authenticated policy
DROP POLICY IF EXISTS "Authenticated users can insert reports" ON generated_reports;

-- Create a specific policy for authenticated users inserting PAT documents
CREATE POLICY "Authenticated users can insert PAT safety documents"
  ON generated_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_safety_document = true
    AND safety_document_type = 'pat'
    AND is_public = true
  );

-- Also allow authenticated users to insert other safety documents
CREATE POLICY "Authenticated users can insert other safety documents"
  ON generated_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_safety_document = true
    AND safety_document_type IN ('stl_licence', 'eicr', 'gas_safety', 'other')
  );

-- Allow authenticated users to insert regular reports (non-safety documents)
CREATE POLICY "Authenticated users can insert regular reports"
  ON generated_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_safety_document = false OR is_safety_document IS NULL
  );
