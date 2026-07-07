/*
  # Fix Admin Function Permissions

  1. Changes
    - Drop and recreate get_all_users function with proper permissions
    - Drop and recreate set_user_role function with proper permissions
    - Grant necessary permissions on auth schema
  
  2. Security
    - Functions remain admin-only
    - Use SECURITY DEFINER to execute with elevated privileges
*/

DROP FUNCTION IF EXISTS get_all_users();
DROP FUNCTION IF EXISTS set_user_role(uuid, text);

CREATE OR REPLACE FUNCTION get_all_users()
RETURNS TABLE (
  id uuid,
  email text,
  raw_app_meta_data jsonb,
  created_at timestamptz
) 
SECURITY DEFINER
SET search_path = auth, public
LANGUAGE plpgsql
AS $$
DECLARE
  calling_user_role text;
BEGIN
  SELECT au.raw_app_meta_data->>'role' INTO calling_user_role
  FROM auth.users au
  WHERE au.id = auth.uid();

  IF calling_user_role IS NULL OR calling_user_role != 'admin' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT 
    au.id,
    au.email,
    au.raw_app_meta_data,
    au.created_at
  FROM auth.users au
  ORDER BY au.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION set_user_role(
  target_user_id uuid,
  new_role text
)
RETURNS void
SECURITY DEFINER
SET search_path = auth, public
LANGUAGE plpgsql
AS $$
DECLARE
  calling_user_role text;
BEGIN
  SELECT au.raw_app_meta_data->>'role' INTO calling_user_role
  FROM auth.users au
  WHERE au.id = auth.uid();

  IF calling_user_role IS NULL OR calling_user_role != 'admin' THEN
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