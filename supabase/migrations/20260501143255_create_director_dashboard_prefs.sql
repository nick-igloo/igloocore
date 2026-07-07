/*
  # Director dashboard preferences

  1. New Tables
    - `director_dashboard_prefs`
      - `user_id` (uuid, pk, fk to auth.users)
      - `hidden_cards` (text[]) list of card ids to hide for this user
      - `card_order` (text[]) preferred order of card ids (missing ids fall back to default order)
      - `updated_at` (timestamptz)
      - `updated_by` (uuid)
  2. Security
    - RLS enabled
    - Users can read their own preferences
    - Admins (app_metadata.role = 'admin') can read/insert/update/delete all rows
*/

CREATE TABLE IF NOT EXISTS director_dashboard_prefs (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  hidden_cards text[] NOT NULL DEFAULT '{}',
  card_order text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE director_dashboard_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own dashboard prefs" ON director_dashboard_prefs;
CREATE POLICY "Users read own dashboard prefs"
  ON director_dashboard_prefs FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

DROP POLICY IF EXISTS "Admins insert dashboard prefs" ON director_dashboard_prefs;
CREATE POLICY "Admins insert dashboard prefs"
  ON director_dashboard_prefs FOR INSERT
  TO authenticated
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Admins update dashboard prefs" ON director_dashboard_prefs;
CREATE POLICY "Admins update dashboard prefs"
  ON director_dashboard_prefs FOR UPDATE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Admins delete dashboard prefs" ON director_dashboard_prefs;
CREATE POLICY "Admins delete dashboard prefs"
  ON director_dashboard_prefs FOR DELETE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
