ALTER TABLE "user_settings" RENAME COLUMN "notify_daily_net_worth_change" TO "notify_weekly_net_worth_change";--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "weekly_net_worth_alert_day" text DEFAULT 'sunday' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" DROP COLUMN "daily_net_worth_alert_time";