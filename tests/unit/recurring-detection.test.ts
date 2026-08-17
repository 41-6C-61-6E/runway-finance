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
} from '@/lib/services/recurring-detection';
import { encryptRow } from '@/lib/crypto';

// Mock DB responses
let mockRecurringRows: any[] = [];
let mockDeletedIds: string[] = [];
let mockUpdatedRows: any[] = [];

class MockDbQueryBuilder {
  select() { return this; }
  from(table: any) { return this; }
  where(...args: any[]) { return this; }
  orderBy(...args: any[]) { return this; }
  limit(...args: any[]) { return this; }
  transaction = async (fn: (tx: any) => Promise<any>) => fn(this);
  async insert(table: any) {
    return {
      values: async (data: any) => ({
        returning: async () => [data],
      }),
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
    return Promise.resolve(mockRecurringRows).then(onfulfilled, onrejected);
  }
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
});
