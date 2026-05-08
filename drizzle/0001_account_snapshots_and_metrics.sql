-- Create account_snapshots table for historical account balance tracking
CREATE TABLE "account_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"account_id" uuid NOT NULL,
	"snapshot_date" date NOT NULL,
	"balance" numeric(20, 4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_snapshots_user_id_account_id_snapshot_date_unique" UNIQUE("user_id","account_id","snapshot_date")
);
--> statement-breakpoint

-- Create monthly_cash_flow table for pre-aggregated monthly reporting
CREATE TABLE "monthly_cash_flow" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"year_month" text NOT NULL,
	"total_income" numeric(20, 4) DEFAULT '0' NOT NULL,
	"total_expenses" numeric(20, 4) DEFAULT '0' NOT NULL,
	"net_cash_flow" numeric(20, 4) DEFAULT '0' NOT NULL,
	"transaction_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monthly_cash_flow_user_id_year_month_unique" UNIQUE("user_id","year_month")
);
--> statement-breakpoint

-- Create category_spending_summary table for monthly category breakdown
CREATE TABLE "category_spending_summary" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"category_id" uuid NOT NULL,
	"year_month" text NOT NULL,
	"amount" numeric(20, 4) NOT NULL,
	"transaction_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "category_spending_summary_user_id_category_id_year_month_unique" UNIQUE("user_id","category_id","year_month")
);
--> statement-breakpoint

-- Create budgets table for budget tracking and planning
CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"category_id" uuid NOT NULL,
	"year_month" text,
	"amount" numeric(20, 4) NOT NULL,
	"is_recurring" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Create financial_goals table for savings and financial goals
CREATE TABLE "financial_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"type" text NOT NULL,
	"target_amount" numeric(20, 4) NOT NULL,
	"current_amount" numeric(20, 4) DEFAULT '0' NOT NULL,
	"target_date" date,
	"category" text,
	"priority" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"linked_account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Add foreign key constraints
ALTER TABLE "account_snapshots" ADD CONSTRAINT "account_snapshots_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "category_spending_summary" ADD CONSTRAINT "category_spending_summary_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "financial_goals" ADD CONSTRAINT "financial_goals_linked_account_id_accounts_id_fk" FOREIGN KEY ("linked_account_id") REFERENCES "accounts"("id") ON DELETE set null;
--> statement-breakpoint

-- Create indexes for common queries
CREATE INDEX "account_snapshots_user_id_snapshot_date_idx" ON "account_snapshots"("user_id", "snapshot_date");
--> statement-breakpoint
CREATE INDEX "monthly_cash_flow_user_id_year_month_idx" ON "monthly_cash_flow"("user_id", "year_month");
--> statement-breakpoint
CREATE INDEX "category_spending_summary_user_id_year_month_idx" ON "category_spending_summary"("user_id", "year_month");
--> statement-breakpoint
CREATE INDEX "budgets_user_id_year_month_idx" ON "budgets"("user_id", "year_month");
--> statement-breakpoint
CREATE INDEX "financial_goals_user_id_status_idx" ON "financial_goals"("user_id", "status");
