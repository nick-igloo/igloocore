/*
  # Add expiry_date to generated_reports

  1. Changes
    - `generated_reports` table: add optional `expiry_date` (date) column
      - Stores the expiry/renewal date for compliance documents
      - NULL means no expiry date set
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'generated_reports' AND column_name = 'expiry_date'
  ) THEN
    ALTER TABLE generated_reports ADD COLUMN expiry_date date DEFAULT NULL;
  END IF;
END $$;
