/*
  # Storage policies for turnover-photos bucket

  Allows authenticated and anon clients to upload issue/task photos, and
  public read since the bucket is public (paths are non-guessable UUIDs).
*/

CREATE POLICY "turnover_photos_read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'turnover-photos');

CREATE POLICY "turnover_photos_insert_auth"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'turnover-photos');

CREATE POLICY "turnover_photos_insert_anon"
  ON storage.objects FOR INSERT
  TO anon
  WITH CHECK (bucket_id = 'turnover-photos');

CREATE POLICY "turnover_photos_update_auth"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'turnover-photos')
  WITH CHECK (bucket_id = 'turnover-photos');

CREATE POLICY "turnover_photos_delete_auth"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'turnover-photos');
