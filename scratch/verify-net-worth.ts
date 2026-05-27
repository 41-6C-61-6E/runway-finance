import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { getDb } from '../lib/db';
import { netWorthSnapshots, accounts } from '../lib/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { getServerDEK } from '../lib/crypto-context';
import { decryptRows, decryptField } from '../lib/crypto';

async function run() {
  const db = getDb();
  const userId = 'alanracek';
  const dek = await getServerDEK(userId);

  const rawAccounts = await db
    .select()
    .from(accounts)
    .where(eq(accounts.userId, userId));
  const decryptedAccounts = await decryptRows('accounts', rawAccounts, dek);

  const nationstar = decryptedAccounts.find(a => a.name.includes('Nationstar'));
  if (!nationstar) {
    console.error('Nationstar mortgage account not found');
    return;
  }

  console.log('Nationstar account details:');
  console.log(`- ID: ${nationstar.id}`);
  console.log(`- Type: ${nationstar.type}`);
  console.log(`- Metadata: ${nationstar.metadata}`);

  const meta = typeof nationstar.metadata === 'string' ? JSON.parse(nationstar.metadata) : nationstar.metadata;
  const status = meta.mortgageStatus;
  const eventDate = status === 'paid_off' ? meta.payoffDate : (status === 'refinanced' ? meta.refinanceDate : null);
  console.log(`- Status: ${status}, Event Date: ${eventDate}`);

  console.log('\nQuerying net_worth_snapshots...');
  const snapshots = await db
    .select()
    .from(netWorthSnapshots)
    .where(eq(netWorthSnapshots.userId, userId))
    .orderBy(asc(netWorthSnapshots.snapshotDate));

  console.log(`Found ${snapshots.length} net worth snapshots.`);

  // Find snapshots around the eventDate
  const targetDate = new Date(eventDate);
  const beforeDate = new Date(targetDate);
  beforeDate.setDate(beforeDate.getDate() - 3);
  const afterDate = new Date(targetDate);
  afterDate.setDate(afterDate.getDate() + 3);

  const beforeStr = beforeDate.toISOString().split('T')[0];
  const afterStr = afterDate.toISOString().split('T')[0];

  console.log(`\nSnapshots from ${beforeStr} to ${afterStr}:`);
  for (const snap of snapshots) {
    if (snap.snapshotDate >= beforeStr && snap.snapshotDate <= afterStr) {
      // Decrypt totalAssets, totalLiabilities, netWorth, breakdown
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
      console.log(`  Breakdown mortgage:`, breakdown.mortgage);
    }
  }

  process.exit(0);
}

run().catch(console.error);
