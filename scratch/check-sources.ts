import 'dotenv/config';
import { getDb } from '../lib/db';
import { transactions } from '../lib/db/schema';
import { sql } from 'drizzle-orm';

async function main() {
  const db = getDb();
  
  try {
    const res = await db.select({
      source: transactions.source,
      count: sql<number>`count(*)`
    })
    .from(transactions)
    .groupBy(transactions.source);
    
    console.log('--- TRANSACTION SOURCES ---');
    console.log(JSON.stringify(res, null, 2));
  } catch (error) {
    console.error('Error querying database:', error);
  }
}

main().then(() => process.exit(0));
