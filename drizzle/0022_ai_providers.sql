-- AI providers table: multiple named provider configurations with active selection

-- Create ai_providers table
CREATE TABLE IF NOT EXISTS ai_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  model TEXT NOT NULL,
  api_key_encrypted TEXT,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add active provider reference to user_settings
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS ai_active_provider_id UUID;

-- Migrate existing endpoint/model/apiKey into an ai_provider row if configured
INSERT INTO ai_providers (user_id, name, endpoint, model, is_active)
  SELECT user_id, 'Default', ai_endpoint, ai_model, true
  FROM user_settings
  WHERE ai_endpoint IS NOT NULL AND ai_endpoint != ''
ON CONFLICT DO NOTHING;

-- Update user_settings to reference the migrated provider
UPDATE user_settings us
  SET ai_active_provider_id = ap.id
  FROM ai_providers ap
  WHERE ap.user_id = us.user_id AND ap.name = 'Default';
