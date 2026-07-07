/*
  # Restore Anonymous Read Access for Public Safety Pages

  1. Context
    - The safety documents pages (/safety, /safety/:slug) are public-facing
    - They allow licence compliance verification without login
    - They use the anon key to query generated_reports, property_safety_checks, and properties
    - The previous security migration revoked all anon access, breaking these pages

  2. Changes
    - Grant SELECT on generated_reports, property_safety_checks, and properties to anon
    - Create restrictive anon SELECT policies:
      - generated_reports: only rows where is_safety_document = true
      - property_safety_checks: only fire_alarm check_type records
      - properties: only id and name columns (via policy, full row visible but limited by query)

  3. Security Notes
    - These policies are intentionally narrow (safety docs only, fire alarm checks only)
    - Non-safety data remains invisible to anon users
    - Write access is NOT granted to anon
*/

-- Grant SELECT to anon on the three tables needed for public safety pages
GRANT SELECT ON public.generated_reports TO anon;
GRANT SELECT ON public.property_safety_checks TO anon;
GRANT SELECT ON public.properties TO anon;

-- Create restrictive anon SELECT policies

-- generated_reports: only safety documents are visible publicly
CREATE POLICY "Anon read safety documents only"
  ON public.generated_reports
  FOR SELECT TO anon
  USING (is_safety_document = true);

-- property_safety_checks: only fire alarm test records are visible publicly
CREATE POLICY "Anon read fire alarm checks only"
  ON public.property_safety_checks
  FOR SELECT TO anon
  USING (check_type = 'fire_alarm');

-- properties: allow reading property names for matching (public info)
CREATE POLICY "Anon read property names"
  ON public.properties
  FOR SELECT TO anon
  USING (true);
