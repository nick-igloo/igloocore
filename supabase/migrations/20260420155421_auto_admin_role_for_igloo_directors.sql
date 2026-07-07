/*
  # Auto-grant admin role to named Igloo directors

  1. Purpose
    - When nick@igloo.scot or erin@igloo.scot creates an auth account (e.g. via
      magic-link sign-in), stamp `raw_app_meta_data.role = 'admin'` automatically
      so they are immediately recognised as admins by RLS and the app UI.

  2. Mechanism
    - SECURITY DEFINER trigger function on `auth.users` that runs AFTER INSERT
      or UPDATE OF email. If the user's email matches the allowlist, it merges
      `{"role":"admin"}` into raw_app_meta_data without clobbering other keys.

  3. Safety
    - Affects only the two whitelisted emails. Existing rows for those two
      emails (if any) are also backfilled below.
*/

CREATE OR REPLACE FUNCTION public.ensure_director_admin_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  lower_email text := lower(coalesce(NEW.email, ''));
BEGIN
  IF lower_email IN ('nick@igloo.scot', 'erin@igloo.scot') THEN
    UPDATE auth.users
       SET raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                               || jsonb_build_object('role', 'admin')
     WHERE id = NEW.id
       AND coalesce(raw_app_meta_data->>'role', '') <> 'admin';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_director_admin_role_trigger ON auth.users;

CREATE TRIGGER ensure_director_admin_role_trigger
AFTER INSERT OR UPDATE OF email ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.ensure_director_admin_role();

UPDATE auth.users
   SET raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                           || jsonb_build_object('role', 'admin')
 WHERE lower(email) IN ('nick@igloo.scot', 'erin@igloo.scot')
   AND coalesce(raw_app_meta_data->>'role', '') <> 'admin';
