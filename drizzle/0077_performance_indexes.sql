CREATE INDEX IF NOT EXISTS "transactions_user_date_idx" ON "transactions" ("user_id", "date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_user_account_idx" ON "transactions" ("user_id", "account_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_user_category_idx" ON "transactions" ("user_id", "category_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_user_deleted_idx" ON "transactions" ("user_id", "deleted");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "accounts_user_hidden_idx" ON "accounts" ("user_id", "is_hidden");
