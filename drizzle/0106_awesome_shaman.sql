ALTER TABLE "sync_logs" DROP CONSTRAINT "sync_logs_connection_id_simplefin_connections_id_fk";
--> statement-breakpoint
ALTER TABLE "sync_logs" DROP CONSTRAINT "sync_logs_plaid_connection_id_plaid_connections_id_fk";
--> statement-breakpoint
ALTER TABLE "net_worth_snapshots" ALTER COLUMN "breakdown" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "token_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "financial_goals" ADD COLUMN "initial_amount" text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "plan_accounts" ADD COLUMN "conversion_vintages" jsonb;--> statement-breakpoint
ALTER TABLE "sync_logs" ADD CONSTRAINT "sync_logs_connection_id_simplefin_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."simplefin_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_logs" ADD CONSTRAINT "sync_logs_plaid_connection_id_plaid_connections_id_fk" FOREIGN KEY ("plaid_connection_id") REFERENCES "public"."plaid_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paystubs" ADD CONSTRAINT "paystubs_mapping_id_paystub_field_mappings_id_fk" FOREIGN KEY ("mapping_id") REFERENCES "public"."paystub_field_mappings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_liabilities" ADD CONSTRAINT "plan_liabilities_linked_asset_id_plan_accounts_id_fk" FOREIGN KEY ("linked_asset_id") REFERENCES "public"."plan_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transactions_user_del_date_idx" ON "transactions" USING btree ("user_id","deleted","date");--> statement-breakpoint
CREATE INDEX "idx_paystub_items_paystub" ON "paystub_line_items" USING btree ("paystub_id");--> statement-breakpoint
CREATE INDEX "idx_paystub_items_user" ON "paystub_line_items" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_paystubs_user_date" ON "paystubs" USING btree ("user_id","check_date");--> statement-breakpoint
CREATE INDEX "idx_user_notifications_user_read" ON "user_notifications" USING btree ("user_id","is_read","created_at");--> statement-breakpoint
CREATE INDEX "plan_accounts_plan_id_idx" ON "plan_accounts" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "plan_accounts_user_id_idx" ON "plan_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "plan_events_plan_id_idx" ON "plan_events" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "plan_events_user_id_idx" ON "plan_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "plan_flows_plan_id_idx" ON "plan_flows" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "plan_flows_user_id_idx" ON "plan_flows" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "plan_liabilities_plan_id_idx" ON "plan_liabilities" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "plan_liabilities_user_id_idx" ON "plan_liabilities" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "plans_user_id_idx" ON "plans" USING btree ("user_id");