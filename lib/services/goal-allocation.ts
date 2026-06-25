import { getDb } from '@/lib/db';
import { financialGoals, accounts, goalAllocationHistory, userSettings } from '@/lib/db/schema';
import { and, eq, asc, desc, inArray, isNotNull } from 'drizzle-orm';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptField, decryptRow, decryptRows, encryptRow } from '@/lib/crypto';

export interface GoalAllocation {
  goalId: string;
  goalName: string;
  linkedAccountId: string;
  accountName: string;
  accountBalance: number;
  percentage: number;
  reserve: number;
  targetAmount: number;
  desiredAllocation: number;
  allocatedAmount: number;
  remainingOnAccount: number;
  isUnderfunded: boolean;
  sortOrder: number;
  status: string;
  // Enhancement 1: Fund release tracking
  releasedFunds?: number;
  isReleased?: boolean;
}

export interface AccountAllocation {
  accountId: string;
  accountName: string;
  accountBalance: number;
  totalDesired: number;
  totalAllocated: number;
  remaining: number;
  goals: GoalAllocation[];
  isOverallocated: boolean;
  // Enhancement 2: Overallocation warning
  overallocationPercentage?: number;
  // Enhancement 1: Released funds from completed goals
  releasedFromCompleted?: number;
}

export interface AllocationResult {
  accounts: AccountAllocation[];
  totalAllocated: number;
  totalDesired: number;
}

/**
 * Compute goal allocations across all accounts.
 * 
 * Algorithm:
 * 1. Fetch all active goals with linked accounts, ordered by sortOrder ASC
 * 2. Group goals by linkedAccountId
 * 3. For each account:
 *    - Fetch current balance
 *    - Sort goals by sortOrder (lower number first)
 *    - Iterate through goals: allocate min(desired, remaining)
 *    - desired = balance * (percentage / 100) - reserve (but reserve only once per account)
 *    - Completed goals release their allocation back to the pool
 * 4. Return allocation map
 */
