/*
  # Create STL Checks Table

  1. New Tables
    - `stl_checks`
      - `id` (uuid, primary key) - Unique identifier for each check
      - `checked_at` (timestamptz) - When the check was performed
      - `property_name` (text) - Name of the property being checked
      - `fire_checked_by` (text, nullable) - Person who performed fire safety check
      - `legionella_by` (text, nullable) - Person who performed legionella check
      - `unoccupied_status` (text, nullable) - Current occupancy status
      - `maintenance_notes` (text, nullable) - Additional maintenance notes
      - `source` (text) - Source of the check record (defaults to 'app')

  2. Indexes
    - `idx_stl_property_date` - Composite index on property_name and checked_at for efficient querying

  3. Security
    - Enable RLS on `stl_checks` table
    - Add policies for directors to manage all checks
    - Add policies for authenticated users to view checks
*/

CREATE TABLE IF NOT EXISTS public.stl_checks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  checked_at timestamptz NOT NULL,
  property_name text NOT NULL,
  fire_checked_by text NULL,
  legionella_by text NULL,
  unoccupied_status text NULL,
  maintenance_notes text NULL,
  source text NULL DEFAULT 'app'::text,
  CONSTRAINT stl_checks_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_stl_property_date 
  ON public.stl_checks USING btree (property_name, checked_at DESC);

ALTER TABLE public.stl_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Directors can manage all STL checks"
  ON public.stl_checks
  FOR ALL
  TO authenticated
  USING (
    (auth.jwt()->>'app_metadata')::jsonb->>'role' = 'director'
  )
  WITH CHECK (
    (auth.jwt()->>'app_metadata')::jsonb->>'role' = 'director'
  );

CREATE POLICY "Authenticated users can view STL checks"
  ON public.stl_checks
  FOR SELECT
  TO authenticated
  USING (true);