/*
  # PAT Testing Schema

  1. New Tables
    - `pat_test_results`
      - `id` (uuid, primary key) - Unique identifier for each test result
      - `property_id` (uuid, foreign key) - Links to properties table
      - `property_name` (text) - Property name for easy reference
      - `test_date` (date) - Date the PAT test was performed
      - `asset_description` (text) - Description of the asset being tested
      - `location_in_property` (text) - Where the asset is located
      - `test_type` (text) - Type of test: 'Class 1', 'Class 2', 'Lead', 'Visual'
      - `result` (text) - Test result: 'pass' or 'fail'
      - `notes` (text, nullable) - Additional notes about the test
      - `photo_url` (text, nullable) - URL to uploaded photo
      - `tested_by` (text, nullable) - Name of person who performed test
      - `created_at` (timestamptz) - When the record was created
      - `created_by` (uuid, nullable) - User who created the record
      
  2. Storage
    - Create storage bucket for PAT test photos
    
  3. Security
    - Enable RLS on `pat_test_results` table
    - Add policies for authenticated users to manage PAT tests
    - Add storage policies for PAT test photos
*/

-- Create PAT test results table
CREATE TABLE IF NOT EXISTS pat_test_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  property_name text NOT NULL,
  test_date date NOT NULL DEFAULT CURRENT_DATE,
  asset_description text NOT NULL,
  location_in_property text NOT NULL,
  test_type text NOT NULL CHECK (test_type IN ('Class 1', 'Class 2', 'Lead', 'Visual')),
  result text NOT NULL CHECK (result IN ('pass', 'fail')) DEFAULT 'pass',
  notes text,
  photo_url text,
  tested_by text,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Enable RLS
ALTER TABLE pat_test_results ENABLE ROW LEVEL SECURITY;

-- Policies for authenticated users
CREATE POLICY "Authenticated users can view all PAT tests"
  ON pat_test_results FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert PAT tests"
  ON pat_test_results FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update PAT tests"
  ON pat_test_results FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete PAT tests"
  ON pat_test_results FOR DELETE
  TO authenticated
  USING (true);

-- Create storage bucket for PAT test photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('pat-test-photos', 'pat-test-photos', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Authenticated users can upload PAT test photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'pat-test-photos');

CREATE POLICY "Authenticated users can view PAT test photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'pat-test-photos');

CREATE POLICY "Authenticated users can update PAT test photos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'pat-test-photos')
  WITH CHECK (bucket_id = 'pat-test-photos');

CREATE POLICY "Authenticated users can delete PAT test photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'pat-test-photos');

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_pat_test_results_property_name ON pat_test_results(property_name);
CREATE INDEX IF NOT EXISTS idx_pat_test_results_test_date ON pat_test_results(test_date DESC);
CREATE INDEX IF NOT EXISTS idx_pat_test_results_property_id ON pat_test_results(property_id);