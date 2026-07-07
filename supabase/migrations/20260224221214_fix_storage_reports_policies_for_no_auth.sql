/*
  # Fix storage bucket policies for unauthenticated access

  The app does not use authentication. Storage policies that require
  auth.uid() block all uploads and downloads.

  Changes:
  - Drop all restrictive storage policies on the reports bucket
  - Add open policies for INSERT (upload) and SELECT (download/signed URLs)
*/

DROP POLICY IF EXISTS "Authenticated uploaders can read reports they uploaded" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload reports" ON storage.objects;
DROP POLICY IF EXISTS "Owners can read their property reports" ON storage.objects;

CREATE POLICY "Anyone can upload to reports bucket"
  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'reports');

CREATE POLICY "Anyone can read from reports bucket"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'reports');
