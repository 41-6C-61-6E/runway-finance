CREATE TABLE "account_share_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"primary_user_id" text NOT NULL,
	"member_user_id" text NOT NULL,
	"invitation_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	"removed_by" text,
	CONSTRAINT "account_share_members_primary_user_id_member_user_id_unique" UNIQUE("primary_user_id","member_user_id")
);
--> statement-breakpoint
CREATE TABLE "account_sharing_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inviter_user_id" text NOT NULL,
	"invitee_email" text NOT NULL,
	"pin_hash" text NOT NULL,
	"pin" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"account_id" uuid NOT NULL,
	"snapshot_date" date NOT NULL,
	"balance" text NOT NULL,
	"is_synthetic" boolean DEFAULT false NOT NULL,
	"is_imported" boolean DEFAULT false NOT NULL,
	"import_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_snapshots_user_id_account_id_snapshot_date_unique" UNIQUE("user_id","account_id","snapshot_date")
);
--> statement-breakpoint
CREATE TABLE "account_tags" (
	"account_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "account_tags_account_id_tag_id_unique" UNIQUE("account_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "ai_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"endpoint" text NOT NULL,
	"model" text NOT NULL,
	"api_key_encrypted" text,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_tags" (
	"budget_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "budget_tags_budget_id_tag_id_unique" UNIQUE("budget_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"category_id" uuid NOT NULL,
	"year_month" text,
	"period_type" text DEFAULT 'monthly' NOT NULL,
	"period_key" text,
	"amount" text NOT NULL,
	"is_recurring" boolean DEFAULT true NOT NULL,
	"funding_account_id" uuid,
	"rollover" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category_income_summary" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"category_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"year_month" text NOT NULL,
	"amount" text NOT NULL,
	"transaction_count" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "category_income_summary_user_id_category_id_account_id_year_month_unique" UNIQUE("user_id","category_id","account_id","year_month")
);
--> statement-breakpoint
CREATE TABLE "category_spending_summary" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"category_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"year_month" text NOT NULL,
	"amount" text NOT NULL,
	"transaction_count" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "category_spending_summary_user_id_category_id_account_id_year_month_unique" UNIQUE("user_id","category_id","account_id","year_month")
);
--> statement-breakpoint
CREATE TABLE "financial_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"type" text NOT NULL,
	"target_amount" text NOT NULL,
	"current_amount" text NOT NULL,
	"target_date" date,
	"category" text,
	"priority" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"linked_account_id" uuid,
	"percentage" text NOT NULL,
	"reserve" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"allocated_amount" text DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goal_allocation_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"goal_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"snapshot_date" date DEFAULT now() NOT NULL,
	"account_balance" text NOT NULL,
	"allocated_amount" text DEFAULT '0' NOT NULL,
	"desired_amount" text DEFAULT '0' NOT NULL,
	"percentage" text DEFAULT '100' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_underfunded" boolean DEFAULT false NOT NULL,
	"remaining_on_account" text DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goal_tags" (
	"goal_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "goal_tags_goal_id_tag_id_unique" UNIQUE("goal_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "holding_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"account_id" uuid NOT NULL,
	"snapshot_date" date NOT NULL,
	"security_id" text NOT NULL,
	"ticker" text,
	"name" text,
	"quantity" text NOT NULL,
	"price" text NOT NULL,
	"value" text NOT NULL,
	"cost_basis" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "holding_snapshots_user_id_account_id_security_id_snapshot_date_unique" UNIQUE("user_id","account_id","security_id","snapshot_date")
);
--> statement-breakpoint
CREATE TABLE "holdings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"account_id" uuid NOT NULL,
	"security_id" text NOT NULL,
	"ticker" text,
	"name" text,
	"quantity" text NOT NULL,
	"price" text NOT NULL,
	"cost_basis" text,
	"value" text NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "holdings_account_id_security_id_unique" UNIQUE("account_id","security_id")
);
--> statement-breakpoint
CREATE TABLE "import_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"file_name" text NOT NULL,
	"import_type" text NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"records_imported" integer DEFAULT 0 NOT NULL,
	"records_skipped" integer DEFAULT 0 NOT NULL,
	"records_errored" integer DEFAULT 0 NOT NULL,
	"column_mapping" jsonb,
	"account_mapping" jsonb,
	"category_mapping" jsonb,
	"start_date" date,
	"end_date" date,
	"data_start_date" date,
	"data_end_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monthly_cash_flow" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"year_month" text NOT NULL,
	"total_income" text NOT NULL,
	"total_expenses" text NOT NULL,
	"net_cash_flow" text NOT NULL,
	"transaction_count" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monthly_cash_flow_user_id_year_month_unique" UNIQUE("user_id","year_month")
);
--> statement-breakpoint
CREATE TABLE "paystub_auto_generate_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"mapping_id" uuid NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"frequency" text DEFAULT 'weekly' NOT NULL,
	"base_paystub_id" uuid,
	"last_generated_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "paystub_auto_generate_settings_user_id_mapping_id_unique" UNIQUE("user_id","mapping_id")
);
--> statement-breakpoint
CREATE TABLE "paystub_field_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"employer_name" text DEFAULT '' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"mappings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"account_id" uuid,
	"tag_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paystub_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"paystub_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"section" text NOT NULL,
	"description" text NOT NULL,
	"amount" text DEFAULT '0' NOT NULL,
	"ytd_amount" text,
	"hours" text,
	"rate" text,
	"ytd_hours" text,
	"mapping_action" text DEFAULT 'import' NOT NULL,
	"category_id" uuid,
	"transaction_id" uuid
);
--> statement-breakpoint
CREATE TABLE "paystubs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"employer_name" text DEFAULT '' NOT NULL,
	"employee_name" text,
	"pay_period_start" date NOT NULL,
	"pay_period_end" date NOT NULL,
	"check_date" date NOT NULL,
	"advice_number" text,
	"gross_current" text DEFAULT '0' NOT NULL,
	"taxes_current" text DEFAULT '0' NOT NULL,
	"deductions_current" text DEFAULT '0' NOT NULL,
	"net_current" text DEFAULT '0' NOT NULL,
	"gross_ytd" text,
	"taxes_ytd" text,
	"deductions_ytd" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"is_auto_generated" boolean DEFAULT false NOT NULL,
	"mapping_id" uuid,
	"source_json" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plaid_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"access_token_encrypted" text NOT NULL,
	"access_token_iv" text DEFAULT '' NOT NULL,
	"access_token_tag" text DEFAULT '' NOT NULL,
	"item_id" text NOT NULL,
	"institution_id" text,
	"institution_name" text,
	"cursor" text,
	"label" text DEFAULT 'Plaid Connection' NOT NULL,
	"sync_frequency" text DEFAULT 'manual' NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_sync_status" text DEFAULT 'pending' NOT NULL,
	"last_sync_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#6366f1' NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_tags" (
	"transaction_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "transaction_tags_transaction_id_tag_id_unique" UNIQUE("transaction_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "user_encryption_keys" (
	"user_id" text PRIMARY KEY NOT NULL,
	"wrapped_dek" text NOT NULL,
	"wrapping_iv" text NOT NULL,
	"wrapping_tag" text NOT NULL,
	"server_wrapped_dek" text,
	"server_wrapping_iv" text,
	"server_wrapping_tag" text,
	"salt" text NOT NULL,
	"primary_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"email" text,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "fire_scenarios" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "manual_asset_value_history" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "manual_assets" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "fire_scenarios" CASCADE;--> statement-breakpoint
DROP TABLE "manual_asset_value_history" CASCADE;--> statement-breakpoint
DROP TABLE "manual_assets" CASCADE;--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "connection_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "balance" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "balance" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "net_worth_snapshots" ALTER COLUMN "total_assets" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "net_worth_snapshots" ALTER COLUMN "total_liabilities" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "net_worth_snapshots" ALTER COLUMN "net_worth" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "sync_logs" ALTER COLUMN "accounts_synced" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "sync_logs" ALTER COLUMN "accounts_synced" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "sync_logs" ALTER COLUMN "transactions_fetched" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "sync_logs" ALTER COLUMN "transactions_fetched" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "sync_logs" ALTER COLUMN "transactions_new" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "sync_logs" ALTER COLUMN "transactions_new" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "sync_logs" ALTER COLUMN "duration_ms" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "amount" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "user_settings" ALTER COLUMN "theme" SET DEFAULT 'moonlight';--> statement-breakpoint
ALTER TABLE "user_settings" ALTER COLUMN "accent_color" SET DEFAULT 'violet';--> statement-breakpoint
ALTER TABLE "ai_proposals" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ai_proposals" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "ai_proposals" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ai_proposals" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "plaid_connection_id" uuid;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "metadata" text;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "category_type" text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "expense_parent_id" uuid;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "created_by_ai" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "category_rules" ADD COLUMN "conditions" jsonb;--> statement-breakpoint
ALTER TABLE "category_rules" ADD COLUMN "set_tag_id" uuid;--> statement-breakpoint
ALTER TABLE "category_rules" ADD COLUMN "created_by_ai" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "category_rules" ADD COLUMN "override_existing" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "simplefin_connections" ADD COLUMN "sync_frequency" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "simplefin_connections" ADD COLUMN "disabled_accounts" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "sync_logs" ADD COLUMN "plaid_connection_id" uuid;--> statement-breakpoint
ALTER TABLE "sync_logs" ADD COLUMN "details" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "categorized_by_ai" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "deleted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "is_imported" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "import_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "source" text DEFAULT 'bank' NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "paystub_id" uuid;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "privacy_mode" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "chart_visibility" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "chart_color_scheme" text DEFAULT 'fauntleroy' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "forecast_mode" text DEFAULT 'hybrid' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "forecast_lookback_months" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "hidden_pages" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "show_synthetic_data" jsonb DEFAULT '{"global":true,"netWorth":true,"investments":true,"realEstate":true,"cashFlowProjections":true}'::jsonb;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "show_imported_data" jsonb DEFAULT '{"global":true,"netWorth":true,"investments":true,"realEstate":true,"cashFlowProjections":true}'::jsonb;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "use_market_data_for_snapshots" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "default_chart_time_range" text DEFAULT '1y' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "default_chart_type" text DEFAULT 'line' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "reduce_transparency" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "hide_account_subheadings" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "hide_accounts_sidebar_by_default" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "chart_selections" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "card_collapsed_states" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "show_math_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "paystub_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "ai_auto_approve" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "ai_analysis_timeout_seconds" integer DEFAULT 3600 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "ai_active_provider_id" uuid;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "api_keys" text;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "account_tag_visibility" jsonb DEFAULT '{"sidebar":true,"transactions":true,"legend":true,"budgets":true,"forecast":true,"suggestions":true}'::jsonb;--> statement-breakpoint
ALTER TABLE "account_share_members" ADD CONSTRAINT "account_share_members_invitation_id_account_sharing_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."account_sharing_invitations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_snapshots" ADD CONSTRAINT "account_snapshots_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_snapshots" ADD CONSTRAINT "account_snapshots_import_id_import_log_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."import_log"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_tags" ADD CONSTRAINT "account_tags_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_tags" ADD CONSTRAINT "account_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_tags" ADD CONSTRAINT "budget_tags_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_tags" ADD CONSTRAINT "budget_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_funding_account_id_accounts_id_fk" FOREIGN KEY ("funding_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_income_summary" ADD CONSTRAINT "category_income_summary_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_income_summary" ADD CONSTRAINT "category_income_summary_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_spending_summary" ADD CONSTRAINT "category_spending_summary_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_spending_summary" ADD CONSTRAINT "category_spending_summary_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_goals" ADD CONSTRAINT "financial_goals_linked_account_id_accounts_id_fk" FOREIGN KEY ("linked_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_allocation_history" ADD CONSTRAINT "goal_allocation_history_goal_id_financial_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."financial_goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_allocation_history" ADD CONSTRAINT "goal_allocation_history_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_tags" ADD CONSTRAINT "goal_tags_goal_id_financial_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."financial_goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_tags" ADD CONSTRAINT "goal_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holding_snapshots" ADD CONSTRAINT "holding_snapshots_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paystub_auto_generate_settings" ADD CONSTRAINT "paystub_auto_generate_settings_mapping_id_paystub_field_mappings_id_fk" FOREIGN KEY ("mapping_id") REFERENCES "public"."paystub_field_mappings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paystub_auto_generate_settings" ADD CONSTRAINT "paystub_auto_generate_settings_base_paystub_id_paystubs_id_fk" FOREIGN KEY ("base_paystub_id") REFERENCES "public"."paystubs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paystub_field_mappings" ADD CONSTRAINT "paystub_field_mappings_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paystub_field_mappings" ADD CONSTRAINT "paystub_field_mappings_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paystub_line_items" ADD CONSTRAINT "paystub_line_items_paystub_id_paystubs_id_fk" FOREIGN KEY ("paystub_id") REFERENCES "public"."paystubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paystub_line_items" ADD CONSTRAINT "paystub_line_items_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paystub_line_items" ADD CONSTRAINT "paystub_line_items_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_tags" ADD CONSTRAINT "transaction_tags_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_tags" ADD CONSTRAINT "transaction_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_plaid_connection_id_plaid_connections_id_fk" FOREIGN KEY ("plaid_connection_id") REFERENCES "public"."plaid_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_rules" ADD CONSTRAINT "category_rules_set_tag_id_tags_id_fk" FOREIGN KEY ("set_tag_id") REFERENCES "public"."tags"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_logs" ADD CONSTRAINT "sync_logs_plaid_connection_id_plaid_connections_id_fk" FOREIGN KEY ("plaid_connection_id") REFERENCES "public"."plaid_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_import_id_import_log_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."import_log"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" DROP COLUMN "ai_endpoint";--> statement-breakpoint
ALTER TABLE "user_settings" DROP COLUMN "ai_model";--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_plaid_connection_id_external_id_unique" UNIQUE("plaid_connection_id","external_id");