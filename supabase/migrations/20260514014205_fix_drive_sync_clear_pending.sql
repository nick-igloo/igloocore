/*
  # Fix Drive Sync Clear Pending

  1. Changes
    - Creates an RPC function `clear_drive_sync_pending` that deletes all pending items
    - Function runs with SECURITY DEFINER so it bypasses RLS
    - Only callable by authenticated users with admin role in app_metadata

  2. Security
    - Function checks caller has admin role before executing
    - Returns count of deleted rows for confirmation
*/

CREATE OR REPLACE FUNCTION clear_drive_sync_pending()
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

  DELETE FROM drive_sync_queue WHERE status = 'pending';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
