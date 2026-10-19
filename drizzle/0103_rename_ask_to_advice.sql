DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_settings' AND column_name='ai_ask_enabled') THEN
    ALTER TABLE "user_settings" RENAME COLUMN "ai_ask_enabled" TO "ai_advice_enabled";
  ELSE
    ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "ai_advice_enabled" boolean DEFAULT true NOT NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_settings' AND column_name='ai_ask_model') THEN
    ALTER TABLE "user_settings" RENAME COLUMN "ai_ask_model" TO "ai_advice_model";
  ELSE
    ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "ai_advice_model" text;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_settings' AND column_name='ai_ask_include_account_names') THEN
    ALTER TABLE "user_settings" RENAME COLUMN "ai_ask_include_account_names" TO "ai_advice_include_account_names";
  ELSE
    ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "ai_advice_include_account_names" boolean DEFAULT false NOT NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_settings' AND column_name='ai_ask_consent_host') THEN
    ALTER TABLE "user_settings" RENAME COLUMN "ai_ask_consent_host" TO "ai_advice_consent_host";
  ELSE
    ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "ai_advice_consent_host" text;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_settings' AND column_name='ai_ask_consent_at') THEN
    ALTER TABLE "user_settings" RENAME COLUMN "ai_ask_consent_at" TO "ai_advice_consent_at";
  ELSE
    ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "ai_advice_consent_at" timestamp with time zone;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_settings' AND column_name='ai_ask_token_profile') THEN
    ALTER TABLE "user_settings" RENAME COLUMN "ai_ask_token_profile" TO "ai_advice_token_profile";
  ELSE
    ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "ai_advice_token_profile" text DEFAULT 'balanced' NOT NULL;
  END IF;
END $$;