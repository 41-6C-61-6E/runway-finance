import { vi, describe, it, expect } from 'vitest';
import { accountSnapshots, transactions, accounts } from '@/lib/db/schema';
import { encryptField, decryptField } from '@/lib/crypto';
import { generateHistoricalAccountSnapshots, recalculateNetWorthSnapshots, cleanupTransientZeroSnapshots } from '@/lib/services/account-history';

// Mock variables to control query responses
let mockRealSnapshotsResponse: any[] = [];
let mockEarliestTxResponse: any[] = [];
let mockPostedTxsResponse: any[] = [];
let mockLatestRealSnapshotResponse: any[] = [];
let mockAccountResponse: any[] = [{ externalId: 'imported-test-account-id' }];
let mockInsertValues: any[] = [];
let mockDeleteWhereCalls: any[] = [];

// Mock query builder to support Drizzle chained method calls without DB connection
class MockDbQueryBuilder {
  private _limitValue: number | null = null;
  private _fromTable: any = null;
  private _isDelete: boolean = false;

  select(...args: any[]) {
    return this;
  }

  from(table: any) {
    this._fromTable = table;
    return this;
  }

  delete(table: any) {
    this._isDelete = true;
    this._fromTable = table;
    return this;
  }

  insert(table: any) {
    this._fromTable = table;
    return this;
  }

  values(data: any) {
    mockInsertValues.push(data);
    return this;
  }

  where(...args: any[]) {
    if (this._isDelete) {
      mockDeleteWhereCalls.push(args);
    }
    return this;
  }

  orderBy(...args: any[]) {
    return this;
  }

  limit(n: number) {
    this._limitValue = n;
    return this;
  }

  // Chained promise resolution
  async then(onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any) {
    let result: any = [];
    if (this._isDelete) {
      result = [];
    } else if (this._fromTable === accountSnapshots) {
      if (this._limitValue === 1) {
        result = mockLatestRealSnapshotResponse;
      } else {
        result = mockRealSnapshotsResponse;
      }
    } else if (this._fromTable === transactions) {
      if (this._limitValue === 1) {
        result = mockEarliestTxResponse;
      } else {
        result = mockPostedTxsResponse;
      }
    } else if (this._fromTable === accounts) {
      result = mockAccountResponse;
    }
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }
}

// Mock pool query function
const mockPoolQuery = vi.fn((sqlText: string, params: any[]) => {
  const chunkLength = params ? params.length / 6 : 0;
  return Promise.resolve({
    rows: Array.from({ length: chunkLength }, (_, i) => ({ id: i })),
  });
});

vi.mock('@/lib/db', () => {
  return {
    getDb: () => new MockDbQueryBuilder(),
    getPool: () => ({
      query: mockPoolQuery,
    }),
  };
});

