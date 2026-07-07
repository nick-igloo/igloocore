/*
  # Add Admin Functions

  1. Functions
    - `get_all_users` - Returns all users from auth.users (admin only)
    - `set_user_role` - Updates user role in raw_app_meta_data (admin only)
  
  2. Security
    - Both functions require the caller to be authenticated
    - Both functions check that the caller has admin role
    - Functions can only be called by admins
*/

CREATE OR REPLACE FUNCTION get_all_users()
RETURNS TABLE (
  id uuid,
  email text,
  raw_app_meta_data jsonb,
  created_at timestamptz
) 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth.users 
    WHERE auth.users.id = auth.uid() 
    AND auth.users.raw_app_meta_data->>'role' = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT 
    auth.users.id,
    auth.users.email,
    auth.users.raw_app_meta_data,
    auth.users.created_at
  FROM auth.users
  ORDER BY auth.users.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION set_user_role(
  target_user_id uuid,
  new_role text
)
RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth.users 
    WHERE auth.users.id = auth.uid() 
    AND auth.users.raw_app_meta_data->>'role' = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF new_role IS NULL THEN
    UPDATE auth.users
    SET raw_app_meta_data = raw_app_meta_data - 'role'
    WHERE id = target_user_id;
  ELSE
    UPDATE auth.users
    SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', new_role)
    WHERE id = target_user_id;
  END IF;
END;
$$;