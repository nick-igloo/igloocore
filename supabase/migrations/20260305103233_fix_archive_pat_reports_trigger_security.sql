/*
  # Fix PAT Reports Archive Trigger Security

  1. Changes
    - Recreate the archive_old_pat_reports function with SECURITY DEFINER
    - This allows the trigger to bypass RLS when archiving old reports
    - The trigger runs in the context of the function owner, not the user

  2. Security
    - Function only updates is_public flag on old PAT reports
    - No data deletion or exposure
    - Necessary for the trigger to work for both authenticated and anonymous users
*/

-- Drop and recreate the function with SECURITY DEFINER
CREATE OR REPLACE FUNCTION archive_old_pat_reports()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only process if this is a PAT report
  IF NEW.safety_document_type = 'pat' AND NEW.is_public = true THEN
    -- Archive all older PAT reports for the same property
    UPDATE generated_reports
    SET is_public = false
    WHERE id != NEW.id
      AND property_name = NEW.property_name
      AND safety_document_type = 'pat'
      AND is_public = true;
  END IF;
  
  RETURN NEW;
END;
$$;
