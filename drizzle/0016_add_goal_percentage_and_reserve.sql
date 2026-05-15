-- Add percentage and reserve columns to financial_goals
ALTER TABLE financial_goals ADD COLUMN IF NOT EXISTS percentage NUMERIC(5,2) DEFAULT 100;
ALTER TABLE financial_goals ADD COLUMN IF NOT EXISTS reserve NUMERIC(20,4) DEFAULT 0;
