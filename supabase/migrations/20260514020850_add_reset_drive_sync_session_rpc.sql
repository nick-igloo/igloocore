/*
  # Add Reset Drive Sync Session RPC

  1. Changes
    - Creates `reset_drive_sync_session` function that deletes all non-filed queue items
    - Allows admins to start fresh without losing history of already-filed documents

  2. Security
    - Only callable by users with admin role in app_metadata
*/

CREATE OR REPLACE FUNCTION reset_drive_sync_session()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  IF (auth.jwt() -> 'app_metadata' ->> 'role') != 'admin' THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  DELETE FROM drive_sync_queue WHERE status != 'filed';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
