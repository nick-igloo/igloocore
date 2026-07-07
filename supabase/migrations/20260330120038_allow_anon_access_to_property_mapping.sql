/*
  # Allow Anonymous Access to Property Mapping for Settlement Tool

  ## Changes
  - Drop admin-only policies for property_owner_mapping table
  - Add policies for authenticated and anonymous users
  - This allows the Settlement Converter tool to work without authentication
  
  ## Security Notes
  - Anonymous users can manage property mappings (appropriate for internal tool)
  - This is an internal admin tool on core.igloo.scot subdomain
*/

-- Drop existing admin-only policies
DROP POLICY IF EXISTS "Admins can select property mappings" ON property_owner_mapping;
DROP POLICY IF EXISTS "Admins can insert property mappings" ON property_owner_mapping;
DROP POLICY IF EXISTS "Admins can update property mappings" ON property_owner_mapping;
DROP POLICY IF EXISTS "Admins can delete property mappings" ON property_owner_mapping;

-- Create policies for authenticated users
CREATE POLICY "Authenticated users can select property mappings"
  ON property_owner_mapping FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert property mappings"
  ON property_owner_mapping FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update property mappings"
  ON property_owner_mapping FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete property mappings"
  ON property_owner_mapping FOR DELETE
  TO authenticated
  USING (true);

-- Create policies for anonymous users
CREATE POLICY "Anonymous users can select property mappings"
  ON property_owner_mapping FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anonymous users can insert property mappings"
  ON property_owner_mapping FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Anonymous users can update property mappings"
  ON property_owner_mapping FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anonymous users can delete property mappings"
  ON property_owner_mapping FOR DELETE
  TO anon
  USING (true);
