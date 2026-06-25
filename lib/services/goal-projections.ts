import { getDb } from '@/lib/db';
import { financialGoals, accounts, accountSnapshots, goalAllocationHistory } from '@/lib/db/schema';
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
  availableAfterFunding: number;
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
 * Calculate average monthly net inflow for an account over the last ~90 days.
 * Uses account snapshots first, falls back to goal allocation history, then current balance.
 */
export async function calculateMonthlyInflow(
  accountId: string,
  userId: string
): Promise<number> {
  const dek = await getSessionDEK();
  const now = new Date();
  const cutoff90d = new Date(now);
  cutoff90d.setDate(cutoff90d.getDate() - 90);

  const cutoffStr = cutoff90d.toISOString().split('T')[0];

  // Try accountSnapshots first (most accurate)
  const snapshots = await getDb()
    .select({
      balance: accountSnapshots.balance,
      snapshotDate: accountSnapshots.snapshotDate,
    })
    .from(accountSnapshots)
    .where(and(
      eq(accountSnapshots.accountId, accountId as any),
      eq(accountSnapshots.userId, userId),
      gte(accountSnapshots.snapshotDate, cutoffStr)
    ))
    .orderBy(asc(accountSnapshots.snapshotDate));

  if (snapshots.length >= 2) {
    const decrypted = await Promise.all(
      snapshots.map(async (s) => ({
        date: new Date(s.snapshotDate),
        balance: parseFloat(await decryptField(s.balance, dek)) || 0,
      }))
    );

    const oldest = decrypted[0];
    const newest = decrypted[decrypted.length - 1];
    const daysDiff = (newest.date.getTime() - oldest.date.getTime()) / (1000 * 60 * 60 * 24);
    const balanceChange = newest.balance - oldest.balance;

    if (daysDiff >= 7) {
      // Annualize the monthly rate: (change / days) * 30.5
      return Math.round((balanceChange / daysDiff) * 30.5 * 100) / 100;
    }
  }

  // Fallback: try goal allocation history (tracks account balances on allocation snapshots)
  const allocHistory = await getDb()
    .select({
      accountBalance: goalAllocationHistory.accountBalance,
      snapshotDate: goalAllocationHistory.snapshotDate,
    })
    .from(goalAllocationHistory)
    .where(and(
      eq(goalAllocationHistory.accountId, accountId as any),
      eq(goalAllocationHistory.userId, userId),
      gte(goalAllocationHistory.snapshotDate, cutoffStr)
    ))
    .orderBy(asc(goalAllocationHistory.snapshotDate));

  if (allocHistory.length >= 2) {
    const decrypted = await Promise.all(
      allocHistory.map(async (h) => ({
        date: new Date(h.snapshotDate),
        balance: parseFloat(await decryptField(h.accountBalance, dek)) || 0,
      }))
    );

    const oldest = decrypted[0];
    const newest = decrypted[decrypted.length - 1];
    const daysDiff = (newest.date.getTime() - oldest.date.getTime()) / (1000 * 60 * 60 * 24);
    const balanceChange = newest.balance - oldest.balance;

    if (daysDiff >= 7) {
      return Math.round((balanceChange / daysDiff) * 30.5 * 100) / 100;
    }
  }

  // No data — return 0 so the user sees inflow defaults to 0 and can set it manually
  return 0;
}

/**
 * Compute how much of the current balance gets allocated to each goal.
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
    alreadyFunded: boolean;
  }>,
  accountBalance: number,
  totalReserve: number
): Map<string, number> {
  const unfunded = goals.filter(g => !g.alreadyFunded)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.goalId.localeCompare(b.goalId));

  const allocations = new Map<string, number>();
  let remaining = Math.max(0, accountBalance - totalReserve);

  for (const goal of unfunded) {
    const availableBalance = Math.max(0, accountBalance - totalReserve);
    const desiredAllocation = availableBalance * (goal.percentage / 100);
    const allocatedAmount = Math.min(desiredAllocation, remaining, Math.max(0, goal.targetAmount));
    const allocated = Math.round(allocatedAmount * 100) / 100;

    allocations.set(goal.goalId, allocated);
    remaining = Math.max(0, remaining - allocated);
  }

  // Already-funded goals get 0 new allocation
  for (const g of goals) {
    if (g.alreadyFunded) {
      allocations.set(g.goalId, 0);
    }
  }

  return allocations;
}

/**
 * Compute goal projections for all linked accounts.
 *
 * Algorithm per month:
 * 1. Add monthly inflow to balance
 * 2. Compute allocations from available balance (unfunded goals only, by priority)
 * 3. Deduct allocations from balance (money goes toward goals, reducing available funds)
 * 4. Check if any goals reach their target → mark as funded
 * 5. Record the state
 */
