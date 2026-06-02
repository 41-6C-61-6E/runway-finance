import 'dotenv/config';
import { updateCategorySpendingSummaries, updateCategoryIncomeSummaries } from '../lib/services/sync';
import { getServerDEK } from '../lib/crypto-context';
import { getDb } from '../lib/db';
import { transactions, categories, categorySpendingSummary } from '../lib/db/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const userId = 'alanracek';
  console.log('Fetching DEK for user:', userId);
  try {
    const dek = await getServerDEK(userId);
    console.log('DEK fetched successfully!');

    // 1. Let's check some categorized transactions count first
    const db = getDb();
    const txs = await db.select().from(transactions).where(eq(transactions.userId, userId));
    console.log('Total transactions in DB:', txs.length);

    // Let's run the summary updates
    console.log('Running updateCategorySpendingSummaries...');
    const spendingResult = await updateCategorySpendingSummaries(userId, dek);
    console.log('Spending summary result:', spendingResult);

    console.log('Running updateCategoryIncomeSummaries...');
    const incomeResult = await updateCategoryIncomeSummaries(userId, dek);
    console.log('Income summary result:', incomeResult);

    // Verify row count in categorySpendingSummary
    const summaryRows = await db.select().from(categorySpendingSummary).where(eq(categorySpendingSummary.userId, userId));
    console.log('Summary rows in DB after run:', summaryRows.length);
  } catch (error) {
    console.error('Error running test script:', error);
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
