import 'dotenv/config';
import { getDb } from '../lib/db';
import { getServerDEK } from '../lib/crypto-context';
import { decryptRows, decryptField } from '../lib/crypto';
import { netWorthSnapshots, accountSnapshots, accounts } from '../lib/db/schema';
import { and, eq, gte, lte } from 'drizzle-orm';

async function main() {
  const db = getDb();
  const dek = await getServerDEK('alanracek');

  console.log('\n--- Net Worth Breakdown on Target Dates ---');
  const nwSnaps = await db
    .select()
    .from(netWorthSnapshots)
    .where(
      and(
        eq(netWorthSnapshots.userId, 'alanracek'),
        gte(netWorthSnapshots.snapshotDate, '2012-08-01'),
        lte(netWorthSnapshots.snapshotDate, '2020-12-31')
      )
    );

  const decrypted = await decryptRows('net_worth_snapshots', nwSnaps, dek);
  decrypted.sort((a, b) => a.snapshotDate.localeCompare(b.snapshotDate));

  // Filter to first snapshot of each month
  const monthlySnaps: typeof decrypted = [];
  let lastYearMonth = '';
  for (const snap of decrypted) {
    const yearMonth = snap.snapshotDate.substring(0, 7); // YYYY-MM
    if (yearMonth !== lastYearMonth) {
      monthlySnaps.push(snap);
      lastYearMonth = yearMonth;
    }
  }

  for (const snap of monthlySnaps) {
    console.log(`Date: ${snap.snapshotDate} | Assets: ${snap.totalAssets} | Liabilities: ${snap.totalLiabilities} | Net Worth: ${snap.netWorth}`);
  }
}

main().catch(console.error);
