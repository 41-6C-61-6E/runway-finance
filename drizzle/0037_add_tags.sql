-- ── Tags ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "tags" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "name" text NOT NULL,
  "color" text NOT NULL DEFAULT '#6366f1',
  "description" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- ── Transaction Tags (join) ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "transaction_tags" (
  "transaction_id" uuid NOT NULL REFERENCES "transactions"("id") ON DELETE CASCADE,
  "tag_id" uuid NOT NULL REFERENCES "tags"("id") ON DELETE CASCADE,
  CONSTRAINT "transaction_tags_pkey" PRIMARY KEY ("transaction_id", "tag_id")
);

-- ── Account Tags (join) ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "account_tags" (
  "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE CASCADE,
  "tag_id" uuid NOT NULL REFERENCES "tags"("id") ON DELETE CASCADE,
  CONSTRAINT "account_tags_pkey" PRIMARY KEY ("account_id", "tag_id")
);

-- ── Budget Tags (join) ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "budget_tags" (
  "budget_id" uuid NOT NULL REFERENCES "budgets"("id") ON DELETE CASCADE,
  "tag_id" uuid NOT NULL REFERENCES "tags"("id") ON DELETE CASCADE,
  CONSTRAINT "budget_tags_pkey" PRIMARY KEY ("budget_id", "tag_id")
);

-- ── Goal Tags (join) ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "goal_tags" (
  "goal_id" uuid NOT NULL REFERENCES "financial_goals"("id") ON DELETE CASCADE,
  "tag_id" uuid NOT NULL REFERENCES "tags"("id") ON DELETE CASCADE,
  CONSTRAINT "goal_tags_pkey" PRIMARY KEY ("goal_id", "tag_id")
);

-- ── Add setTagId to category_rules ───────────────────────────────────────────
ALTER TABLE "category_rules" ADD COLUMN IF NOT EXISTS "set_tag_id" uuid REFERENCES "tags"("id") ON DELETE SET NULL;

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "tags_user_id_idx" ON "tags"("user_id");
CREATE INDEX IF NOT EXISTS "transaction_tags_tag_id_idx" ON "transaction_tags"("tag_id");
CREATE INDEX IF NOT EXISTS "account_tags_tag_id_idx" ON "account_tags"("tag_id");
CREATE INDEX IF NOT EXISTS "budget_tags_tag_id_idx" ON "budget_tags"("tag_id");
CREATE INDEX IF NOT EXISTS "goal_tags_tag_id_idx" ON "goal_tags"("tag_id");
