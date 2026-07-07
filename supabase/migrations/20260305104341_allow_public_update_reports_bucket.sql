/*
  # Allow Public Users to Update Files in Reports Bucket

  1. Changes
    - Add UPDATE policy for storage.objects on reports bucket
    - This allows the upsert option to work when uploading files
    - Matches the existing INSERT policy permissions

  2. Security
    - Only allows updates to the reports bucket
    - Public access is acceptable as reports are meant to be shared
*/

-- Allow public users to update (overwrite) files in the reports bucket
CREATE POLICY "Anyone can update files in reports bucket"
  ON storage.objects
  FOR UPDATE
  TO public
  USING (bucket_id = 'reports')
  WITH CHECK (bucket_id = 'reports');
