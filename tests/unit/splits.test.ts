import { vi, describe, it, expect, beforeEach } from 'vitest';
import { SplitTransactionSchema } from '@/lib/validations/transaction';
import { getEarliestTransactionDate, generateHistoricalAccountSnapshots } from '@/lib/services/account-history';

// Mock variables to inspect select queries
let capturedWhereArgs: any[] = [];

class MockDbQueryBuilder {
  select(...args: any[]) {
    return this;
  }
  from() { return this; }
  delete(table: any) {
    return this;
  }
  insert(table: any) {
    return this;
  }
  values(data: any) {
    return this;
  }
  onConflictDoUpdate(config: any) {
    return this;
  }
  where(...args: any[]) {
    capturedWhereArgs.push(args);
    return this;
  }
  orderBy() { return this; }
  limit() { return this; }
  async then(onfulfilled?: (value: any) => any) {
    // Return empty results
    return Promise.resolve([]).then(onfulfilled);
  }
}

vi.mock('@/lib/db', () => {
  return {
    getDb: () => new MockDbQueryBuilder(),
  };
});

// Recursively search any object or string for parentId reference
function hasParentIdRef(val: any, visited = new Set()): boolean {
  if (!val) return false;
  if (visited.has(val)) return false;

  if (typeof val === 'string') {
    return val.toLowerCase().includes('parent');
  }

  if (typeof val === 'object') {
    visited.add(val);
    try {
      return Object.keys(val).some(k => {
        if (k === '__proto__') return false;
        if (k.toLowerCase().includes('parent')) return true;
        return hasParentIdRef(val[k], visited);
      });
    } catch {
      return false;
    }
  }

  return false;
}

describe('Transaction Splitting Unit Tests', () => {
  beforeEach(() => {
    capturedWhereArgs = [];
  });

  describe('Split Zod Validation Schema', () => {
    it('successfully validates a correct split payload', () => {
      const validPayload = {
        splits: [
          { amount: '50.00', categoryId: '47d7c672-005d-45db-bde0-e7fae44eb2d9', description: 'Part 1' },
          { amount: '50.00', categoryId: '69f37c56-f614-41d3-a554-b52b86ab326c', description: 'Part 2' }
        ]
      };
      const result = SplitTransactionSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it('fails to validate if there are fewer than 2 split items', () => {
      const invalidPayload = {
        splits: [
          { amount: '100.00', categoryId: '47d7c672-005d-45db-bde0-e7fae44eb2d9' }
        ]
      };
      const result = SplitTransactionSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
    });

    it('fails to validate if amount is missing or empty', () => {
      const invalidPayload = {
        splits: [
          { amount: '', categoryId: '47d7c672-005d-45db-bde0-e7fae44eb2d9' },
          { amount: '50.00', categoryId: '69f37c56-f614-41d3-a554-b52b86ab326c' }
        ]
      };
      const result = SplitTransactionSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
    });
  });

  describe('Account History Exclusions', () => {
    it('applies isNull(parentId) constraint when fetching the earliest transaction date', async () => {
      await getEarliestTransactionDate('account-123');
      
      const containsParentId = hasParentIdRef(capturedWhereArgs);
      expect(containsParentId).toBe(true);
    });

    it('applies isNull(parentId) constraint when generating snapshots (which pulls date ranges)', async () => {
      await generateHistoricalAccountSnapshots('account-123', 'user-123', '2026-07-01', '2026-07-31');
      
      const containsParentId = hasParentIdRef(capturedWhereArgs);
      expect(containsParentId).toBe(true);
    });
  });
});
