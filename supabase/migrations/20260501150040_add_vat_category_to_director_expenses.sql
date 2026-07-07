/*
  # Add VAT flag and category to director_expenses

  1. Changes
    - `director_expenses.has_vat` (boolean, default false) — true when the amount
      includes 20% UK VAT.
    - `director_expenses.category` (text, default 'purchase_for_property') — one of
      'purchase_for_property' or 'service_for_property'. Stored as a plain string
      (no enum) so the allowed values can evolve without a destructive migration,
      constrained by a CHECK.

  2. Security
    - RLS is unchanged; existing policies continue to apply.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'director_expenses' AND column_name = 'has_vat'
  ) THEN
    ALTER TABLE director_expenses ADD COLUMN has_vat boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'director_expenses' AND column_name = 'category'
  ) THEN
    ALTER TABLE director_expenses
      ADD COLUMN category text NOT NULL DEFAULT 'purchase_for_property';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'director_expenses' AND constraint_name = 'director_expenses_category_check'
  ) THEN
    ALTER TABLE director_expenses
      ADD CONSTRAINT director_expenses_category_check
      CHECK (category IN ('purchase_for_property', 'service_for_property'));
  END IF;
END $$;
