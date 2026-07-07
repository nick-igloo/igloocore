/*
  # Add subfolder path to drive sync queue

  1. Modified Tables
    - `drive_sync_queue`
      - `subfolder_path` (text) - Path of subfolder(s) the file was found in, typically a property name

  2. Important Notes
    - This enables recursive folder scanning where subfolder names act as property hints
    - The subfolder path is used by the AI classifier to improve property matching accuracy
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'drive_sync_queue' AND column_name = 'subfolder_path'
  ) THEN
    ALTER TABLE drive_sync_queue ADD COLUMN subfolder_path text;
  END IF;
END $$;
