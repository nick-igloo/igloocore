/*
  # Add data JSONB column to dashboard_data

  ## Changes
  - Adds a `data` jsonb column to `dashboard_data` to store the full executive
    dashboard payload as a single structured JSON blob
  - Inserts a placeholder row with metric_key = 'executive_dashboard' that
    the update-dashboard edge function will upsert into

  ## Notes
  - Existing flat metric rows are unaffected (their `data` column will be null)
  - The executive dashboard row is identified by metric_key = 'executive_dashboard'
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dashboard_data' AND column_name = 'data'
  ) THEN
    ALTER TABLE dashboard_data ADD COLUMN data jsonb;
  END IF;
END $$;

INSERT INTO dashboard_data (metric_key, metric_value, metric_label, data)
VALUES ('executive_dashboard', 0, 'Executive Dashboard', NULL)
ON CONFLICT (metric_key) DO NOTHING;
