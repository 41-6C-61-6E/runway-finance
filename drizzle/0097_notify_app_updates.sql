ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "notify_app_updates" boolean DEFAULT true NOT NULL;
