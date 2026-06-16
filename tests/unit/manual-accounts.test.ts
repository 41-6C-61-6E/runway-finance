import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/crypto-context', () => ({
  getSessionDEK: vi.fn(),
}));

vi.mock('@/lib/db/seed-categories', () => {
  return {
    ensureSystemCategories: vi.fn(async () => 'cat_123'),
    ensureCompoundCategories: vi.fn(async () => {}),
    ensureEmployerContributions: vi.fn(async () => {}),
  };
});

import { accounts, accountSnapshots, transactions } from '@/lib/db/schema';
import { addAccountSnapshot } from '@/lib/services/manual-accounts';

// Mock variables to track calls
let mockInsertValues: any[] = [];
let mockUpdateValues: any[] = [];
let mockAccountResponse: any[] = [];

// Mock query builder
class MockDbQueryBuilder {
  select(...args: any[]) {
    return this;
  }

  from(table: any) {
    return this;
  }

  where(...args: any[]) {
    return this;
  }

  limit(n: number) {
    return this;
  }

  insert(table: any) {
    return this;
  }

  values(data: any) {
    mockInsertValues.push(data);
    return this;
  }

  onConflictDoUpdate(config: any) {
    return this;
  }

  update(table: any) {
    return this;
  }

  set(data: any) {
    mockUpdateValues.push(data);
    return this;
  }

  async then(onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any) {
    return Promise.resolve(mockAccountResponse).then(onfulfilled, onrejected);
  }
}

vi.mock('@/lib/db', () => {
  return {
    getDb: () => new MockDbQueryBuilder(),
    getPool: () => ({
      query: vi.fn(() => Promise.resolve({ rows: [] })),
    }),
  };
});

// Mock crypto
vi.mock('@/lib/crypto', () => {
  return {
    decryptField: vi.fn(async (val) => val),
    encryptField: vi.fn(async (val) => val),
    encryptRow: vi.fn(async (table, row) => row),
    decryptRows: vi.fn(async (table, rows) => rows),
  };
});

const { mockGenerateHistorical, mockGenerateAsset, mockRecalculate } = vi.hoisted(() => ({
  mockGenerateHistorical: vi.fn(async (...args: any[]) => ({ syntheticCount: 0, skippedRealCount: 0 })),
  mockGenerateAsset: vi.fn(async (...args: any[]) => 0),
  mockRecalculate: vi.fn(async (...args: any[]) => {}),
}));

vi.mock('@/lib/services/account-history', () => {
  return {
    generateHistoricalAccountSnapshots: mockGenerateHistorical,
    recalculateNetWorthSnapshots: mockRecalculate,
    getAccountEarliestCalculationDate: vi.fn(async () => '2023-01-01'),
  };
});

vi.mock('@/lib/services/asset-estimator', () => {
  return {
    generateAssetHistorySnapshots: mockGenerateAsset,
  };
});

describe('manual-accounts service - addAccountSnapshot', () => {
  beforeEach(() => {
    mockInsertValues = [];
    mockUpdateValues = [];
    mockAccountResponse = [];
    mockGenerateHistorical.mockClear();
    mockGenerateAsset.mockClear();
    mockRecalculate.mockClear();
  });

  it('updates account current balance if snapshot date is newer than balanceDate', async () => {
    mockAccountResponse = [
      {
        id: 'acc_123',
        userId: 'user_123',
        type: 'checking',
        balance: '1000.00',
        balanceDate: new Date('2026-06-01'),
        metadata: null,
      },
    ];

    const result = await addAccountSnapshot(
      'acc_123',
      'user_123',
      '2026-06-02',
      1200.00,
      'Test note'
    );

    expect(result.status).toBe('success');
    expect(result.newBalance).toBe(1200);

    // Expect account to be updated with new balance and date
    expect(mockUpdateValues).toHaveLength(1);
    expect(mockUpdateValues[0]).toEqual({
      balance: '1200',
      balanceDate: new Date('2026-06-02'),
      updatedAt: expect.any(Date),
    });

    // Expect snapshot to be inserted/updated
    expect(mockInsertValues).toContainEqual({
      userId: 'user_123',
      accountId: 'acc_123',
      snapshotDate: '2026-06-02',
      balance: '1200',
      isSynthetic: false,
      isImported: true,
    });

    // Expect $0 transaction with the note to be inserted
    expect(mockInsertValues).toContainEqual(
      expect.objectContaining({
        userId: 'user_123',
        accountId: 'acc_123',
        amount: '0',
        description: 'Snapshot Balance: $1,200.00 (Test note)',
      })
    );

    // Expect generateHistoricalAccountSnapshots and recalculateNetWorthSnapshots to be called
    expect(mockGenerateHistorical).toHaveBeenCalledWith('acc_123', 'user_123', '2023-01-01', expect.any(String), undefined);
    expect(mockRecalculate).toHaveBeenCalledWith('user_123', undefined);
  });

  it('does not update account current balance if snapshot date is older than balanceDate', async () => {
    mockAccountResponse = [
      {
        id: 'acc_123',
        userId: 'user_123',
        type: 'checking',
        balance: '1000.00',
        balanceDate: new Date('2026-06-05'),
        metadata: null,
      },
    ];

    const result = await addAccountSnapshot(
      'acc_123',
      'user_123',
      '2026-06-02',
      1200.00,
      'Older snapshot'
    );

    expect(result.status).toBe('success');

    // Current balance should NOT be updated because 2026-06-02 is before 2026-06-05
    expect(mockUpdateValues).toHaveLength(0);

    // Snapshot is still inserted/updated
    expect(mockInsertValues).toContainEqual({
      userId: 'user_123',
      accountId: 'acc_123',
      snapshotDate: '2026-06-02',
      balance: '1200',
      isSynthetic: false,
      isImported: true,
    });
  });
});
