/*
  # Fix owner_bank_details schema and add property_owner_mapping table

  ## Summary
  The owner_bank_details table was created with owner_name instead of payee_name,
  and the property_owner_mapping table was missing entirely. This migration adds
  the correct columns and creates the mapping table.

  ## Changes
  1. owner_bank_details
     - Add `payee_name` (text) — the display name for the payee used in components
     - Add `payment_reference_prefix` (text) — e.g. "igloo" prefix for payment refs

  2. New Table: property_owner_mapping
     - `id` (uuid, primary key)
     - `property_name` (text) — matches KNOWN_PROPERTIES list
     - `owner_id` (uuid) — foreign key to owner_bank_details.id
     - `created_at` (timestamptz)

  ## Security
  - RLS enabled on property_owner_mapping
  - Admin-only policies (matching the pattern on owner_bank_details)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'owner_bank_details' AND column_name = 'payee_name'
  ) THEN
    ALTER TABLE owner_bank_details ADD COLUMN payee_name text NOT NULL DEFAULT '';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'owner_bank_details' AND column_name = 'payment_reference_prefix'
  ) THEN
    ALTER TABLE owner_bank_details ADD COLUMN payment_reference_prefix text NOT NULL DEFAULT 'igloo';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS property_owner_mapping (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_name text NOT NULL,
  owner_id uuid NOT NULL REFERENCES owner_bank_details(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_property_owner_mapping_property
  ON property_owner_mapping (property_name);

CREATE INDEX IF NOT EXISTS idx_property_owner_mapping_owner
  ON property_owner_mapping (owner_id);

ALTER TABLE property_owner_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can select property mappings"
  ON property_owner_mapping
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE users.id = (SELECT auth.uid())
        AND (
          (users.raw_app_meta_data ->> 'role') = 'admin'
          OR users.email = 'nick@igloo.scot'
        )
    )
  );

CREATE POLICY "Admin can insert property mappings"
  ON property_owner_mapping
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE users.id = (SELECT auth.uid())
        AND (
          (users.raw_app_meta_data ->> 'role') = 'admin'
          OR users.email = 'nick@igloo.scot'
        )
    )
  );

CREATE POLICY "Admin can delete property mappings"
  ON property_owner_mapping
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE users.id = (SELECT auth.uid())
        AND (
          (users.raw_app_meta_data ->> 'role') = 'admin'
          OR users.email = 'nick@igloo.scot'
        )
    )
  );
