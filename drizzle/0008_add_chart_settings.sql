ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS chart_visibility JSONB DEFAULT '{}'::jsonb;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS chart_color_scheme TEXT NOT NULL DEFAULT 'forest';
