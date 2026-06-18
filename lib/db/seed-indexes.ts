import { config } from 'dotenv';
config({ path: '.env' });

import { getDb } from '../db';
import { sql } from 'drizzle-orm';

async function addIndexes() {
  const db = getDb();
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, date DESC);
    CREATE INDEX IF NOT EXISTS idx_transactions_account_date ON transactions(account_id, date DESC);
    CREATE INDEX IF NOT EXISTS idx_transactions_user_category ON transactions(user_id, category_id);
    CREATE INDEX IF NOT EXISTS idx_accounts_user_hidden ON accounts(user_id, is_hidden);
    CREATE INDEX IF NOT EXISTS idx_transaction_tags_tag_id ON transaction_tags(tag_id);
    CREATE INDEX IF NOT EXISTS idx_account_tags_tag_id ON account_tags(tag_id);
    CREATE INDEX IF NOT EXISTS idx_budget_tags_tag_id ON budget_tags(tag_id);
    CREATE INDEX IF NOT EXISTS idx_goal_tags_tag_id ON goal_tags(tag_id);
    CREATE INDEX IF NOT EXISTS idx_account_snapshots_account_date ON account_snapshots(account_id, snapshot_date DESC);
    -- idx_transactions_fts dropped — description/payee/notes are encrypted now
  `);
  console.log('Indexes created.');
  process.exit(0);
}
addIndexes().catch(console.error);
