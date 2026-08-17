CREATE TABLE IF NOT EXISTS "system_tax_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tax_year" integer DEFAULT 2026 NOT NULL,
	"country" text DEFAULT 'US' NOT NULL,
	"standard_deduction_single" text DEFAULT '15000' NOT NULL,
	"standard_deduction_mfj" text DEFAULT '30000' NOT NULL,
	"standard_deduction_hoh" text DEFAULT '22500' NOT NULL,
	"standard_deduction_mfs" text DEFAULT '15000' NOT NULL,
	"standard_deduction" text DEFAULT '15000' NOT NULL,
	"additional_std_deduction_65_plus" jsonb NOT NULL,
	"ordinary_tax_brackets" jsonb NOT NULL,
	"head_of_household_brackets" jsonb NOT NULL,
	"capital_gains_brackets" jsonb NOT NULL,
	"fica_rules" jsonb NOT NULL,
	"social_security_rules" jsonb NOT NULL,
	"early_penalty_rules" jsonb NOT NULL,
	"niit_rules" jsonb NOT NULL,
	"aca_rules" jsonb NOT NULL,
	"niit_threshold" text DEFAULT '200000' NOT NULL,
	"irmaa_thresholds" jsonb NOT NULL,
	"ss_taxation_thresholds" jsonb NOT NULL,
	"contribution_limits" jsonb NOT NULL,
	"gift_estate_exemptions" jsonb NOT NULL,
	"aca_subsidy_table" jsonb NOT NULL,
	"fpl_amount" text DEFAULT '15060' NOT NULL,
	"secure_act_rules" jsonb NOT NULL,
	"rmd_uniform_lifetime_table" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recurring_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"merchant_name" text NOT NULL,
	"match_pattern" text NOT NULL,
	"category_id" uuid,
	"account_id" uuid,
	"frequency" text NOT NULL,
	"average_amount" text NOT NULL,
	"last_amount" text NOT NULL,
	"last_date" date NOT NULL,
	"next_expected_date" date,
	"flow_type" text DEFAULT 'expense' NOT NULL,
	"is_confirmed" boolean DEFAULT false NOT NULL,
	"is_dismissed" boolean DEFAULT false NOT NULL,
	"is_paused" boolean DEFAULT false NOT NULL,
	"custom_name" text,
	"notes" text,
	"occurrence_count" integer DEFAULT 0 NOT NULL,
	"confidence" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "goal_allocation_history" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "budget_exclusions" jsonb DEFAULT '{"categoryIds":[],"tagIds":[]}'::jsonb;
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "notify_recurring_price_changes" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "notify_upcoming_bills" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "upcoming_bills_lead_days" integer DEFAULT 3 NOT NULL;
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "is_discretionary" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "budgets" ADD COLUMN IF NOT EXISTS "effective_from" text;
--> statement-breakpoint
ALTER TABLE "budgets" ADD COLUMN IF NOT EXISTS "effective_to" text;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recurring_transactions_category_id_categories_id_fk') THEN
    ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recurring_transactions_account_id_accounts_id_fk') THEN
    ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recurring_txn_user_idx" ON "recurring_transactions" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recurring_txn_user_account_idx" ON "recurring_transactions" USING btree ("user_id","account_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recurring_txn_next_date_idx" ON "recurring_transactions" USING btree ("user_id","next_expected_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "accounts_user_hidden_idx" ON "accounts" USING btree ("user_id","is_hidden");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_user_date_idx" ON "transactions" USING btree ("user_id","date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_user_account_idx" ON "transactions" USING btree ("user_id","account_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_user_category_idx" ON "transactions" USING btree ("user_id","category_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_user_deleted_idx" ON "transactions" USING btree ("user_id","deleted");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scheduler_job_logs_user_started_idx" ON "scheduler_job_logs" USING btree ("user_id","started_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scheduler_job_logs_started_at_idx" ON "scheduler_job_logs" USING btree ("started_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "issues_user_created_idx" ON "issues" USING btree ("user_id","created_at");