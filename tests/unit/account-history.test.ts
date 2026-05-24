import { vi, describe, it, expect } from 'vitest';
import { accountSnapshots, transactions, accounts } from '@/lib/db/schema';
import { encryptField, decryptField } from '@/lib/crypto';
import { generateHistoricalAccountSnapshots } from '@/lib/services/account-history';

// Mock variables to control query responses
let mockRealSnapshotsResponse: any[] = [];
let mockEarliestTxResponse: any[] = [];
let mockPostedTxsResponse: any[] = [];
let mockLatestRealSnapshotResponse: any[] = [];
let mockAccountResponse: any[] = [{ externalId: 'imported-test-account-id' }];

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

  where(...args: any[]) {
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
});
