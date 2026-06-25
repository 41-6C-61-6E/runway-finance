ALTER TABLE "user_settings" ADD COLUMN "budget_alert_threshold" integer DEFAULT 80 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "notify_goal_milestones" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "notify_net_worth_milestones" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "net_worth_milestone_interval" integer DEFAULT 100000 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "notify_ai_proposals" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "max_notifications_per_period" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "notification_limiter_period_minutes" integer DEFAULT 60 NOT NULL;