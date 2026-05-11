ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "metadata" jsonb;--> statement-breakpoint
DROP TABLE IF EXISTS "manual_asset_value_history";--> statement-breakpoint
DROP TABLE IF EXISTS "manual_assets";
