ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS chart_visibility JSONB DEFAULT '{}'::jsonb;
