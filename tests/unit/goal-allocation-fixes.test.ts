import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computeGoalAllocations, snapshotAllocationsToHistory, getGoalAllocationHistory } from '@/lib/services/goal-allocation';
import { calculateMonthlyInflow, computeGoalProjections } from '@/lib/services/goal-projections';
import { calcGoalProgress } from '@/lib/utils/goals';
import { getTableName } from 'drizzle-orm';

const mockGoals: any[] = [];
const mockAccounts: any[] = [];
const mockSnapshots: any[] = [];
const mockHistory: any[] = [];

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
  encryptField: vi.fn((val) => Promise.resolve(String(val ?? ''))),
}));

vi.mock('@/lib/db', () => ({
  getDb: () => {
    const createChain = () => {
      let currentTable: any = null;
      let whereCond: any = null;
      const chain: any = {
        select: vi.fn(() => createChain()),
        from: vi.fn((table: any) => {
          currentTable = table;
          return chain;
        }),
        where: vi.fn((cond: any) => {
          whereCond = cond;
          return chain;
        }),
        orderBy: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        insert: vi.fn((table: any) => ({
          values: vi.fn((val: any) => {
            mockHistory.push(val);
            return Promise.resolve([val]);
          }),
        })),
        then: (resolve: (v: any) => any) => {
          const name = getTableName(currentTable) || currentTable?._?.name || currentTable?.name || '';
          if (name === 'accounts') {
            return Promise.resolve(mockAccounts).then(resolve);
          }
          if (name === 'account_snapshots') {
            // Extract cutoff date from Drizzle where condition
            let cutoff = '';
            const seen = new Set();
            const extractDate = (obj: any, depth = 0) => {
              if (!obj || depth > 8 || seen.has(obj)) return;
              if (typeof obj === 'string') {
                if (/^\d{4}-\d{2}-\d{2}$/.test(obj)) {
                  cutoff = obj;
                }
                return;
              }
              if (typeof obj === 'object') {
                seen.add(obj);
                for (const k of Object.keys(obj)) {
                  extractDate(obj[k], depth + 1);
                  if (cutoff) return;
                }
              }
            };
            extractDate(whereCond);

            let filtered = mockSnapshots;
            if (cutoff) {
              filtered = mockSnapshots.filter((s) => s.snapshotDate >= cutoff);
            }
            return Promise.resolve(filtered).then(resolve);
          }
          if (name === 'goal_allocation_history') {
            return Promise.resolve(mockHistory).then(resolve);
          }
          return Promise.resolve(mockGoals).then(resolve);
        },
      };
      return chain;
    };
    return createChain();
  },
}));

