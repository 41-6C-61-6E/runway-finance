ALTER TABLE "plan_accounts" ADD COLUMN "is_included" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "spouse_name" text DEFAULT 'Spouse / Partner' NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "spouse_retirement_age" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "spouse_life_expectancy_age" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "primary_ss_monthly_amount" text DEFAULT '2500' NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "primary_ss_start_age" integer DEFAULT 67 NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "spouse_ss_monthly_amount" text DEFAULT '2000' NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "spouse_ss_start_age" integer DEFAULT 67 NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "enable_spousal_ss_benefit" boolean DEFAULT true NOT NULL;