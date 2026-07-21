CREATE TABLE "plan_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"owner" text DEFAULT 'primary' NOT NULL,
	"type" text NOT NULL,
	"balance" text DEFAULT '0' NOT NULL,
	"cost_basis" text DEFAULT '0' NOT NULL,
	"expected_growth_rate" text DEFAULT '6.0' NOT NULL,
	"dividend_yield" text DEFAULT '2.5' NOT NULL,
	"reinvest_dividends" boolean DEFAULT true NOT NULL,
	"qualified_dividend_ratio" text DEFAULT '1.0' NOT NULL,
	"roth_percentage" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"type" text NOT NULL,
	"owner" text DEFAULT 'primary' NOT NULL,
	"amount" text DEFAULT '0' NOT NULL,
	"frequency" text DEFAULT 'yearly' NOT NULL,
	"growth_rate" text DEFAULT '0.0' NOT NULL,
	"growth_cap" text,
	"adjust_for_inflation" boolean DEFAULT true NOT NULL,
	"start_trigger_type" text DEFAULT 'now' NOT NULL,
	"start_trigger_value" text,
	"end_trigger_type" text DEFAULT 'end_of_plan' NOT NULL,
	"end_trigger_value" text,
	"recurrence_interval" integer,
	"inflation_per_recurrence" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_flows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'invest' NOT NULL,
	"rank" integer DEFAULT 1 NOT NULL,
	"target_account_id" uuid,
	"rule_type" text NOT NULL,
	"rule_value" text,
	"match_rate" text,
	"match_limit" text,
	"match_account_id" uuid,
	"start_trigger_type" text DEFAULT 'now' NOT NULL,
	"start_trigger_value" text,
	"end_trigger_type" text DEFAULT 'end_of_plan' NOT NULL,
	"end_trigger_value" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_liabilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"owner" text DEFAULT 'primary' NOT NULL,
	"balance" text DEFAULT '0' NOT NULL,
	"interest_rate" text DEFAULT '4.5' NOT NULL,
	"monthly_payment" text DEFAULT '0' NOT NULL,
	"years_remaining" text DEFAULT '30' NOT NULL,
	"linked_asset_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_settings" (
	"plan_id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"rates_mode" text DEFAULT 'fixed' NOT NULL,
	"fixed_inflation_rate" text DEFAULT '3.0' NOT NULL,
	"fixed_benefit_cola" text DEFAULT '0.0' NOT NULL,
	"historical_start_year" integer DEFAULT 1928 NOT NULL,
	"historical_loopback_year" integer DEFAULT 1928 NOT NULL,
	"withholding_deferred" text DEFAULT '20.0' NOT NULL,
	"withholding_taxable" text DEFAULT '10.0' NOT NULL,
	"income_tax_modifier" text DEFAULT '0.0' NOT NULL,
	"cap_gains_tax_modifier" text DEFAULT '0.0' NOT NULL,
	"etr_local_tax" boolean DEFAULT false NOT NULL,
	"etr_property_tax" boolean DEFAULT false NOT NULL,
	"etr_return_of_capital" boolean DEFAULT false NOT NULL,
	"etr_non_taxable_sales" boolean DEFAULT false NOT NULL,
	"spending_mortgage_principal" boolean DEFAULT false NOT NULL,
	"spending_debt_principal" boolean DEFAULT true NOT NULL,
	"heir_flat_income_tax_rate" text DEFAULT '25.0' NOT NULL,
	"step_up_basis" boolean DEFAULT true NOT NULL,
	"real_estate_liquidation_rate" text DEFAULT '6.0' NOT NULL,
	"administrative_cost_rate" text DEFAULT '1.0' NOT NULL,
	"charitable_giving" text DEFAULT '0.0' NOT NULL,
	"charitable_allocation_strategy" text DEFAULT 'tax_inefficient_first' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"has_spouse" boolean DEFAULT false NOT NULL,
	"primary_birth_year" integer DEFAULT 1985 NOT NULL,
	"primary_birth_month" integer DEFAULT 1 NOT NULL,
	"spouse_birth_year" integer,
	"spouse_birth_month" integer,
	"country" text DEFAULT 'US' NOT NULL,
	"state_province" text,
	"filing_status" text DEFAULT 'single' NOT NULL,
	"retirement_age" integer DEFAULT 60 NOT NULL,
	"life_expectancy_age" integer DEFAULT 100 NOT NULL,
	"fi_target_multiplier" integer DEFAULT 25 NOT NULL,
	"withdrawal_method" text DEFAULT 'textbook' NOT NULL,
	"custom_withdrawal_order" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retirement_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"tax_year" integer DEFAULT 2026 NOT NULL,
	"filing_status" text DEFAULT 'single' NOT NULL,
	"standard_deduction" text DEFAULT '15000' NOT NULL,
	"ordinary_tax_brackets" jsonb NOT NULL,
	"capital_gains_brackets" jsonb NOT NULL,
	"niit_threshold" text DEFAULT '200000' NOT NULL,
	"irmaa_thresholds" jsonb NOT NULL,
	"ss_taxation_thresholds" jsonb NOT NULL,
	"contribution_limits" jsonb NOT NULL,
	"gift_estate_exemptions" jsonb NOT NULL,
	"aca_subsidy_table" jsonb NOT NULL,
	"fpl_amount" text DEFAULT '15060' NOT NULL,
	"secure_act_rules" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plan_accounts" ADD CONSTRAINT "plan_accounts_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_events" ADD CONSTRAINT "plan_events_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_flows" ADD CONSTRAINT "plan_flows_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_flows" ADD CONSTRAINT "plan_flows_target_account_id_plan_accounts_id_fk" FOREIGN KEY ("target_account_id") REFERENCES "public"."plan_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_flows" ADD CONSTRAINT "plan_flows_match_account_id_plan_accounts_id_fk" FOREIGN KEY ("match_account_id") REFERENCES "public"."plan_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_liabilities" ADD CONSTRAINT "plan_liabilities_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_settings" ADD CONSTRAINT "plan_settings_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" DROP COLUMN "show_math_enabled";