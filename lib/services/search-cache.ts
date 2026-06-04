import { getDb } from '@/lib/db';
import { transactions, accounts, categories } from '@/lib/db/schema';
import { eq, and, or, sql } from 'drizzle-orm';
import { decryptField } from '@/lib/crypto';
import { logger } from '@/lib/logger';

// Global-safe caches to survive Next.js dev server hot reloads
const globalForSearchCache = globalThis as unknown as {
  searchCache?: Map<string, Map<string, {
  description: string;
  payee: string;
  notes: string;
  categoryName: string;
  accountName: string;
  amount: string;
  categoryId: string | null;
  accountId: string;
  date: string;
  ignored: boolean;
  source: string | null;
}>>;
  searchCacheStatus?: Map<string, 'uninitialized' | 'hydrating' | 'ready'>;
  searchCachePromises?: Map<string, Promise<void>>;
};

const searchCache = globalForSearchCache.searchCache ?? new Map<string, Map<string, {
  description: string;
  payee: string;
  notes: string;
  categoryName: string;
  accountName: string;
  amount: string;
  categoryId: string | null;
  accountId: string;
  date: string;
  ignored: boolean;
  source: string | null;
}>>();
const searchCacheStatus = globalForSearchCache.searchCacheStatus ?? new Map<string, 'uninitialized' | 'hydrating' | 'ready'>();
const searchCachePromises = globalForSearchCache.searchCachePromises ?? new Map<string, Promise<void>>();

if (process.env.NODE_ENV !== 'production') {
  globalForSearchCache.searchCache = searchCache;
  globalForSearchCache.searchCacheStatus = searchCacheStatus;
  globalForSearchCache.searchCachePromises = searchCachePromises;
}

/**
 * Decrypts and caches all searchable transactions for a user.
 */
export async function hydrateUserSearchCache(userId: string, dek: Uint8Array): Promise<void> {
  const status = searchCacheStatus.get(userId) ?? 'uninitialized';
  if (status === 'ready') return;

  if (status === 'hydrating') {
    const promise = searchCachePromises.get(userId);
    if (promise) return promise;
  }

  logger.info('Hydrating search cache for user', { userId });
  searchCacheStatus.set(userId, 'hydrating');

  const hydratePromise = (async () => {
    try {
      // Fetch only the text fields needed for search, respecting global exclusions (isHidden / isExcluded)
      const result = await getDb()
        .select({
          id: transactions.id,
          description: transactions.description,
          payee: transactions.payee,
          notes: transactions.notes,
          amount: transactions.amount,
          categoryId: transactions.categoryId,
          accountId: transactions.accountId,
          date: transactions.date,
          ignored: transactions.ignored,
          source: transactions.source,
          categoryName: categories.name,
          accountName: accounts.name,
        })
        .from(transactions)
        .leftJoin(accounts, eq(transactions.accountId, accounts.id))
        .leftJoin(categories, eq(transactions.categoryId, categories.id))
        .where(
          and(
            eq(transactions.userId, userId),
            eq(transactions.deleted, false),
            or(
              and(
                eq(accounts.isHidden, false),
                eq(accounts.isExcludedFromNetWorth, false)
              ),
              eq(accounts.type, 'paystub')
            )
          )
        );

      const userCache = new Map<string, {
  description: string;
  payee: string;
  notes: string;
  categoryName: string;
  accountName: string;
  amount: string;
  categoryId: string | null;
  accountId: string;
  date: string;
  ignored: boolean;
  source: string | null;
}>();

      // Decrypt search fields for each transaction in parallel batch
      await Promise.all(
        result.map(async (row) => {
          const description = row.description ? await decryptField(row.description, dek) : '';
          const payee = row.payee ? await decryptField(row.payee, dek) : '';
          const notes = row.notes ? await decryptField(row.notes, dek) : '';
          const categoryName = row.categoryName ? await decryptField(row.categoryName, dek) : '';
          const accountName = row.accountName ? await decryptField(row.accountName, dek) : '';
          const amount = row.amount ? await decryptField(row.amount, dek) : '0';

          userCache.set(row.id, {
            description: String(description).toLowerCase(),
            payee: String(payee).toLowerCase(),
            notes: String(notes).toLowerCase(),
            categoryName: String(categoryName).toLowerCase(),
            accountName: String(accountName).toLowerCase(),
            amount: String(amount),
            categoryId: row.categoryId,
            accountId: row.accountId,
            date: row.date,
            ignored: row.ignored ?? false,
            source: row.source,
          });
        })
      );

      searchCache.set(userId, userCache);
      searchCacheStatus.set(userId, 'ready');
      logger.info('Search cache hydrated successfully', { userId, count: userCache.size });
    } catch (err) {
      logger.error('Failed to hydrate search cache', { userId, error: err });
      searchCacheStatus.set(userId, 'uninitialized');
      throw err;
    } finally {
      searchCachePromises.delete(userId);
    }
  })();

  searchCachePromises.set(userId, hydratePromise);
  return hydratePromise;
}

/**
 * Invalidates the search cache for a user.
 */
export function invalidateUserSearchCache(userId: string): void {
  searchCache.delete(userId);
  searchCacheStatus.set(userId, 'uninitialized');
  logger.info('Invalidated search cache for user', { userId });
}

/**
 * Direct check of a query string against the cache.
 * Returns a Set of matching transaction IDs.
 */
export async function getSearchMatchingTransactionIds(
  userId: string,
  dek: Uint8Array,
  query: string
): Promise<Set<string>> {
  await hydrateUserSearchCache(userId, dek);

  const userCache = searchCache.get(userId);
  const matchingIds = new Set<string>();
  if (!userCache) return matchingIds;

  const q = query.toLowerCase();

  for (const [id, tx] of userCache.entries()) {
    if (
      tx.description.includes(q) ||
      tx.payee.includes(q) ||
      tx.notes.includes(q) ||
      tx.categoryName.includes(q) ||
      tx.accountName.includes(q)
    ) {
      matchingIds.add(id);
    }
  }

  return matchingIds;
}

/**
 * Returns all active transactions from cache.
 */
export async function getUserTransactionsFromCache(
  userId: string,
  dek: Uint8Array
): Promise<Array<{
  description: string;
  payee: string;
  notes: string;
  categoryName: string;
  accountName: string;
  amount: string;
  categoryId: string | null;
  accountId: string;
  date: string;
  ignored: boolean;
  source: string | null;
}>> {
  await hydrateUserSearchCache(userId, dek);
  const userCache = searchCache.get(userId);
  if (!userCache) return [];
  return Array.from(userCache.values());
}
