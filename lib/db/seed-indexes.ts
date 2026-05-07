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
    CREATE INDEX IF NOT EXISTS idx_transactions_fts ON transactions
      USING GIN(to_tsvector('english',
        description || ' ' || COALESCE(payee,'') || ' ' || COALESCE(notes,'')
      ));
  `);
  console.log('Indexes created.');
  process.exit(0);
}
addIndexes().catch(console.error);
