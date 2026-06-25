import { getDb } from '@/lib/db';
import { financialGoals, accounts, accountSnapshots } from '@/lib/db/schema';
import { and, eq, asc, gte, desc, isNotNull } from 'drizzle-orm';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptField, decryptRows } from '@/lib/crypto';

export interface GoalProjection {
  goalId: string;
  goalName: string;
  linkedAccountId: string;
  accountName: string;
  targetAmount: number;
  allocatedAmount: number;
  percentage: number;
  reserve: number;
  sortOrder: number;
  projectedFundDate: string | null;
  monthsToFund: number | null;
  isFunded: boolean;
  willFund: boolean;
}

export interface ProjectionPoint {
  month: number;
  date: string;
  accountBalance: number;
  totalAllocated: number;
  goalAllocations: Record<string, number>;
  goalFunding: string[];
  remaining: number;
}

export interface AccountProjection {
  accountId: string;
  accountName: string;
  accountBalance: number;
  monthlyInflow: number;
  goals: GoalProjection[];
  points: ProjectionPoint[];
  allFundedBy: string | null;
  totalTarget: number;
  totalCurrent: number;
}

export interface ProjectionsResult {
  accounts: AccountProjection[];
  totalMonthlyInflow: number;
  lookbackMonths: number;
  projectionMonths: number;
}

/**
 * Calculate average monthly inflow for an account over a lookback period.
 * Positive = net savings, negative = net spending.
 */
export async function calculateMonthlyInflow(
  accountId: string,
  userId: string,
  lookbackMonths: number = 6
): Promise<number> {
  const dek = await getSessionDEK();
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - lookbackMonths);

  const snapshots = await getDb()
    .select({
      balance: accountSnapshots.balance,
      snapshotDate: accountSnapshots.snapshotDate,
    })
    .from(accountSnapshots)
    .where(and(
      eq(accountSnapshots.accountId, accountId as any),
      eq(accountSnapshots.userId, userId),
      gte(accountSnapshots.snapshotDate, cutoff.toISOString().split('T')[0])
    ))
    .orderBy(asc(accountSnapshots.snapshotDate));

  if (snapshots.length < 2) {
    return 0;
  }

  const decrypted = await Promise.all(
    snapshots.map(async (s) => ({
      date: s.snapshotDate,
      balance: parseFloat(await decryptField(s.balance, dek)) || 0,
    }))
  );

  let totalChange = 0;
  for (let i = 1; i < decrypted.length; i++) {
    totalChange += decrypted[i].balance - decrypted[i - 1].balance;
  }

  const monthsSpan = decrypted.length - 1;
  return monthsSpan > 0 ? Math.round((totalChange / monthsSpan) * 100) / 100 : 0;
}

/**
 * Compute allocations for a set of goals against a given account balance.
 * Pure function — no DB access.
 */
function computeAllocationsForBalance(
  goals: Array<{
    goalId: string;
    goalName: string;
    targetAmount: number;
    percentage: number;
    reserve: number;
    sortOrder: number;
  }>,
  accountBalance: number,
  totalReserve: number
): Map<string, number> {
  const sorted = [...goals].sort((a, b) => a.sortOrder - b.sortOrder || a.goalId.localeCompare(b.goalId));
  const allocations = new Map<string, number>();
  let remaining = Math.max(0, accountBalance - totalReserve);

  for (const goal of sorted) {
    const availableBalance = Math.max(0, accountBalance - totalReserve);
    const desiredAllocation = availableBalance * (goal.percentage / 100);
    const allocatedAmount = Math.min(desiredAllocation, remaining, Math.max(0, goal.targetAmount));
    const allocated = Math.round(allocatedAmount * 100) / 100;

    allocations.set(goal.goalId, allocated);
    remaining = Math.max(0, remaining - allocated);
  }

  return allocations;
}

/**
 * Compute goal projections for all linked accounts.
 */
