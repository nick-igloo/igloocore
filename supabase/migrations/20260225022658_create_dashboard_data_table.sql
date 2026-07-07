/*
  # Create Dashboard Data Table

  ## Purpose
  Stores pre-computed dashboard statistics that can be updated by n8n scheduled
  workflows. This allows the admin dashboard to display fast-loading metrics
  without running expensive queries on every page load.

  ## New Tables
  - `dashboard_data`
    - `id` (uuid, primary key)
    - `metric_key` (text, unique) - identifies the metric (e.g. 'total_properties')
    - `metric_value` (numeric) - the numeric value of the metric
    - `metric_label` (text) - human-readable label
    - `metric_sublabel` (text, nullable) - secondary label or trend info
    - `updated_at` (timestamptz) - when this metric was last refreshed

  ## Security
  - RLS enabled
  - Admins (authenticated) can read all metrics
  - Service role can insert/update metrics (used by n8n and edge functions)
*/

CREATE TABLE IF NOT EXISTS dashboard_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_key text UNIQUE NOT NULL,
  metric_value numeric DEFAULT 0,
  metric_label text NOT NULL DEFAULT '',
  metric_sublabel text,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE dashboard_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read dashboard data"
  ON dashboard_data FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can insert dashboard data"
  ON dashboard_data FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update dashboard data"
  ON dashboard_data FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_dashboard_data_key ON dashboard_data (metric_key);

INSERT INTO dashboard_data (metric_key, metric_value, metric_label, metric_sublabel) VALUES
  ('total_properties', 0, 'Properties', 'active listings'),
  ('total_reports', 0, 'Reports Generated', 'all time'),
  ('total_owners', 0, 'Owner Accounts', 'with portal access'),
  ('safety_docs_expiring', 0, 'Docs Expiring Soon', 'within 30 days'),
  ('total_nights', 0, 'Total Nights', 'across all bookings'),
  ('reports_this_month', 0, 'Reports This Month', 'current period')
ON CONFLICT (metric_key) DO NOTHING;
