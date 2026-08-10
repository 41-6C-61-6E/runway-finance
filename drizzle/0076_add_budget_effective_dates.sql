ALTER TABLE "budgets" ADD COLUMN IF NOT EXISTS "effective_from" text;--> statement-breakpoint
ALTER TABLE "budgets" ADD COLUMN IF NOT EXISTS "effective_to" text;
