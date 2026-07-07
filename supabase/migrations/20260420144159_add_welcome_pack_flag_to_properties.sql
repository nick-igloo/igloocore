/*
  # Add welcome pack flag to properties

  1. Changes
    - Adds `has_welcome_pack` boolean to `properties` (default true)
    - Backfills known no-welcome properties (from settlement config) to false

  2. Notes
    - The Guest Ready checker uses this flag to hide the welcome pack stage for properties that do not receive one.
    - Defaults to true so newly added properties are assumed to have welcome packs until configured otherwise.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'properties' AND column_name = 'has_welcome_pack'
  ) THEN
    ALTER TABLE properties ADD COLUMN has_welcome_pack boolean NOT NULL DEFAULT true;
  END IF;
END $$;

UPDATE properties
SET has_welcome_pack = false
WHERE lower(name) IN (
  '18 dalfaber',
  'fraser cottage',
  'telford cottage',
  'druim an lochain cottage',
  'birchview',
  'apartment puerto pollensa',
  'carriden'
);
