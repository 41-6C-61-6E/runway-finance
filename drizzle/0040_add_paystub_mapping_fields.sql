ALTER TABLE "paystub_field_mappings" ADD COLUMN IF NOT EXISTS "account_id" uuid;
ALTER TABLE "paystub_field_mappings" ADD COLUMN IF NOT EXISTS "tag_id" uuid;

DO $$ BEGIN
  ALTER TABLE "paystub_field_mappings" ADD CONSTRAINT "paystub_field_mappings_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "paystub_field_mappings" ADD CONSTRAINT "paystub_field_mappings_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;