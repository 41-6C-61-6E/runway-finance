import { vi, describe, it, expect, beforeAll } from 'vitest';
import { GET as exportGET } from '@/app/api/backup/export/route';
import { POST as importPOST } from '@/app/api/backup/import/route';
import {
  accounts,
  importLog,
  tags,
} from '@/lib/db/schema';

// Mock auth
vi.mock('@/lib/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'test-user-id' } }),
}));

// Mock crypto context
vi.mock('@/lib/crypto-context', () => ({
  getSessionDEK: vi.fn().mockResolvedValue(new Uint8Array(32)),
}));

// Mock crypto row decryption/encryption (just return rows as-is)
vi.mock('@/lib/crypto', () => ({
  decryptRow: vi.fn().mockImplementation((_table, row) => Promise.resolve(row)),
  encryptRow: vi.fn().mockImplementation((_table, row) => Promise.resolve(row)),
}));

// Setup mock database
const mockSelectResult = new Map<any, any[]>();
mockSelectResult.set(importLog, [{ id: 'imp-1', fileName: 'test.csv', fileContent: 'mocked-csv-content', userId: 'test-user-id' }]);
mockSelectResult.set(accounts, [{ id: 'acc-1', name: 'Chase Checking', userId: 'test-user-id' }]);
mockSelectResult.set(tags, [{ id: 'tag-1', name: 'tax', userId: 'test-user-id' }]);

const mockDb = {
  select: vi.fn().mockImplementation((selectFields) => {
    return {
      from: vi.fn().mockImplementation((table) => {
        return {
          innerJoin: vi.fn().mockReturnThis(),
          where: vi.fn().mockImplementation(() => {
            const resultPromise = (() => {
              if (table === importLog) {
                return Promise.resolve(mockSelectResult.get(importLog));
              }
              if (table === accounts) {
                return Promise.resolve(mockSelectResult.get(accounts));
              }
              if (table === tags) {
                return Promise.resolve(mockSelectResult.get(tags));
              }
              return Promise.resolve([{ transactionId: 'tx-1', tagId: 'tag-1' }]);
            })();
            (resultPromise as any).limit = vi.fn().mockImplementation(() => resultPromise);
            return resultPromise;
          }),
        };
      })
    };
  }),
  delete: vi.fn().mockReturnThis(),
  where: vi.fn().mockResolvedValue([]),
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockReturnThis(),
  onConflictDoNothing: vi.fn().mockResolvedValue([]),
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
  transaction: vi.fn().mockImplementation((callback) => callback(mockDb)),
  execute: vi.fn().mockResolvedValue([]),
};

vi.mock('@/lib/db', () => ({
  getDb: () => mockDb,
  getPool: () => ({
    connect: vi.fn().mockResolvedValue({
      query: vi.fn(),
      release: vi.fn(),
    }),
  }),
}));

describe('JSON Backup Export / Import API', () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = 'a'.repeat(64);
  });

  it('should export all tables including importLog fileContent and join tables', async () => {
    const response = await exportGET();
    expect(response.status).toBe(200);

    const backup = await response.json();
    expect(backup.version).toBe(1);
    expect(backup.data.import_log).toBeDefined();
    expect(backup.data.import_log[0].fileContent).toBe('mocked-csv-content');
    expect(backup.data.transaction_tags).toBeDefined();
    expect(backup.data.transaction_tags[0].transactionId).toBe('tx-1');
  });

  it('should successfully restore JSON backup', async () => {
    const backupPayload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      data: {
        import_log: [{ id: 'imp-1', fileName: 'test.csv', fileContent: 'mocked-csv-content' }],
        accounts: [{ id: 'acc-1', name: 'Chase Checking' }],
        transaction_tags: [{ transactionId: 'tx-1', tagId: 'tag-1' }],
      },
    };

    const request = new Request('http://localhost/api/backup/import', {
      method: 'POST',
      body: JSON.stringify(backupPayload),
    });

    const response = await importPOST(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(mockDb.insert).toHaveBeenCalled();
  });
});
