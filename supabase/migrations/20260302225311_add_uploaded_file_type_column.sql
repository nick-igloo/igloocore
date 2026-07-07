/*
  # Add uploaded_file_type column

  1. Changes
    - Add `uploaded_file_type` column to `generated_reports` table
      - This column stores a custom description for safety documents
      - Used to display meaningful labels like "EICR", "Gas Safety Certificate", etc.
      - Nullable text field, defaults to empty string
      - Only relevant for uploaded safety documents

  2. Notes
    - This allows admins to add custom descriptions to safety documents
    - Makes the public safety page more user-friendly
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'generated_reports' AND column_name = 'uploaded_file_type'
  ) THEN
    ALTER TABLE generated_reports ADD COLUMN uploaded_file_type text DEFAULT '';
  END IF;
END $$;
