import 'dotenv/config';
import { getDb } from '../lib/db';
import { getServerDEK } from '../lib/crypto-context';
import { decryptRows } from '../lib/crypto';
import { accountSnapshots, transactions } from '../lib/db/schema';
import { eq, and, asc, gte, lte } from 'drizzle-orm';

async function main() {
  const db = getDb();
  const dek = await getServerDEK('alanracek');
  const accountId = 'e216aa50-f8aa-42d8-9b68-f9a2f68d5daf'; // Vanguard Roth IRA - Alan

  const snaps = await db
    .select()
    .from(accountSnapshots)
    .where(eq(accountSnapshots.accountId, accountId))
    .orderBy(asc(accountSnapshots.snapshotDate));
  const decryptedSnaps = await decryptRows('account_snapshots', snaps, dek);

  const txs = await db
    .select()
    .from(transactions)
    .where(eq(transactions.accountId, accountId))
    .orderBy(asc(transactions.date));
  const decryptedTxs = await decryptRows('transactions', txs, dek);

  console.log('\n=== Vanguard Roth IRA: Monthly Snapshot Balance vs Net Transaction Flow ===');

  // Group snaps by year-month
  const snapsByMonth = new Map<string, number>();
  for (const s of decryptedSnaps) {
    const ym = s.snapshotDate.substring(0, 7);
    // Keep the last snap of the month
    snapsByMonth.set(ym, parseFloat(s.balance));
  }

  // Group transactions by year-month
  const txSumsByMonth = new Map<string, number>();
  const txCountsByMonth = new Map<string, number>();
  for (const t of decryptedTxs) {
    const ym = t.date.substring(0, 7);
    const amount = parseFloat(t.amount) || 0;
    txSumsByMonth.set(ym, (txSumsByMonth.get(ym) || 0) + amount);
    txCountsByMonth.set(ym, (txCountsByMonth.get(ym) || 0) + 1);
  }

  // Get union of all months
  const allMonths = Array.from(new Set([...snapsByMonth.keys(), ...txSumsByMonth.keys()])).sort();

  for (const ym of allMonths) {
    const bal = snapsByMonth.get(ym);
    const txSum = txSumsByMonth.get(ym) || 0;
    const txCount = txCountsByMonth.get(ym) || 0;
    console.log(`Month: ${ym} | Snap Balance: ${bal !== undefined ? bal.toFixed(2) : 'N/A'} | Tx Sum: ${txSum.toFixed(2)} (${txCount} txs)`);
  }

  // Print transactions of a specific month with a spike or anomaly (e.g. 2018-01, 2022-01, 2019-04)
  console.log('\n=== Transactions in 2018-01 ===');
  const txs2018 = decryptedTxs.filter(t => t.date.startsWith('2018-01'));
  for (const t of txs2018) {
    console.log(`Date: ${t.date} | Amount: ${t.amount} | Payee: ${t.payee} | Desc: ${t.description}`);
  }

  console.log('\n=== Transactions in 2019-04 ===');
  const txs2019 = decryptedTxs.filter(t => t.date.startsWith('2019-04'));
  for (const t of txs2019) {
    console.log(`Date: ${t.date} | Amount: ${t.amount} | Payee: ${t.payee} | Desc: ${t.description}`);
  }

  console.log('\n=== Transactions in 2022-01 ===');
  const txs2022 = decryptedTxs.filter(t => t.date.startsWith('2022-01'));
  for (const t of txs2022) {
    console.log(`Date: ${t.date} | Amount: ${t.amount} | Payee: ${t.payee} | Desc: ${t.description}`);
  }
}

main().catch(console.error);