export async function computeGoalAllocations(userId: string): Promise<AllocationResult> {
  const dek = await getSessionDEK();
  
  // Fetch all goals with linked accounts (including completed for fund release logic)
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

  // Separate active and completed goals
  const activeGoals = decryptedGoals.filter(g => g.status === 'active');
  const completedGoals = decryptedGoals.filter(g => g.status === 'completed');

  // Group goals by account
  const goalsByAccount = new Map<string, typeof activeGoals>();
  const sharedReservesByAccount = new Map<string, number>();
  
  // First, calculate individual reserves per goal
  for (const goal of activeGoals) {
    if (!goal.linkedAccountId) continue;
    if (!goalsByAccount.has(goal.linkedAccountId)) {
      goalsByAccount.set(goal.linkedAccountId, []);
    }
    goalsByAccount.get(goal.linkedAccountId)!.push(goal);
    
    // Track reserve per goal
    const reserve = parseFloat(goal.reserve) || 0;
    if (sharedReservesByAccount.has(goal.linkedAccountId)) {
      sharedReservesByAccount.set(goal.linkedAccountId, sharedReservesByAccount.get(goal.linkedAccountId)! + reserve);
    } else {
      sharedReservesByAccount.set(goal.linkedAccountId, reserve);
    }
  }

  const accountAllocations: AccountAllocation[] = [];
  let totalAllocated = 0;
  let totalDesired = 0;
  
  // Debug logging
  console.log('[GoalAllocation] Computing allocations for user:', userId);
  console.log('[GoalAllocation] Total goals with linked accounts:', decryptedGoals.length);
  console.log('[GoalAllocation] Active goals:', activeGoals.length);
  console.log('[GoalAllocation] Completed goals:', completedGoals.length);
  console.log('[GoalAllocation] Accounts with goals:', goalsByAccount.size);
  for (const [accountId, goals] of goalsByAccount) {
    console.log('[GoalAllocation] Account', accountId, ':', goals.length, 'goals');
    for (const g of goals) {
      console.log('[GoalAllocation]   -', g.name, '| sortOrder:', g.sortOrder, '| percentage:', g.percentage);
    }
  }

  for (const [accountId, goals] of goalsByAccount) {
    // Fetch account balance
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

    const decryptedBalance = await decryptField(accountData[0].balance, dek);
    const decryptedAccountName = await decryptField(accountData[0].name, dek);
    const accountBalance = parseFloat(decryptedBalance);
    
    // Sort goals by sortOrder (ascending) — determined by the reorder UI
    const sortedGoals = [...goals].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));

    let remaining = Math.max(0, accountBalance - sharedReservesByAccount.get(accountId)!);
    let totalDesiredForAccount = 0;
    const goalAllocations: GoalAllocation[] = [];
    const activeReserves: number[] = [];

    for (const goal of sortedGoals) {
      const percentage = parseFloat(goal.percentage) || 100;
      const reserve = parseFloat(goal.reserve) || 0;
      const goalTarget = parseFloat(goal.targetAmount) || 0;
      activeReserves.push(reserve);
      const availableBalance = Math.max(0, accountBalance - sharedReservesByAccount.get(accountId)!);
      const desiredAllocation = availableBalance * (percentage / 100);
      const allocatedAmount = Math.min(desiredAllocation, remaining, Math.max(0, goalTarget));
      
      // Round to 2 decimal places
      const allocated = Math.round(allocatedAmount * 100) / 100;
      const desired = Math.round(desiredAllocation * 100) / 100;
      
      remaining = Math.max(0, remaining - allocated);
      totalDesiredForAccount += desired;
      totalDesired += desired;
      totalAllocated += allocated;

      goalAllocations.push({
        goalId: goal.id,
        goalName: goal.name,
        linkedAccountId: goal.linkedAccountId!,
        accountName: decryptedAccountName,
        accountBalance,
        percentage,
        reserve: reserve,
        targetAmount: goalTarget,
        desiredAllocation: desired,
        allocatedAmount: allocated,
        remainingOnAccount: remaining,
        isUnderfunded: allocated < desired && allocated < goalTarget,
        sortOrder: goal.sortOrder,
        status: goal.status,
      });
    }

    // Enhancement 1: Release funds from completed goals
    const completedForAccount = completedGoals.filter(g => g.linkedAccountId === accountId);
    let releasedAmount = 0;

    // Fetch last known allocations for completed goals from DB (not in goalAllocations, which only has active goals)
    if (completedForAccount.length > 0) {
      const completedGoalIds = completedForAccount.map(g => g.id);
      const persistedCompleted = await getDb()
        .select({ id: financialGoals.id, allocatedAmount: financialGoals.allocatedAmount })
        .from(financialGoals)
        .where(inArray(financialGoals.id, completedGoalIds));

      const completedAllocations = new Map<string, number>();
      for (const pc of persistedCompleted) {
        const decrypted = await decryptRow('financial_goals', pc, dek);
        completedAllocations.set(pc.id, parseFloat(decrypted.allocatedAmount) || 0);
      }

      for (const completedGoal of completedForAccount) {
        const lastAllocated = completedAllocations.get(completedGoal.id) || 0;
        if (lastAllocated > 0) {
          releasedAmount += lastAllocated;
          remaining += lastAllocated;
        }
      }
    }

    // Redistribute released funds to remaining active goals
    if (releasedAmount > 0) {
      const underfundedGoals = goalAllocations
        .filter(g => g.isUnderfunded && g.status === 'active')
        .sort((a, b) => a.sortOrder - b.sortOrder);

      let remainingReleased = releasedAmount;
      
      for (const goal of underfundedGoals) {
        if (remainingReleased <= 0) break;
        
        const cap = Math.min(goal.desiredAllocation, goal.targetAmount);
        const shortfall = Math.max(0, cap - goal.allocatedAmount);
        const additional = Math.min(shortfall, remainingReleased);
        const additionalRounded = Math.round(additional * 100) / 100;
        
        goal.allocatedAmount = Math.round((goal.allocatedAmount + additionalRounded) * 100) / 100;
        goal.isUnderfunded = goal.allocatedAmount < goal.desiredAllocation;
        remainingReleased = Math.round((remainingReleased - additionalRounded) * 100) / 100;
      }

      // Update remaining on account
      for (const goal of goalAllocations) {
        if (goal.status === 'active') {
          const totalAllocatedForActiveGoals = goalAllocations
            .filter(g => g.status === 'active' && !g.isReleased)
            .reduce((sum, g) => sum + g.allocatedAmount, 0);
          goal.remainingOnAccount = Math.round((accountBalance - totalAllocatedForActiveGoals) * 100) / 100;
        }
      }
    }

    accountAllocations.push({
      accountId: accountData[0].id,
      accountName: decryptedAccountName,
      accountBalance,
      totalDesired: totalDesiredForAccount,
      totalAllocated: goalAllocations.reduce((sum, g) => sum + g.allocatedAmount, 0),
      remaining,
      goals: goalAllocations,
      isOverallocated: totalDesiredForAccount > accountBalance,
      releasedFromCompleted: releasedAmount,
    });
  }

  return {
    accounts: accountAllocations,
    totalAllocated,
    totalDesired,
  };
}

/**
 * Update allocated amounts for all goals based on current allocation
 */
