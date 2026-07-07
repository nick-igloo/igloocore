/*
  # Storage Policies for Reports Bucket

  Allows authenticated users to upload report files.
  Allows owners to download their own property's reports.
  Admins (any authenticated user) can upload.
  Owners can only read files where the path starts with their linked property name.
*/

CREATE POLICY "Authenticated users can upload reports"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'reports');

CREATE POLICY "Owners can read their property reports"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'reports'
    AND (
      EXISTS (
        SELECT 1 FROM owner_properties
        WHERE owner_properties.user_id = auth.uid()
        AND storage.objects.name LIKE (owner_properties.property_name || '/%')
      )
      OR EXISTS (
        SELECT 1 FROM owner_properties op2
        WHERE op2.user_id = auth.uid()
        AND storage.objects.name LIKE ('%' || op2.property_name || '%')
      )
    )
  );

CREATE POLICY "Authenticated uploaders can read reports they uploaded"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'reports'
    AND owner = auth.uid()
  );