describe('Goal Allocation & Projection Financial Soundness Fixes (Review F08)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-20T12:00:00Z'));
    mockGoals.length = 0;
    mockAccounts.length = 0;
    mockSnapshots.length = 0;
    mockHistory.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('F08-8: calcGoalProgress Clamping', () => {
    it('clamps negative current balances/amounts to 0%', () => {
      expect(calcGoalProgress(1000, -250)).toBe(0);
      expect(calcGoalProgress(5000, -100)).toBe(0);
    });

    it('clamps amounts exceeding target to 100%', () => {
      expect(calcGoalProgress(1000, 1500)).toBe(100);
      expect(calcGoalProgress(2000, 2500)).toBe(100);
    });

    it('calculates exact progress percentage for normal values', () => {
      expect(calcGoalProgress(1000, 250)).toBe(25);
      expect(calcGoalProgress(1000, 500)).toBe(50);
      expect(calcGoalProgress(1000, 750)).toBe(75);
    });

    it('returns 0% for zero or invalid target amounts', () => {
      expect(calcGoalProgress(0, 500)).toBe(0);
      expect(calcGoalProgress(-100, 500)).toBe(0);
      expect(calcGoalProgress('invalid', 500)).toBe(0);
    });
  });

  describe('F08-2: Multi-Account Reserve Deduplication', () => {
    it('deducts reserve once per account (taking maximum) rather than summing across goals', async () => {
      // Account with $5,000 balance
      mockAccounts.push({
        id: 'acc_1',
        userId: 'user_1',
        name: 'Checking',
        balance: '5000.00',
      });

      // Three goals on the same account, each specifying a $1,000 reserve
      mockGoals.push(
        {
          id: 'goal_1',
          userId: 'user_1',
          name: 'Emergency Fund',
          linkedAccountId: 'acc_1',
          targetAmount: '2000',
          percentage: '100',
          reserve: '1000',
          sortOrder: 1,
          status: 'active',
        },
        {
          id: 'goal_2',
          userId: 'user_1',
          name: 'Vacation',
          linkedAccountId: 'acc_1',
          targetAmount: '2000',
          percentage: '100',
          reserve: '1000',
          sortOrder: 2,
          status: 'active',
        },
        {
          id: 'goal_3',
          userId: 'user_1',
          name: 'Gadgets',
          linkedAccountId: 'acc_1',
          targetAmount: '2000',
          percentage: '100',
          reserve: '1000',
          sortOrder: 3,
          status: 'active',
        }
      );

      const res = await computeGoalAllocations('user_1');
      const acc = res.accounts[0];

      // Available balance should be $5,000 - $1,000 (max reserve) = $4,000 (NOT $5,000 - $3,000 = $2,000)
      expect(acc.goals[0].allocatedAmount).toBe(2000); // Gets $2,000
      expect(acc.goals[1].allocatedAmount).toBe(2000); // Gets $2,000
      expect(acc.goals[2].allocatedAmount).toBe(0);    // Remaining $0 of $4,000 available
      expect(acc.totalAllocated).toBe(4000);
      expect(acc.remaining).toBe(0);
    });
  });

  describe('F08-1: Completed Goal Fund Release Integrity (No Phantom Money)', () => {
    it('never produces totalAllocated greater than physical accountBalance when completed goals exist', async () => {
      mockAccounts.push({
        id: 'acc_1',
        userId: 'user_1',
        name: 'Savings',
        balance: '10000.00',
      });

      // Goal 1 is completed with historical allocated amount of $4,000
      // Goal 2 and Goal 3 are active
      mockGoals.push(
        {
          id: 'goal_completed',
          userId: 'user_1',
          name: 'Old Completed Goal',
          linkedAccountId: 'acc_1',
          targetAmount: '4000',
          allocatedAmount: '4000',
          percentage: '100',
          reserve: '0',
          sortOrder: 1,
          status: 'completed',
        },
        {
          id: 'goal_active_1',
          userId: 'user_1',
          name: 'Active Goal 1',
          linkedAccountId: 'acc_1',
          targetAmount: '8000',
          percentage: '50', // desired: 5000
          reserve: '0',
          sortOrder: 2,
          status: 'active',
        },
        {
          id: 'goal_active_2',
          userId: 'user_1',
          name: 'Active Goal 2',
          linkedAccountId: 'acc_1',
          targetAmount: '8000',
          percentage: '60', // desired: 6000
          reserve: '0',
          sortOrder: 3,
          status: 'active',
        }
      );

      const res = await computeGoalAllocations('user_1');
      const acc = res.accounts[0];

      // Total allocated must NEVER exceed the $10,000 account balance
      expect(acc.totalAllocated).toBeLessThanOrEqual(10000);
      expect(acc.goals[0].allocatedAmount).toBe(5000); // 50% of 10000
      expect(acc.goals[1].allocatedAmount).toBe(5000); // gets remaining 5000 (of desired 6000)
      expect(acc.totalAllocated).toBe(10000);
    });
  });

  describe('F08-3: Pre-Funded Goals in Projections', () => {
    it('deducts pre-funded goal targets before projecting downstream active goals', async () => {
      mockAccounts.push({
        id: 'acc_1',
        userId: 'user_1',
        name: 'HYSA',
        balance: '10000.00',
      });

      mockGoals.push(
        {
          id: 'goal_prefunded',
          userId: 'user_1',
          name: 'Fully Funded Goal',
          linkedAccountId: 'acc_1',
          targetAmount: '8000',
          allocatedAmount: '8000', // Already 100% funded at start
          percentage: '100',
          reserve: '0',
          sortOrder: 1,
          status: 'active',
        },
        {
          id: 'goal_active',
          userId: 'user_1',
          name: 'Active Goal',
          linkedAccountId: 'acc_1',
          targetAmount: '5000',
          allocatedAmount: '2000', // Has $2,000 remaining from starting $10,000
          percentage: '100',
          reserve: '0',
          sortOrder: 2,
          status: 'active',
        }
      );

      const res = await computeGoalProjections('user_1', {
        monthlyInflow: 1000,
        projectionMonths: 24,
      });

      const acc = res.accounts[0];
      const activeGoal = acc.goals.find((g) => g.goalId === 'goal_active')!;

      // Needs $3,000 more ($5,000 target - $2,000 current).
      // At $1,000/mo inflow, it must take 3 months (NOT 1 month).
      expect(activeGoal.monthsToFund).toBe(3);
      expect(activeGoal.willFund).toBe(true);
    });
  });

  describe('F08-4: Lookback Months Inflow Customization', () => {
    it('respects lookbackMonths parameter for historical snapshot window', async () => {
      // Snapshots: 90 days ago = 1000, 15 days ago = 1600
      mockSnapshots.push(
        { balance: '1000', snapshotDate: '2026-05-20' }, // ~92 days ago
        { balance: '1600', snapshotDate: '2026-08-05' }  // ~15 days ago
      );

      // Default 2-month (60-day) lookback filters out the 90-day snapshot -> returns 0
      const defaultInflow = await calculateMonthlyInflow('acc_1', 'user_1', 2);
      expect(defaultInflow).toBe(0);

      // 4-month (120-day) lookback includes both snapshots -> calculates annualized inflow
      const fourMonthInflow = await calculateMonthlyInflow('acc_1', 'user_1', 4);
      expect(fourMonthInflow).toBeGreaterThan(200);
      expect(fourMonthInflow).toBeLessThan(300);
    });
  });

  describe('F08-7: Snapshot Allocations History Encryption', () => {
    it('encrypts goal allocation history records on snapshot and decrypts on query', async () => {
      mockAccounts.push({
        id: 'acc_1',
        userId: 'user_1',
        name: 'Checking',
        balance: '5000.00',
      });

      mockGoals.push({
        id: 'goal_1',
        userId: 'user_1',
        name: 'Emergency Fund',
        linkedAccountId: 'acc_1',
        targetAmount: '3000',
        percentage: '100',
        reserve: '0',
        sortOrder: 1,
        status: 'active',
      });

      await snapshotAllocationsToHistory('user_1');
      expect(mockHistory.length).toBe(1);

      const history = await getGoalAllocationHistory('goal_1', 'user_1');
      expect(history.length).toBe(1);
      expect(history[0].allocatedAmount).toBe('3000.00');
    });
  });
});
