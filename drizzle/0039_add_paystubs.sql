-- ── Paystub Management Feature ───────────────────────────────────────────────

-- Core paystub storage
CREATE TABLE IF NOT EXISTS "paystubs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "employer_name" text NOT NULL DEFAULT '',
  "employee_name" text,
  "pay_period_start" date NOT NULL,
  "pay_period_end" date NOT NULL,
  "check_date" date NOT NULL,
  "advice_number" text,
  "gross_current" text NOT NULL DEFAULT '0',
  "taxes_current" text NOT NULL DEFAULT '0',
  "deductions_current" text NOT NULL DEFAULT '0',
  "net_current" text NOT NULL DEFAULT '0',
  "gross_ytd" text,
  "taxes_ytd" text,
  "deductions_ytd" text,
  "source" text NOT NULL DEFAULT 'manual',
  "is_auto_generated" boolean NOT NULL DEFAULT false,
  "mapping_id" uuid,
  "source_json" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Paystub line items (earnings, taxes, deductions)
CREATE TABLE IF NOT EXISTS "paystub_line_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "paystub_id" uuid NOT NULL REFERENCES "paystubs"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL,
  "section" text NOT NULL,
  "description" text NOT NULL,
  "amount" text NOT NULL DEFAULT '0',
  "ytd_amount" text,
  "hours" text,
  "rate" text,
  "ytd_hours" text,
  "mapping_action" text NOT NULL DEFAULT 'import',
  "category_id" uuid REFERENCES "categories"("id") ON DELETE SET NULL,
  "transaction_id" uuid REFERENCES "transactions"("id") ON DELETE SET NULL
);

-- Reusable field mapping templates
CREATE TABLE IF NOT EXISTS "paystub_field_mappings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "name" text NOT NULL,
  "employer_name" text NOT NULL DEFAULT '',
  "is_default" boolean NOT NULL DEFAULT false,
  "mappings" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Auto-generate settings per mapping
CREATE TABLE IF NOT EXISTS "paystub_auto_generate_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "mapping_id" uuid NOT NULL REFERENCES "paystub_field_mappings"("id") ON DELETE CASCADE,
  "is_enabled" boolean NOT NULL DEFAULT false,
  "frequency" text NOT NULL DEFAULT 'weekly',
  "base_paystub_id" uuid REFERENCES "paystubs"("id") ON DELETE SET NULL,
  "last_generated_date" date,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "paystub_auto_gen_mapping_unique" UNIQUE ("user_id", "mapping_id")
);

-- Add source tracking to transactions
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'bank';
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "paystub_id" uuid REFERENCES "paystubs"("id") ON DELETE SET NULL;

-- Add paystub_enabled to user_settings
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "paystub_enabled" boolean NOT NULL DEFAULT false;

-- Foreign key for paystubs.mapping_id
ALTER TABLE "paystubs" ADD CONSTRAINT "paystubs_mapping_id_fk"
  FOREIGN KEY ("mapping_id") REFERENCES "paystub_field_mappings"("id") ON DELETE SET NULL;

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "paystubs_user_id_idx" ON "paystubs"("user_id");
CREATE INDEX IF NOT EXISTS "paystubs_check_date_idx" ON "paystubs"("user_id", "check_date");
CREATE INDEX IF NOT EXISTS "paystub_line_items_paystub_id_idx" ON "paystub_line_items"("paystub_id");
CREATE INDEX IF NOT EXISTS "paystub_field_mappings_user_id_idx" ON "paystub_field_mappings"("user_id");
CREATE INDEX IF NOT EXISTS "transactions_source_idx" ON "transactions"("source");
CREATE INDEX IF NOT EXISTS "transactions_paystub_id_idx" ON "transactions"("paystub_id");
