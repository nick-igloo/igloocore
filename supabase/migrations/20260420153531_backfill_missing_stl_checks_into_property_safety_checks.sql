/*
  # Backfill gap of STL/safety checks into property_safety_checks

  1. Purpose
    - Insert 117 missing STL check records (dated Feb-Apr 2026) into
      `property_safety_checks` so they appear on the public Safety Documents
      page and the Guest Ready history.

  2. What gets written
    - For each source record, two rows are inserted:
        a) `check_type = 'fire_alarm'` with performer = fire_checked_by
        b) `check_type = 'legionella'` with performer = legionella_by,
           `result = 'no_action_required'` (all source rows say
           "a few days - no action required"), details captures the
           unoccupied_status, notes captures any maintenance_notes.

  3. Deduplication
    - NOT EXISTS guard against (lower(property_name), check_type,
      date_trunc('minute', performed_at)) to prevent double-writes
      if run again.

  4. Safety
    - Pure INSERT ... SELECT, no deletes, no drops. RLS unchanged.
*/

WITH source (checked_at, property_name, fire_by, legionella_by, unoccupied_status, notes) AS (
  VALUES
    ('2026-02-19 17:05:33'::timestamptz, 'The Bellhouse', 'Nick Lyon', 'Nick Lyon', 'a few days - no action required', ''),
    ('2026-02-20 14:49:04'::timestamptz, '10 Bynack House', 'Erin McBean', 'Erin McBean', 'a few days - no action required', '26 needs new torch'),
    ('2026-02-20 14:49:04'::timestamptz, '26 Ben Avon', 'Erin McBean', 'Erin McBean', 'a few days - no action required', '26 needs new torch'),
    ('2026-02-20 14:49:04'::timestamptz, '31 Caledonia Place', 'Erin McBean', 'Erin McBean', 'a few days - no action required', '26 needs new torch'),
    ('2026-02-20 14:49:04'::timestamptz, 'Balnagowan Cottage', 'Erin McBean', 'Erin McBean', 'a few days - no action required', '26 needs new torch'),
    ('2026-02-20 14:49:04'::timestamptz, 'Pine Marten Cottage', 'Erin McBean', 'Erin McBean', 'a few days - no action required', '26 needs new torch'),
    ('2026-02-21 14:53:49'::timestamptz, 'Burnside Pines', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-02-25 11:54:01'::timestamptz, '4 Ben Avon', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-02-25 11:54:01'::timestamptz, '10 Bynack House', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-02-25 11:54:01'::timestamptz, '31 Caledonia Place', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-02-25 11:54:01'::timestamptz, 'Alpine View', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-02-25 11:54:01'::timestamptz, 'Balnagowan Cottage', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-02-25 11:54:01'::timestamptz, 'Braeside', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-02-25 11:54:01'::timestamptz, 'Dalfern lodge', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-02-25 11:54:01'::timestamptz, 'Eagle Lodge', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-02-25 11:54:01'::timestamptz, 'Killiechangie', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-02-25 11:54:01'::timestamptz, 'Lairig Ghru Lodge', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-02-25 11:54:01'::timestamptz, 'Snowmass Lodge', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-02-25 11:54:01'::timestamptz, 'The Maltings', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-02-25 11:54:01'::timestamptz, 'The Eagles Nest', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-02-25 11:54:01'::timestamptz, 'The Shieling', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-02-25 11:54:01'::timestamptz, 'Woodhaus', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-03-02 16:19:46'::timestamptz, '26 Ben Avon', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-03-02 16:19:46'::timestamptz, '31 Caledonia Place', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-03-02 16:19:46'::timestamptz, 'Alpine View', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-03-02 16:19:46'::timestamptz, 'The Eagles Nest', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-03-02 16:19:46'::timestamptz, 'The Shieling', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-03-02 16:19:46'::timestamptz, 'Woodhaus', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-03-05 11:45:58'::timestamptz, 'Balnagowan Cottage', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-03-05 11:45:58'::timestamptz, 'Braeside', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-03-05 11:45:58'::timestamptz, 'Dalfern lodge', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-03-05 11:45:58'::timestamptz, 'The Maltings', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-03-11 15:07:29'::timestamptz, 'Balnagowan Cottage', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-03-11 15:07:29'::timestamptz, 'Braeside', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-03-11 15:07:29'::timestamptz, 'Casa Amor', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-03-11 15:07:29'::timestamptz, 'Dalnagar', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-03-11 15:07:29'::timestamptz, 'The Maltings', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-03-11 15:07:29'::timestamptz, 'The Eagles Nest', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-03-17 10:38:58'::timestamptz, '26 Ben Avon', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-03-17 10:38:58'::timestamptz, '31 Caledonia Place', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-03-17 10:38:58'::timestamptz, 'Burnside Pines', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-03-17 10:38:58'::timestamptz, 'Pine Marten Cottage', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-03-17 10:38:58'::timestamptz, 'Woodhaus', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-03-18 12:47:35'::timestamptz, 'Braeside', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-03-18 12:47:35'::timestamptz, 'Dalfern lodge', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-03-18 12:47:35'::timestamptz, 'Lairig Ghru Lodge', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-03-18 12:47:35'::timestamptz, 'Snowmass Lodge', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-03-18 12:47:35'::timestamptz, 'The Maltings', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-03-18 12:47:35'::timestamptz, 'The Eagles Nest', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-03-18 12:47:35'::timestamptz, 'The Shieling', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-03-18 15:31:49'::timestamptz, 'Balbeag', 'Erin McBean', 'Erin McBean', 'a few days - no action required', 'New torch balbeag'),
    ('2026-03-18 15:31:49'::timestamptz, 'Torr Beatha', 'Erin McBean', 'Erin McBean', 'a few days - no action required', 'New torch balbeag'),
    ('2026-03-20 17:17:34'::timestamptz, '10 Bynack House', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-03-20 17:17:34'::timestamptz, '31 Caledonia Place', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-03-20 17:17:34'::timestamptz, 'Burnside Pines', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-03-20 17:17:34'::timestamptz, 'Eagle Lodge', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-03-20 17:17:34'::timestamptz, 'Pine Marten Cottage', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-03-24 12:13:00'::timestamptz, '4 Ben Avon', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-03-24 12:13:00'::timestamptz, '26 Ben Avon', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-03-24 12:13:00'::timestamptz, 'Dalfern lodge', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-03-25 15:15:22'::timestamptz, 'Alpine View', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-03-25 15:15:22'::timestamptz, 'Dalnagar', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-03-25 15:15:22'::timestamptz, 'Eagle Lodge', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-03-25 15:15:22'::timestamptz, 'Lairig Ghru Lodge', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-03-25 15:15:22'::timestamptz, 'Loramore', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-03-25 15:15:22'::timestamptz, 'Pine Marten Cottage', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-03-25 15:15:22'::timestamptz, 'The Maltings', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-03-25 15:15:22'::timestamptz, 'The Eagles Nest', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-03-25 15:15:22'::timestamptz, 'The Shieling', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-03-31 09:12:34'::timestamptz, 'Balbeag', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-03-31 09:12:34'::timestamptz, 'Burnside Pines', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-03-31 09:12:34'::timestamptz, 'Dalfern lodge', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-03-31 09:12:34'::timestamptz, 'Eagle Lodge', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-03-31 09:12:34'::timestamptz, 'Woodhaus', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-03-31 14:39:53'::timestamptz, '31 Caledonia Place', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-03-31 14:39:53'::timestamptz, 'Alpine View', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-03-31 14:39:53'::timestamptz, 'Braeside', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-03-31 14:39:53'::timestamptz, 'The Shieling', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-04-09 16:45:07'::timestamptz, 'Woodhaus', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-04-11 04:47:04'::timestamptz, '4 Ben Avon', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-04-11 04:47:04'::timestamptz, '10 Bynack House', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-04-11 04:47:04'::timestamptz, '26 Ben Avon', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-04-11 04:47:04'::timestamptz, '31 Caledonia Place', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-04-11 04:47:04'::timestamptz, 'Alpine View', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-04-11 04:47:04'::timestamptz, 'Casa Amor', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-04-11 04:47:04'::timestamptz, 'Dalfern lodge', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-04-11 04:47:04'::timestamptz, 'Dalnagar', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-04-11 04:47:04'::timestamptz, 'Eagle Lodge', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-04-11 04:47:04'::timestamptz, 'Pine Marten Cottage', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-04-11 04:47:04'::timestamptz, 'The Eagles Nest', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-04-11 20:52:32'::timestamptz, 'Balbeag', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-04-11 20:52:32'::timestamptz, 'Braeside', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-04-11 20:52:32'::timestamptz, 'Loramore', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-04-11 20:52:32'::timestamptz, 'The Maltings', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-04-11 20:52:32'::timestamptz, 'Tigh M''athair', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-04-11 20:52:32'::timestamptz, 'Torr Beatha', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-04-13 13:34:24'::timestamptz, '10 Bynack House', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-04-13 13:34:24'::timestamptz, '31 Caledonia Place', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-04-13 13:34:24'::timestamptz, 'Balnagowan Cottage', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-04-13 13:34:24'::timestamptz, 'Burnside Pines', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-04-13 13:34:24'::timestamptz, 'Eagle Lodge', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-04-13 13:34:24'::timestamptz, 'Snowmass Lodge', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-04-13 13:34:24'::timestamptz, 'The Shieling', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-04-13 13:34:24'::timestamptz, 'Woodhaus', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-04-14 19:10:57'::timestamptz, '4 Ben Avon', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-04-14 19:10:57'::timestamptz, '26 Ben Avon', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-04-14 19:10:57'::timestamptz, 'Pine Marten Cottage', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-04-16 16:50:10'::timestamptz, 'Balnagowan Cottage', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-04-16 16:50:10'::timestamptz, 'Casa Amor', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-04-16 16:50:10'::timestamptz, 'The Maltings', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-04-20 15:06:23'::timestamptz, 'Braeside', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-04-20 15:06:23'::timestamptz, 'Dalfern lodge', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-04-20 15:06:23'::timestamptz, 'Dalnagar', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-04-20 15:06:23'::timestamptz, 'The Maltings', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-04-20 15:06:23'::timestamptz, 'The Eagles Nest', 'Erin McBean', 'Erin McBean', 'a few days - no action required', ''),
    ('2026-04-20 15:06:23'::timestamptz, 'Tigh M''athair', 'Erin McBean', 'Erin McBean', 'a few days - no action required', '')
)
INSERT INTO property_safety_checks (
  property_id, property_name, check_type, performed_by_name,
  performed_at, result, details, notes, created_at
)
SELECT
  (SELECT id FROM properties p WHERE lower(trim(p.name)) = lower(trim(s.property_name)) LIMIT 1),
  s.property_name,
  ct.check_type,
  CASE WHEN ct.check_type = 'fire_alarm' THEN s.fire_by ELSE s.legionella_by END,
  s.checked_at,
  CASE WHEN ct.check_type = 'fire_alarm' THEN 'pass' ELSE 'no_action_required' END,
  CASE WHEN ct.check_type = 'legionella'
       THEN jsonb_build_object('unoccupied_status', s.unoccupied_status, 'source', 'csv_import_sync')
       ELSE jsonb_build_object('source', 'csv_import_sync')
  END,
  COALESCE(s.notes, ''),
  s.checked_at
FROM source s
CROSS JOIN (VALUES ('fire_alarm'), ('legionella')) AS ct(check_type)
WHERE NOT EXISTS (
  SELECT 1 FROM property_safety_checks p
  WHERE p.check_type = ct.check_type
    AND lower(trim(p.property_name)) = lower(trim(s.property_name))
    AND date_trunc('minute', p.performed_at) = date_trunc('minute', s.checked_at)
);
