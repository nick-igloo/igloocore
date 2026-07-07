/*
  # Allow Anonymous PAT Report Uploads
  
  1. Changes
    - Add policy to allow anonymous users to insert PAT safety documents into generated_reports
    - This enables the PAT Testing Tool to save reports without authentication
  
  2. Security
    - Only allows inserts where is_safety_document = true AND safety_document_type = 'pat'
    - Only allows setting is_public = true (enforced via WITH CHECK)
    - Prevents anonymous users from creating non-safety documents
*/

-- Drop policy if it exists
DROP POLICY IF EXISTS "Anonymous users can insert PAT safety documents" ON generated_reports;

-- Allow anonymous users to insert PAT reports only
CREATE POLICY "Anonymous users can insert PAT safety documents"
  ON generated_reports
  FOR INSERT
  TO anon
  WITH CHECK (
    is_safety_document = true 
    AND safety_document_type = 'pat'
    AND is_public = true
  );
