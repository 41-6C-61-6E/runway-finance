import { getDb } from '@/lib/db';
import { transactions, accounts, categories } from '@/lib/db/schema';
import { eq, and, or } from 'drizzle-orm';
import { decryptField } from '@/lib/crypto';
import { logger } from '@/lib/logger';

const CACHE_TTL_MS = 1 * 60 * 60 * 1000;

export interface CachedTransaction {
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
}

export interface UserCacheEntry {
  transactions: Map<string, CachedTransaction>;
  status: 'uninitialized' | 'hydrating' | 'ready';
  promise?: Promise<void>;
  touchedAt: number;
}

export class SimpleLRUCache<K, V> {
  private max: number;
  private cache: Map<K, V>;

  constructor(max: number = 5) {
    this.max = max;
    this.cache = new Map<K, V>();
  }

  get(key: K): V | undefined {
    const item = this.cache.get(key);
    if (item !== undefined) {
      // Refresh key order (move to the end of insertion order)
      this.cache.delete(key);
      this.cache.set(key, item);
    }
    return item;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.max) {
      // Evict oldest (first key in map insertion order)
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(key, value);
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }

  keys(): K[] {
    return Array.from(this.cache.keys());
  }
}

// Global-safe caches to survive Next.js dev server hot reloads
const globalForSearchCache = globalThis as unknown as {
  userCache?: SimpleLRUCache<string, UserCacheEntry>;
};

const userCache = globalForSearchCache.userCache ?? new SimpleLRUCache<string, UserCacheEntry>(5);

if (process.env.NODE_ENV !== 'production') {
  globalForSearchCache.userCache = userCache;
}

function getUserEntry(userId: string): UserCacheEntry {
  let entry = userCache.get(userId);
  if (!entry) {
    entry = {
      transactions: new Map(),
      status: 'uninitialized',
      touchedAt: Date.now(),
    };
    userCache.set(userId, entry);
  }
  return entry;
}

/**
 * Decrypts and caches all searchable transactions for a user.
 */
export async function hydrateUserSearchCache(userId: string, dek: Uint8Array): Promise<void> {
  const entry = getUserEntry(userId);

  if (entry.status === 'ready') {
    if (Date.now() - entry.touchedAt < CACHE_TTL_MS) {
      entry.touchedAt = Date.now(); // update LRU access time
      userCache.set(userId, entry); // refresh LRU order
      return;
    }
    entry.status = 'uninitialized';
  }

  if (entry.status === 'hydrating') {
    if (entry.promise) return entry.promise;
  }

  logger.info('Hydrating search cache for user', { userId });
  entry.status = 'hydrating';
  entry.touchedAt = Date.now();
  userCache.set(userId, entry); // refresh LRU order

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

      const transactionsMap = new Map<string, CachedTransaction>();

      // Decrypt search fields for each transaction in parallel batch
      await Promise.all(
        result.map(async (row) => {
          const description = row.description ? await decryptField(row.description, dek) : '';
          const payee = row.payee ? await decryptField(row.payee, dek) : '';
          const notes = row.notes ? await decryptField(row.notes, dek) : '';
          const categoryName = row.categoryName ? await decryptField(row.categoryName, dek) : '';
          const accountName = row.accountName ? await decryptField(row.accountName, dek) : '';
          const amount = row.amount ? await decryptField(row.amount, dek) : '0';

          transactionsMap.set(row.id, {
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

      entry.transactions = transactionsMap;
      entry.status = 'ready';
      entry.touchedAt = Date.now();
      userCache.set(userId, entry); // refresh LRU order
      logger.info('Search cache hydrated successfully', { userId, count: transactionsMap.size });
    } catch (err) {
      logger.error('Failed to hydrate search cache', { userId, error: err });
      entry.status = 'uninitialized';
      userCache.set(userId, entry);
      throw err;
    } finally {
      entry.promise = undefined;
    }
  })();

  entry.promise = hydratePromise;
  userCache.set(userId, entry);
  return hydratePromise;
}

/**
 * Invalidates the search cache for a user.
 */
export function invalidateUserSearchCache(userId: string): void {
  userCache.delete(userId);
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

  const entry = userCache.get(userId);
  const matchingIds = new Set<string>();
  if (!entry || entry.status !== 'ready') return matchingIds;

  const q = query.toLowerCase();

  for (const [id, tx] of entry.transactions.entries()) {
    const amountStr = String(tx.amount || "");
    const absAmountStr = String(Math.abs(parseFloat(tx.amount) || 0));
    if (
      tx.description.includes(q) ||
      tx.payee.includes(q) ||
      tx.notes.includes(q) ||
      tx.categoryName.includes(q) ||
      tx.accountName.includes(q) ||
      amountStr.includes(q) ||
      absAmountStr.includes(q)
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
): Promise<Array<CachedTransaction>> {
  await hydrateUserSearchCache(userId, dek);
  const entry = userCache.get(userId);
  if (!entry || entry.status !== 'ready') return [];
  return Array.from(entry.transactions.values());
}

/**
 * Gets the current search cache size (exposed for testing).
 */
export function getSearchCacheSize(): number {
  return userCache.size;
}

/**
 * Clears the search cache (exposed for testing).
 */
export function clearSearchCache(): void {
  userCache.clear();
}
