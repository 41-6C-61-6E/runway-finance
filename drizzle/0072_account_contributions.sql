ALTER TABLE "plans" ADD COLUMN "primary_salary" text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "spouse_salary" text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "plan_accounts" ADD COLUMN "contribution_mode" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "plan_accounts" ADD COLUMN "contribution_value" text;--> statement-breakpoint
ALTER TABLE "plan_accounts" ADD COLUMN "contribution_salary_source" text;--> statement-breakpoint
ALTER TABLE "plan_accounts" ADD COLUMN "company_match_rate" text;--> statement-breakpoint
ALTER TABLE "plan_accounts" ADD COLUMN "company_match_limit" text;--> statement-breakpoint
ALTER TABLE "plan_accounts" ADD COLUMN "is_surplus_destination" boolean DEFAULT false NOT NULL;
