import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock DB, auth, crypto context before imports
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/crypto-context', () => ({
  getSessionDEK: vi.fn(),
  getServerDEK: vi.fn(async () => new Uint8Array([1, 2, 3])),
}));

vi.mock('@/lib/db/seed-categories', () => ({
  ensureSystemCategories: vi.fn(async () => 'cat_123'),
  ensureCompoundCategories: vi.fn(async () => {}),
  ensureEmployerContributions: vi.fn(async () => {}),
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock crypto
let mockDecryptField = vi.fn(async (val: any) => val);
let mockEncryptField = vi.fn(async (val: any) => val);
vi.mock('@/lib/crypto', () => ({
  decryptField: (val: any) => mockDecryptField(val),
  encryptField: (val: any) => mockEncryptField(val),
  decryptRow: vi.fn(async (table: any, row: any) => row),
  encryptRow: vi.fn(async (table: any, row: any) => row),
  decryptRows: vi.fn(async (table: any, rows: any) => rows),
}));

// Mock database query builder
let mockInsertValues: any[] = [];
let mockUpdateValues: any[] = [];
let mockAccountResponse: any = [
  {
    id: 'acc_123',
    balance: '0',
    balanceDate: new Date(),
    type: 'primaryhome',
    metadata: null,
  },
];

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
  update(table: any) {
    return this;
  }
  set(data: any) {
    mockUpdateValues.push(data);
    return this;
  }
  returning() {
    return this;
  }
  async then(onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any) {
    return Promise.resolve(mockAccountResponse).then(onfulfilled, onrejected);
  }
}

vi.mock('@/lib/db', () => ({
  getDb: () => new MockDbQueryBuilder(),
}));

import { isRealEstateType } from '@/lib/services/manual-account-scheduler';
import { createManualAccount } from '@/lib/services/manual-accounts';

describe('Real Estate Coercion Logic', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockInsertValues = [];
    mockUpdateValues = [];
  });

  describe('isRealEstateType', () => {
    it('returns true for real estate types', () => {
      const reTypes = [
        'realestate', 'primaryhome', 'secondaryhome', 'rentalproperty', 'commercial', 'land', 'otherrealestate',
        'single-family', 'condo', 'townhouse', 'multi-family'
      ];
      for (const type of reTypes) {
        expect(isRealEstateType(type)).toBe(true);
      }
    });

    it('returns false for other types', () => {
      const nonReTypes = ['crypto', 'metals', 'checking', 'savings', 'vehicle', 'credit'];
      for (const type of nonReTypes) {
        expect(isRealEstateType(type)).toBe(false);
      }
    });
  });

  describe('createManualAccount daily coercion', () => {
    it('coerces daily sync frequency to weekly for real estate account', async () => {
      const mockInput = {
        userId: 'user_123',
        name: 'My House',
        type: 'primaryhome',
        metadata: {
          address: '123 Main St',
          syncFrequency: 'daily',
        },
      };

      const account = await createManualAccount(mockInput);
      expect(account).toBeDefined();

      // Check that metadata was coerced to weekly
      expect(mockInsertValues.length).toBeGreaterThan(0);
      const insertedAccount = mockInsertValues[0];
      expect(insertedAccount.metadata).toBeDefined();
      const meta = JSON.parse(insertedAccount.metadata);
      expect(meta.syncFrequency).toBe('weekly');
    });

    it('does not coerce daily sync frequency for non-real estate accounts', async () => {
      const mockInput = {
        userId: 'user_123',
        name: 'My Bitcoin Wallet',
        type: 'crypto',
        metadata: {
          xpub: 'xpub123',
          syncFrequency: 'daily',
        },
      };

      // Mock account response type for crypto
      mockAccountResponse = [
        {
          id: 'acc_456',
          balance: '0',
          balanceDate: new Date(),
          type: 'crypto',
          metadata: null,
        },
      ];

      const account = await createManualAccount(mockInput);
      expect(account).toBeDefined();

      expect(mockInsertValues.length).toBeGreaterThan(0);
      const insertedAccount = mockInsertValues.find(v => v.type === 'crypto');
      expect(insertedAccount).toBeDefined();
      const meta = JSON.parse(insertedAccount.metadata);
      expect(meta.syncFrequency).toBe('daily');
    });
  });
});
