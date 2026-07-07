/*
  # Backfill payee_name from owner_name

  ## Summary
  When owner_bank_details was first created it used owner_name.
  The payee_name column was added later with DEFAULT '' so existing
  rows have an empty payee_name. This migration copies owner_name
  into payee_name for all rows where payee_name is currently blank.
*/

UPDATE owner_bank_details
SET payee_name = owner_name
WHERE payee_name = '' AND owner_name != '';
