ALTER TABLE "holdings" ADD COLUMN "ticker_override" text;--> statement-breakpoint
ALTER TABLE "holdings" ADD COLUMN "public_equivalent" text;--> statement-breakpoint
ALTER TABLE "dek_version_wraps" ADD CONSTRAINT "dek_version_wraps_version_id_dek_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."dek_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_tax_rules" ADD CONSTRAINT "system_tax_rules_tax_year_unique" UNIQUE("tax_year");
