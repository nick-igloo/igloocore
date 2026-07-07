/*
  # Add Safety Document Flag to Generated Reports

  ## Summary
  Adds a boolean flag to the generated_reports table to designate certain uploaded
  documents as "safety documents" for public licence compliance viewing.

  ## Changes

  ### Modified Tables
  - `generated_reports`
    - `is_safety_document` (boolean, DEFAULT false) — marks a document as publicly
      viewable on the safety documents compliance page

  ## Security
  - Adds a new RLS SELECT policy allowing unauthenticated (anon) users to read
    records where is_safety_document = true, so the public page can display them
    and generate signed download URLs server-side via the edge function or direct
    storage access.
  - All other existing policies remain unchanged.

  ## Notes
  1. Default is false — existing documents are unaffected and remain private.
  2. Only uploaded file_type documents are intended to use this flag, but no
     constraint is enforced at the DB level to allow flexibility.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'generated_reports' AND column_name = 'is_safety_document'
  ) THEN
    ALTER TABLE generated_reports ADD COLUMN is_safety_document boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DROP POLICY IF EXISTS "Public can view safety documents" ON generated_reports;

CREATE POLICY "Public can view safety documents"
  ON generated_reports
  FOR SELECT
  TO anon
  USING (is_safety_document = true);
