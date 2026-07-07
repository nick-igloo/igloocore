/*
  # Fix all director_access policies to use auth.jwt() instead of auth.users

  ## Problem
  The INSERT and DELETE policies on director_access table were querying auth.users directly,
  which the authenticated role cannot access, causing "permission denied for table users" errors.

  ## Changes
  - Drop existing INSERT policy "Admins can grant access"
  - Drop existing DELETE policy "Admins can revoke access"
  - Recreate both policies using auth.jwt() -> 'app_metadata' ->> 'role' instead of querying auth.users

  ## Security
  - Policies still restrict operations to admin users only
  - Uses JWT claims which are cryptographically signed and tamper-proof
*/

-- Drop existing policies that query auth.users
DROP POLICY IF EXISTS "Admins can grant access" ON public.director_access;
DROP POLICY IF EXISTS "Admins can revoke access" ON public.director_access;

-- Recreate INSERT policy using JWT claims
CREATE POLICY "Admins can grant access"
  ON public.director_access
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- Recreate DELETE policy using JWT claims
CREATE POLICY "Admins can revoke access"
  ON public.director_access
  FOR DELETE
  TO authenticated
  USING (
    (SELECT auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );
