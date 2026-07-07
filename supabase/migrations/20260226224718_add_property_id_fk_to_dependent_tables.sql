/*
  # Add property_id Foreign Keys to Dependent Tables

  ## Summary
  Adds a `property_id` UUID column (FK to properties.id) to all tables that currently
  use property_name text-matching. The name columns are KEPT for now for backward
  compatibility (storage paths, display names) but property_id becomes the canonical
  link. Over time, lookups will use property_id instead of property_name.

  ## Modified Tables

  ### `owner_properties`
  - Adds `property_id` (UUID, nullable FK to properties.id)
  - Backfills via case-insensitive name match

  ### `property_owner_mapping`
  - Adds `property_id` (UUID, nullable FK to properties.id)
  - Backfills via case-insensitive name match

  ### `generated_reports`
  - Adds `property_id` (UUID, nullable FK to properties.id)
  - Backfills via case-insensitive name match

  ### `fire_alarm_tests` (if exists)
  - Adds `property_id` (UUID, nullable FK to properties.id)
  - Backfills via case-insensitive name match

  ## Notes
  - All FK columns are nullable to allow gradual migration without breaking existing data
  - Indexes added for performance on all new FK columns
  - property_name columns are preserved (needed for storage paths and display)
*/

-- owner_properties
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'owner_properties' AND column_name = 'property_id'
  ) THEN
    ALTER TABLE owner_properties ADD COLUMN property_id uuid REFERENCES properties(id) ON DELETE SET NULL;
  END IF;
END $$;

UPDATE owner_properties op
SET property_id = p.id
FROM properties p
WHERE lower(op.property_name) = lower(p.name)
  AND op.property_id IS NULL;

CREATE INDEX IF NOT EXISTS owner_properties_property_id_idx ON owner_properties(property_id);

-- property_owner_mapping
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'property_owner_mapping' AND column_name = 'property_id'
  ) THEN
    ALTER TABLE property_owner_mapping ADD COLUMN property_id uuid REFERENCES properties(id) ON DELETE SET NULL;
  END IF;
END $$;

UPDATE property_owner_mapping pom
SET property_id = p.id
FROM properties p
WHERE lower(pom.property_name) = lower(p.name)
  AND pom.property_id IS NULL;

CREATE INDEX IF NOT EXISTS property_owner_mapping_property_id_idx ON property_owner_mapping(property_id);

-- generated_reports
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'generated_reports' AND column_name = 'property_id'
  ) THEN
    ALTER TABLE generated_reports ADD COLUMN property_id uuid REFERENCES properties(id) ON DELETE SET NULL;
  END IF;
END $$;

UPDATE generated_reports gr
SET property_id = p.id
FROM properties p
WHERE lower(gr.property_name) = lower(p.name)
  AND gr.property_id IS NULL;

CREATE INDEX IF NOT EXISTS generated_reports_property_id_idx ON generated_reports(property_id);

-- fire_alarm_tests (only if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'fire_alarm_tests') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'fire_alarm_tests' AND column_name = 'property_id'
    ) THEN
      EXECUTE 'ALTER TABLE fire_alarm_tests ADD COLUMN property_id uuid REFERENCES properties(id) ON DELETE SET NULL';
    END IF;

    EXECUTE '
      UPDATE fire_alarm_tests fat
      SET property_id = p.id
      FROM properties p
      WHERE lower(fat.property_name) = lower(p.name)
        AND fat.property_id IS NULL
    ';

    EXECUTE 'CREATE INDEX IF NOT EXISTS fire_alarm_tests_property_id_idx ON fire_alarm_tests(property_id)';
  END IF;
END $$;
