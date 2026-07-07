/*
  # Create Maintenance Logs Table

  1. New Tables
    - `maintenance_logs`
      - `id` (uuid, primary key) - Unique identifier for each log entry
      - `property_id` (uuid, foreign key) - Links to properties table
      - `task_description` (text) - Description of the maintenance task
      - `priority` (text) - Priority level: Low, Medium, High, Urgent
      - `status` (text) - Status: Pending, In Progress, Completed
      - `assigned_to` (text, optional) - Person/team assigned to the task
      - `scheduled_date` (date, optional) - When the task is scheduled
      - `completed_date` (date, optional) - When the task was completed
      - `notes` (text, optional) - Additional notes or details
      - `created_at` (timestamptz) - When the log was created
      - `created_by` (uuid, optional) - User who created the log
      - `updated_at` (timestamptz) - Last update timestamp

  2. Security
    - Enable RLS on `maintenance_logs` table
    - Add policy for authenticated users to read all logs
    - Add policy for authenticated users to insert logs
    - Add policy for authenticated users to update logs
    - Add policy for directors to delete logs

  3. Indexes
    - Index on property_id for faster lookups
    - Index on status for filtering
    - Index on scheduled_date for sorting
*/

CREATE TABLE IF NOT EXISTS maintenance_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  task_description text NOT NULL,
  priority text NOT NULL DEFAULT 'Medium',
  status text NOT NULL DEFAULT 'Pending',
  assigned_to text,
  scheduled_date date,
  completed_date date,
  notes text,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE maintenance_logs ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Authenticated users can view maintenance logs"
  ON maintenance_logs
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert maintenance logs"
  ON maintenance_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update maintenance logs"
  ON maintenance_logs
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Directors can delete maintenance logs"
  ON maintenance_logs
  FOR DELETE
  TO authenticated
  USING (
    (auth.jwt()->>'app_metadata')::jsonb->>'is_director' = 'true'
  );

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_maintenance_logs_property_id ON maintenance_logs(property_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_logs_status ON maintenance_logs(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_logs_scheduled_date ON maintenance_logs(scheduled_date);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_maintenance_logs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER maintenance_logs_updated_at
  BEFORE UPDATE ON maintenance_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_maintenance_logs_updated_at();