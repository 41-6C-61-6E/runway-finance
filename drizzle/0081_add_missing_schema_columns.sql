ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "budget_exclusions" jsonb DEFAULT '{"categoryIds":[],"tagIds":[]}';
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "is_discretionary" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'categories_parent_id_fkey'
  ) THEN
    UPDATE categories SET parent_id = NULL WHERE parent_id IS NOT NULL AND parent_id NOT IN (SELECT id FROM categories);
    ALTER TABLE categories ADD CONSTRAINT categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'sent_notifications_user_id_key_unique'
  ) THEN
    DELETE FROM sent_notifications
    WHERE id IN (
      SELECT id FROM (
        SELECT id, row_number() OVER (PARTITION BY user_id, key ORDER BY sent_at DESC) AS rn
        FROM sent_notifications
      ) dup
      WHERE dup.rn > 1
    );
    ALTER TABLE sent_notifications ADD CONSTRAINT sent_notifications_user_id_key_unique UNIQUE (user_id, key);
  END IF;
END $$;
