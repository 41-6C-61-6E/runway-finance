ALTER TABLE "plans" ADD COLUMN "primary_salary_year" integer DEFAULT 2026 NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "primary_salary_raise_pct" text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "primary_salary_overrides" jsonb;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "spouse_salary_year" integer DEFAULT 2026 NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "spouse_salary_raise_pct" text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "spouse_salary_overrides" jsonb;
