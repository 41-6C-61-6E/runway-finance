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
 * Compute goal projections for all linked accounts.
 *
 * Sawtooth model per month:
 * 1. Add monthly inflow to balance
 * 2. From available balance (after reserve), compute monthly allocation per goal by priority
 * 3. Track goal savings buckets (cumulative allocation per goal)
 * 4. When a goal's bucket reaches target → deduct full target from balance (the drop)
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
  const projectionMonths = overrides?.projectionMonths ?? 120;

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
      initialAllocation: parseFloat(g.allocatedAmount) || 0,
    }));

    const goalSavings = new Map<string, number>();
    const goalFundingMonth = new Map<string, number>();
    const fundedGoals = new Set<string>();

    for (const g of goalDefs) {
      goalSavings.set(g.goalId, g.initialAllocation);
      if (g.initialAllocation >= g.targetAmount && g.targetAmount > 0) {
        fundedGoals.add(g.goalId);
        goalFundingMonth.set(g.goalId, 0);
      }
    }

    const points: ProjectionPoint[] = [];
    let runningBalance = currentBalance;
    const now = new Date();

    const initialAllocations = Object.fromEntries(goalSavings);
    const initialAllocatedTotal = Array.from(goalSavings.values()).reduce((s, v) => s + v, 0);

    // Month 0: current state snapshot
    points.push({
      month: 0,
      date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
      accountBalance: currentBalance,
      totalAllocated: Math.round(initialAllocatedTotal * 100) / 100,
      goalAllocations: initialAllocations,
      goalFunding: [],
      availableAfterFunding: currentBalance,
    });

    // Remaining months: sequential allocation model matching static engine
    let stopMonth = projectionMonths;
    let allGoalsFundedDetected = false;

    for (let month = 1; month <= stopMonth; month++) {
      runningBalance = Math.round((runningBalance + monthlyInflow) * 100) / 100;

      const activeGoals = goalDefs.filter(g => !fundedGoals.has(g.goalId) && g.targetAmount > 0);
      const reserveUsed = activeGoals.reduce((sum, g) => sum + g.reserve, 0);

      const availableBalance = Math.max(0, runningBalance - reserveUsed);
      let remaining = availableBalance;

      const fundingEvents: string[] = [];

      // Sort active goals by sortOrder (higher priority first)
      const sortedActive = [...activeGoals].sort((a, b) => a.sortOrder - b.sortOrder || a.goalId.localeCompare(b.goalId));

      for (const g of sortedActive) {
        const desiredAllocation = availableBalance * (g.percentage / 100);
        const computed = Math.round(Math.min(desiredAllocation, remaining, g.targetAmount) * 100) / 100;
        
        const prev = goalSavings.get(g.goalId) || 0;
        const allocated = Math.round(Math.min(Math.max(prev, computed), remaining) * 100) / 100;

        goalSavings.set(g.goalId, allocated);
        remaining = Math.max(0, remaining - allocated);

        // Check if funded
        if (allocated >= g.targetAmount) {
          fundedGoals.add(g.goalId);
          goalFundingMonth.set(g.goalId, month);
          fundingEvents.push(g.goalName);
        }
      }

      const projDate = new Date(now);
      projDate.setMonth(projDate.getMonth() + month);

      const activeOrJustFunded = goalDefs.filter(g => !fundedGoals.has(g.goalId) || goalFundingMonth.get(g.goalId) === month);
      const totalAlloc = activeOrJustFunded.reduce((s, g) => s + (goalSavings.get(g.goalId) || 0), 0);

      // Record point at the PEAK (before deduction) so funding markers appear at the right place
      points.push({
        month,
        date: `${projDate.getFullYear()}-${String(projDate.getMonth() + 1).padStart(2, '0')}`,
        accountBalance: Math.max(0, runningBalance),
        totalAllocated: Math.round(totalAlloc * 100) / 100,
        goalAllocations: Object.fromEntries(
          goalDefs
            .filter(g => !fundedGoals.has(g.goalId) || goalFundingMonth.get(g.goalId) === month)
            .map(g => [g.goalId, goalSavings.get(g.goalId) || 0])
        ),
        goalFunding: fundingEvents,
        availableAfterFunding: Math.max(0, runningBalance),
      });

      // Deduct full targets from balance AFTER recording the point (the sawtooth drop)
      for (const g of activeGoals) {
        if (goalFundingMonth.get(g.goalId) === month) {
          runningBalance = Math.round((runningBalance - g.targetAmount) * 100) / 100;
        }
      }

      // Check if all goals are now funded
      const remainingUnfunded = goalDefs.filter(g => !fundedGoals.has(g.goalId) && g.targetAmount > 0);
      if (remainingUnfunded.length === 0 && !allGoalsFundedDetected) {
        allGoalsFundedDetected = true;
        stopMonth = Math.min(projectionMonths, month + 12);
      }
    }

    const goalProjections: GoalProjection[] = goalDefs.map(g => {
      const fundMonth = goalFundingMonth.get(g.goalId);
      const allocated = goalSavings.get(g.goalId) || 0;
      const isFunded = fundedGoals.has(g.goalId);

      let fundDate: string | null = null;
      if (fundMonth !== undefined && fundMonth > 0) {
        const d = new Date(now);
        d.setMonth(d.getMonth() + fundMonth);
        fundDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      } else if (fundMonth === 0) {
        fundDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
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

    const fundedMonths = Array.from(goalFundingMonth.values()).filter(m => m > 0);
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
      totalCurrent: Array.from(goalSavings.values()).reduce((s, v) => s + (v as number), 0),
    });
  }

  return {
    accounts: accountProjections,
    totalMonthlyInflow,
    lookbackMonths: 3,
    projectionMonths,
  };
}