describe('account-history', () => {
  describe('generateHistoricalAccountSnapshots', () => {
    it('falls back to forward-from-0 if no real snapshots exist', async () => {
      mockRealSnapshotsResponse = [];
      mockEarliestTxResponse = [{ date: '2026-05-02' }];
      mockPostedTxsResponse = [
        { date: '2026-05-02', postedDate: null, amount: '10.00' },
        { date: '2026-05-03', postedDate: '2026-05-03', amount: '20.00' },
        { date: '2026-05-05', postedDate: '2026-05-05', amount: '-5.00' },
      ];
      mockPoolQuery.mockClear();

      const result = await generateHistoricalAccountSnapshots(
        'acct_123',
        'user_123',
        '2026-05-01',
        '2026-05-05'
      );

      // We expect 4 synthetic snapshots created (for 2026-05-02, 2026-05-03, 2026-05-04, 2026-05-05)
      // 2026-05-01 has no snapshot since earliest transaction is on 2026-05-02 and we have no real snapshots
      expect(result.syntheticCount).toBe(4);
      expect(result.skippedRealCount).toBe(0);

      // Extract details of what was inserted
      const inserted: any[] = [];
      for (const call of mockPoolQuery.mock.calls) {
        const params = call[1];
        for (let i = 0; i < params.length; i += 6) {
          inserted.push({
            userId: params[i],
            accountId: params[i + 1],
            snapshotDate: params[i + 2],
            balance: params[i + 3],
            isSynthetic: params[i + 4],
            isImported: params[i + 5],
          });
        }
      }

      expect(inserted).toHaveLength(4);
      expect(inserted[0]).toEqual({
        userId: 'user_123',
        accountId: 'acct_123',
        snapshotDate: '2026-05-02',
        balance: '10',
        isSynthetic: true,
        isImported: true,
      });
      expect(inserted[1]).toEqual({
        userId: 'user_123',
        accountId: 'acct_123',
        snapshotDate: '2026-05-03',
        balance: '30',
        isSynthetic: true,
        isImported: true,
      });
      expect(inserted[2]).toEqual({
        userId: 'user_123',
        accountId: 'acct_123',
        snapshotDate: '2026-05-04',
        balance: '30',
        isSynthetic: true,
        isImported: true,
      });
      expect(inserted[3]).toEqual({
        userId: 'user_123',
        accountId: 'acct_123',
        snapshotDate: '2026-05-05',
        balance: '25',
        isSynthetic: true,
        isImported: true,
      });
    });

    it('calculates backward and forward anchored to the earliest real snapshot', async () => {
      mockRealSnapshotsResponse = [
        { date: '2026-05-04', balance: '100.00' }
      ];
      mockEarliestTxResponse = [{ date: '2026-05-02' }];
      mockPostedTxsResponse = [
        { date: '2026-05-02', postedDate: null, amount: '10.00' },
        { date: '2026-05-03', postedDate: '2026-05-03', amount: '20.00' },
        { date: '2026-05-04', postedDate: '2026-05-04', amount: '-5.00' },
        { date: '2026-05-05', postedDate: '2026-05-05', amount: '15.00' },
      ];
      mockPoolQuery.mockClear();

      const result = await generateHistoricalAccountSnapshots(
        'acct_123',
        'user_123',
        '2026-05-01',
        '2026-05-05'
      );

      // Expected inserted: 2026-05-02, 2026-05-03, 2026-05-05.
      // 2026-05-04 is a real snapshot and should be skipped.
      // 2026-05-01 is before the earliest transaction date (2026-05-02) and should be skipped.
      expect(result.syntheticCount).toBe(3);
      expect(result.skippedRealCount).toBe(1);

      const inserted: any[] = [];
      for (const call of mockPoolQuery.mock.calls) {
        const params = call[1];
        for (let i = 0; i < params.length; i += 6) {
          inserted.push({
            userId: params[i],
            accountId: params[i + 1],
            snapshotDate: params[i + 2],
            balance: params[i + 3],
            isSynthetic: params[i + 4],
            isImported: params[i + 5],
          });
        }
      }

      expect(inserted).toHaveLength(3);
      // 2026-05-04 anchor balance is 100.
      // Backward calculation:
      // 2026-05-04 dailyChange is -5. 2026-05-03 balance = 100 - (-5) = 105.
      // 2026-05-03 dailyChange is 20. 2026-05-02 balance = 105 - 20 = 85.
      // Forward calculation:
      // 2026-05-05 dailyChange is 15. 2026-05-05 balance = 100 + 15 = 115.
      expect(inserted[0]).toEqual({
        userId: 'user_123',
        accountId: 'acct_123',
        snapshotDate: '2026-05-02',
        balance: '85',
        isSynthetic: true,
        isImported: true,
      });
      expect(inserted[1]).toEqual({
        userId: 'user_123',
        accountId: 'acct_123',
        snapshotDate: '2026-05-03',
        balance: '105',
        isSynthetic: true,
        isImported: true,
      });
      expect(inserted[2]).toEqual({
        userId: 'user_123',
        accountId: 'acct_123',
        snapshotDate: '2026-05-05',
        balance: '115',
        isSynthetic: true,
        isImported: true,
      });
    });

    it('correctly handles encryption and decryption when DEK is provided', async () => {
      const testDek = new Uint8Array(32);
      crypto.getRandomValues(testDek);

      const realBalanceRaw = '100.00';
      const encryptedRealBalance = await encryptField(realBalanceRaw, testDek);

      const txAmountRaw = '-10.00';
      const encryptedTxAmount = await encryptField(txAmountRaw, testDek);

      mockRealSnapshotsResponse = [
        { date: '2026-05-04', balance: encryptedRealBalance },
      ];
      mockEarliestTxResponse = [{ date: '2026-05-03' }];
      mockPostedTxsResponse = [
        { date: '2026-05-03', postedDate: '2026-05-03', amount: encryptedTxAmount },
      ];
      mockPoolQuery.mockClear();

      const result = await generateHistoricalAccountSnapshots(
        'acct_123',
        'user_123',
        '2026-05-03',
        '2026-05-04',
        testDek
      );

      expect(result.syntheticCount).toBe(1); // 2026-05-03 is synthetic; 2026-05-04 is real and skipped

      const call = mockPoolQuery.mock.calls[0];
      const params = call[1];
      const encryptedBalParam = params[3]; // balance is the 4th parameter

      // Verify that balance is encrypted (not a raw number string)
      expect(encryptedBalParam).not.toBe('100');
      expect(encryptedBalParam).not.toBe('100.00');

      // Decrypt the inserted balance and check if it matches '100' or '100.00'
      const decrypted = await decryptField(encryptedBalParam, testDek);
      expect(parseFloat(decrypted)).toBe(100);
    });

    it('handles toDate set to yesterday when the anchor date is today, and includes today\'s transactions in backward calculation', async () => {
      // Anchor (real snapshot) is today (2026-05-21)
      mockRealSnapshotsResponse = [
        { date: '2026-05-21', balance: '1000.00' }
      ];
      mockEarliestTxResponse = [{ date: '2026-05-18' }];
      mockPostedTxsResponse = [
        { date: '2026-05-19', postedDate: '2026-05-19', amount: '20.00' },
        { date: '2026-05-20', postedDate: '2026-05-20', amount: '30.00' },
        { date: '2026-05-21', postedDate: '2026-05-21', amount: '100.00' }, // Transaction on anchor date (today)
      ];
      mockPoolQuery.mockClear();

      // Recalculating up to yesterday (2026-05-20)
      const result = await generateHistoricalAccountSnapshots(
        'acct_123',
        'user_123',
        '2026-05-18', // fromDate
        '2026-05-20'  // toDate
      );

      // Expected synthetic: 2026-05-18, 2026-05-19, 2026-05-20
      expect(result.syntheticCount).toBe(3);

      const inserted: any[] = [];
      for (const call of mockPoolQuery.mock.calls) {
        const params = call[1];
        for (let i = 0; i < params.length; i += 6) {
          inserted.push({
            snapshotDate: params[i + 2],
            balance: params[i + 3],
          });
        }
      }

      // Check balance backward from anchor:
      // Today (2026-05-21) balance = 1000.
      // Today's transaction = 100. So end of yesterday (2026-05-20) balance = 1000 - 100 = 900.
      // Yesterday's transaction = 30. So end of 2026-05-19 balance = 900 - 30 = 870.
      // 2026-05-19 transaction = 20. So end of 2026-05-18 balance = 870 - 20 = 850.
      
      expect(inserted).toContainEqual({ snapshotDate: '2026-05-20', balance: '900' });
      expect(inserted).toContainEqual({ snapshotDate: '2026-05-19', balance: '870' });
      expect(inserted).toContainEqual({ snapshotDate: '2026-05-18', balance: '850' });
    });

    it('sets isImported to false if the account is not imported', async () => {
      mockRealSnapshotsResponse = [];
      mockEarliestTxResponse = [{ date: '2026-05-02' }];
      mockPostedTxsResponse = [
        { date: '2026-05-02', postedDate: null, amount: '10.00' },
      ];
      mockAccountResponse = [{ externalId: 'regular-account-id' }];
      mockPoolQuery.mockClear();

      const result = await generateHistoricalAccountSnapshots(
        'acct_123',
        'user_123',
        '2026-05-02',
        '2026-05-02'
      );

      expect(result.syntheticCount).toBe(1);

      const inserted: any[] = [];
      for (const call of mockPoolQuery.mock.calls) {
        const params = call[1];
        for (let i = 0; i < params.length; i += 6) {
          inserted.push({
            isImported: params[i + 5],
          });
        }
      }

      expect(inserted[0].isImported).toBe(false);
    });
  });

  describe('recalculateNetWorthSnapshots', () => {
    it('excludes refinanced or paid-off mortgage balances after their event date', async () => {
      mockInsertValues = [];

      // Set up accounts: a normal checking account, and a refinanced mortgage
      mockAccountResponse = [
        {
          id: 'acc_checking',
          name: 'Checking',
          type: 'checking',
          balance: '5000.00',
          isExcludedFromNetWorth: false,
          isHidden: false,
          metadata: null,
        },
        {
          id: 'acc_mortgage',
          name: 'Nationstar Mortgage',
          type: 'mortgage',
          balance: '250000.00',
          isExcludedFromNetWorth: false,
          isHidden: false,
          metadata: JSON.stringify({
            mortgageStatus: 'refinanced',
            refinanceDate: '2025-10-07',
          }),
        },
      ];

      // Set up snapshots for both accounts on three days:
      // 2025-10-06 (before refinance)
      // 2025-10-07 (refinance date, balance becomes 0)
      // 2025-10-08 (after refinance, balance is still 0/should be excluded)
      mockRealSnapshotsResponse = [
        { accountId: 'acc_checking', snapshotDate: '2025-10-06', balance: '5000.00', isSynthetic: false, isImported: false },
        { accountId: 'acc_mortgage', snapshotDate: '2025-10-06', balance: '250000.00', isSynthetic: false, isImported: false },

        { accountId: 'acc_checking', snapshotDate: '2025-10-07', balance: '5100.00', isSynthetic: false, isImported: false },
        { accountId: 'acc_mortgage', snapshotDate: '2025-10-07', balance: '0.00', isSynthetic: false, isImported: false },

        { accountId: 'acc_checking', snapshotDate: '2025-10-08', balance: '5200.00', isSynthetic: false, isImported: false },
        { accountId: 'acc_mortgage', snapshotDate: '2025-10-08', balance: '0.00', isSynthetic: false, isImported: false },
      ];

      await recalculateNetWorthSnapshots('user_123');

      // Should have generated 3 net worth snapshots
      expect(mockInsertValues).toHaveLength(3);

      // Day 1: 2025-10-06 (mortgage active)
      // totalAssets = 5000, totalLiabilities = 250000, netWorth = -245000
      const day1 = mockInsertValues.find(v => v.snapshotDate === '2025-10-06');
      expect(day1).toBeDefined();
      expect(day1.totalAssets).toBe('5000');
      expect(day1.totalLiabilities).toBe('250000');
      expect(day1.netWorth).toBe('-245000');
      expect(day1.breakdown.mortgage.value).toBe(250000);

      // Day 2: 2025-10-07 (refinance date)
      // totalAssets = 5100, totalLiabilities = 0, netWorth = 5100
      const day2 = mockInsertValues.find(v => v.snapshotDate === '2025-10-07');
      expect(day2).toBeDefined();
      expect(day2.totalAssets).toBe('5100');
      expect(day2.totalLiabilities).toBe('0');
      expect(day2.netWorth).toBe('5100');
      expect(day2.breakdown.mortgage.value).toBe(0);

      // Day 3: 2025-10-08 (after refinance date)
      // totalAssets = 5200, totalLiabilities = 0, netWorth = 5200
      // Mortgage breakdown should not exist (excluded) or have count 0
      const day3 = mockInsertValues.find(v => v.snapshotDate === '2025-10-08');
      expect(day3).toBeDefined();
      expect(day3.totalAssets).toBe('5200');
      expect(day3.totalLiabilities).toBe('0');
      expect(day3.netWorth).toBe('5200');
      expect(day3.breakdown.mortgage).toBeUndefined();
    });
  });

  describe('cleanupTransientZeroSnapshots', () => {
    it('deletes transient zero balance snapshots surrounded by non-zero ones', async () => {
      mockDeleteWhereCalls = [];
      mockRealSnapshotsResponse = [
        { id: 'snap_1', snapshotDate: '2026-05-24', balance: '100.00', isSynthetic: false },
        { id: 'snap_2', snapshotDate: '2026-05-25', balance: '0.00', isSynthetic: false },
        { id: 'snap_3', snapshotDate: '2026-05-26', balance: '0.00', isSynthetic: false },
        { id: 'snap_4', snapshotDate: '2026-05-27', balance: '120.00', isSynthetic: false },
      ];

      await cleanupTransientZeroSnapshots('acct_123', 'user_123');

      // The time gap between May 24 and May 27 is 3 days (<= 5).
      // So the zero-balance snapshots on May 25 and May 26 should be deleted.
      expect(mockDeleteWhereCalls).toHaveLength(1);
      const whereCondition = mockDeleteWhereCalls[0][0];
      expect(whereCondition).toBeDefined();
    });

    it('does not delete zero balance snapshots if the gap to next non-zero is too large', async () => {
      mockDeleteWhereCalls = [];
      mockRealSnapshotsResponse = [
        { id: 'snap_1', snapshotDate: '2026-05-20', balance: '100.00', isSynthetic: false },
        { id: 'snap_2', snapshotDate: '2026-05-21', balance: '0.00', isSynthetic: false },
        { id: 'snap_3', snapshotDate: '2026-05-27', balance: '120.00', isSynthetic: false },
      ];

      await cleanupTransientZeroSnapshots('acct_123', 'user_123');

      // May 20 to May 27 is 7 days (> 5), so it should NOT delete snap_2.
      expect(mockDeleteWhereCalls).toHaveLength(0);
    });
  });
});
