/*
  # Create Properties Master Table

  ## Summary
  Establishes a single source of truth for all properties. Previously, property names
  were stored as raw text strings in multiple tables with no normalization, causing
  fragile name-matching bugs. This migration creates a canonical `properties` table
  that all other tables will reference by ID.

  ## New Tables

  ### `properties`
  - `id` (UUID, PK) — canonical property identifier
  - `name` (text, UNIQUE) — canonical display name e.g. "The Bellhouse"
  - `notes` (text, optional) — internal notes
  - `active` (boolean) — whether property is currently managed
  - `created_at`, `updated_at`

  ## Backfill
  Seeds the properties table from the existing KNOWN_PROPERTIES list used across
  the codebase, plus any property names already in the database (owner_properties,
  generated_reports, property_owner_mapping, fire_alarm_tests).

  ## Security
  - RLS enabled
  - Authenticated users can read all properties (needed by settlement converter, owner portal, etc.)
  - Only admins (role = 'admin' in app_metadata, or nick@igloo.scot) can insert/update/delete
*/

CREATE TABLE IF NOT EXISTS properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  notes text DEFAULT '',
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS properties_name_unique ON properties (lower(name));

ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read properties"
  ON properties FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert properties"
  ON properties FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR auth.email() = 'nick@igloo.scot'
  );

CREATE POLICY "Admins can update properties"
  ON properties FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR auth.email() = 'nick@igloo.scot'
  )
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR auth.email() = 'nick@igloo.scot'
  );

CREATE POLICY "Admins can delete properties"
  ON properties FOR DELETE
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR auth.email() = 'nick@igloo.scot'
  );

-- Seed from the known properties list used throughout the codebase
INSERT INTO properties (name) VALUES
  ('10 Bynack House'),
  ('18 Dalfaber Park'),
  ('26 Ben Avon'),
  ('31 Caledonia Place'),
  ('4 Ben Avon'),
  ('4 Bynack House'),
  ('Alpine View'),
  ('Apartment Puerto Pollensa'),
  ('Balbeag Cottage'),
  ('Balnagowan Cottage'),
  ('Betty''s Cottage'),
  ('Birchview'),
  ('Braeside'),
  ('Burnside Pines'),
  ('Carriden'),
  ('Casa Amor'),
  ('Dalfern Lodge'),
  ('Dalnaglar'),
  ('Druim an Lochain Cottage'),
  ('Eagle Lodge'),
  ('Fraser Cottage'),
  ('Killiechangie House'),
  ('Lairig Ghru Lodge'),
  ('Longfield'),
  ('Loramore'),
  ('Lynemore Croft'),
  ('Lynwilg House'),
  ('Pine Marten Cottage'),
  ('Schoolhouse'),
  ('Snowmass Lodge'),
  ('Taigh Mathair'),
  ('Telford Cottage'),
  ('The Bellhouse'),
  ('The Eagles Nest'),
  ('The Maltings'),
  ('The Shieling'),
  ('Torr Beatha'),
  ('Woodhaus'),
  ('Woodland House')
ON CONFLICT DO NOTHING;

-- Also backfill any property names already in the DB that aren't in the list above
INSERT INTO properties (name)
SELECT DISTINCT property_name FROM owner_properties
WHERE lower(property_name) NOT IN (SELECT lower(name) FROM properties)
  AND property_name IS NOT NULL AND property_name != ''
ON CONFLICT DO NOTHING;

INSERT INTO properties (name)
SELECT DISTINCT property_name FROM generated_reports
WHERE lower(property_name) NOT IN (SELECT lower(name) FROM properties)
  AND property_name IS NOT NULL AND property_name != ''
ON CONFLICT DO NOTHING;

INSERT INTO properties (name)
SELECT DISTINCT property_name FROM property_owner_mapping
WHERE lower(property_name) NOT IN (SELECT lower(name) FROM properties)
  AND property_name IS NOT NULL AND property_name != ''
ON CONFLICT DO NOTHING;
