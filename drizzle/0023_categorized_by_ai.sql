-- Add categorized_by_ai column to transactions
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS categorized_by_ai BOOLEAN NOT NULL DEFAULT false;
