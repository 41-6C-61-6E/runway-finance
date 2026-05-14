-- Add hidden pages configuration to user_settings
ALTER TABLE user_settings ADD COLUMN hidden_pages jsonb DEFAULT '{}'::jsonb;
