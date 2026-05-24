import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { getDb } from '../lib/db';
import { accounts } from '../lib/db/schema';
import { inArray } from 'drizzle-orm';
import { generateAssetHistorySnapshots } from '../lib/services/asset-estimator';
import { getServerDEK } from '../lib/crypto-context';
import { readApiConfig } from '../lib/services/manual-accounts';
import { decryptRow } from '../lib/crypto';

const MODEL_SNAPSHOT_TYPES = [
  'realestate',
  'primaryhome',
  'secondaryhome',
  'rentalproperty',
  'commercial',
  'land',
  'otherrealestate',
  'vehicle',
  'metals',
  'mortgage'
];

async function run() {
  const db = getDb();
  console.log('Querying model-based accounts...');
  
  const allAccounts = await db
    .select()
    .from(accounts)
    .where(inArray(accounts.type, MODEL_SNAPSHOT_TYPES));

  console.log(`Found ${allAccounts.length} accounts to process.`);

  // Group accounts by userId
  const accountsByUser: Record<string, typeof allAccounts> = {};
  for (const acc of allAccounts) {
    if (!accountsByUser[acc.userId]) {
      accountsByUser[acc.userId] = [];
    }
    accountsByUser[acc.userId].push(acc);
  }

  for (const [userId, userAccs] of Object.entries(accountsByUser)) {
    console.log(`Processing user: ${userId} (${userAccs.length} accounts)`);
    try {
      const dek = await getServerDEK(userId);
      const apiConfig = await readApiConfig(userId);

      for (const rawAcc of userAccs) {
        const acc = await decryptRow('accounts', rawAcc, dek);
        console.log(`- Regenerating snapshots for "${acc.name}" (${acc.type})...`);
        const meta = typeof acc.metadata === 'string'
          ? JSON.parse(acc.metadata)
          : (typeof acc.metadata === 'object' && acc.metadata !== null ? acc.metadata : {});
        
        const count = await generateAssetHistorySnapshots(
          acc.id,
          userId,
          acc.type,
          meta as Record<string, unknown>,
          apiConfig,
          dek
        );
        console.log(`  Done: generated ${count} snapshots.`);
      }
    } catch (err) {
      console.error(`Failed to process user ${userId}:`, err);
    }
  }

  console.log('Finished recalculating all snapshots!');
  process.exit(0);
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
