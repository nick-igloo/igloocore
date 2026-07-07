
/*
  # Fix director_access SELECT policy and get_all_users function

  ## Problems
  1. The director_access SELECT policy used `EXISTS (SELECT 1 FROM auth.users ...)`
     which the `authenticated` role cannot query directly, causing "permission denied for table users".
     Fix: use auth.jwt() to read the role claim instead.

  2. The get_all_users() function has search_path set to 'auth','public', which means
     auth.users.email is returned as varchar(255), not text, causing a type mismatch.
     Fix: cast email to text explicitly and pin search_path to public.

  ## Changes
  - Drop and recreate director_access SELECT policy using auth.jwt() instead of querying auth.users
  - Recreate get_all_users() with explicit email::text cast and search_path = public
*/

-- Fix director_access SELECT policy to avoid querying auth.users directly
DROP POLICY IF EXISTS "Users can view own or admin can view all access" ON public.director_access;

CREATE POLICY "Users can view own or admin can view all access"
  ON public.director_access
  FOR SELECT
  TO authenticated
  USING (
    user_id = (select auth.uid())
    OR (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- Fix get_all_users() to cast email explicitly and use a safe search_path
CREATE OR REPLACE FUNCTION public.get_all_users()
  RETURNS TABLE(id uuid, email text, raw_app_meta_data jsonb, created_at timestamp with time zone)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  calling_user_role text;
BEGIN
  SELECT (auth.jwt() -> 'app_metadata' ->> 'role') INTO calling_user_role;

  IF calling_user_role IS NULL OR calling_user_role != 'admin' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    au.id,
    au.email::text,
    au.raw_app_meta_data,
    au.created_at
  FROM auth.users au
  ORDER BY au.created_at DESC;
END;
$$;
