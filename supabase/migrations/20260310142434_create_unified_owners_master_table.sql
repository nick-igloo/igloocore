/*
  # Create Unified Owners Master Table

  1. New Tables
    - `owners` - Master list of all property owners
      - `id` (uuid, primary key)
      - `email` (text, unique, not null) - Primary identifier
      - `full_name` (text) - Owner's full name
      - `company_name` (text) - Optional company name
      - `phone` (text) - Contact phone
      - `approved_for_dac7` (boolean) - Can access DAC7 reports
      - `approved_for_portal` (boolean) - Can access owner portal
      - `auth_user_id` (uuid, nullable) - Link to auth.users if signed up
      - `notes` (text) - Admin notes about this owner
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
  
  2. Changes
    - Add `owner_id` foreign key to `owner_properties` table
    - Keep existing structure but link to new owners table
    - Add function to sync auth.users with owners table
  
  3. Security
    - Enable RLS on `owners` table
    - Directors can read and manage all owners
    - Authenticated users can only read their own owner record
    - Create helper function for DAC7 to validate emails
  
  4. Important Notes
    - This creates a single source of truth for owner access
    - DAC7 project can call `check_owner_email_approved` RPC
    - Admin manages all owner approvals in one place
    - Owner portal checks same table for access
*/

-- Create owners master table
CREATE TABLE IF NOT EXISTS owners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  full_name text,
  company_name text,
  phone text,
  approved_for_dac7 boolean DEFAULT false,
  approved_for_portal boolean DEFAULT false,
  auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add owner_id to owner_properties if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'owner_properties' AND column_name = 'owner_id'
  ) THEN
    ALTER TABLE owner_properties ADD COLUMN owner_id uuid REFERENCES owners(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_owners_email ON owners(email);
CREATE INDEX IF NOT EXISTS idx_owners_auth_user_id ON owners(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_owner_properties_owner_id ON owner_properties(owner_id);

-- Enable RLS
ALTER TABLE owners ENABLE ROW LEVEL SECURITY;

-- Directors can manage all owners
CREATE POLICY "Directors can read all owners"
  ON owners
  FOR SELECT
  TO authenticated
  USING (
    (auth.jwt()->>'app_metadata')::jsonb->>'role' = 'director'
  );

CREATE POLICY "Directors can insert owners"
  ON owners
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt()->>'app_metadata')::jsonb->>'role' = 'director'
  );

CREATE POLICY "Directors can update all owners"
  ON owners
  FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt()->>'app_metadata')::jsonb->>'role' = 'director'
  )
  WITH CHECK (
    (auth.jwt()->>'app_metadata')::jsonb->>'role' = 'director'
  );

CREATE POLICY "Directors can delete owners"
  ON owners
  FOR DELETE
  TO authenticated
  USING (
    (auth.jwt()->>'app_metadata')::jsonb->>'role' = 'director'
  );

-- Owners can read their own record
CREATE POLICY "Owners can read own record"
  ON owners
  FOR SELECT
  TO authenticated
  USING (auth_user_id = auth.uid());

-- Function for DAC7 to check if email is approved
CREATE OR REPLACE FUNCTION check_owner_email_approved(
  check_email text,
  check_type text DEFAULT 'dac7'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF check_type = 'dac7' THEN
    RETURN EXISTS (
      SELECT 1 FROM owners
      WHERE LOWER(email) = LOWER(check_email)
      AND approved_for_dac7 = true
    );
  ELSIF check_type = 'portal' THEN
    RETURN EXISTS (
      SELECT 1 FROM owners
      WHERE LOWER(email) = LOWER(check_email)
      AND approved_for_portal = true
    );
  ELSE
    RETURN false;
  END IF;
END;
$$;

-- Function to get owner by email (for DAC7 integration)
CREATE OR REPLACE FUNCTION get_owner_by_email(check_email text)
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  company_name text,
  approved_for_dac7 boolean,
  approved_for_portal boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT o.id, o.email, o.full_name, o.company_name, o.approved_for_dac7, o.approved_for_portal
  FROM owners o
  WHERE LOWER(o.email) = LOWER(check_email);
END;
$$;

-- Function to sync auth.users with owners table when they sign up
CREATE OR REPLACE FUNCTION sync_owner_auth_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if this email exists in owners table
  UPDATE owners
  SET auth_user_id = NEW.id
  WHERE LOWER(email) = LOWER(NEW.email)
  AND auth_user_id IS NULL;
  
  RETURN NEW;
END;
$$;

-- Create trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created_sync_owner ON auth.users;
CREATE TRIGGER on_auth_user_created_sync_owner
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION sync_owner_auth_signup();

-- Function for admins to get all owners with their auth status
CREATE OR REPLACE FUNCTION get_all_owners_for_admin()
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  company_name text,
  phone text,
  approved_for_dac7 boolean,
  approved_for_portal boolean,
  auth_user_id uuid,
  has_account boolean,
  property_count bigint,
  notes text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only directors can call this
  IF (auth.jwt()->>'app_metadata')::jsonb->>'role' != 'director' THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT 
    o.id,
    o.email,
    o.full_name,
    o.company_name,
    o.phone,
    o.approved_for_dac7,
    o.approved_for_portal,
    o.auth_user_id,
    (o.auth_user_id IS NOT NULL) as has_account,
    COUNT(op.id) as property_count,
    o.notes,
    o.created_at,
    o.updated_at
  FROM owners o
  LEFT JOIN owner_properties op ON o.id = op.owner_id
  GROUP BY o.id
  ORDER BY o.created_at DESC;
END;
$$;

-- Updated trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_owners_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS owners_updated_at ON owners;
CREATE TRIGGER owners_updated_at
  BEFORE UPDATE ON owners
  FOR EACH ROW
  EXECUTE FUNCTION update_owners_updated_at();
