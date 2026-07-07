/*
  # Settlement config singleton

  1. New Tables
    - `settlement_config` (singleton row identified by `id = 1`)
      - `small_price` numeric (default 12)
      - `large_price` numeric (default 18)
      - `updated_at` timestamptz

  2. Security
    - Enable RLS
    - Authenticated users may read; authenticated users may update (same group who edit settlements today)

  3. Notes
    - Seeds a single row with the current defaults so the app can read/write a known row.
*/

CREATE TABLE IF NOT EXISTS settlement_config (
  id integer PRIMARY KEY CHECK (id = 1),
  small_price numeric NOT NULL DEFAULT 12,
  large_price numeric NOT NULL DEFAULT 18,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO settlement_config (id, small_price, large_price)
VALUES (1, 12, 18)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE settlement_config ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'settlement_config' AND policyname = 'Authenticated can read settlement config'
  ) THEN
    CREATE POLICY "Authenticated can read settlement config"
      ON settlement_config FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'settlement_config' AND policyname = 'Authenticated can update settlement config'
  ) THEN
    CREATE POLICY "Authenticated can update settlement config"
      ON settlement_config FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
