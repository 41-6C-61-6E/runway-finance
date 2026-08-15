CREATE INDEX IF NOT EXISTS "transactions_user_uncat_idx" ON "transactions" ("user_id", "date") WHERE "category_id" IS NULL AND "deleted" = false;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_user_pending_idx" ON "transactions" ("user_id", "id") WHERE "pending" = true;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_user_import_idx" ON "transactions" ("user_id", "import_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_user_parent_idx" ON "transactions" ("user_id", "parent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_user_posted_date_idx" ON "transactions" ("user_id", "posted_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "net_worth_snapshots_user_date_idx" ON "net_worth_snapshots" ("user_id", "snapshot_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "monthly_cash_flow_user_ym_idx" ON "monthly_cash_flow" ("user_id", "year_month");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_proposals_user_status_idx" ON "ai_proposals" ("user_id", "status");
