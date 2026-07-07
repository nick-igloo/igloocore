/*
  # Unified Property Operations Config

  ## Summary
  Adds operations-configuration columns to the `properties` table so that
  cleaning prices, assigned cleaner, booking-name match patterns, and
  per-property special rules become the single source of truth across the
  app (replacing hardcoded defaults in BookingProcessor.tsx).

  ## Changes to `properties`
  1. `clean_price numeric(10,2)` — default cleaning price for a single clean
  2. `cleaner_name text` — display name of the assigned cleaner (kept as text
     to match existing hardcoded defaults; can later be linked to
     cleaner_profiles)
  3. `match_patterns text[]` — lowercased substrings used to map booking-CSV
     property names to this row
  4. `special_rule text` — optional single rule flag, e.g. `ignore_owner_cleans`

  ## Backfill
  Populates the new columns from the previous hardcoded DEFAULT_CLEANS and
  DEFAULT_SPECIAL_RULES tables in code, matching by lower-case name contains.

  ## Security
  - No new policies needed; existing properties RLS applies
  - Authenticated users (directors in practice) can read and update as today
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='properties' AND column_name='clean_price') THEN
    ALTER TABLE properties ADD COLUMN clean_price numeric(10,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='properties' AND column_name='cleaner_name') THEN
    ALTER TABLE properties ADD COLUMN cleaner_name text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='properties' AND column_name='match_patterns') THEN
    ALTER TABLE properties ADD COLUMN match_patterns text[] DEFAULT '{}'::text[];
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='properties' AND column_name='special_rule') THEN
    ALTER TABLE properties ADD COLUMN special_rule text DEFAULT '';
  END IF;
END $$;

-- Backfill clean_price / cleaner_name / match_patterns from hardcoded defaults
UPDATE properties SET clean_price = 70, cleaner_name = 'Andrea', match_patterns = ARRAY['10 bynack'] WHERE lower(name) LIKE '%10 bynack%' AND clean_price IS NULL;
UPDATE properties SET clean_price = 70, cleaner_name = 'Andrea', match_patterns = ARRAY['26 ben avon'] WHERE lower(name) LIKE '%26 ben avon%' AND clean_price IS NULL;
UPDATE properties SET clean_price = 110, cleaner_name = 'Andrea', match_patterns = ARRAY['31 caledonia'] WHERE lower(name) LIKE '%31 caledonia%' AND clean_price IS NULL;
UPDATE properties SET clean_price = 70, cleaner_name = 'Andrea', match_patterns = ARRAY['4 ben avon'] WHERE lower(name) LIKE '%4 ben avon%' AND clean_price IS NULL;
UPDATE properties SET clean_price = 70, cleaner_name = 'Andrea', match_patterns = ARRAY['4 bynack'] WHERE lower(name) LIKE '%4 bynack%' AND clean_price IS NULL;
UPDATE properties SET clean_price = 110, cleaner_name = 'Andrea', match_patterns = ARRAY['alpine view'] WHERE lower(name) LIKE '%alpine view%' AND clean_price IS NULL;
UPDATE properties SET clean_price = 95, cleaner_name = 'Andrea', match_patterns = ARRAY['burnside pines'] WHERE lower(name) LIKE '%burnside pines%' AND clean_price IS NULL;
UPDATE properties SET clean_price = 85, cleaner_name = 'Andrea', match_patterns = ARRAY['casa amor'] WHERE lower(name) LIKE '%casa amor%' AND clean_price IS NULL;
UPDATE properties SET clean_price = 156, cleaner_name = 'AVM', match_patterns = ARRAY['balnagowan cottage'] WHERE lower(name) LIKE '%balnagowan%' AND clean_price IS NULL;
UPDATE properties SET clean_price = 170, cleaner_name = 'Lara', match_patterns = ARRAY['braeside'] WHERE lower(name) LIKE '%braeside%' AND clean_price IS NULL;
UPDATE properties SET clean_price = 140, cleaner_name = 'Tegan', match_patterns = ARRAY['dalfern lodge'] WHERE lower(name) LIKE '%dalfern%' AND clean_price IS NULL;
UPDATE properties SET clean_price = 156, cleaner_name = 'AVM', match_patterns = ARRAY['dalnaglar'] WHERE lower(name) LIKE '%dalnaglar%' AND clean_price IS NULL;
UPDATE properties SET clean_price = 120, cleaner_name = 'Tegan', match_patterns = ARRAY['eagle lodge'] WHERE lower(name) LIKE '%eagle lodge%' AND clean_price IS NULL;
UPDATE properties SET clean_price = 150, cleaner_name = 'Emma McRae', match_patterns = ARRAY['killiechangie'], special_rule = 'ignore_owner_cleans' WHERE lower(name) LIKE '%killiechangie%' AND clean_price IS NULL;
UPDATE properties SET clean_price = 168, cleaner_name = 'AVM', match_patterns = ARRAY['lairig ghru'] WHERE lower(name) LIKE '%lairig ghru%' AND clean_price IS NULL;
UPDATE properties SET clean_price = 121, cleaner_name = 'Alanah', match_patterns = ARRAY['longfield'] WHERE lower(name) LIKE '%longfield%' AND clean_price IS NULL;
UPDATE properties SET clean_price = 150, cleaner_name = 'Emma McRae', match_patterns = ARRAY['schoolhouse'] WHERE lower(name) LIKE '%schoolhouse%' AND clean_price IS NULL;
UPDATE properties SET clean_price = 300, cleaner_name = 'Andrea', match_patterns = ARRAY['eagles nest'] WHERE lower(name) LIKE '%eagles nest%' AND clean_price IS NULL;
UPDATE properties SET clean_price = 170, cleaner_name = 'Emma V', match_patterns = ARRAY['maltings'] WHERE lower(name) LIKE '%maltings%' AND clean_price IS NULL;
UPDATE properties SET clean_price = 120, cleaner_name = 'AVM', match_patterns = ARRAY['torr beatha'] WHERE lower(name) LIKE '%torr beatha%' AND clean_price IS NULL;
UPDATE properties SET clean_price = 150, cleaner_name = 'Emma V', match_patterns = ARRAY['woodland house'] WHERE lower(name) LIKE '%woodland house%' AND clean_price IS NULL;
