/*
  # Consolidate fire alarm checks into property_safety_checks

  1. Purpose
    - Make `property_safety_checks` the single source of truth for fire alarm tests
      (and other safety checks). The legacy tables `fire_alarm_tests` and
      `stl_checks.fire_checked_by` remain untouched to preserve historical data,
      but all future reads/writes will flow through `property_safety_checks`.

  2. Backfill
    - Copy every row from `fire_alarm_tests` into `property_safety_checks`
      with `check_type = 'fire_alarm'`, if no equivalent row exists already.
    - Copy every `stl_checks` row that has a non-empty `fire_checked_by`
      into `property_safety_checks` with `check_type = 'fire_alarm'`,
      if no equivalent row exists already.

  3. Deduplication
    - "Equivalent" = same normalised property_name, same check_type,
      and same performed_at timestamp (to the minute).

  4. Safety
    - Uses INSERT ... SELECT with NOT EXISTS guards.
    - No destructive operations: nothing is deleted or dropped.
    - RLS policies on `property_safety_checks` are already in place and allow
      anon read/insert, which the public Safety Documents page needs.
*/

INSERT INTO property_safety_checks (
  property_id, property_name, check_type, performed_by_name,
  performed_at, result, details, notes, created_at
)
SELECT
  f.property_id,
  f.property_name,
  'fire_alarm',
  COALESCE(NULLIF(f.tested_by, ''), 'Unknown'),
  (f.tested_at::timestamptz),
  COALESCE(NULLIF(f.result, ''), 'pass'),
  '{}'::jsonb,
  COALESCE(f.notes, ''),
  f.created_at
FROM fire_alarm_tests f
WHERE NOT EXISTS (
  SELECT 1 FROM property_safety_checks p
  WHERE p.check_type = 'fire_alarm'
    AND lower(trim(p.property_name)) = lower(trim(f.property_name))
    AND date_trunc('minute', p.performed_at) = date_trunc('minute', f.tested_at::timestamptz)
);

INSERT INTO property_safety_checks (
  property_id, property_name, check_type, performed_by_name,
  performed_at, result, details, notes, created_at
)
SELECT
  NULL,
  s.property_name,
  'fire_alarm',
  COALESCE(NULLIF(s.fire_checked_by, ''), 'Unknown'),
  s.checked_at,
  'pass',
  jsonb_build_object('source', COALESCE(s.source, 'stl_checks')),
  COALESCE(s.maintenance_notes, ''),
  s.checked_at
FROM stl_checks s
WHERE s.fire_checked_by IS NOT NULL
  AND trim(s.fire_checked_by) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM property_safety_checks p
    WHERE p.check_type = 'fire_alarm'
      AND lower(trim(p.property_name)) = lower(trim(s.property_name))
      AND date_trunc('minute', p.performed_at) = date_trunc('minute', s.checked_at)
  );
