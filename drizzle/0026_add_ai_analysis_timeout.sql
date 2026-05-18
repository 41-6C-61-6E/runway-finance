ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS ai_analysis_timeout_seconds INTEGER NOT NULL DEFAULT 600;
