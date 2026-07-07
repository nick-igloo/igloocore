/*
  # Owner Portal Schema

  ## Overview
  Creates the tables needed for property owner self-service document access.

  ## New Tables

  ### `owner_properties`
  Links Supabase auth users to property names (as they appear in the CSV).
  - `id` - primary key
  - `user_id` - references auth.users (the property owner's login)
  - `property_name` - must match the property name in CSV data exactly
  - `display_name` - optional friendly name for the owner portal
  - `created_at`

  ### `generated_reports`
  Stores metadata about every report file that was generated and uploaded.
  - `id` - primary key
  - `property_name` - the property this report belongs to
  - `file_name` - filename as stored in Supabase Storage
  - `file_type` - 'csv', 'html', or 'cover_letter'
  - `storage_path` - full path in the storage bucket
  - `date_range_start` / `date_range_end` - the filter dates used when generating
  - `year_range` - display string e.g. "2024-2025"
  - `booking_count` - how many bookings are in this report
  - `total_nights`
  - `generated_by` - auth user id of whoever ran the generator
  - `created_at`

  ## Security
  - RLS enabled on both tables
  - Owners can only read their own property links
  - Owners can only read reports for their linked properties
  - Admin/director (authenticated via service role or app_metadata role) can insert/manage everything
*/

CREATE TABLE IF NOT EXISTS owner_properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_name text NOT NULL,
  display_name text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS owner_properties_user_property_idx ON owner_properties(user_id, property_name);

ALTER TABLE owner_properties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view their own property links"
  ON owner_properties FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS generated_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_name text NOT NULL,
  file_name text NOT NULL,
  file_type text NOT NULL CHECK (file_type IN ('csv', 'html', 'cover_letter')),
  storage_path text NOT NULL,
  date_range_start date,
  date_range_end date,
  year_range text DEFAULT '',
  booking_count integer DEFAULT 0,
  total_nights integer DEFAULT 0,
  generated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS generated_reports_property_idx ON generated_reports(property_name);
CREATE INDEX IF NOT EXISTS generated_reports_created_at_idx ON generated_reports(created_at DESC);

ALTER TABLE generated_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view reports for their properties"
  ON generated_reports FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM owner_properties
      WHERE owner_properties.user_id = auth.uid()
      AND owner_properties.property_name = generated_reports.property_name
    )
  );

CREATE POLICY "Authenticated users can insert reports"
  ON generated_reports FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Owners can view reports for their properties (anon read not allowed)"
  ON owner_properties FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
