import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computeGoalAllocations } from '@/lib/services/goal-allocation';
import { getTableName } from 'drizzle-orm';

const mockGoals: any[] = [];
const mockAccounts: any[] = [];

vi.mock('@/lib/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'user_1' } }),
}));

vi.mock('@/lib/crypto-context', () => ({
  getSessionDEK: vi.fn().mockResolvedValue(new Uint8Array(32)),
}));

vi.mock('@/lib/crypto', () => ({
  decryptField: vi.fn((val) => Promise.resolve(String(val ?? ''))),
  decryptRow: vi.fn((_table, row) => Promise.resolve({ ...row })),
  decryptRows: vi.fn((_table, rows) => Promise.resolve(rows.map((r: any) => ({ ...r })))),
  encryptRow: vi.fn((_table, data) => Promise.resolve(data)),
}));

vi.mock('@/lib/db', () => ({
  getDb: () => {
    const createChain = () => {
      let currentTable: any = null;
      const chain: any = {
        select: vi.fn(() => createChain()),
        from: vi.fn((table: any) => {
          currentTable = table;
          return chain;
        }),
        where: vi.fn(() => chain),
        orderBy: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        then: (resolve: (v: any) => any) => {
          const name = getTableName(currentTable) || currentTable?._?.name || currentTable?.name || '';
          if (name === 'accounts') {
            return Promise.resolve(mockAccounts).then(resolve);
          }
          return Promise.resolve(mockGoals).then(resolve);
        },
      };
      return chain;
    };
    return createChain();
  },
}));

describe('Goal Allocation Service (goal-allocation.ts)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGoals.length = 0;
    mockAccounts.length = 0;
  });

  it('handles $0 target goal without producing NaN or Infinity', async () => {
    mockGoals.push({
      id: 'goal_zero',
      userId: 'user_1',
      name: 'Zero Dollar Goal',
      linkedAccountId: 'acc_1',
      targetAmount: '0',
      percentage: '100',
      reserve: '0',
      sortOrder: 1,
      status: 'active',
    });

    mockAccounts.push({
      id: 'acc_1',
      userId: 'user_1',
      name: 'Checking',
      balance: '1000.00',
    });

    const res = await computeGoalAllocations('user_1');
    expect(res.accounts.length).toBe(1);
    expect(res.accounts[0].goals[0].allocatedAmount).toBe(0);
    expect(Number.isFinite(res.accounts[0].goals[0].allocatedAmount)).toBe(true);
    expect(Number.isFinite(res.totalAllocated)).toBe(true);
  });

  it('allocates funds by priority sortOrder across multiple goals on the same account', async () => {
    mockGoals.push(
      {
        id: 'goal_high_pri',
        userId: 'user_1',
        name: 'Emergency Fund',
        linkedAccountId: 'acc_1',
        targetAmount: '800',
        percentage: '100',
        reserve: '0',
        sortOrder: 1,
        status: 'active',
      },
      {
        id: 'goal_low_pri',
        userId: 'user_1',
        name: 'Vacation',
        linkedAccountId: 'acc_1',
        targetAmount: '500',
        percentage: '100',
        reserve: '0',
        sortOrder: 2,
        status: 'active',
      }
    );

    mockAccounts.push({
      id: 'acc_1',
      userId: 'user_1',
      name: 'Savings',
      balance: '1000.00',
    });

    const res = await computeGoalAllocations('user_1');
    const acc = res.accounts[0];
    expect(acc.goals[0].goalName).toBe('Emergency Fund');
    expect(acc.goals[0].allocatedAmount).toBe(800); // gets full 800
    expect(acc.goals[1].goalName).toBe('Vacation');
    expect(acc.goals[1].allocatedAmount).toBe(200); // gets remaining 200 of 1000
    expect(acc.totalAllocated).toBe(1000);
    expect(acc.remaining).toBe(0);
  });

  it('deducts reserve before allocating available balance', async () => {
    mockGoals.push({
      id: 'goal_1',
      userId: 'user_1',
      name: 'New Car',
      linkedAccountId: 'acc_1',
      targetAmount: '5000',
      percentage: '100',
      reserve: '500',
      sortOrder: 1,
      status: 'active',
    });

    mockAccounts.push({
      id: 'acc_1',
      userId: 'user_1',
      name: 'Savings',
      balance: '2000.00',
    });

    const res = await computeGoalAllocations('user_1');
    const goal = res.accounts[0].goals[0];
    // 2000 balance - 500 reserve = 1500 available
    expect(goal.desiredAllocation).toBe(1500);
    expect(goal.allocatedAmount).toBe(1500);
    expect(res.accounts[0].remaining).toBe(0);
  });

  it('identifies overallocated accounts', async () => {
    mockGoals.push(
      {
        id: 'goal_1',
        userId: 'user_1',
        name: 'Goal 1',
        linkedAccountId: 'acc_1',
        targetAmount: '1000',
        percentage: '70',
        reserve: '0',
        sortOrder: 1,
        status: 'active',
      },
      {
        id: 'goal_2',
        userId: 'user_1',
        name: 'Goal 2',
        linkedAccountId: 'acc_1',
        targetAmount: '1000',
        percentage: '60',
        reserve: '0',
        sortOrder: 2,
        status: 'active',
      }
    );

    mockAccounts.push({
      id: 'acc_1',
      userId: 'user_1',
      name: 'Checking',
      balance: '1000.00',
    });

    const res = await computeGoalAllocations('user_1');
    // Total desired is 700 + 600 = 1300 > 1000
    expect(res.accounts[0].isOverallocated).toBe(true);
    expect(res.accounts[0].totalDesired).toBe(1300);
    expect(res.accounts[0].totalAllocated).toBe(1000);
  });
});
