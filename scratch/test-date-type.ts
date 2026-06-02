import 'dotenv/config';
import { getDb } from '../lib/db';
import { transactions } from '../lib/db/schema';

async function main() {
  const db = getDb();
  const rows = await db.select({ date: transactions.date }).from(transactions).limit(5);
  for (const r of rows) {
    console.log('Type of date:', typeof r.date, 'Value:', r.date, 'Is Date:', r.date instanceof Date);
  }
}
main().then(() => process.exit(0));
