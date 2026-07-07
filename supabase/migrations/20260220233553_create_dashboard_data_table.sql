/*
  # Create dashboard data table

  1. New Tables
    - `dashboard_data`
      - `id` (uuid, primary key)
      - `data` (jsonb) - stores the complete dashboard JSON payload
      - `updated_at` (timestamptz) - automatic timestamp for when data was last updated
      - `created_at` (timestamptz) - record creation time
  
  2. Security
    - Enable RLS on `dashboard_data` table
    - Add policy for anonymous read access (dashboard is read-only, public data)
  
  3. Notes
    - Single-row table pattern: only stores the latest dashboard state
    - n8n will upsert to a known ID to keep only current data
*/

-- Create the dashboard data table
CREATE TABLE IF NOT EXISTS dashboard_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data jsonb NOT NULL,
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE dashboard_data ENABLE ROW LEVEL SECURITY;

-- Allow anonymous read access (public dashboard data)
CREATE POLICY "Anyone can read dashboard data"
  ON dashboard_data
  FOR SELECT
  TO anon
  USING (true);

-- Allow authenticated users to insert/update (for n8n service role)
CREATE POLICY "Service can write dashboard data"
  ON dashboard_data
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create index on updated_at for quick latest record lookup
CREATE INDEX IF NOT EXISTS idx_dashboard_data_updated_at ON dashboard_data(updated_at DESC);

-- Insert a placeholder record with a fixed ID for single-row pattern
INSERT INTO dashboard_data (id, data, updated_at, created_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '{"revenue2026Total":{"ourCommission":0,"bookingValue":0},"salesPulse":{"last24h":{"count":0,"bookingValue":0,"ourCommission":0},"last7d":{"count":0,"bookingValue":0,"ourCommission":0},"last30d":{"count":0,"bookingValue":0,"ourCommission":0},"totalOccupancy":{"current":0,"pace":0,"status":"neutral"}},"performanceTable":[]}',
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;