export async function computeGoalProjections(
  userId: string,
  overrides?: {
    monthlyInflow?: number;
    projectionMonths?: number;
  }
): Promise<ProjectionsResult> {
  const dek = await getSessionDEK();
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
  // Only project for active goals — paused/completed/pending goals are excluded
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
      : await calculateMonthlyInflow(accountId, userId);

    totalMonthlyInflow += monthlyInflow;

    const totalReserve = accountGoals.reduce((sum, g) => sum + (parseFloat(g.reserve) || 0), 0);

    const goalDefs = accountGoals.map(g => ({
      goalId: g.id,
      goalName: g.name,
      targetAmount: parseFloat(g.targetAmount) || 0,
      percentage: parseFloat(g.percentage) || 100,
      reserve: parseFloat(g.reserve) || 0,
      sortOrder: g.sortOrder,
      alreadyFunded: false,
    }));

    // Track state
    const cumulativeAllocations = new Map<string, number>();
    const goalFundingMonth = new Map<string, number>();
    const fundedGoals = new Set<string>();

    const points: ProjectionPoint[] = [];
    let runningBalance = currentBalance;
    let runningAvailable = currentBalance; // available after deductions
    const now = new Date();

    // Month 0: current state snapshot
    const month0Allocs = computeAllocationsForBalance(
      goalDefs.map(g => ({ ...g, alreadyFunded: fundedGoals.has(g.goalId) })),
      runningBalance,
      totalReserve
    );

    const initEvents: string[] = [];
    for (const g of goalDefs) {
      const alloc = month0Allocs.get(g.goalId) || 0;
      cumulativeAllocations.set(g.goalId, alloc);
      runningBalance -= alloc;
    }

    points.push({
      month: 0,
      date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
      accountBalance: currentBalance,
      totalAllocated: Array.from(cumulativeAllocations.values()).reduce((s, v) => s + v, 0),
      goalAllocations: Object.fromEntries(cumulativeAllocations),
      goalFunding: initEvents,
      availableAfterFunding: Math.max(0, runningBalance),
    });

    // Remaining months: add inflow, allocate, deduct, check funding
    for (let month = 1; month <= projectionMonths; month++) {
      // Add monthly inflow
      runningBalance = Math.round((runningBalance + monthlyInflow) * 100) / 100;

      // Compute monthly allocations (only unfunded goals get allocation)
      const monthlyAllocs = computeAllocationsForBalance(
        goalDefs.map(g => ({ ...g, alreadyFunded: fundedGoals.has(g.goalId) })),
        runningBalance,
        totalReserve
      );

      // Deduct allocations from balance (money earmarked for goals leaves the available pool)
      let monthlyAllocTotal = 0;
      for (const g of goalDefs) {
        const alloc = monthlyAllocs.get(g.goalId) || 0;
        if (!fundedGoals.has(g.goalId)) {
          cumulativeAllocations.set(g.goalId, (cumulativeAllocations.get(g.goalId) || 0) + alloc);
          monthlyAllocTotal += alloc;
        }
      }
      runningBalance = Math.round((runningBalance - monthlyAllocTotal) * 100) / 100;

      // Check for newly funded goals
      const fundingEvents: string[] = [];
      for (const g of goalDefs) {
        if (!fundedGoals.has(g.goalId)) {
          const cumAlloc = cumulativeAllocations.get(g.goalId) || 0;
          if (cumAlloc >= g.targetAmount && g.targetAmount > 0) {
            fundedGoals.add(g.goalId);
            goalFundingMonth.set(g.goalId, month);
            fundingEvents.push(g.goalName);
          }
        }
      }

      const projDate = new Date(now);
      projDate.setMonth(projDate.getMonth() + month);

      const goalAllocRecord: Record<string, number> = {};
      for (const [gid, alloc] of cumulativeAllocations) {
        goalAllocRecord[gid] = alloc;
      }

      const totalAlloc = Array.from(cumulativeAllocations.values()).reduce((s, v) => s + v, 0);

      points.push({
        month,
        date: `${projDate.getFullYear()}-${String(projDate.getMonth() + 1).padStart(2, '0')}`,
        accountBalance: Math.max(0, runningBalance + totalAlloc), // raw balance (what's in the account)
        totalAllocated: Math.round(totalAlloc * 100) / 100,
        goalAllocations: goalAllocRecord,
        goalFunding: fundingEvents,
        availableAfterFunding: Math.max(0, runningBalance), // free money after goal commitments
      });

      // Stop early if all goals funded + 12 steady-state months
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
    lookbackMonths: 3,
    projectionMonths,
  };
}
