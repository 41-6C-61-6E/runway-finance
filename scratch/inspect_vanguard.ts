import 'dotenv/config';
import { getDb } from '../lib/db';
import { getServerDEK } from '../lib/crypto-context';
import { decryptRows } from '../lib/crypto';
import { accountSnapshots, holdingSnapshots, transactions } from '../lib/db/schema';
import { eq, and, asc } from 'drizzle-orm';

async function main() {
  const db = getDb();
  const dek = await getServerDEK('alanracek');
  const accountId = 'e216aa50-f8aa-42d8-9b68-f9a2f68d5daf'; // Vanguard Roth IRA - Alan

  console.log('\n--- Vanguard Roth IRA Real Snapshots ---');
  const snaps = await db
    .select()
    .from(accountSnapshots)
    .where(
      and(
        eq(accountSnapshots.accountId, accountId),
        eq(accountSnapshots.isSynthetic, false)
      )
    )
    .orderBy(asc(accountSnapshots.snapshotDate));
  
  const decryptedSnaps = await decryptRows('account_snapshots', snaps, dek);
  console.log(`Found ${decryptedSnaps.length} real snapshots:`);
  for (const s of decryptedSnaps) {
    console.log(`Date: ${s.snapshotDate} | Balance: ${s.balance} | Imported: ${s.isImported}`);
  }

  console.log('\n--- Vanguard Roth IRA Holding Snapshots ---');
  const holdings = await db
    .select()
    .from(holdingSnapshots)
    .where(eq(holdingSnapshots.accountId, accountId))
    .orderBy(asc(holdingSnapshots.snapshotDate));
  
  const decryptedHoldings = await decryptRows('holding_snapshots', holdings, dek);
  console.log(`Found ${decryptedHoldings.length} holding snapshots:`);
  
  // Print unique dates and some info
  const holdingsByDate = new Map<string, typeof decryptedHoldings>();
  for (const h of decryptedHoldings) {
    const d = h.snapshotDate;
    if (!holdingsByDate.has(d)) holdingsByDate.set(d, []);
    holdingsByDate.get(d)!.push(h);
  }
  
  const sortedDates = Array.from(holdingsByDate.keys()).sort();
  for (const d of sortedDates) {
    const dayHoldings = holdingsByDate.get(d)!;
    console.log(`Date: ${d} | Positions: ${dayHoldings.length}`);
    for (const h of dayHoldings) {
      console.log(`  - Ticker: ${h.ticker} | Name: ${h.name} | Qty: ${h.quantity} | Price: ${h.price} | Value: ${h.value}`);
    }
  }

  console.log('\n--- Vanguard Roth IRA Transactions (First 10) ---');
  const txs = await db
    .select()
    .from(transactions)
    .where(eq(transactions.accountId, accountId))
    .orderBy(asc(transactions.date));
  const decryptedTxs = await decryptRows('transactions', txs, dek);
  console.log(`Found ${decryptedTxs.length} transactions:`);
  for (const t of decryptedTxs.slice(0, 10)) {
    console.log(`Date: ${t.date} | Amount: ${t.amount} | Payee: ${t.payee} | Desc: ${t.description}`);
  }
}

main().catch(console.error);
