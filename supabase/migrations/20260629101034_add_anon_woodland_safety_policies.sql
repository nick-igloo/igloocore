/*
# Add anon RLS policies for Woodland House safety checks

1. Purpose
  - Allow the Woodland House owner to log fire alarm and legionella checks
    without requiring authentication (public page at /woodland-safety).

2. Security changes
  - New SELECT policy: anon can read fire_alarm AND legionella checks for Woodland House only.
  - New INSERT policy: anon can insert fire_alarm and legionella checks for Woodland House only.
  - Scoped tightly to property_id = 'd921f6ce-f500-42cd-9f81-0327e712ae8e' (Woodland House).

3. Important notes
  - Does NOT modify existing policies for authenticated users or other properties.
  - The existing "Anon read fire alarm checks only" policy remains for other properties.
*/

-- Allow anon to read fire_alarm and legionella checks for Woodland House
DROP POLICY IF EXISTS "Anon read woodland safety checks" ON property_safety_checks;
CREATE POLICY "Anon read woodland safety checks"
ON property_safety_checks FOR SELECT
TO anon
USING (
  property_id = 'd921f6ce-f500-42cd-9f81-0327e712ae8e'
  AND check_type IN ('fire_alarm', 'legionella')
);

-- Allow anon to insert fire_alarm and legionella checks for Woodland House
DROP POLICY IF EXISTS "Anon insert woodland safety checks" ON property_safety_checks;
CREATE POLICY "Anon insert woodland safety checks"
ON property_safety_checks FOR INSERT
TO anon
WITH CHECK (
  property_id = 'd921f6ce-f500-42cd-9f81-0327e712ae8e'
  AND check_type IN ('fire_alarm', 'legionella')
);
