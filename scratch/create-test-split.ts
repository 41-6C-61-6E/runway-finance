import { getDb } from '../lib/db';
import { transactions, categories } from '../lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import 'dotenv/config';

async function main() {
  const db = getDb();
  
  // 1. Find a suitable transaction to split (unignored, not split already, not pending)
  const [tx] = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.deleted, false),
        eq(transactions.ignored, false),
        eq(transactions.pending, false),
        isNull(transactions.parentId)
      )
    )
    .limit(1);

  if (!tx) {
    console.error('No suitable transaction found to split');
    process.exit(1);
  }

  console.log(`Found transaction to split: ${tx.description} (Amount: ${tx.amount})`);

  // 2. Fetch categories to assign to splits
  const dbCats = await db.select().from(categories).limit(2);
  if (dbCats.length < 2) {
    console.error('Need at least 2 categories to test split');
    process.exit(1);
  }

  const amt = parseFloat(tx.amount);
  const part1 = (amt * 0.4).toFixed(2);
  const part2 = (amt - parseFloat(part1)).toFixed(2);

  // 3. Perform split:
  // a) Mark parent as ignored
  await db
    .update(transactions)
    .set({ ignored: true })
    .where(eq(transactions.id, tx.id));

  // b) Insert child transactions
  const split1Id = crypto.randomUUID();
  const split2Id = crypto.randomUUID();

  await db.insert(transactions).values([
    {
      id: split1Id,
      userId: tx.userId,
      accountId: tx.accountId,
      date: tx.date,
      postedDate: tx.postedDate,
      description: `${tx.description} [Split 1]`,
      amount: part1,
      categoryId: dbCats[0].id,
      parentId: tx.id,
      ignored: false,
      pending: false,
    },
    {
      id: split2Id,
      userId: tx.userId,
      accountId: tx.accountId,
      date: tx.date,
      postedDate: tx.postedDate,
      description: `${tx.description} [Split 2]`,
      amount: part2,
      categoryId: dbCats[1].id,
      parentId: tx.id,
      ignored: false,
      pending: false,
    }
  ]);

  console.log('Transaction split created successfully in the DB!');
  process.exit(0);
}

main();
