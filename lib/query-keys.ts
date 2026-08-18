/**
 * Centralized React Query Key Registry & Factories
 *
 * This is the single source of truth for query-key *prefixes* used by the
 * invalidation helpers in `lib/query-invalidation.ts`.
 *
 * IMPORTANT — current state of the codebase:
 * Most `useQuery` call sites still use inline string keys (e.g. `['accounts-all']`).
 * The prefixes below are written to MATCH those real keys so that prefix-based
 * invalidation works correctly. As call sites are migrated to use these factories,
 * the keys will converge on this registry.
 *
 * React Query matches by structural prefix: `invalidateQueries({ queryKey: ['accounts'] })`
 * matches `['accounts']`, `['accounts', false]` and `['accounts', true]`, but NOT
 * `['accounts-all']` (a different first element). That is why the accounts family
 * exposes BOTH `all` and `allIncl` prefixes.
 */

export const queryKeys = {
  accounts: {
    /** Matches `['accounts']`, `['accounts', false]`, `['accounts', true]`. */
    all: ['accounts'] as const,
    /** Matches `['accounts-all']` (includeHidden + includeVirtual variant). */
    allIncl: ['accounts-all'] as const,
    /** Matches `['accounts-history']`. */
    history: ['accounts-history'] as const,
    /** Matches `['account-transactions', ...]`. */
    transactions: ['account-transactions'] as const,
    /** Factory for a specific account's transactions. */
    transactionsFor: (accountId: string, startDate: string, endDate: string) =>
      ['account-transactions', accountId, startDate, endDate] as const,
  },

  budgets: {
    /** Matches `['budgets', periodType, periodKey]`. */
    all: ['budgets'] as const,
    /** Matches `['budget-top-transactions', ...]`. */
    topTransactions: ['budget-top-transactions'] as const,
  },

  categories: {
    /** Matches `['categories']`. */
    all: ['categories'] as const,
    /** Matches `['categories-all']`. */
    allIncl: ['categories-all'] as const,
  },

  tags: {
    /** Matches `['tags']`. */
    all: ['tags'] as const,
  },

  transactions: {
    /** Matches `['account-transactions', ...]` (the only RQ-backed transaction key). */
    all: ['account-transactions'] as const,
  },

  netWorth: {
    /** Matches `['net-worth-chart', ...]` (both the side-panel and main-chart shapes). */
    chart: ['net-worth-chart'] as const,
  },

  investments: {
    /** Matches `['investments']`. */
    all: ['investments'] as const,
    /** Matches `['investments-income']`. */
    income: ['investments-income'] as const,
    /** Matches `['investments-history', ...]`. */
    history: ['investments-history'] as const,
    /** Matches `['investments-quotes', ...]`. */
    quotes: ['investments-quotes'] as const,
  },

  cashFlow: {
    /** Matches `['cash-flow-categories', ...]`. */
    categories: ['cash-flow-categories'] as const,
    /** Matches `['cash-vs-credit', ...]`. */
    cashVsCredit: ['cash-vs-credit'] as const,
    /** Matches `['savings-rate-monthly', ...]`. */
    savingsRate: ['savings-rate-monthly'] as const,
  },

  realEstate: {
    /** Matches `['real-estate-properties']`. */
    properties: ['real-estate-properties'] as const,
  },

  userSettings: {
    /** Matches `['user-settings']`. */
    all: ['user-settings'] as const,
  },

  recurring: {
    /** Matches `['recurring', ...]` (currently local-state only; kept for future RQ migration). */
    all: ['recurring'] as const,
  },
} as const;

/**
 * Convenience: every top-level prefix that is affected when an account's data
 * (balance, type, hidden/virtual flags, existence) changes.
 */
export const ACCOUNT_AFFECTED_PREFIXES = [
  queryKeys.accounts.all,
  queryKeys.accounts.allIncl,
  queryKeys.accounts.history,
  queryKeys.accounts.transactions,
  queryKeys.budgets.all,
  queryKeys.budgets.topTransactions,
  queryKeys.netWorth.chart,
  queryKeys.investments.all,
  queryKeys.investments.history,
  queryKeys.investments.income,
  queryKeys.investments.quotes,
  queryKeys.cashFlow.categories,
  queryKeys.cashFlow.cashVsCredit,
  queryKeys.cashFlow.savingsRate,
  queryKeys.realEstate.properties,
] as const;

/**
 * Convenience: every top-level prefix that is affected when a transaction is
 * created, edited, split, categorized, or deleted.
 */
export const TRANSACTION_AFFECTED_PREFIXES = [
  queryKeys.accounts.all,
  queryKeys.accounts.allIncl,
  queryKeys.accounts.history,
  queryKeys.accounts.transactions,
  queryKeys.budgets.all,
  queryKeys.budgets.topTransactions,
  queryKeys.netWorth.chart,
  queryKeys.investments.all,
  queryKeys.investments.history,
  queryKeys.investments.income,
  queryKeys.cashFlow.categories,
  queryKeys.cashFlow.cashVsCredit,
  queryKeys.cashFlow.savingsRate,
] as const;
