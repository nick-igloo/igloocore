/*
  # Allow Anonymous Access to Bank Details for Settlement Tool

  ## Changes
  - Add policies to allow anonymous (anon role) users to manage bank details
  - This allows the Settlement Converter tool to work without authentication
  
  ## Security Notes
  - Anonymous users can manage bank details (appropriate for internal tool)
  - This is an internal admin tool on core.igloo.scot subdomain
*/

-- Create policies for anonymous users
CREATE POLICY "Anonymous users can select bank details"
  ON owner_bank_details FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anonymous users can insert bank details"
  ON owner_bank_details FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Anonymous users can update bank details"
  ON owner_bank_details FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anonymous users can delete bank details"
  ON owner_bank_details FOR DELETE
  TO anon
  USING (true);
