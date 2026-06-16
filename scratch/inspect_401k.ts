import 'dotenv/config';
import { getDb } from '../lib/db';
import { getServerDEK } from '../lib/crypto-context';
import { decryptRows } from '../lib/crypto';
import { accountSnapshots, transactions } from '../lib/db/schema';
import { eq, and, gte, lte } from 'drizzle-orm';

async function main() {
  const db = getDb();
  const dek = await getServerDEK('alanracek');
  const accountId = 'aca841aa-5e37-4fee-ad2f-806ac48c0fd3'; // LM SSP 401k

  console.log('\n--- 401k Snapshots (Nov - Dec 2012) ---');
  const snaps = await db
    .select()
    .from(accountSnapshots)
    .where(
      and(
        eq(accountSnapshots.accountId, accountId),
        gte(accountSnapshots.snapshotDate, '2012-11-01'),
        lte(accountSnapshots.snapshotDate, '2012-12-15')
      )
    );
  const decryptedSnaps = await decryptRows('account_snapshots', snaps, dek);
  decryptedSnaps.sort((a, b) => a.snapshotDate.localeCompare(b.snapshotDate));
  for (const s of decryptedSnaps) {
    console.log(`Date: ${s.snapshotDate} | Balance: ${s.balance} | Synthetic: ${s.isSynthetic}`);
  }

  console.log('\n--- 401k Transactions ---');
  const txs = await db
    .select()
    .from(transactions)
    .where(eq(transactions.accountId, accountId));
  const decryptedTxs = await decryptRows('transactions', txs, dek);
  decryptedTxs.sort((a, b) => a.date.localeCompare(b.date));
  console.log(`Found ${decryptedTxs.length} transactions:`);
  for (const t of decryptedTxs.slice(0, 10)) {
    console.log(`Date: ${t.date} | Amount: ${t.amount} | Payee: ${t.payee} | Description: ${t.description}`);
  }
}

main().catch(console.error);
