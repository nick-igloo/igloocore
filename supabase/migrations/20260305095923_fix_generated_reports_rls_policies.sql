/*
  # Fix RLS Policies for generated_reports

  1. Changes
    - Remove duplicate and conflicting SELECT policies for anonymous users
    - Keep only the secure policy that checks is_public field
    - Remove duplicate SELECT policies for authenticated users
    - Ensure clean, non-conflicting policy set

  2. Security
    - Anonymous users can only view safety documents where is_public = true
    - Authenticated users can view all reports
    - PAT documents can be inserted anonymously (for PAT testing tool)
*/

-- Drop conflicting/duplicate policies
DROP POLICY IF EXISTS "Anon can view safety documents" ON generated_reports;
DROP POLICY IF EXISTS "Authenticated users or public safety docs can read reports" ON generated_reports;

-- The remaining policies should be:
-- 1. "Anyone can view public safety documents" for anon SELECT
-- 2. "Authenticated users can view all reports" for authenticated SELECT  
-- 3. "Anonymous users can insert PAT safety documents" for anon INSERT
-- 4. "Authenticated users can insert reports" for authenticated INSERT
-- 5. "Authenticated users can update reports" for authenticated UPDATE
-- 6. "Authenticated users can delete reports" for authenticated DELETE
