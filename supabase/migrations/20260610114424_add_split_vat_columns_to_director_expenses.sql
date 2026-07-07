-- Add columns to split expenses into zero-rated and standard-rated portions for Xero
ALTER TABLE public.director_expenses
  ADD COLUMN zero_rated_amount numeric(10, 2) DEFAULT NULL,
  ADD COLUMN standard_rated_amount numeric(10, 2) DEFAULT NULL;
