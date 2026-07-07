/*
  # Create owner bank details schema

  ## Overview
  Securely stores owner bank payment details and maps them to properties.
  This data is written once and reused each month when generating bank payment files.

  ## New Tables

  ### `owner_bank_details`
  Stores each owner's bank account information.
  - `id` - UUID primary key
  - `payee_name` - Account holder name (as it appears on the bank account)
  - `sort_code` - 6-digit sort code, stored as plain digits (no dashes)
  - `account_number` - Bank account number, stored as text to preserve leading zeros
  - `account_type` - Personal or Business
  - `payment_reference_prefix` - Static part of payment reference (e.g. "igloo")
  - `created_at`, `updated_at`

  ### `property_owner_mapping`
  Maps each property name to an owner's bank details.
  - `id` - UUID primary key
  - `property_name` - Must match the property names used in settlement PDFs
  - `owner_id` - Foreign key to owner_bank_details
  - `created_at`

  ## Security
  - RLS enabled on both tables
  - All access restricted to authenticated users with admin JWT role
  - No public or anon access
  - Enforced via `auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'`
*/

CREATE TABLE IF NOT EXISTS owner_bank_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payee_name text NOT NULL,
  sort_code text NOT NULL,
  account_number text NOT NULL,
  account_type text NOT NULL DEFAULT 'Personal',
  payment_reference_prefix text NOT NULL DEFAULT 'igloo',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE owner_bank_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can select bank details"
  ON owner_bank_details FOR SELECT
  TO authenticated
  USING ((SELECT auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Admins can insert bank details"
  ON owner_bank_details FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Admins can update bank details"
  ON owner_bank_details FOR UPDATE
  TO authenticated
  USING ((SELECT auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((SELECT auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Admins can delete bank details"
  ON owner_bank_details FOR DELETE
  TO authenticated
  USING ((SELECT auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');


CREATE TABLE IF NOT EXISTS property_owner_mapping (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_name text NOT NULL UNIQUE,
  owner_id uuid NOT NULL REFERENCES owner_bank_details(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE property_owner_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can select property mappings"
  ON property_owner_mapping FOR SELECT
  TO authenticated
  USING ((SELECT auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Admins can insert property mappings"
  ON property_owner_mapping FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Admins can update property mappings"
  ON property_owner_mapping FOR UPDATE
  TO authenticated
  USING ((SELECT auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((SELECT auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Admins can delete property mappings"
  ON property_owner_mapping FOR DELETE
  TO authenticated
  USING ((SELECT auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
