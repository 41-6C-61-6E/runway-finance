import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { hydrateUserSearchCache, invalidateUserSearchCache, getSearchMatchingTransactionIds, getUserTransactionsFromCache, getSearchCacheSize, clearSearchCache } from '@/lib/services/search-cache';
import { encryptField } from '@/lib/crypto';

// Mock variables to control query responses
let mockDbResponse: any[] = [];

class MockDbQueryBuilder {
  select() { return this; }
  from() { return this; }
  leftJoin() { return this; }
  where() { return this; }
  async then(onfulfilled?: (value: any) => any) {
    return Promise.resolve(mockDbResponse).then(onfulfilled);
  }
}

vi.mock('@/lib/db', () => {
  return {
    getDb: () => new MockDbQueryBuilder(),
  };
});

describe('Search Cache Service', () => {
  let testDek: Uint8Array;
  const userId = 'user_test_123';

  beforeAll(async () => {
    process.env.ENCRYPTION_KEY = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
    testDek = new Uint8Array(32);
    crypto.getRandomValues(testDek);
  });

  beforeEach(() => {
    invalidateUserSearchCache(userId);
    mockDbResponse = [];
  });

  it('hydrates cache and finds matching transaction IDs', async () => {
    // Encrypt fields as if they were in the DB
    const desc1 = await encryptField('Starbucks Coffee', testDek);
    const desc2 = await encryptField('Netflix Subscription', testDek);
    const payee1 = await encryptField('Starbucks Inc', testDek);
    const payee2 = await encryptField('Netflix Inc', testDek);
    const notes1 = await encryptField('morning routine', testDek);
    const notes2 = await encryptField('monthly entertainment', testDek);
    const catName1 = await encryptField('Food & Drink', testDek);
    const catName2 = await encryptField('Entertainment', testDek);

    const accName1 = await encryptField('Chase Checking', testDek);
    const accName2 = await encryptField('Amex Gold', testDek);

    mockDbResponse = [
      {
        id: 'tx_starbucks_1',
        description: desc1,
        payee: payee1,
        notes: notes1,
        categoryName: catName1,
        accountName: accName1,
      },
      {
        id: 'tx_netflix_1',
        description: desc2,
        payee: payee2,
        notes: notes2,
        categoryName: catName2,
        accountName: accName2,
      },
    ];

    // Query for "starbucks" - should only return the Starbucks transaction
    const matchesStarbucks = await getSearchMatchingTransactionIds(userId, testDek, 'starbucks');
    expect(matchesStarbucks.size).toBe(1);
    expect(matchesStarbucks.has('tx_starbucks_1')).toBe(true);

    // Query for "coffee" (partial description)
    const matchesCoffee = await getSearchMatchingTransactionIds(userId, testDek, 'coffee');
    expect(matchesCoffee.size).toBe(1);
    expect(matchesCoffee.has('tx_starbucks_1')).toBe(true);

    // Query for "entertainment" (category / notes keyword)
    const matchesEntertainment = await getSearchMatchingTransactionIds(userId, testDek, 'entertainment');
    expect(matchesEntertainment.size).toBe(1);
    expect(matchesEntertainment.has('tx_netflix_1')).toBe(true);

    // Query for "chase" (account name)
    const matchesChase = await getSearchMatchingTransactionIds(userId, testDek, 'chase');
    expect(matchesChase.size).toBe(1);
    expect(matchesChase.has('tx_starbucks_1')).toBe(true);

    // Query for non-existent keyword
    const matchesNone = await getSearchMatchingTransactionIds(userId, testDek, 'amazon');
    expect(matchesNone.size).toBe(0);
  });

  it('retrieves all transactions with extended cached fields', async () => {
    const desc = await encryptField('Starbucks Coffee', testDek);
    const payee = await encryptField('Starbucks Inc', testDek);
    const amount = await encryptField('-5.45', testDek);

    mockDbResponse = [
      {
        id: 'tx_starbucks_1',
        description: desc,
        payee: payee,
        notes: null,
        amount: amount,
        categoryId: 'cat_coffee_123',
        accountId: 'acc_checking_123',
        date: '2026-05-29',
        ignored: false,
        source: 'simplefin',
        categoryName: null,
        accountName: null,
      },
    ];

    const txns = await getUserTransactionsFromCache(userId, testDek);
    expect(txns.length).toBe(1);
    expect(txns[0]).toEqual({
      description: 'starbucks coffee',
      payee: 'starbucks inc',
      notes: '',
      categoryName: '',
      accountName: '',
      amount: '-5.45',
      categoryId: 'cat_coffee_123',
      accountId: 'acc_checking_123',
      date: '2026-05-29',
      ignored: false,
      source: 'simplefin',
    });
  });

  it('invalidates cache correctly', async () => {
    const desc1 = await encryptField('Gas Station', testDek);
    mockDbResponse = [
      {
        id: 'tx_gas',
        description: desc1,
        payee: null,
        notes: null,
        categoryName: null,
      },
    ];

    // First search hydrates the cache
    let matches = await getSearchMatchingTransactionIds(userId, testDek, 'gas');
    expect(matches.size).toBe(1);
    expect(matches.has('tx_gas')).toBe(true);

    // Now empty DB response, but do NOT invalidate cache.
    // Subsequent search should still hit the in-memory cache and return the result.
    mockDbResponse = [];
    matches = await getSearchMatchingTransactionIds(userId, testDek, 'gas');
    expect(matches.size).toBe(1);

    // Now invalidate the cache. Empty DB response should be fetched next time.
    invalidateUserSearchCache(userId);
    matches = await getSearchMatchingTransactionIds(userId, testDek, 'gas');
    expect(matches.size).toBe(0);
  });

  it('enforces LRU cache limits when exceeding max user capacity', async () => {
    clearSearchCache();
    expect(getSearchCacheSize()).toBe(0);

    const desc = await encryptField('Dummy Transaction', testDek);
    mockDbResponse = [
      {
        id: 'tx_dummy',
        description: desc,
        payee: null,
        notes: null,
        categoryName: null,
        accountName: null,
      },
    ];

    // Hydrate cache for 6 different users (cache max capacity is 5)
    for (let i = 1; i <= 6; i++) {
      await hydrateUserSearchCache(`user_${i}`, testDek);
    }

    // Cache size should be capped at 5
    expect(getSearchCacheSize()).toBe(5);

    // The oldest user (user_1) should have been evicted.
    // Set database response to empty.
    mockDbResponse = [];
    
    // user_1 should return 0 results (since it was evicted and database is now empty)
    const matchesUser1 = await getSearchMatchingTransactionIds('user_1', testDek, 'dummy');
    expect(matchesUser1.size).toBe(0);

    // user_6 (most recently hydrated) should still be in cache and return 1 result even though database is empty
    const matchesUser6 = await getSearchMatchingTransactionIds('user_6', testDek, 'dummy');
    expect(matchesUser6.size).toBe(1);
  });
});
