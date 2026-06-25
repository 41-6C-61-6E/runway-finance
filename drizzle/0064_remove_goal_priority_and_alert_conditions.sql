ALTER TABLE "custom_alert_rules" ALTER COLUMN "criteria" SET DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "custom_alert_rules" ADD COLUMN IF NOT EXISTS "condition_tree" jsonb;--> statement-breakpoint
ALTER TABLE "financial_goals" DROP COLUMN IF EXISTS "priority";--> statement-breakpoint
ALTER TABLE "goal_allocation_history" DROP COLUMN IF EXISTS "priority";