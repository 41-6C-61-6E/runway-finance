DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_settings' AND column_name='notify_daily_net_worth_change') THEN
    ALTER TABLE "user_settings" RENAME COLUMN "notify_daily_net_worth_change" TO "notify_weekly_net_worth_change";
  ELSE
    ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "notify_weekly_net_worth_change" boolean DEFAULT true NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_settings' AND column_name='daily_net_worth_alert_time') THEN
    ALTER TABLE "user_settings" DROP COLUMN "daily_net_worth_alert_time";
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "weekly_net_worth_alert_day" text DEFAULT 'sunday' NOT NULL;