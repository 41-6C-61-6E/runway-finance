import { describe, it, expect, vi, beforeAll } from 'vitest';
import {
  normalizeMerchantName,
  classifyFrequency,
  calculateNextExpectedDate,
  addFrequencyPeriod,
  patternMatches,
  getMonthlyMultiplier,
  getAnnualMultiplier,
  getMaxRecencyDays,
  mergeRecurringTransactions,
  mergeRecurringExclusions,
} from '@/lib/services/recurring-detection';
import { detectRecurringTransactions } from '@/lib/services/recurring-detection';
import { encryptRow, decryptRow } from '@/lib/crypto';
import {
  transactions,
  userSettings,
  transactionTags,
  accounts,
  categories,
  recurringTransactions,
} from '@/lib/db/schema';

// Mock DB responses
let mockRecurringRows: any[] = [];
let mockDeletedIds: string[] = [];
let mockUpdatedRows: any[] = [];
// Per-test state for engine-level (detectRecurringTransactions) tests
const mockDetectState: {
  accounts?: any[];
  categories?: any[];
  userSettings?: any[];
  transactions?: any[];
  transactionTags?: any[];
  created?: any[];
  queriedTransactionTags?: boolean;
} = {};

class MockDbQueryBuilder {
  private table: any = null;

  select() {
    this.table = null;
    return this;
  }
  from(table: any) {
    this.table = table;
    return this;
  }
  where(..._args: any[]) {
    // Flag access to the transaction_tags join table (used to assert the
    // tag exclusion query only runs when tag exclusions are configured).
    if (this.table === transactionTags) {
      mockDetectState.queriedTransactionTags = true;
    }
    return this;
  }
  orderBy(...args: any[]) {
    return this;
  }
  limit(n: number) {
    const rows = resultsFor(this.table);
    return {
      then: (onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any) =>
        Promise.resolve(rows).then((all: any[]) => onfulfilled?.(all.slice(0, n)), onrejected),
    };
  }
  transaction = async (fn: (tx: any) => Promise<any>) => fn(this);
  insert(table: any) {
    const isRecurring = table === recurringTransactions;
    return {
      values: (data: any) => {
        if (isRecurring) {
          mockDetectState.created = mockDetectState.created || [];
          mockDetectState.created.push(data);
        }
        return {
          returning: async () => [data],
        };
      },
    };
  }
  update(table: any) {
    return {
      set: (data: any) => ({
        where: async () => {
          mockUpdatedRows.push(data);
          if (mockRecurringRows.length > 0) {
            mockRecurringRows[0] = { ...mockRecurringRows[0], ...data };
          }
          return {
            returning: async () => [data],
          };
        },
      }),
    };
  }
  delete(table: any) {
    return {
      where: async () => {
        return { count: 1 };
      },
    };
  }
  async then(onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any) {
    return Promise.resolve(resultsFor(this.table)).then(onfulfilled, onrejected);
  }
}

// Map a schema table name to its fixture rows. Tables without explicit
// fixtures fall back to mockRecurringRows (legacy behavior for the
// mergeRecurringTransactions tests, which only query recurring_transactions).
// Dispatches on table identity: in drizzle v0.45 the PgTable instance exposes
// the table name only internally, so `table.name` is undefined.
function resultsFor(table: any): any[] {
  if (table === accounts) {
      return mockDetectState.accounts ?? [];
  }
  if (table === categories) {
      return mockDetectState.categories ?? [];
  }
  if (table === userSettings) {
      return mockDetectState.userSettings ?? [];
  }
  if (table === transactionTags) {
      return mockDetectState.transactionTags ?? [];
  }
  if (table === transactions) {
      return mockDetectState.transactions ?? mockRecurringRows;
  }
  // recurring_transactions (legacy merge tests) and anything unrecognized
      return mockRecurringRows;
}
vi.mock('@/lib/db', () => ({
  getDb: () => new MockDbQueryBuilder(),
}));

