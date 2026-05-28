-- ── Add category_type to categories ──────────────────────────────────────────
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "category_type" text NOT NULL DEFAULT 'standard';

-- ── Add expense_parent_id to categories ──────────────────────────────────────
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "expense_parent_id" uuid REFERENCES "categories"("id") ON DELETE SET NULL;

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "categories_category_type_idx" ON "categories"("category_type");
