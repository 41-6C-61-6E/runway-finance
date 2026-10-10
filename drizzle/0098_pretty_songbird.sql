ALTER TABLE "user_settings" ALTER COLUMN "account_tag_visibility" SET DEFAULT '{"sidebar":true,"transactions":true,"legend":true,"budgets":true,"forecast":true,"suggestions":true,"accounts":true}'::jsonb;--> statement-breakpoint
ALTER TABLE "ai_providers" ADD COLUMN "fallback_models" text;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "notify_app_updates" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "plaid_connections" ADD COLUMN "balance_source" text DEFAULT 'current' NOT NULL;--> statement-breakpoint
ALTER TABLE "simplefin_connections" ADD COLUMN "balance_source" text DEFAULT 'current' NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "current_balance" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "available_balance" text;