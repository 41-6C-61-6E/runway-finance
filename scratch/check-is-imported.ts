import 'dotenv/config';
import { getDb } from '../lib/db';
import { transactions } from '../lib/db/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const db = getDb();
  
  try {
    const res = await db.select().from(transactions).where(eq(transactions.isImported, true));
    console.log(`Transactions with isImported = true: ${res.length}`);
  } catch (error) {
    console.error('Error querying database:', error);
  }
}

main().then(() => process.exit(0));
