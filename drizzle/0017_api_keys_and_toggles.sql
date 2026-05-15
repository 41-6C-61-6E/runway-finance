-- Add API keys, reduce transparency, and hide account subheadings to user_settings
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS reduce_transparency BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS hide_account_subheadings BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS api_keys JSONB DEFAULT '{}'::jsonb;
