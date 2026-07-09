import { getDb } from '../lib/db';
import { transactions } from '../lib/db/schema';
import { sql } from 'drizzle-orm';

async function main() {
  const db = getDb();
  console.log("=== TRANSACTION COUNTS BY USER ===");
  const counts = await db.select({
    userId: transactions.userId,
    dataUserId: transactions.dataUserId,
    count: sql<number>`count(*)`
  })
  .from(transactions)
  .groupBy(transactions.userId, transactions.dataUserId);

  for (const c of counts) {
    console.log(`- userId: ${c.userId}, dataUserId: ${c.dataUserId}, count: ${c.count}`);
  }
}

main().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
