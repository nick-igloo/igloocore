/*
  # Google Drive Sync Schema

  1. New Tables
    - `drive_sync_folders`
      - `id` (uuid, primary key)
      - `folder_id` (text) - Google Drive folder ID
      - `folder_name` (text) - Display name for the folder
      - `last_synced_at` (timestamptz) - Last successful scan time
      - `created_by` (uuid) - User who added the folder
      - `created_at` (timestamptz)
    - `drive_sync_queue`
      - `id` (uuid, primary key)
      - `folder_id` (uuid FK) - Links to drive_sync_folders
      - `drive_file_id` (text) - Google Drive file ID
      - `file_name` (text) - Original filename from Drive
      - `mime_type` (text) - File MIME type
      - `status` (text) - pending | processing | matched | needs_review | error
      - `matched_property_id` (uuid FK) - Matched property
      - `matched_property_name` (text) - Matched property name
      - `detected_doc_type` (text) - Detected safety_document_type
      - `detected_expiry_date` (date) - Extracted expiry date
      - `confidence_score` (numeric) - AI confidence (0-1)
      - `error_message` (text) - Error details if failed
      - `storage_path` (text) - Path after successful filing
      - `processed_at` (timestamptz) - When processing completed
      - `created_at` (timestamptz)

  2. Security
    - RLS enabled on both tables
    - Only authenticated users with admin role can access
*/

-- Drive sync folders table
CREATE TABLE IF NOT EXISTS drive_sync_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id text NOT NULL,
  folder_name text NOT NULL DEFAULT '',
  last_synced_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE drive_sync_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage drive sync folders"
  ON drive_sync_folders
  FOR ALL
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  )
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- Drive sync processing queue
CREATE TABLE IF NOT EXISTS drive_sync_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id uuid REFERENCES drive_sync_folders(id) ON DELETE CASCADE,
  drive_file_id text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL DEFAULT 'application/octet-stream',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'matched', 'needs_review', 'filed', 'error')),
  matched_property_id uuid REFERENCES properties(id),
  matched_property_name text,
  detected_doc_type text CHECK (detected_doc_type IN ('stl_licence', 'eicr', 'pat', 'gas_safety', 'fire_risk_assessment', 'insurance', 'inventory', 'other', NULL)),
  detected_expiry_date date,
  confidence_score numeric(3,2) DEFAULT 0,
  error_message text,
  storage_path text,
  processed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE drive_sync_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage drive sync queue"
  ON drive_sync_queue
  FOR ALL
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  )
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_drive_sync_queue_status ON drive_sync_queue(status);
CREATE INDEX IF NOT EXISTS idx_drive_sync_queue_folder ON drive_sync_queue(folder_id);
CREATE INDEX IF NOT EXISTS idx_drive_sync_queue_drive_file ON drive_sync_queue(drive_file_id);
