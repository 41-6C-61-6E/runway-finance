-- AI-powered categorization: proposals table and settings

-- Create ai_proposals table
CREATE TABLE IF NOT EXISTS ai_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  confidence TEXT,
  payload JSONB NOT NULL,
  explanation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add AI configuration columns to user_settings
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS ai_endpoint TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS ai_model TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS ai_system_prompt TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS ai_auto_analyze BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS ai_auto_approve_threshold INTEGER NOT NULL DEFAULT 95;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS ai_batch_size INTEGER NOT NULL DEFAULT 25;
