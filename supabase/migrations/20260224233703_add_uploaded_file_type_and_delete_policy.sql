/*
  # Allow uploaded file type and add delete RLS policy for generated_reports

  1. Changes
    - Drops the existing file_type check constraint to allow 'uploaded' as a valid type
    - Adds a new check constraint that includes 'uploaded'
    - Adds DELETE RLS policies for reports

  2. Security
    - DELETE policy allows all users to delete reports (consistent with existing open SELECT policy)
*/

ALTER TABLE generated_reports
  DROP CONSTRAINT IF EXISTS generated_reports_file_type_check;

ALTER TABLE generated_reports
  ADD CONSTRAINT generated_reports_file_type_check
  CHECK (file_type = ANY (ARRAY['csv'::text, 'html'::text, 'cover_letter'::text, 'uploaded'::text]));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'generated_reports' AND policyname = 'Anyone can delete reports'
  ) THEN
    EXECUTE 'CREATE POLICY "Anyone can delete reports" ON generated_reports FOR DELETE USING (true)';
  END IF;
END $$;
