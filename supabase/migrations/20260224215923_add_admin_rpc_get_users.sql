/*
  # Admin RPC: get_all_users_for_admin

  Creates a server-side function that returns all auth users for admin use.
  This is needed because the admin UI needs to select which user to link to a property.
  Only authenticated users can call this function.
*/

CREATE OR REPLACE FUNCTION get_all_users_for_admin()
RETURNS TABLE (
  id uuid,
  email text,
  raw_app_meta_data jsonb,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id,
    u.email::text,
    u.raw_app_meta_data,
    u.created_at
  FROM auth.users u
  ORDER BY u.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_all_users_for_admin() TO authenticated;
