/*
  # Add 'purchase_for_igloo' to director_expenses category

  1. Changes
    - Updates the CHECK constraint on `director_expenses.category` to allow
      the new value 'purchase_for_igloo' (company-level purchase not tied to a property).

  2. Security
    - No RLS changes needed; existing policies still apply.
*/

ALTER TABLE director_expenses
  DROP CONSTRAINT IF EXISTS director_expenses_category_check;

ALTER TABLE director_expenses
  ADD CONSTRAINT director_expenses_category_check
  CHECK (category IN ('purchase_for_property', 'service_for_property', 'purchase_for_igloo'));
