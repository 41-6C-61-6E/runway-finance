import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { getDb } from '../lib/db';
import { accounts } from '../lib/db/schema';
import { recalculateNetWorthSnapshots } from '../lib/services/account-history';
import { getServerDEK } from '../lib/crypto-context';

async function run() {
  const db = getDb();
  console.log('Querying distinct user IDs from accounts...');
  const users = await db
    .select({ userId: accounts.userId })
    .from(accounts)
    .groupBy(accounts.userId);

  console.log(`Found ${users.length} users.`);

  for (const user of users) {
    const userId = user.userId;
    console.log(`Recalculating net worth snapshots for user: ${userId}`);
    try {
      const dek = await getServerDEK(userId);
      await recalculateNetWorthSnapshots(userId, dek);
      console.log(`  Successfully recalculated for user ${userId}`);
    } catch (err) {
      console.error(`  Failed for user ${userId}:`, err);
    }
  }

  console.log('Done recalculating net worth snapshots!');
  process.exit(0);
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