export async function updateGoalAllocations(userId: string): Promise<void> {
  const allocation = await computeGoalAllocations(userId);
  const dek = await getSessionDEK();
  const db = getDb();

  // Retrieve user settings
  const [settings] = await db
    .select({
      notifyGoalMilestones: userSettings.notifyGoalMilestones,
    })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  // Fetch current goals from DB before we update them
  const persistedGoals = await db
    .select({
      id: financialGoals.id,
      allocatedAmount: financialGoals.allocatedAmount,
      targetAmount: financialGoals.targetAmount,
      name: financialGoals.name,
      status: financialGoals.status,
    })
    .from(financialGoals)
    .where(eq(financialGoals.userId, userId));

  const decryptedPersisted = await Promise.all(
    persistedGoals.map(async (g) => ({
      id: g.id,
      name: await decryptField(g.name, dek),
      targetAmount: parseFloat(await decryptField(g.targetAmount, dek)) || 0,
      allocatedAmount: parseFloat(await decryptField(g.allocatedAmount, dek)) || 0,
      status: g.status,
    }))
  );

  for (const account of allocation.accounts) {
    for (const goal of account.goals) {
      await db
        .update(financialGoals)
        .set({
          allocatedAmount: String(goal.allocatedAmount),
          updatedAt: new Date(),
        })
        .where(and(
          eq(financialGoals.id, goal.goalId as any),
          eq(financialGoals.userId, userId)
        ));

      // Check for savings milestone
      if (goal.status === 'active') {
        const prev = decryptedPersisted.find((g) => g.id === goal.goalId);
        if (prev) {
          // Standard system milestone
          if (settings?.notifyGoalMilestones) {
            const isNowFunded = goal.allocatedAmount >= goal.targetAmount && goal.targetAmount > 0;
            const wasFunded = prev.allocatedAmount >= prev.targetAmount;
            if (isNowFunded && !wasFunded) {
              const milestoneKey = `goal:${goal.goalId}:100`;
              // Call milestone checker dynamically to avoid circular imports
              const { sendPushNotification } = await import('@/lib/services/notifications');
              sendPushNotification(
                userId,
                `Savings Goal Reached!`,
                `Your savings goal "${goal.goalName}" is now fully funded!`,
                '/goals',
                'goal_milestone',
                milestoneKey
              ).catch((err) => {
                console.error('[GoalAllocation] Failed to send goal milestone notification:', err);
              });
            }
          }

          // Custom savings goal alerts
          const { checkSavingsGoalAlerts } = await import('@/lib/services/notifications');
          checkSavingsGoalAlerts(
            userId,
            goal.goalId,
            goal.goalName,
            goal.allocatedAmount,
            goal.targetAmount,
            prev.allocatedAmount
          ).catch((e) => {
            console.error('[GoalAllocation] Failed to check custom savings goal alerts:', e);
          });
        }
      }
    }
  }
}

/**
 * Get allocation for a specific goal
 */
export async function getGoalAllocation(goalId: string, userId: string): Promise<GoalAllocation | null> {
  const allocation = await computeGoalAllocations(userId);
  for (const account of allocation.accounts) {
    const goal = account.goals.find(g => g.goalId === goalId);
    if (goal) return goal;
  }
  return null;
}

/**
 * Check if multiple goals share the same account
 */
export async function findSharedAccounts(userId: string): Promise<Map<string, string[]>> {
  const dek = await getSessionDEK();
  
  const goals = await getDb()
    .select({
      id: financialGoals.id,
      linkedAccountId: financialGoals.linkedAccountId,
      status: financialGoals.status,
    })
    .from(financialGoals)
    .where(and(
      eq(financialGoals.userId, userId),
      eq(financialGoals.status, 'active'),
      isNotNull(financialGoals.linkedAccountId)
    ));

  const shared = new Map<string, string[]>();
  for (const goal of goals) {
    if (!goal.linkedAccountId) continue;
    if (!shared.has(goal.linkedAccountId)) {
      shared.set(goal.linkedAccountId, []);
    }
    shared.get(goal.linkedAccountId)!.push(goal.id);
  }

  // Only return accounts with multiple goals
  for (const [accountId, goalIds] of shared) {
    if (goalIds.length <= 1) {
      shared.delete(accountId);
    }
  }

  return shared;
}

/**
 * Snapshot current allocations to history
 */
export async function snapshotAllocationsToHistory(userId: string): Promise<void> {
  const allocation = await computeGoalAllocations(userId);
  
  for (const account of allocation.accounts) {
    for (const goal of account.goals) {
      await getDb().insert(goalAllocationHistory).values({
        userId,
        goalId: goal.goalId as any,
        accountId: goal.linkedAccountId as any,
        snapshotDate: new Date().toISOString().split('T')[0],
        accountBalance: String(goal.accountBalance),
        allocatedAmount: String(goal.allocatedAmount),
        desiredAmount: String(goal.desiredAllocation),
        percentage: String(goal.percentage),
        sortOrder: goal.sortOrder,
        isUnderfunded: goal.isUnderfunded,
        remainingOnAccount: String(goal.remainingOnAccount),
      });
    }
  }
}

/**
 * Get historical allocations for a goal
 */
export async function getGoalAllocationHistory(
  goalId: string,
  userId: string,
  limit: number = 30
): Promise<any[]> {
  const dek = await getSessionDEK();
  
  const history = await getDb()
    .select()
    .from(goalAllocationHistory)
    .where(and(
      eq(goalAllocationHistory.userId, userId),
      eq(goalAllocationHistory.goalId, goalId as any)
    ))
    .orderBy(desc(goalAllocationHistory.snapshotDate))
    .limit(limit);

  return history;
}
