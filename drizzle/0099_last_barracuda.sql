CREATE INDEX IF NOT EXISTS "account_snapshots_account_date_idx" ON "account_snapshots" USING btree ("account_id","snapshot_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_snapshots_user_date_idx" ON "account_snapshots" USING btree ("user_id","snapshot_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "holding_snapshots_account_date_idx" ON "holding_snapshots" USING btree ("account_id","snapshot_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "holdings_user_id_idx" ON "holdings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "holdings_account_id_idx" ON "holdings" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_tags_tag_id_idx" ON "account_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_tags_account_id_idx" ON "account_tags" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "category_income_summary_user_ym_idx" ON "category_income_summary" USING btree ("user_id","year_month");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "category_spending_summary_user_ym_idx" ON "category_spending_summary" USING btree ("user_id","year_month");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "monthly_cash_flow_user_ym_idx" ON "monthly_cash_flow" USING btree ("user_id","year_month");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transaction_tags_tag_id_idx" ON "transaction_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transaction_tags_tx_id_idx" ON "transaction_tags" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "budget_tags_tag_id_idx" ON "budget_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "budgets_user_id_idx" ON "budgets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "financial_goals_user_id_idx" ON "financial_goals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goal_allocation_history_user_idx" ON "goal_allocation_history" USING btree ("user_id","snapshot_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goal_tags_tag_id_idx" ON "goal_tags" USING btree ("tag_id");