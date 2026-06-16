import 'dotenv/config';
import { getDb } from '../lib/db';
import { getServerDEK } from '../lib/crypto-context';
import { decryptRows } from '../lib/crypto';
import { accounts, accountSnapshots, importLog, transactions } from '../lib/db/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const db = getDb();
  const dek = await getServerDEK('alanracek');
  const studentLoanId = '72bdb674-4a6e-4189-9392-3a977a0acc60';

  console.log('\n--- Student Loans Snapshots ---');
  const snapshots = await db
    .select()
    .from(accountSnapshots)
    .where(eq(accountSnapshots.accountId, studentLoanId));
  const decryptedSnapshots = await decryptRows('account_snapshots', snapshots, dek);
  console.log(`Found ${decryptedSnapshots.length} snapshots:`);
  decryptedSnapshots.sort((a, b) => a.snapshotDate.localeCompare(b.snapshotDate));
  for (const snap of decryptedSnapshots.slice(0, 10)) {
    console.log(`  Date: ${snap.snapshotDate}, Balance: ${snap.balance}, Synthetic: ${snap.isSynthetic}, Imported: ${snap.isImported}`);
  }
  if (decryptedSnapshots.length > 10) {
    console.log(`  ... and ${decryptedSnapshots.length - 10} more`);
    console.log(`  Last Date: ${decryptedSnapshots[decryptedSnapshots.length - 1].snapshotDate}, Balance: ${decryptedSnapshots[decryptedSnapshots.length - 1].balance}`);
  }

  console.log('\n--- Student Loans Transactions ---');
  const txs = await db
    .select()
    .from(transactions)
    .where(eq(transactions.accountId, studentLoanId));
  const decryptedTxs = await decryptRows('transactions', txs, dek);
  console.log(`Found ${decryptedTxs.length} transactions:`);
  decryptedTxs.sort((a, b) => a.date.localeCompare(b.date));
  for (const tx of decryptedTxs.slice(0, 10)) {
    console.log(`  Date: ${tx.date}, Amount: ${tx.amount}, Payee: ${tx.payee}, Desc: ${tx.description}`);
  }
  if (decryptedTxs.length > 10) {
    console.log(`  ... and ${decryptedTxs.length - 10} more`);
    console.log(`  Last Date: ${decryptedTxs[decryptedTxs.length - 1].date}, Amount: ${decryptedTxs[decryptedTxs.length - 1].amount}, Payee: ${decryptedTxs[decryptedTxs.length - 1].payee}, Desc: ${decryptedTxs[decryptedTxs.length - 1].description}`);
  }
}

main().catch(console.error);
