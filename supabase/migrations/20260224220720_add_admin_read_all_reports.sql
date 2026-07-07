/*
  # Admin Read All Reports Policy

  Adds an additional SELECT policy on generated_reports so that
  authenticated users with the admin role in app_metadata can read
  all reports regardless of property ownership.

  Also adds a broad authenticated read policy so directors can
  view all generated reports from the admin panel.
*/

CREATE POLICY "Authenticated users can read all reports for admin"
  ON generated_reports FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR generated_by = auth.uid()
  );
