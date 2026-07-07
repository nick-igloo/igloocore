/*
  # Fix sync_owner_auth_signup trigger

  1. Issue
    - `sync_owner_auth_signup()` has no explicit search_path and references `owners` unqualified.
    - When the Supabase Auth service (GoTrue) inserts a new user the trigger may fail, returning
      the generic "Database error creating new user" message.
  2. Change
    - Recreate the function with `SET search_path = public, auth` and a schema-qualified update.
    - Wrap the update in an exception block so any unexpected issue does not block user creation.
  3. Security
    - Remains SECURITY DEFINER. Only touches `public.owners` to back-link auth user ids.
*/

CREATE OR REPLACE FUNCTION public.sync_owner_auth_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $function$
BEGIN
  BEGIN
    UPDATE public.owners
    SET auth_user_id = NEW.id
    WHERE LOWER(email) = LOWER(NEW.email)
      AND auth_user_id IS NULL;
  EXCEPTION WHEN OTHERS THEN
    -- never block auth user creation
    NULL;
  END;
  RETURN NEW;
END;
$function$;
