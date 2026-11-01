ALTER TABLE "sync_logs" DROP CONSTRAINT IF EXISTS "sync_logs_connection_id_simplefin_connections_id_fk";
--> statement-breakpoint
ALTER TABLE "sync_logs" DROP CONSTRAINT IF EXISTS "sync_logs_connection_id_fkey";
--> statement-breakpoint
ALTER TABLE "sync_logs" DROP CONSTRAINT IF EXISTS "sync_logs_plaid_connection_id_plaid_connections_id_fk";
--> statement-breakpoint
ALTER TABLE "sync_logs" DROP CONSTRAINT IF EXISTS "sync_logs_plaid_connection_id_fkey";
--> statement-breakpoint
ALTER TABLE "paystubs" DROP CONSTRAINT IF EXISTS "paystubs_mapping_id_fk";
--> statement-breakpoint
ALTER TABLE "paystubs" DROP CONSTRAINT IF EXISTS "paystubs_mapping_id_paystub_field_mappings_id_fk";
--> statement-breakpoint
ALTER TABLE "plan_liabilities" DROP CONSTRAINT IF EXISTS "plan_liabilities_linked_asset_id_plan_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "plan_liabilities" DROP CONSTRAINT IF EXISTS "plan_liabilities_linked_asset_id_fkey";
--> statement-breakpoint
ALTER TABLE "net_worth_snapshots" ALTER COLUMN "breakdown" SET DATA TYPE text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "token_version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "financial_goals" ADD COLUMN IF NOT EXISTS "initial_amount" text DEFAULT '0' NOT NULL;
--> statement-breakpoint
ALTER TABLE "plan_accounts" ADD COLUMN IF NOT EXISTS "conversion_vintages" jsonb;
--> statement-breakpoint
DELETE FROM "sync_logs" WHERE "connection_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "simplefin_connections" WHERE "id" = "sync_logs"."connection_id");
--> statement-breakpoint
DELETE FROM "sync_logs" WHERE "plaid_connection_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "plaid_connections" WHERE "id" = "sync_logs"."plaid_connection_id");
--> statement-breakpoint
UPDATE "paystubs" SET "mapping_id" = NULL WHERE "mapping_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "paystub_field_mappings" WHERE "id" = "paystubs"."mapping_id");
--> statement-breakpoint
UPDATE "plan_liabilities" SET "linked_asset_id" = NULL WHERE "linked_asset_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "plan_accounts" WHERE "id" = "plan_liabilities"."linked_asset_id");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sync_logs" ADD CONSTRAINT "sync_logs_connection_id_simplefin_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."simplefin_connections"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sync_logs" ADD CONSTRAINT "sync_logs_plaid_connection_id_plaid_connections_id_fk" FOREIGN KEY ("plaid_connection_id") REFERENCES "public"."plaid_connections"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "paystubs" ADD CONSTRAINT "paystubs_mapping_id_paystub_field_mappings_id_fk" FOREIGN KEY ("mapping_id") REFERENCES "public"."paystub_field_mappings"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "plan_liabilities" ADD CONSTRAINT "plan_liabilities_linked_asset_id_plan_accounts_id_fk" FOREIGN KEY ("linked_asset_id") REFERENCES "public"."plan_accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_user_del_date_idx" ON "transactions" USING btree ("user_id","deleted","date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_paystub_items_paystub" ON "paystub_line_items" USING btree ("paystub_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_paystub_items_user" ON "paystub_line_items" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_paystubs_user_date" ON "paystubs" USING btree ("user_id","check_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_notifications_user_read" ON "user_notifications" USING btree ("user_id","is_read","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plan_accounts_plan_id_idx" ON "plan_accounts" USING btree ("plan_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plan_accounts_user_id_idx" ON "plan_accounts" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plan_events_plan_id_idx" ON "plan_events" USING btree ("plan_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plan_events_user_id_idx" ON "plan_events" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plan_flows_plan_id_idx" ON "plan_flows" USING btree ("plan_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plan_flows_user_id_idx" ON "plan_flows" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plan_liabilities_plan_id_idx" ON "plan_liabilities" USING btree ("plan_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plan_liabilities_user_id_idx" ON "plan_liabilities" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plans_user_id_idx" ON "plans" USING btree ("user_id");
