import 'dotenv/config';
import { getDb } from '../lib/db';
import { getServerDEK } from '../lib/crypto-context';
import { decryptRows } from '../lib/crypto';
import { transactions } from '../lib/db/schema';
import { eq, asc } from 'drizzle-orm';

async function main() {
  const db = getDb();
  const dek = await getServerDEK('alanracek');
  const accountId = 'e216aa50-f8aa-42d8-9b68-f9a2f68d5daf'; // Vanguard Roth IRA - Alan

  const txs = await db
    .select()
    .from(transactions)
    .where(eq(transactions.accountId, accountId))
    .orderBy(asc(transactions.date));
  const decryptedTxs = await decryptRows('transactions', txs, dek);

  console.log(`Found ${decryptedTxs.length} transactions:`);
  for (const t of decryptedTxs) {
    console.log(`Date: ${t.date} | Amount: ${t.amount} | Payee: ${t.payee} | Desc: ${t.description}`);
  }
}

main().catch(console.error);
