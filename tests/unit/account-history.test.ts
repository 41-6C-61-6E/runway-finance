import { vi, describe, it, expect } from 'vitest';
import { accountSnapshots, transactions, accounts, userSettings, holdingSnapshots } from '@/lib/db/schema';
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
let mockUserSettingsResponse: any[] = [];
let mockHoldingSnapshotsResponse: any[] = [];

// Mock query builder to support Drizzle chained method calls without DB connection
class MockDbQueryBuilder {
  private _limitValue: number | null = null;
  private _fromTable: any = null;
  private _isDelete: boolean = false;

  select(...args: any[]) {
    this._limitValue = null;
    this._fromTable = null;
    this._isDelete = false;
    return this;
  }

  from(table: any) {
    this._fromTable = table;
    return this;
  }

  delete(table: any) {
    this._limitValue = null;
    this._isDelete = true;
    this._fromTable = table;
    return this;
  }

  insert(table: any) {
    this._limitValue = null;
    this._isDelete = false;
    this._fromTable = table;
    return this;
  }

  values(data: any) {
    mockInsertValues.push(data);
    return this;
  }

  onConflictDoUpdate(config: any) {
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
    } else if (this._fromTable === userSettings) {
      result = mockUserSettingsResponse;
    } else if (this._fromTable === holdingSnapshots) {
      result = mockHoldingSnapshotsResponse;
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

    it('skips calculation and deletes synthetic snapshots for investment accounts when investments toggle is disabled', async () => {
      mockAccountResponse = [{ externalId: 'investment-account-id', type: 'investment' }];
      mockUserSettingsResponse = [{ showSyntheticData: { investments: false } }];
      mockDeleteWhereCalls = [];
      mockPoolQuery.mockClear();

      const result = await generateHistoricalAccountSnapshots(
        'acct_inv',
        'user_123',
        '2026-05-01',
        '2026-05-05'
      );

      expect(result.syntheticCount).toBe(0);
      expect(result.skippedRealCount).toBe(0);
      expect(mockDeleteWhereCalls).toHaveLength(1);
      
      // Verify the delete call is targeting isSynthetic: true
      const deleteCondition = mockDeleteWhereCalls[0][0];
      expect(deleteCondition).toBeDefined();
    });

    it('calculates historical snapshots for investment accounts when investments toggle is enabled', async () => {
      mockAccountResponse = [{ externalId: 'investment-account-id', type: 'investment' }];
      mockUserSettingsResponse = [{ showSyntheticData: { investments: true } }];
      mockRealSnapshotsResponse = [];
      mockEarliestTxResponse = [{ date: '2026-05-02' }];
      mockPostedTxsResponse = [
        { date: '2026-05-02', postedDate: null, amount: '10.00' },
        { date: '2026-05-03', postedDate: '2026-05-03', amount: '20.00' },
      ];
      mockPoolQuery.mockClear();

      const result = await generateHistoricalAccountSnapshots(
        'acct_inv',
        'user_123',
        '2026-05-02',
        '2026-05-03'
      );

      expect(result.syntheticCount).toBe(2);
    });

    it('filters out matching positive and negative transaction pairs when ignoreSettlementTransactions is enabled', async () => {
      mockAccountResponse = [{
        externalId: 'investment-account-id',
        type: 'investment',
        metadata: JSON.stringify({ ignoreSettlementTransactions: true })
      }];
      mockRealSnapshotsResponse = [];
      mockEarliestTxResponse = [{ date: '2026-06-08' }];
      mockPostedTxsResponse = [
        { date: '2026-06-08', postedDate: null, amount: '50.00', description: 'CASH' },
        { date: '2026-06-08', postedDate: null, amount: '-50.00', description: 'VANGUARD' },
        { date: '2026-06-09', postedDate: null, amount: '10.00', description: 'INTEREST' },
      ];
      mockUserSettingsResponse = [{ showSyntheticData: { investments: true } }];
      mockPoolQuery.mockClear();

      const result = await generateHistoricalAccountSnapshots(
        'acct_inv',
        'user_123',
        '2026-06-08',
        '2026-06-09'
      );

      // 2026-06-08 has +50 and -50 matching pair. The -50 is ignored, leaving +50 change.
      // So balance on 2026-06-08 = 50.
      // 2026-06-09 has +10. So balance on 2026-06-09 = 60.
      expect(result.syntheticCount).toBe(2);

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

      expect(inserted).toContainEqual({ snapshotDate: '2026-06-08', balance: '50' });
      expect(inserted).toContainEqual({ snapshotDate: '2026-06-09', balance: '60' });
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
    it('deletes transient zero balance snapshots surrounded by non-zero ones within 45 days', async () => {
      mockDeleteWhereCalls = [];
      mockRealSnapshotsResponse = [
        { id: 'snap_1', snapshotDate: '2026-05-24', balance: '100.00', isSynthetic: false, isImported: false },
        { id: 'snap_2', snapshotDate: '2026-05-25', balance: '0.00', isSynthetic: false, isImported: false },
        { id: 'snap_3', snapshotDate: '2026-05-26', balance: '0.00', isSynthetic: false, isImported: false },
        { id: 'snap_4', snapshotDate: '2026-05-27', balance: '120.00', isSynthetic: false, isImported: false },
      ];

      await cleanupTransientZeroSnapshots('acct_123', 'user_123');

      // The time gap between May 24 and May 27 is 3 days (<= 45).
      // So the zero-balance snapshots on May 25 and May 26 should be deleted.
      expect(mockDeleteWhereCalls).toHaveLength(1);
      const whereCondition = mockDeleteWhereCalls[0][0];
      expect(whereCondition).toBeDefined();
    });

    it('does not delete zero balance snapshots if the gap to next non-zero is too large (exceeds 45 days)', async () => {
      mockDeleteWhereCalls = [];
      mockRealSnapshotsResponse = [
        { id: 'snap_1', snapshotDate: '2026-05-01', balance: '100.00', isSynthetic: false, isImported: false },
        { id: 'snap_2', snapshotDate: '2026-05-02', balance: '0.00', isSynthetic: false, isImported: false },
        { id: 'snap_3', snapshotDate: '2026-06-25', balance: '120.00', isSynthetic: false, isImported: false },
      ];

      await cleanupTransientZeroSnapshots('acct_123', 'user_123');

      // May 01 to June 25 is 55 days (> 45), so it should NOT delete snap_2.
      expect(mockDeleteWhereCalls).toHaveLength(0);
    });

    it('does not delete zero balance snapshots if they are imported', async () => {
      mockDeleteWhereCalls = [];
      mockRealSnapshotsResponse = [
        { id: 'snap_1', snapshotDate: '2026-05-24', balance: '100.00', isSynthetic: false, isImported: true },
        { id: 'snap_2', snapshotDate: '2026-05-25', balance: '0.00', isSynthetic: false, isImported: true },
        { id: 'snap_3', snapshotDate: '2026-05-26', balance: '0.00', isSynthetic: false, isImported: true },
        { id: 'snap_4', snapshotDate: '2026-05-27', balance: '120.00', isSynthetic: false, isImported: true },
      ];

      await cleanupTransientZeroSnapshots('acct_123', 'user_123');

      // Even though the gap is 3 days (<= 45), these snapshots are imported, so they must not be deleted.
      expect(mockDeleteWhereCalls).toHaveLength(0);
    });

    it('uses market-data-driven engine for investments when toggle is enabled and holdings are present', async () => {
      mockAccountResponse = [{ externalId: 'plaid-invest-1', type: 'investment', metadata: null }];
      mockUserSettingsResponse = [{
        showSyntheticData: { global: true, investments: true },
        useMarketDataForSnapshots: true
      }];
      mockHoldingSnapshotsResponse = [
        {
          snapshotDate: '2026-05-28',
          securityId: 'sec_1',
          ticker: 'VTI',
          name: 'Vanguard Total Stock Market',
          quantity: '10',
          price: '95.00',
          value: '950.00'
        },
        {
          snapshotDate: '2026-05-29',
          securityId: 'sec_1',
          ticker: 'VTI',
          name: 'Vanguard Total Stock Market',
          quantity: '10',
          price: '97.00',
          value: '970.00'
        }
      ];
      // Real snapshots for anchoring
      mockRealSnapshotsResponse = [
        { date: '2026-05-28', balance: '1000.00', isSynthetic: false }
      ];

      mockPoolQuery.mockClear();
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('query1.finance.yahoo.com')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              chart: {
                result: [{
                  timestamp: [
                    Math.floor(new Date('2026-05-28T00:00:00Z').getTime() / 1000),
                    Math.floor(new Date('2026-05-29T00:00:00Z').getTime() / 1000)
                  ],
                  indicators: {
                    quote: [{
                      close: [100.00, 105.00]
                    }]
                  }
                }]
              }
            })
          });
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      try {
        const result = await generateHistoricalAccountSnapshots(
          'acct_123',
          'user_123',
          '2026-05-28',
          '2026-05-29'
        );

        // Expect 1 synthetic snapshot created for 2026-05-29 (since 2026-05-28 is covered by real snapshot)
        expect(result.syntheticCount).toBe(1);
        expect(result.skippedRealCount).toBe(0);

        // Verify inserted value (should be 1050.00)
        expect(mockPoolQuery).toHaveBeenCalled();
        const callParams = mockPoolQuery.mock.calls[0][1];
        // row schema: userId, accountId, snapshotDate, balance, isSynthetic, isImported
        expect(callParams[2]).toBe('2026-05-29');
        expect(callParams[3]).toBe('1050'); // 1050
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('falls back to transaction-based calculation if holdings are missing when toggle is enabled', async () => {
      mockAccountResponse = [{ externalId: 'plaid-invest-1', type: 'investment', metadata: null }];
      mockUserSettingsResponse = [{
        showSyntheticData: { global: true, investments: true },
        useMarketDataForSnapshots: true
      }];
      mockHoldingSnapshotsResponse = []; // empty holdings!
      mockRealSnapshotsResponse = [];
      mockEarliestTxResponse = [{ date: '2026-05-28' }];
      mockPostedTxsResponse = [
        { date: '2026-05-28', postedDate: null, amount: '500.00', description: 'deposit' },
        { date: '2026-05-29', postedDate: null, amount: '100.00', description: 'interest' }
      ];

      mockPoolQuery.mockClear();

      const result = await generateHistoricalAccountSnapshots(
        'acct_123',
        'user_123',
        '2026-05-28',
        '2026-05-29'
      );

      // Verify that it successfully falls back and runs transaction-based snapshots
      expect(result.syntheticCount).toBe(2);
      
      const inserted: any[] = [];
      for (const call of mockPoolQuery.mock.calls) {
        const params = call[1];
        for (let i = 0; i < params.length; i += 6) {
          inserted.push({
            date: params[i + 2],
            balance: params[i + 3]
          });
        }
      }
      expect(inserted).toHaveLength(2);
      expect(inserted[0]).toEqual({ date: '2026-05-28', balance: '500' });
      expect(inserted[1]).toEqual({ date: '2026-05-29', balance: '600' });
    });

    it('supports ticker mapping, constant price mapping, and carry-forward lookback on weekends', async () => {
      mockAccountResponse = [{ externalId: 'plaid-invest-1', type: 'investment', metadata: null }];
      mockUserSettingsResponse = [{
        showSyntheticData: { global: true, investments: true },
        useMarketDataForSnapshots: true
      }];
      mockHoldingSnapshotsResponse = [
        {
          snapshotDate: '2026-06-05',
          securityId: 'sec_1',
          ticker: 'LMCSTK',
          name: 'Lockheed Martin Stock',
          quantity: '10',
          price: '450.00',
          value: '4500.00'
        },
        {
          snapshotDate: '2026-06-05',
          securityId: 'sec_2',
          ticker: 'SCHMMF',
          name: 'Schwab Money Market Fund',
          quantity: '1000',
          price: '1.00',
          value: '1000.00'
        }
      ];
      mockRealSnapshotsResponse = [
        { date: '2026-06-05', balance: '5500.00', isSynthetic: false }
      ];

      mockPoolQuery.mockClear();
      const originalFetch = global.fetch;
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url.includes('query1.finance.yahoo.com')) {
          expect(url).toContain('LMT');
          expect(url).not.toContain('LMCSTK');
          expect(url).not.toContain('SCHMMF');

          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              chart: {
                result: [{
                  timestamp: [
                    Math.floor(new Date('2026-06-05T00:00:00Z').getTime() / 1000)
                  ],
                  indicators: {
                    quote: [{
                      close: [460.00]
                    }]
                  }
                }]
              }
            })
          });
        }
        return Promise.reject(new Error('Unknown URL'));
      });
      global.fetch = fetchMock;

      try {
        const result = await generateHistoricalAccountSnapshots(
          'acct_123',
          'user_123',
          '2026-06-05',
          '2026-06-07'
        );

        expect(result.syntheticCount).toBe(2);
        expect(mockPoolQuery).toHaveBeenCalled();
        const callParams = mockPoolQuery.mock.calls[0][1];
        
        expect(callParams[2]).toBe('2026-06-06');
        expect(callParams[3]).toBe('5500');

        expect(callParams[8]).toBe('2026-06-07');
        expect(callParams[9]).toBe('5500');
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe('financial fixes and enhancements', () => {
    it('corrects liability signs dynamically for positive credit card balances', async () => {
      // CC with positive convention: expense increases positive balance, payment decreases it
      mockAccountResponse = [
        {
          id: 'acct_cc_pos',
          externalId: 'imported-cc-pos',
          type: 'credit',
          metadata: null,
        }
      ];
      mockRealSnapshotsResponse = [
        { date: '2026-05-04', balance: '1000.00' }
      ];
      mockEarliestTxResponse = [{ date: '2026-05-02' }];
      mockPostedTxsResponse = [
        { date: '2026-05-02', postedDate: null, amount: '-50.00', description: 'Expense (charge)' },
        { date: '2026-05-03', postedDate: null, amount: '200.00', description: 'Payment' },
      ];
      mockPoolQuery.mockClear();

      const result = await generateHistoricalAccountSnapshots(
        'acct_cc_pos',
        'user_123',
        '2026-05-02',
        '2026-05-04'
      );

      // Expected inserted: 2026-05-02, 2026-05-03.
      expect(result.syntheticCount).toBe(2);

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

      // Anchor is 1000 at 2026-05-04
      // CC positive convention:
      // Backward pass:
      // 2026-05-04 is real. Prev date is 2026-05-03.
      // 2026-05-04 change is 0. Balance at 2026-05-03 is 1000.
      // 2026-05-03 has a payment of +200. So before that, balance was 1000 + 200 = 1200.
      // So balance on 2026-05-02 is 1200.
      expect(inserted).toContainEqual({ snapshotDate: '2026-05-03', balance: '1000' });
      expect(inserted).toContainEqual({ snapshotDate: '2026-05-02', balance: '1200' });
    });

    it('corrects liability signs dynamically for negative credit card balances', async () => {
      // CC with negative convention (SimpleFIN style): expense decreases balance (more negative), payment increases it
      mockAccountResponse = [
        {
          id: 'acct_cc_neg',
          externalId: 'imported-cc-neg',
          type: 'credit',
          metadata: null,
        }
      ];
      mockRealSnapshotsResponse = [
        { date: '2026-05-04', balance: '-1000.00' }
      ];
      mockEarliestTxResponse = [{ date: '2026-05-02' }];
      mockPostedTxsResponse = [
        { date: '2026-05-02', postedDate: null, amount: '-50.00', description: 'Expense' },
        { date: '2026-05-03', postedDate: null, amount: '200.00', description: 'Payment' },
      ];
      mockPoolQuery.mockClear();

      const result = await generateHistoricalAccountSnapshots(
        'acct_cc_neg',
        'user_123',
        '2026-05-02',
        '2026-05-04'
      );

      expect(result.syntheticCount).toBe(2);

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

      // Anchor is -1000 at 2026-05-04
      // CC negative convention:
      // Backward pass:
      // 2026-05-03 balance is -1000.
      // 2026-05-02 balance = -1000 - 200 = -1200.
      expect(inserted).toContainEqual({ snapshotDate: '2026-05-03', balance: '-1000' });
      expect(inserted).toContainEqual({ snapshotDate: '2026-05-02', balance: '-1200' });
    });

    it('enforces strict two-decimal-place rounding on all generated daily snapshots', async () => {
      mockAccountResponse = [
        {
          id: 'acct_checking',
          externalId: 'imported-checking',
          type: 'checking',
          metadata: null,
        }
      ];
      mockRealSnapshotsResponse = [];
      mockEarliestTxResponse = [{ date: '2026-05-02' }];
      // Accumulated float values that drift, e.g. 10.01 + 20.02 + 30.04 = 60.07000000000001
      mockPostedTxsResponse = [
        { date: '2026-05-02', postedDate: null, amount: '10.01' },
        { date: '2026-05-03', postedDate: null, amount: '20.02' },
        { date: '2026-05-04', postedDate: null, amount: '30.04' },
      ];
      mockPoolQuery.mockClear();

      const result = await generateHistoricalAccountSnapshots(
        'acct_checking',
        'user_123',
        '2026-05-02',
        '2026-05-04'
      );

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

      expect(inserted).toContainEqual({ snapshotDate: '2026-05-02', balance: '10.01' });
      expect(inserted).toContainEqual({ snapshotDate: '2026-05-03', balance: '30.03' });
      expect(inserted).toContainEqual({ snapshotDate: '2026-05-04', balance: '60.07' });
    });

    it('converts currencies in recalculateNetWorthSnapshots correctly', async () => {
      mockInsertValues = [];
      mockUserSettingsResponse = [{ currency: 'EUR' }]; // user's base currency is EUR
      mockAccountResponse = [
        {
          id: 'acc_usd',
          name: 'USD Account',
          type: 'checking',
          currency: 'USD',
          isExcludedFromNetWorth: false,
          isHidden: false,
        },
        {
          id: 'acc_eur',
          name: 'EUR Account',
          type: 'checking',
          currency: 'EUR',
          isExcludedFromNetWorth: false,
          isHidden: false,
        }
      ];
      mockRealSnapshotsResponse = [
        { accountId: 'acc_usd', snapshotDate: '2026-05-01', balance: '109.00' }, // 109 USD = 100 EUR
        { accountId: 'acc_eur', snapshotDate: '2026-05-01', balance: '200.00' }, // 200 EUR = 200 EUR
      ];

      await recalculateNetWorthSnapshots('user_123');

      expect(mockInsertValues).toHaveLength(1);
      const snapshot = mockInsertValues[0];
      // Total assets in EUR should be: 109 USD converted to EUR (= 100 EUR) + 200 EUR = 300 EUR
      expect(snapshot.totalAssets).toBe('300');
      expect(snapshot.totalLiabilities).toBe('0');
      expect(snapshot.netWorth).toBe('300');
    });

    it('interpolates balances directly for investment accounts before the first holdings sync date', async () => {
      mockAccountResponse = [
        {
          id: 'acc_invest',
          externalId: 'imported-invest',
          type: 'investment',
          metadata: null,
        }
      ];
      mockUserSettingsResponse = [
        {
          showSyntheticData: { global: true, investments: true },
          useMarketDataForSnapshots: true,
        }
      ];
      mockRealSnapshotsResponse = [
        { date: '2026-05-01', balance: '90000.00', isSynthetic: false, isImported: true },
        { date: '2026-06-01', balance: '100000.00', isSynthetic: false, isImported: false },
      ];
      mockHoldingSnapshotsResponse = [
        {
          snapshotDate: '2026-06-01',
          securityId: 'sec_1',
          ticker: 'SCHMMF',
          name: 'Schwab Money Market Fund',
          quantity: '100000',
          price: '1.00',
          value: '100000.00'
        }
      ];

      mockPoolQuery.mockClear();

      const result = await generateHistoricalAccountSnapshots(
        'acc_invest',
        'user_123',
        '2026-05-01',
        '2026-06-01'
      );

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

      const midPoint = inserted.find(s => s.snapshotDate === '2026-05-17');
      expect(midPoint).toBeDefined();
      const parsedVal = parseFloat(midPoint.balance);
      expect(parsedVal).toBeGreaterThan(94000);
      expect(parsedVal).toBeLessThan(96000);
    });

    it('applies linear discrepancy adjustment for investment accounts in standard transaction-based backfill', async () => {
      mockAccountResponse = [
        {
          id: 'acc_invest_std',
          externalId: 'imported-invest-std',
          type: 'investment',
          metadata: null,
        }
      ];
      mockRealSnapshotsResponse = [
        { date: '2026-06-01', balance: '100.00', isSynthetic: false, isImported: false },
      ];
      mockEarliestTxResponse = [{ date: '2026-05-01' }];
      // Contributions sum up to 20. Expected starting balance is 0.
      mockPostedTxsResponse = [
        { date: '2026-05-15', postedDate: null, amount: '20.00' },
      ];
      mockUserSettingsResponse = [
        {
          showSyntheticData: { global: true, investments: true },
          useMarketDataForSnapshots: false, // forces standard transaction-based backfill
        }
      ];

      mockPoolQuery.mockClear();

      const result = await generateHistoricalAccountSnapshots(
        'acc_invest_std',
        'user_123',
        '2026-05-01',
        '2026-06-01'
      );

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

      const startPoint = inserted.find(s => s.snapshotDate === '2026-05-01');
      expect(startPoint).toBeDefined();
      expect(parseFloat(startPoint.balance)).toBe(0);

      const midPoint = inserted.find(s => s.snapshotDate === '2026-05-17');
      expect(midPoint).toBeDefined();
      expect(parseFloat(midPoint.balance)).toBeCloseTo(61.29, 1);
    });

    it('automatically ignores internal transactions and clamps adjusted balances to 0 for investment accounts', async () => {
      mockAccountResponse = [
        {
          id: 'acc_invest_internal_test',
          externalId: 'imported-invest-internal-test',
          type: 'investment',
          metadata: null,
        }
      ];
      mockRealSnapshotsResponse = [
        { date: '2026-06-01', balance: '100.00', isSynthetic: false, isImported: false },
      ];
      mockEarliestTxResponse = [{ date: '2026-05-01' }];
      // Transactions:
      // 1. External contribution (rollover) of +40.00 (should be processed)
      // 2. Internal sweep in of -40.00 (should be ignored)
      // 3. Internal mutual fund buy of -40.00 (should be ignored)
      // 4. Same-day offset pair of +10.00 and -10.00 (should be ignored by auto same-day offset matching)
      mockPostedTxsResponse = [
        { date: '2026-05-10', postedDate: null, amount: '40.00', payee: 'Check - Rollover (incoming)', description: 'Rollover' },
        { date: '2026-05-12', postedDate: null, amount: '-40.00', payee: 'VANGUARD FEDERAL MONEY MARKET FUND - Sweep in', description: 'Sweep' },
        { date: '2026-05-15', postedDate: null, amount: '-40.00', payee: 'VANGUARD TARGET RETIREMENT 2050 - Buy', description: 'Buy' },
        { date: '2026-05-20', postedDate: null, amount: '10.00', payee: 'Vanguard Reinvest', description: 'Reinvest' },
        { date: '2026-05-20', postedDate: null, amount: '-10.00', payee: 'Vanguard Reinvest Buy', description: 'Buy' },
      ];
      mockUserSettingsResponse = [
        {
          showSyntheticData: { global: true, investments: true },
          useMarketDataForSnapshots: false,
        }
      ];

      mockPoolQuery.mockClear();

      const result = await generateHistoricalAccountSnapshots(
        'acc_invest_internal_test',
        'user_123',
        '2026-05-01',
        '2026-06-01'
      );

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

      // Check starting point (clamped to 0)
      const startPoint = inserted.find(s => s.snapshotDate === '2026-05-01');
      expect(startPoint).toBeDefined();
      expect(parseFloat(startPoint.balance)).toBe(0);

      // Check dates before the rollover on 2026-05-10
      // Expected start discrepancy should be calcStartVal = finalRealBalance (100) - externalTxAmount (40) = 60.
      // So starting from 0, it should linearly grow.
      // Crucially, it should NOT go negative or dip because the -40 sweeps/buys are ignored.
      for (const snap of inserted) {
        expect(parseFloat(snap.balance)).toBeGreaterThanOrEqual(0);
      }

      // Check midpoint value
      const midPoint = inserted.find(s => s.snapshotDate === '2026-05-17');
      expect(midPoint).toBeDefined();
      const midVal = parseFloat(midPoint.balance);
      expect(midVal).toBeGreaterThan(40);
      expect(midVal).toBeLessThan(100);
    });
  });
});
