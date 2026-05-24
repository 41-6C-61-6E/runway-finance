-- Custom SQL migration to add account_id to spending and income summary tables

-- 1. Clear existing summary data to safely add NOT NULL foreign key columns
DELETE FROM category_spending_summary;
DELETE FROM category_income_summary;

-- 2. Add the account_id column with appropriate foreign key references if not exists
ALTER TABLE category_spending_summary ADD COLUMN IF NOT EXISTS account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE category_income_summary ADD COLUMN IF NOT EXISTS account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE;

-- 3. Drop old unique constraints if they exist
ALTER TABLE category_spending_summary DROP CONSTRAINT IF EXISTS category_spending_summary_user_id_category_id_year_month_unique;
ALTER TABLE category_income_summary DROP CONSTRAINT IF EXISTS unique_user_category_month_income;

-- 4. Create new composite unique constraints that include account_id
ALTER TABLE category_spending_summary DROP CONSTRAINT IF EXISTS category_spending_summary_user_id_category_id_account_id_year_month_unique;
ALTER TABLE category_spending_summary ADD CONSTRAINT category_spending_summary_user_id_category_id_account_id_year_month_unique UNIQUE (user_id, category_id, account_id, year_month);

ALTER TABLE category_income_summary DROP CONSTRAINT IF EXISTS unique_user_category_account_month_income;
ALTER TABLE category_income_summary ADD CONSTRAINT unique_user_category_account_month_income UNIQUE (user_id, category_id, account_id, year_month);