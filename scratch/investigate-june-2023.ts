import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { getDb } from '../lib/db';
import { netWorthSnapshots } from '../lib/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { getServerDEK } from '../lib/crypto-context';
import { decryptField } from '../lib/crypto';

async function run() {
  const db = getDb();
  const userId = 'alanracek';
  const dek = await getServerDEK(userId);

  console.log('Querying net_worth_snapshots around June 2023...');
  const snapshots = await db
    .select()
    .from(netWorthSnapshots)
    .where(eq(netWorthSnapshots.userId, userId))
    .orderBy(asc(netWorthSnapshots.snapshotDate));

  const beforeStr = '2023-06-01';
  const afterStr = '2023-07-15';

  console.log(`\nSnapshots from ${beforeStr} to ${afterStr}:`);
  for (const snap of snapshots) {
    if (snap.snapshotDate >= beforeStr && snap.snapshotDate <= afterStr) {
      const totalAssets = parseFloat(dek ? await decryptField(snap.totalAssets, dek) : snap.totalAssets);
      const totalLiabilities = parseFloat(dek ? await decryptField(snap.totalLiabilities, dek) : snap.totalLiabilities);
      const netWorth = parseFloat(dek ? await decryptField(snap.netWorth, dek) : snap.netWorth);
      
      let breakdown: any = snap.breakdown;
      if (dek && typeof snap.breakdown === 'string') {
        const decryptedStr = await decryptField(snap.breakdown, dek);
        breakdown = JSON.parse(decryptedStr);
      } else if (typeof snap.breakdown === 'string') {
        breakdown = JSON.parse(snap.breakdown);
      }

      console.log(`Date: ${snap.snapshotDate}`);
      console.log(`  Assets: ${totalAssets}, Liabilities: ${totalLiabilities}, Net Worth: ${netWorth}`);
      console.log(`  Real estate:`, breakdown.realestate);
    }
  }

  process.exit(0);
}

run().catch(console.error);
