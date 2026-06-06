import { vi, describe, it, expect, beforeAll } from 'vitest';
import { GET } from '@/app/api/backup/export-csv/route';
import {
  accounts,
  categories,
  simplifinConnections,
  importLog,
  tags,
  paystubs,
  transactions,
} from '@/lib/db/schema';

// Mock auth
vi.mock('@/lib/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'test-user-id' } }),
}));

// Mock crypto context
vi.mock('@/lib/crypto-context', () => ({
  getSessionDEK: vi.fn().mockResolvedValue(new Uint8Array(32)),
}));

// Mock crypto row decryption (just return rows as-is)
vi.mock('@/lib/crypto', () => ({
  decryptRow: vi.fn().mockImplementation((_table, row) => Promise.resolve(row)),
}));

// Setup mock appends mapping
const mockAppends: Record<string, string> = {};

vi.mock('archiver', () => {
  return {
    default: vi.fn().mockImplementation(() => {
      const listeners: Record<string, Function[]> = {};
      return {
        on: (event: string, callback: Function) => {
          listeners[event] = listeners[event] || [];
          listeners[event].push(callback);
        },
        append: (content: string, options: { name: string }) => {
          mockAppends[options.name] = content;
        },
        finalize: async () => {
          if (listeners['end']) {
            for (const cb of listeners['end']) {
              cb();
            }
          }
        }
      };
    })
  };
});

// Setup mock database
const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockImplementation((table) => {
    return {
      where: vi.fn().mockImplementation(() => {
        if (table === accounts) {
          return Promise.resolve([
            { id: 'acc-1', name: 'Chase Checking', connectionId: 'conn-1', userId: 'test-user-id' }
          ]);
        }
        if (table === categories) {
          return Promise.resolve([
            { id: 'cat-1', name: 'Groceries', parentId: 'cat-parent', expenseParentId: 'cat-parent2', userId: 'test-user-id' },
            { id: 'cat-parent', name: 'Food', parentId: null, userId: 'test-user-id' },
            { id: 'cat-parent2', name: 'Food Expense', parentId: null, userId: 'test-user-id' }
          ]);
        }
        if (table === simplifinConnections) {
          return Promise.resolve([
            { id: 'conn-1', label: 'Primary Simplefin', userId: 'test-user-id' }
          ]);
        }
        if (table === importLog) {
          return Promise.resolve([
            { id: 'imp-1', fileName: 'statement.csv', userId: 'test-user-id' }
          ]);
        }
        if (table === tags) {
          return Promise.resolve([
            { id: 'tag-1', name: 'TaxDeductible', userId: 'test-user-id' }
          ]);
        }
        if (table === paystubs) {
          return Promise.resolve([
            { id: 'pay-1', employerName: 'Acme Corp', checkDate: '2026-06-01', userId: 'test-user-id' }
          ]);
        }
        if (table === transactions) {
          return Promise.resolve([
            {
              id: 'tx-1',
              accountId: 'acc-1',
              categoryId: 'cat-1',
              importId: 'imp-1',
              paystubId: 'pay-1',
              amount: '-10.50',
              description: 'Supermarket',
              userId: 'test-user-id'
            }
          ]);
        }
        return Promise.resolve([]);
      })
    };
  })
};

vi.mock('@/lib/db', () => ({
  getDb: () => mockDb,
}));

describe('CSV Backup Export ID Decoding', () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = 'a'.repeat(64);
  });

  it('should successfully append decoded columns to CSV rows', async () => {
    const response = await GET();
    expect(response.status).toBe(200);

    // Let's verify the captured CSV files in mockAppends
    expect(mockAppends['accounts.csv']).toBeDefined();
    expect(mockAppends['categories.csv']).toBeDefined();
    expect(mockAppends['transactions.csv']).toBeDefined();

    // 1. Verify accounts CSV
    const accountsLines = mockAppends['accounts.csv'].split('\n');
    const accountsHeaders = accountsLines[0].split(',');
    const connIdIndex = accountsHeaders.indexOf('connectionId');
    const connLabelIndex = accountsHeaders.indexOf('connectionLabel');

    expect(connIdIndex).not.toBe(-1);
    expect(connLabelIndex).toBe(connIdIndex + 1); // should be adjacent

    const accountsValues = accountsLines[1].split(',');
    expect(accountsValues[connIdIndex]).toBe('conn-1');
    expect(accountsValues[connLabelIndex]).toBe('Primary Simplefin');

    // 2. Verify categories CSV
    const categoriesLines = mockAppends['categories.csv'].split('\n');
    const categoriesHeaders = categoriesLines[0].split(',');
    const parentIdIndex = categoriesHeaders.indexOf('parentId');
    const parentNameIndex = categoriesHeaders.indexOf('parentCategoryName');
    const expenseParentIdIndex = categoriesHeaders.indexOf('expenseParentId');
    const expenseParentNameIndex = categoriesHeaders.indexOf('expenseParentCategoryName');

    expect(parentIdIndex).not.toBe(-1);
    expect(parentNameIndex).toBe(parentIdIndex + 1);
    expect(expenseParentIdIndex).not.toBe(-1);
    expect(expenseParentNameIndex).toBe(expenseParentIdIndex + 1);

    // Find row for cat-1
    const groceriesRow = categoriesLines.find(line => line.startsWith('cat-1'));
    expect(groceriesRow).toBeDefined();
    const groceriesValues = groceriesRow!.split(',');
    expect(groceriesValues[parentIdIndex]).toBe('cat-parent');
    expect(groceriesValues[parentNameIndex]).toBe('Food');
    expect(groceriesValues[expenseParentIdIndex]).toBe('cat-parent2');
    expect(groceriesValues[expenseParentNameIndex]).toBe('Food Expense');

    // 3. Verify transactions CSV
    const transactionsLines = mockAppends['transactions.csv'].split('\n');
    const transactionsHeaders = transactionsLines[0].split(',');
    
    const accIdIdx = transactionsHeaders.indexOf('accountId');
    const accNameIdx = transactionsHeaders.indexOf('accountName');
    const catIdIdx = transactionsHeaders.indexOf('categoryId');
    const catNameIdx = transactionsHeaders.indexOf('categoryName');
    const impIdIdx = transactionsHeaders.indexOf('importId');
    const impFileNameIdx = transactionsHeaders.indexOf('importFileName');
    const paystubIdIdx = transactionsHeaders.indexOf('paystubId');
    const paystubDescIdx = transactionsHeaders.indexOf('paystubDescription');

    expect(accNameIdx).toBe(accIdIdx + 1);
    expect(catNameIdx).toBe(catIdIdx + 1);
    expect(impFileNameIdx).toBe(impIdIdx + 1);
    expect(paystubDescIdx).toBe(paystubIdIdx + 1);

    const txValues = transactionsLines[1].split(',');
    expect(txValues[accIdIdx]).toBe('acc-1');
    expect(txValues[accNameIdx]).toBe('Chase Checking');
    expect(txValues[catIdIdx]).toBe('cat-1');
    expect(txValues[catNameIdx]).toBe('Groceries');
    expect(txValues[impIdIdx]).toBe('imp-1');
    expect(txValues[impFileNameIdx]).toBe('statement.csv');
    expect(txValues[paystubIdIdx]).toBe('pay-1');
    expect(txValues[paystubDescIdx]).toBe('Acme Corp (2026-06-01)');
  });
});
