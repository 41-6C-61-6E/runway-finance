ALTER TABLE "custom_alert_rules" ALTER COLUMN "criteria" SET DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "custom_alert_rules" ADD COLUMN "condition_tree" jsonb;--> statement-breakpoint
ALTER TABLE "financial_goals" DROP COLUMN "priority";--> statement-breakpoint
ALTER TABLE "goal_allocation_history" DROP COLUMN "priority";