export async function computeGoalProjections(
  userId: string,
  overrides?: {
    monthlyInflow?: number;
    lookbackMonths?: number;
    projectionMonths?: number;
  }
): Promise<ProjectionsResult> {
  const dek = await getSessionDEK();
  const lookbackMonths = overrides?.lookbackMonths ?? 6;
  const projectionMonths = overrides?.projectionMonths ?? 60;

  const goals = await getDb()
    .select()
    .from(financialGoals)
    .where(and(
      eq(financialGoals.userId, userId),
      isNotNull(financialGoals.linkedAccountId)
    ))
    .orderBy(
      asc(financialGoals.sortOrder),
      asc(financialGoals.id)
    );

  const decryptedGoals = await decryptRows('financial_goals', goals, dek);
  const activeGoals = decryptedGoals.filter(g => g.status === 'active');

  // Group by account
  const goalsByAccount = new Map<string, typeof activeGoals>();
  for (const goal of activeGoals) {
    if (!goal.linkedAccountId) continue;
    if (!goalsByAccount.has(goal.linkedAccountId)) {
      goalsByAccount.set(goal.linkedAccountId, []);
    }
    goalsByAccount.get(goal.linkedAccountId)!.push(goal);
  }

  const accountProjections: AccountProjection[] = [];
  let totalMonthlyInflow = 0;

  for (const [accountId, accountGoals] of goalsByAccount) {
    const accountData = await getDb()
      .select({
        id: accounts.id,
        name: accounts.name,
        balance: accounts.balance,
      })
      .from(accounts)
      .where(and(
        eq(accounts.id, accountId as any),
        eq(accounts.userId, userId),
      ))
      .limit(1);

    if (!accountData[0]) continue;

    const currentBalance = parseFloat(await decryptField(accountData[0].balance, dek)) || 0;
    const accountName = await decryptField(accountData[0].name, dek);

    const monthlyInflow = overrides?.monthlyInflow !== undefined
      ? overrides.monthlyInflow
      : await calculateMonthlyInflow(accountId, userId, lookbackMonths);

    totalMonthlyInflow += monthlyInflow;

    const totalReserve = accountGoals.reduce((sum, g) => sum + (parseFloat(g.reserve) || 0), 0);

    const goalDefs = accountGoals.map(g => ({
      goalId: g.id,
      goalName: g.name,
      targetAmount: parseFloat(g.targetAmount) || 0,
      percentage: parseFloat(g.percentage) || 100,
      reserve: parseFloat(g.reserve) || 0,
      sortOrder: g.sortOrder,
    }));

    // Track cumulative allocations per goal
    const cumulativeAllocations = new Map<string, number>();
    const goalFundingMonth = new Map<string, number>();
    const fundedGoals = new Set<string>();

    const points: ProjectionPoint[] = [];
    let runningBalance = currentBalance;

    // Start with current state
    const initialAllocations = computeAllocationsForBalance(goalDefs, runningBalance, totalReserve);
    for (const g of goalDefs) {
      cumulativeAllocations.set(g.goalId, initialAllocations.get(g.goalId) || 0);
    }

    const now = new Date();

    for (let month = 0; month <= projectionMonths; month++) {
      const projDate = new Date(now);
      projDate.setMonth(projDate.getMonth() + month);

      const runningAllocations = computeAllocationsForBalance(goalDefs, runningBalance, totalReserve);

      for (const g of goalDefs) {
        cumulativeAllocations.set(g.goalId, runningAllocations.get(g.goalId) || 0);
      }

      const fundingEvents: string[] = [];

      for (const g of goalDefs) {
        if (!fundedGoals.has(g.goalId)) {
          const alloc = cumulativeAllocations.get(g.goalId) || 0;
          if (alloc >= g.targetAmount && g.targetAmount > 0) {
            fundedGoals.add(g.goalId);
            goalFundingMonth.set(g.goalId, month);
            fundingEvents.push(g.goalName);
          }
        }
      }

      const goalAllocRecord: Record<string, number> = {};
      for (const [gid, alloc] of cumulativeAllocations) {
        goalAllocRecord[gid] = alloc;
      }

      const totalAlloc = Array.from(cumulativeAllocations.values()).reduce((s, v) => s + v, 0);

      points.push({
        month,
        date: `${projDate.getFullYear()}-${String(projDate.getMonth() + 1).padStart(2, '0')}`,
        accountBalance: runningBalance,
        totalAllocated: Math.round(totalAlloc * 100) / 100,
        goalAllocations: goalAllocRecord,
        goalFunding: fundingEvents,
        remaining: Math.round(Math.max(0, runningBalance - totalAlloc) * 100) / 100,
      });

      // Advance the balance by one month's inflow
      runningBalance = Math.round((runningBalance + monthlyInflow) * 100) / 100;

      // Stop if all goals are funded and we have 12 extra months to show the steady state
      if (fundedGoals.size === goalDefs.length && month > 12) {
        break;
      }
    }

    const goalProjections: GoalProjection[] = goalDefs.map(g => {
      const fundMonth = goalFundingMonth.get(g.goalId);
      const allocated = cumulativeAllocations.get(g.goalId) || 0;
      const isFunded = fundedGoals.has(g.goalId);

      let fundDate: string | null = null;
      if (fundMonth !== undefined) {
        const d = new Date(now);
        d.setMonth(d.getMonth() + fundMonth);
        fundDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      }

      return {
        goalId: g.goalId,
        goalName: g.goalName,
        linkedAccountId: accountId,
        accountName,
        targetAmount: g.targetAmount,
        allocatedAmount: allocated,
        percentage: g.percentage,
        reserve: g.reserve,
        sortOrder: g.sortOrder,
        projectedFundDate: fundDate,
        monthsToFund: fundMonth !== undefined ? fundMonth : null,
        isFunded,
        willFund: fundMonth !== undefined,
      };
    });

    const fundedMonths = Array.from(goalFundingMonth.values());
    const maxFundMonth = fundedMonths.length > 0 ? Math.max(...fundedMonths) : null;
    const allFundedBy = maxFundMonth !== null
      ? (() => {
          const d = new Date(now);
          d.setMonth(d.getMonth() + maxFundMonth);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        })()
      : null;

    accountProjections.push({
      accountId,
      accountName,
      accountBalance: currentBalance,
      monthlyInflow,
      goals: goalProjections,
      points,
      allFundedBy,
      totalTarget: goalDefs.reduce((s, g) => s + g.targetAmount, 0),
      totalCurrent: Array.from(cumulativeAllocations.values()).reduce((s, v) => s + v, 0),
    });
  }

  return {
    accounts: accountProjections,
    totalMonthlyInflow,
    lookbackMonths,
    projectionMonths,
  };
}
