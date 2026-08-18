import type { QueryClient } from '@tanstack/react-query';
import {
  ACCOUNT_AFFECTED_PREFIXES,
  TRANSACTION_AFFECTED_PREFIXES,
  queryKeys,
} from '@/lib/query-keys';

/**
 * Centralized, intent-named cache invalidation helpers.
 *
 * These replace the copy-pasted 7-key invalidation blocks that previously lived
 * in AccountDetailDrawer / AutomaticAccountsSection / ManualAccountsSection /
 * OrphanedAccountsSection, and the missing-key gaps that left net-worth,
 * cash-flow, and investments stale after a mutation.
 *
 * All helpers are additive and non-breaking: they only invalidate (mark stale +
 * refetch active queries). They never delete data or change fetch behavior.
 */

/**
 * Invalidate every cache that depends on account data.
 * Use after creating, editing, deleting, remapping, or toggling an account.
 */
export function invalidateAfterAccountChange(queryClient: QueryClient): void {
  for (const prefix of ACCOUNT_AFFECTED_PREFIXES) {
    queryClient.invalidateQueries({ queryKey: prefix });
  }
}

/**
 * Invalidate every cache that depends on transaction data.
 * Use after creating, editing, splitting, categorizing, or deleting a
 * transaction (including bulk operations and rule runs).
 */
export function invalidateAfterTransactionChange(queryClient: QueryClient): void {
  for (const prefix of TRANSACTION_AFFECTED_PREFIXES) {
    queryClient.invalidateQueries({ queryKey: prefix });
  }
}

/**
 * Invalidate budget caches (budget list + the per-category top-transactions
 * tooltip). Use after budget create/edit/delete or exclusion changes.
 */
export function invalidateAfterBudgetChange(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: queryKeys.budgets.all });
  queryClient.invalidateQueries({ queryKey: queryKeys.budgets.topTransactions });
}

/**
 * Invalidate user-settings cache. Use after any settings PATCH.
 */
export function invalidateAfterSettingsChange(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: queryKeys.userSettings.all });
}

/**
 * Invalidate caches that depend on goal data. Goals are currently a local-state
 * island (no RQ `['goals']` query), but they affect net worth, cash-flow
 * projections, and the linked account's balance. Use after creating, editing,
 * or deleting a goal.
 */
export function invalidateAfterGoalChange(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: queryKeys.netWorth.chart });
  queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all });
  queryClient.invalidateQueries({ queryKey: queryKeys.accounts.allIncl });
  queryClient.invalidateQueries({ queryKey: queryKeys.cashFlow.categories });
  queryClient.invalidateQueries({ queryKey: queryKeys.cashFlow.cashVsCredit });
  queryClient.invalidateQueries({ queryKey: queryKeys.cashFlow.savingsRate });
}
