/*
  # Add safety document type and fire alarm tests table

  ## Changes

  ### 1. Modified Tables
  - `generated_reports`: Adds `safety_document_type` column to categorise compliance documents
    - Values: 'stl_licence' | 'eicr' | 'pat' | 'gas_safety' | 'other' | null (null = not a typed safety doc)

  ### 2. New Tables
  - `fire_alarm_tests`
    - `id` (uuid, primary key)
    - `property_name` (text) — must match property names used elsewhere
    - `tested_at` (date) — date the test was carried out
    - `tested_by` (text) — name of person who performed the test
    - `result` (text) — 'pass' or 'fail'
    - `notes` (text, nullable) — any additional notes
    - `created_at` (timestamptz)

  ### 3. Security
  - RLS enabled on `fire_alarm_tests`
  - Public SELECT policy (same pattern as safety docs — these are compliance records)
  - Authenticated INSERT/UPDATE/DELETE for admin management

  ### 4. Dummy Data
  - Sample fire alarm test records for Eagles Nest and other example properties
*/

-- Add safety document type to generated_reports
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'generated_reports' AND column_name = 'safety_document_type'
  ) THEN
    ALTER TABLE generated_reports
      ADD COLUMN safety_document_type text CHECK (
        safety_document_type IN ('stl_licence', 'eicr', 'pat', 'gas_safety', 'other')
      );
  END IF;
END $$;

-- Create fire alarm tests table
CREATE TABLE IF NOT EXISTS fire_alarm_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_name text NOT NULL,
  tested_at date NOT NULL,
  tested_by text NOT NULL DEFAULT '',
  result text NOT NULL DEFAULT 'pass' CHECK (result IN ('pass', 'fail')),
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE fire_alarm_tests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view fire alarm tests"
  ON fire_alarm_tests
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert fire alarm tests"
  ON fire_alarm_tests
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update fire alarm tests"
  ON fire_alarm_tests
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete fire alarm tests"
  ON fire_alarm_tests
  FOR DELETE
  TO authenticated
  USING (true);

-- Dummy data
INSERT INTO fire_alarm_tests (property_name, tested_at, tested_by, result, notes) VALUES
  ('Eagles Nest', '2025-01-15', 'James Robertson', 'pass', 'All detectors functioning. Battery levels good.'),
  ('Eagles Nest', '2024-07-10', 'James Robertson', 'pass', 'Quarterly check. No issues found.'),
  ('Eagles Nest', '2024-01-20', 'Sarah Mitchell', 'pass', 'Annual inspection. Replaced one smoke detector battery.'),
  ('Eagles Nest', '2023-07-05', 'James Robertson', 'pass', NULL),
  ('Harbour View Cottage', '2025-02-01', 'Sarah Mitchell', 'pass', 'All systems operational.'),
  ('Harbour View Cottage', '2024-08-14', 'James Robertson', 'pass', NULL),
  ('Harbour View Cottage', '2024-02-20', 'Sarah Mitchell', 'fail', 'Detector in bedroom 2 not responding. Replaced unit.'),
  ('Harbour View Cottage', '2023-08-10', 'James Robertson', 'pass', NULL)
ON CONFLICT DO NOTHING;
