import 'dotenv/config';
import { getDb } from '../lib/db';
import { getServerDEK } from '../lib/crypto-context';
import { decryptRows } from '../lib/crypto';
import { transactions } from '../lib/db/schema';
import { eq, asc } from 'drizzle-orm';

const INTERNAL_RX = /sweep|reinvestment|reinvest|dividend|capital gain|money market|settlement fund|\- buy|\- sell|investment buy/i;

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

  console.log('--- ALL TRANSACTIONS ---');
  console.log(`Total: ${decryptedTxs.length}`);

  const external = [];
  const internal = [];

  for (const t of decryptedTxs) {
    const text = `${t.payee || ''} ${t.description || ''}`;
    if (INTERNAL_RX.test(text)) {
      internal.push(t);
    } else {
      external.push(t);
    }
  }

  console.log(`\n--- INTERNAL TRANSACTIONS (${internal.length}) ---`);
  console.log('Sample (first 10):');
  for (const t of internal.slice(0, 10)) {
    console.log(`  Date: ${t.date} | Amount: ${t.amount} | Payee: ${t.payee} | Desc: ${t.description}`);
  }
  console.log('Sample (last 10):');
  for (const t of internal.slice(-10)) {
    console.log(`  Date: ${t.date} | Amount: ${t.amount} | Payee: ${t.payee} | Desc: ${t.description}`);
  }

  console.log(`\n--- EXTERNAL TRANSACTIONS (${external.length}) ---`);
  for (const t of external) {
    console.log(`  Date: ${t.date} | Amount: ${t.amount} | Payee: ${t.payee} | Desc: ${t.description}`);
  }
}

main().catch(console.error);
