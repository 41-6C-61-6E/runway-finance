import { vi, describe, it, expect } from 'vitest';
import { accountSnapshots, accounts } from '@/lib/db/schema';
import { generateAssetHistorySnapshots } from '@/lib/services/asset-estimator';

// Mock variables to control query responses
let mockRealSnapshotsResponse: any[] = [];
let mockAccountBalanceResponse = { balance: '1148600.00' };

let mockInsertValues: any[] = [];

class MockDbQueryBuilder {
  private _fromTable: any = null;
  private _isDelete: boolean = false;

  select(...args: any[]) {
    this._isDelete = false;
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
    return this;
  }

  limit(n: number) {
    return this;
  }

  // Chained promise resolution
  async then(onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any) {
    let result: any = [];
    if (this._isDelete) {
      result = [];
    } else if (this._fromTable === accountSnapshots) {
      result = mockRealSnapshotsResponse;
    } else if (this._fromTable === accounts) {
      result = [mockAccountBalanceResponse];
    }
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }
}

vi.mock('@/lib/db', () => {
  return {
    getDb: () => new MockDbQueryBuilder(),
  };
});

// Mock FRED API responses using global fetch mock
vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      observations: [
        { date: '2024-01-01', value: '300.0' },
        { date: '2024-02-01', value: '305.0' },
        { date: '2024-03-01', value: '310.0' },
        { date: '2024-04-01', value: '315.0' },
      ],
    }),
  });
}));

describe('real estate snapshots generator', () => {
  it('filters out synthetic snapshots for months that are covered by real snapshots', async () => {
    // Mock 1 real snapshot in March 2024
    mockRealSnapshotsResponse = [
      { snapshotDate: '2024-03-31' },
    ];

    // Clear inserted values list
    mockInsertValues = [];
    process.env.FRED_API_KEY = 'test-key';

    const metadata = {
      purchasePrice: 900000,
      purchaseDate: '2024-01-01',
      zipCode: '98014',
    };

    const count = await generateAssetHistorySnapshots(
      'acc_realestate_123',
      'user_123',
      'realestate',
      metadata,
      undefined,
      undefined
    );

    // We generated 4 snapshots from HPI (Jan, Feb, Mar, Apr).
    // March has a real snapshot, so it should be filtered out.
    // So only Jan, Feb, Apr should be inserted as synthetic snapshots.
    // (Note: Purchase date Jan 01 is treated as real/isSynthetic=false, but still calculated).
    const inserted = mockInsertValues;

    // Verify March 2024 (2024-03-01 or similar) is not in the inserted snapshots
    const marchInsert = inserted.find((s: any) => s.snapshotDate.startsWith('2024-03'));
    expect(marchInsert).toBeUndefined();

    // Verify Jan, Feb, Apr are present
    const janInsert = inserted.find((s: any) => s.snapshotDate === '2024-01-01');
    const febInsert = inserted.find((s: any) => s.snapshotDate === '2024-02-01');
    const aprInsert = inserted.find((s: any) => s.snapshotDate === '2024-04-01');

    expect(janInsert).toBeDefined();
    expect(febInsert).toBeDefined();
    expect(aprInsert).toBeDefined();

    // Jan 01 is the purchase date, so it should have isSynthetic: false
    expect(janInsert.isSynthetic).toBe(false);
    // Other dates should have isSynthetic: true
    expect(febInsert.isSynthetic).toBe(true);
    expect(aprInsert.isSynthetic).toBe(true);
  });
});
