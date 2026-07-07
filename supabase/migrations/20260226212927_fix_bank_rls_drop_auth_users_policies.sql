/*
  # Fix bank details and property mapping RLS policies

  ## Summary
  Two sets of duplicate policies exist on owner_bank_details and property_owner_mapping.
  The old set queries auth.users directly, causing "permission denied for table users"
  errors for the Supabase client. The new set uses auth.jwt() which works correctly.
  This migration drops the broken auth.users-based policies, keeping only the jwt ones.
*/

-- Drop broken auth.users-based policies on owner_bank_details
DROP POLICY IF EXISTS "Admin can select bank details" ON public.owner_bank_details;
DROP POLICY IF EXISTS "Admin can insert bank details" ON public.owner_bank_details;
DROP POLICY IF EXISTS "Admin can update bank details" ON public.owner_bank_details;
DROP POLICY IF EXISTS "Admin can delete bank details" ON public.owner_bank_details;

-- Drop broken auth.users-based policies on property_owner_mapping
DROP POLICY IF EXISTS "Admin can select property mappings" ON public.property_owner_mapping;
DROP POLICY IF EXISTS "Admin can insert property mappings" ON public.property_owner_mapping;
DROP POLICY IF EXISTS "Admin can update property mappings" ON public.property_owner_mapping;
DROP POLICY IF EXISTS "Admin can delete property mappings" ON public.property_owner_mapping;
