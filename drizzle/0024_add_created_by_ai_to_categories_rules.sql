-- Add created_by_ai column to categories and category_rules
ALTER TABLE categories ADD COLUMN IF NOT EXISTS created_by_ai BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE category_rules ADD COLUMN IF NOT EXISTS created_by_ai BOOLEAN NOT NULL DEFAULT false;
