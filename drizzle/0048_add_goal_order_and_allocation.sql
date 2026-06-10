-- Add goal ordering and allocation tracking for multi-goal fund prioritization
ALTER TABLE financial_goals ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;
ALTER TABLE financial_goals ADD COLUMN IF NOT EXISTS allocated_amount numeric(20,4) DEFAULT '0';
