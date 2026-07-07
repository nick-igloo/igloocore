/*
  # PAT Report Public Display Management

  ## Overview
  This migration adds functionality to automatically manage which PAT test reports
  are publicly visible. Only the most recent PAT report for each property will be
  shown publicly, while older reports are automatically archived in the system.

  ## Changes

  ### 1. Modified Tables
  - `generated_reports`: Add `is_public` flag
    - Determines if a report should be displayed on the public-facing pages
    - Defaults to true for new reports
    - Older reports are automatically set to false when a newer one is uploaded

  ### 2. Functions
  - `archive_old_pat_reports()`: Automatically archives older PAT reports
    - Triggered when a new PAT report is inserted
    - Sets `is_public = false` for all older PAT reports of the same property
    - Keeps the most recent report as public

  ### 3. Triggers
  - Auto-archive trigger on `generated_reports` table

  ## Security
  - Public users can only view reports where `is_public = true`
  - Authenticated users can view all reports (archived and public)
  - This maintains compliance history while only showing current reports publicly
*/

-- Add is_public column to generated_reports
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'generated_reports' AND column_name = 'is_public'
  ) THEN
    ALTER TABLE generated_reports
      ADD COLUMN is_public boolean DEFAULT true;
  END IF;
END $$;

-- Set all existing PAT reports to public initially
UPDATE generated_reports
SET is_public = true
WHERE safety_document_type = 'pat' AND is_public IS NULL;

-- Function to archive old PAT reports when a new one is uploaded
CREATE OR REPLACE FUNCTION archive_old_pat_reports()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process if this is a PAT report
  IF NEW.safety_document_type = 'pat' AND NEW.is_public = true THEN
    -- Archive all older PAT reports for the same property
    UPDATE generated_reports
    SET is_public = false
    WHERE id != NEW.id
      AND property_name = NEW.property_name
      AND safety_document_type = 'pat'
      AND is_public = true;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-archive old PAT reports
DROP TRIGGER IF EXISTS archive_old_pat_reports_trigger ON generated_reports;
CREATE TRIGGER archive_old_pat_reports_trigger
  AFTER INSERT OR UPDATE ON generated_reports
  FOR EACH ROW
  EXECUTE FUNCTION archive_old_pat_reports();

-- Update RLS policies to respect is_public flag for anonymous users
DROP POLICY IF EXISTS "Anyone can view safety documents" ON generated_reports;
CREATE POLICY "Anyone can view public safety documents"
  ON generated_reports
  FOR SELECT
  TO anon
  USING (is_safety_document = true AND (is_public = true OR is_public IS NULL));

-- Authenticated users can still see all reports (including archived)
DROP POLICY IF EXISTS "Authenticated users can view all reports" ON generated_reports;
CREATE POLICY "Authenticated users can view all reports"
  ON generated_reports
  FOR SELECT
  TO authenticated
  USING (true);