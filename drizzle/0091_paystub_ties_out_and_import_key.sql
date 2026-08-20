-- P-2 (TAX_PAYROLL_REVIEW.md): reconciliation flag on imported paystubs.
ALTER TABLE "paystubs" ADD COLUMN "ties_out" boolean;
--> statement-breakpoint
-- P-4: stable dedupe key for imports from employers without advice numbers.
ALTER TABLE "paystubs" ADD COLUMN "import_key" text;
CREATE UNIQUE INDEX "paystubs_import_key_unique" ON "paystubs" ("import_key");
