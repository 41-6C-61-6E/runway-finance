import { getDb } from '../lib/db';
import { transactions } from '../lib/db/schema';
import { sql } from 'drizzle-orm';

async function main() {
  const db = getDb();
  console.log("=== TRANSACTION COUNTS BY USER ===");
  const counts = await db.select({
    userId: transactions.userId,
    count: sql<number>`count(*)`
  })
  .from(transactions)
  .groupBy(transactions.userId);

  for (const c of counts) {
    console.log(`- userId: ${c.userId}, count: ${c.count}`);
  }
}

main().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
