/*
  # Director expenses logging

  1. New Tables
    - `director_expenses`
      - `id` (uuid, pk)
      - `user_id` (uuid, fk auth.users) — director who logged the expense
      - `property_id` (uuid, fk properties, nullable) — null for company-wide
      - `property_name` (text) — denormalised for CSV export even if property is deleted
      - `amount` (numeric(10,2)) — pounds and pence
      - `description` (text) — "what for"
      - `expense_date` (date) — when the spend occurred
      - `receipt_path` (text, nullable) — path in `expense-receipts` bucket
      - `created_at` / `updated_at` (timestamptz)

  2. New Storage
    - Bucket `expense-receipts` (private)
    - Policies: authenticated users can upload and read files inside folders
      matching their own user id; admins can read all.

  3. Security
    - RLS enabled on `director_expenses`
    - Users can SELECT/INSERT/UPDATE/DELETE only their own rows
    - Admins (app_metadata.role = 'admin') can SELECT/UPDATE/DELETE all rows
*/

CREATE TABLE IF NOT EXISTS director_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE SET NULL,
  property_name text NOT NULL DEFAULT '',
  amount numeric(10,2) NOT NULL DEFAULT 0,
  description text NOT NULL DEFAULT '',
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  receipt_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS director_expenses_user_date_idx
  ON director_expenses (user_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS director_expenses_date_idx
  ON director_expenses (expense_date DESC);

ALTER TABLE director_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own expenses or admin all" ON director_expenses;
CREATE POLICY "Users read own expenses or admin all"
  ON director_expenses FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

DROP POLICY IF EXISTS "Users insert own expenses" ON director_expenses;
CREATE POLICY "Users insert own expenses"
  ON director_expenses FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users update own expenses or admin all" ON director_expenses;
CREATE POLICY "Users update own expenses or admin all"
  ON director_expenses FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  )
  WITH CHECK (
    user_id = auth.uid()
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

DROP POLICY IF EXISTS "Users delete own expenses or admin all" ON director_expenses;
CREATE POLICY "Users delete own expenses or admin all"
  ON director_expenses FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- Storage bucket for receipts (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('expense-receipts', 'expense-receipts', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users upload own receipts" ON storage.objects;
CREATE POLICY "Users upload own receipts"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'expense-receipts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users read own receipts or admin all" ON storage.objects;
CREATE POLICY "Users read own receipts or admin all"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'expense-receipts'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    )
  );

DROP POLICY IF EXISTS "Users delete own receipts or admin all" ON storage.objects;
CREATE POLICY "Users delete own receipts or admin all"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'expense-receipts'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    )
  );
