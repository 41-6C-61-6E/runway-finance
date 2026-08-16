import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { calculateMonthlyInflow, computeGoalProjections } from '@/lib/services/goal-projections';
import { getTableName } from 'drizzle-orm';

const mockGoals: any[] = [];
const mockAccounts: any[] = [];
const mockSnapshots: any[] = [];

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
          if (name === 'account_snapshots') {
            return Promise.resolve(mockSnapshots).then(resolve);
          }
          return Promise.resolve(mockGoals).then(resolve);
        },
      };
      return chain;
    };
    return createChain();
  },
}));

describe('Goal Projections Service (goal-projections.ts)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T12:00:00Z'));
    mockGoals.length = 0;
    mockAccounts.length = 0;
    mockSnapshots.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('calculateMonthlyInflow', () => {
    it('calculates annualized monthly rate from snapshots 30 days apart', async () => {
      mockSnapshots.push(
        { balance: '1000', snapshotDate: '2026-06-01' },
        { balance: '1500', snapshotDate: '2026-07-01' }
      );

      const inflow = await calculateMonthlyInflow('acc_1', 'user_1');
      // ~500 gain over 30 days -> ~508.33/mo
      expect(inflow).toBeGreaterThan(450);
      expect(inflow).toBeLessThan(550);
    });

    it('returns 0 when no snapshots exist and balance cannot be compared', async () => {
      const inflow = await calculateMonthlyInflow('acc_1', 'user_1');
      expect(inflow).toBe(0);
    });
  });

  describe('computeGoalProjections', () => {
    it('projects milestone funding months and dates for active goals', async () => {
      mockGoals.push({
        id: 'goal_car',
        userId: 'user_1',
        name: 'Car Downpayment',
        linkedAccountId: 'acc_1',
        targetAmount: '3000',
        percentage: '100',
        reserve: '0',
        sortOrder: 1,
        status: 'active',
      });

      mockAccounts.push({
        id: 'acc_1',
        userId: 'user_1',
        name: 'High Yield Savings',
        balance: '1000.00',
      });

      const res = await computeGoalProjections('user_1', {
        monthlyInflow: 500,
        projectionMonths: 24,
      });

      expect(res.accounts.length).toBe(1);
      const acc = res.accounts[0];
      expect(acc.accountName).toBe('High Yield Savings');
      expect(acc.goals.length).toBe(1);
      const goal = acc.goals[0];
      expect(goal.targetAmount).toBe(3000);
      // Needs 2000 more with 500/mo -> exactly 4 months
      expect(goal.monthsToFund).toBe(4);
      expect(goal.willFund).toBe(true);
      expect(goal.projectedFundDate).toBeDefined();
    });

    it('handles $0 target goal in projections gracefully', async () => {
      mockGoals.push({
        id: 'goal_zero',
        userId: 'user_1',
        name: 'Zero Goal',
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
        name: 'Savings',
        balance: '500.00',
      });

      const res = await computeGoalProjections('user_1', {
        monthlyInflow: 100,
      });

      expect(res.accounts[0].goals[0].targetAmount).toBe(0);
      expect(res.accounts[0].goals[0].monthsToFund).toBeNull();
    });
  });
});
