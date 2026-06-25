ALTER TABLE "custom_alert_rules" ADD COLUMN "condition_operator" text DEFAULT 'AND';--> statement-breakpoint
ALTER TABLE "custom_alert_rules" ADD COLUMN "conditions" jsonb;