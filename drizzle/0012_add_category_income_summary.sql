-- Create category_income_summary table for tracking income by category per month
CREATE TABLE IF NOT EXISTS category_income_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  year_month text NOT NULL,
  amount numeric(20, 4) NOT NULL,
  transaction_count integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT unique_user_category_month_income UNIQUE (user_id, category_id, year_month)
);