describe('Recurring Detection Engine', () => {
  let testDek: Uint8Array;

  beforeAll(async () => {
    process.env.ENCRYPTION_KEY = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
    testDek = new Uint8Array(32);
    crypto.getRandomValues(testDek);
  });

  describe('normalizeMerchantName', () => {
    it('strips common payment processor prefixes', () => {
      expect(normalizeMerchantName('SQ *COFFEE SHOP')).toBe('Coffee Shop');
      expect(normalizeMerchantName('TST* BAKERY & CAFE')).toBe('Bakery & Cafe');
      expect(normalizeMerchantName('PAYPAL *SPOTIFY USA')).toBe('Spotify Usa');
      expect(normalizeMerchantName('APPLE.COM/BILL')).toBe('Apple.com/bill');
      expect(normalizeMerchantName('AMZN Mktp US* 281938')).toBe('Amazon');
      expect(normalizeMerchantName('GOOGLE *SERVICES 12345')).toBe('Google');
    });

    it('strips store numbers, terminal numbers, and trailing reference IDs', () => {
      expect(normalizeMerchantName('TARGET STORE #1234')).toBe('Target');
      expect(normalizeMerchantName('SAFEWAY #4829 WA')).toBe('Safeway');
      expect(normalizeMerchantName('CHEVRON 0918237')).toBe('Chevron');
      expect(normalizeMerchantName('SHELL OIL 57382910')).toBe('Shell Oil');
      expect(normalizeMerchantName('TRADER JOE STORE 552')).toBe('Trader Joe');
    });

    it('strips card last4 masks and date tokens', () => {
      expect(normalizeMerchantName('NETFLIX.COM *1234 08/17')).toBe('Netflix.com');
      expect(normalizeMerchantName('PLANET FITNESS 2026-08-17')).toBe('Planet Fitness');
    });

    it('handles clean merchant names properly', () => {
      expect(normalizeMerchantName('Netflix')).toBe('Netflix');
      expect(normalizeMerchantName('spotify')).toBe('Spotify');
      expect(normalizeMerchantName('Equinox Gym')).toBe('Equinox Gym');
    });
  });

  describe('classifyFrequency', () => {
    it('classifies weekly intervals (~7 days)', () => {
      const { frequency, regularity } = classifyFrequency([7, 7, 7, 8, 6, 7]);
      expect(frequency).toBe('weekly');
      expect(regularity).toBe(1);
    });

    it('classifies bi-weekly intervals (~14 days)', () => {
      const { frequency, regularity } = classifyFrequency([14, 14, 13, 15, 14]);
      expect(frequency).toBe('biweekly');
      expect(regularity).toBe(1);
    });

    it('classifies monthly intervals (~30 days)', () => {
      const { frequency, regularity } = classifyFrequency([30, 31, 28, 31, 30]);
      expect(frequency).toBe('monthly');
      expect(regularity).toBe(1);
    });

    it('classifies quarterly intervals (~91 days)', () => {
      const { frequency, regularity } = classifyFrequency([90, 92, 89, 91]);
      expect(frequency).toBe('quarterly');
      expect(regularity).toBe(1);
    });

    it('classifies annual intervals (~365 days)', () => {
      const { frequency, regularity } = classifyFrequency([365, 366]);
      expect(frequency).toBe('annual');
      expect(regularity).toBe(1);
    });

    it('returns null for irregular intervals', () => {
      const { frequency } = classifyFrequency([3, 45, 12, 110, 4]);
      expect(frequency).toBeNull();
    });
  });

  describe('calculateNextExpectedDate & addFrequencyPeriod', () => {
    it('adds frequency period correctly', () => {
      expect(addFrequencyPeriod('2026-08-15', 'monthly')).toBe('2026-09-15');
      expect(addFrequencyPeriod('2026-08-15', 'weekly')).toBe('2026-08-22');
      expect(addFrequencyPeriod('2026-08-15', 'biweekly')).toBe('2026-08-29');
      expect(addFrequencyPeriod('2026-08-15', 'quarterly')).toBe('2026-11-15');
      expect(addFrequencyPeriod('2026-08-15', 'annual')).toBe('2027-08-15');
    });

    it('steps forward to next occurrence when last date is in past', () => {
      const nextDate = calculateNextExpectedDate('2026-01-15', 'monthly', '2026-08-17');
      expect(nextDate).toBe('2026-09-15');

      const nextDateBeforeDue = calculateNextExpectedDate('2026-01-15', 'monthly', '2026-08-10');
      expect(nextDateBeforeDue).toBe('2026-08-15');
    });
  });

  describe('addFrequencyPeriod month-end clamping', () => {
    it('clamps month-end dates to the last day of the target month', () => {
      expect(addFrequencyPeriod('2026-01-31', 'monthly')).toBe('2026-02-28');
      expect(addFrequencyPeriod('2024-01-31', 'monthly')).toBe('2024-02-29');
      expect(addFrequencyPeriod('2026-08-31', 'quarterly')).toBe('2026-11-30');
      expect(addFrequencyPeriod('2026-01-31', 'annual')).toBe('2027-01-31');
      expect(addFrequencyPeriod('2026-08-15', 'monthly')).toBe('2026-09-15');
    });
  });

  describe('patternMatches', () => {
    it('matches case-insensitively and supports alternation patterns', () => {
      expect(patternMatches('NETFLIX.COM *1234 08/17', 'netflix')).toBe(true);
      expect(patternMatches('Spotify USA', 'spotify usa|spotify ab')).toBe(true);
      expect(patternMatches('Hulu Bundle', 'spotify')).toBe(false);
      expect(patternMatches('', 'netflix')).toBe(false);
      expect(patternMatches('NETFLIX', 'netflix')).toBe(true);
    });
  });

  describe('Recency Thresholds (getMaxRecencyDays)', () => {
    it('enforces cadence-based recency cutoffs to omit old defunct subscriptions', () => {
      expect(getMaxRecencyDays('weekly')).toBe(28);
      expect(getMaxRecencyDays('biweekly')).toBe(45);
      expect(getMaxRecencyDays('monthly')).toBe(65);
      expect(getMaxRecencyDays('quarterly')).toBe(130);
      expect(getMaxRecencyDays('semi_annual')).toBe(220);
      expect(getMaxRecencyDays('annual')).toBe(400);
    });
  });

  describe('Multiplier Helpers', () => {
    it('calculates monthly and annual multipliers accurately', () => {
      expect(getMonthlyMultiplier('monthly')).toBe(1);
      expect(getMonthlyMultiplier('annual')).toBe(1 / 12);
      expect(getMonthlyMultiplier('quarterly')).toBe(1 / 3);
      expect(getAnnualMultiplier('monthly')).toBe(12);
      expect(getAnnualMultiplier('annual')).toBe(1);
    });
  });

  describe('mergeRecurringTransactions', () => {
    it('combines match patterns, recalculates occurrences, and merges target rule', async () => {
      const targetEncrypted = await encryptRow(
        'recurring_transactions',
        {
          id: 'target-1',
          userId: 'user-1',
          merchantName: 'Spotify USA',
          matchPattern: 'spotify usa',
          averageAmount: '10.99',
          lastAmount: '10.99',
          lastDate: '2026-08-01',
          nextExpectedDate: '2026-09-01',
          frequency: 'monthly',
          flowType: 'expense',
          isConfirmed: false,
          isDismissed: false,
          isPaused: false,
          occurrenceCount: 3,
          confidence: 85,
        },
        testDek
      );

      const sourceEncrypted = await encryptRow(
        'recurring_transactions',
        {
          id: 'source-1',
          userId: 'user-1',
          merchantName: 'Spotify AB',
          matchPattern: 'spotify ab',
          averageAmount: '9.99',
          lastAmount: '9.99',
          lastDate: '2026-07-01',
          nextExpectedDate: '2026-08-01',
          frequency: 'monthly',
          flowType: 'expense',
          isConfirmed: false,
          isDismissed: false,
          isPaused: false,
          occurrenceCount: 2,
          confidence: 80,
        },
        testDek
      );

      mockRecurringRows = [targetEncrypted, sourceEncrypted];

      const res = await mergeRecurringTransactions(
        'user-1',
        testDek,
        'target-1',
        ['source-1'],
        'Spotify Premium'
      );

      expect(res.success).toBe(true);
      expect(res.mergedItem.customName).toBe('Spotify Premium');
      expect(res.mergedItem.matchPattern).toBe('spotify usa|spotify ab');
      expect(res.mergedItem.occurrenceCount).toBe(5);
      expect(res.mergedItem.isConfirmed).toBe(true);
    });
  });

    describe('detectRecurringTransactions tag exclusions', () => {
      const baseTx = (id: string, date: string) => ({
        id,
        userId: 'user-1',
        accountId: 'acc-1',
        externalId: id,
        date,
        amount: '-15.00',
        description: 'NETFLIX',
        payee: 'NETFLIX',
        pending: false,
        categoryId: null,
        reviewed: false,
        categorizedByAi: false,
        ignored: false,
        deleted: false,
        isImported: false,
        source: 'bank',
      });

      const buildEncryptedFixtures = async (
        txs: any[],
        excludedTagIds: string[],
        txTags: any[]
      ) => {
        mockDetectState.accounts = [];
        mockDetectState.categories = [];
        mockDetectState.userSettings = [
          {
            userId: 'user-1',
            recurringExclusions: {
              categoryIds: [],
              accountIds: [],
              accountTypes: [],
              merchantPatterns: [],
              tagIds: excludedTagIds,
            },
          },
        ];
        mockDetectState.transactions = await Promise.all(
          txs.map((tx) => encryptRow('transactions', tx, testDek))
        );
        mockDetectState.transactionTags = txTags;
        mockDetectState.created = [];
        mockDetectState.queriedTransactionTags = false;
        // No pre-existing recurring items for these tests
        mockRecurringRows = [];
        mockUpdatedRows = [];
      };

      it('skips a transaction carrying an excluded tag while still detecting the rest', async () => {
        // Tagged 06-15 occurrence would otherwise push the group to 4
        // occurrences; with the tag exclusion only the 3 untagged monthly
        // occurrences (06-20, 07-20, 08-20) remain.
        await buildEncryptedFixtures(
          [
            baseTx('tx-tagged', '2026-06-15'),
            baseTx('tx-un-1', '2026-06-20'),
            baseTx('tx-un-2', '2026-07-20'),
            baseTx('tx-un-3', '2026-08-20'),
          ],
          ['tag-excl'],
          [{ transactionId: 'tx-tagged', tagId: 'tag-excl' }]
        );

        const res = await detectRecurringTransactions('user-1', testDek, {
          referenceDate: '2026-08-19',
        });

        expect(res.totalDetected).toBe(1);
        expect(mockDetectState.created).toHaveLength(1);
        // The service encrypts rows before insert; decrypt to inspect
        const createdRow = await decryptRow(
          'recurring_transactions',
          mockDetectState.created![0],
          testDek
        );
        expect(createdRow.merchantName).toBe('Netflix');
        expect(createdRow.occurrenceCount).toBe(3);
        expect(mockDetectState.queriedTransactionTags).toBe(true);
      });

      it('omits a merchant entirely when all its occurrences carry an excluded tag', async () => {
        await buildEncryptedFixtures(
          [
            baseTx('tx-all-1', '2026-06-10'),
            baseTx('tx-all-2', '2026-07-10'),
            baseTx('tx-all-3', '2026-08-10'),
          ],
          ['tag-excl'],
          [
            { transactionId: 'tx-all-1', tagId: 'tag-excl' },
            { transactionId: 'tx-all-2', tagId: 'tag-excl' },
            { transactionId: 'tx-all-3', tagId: 'tag-excl' },
          ]
        );

        const res = await detectRecurringTransactions('user-1', testDek, {
          referenceDate: '2026-08-19',
        });

        expect(res.totalDetected).toBe(0);
        expect(res.created).toBe(0);
        expect(mockDetectState.created).toHaveLength(0);
      });

      it('does not query the tag join table when no tags are excluded', async () => {
        await buildEncryptedFixtures(
          [
            baseTx('tx-nt-1', '2026-06-15'),
            baseTx('tx-nt-2', '2026-07-15'),
            baseTx('tx-nt-3', '2026-08-15'),
          ],
          [],
          []
        );

        const res = await detectRecurringTransactions('user-1', testDek, {
          referenceDate: '2026-08-19',
        });

        expect(res.totalDetected).toBe(1);
        expect(mockDetectState.created).toHaveLength(1);
        expect(mockDetectState.queriedTransactionTags).toBe(false);
      });

      it('excludes only the tagged transaction, not its split siblings (direct match)', async () => {
        // The split parent carries the excluded tag; its untagged children
        // must still count toward detection (direct-match semantics, matching
        // the budgets tag-exclusion behavior). Under whole-group exclusion the
        // group would have 0 visible transactions and nothing would be
        // detected.
        await buildEncryptedFixtures(
          [
            { ...baseTx('tx-split-parent', '2026-07-15'), parentId: null },
            { ...baseTx('tx-split-c1', '2026-06-15'), parentId: 'tx-split-parent' },
            { ...baseTx('tx-split-c2', '2026-07-20'), parentId: 'tx-split-parent' },
            { ...baseTx('tx-split-c3', '2026-08-15'), parentId: 'tx-split-parent' },
          ],
          ['tag-excl'],
          [{ transactionId: 'tx-split-parent', tagId: 'tag-excl' }]
        );

        const res = await detectRecurringTransactions('user-1', testDek, {
          referenceDate: '2026-08-19',
        });

        expect(res.totalDetected).toBe(1);
        expect(mockDetectState.created).toHaveLength(1);
        // Only the 3 untagged children form the group
        expect(mockDetectState.created![0].occurrenceCount).toBe(3);
      });
    });

  describe('mergeRecurringExclusions', () => {
    it('returns empty lists for no rows', () => {
      expect(mergeRecurringExclusions([])).toEqual({
        categoryIds: [],
        accountIds: [],
        accountTypes: [],
        tagIds: [],
        merchantPatterns: [],
      });
    });

    it('handles null/undefined rows and missing exclusion objects', () => {
      expect(mergeRecurringExclusions([null, undefined, {}, { recurringExclusions: null }])).toEqual({
        categoryIds: [],
        accountIds: [],
        accountTypes: [],
        tagIds: [],
        merchantPatterns: [],
      });
    });

    it('returns a single row\'s exclusions with defaults for missing keys', () => {
      const res = mergeRecurringExclusions([
        { recurringExclusions: { categoryIds: ['c1'], merchantPatterns: ['netflix'] } },
      ]);
      expect(res).toEqual({
        categoryIds: ['c1'],
        accountIds: [],
        accountTypes: [],
        tagIds: [],
        merchantPatterns: ['netflix'],
      });
    });

    it('unions exclusions across primary and member rows', () => {
      const res = mergeRecurringExclusions([
        {
          recurringExclusions: {
            categoryIds: ['c1'],
            accountIds: ['a1'],
            accountTypes: ['401k'],
            tagIds: ['t1'],
            merchantPatterns: ['netflix'],
          },
        },
        {
          recurringExclusions: {
            categoryIds: ['c2'],
            accountIds: ['a2'],
            accountTypes: ['mortgage'],
            tagIds: ['t2'],
            merchantPatterns: ['spotify'],
          },
        },
      ]);
      expect(res.categoryIds).toEqual(['c1', 'c2']);
      expect(res.accountIds).toEqual(['a1', 'a2']);
      expect(res.accountTypes).toEqual(['401k', 'mortgage']);
      expect(res.tagIds).toEqual(['t1', 't2']);
      expect(res.merchantPatterns).toEqual(['netflix', 'spotify']);
    });

    it('deduplicates values appearing in multiple rows', () => {
      const res = mergeRecurringExclusions([
        { recurringExclusions: { accountIds: ['a1', 'a2'], merchantPatterns: ['netflix'] } },
        { recurringExclusions: { accountIds: ['a2', 'a3'], merchantPatterns: ['netflix', 'hulu'] } },
      ]);
      expect(res.accountIds).toEqual(['a1', 'a2', 'a3']);
      expect(res.merchantPatterns).toEqual(['netflix', 'hulu']);
    });

    it('ignores non-string members and keeps first-seen order', () => {
      const res = mergeRecurringExclusions([
        { recurringExclusions: { merchantPatterns: ['b', '', null, 42, 'a'] } },
        { recurringExclusions: { merchantPatterns: ['b', 'c'] } },
      ]);
      expect(res.merchantPatterns).toEqual(['b', 'a', 'c']);
    });
  });
});
