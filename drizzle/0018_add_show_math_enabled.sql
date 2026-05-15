-- Add show_math_enabled to user_settings
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS show_math_enabled BOOLEAN NOT NULL DEFAULT false;
