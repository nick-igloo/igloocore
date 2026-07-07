/*
  # Unify welcome pack config on properties table

  1. Changes
    - Adds `welcome_pack_size` text column to `properties`
      - Allowed values: 'none', 'small', 'large'
      - Default: 'none'
    - Backfills from the hardcoded settlement defaults:
        * DEFAULT_WELCOME_SMALL => 'small'
        * DEFAULT_WELCOME_LARGE => 'large'
        * DEFAULT_NO_WELCOME / everyone else => 'none'
    - Keeps `has_welcome_pack` in sync (welcome_pack_size != 'none')

  2. Rationale
    - Establishes properties as the single source of truth for welcome pack eligibility,
      shared by the settlement booking processor and the Guest Ready checker.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'properties' AND column_name = 'welcome_pack_size'
  ) THEN
    ALTER TABLE properties
      ADD COLUMN welcome_pack_size text NOT NULL DEFAULT 'none'
      CHECK (welcome_pack_size IN ('none','small','large'));
  END IF;
END $$;

UPDATE properties SET welcome_pack_size = 'small'
WHERE lower(name) IN (
  '10 bynack','26 ben avon','31 caledonia place','4 ben avon','4 bynack',
  'alpine view','burnside pines','casa amor','longfield','pine marten cottage',
  'snowmass lodge','torr beatha','woodhaus','taigh mathair'
);

UPDATE properties SET welcome_pack_size = 'large'
WHERE lower(name) IN (
  'balbeag cottage','balnagowan cottage','braeside','dalfern lodge','dalnaglar',
  'eagle lodge','killiechangie','killiechangie house','lairig ghru lodge','loramore',
  'schoolhouse','the bellhouse','the eagles nest','the maltings','the shieling','woodland house'
);

UPDATE properties SET welcome_pack_size = 'none'
WHERE lower(name) IN (
  '18 dalfaber','fraser cottage','telford cottage','druim an lochain cottage',
  'birchview','apartment puerto pollensa','carriden'
);

UPDATE properties SET has_welcome_pack = (welcome_pack_size <> 'none');
