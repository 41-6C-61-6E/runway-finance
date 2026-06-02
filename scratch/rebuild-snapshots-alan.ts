import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { getDb } from '../lib/db';
import { accounts } from '../lib/db/schema';
import { eq } from 'drizzle-orm';
import { getServerDEK } from '../lib/crypto-context';
import { decryptRows } from '../lib/crypto';
import { generateHistoricalAccountSnapshots, recalculateNetWorthSnapshots } from '../lib/services/account-history';
import { generateAssetHistorySnapshots } from '../lib/services/asset-estimator';
import { readApiConfig } from '../lib/services/manual-accounts';

const MODEL_SNAPSHOT_TYPES = [
  'realestate', 'primaryhome', 'secondaryhome', 'rentalproperty', 'commercial', 'land', 'otherrealestate',
  'single-family', 'condo', 'townhouse', 'multi-family', 'other',
  'vehicle', 'metals', 'mortgage'
];

async function run() {
  const userId = 'alanracek';
  const dek = await getServerDEK(userId);
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];

  console.log('Fetching accounts...');
  const userAccounts = await db
    .select()
    .from(accounts)
    .where(eq(accounts.userId, userId));

  const decrypted = await decryptRows('accounts', userAccounts, dek);
  console.log(`Found ${decrypted.length} decrypted accounts.`);

  const apiConfig = await readApiConfig(userId).catch(() => undefined);

  let syntheticCount = 0;
  for (const account of decrypted) {
    console.log(`Processing account: "${account.name}" (${account.type})...`);
    if (MODEL_SNAPSHOT_TYPES.includes(account.type)) {
      const meta = typeof account.metadata === 'string'
        ? JSON.parse(account.metadata)
        : (typeof account.metadata === 'object' && account.metadata !== null ? account.metadata : {});
      const count = await generateAssetHistorySnapshots(
        account.id, userId, account.type, meta as Record<string, unknown>, apiConfig, dek
      );
      syntheticCount += count;
      console.log(`  Generated ${count} model-based snapshots.`);
    } else {
      const result = await generateHistoricalAccountSnapshots(
        account.id,
        userId,
        '2023-01-01',
        today,
        dek
      );
      syntheticCount += result.syntheticCount;
      console.log(`  Generated ${result.syntheticCount} transaction-based snapshots.`);
    }
  }

  console.log('\nRecalculating net worth snapshots table...');
  await recalculateNetWorthSnapshots(userId, dek);
  console.log('Recalculation complete!');
  process.exit(0);
}

run().catch(console.error);
