-- Add vat_amount column to director_expenses to store the actual VAT from receipts
-- instead of always calculating 20% of the total (which is wrong for mixed transactions)
ALTER TABLE public.director_expenses ADD COLUMN vat_amount numeric(10, 2) DEFAULT NULL;
