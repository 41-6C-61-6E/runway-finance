/**
 * Centralized React Query Key Registry & Factories
 * Single source of truth for query-key prefixes used across the application.
 */

export const queryKeys = {
  accounts: {
    all: ['accounts'] as const,
    allIncl: ['accounts-all'] as const,
    history: ['accounts-history'] as const,
    transactions: ['account-transactions'] as const,
    transactionsFor: (accountId: string, startDate?: string, endDate?: string) =>
      ['account-transactions', accountId, startDate, endDate] as const,
  },

  budgets: {
    all: ['budgets'] as const,
    byPeriod: (periodType?: string, periodKey?: string) =>
      ['budgets', periodType, periodKey] as const,
    topTransactions: ['budget-top-transactions'] as const,
  },

  categories: {
    all: ['categories'] as const,
    allIncl: ['categories-all'] as const,
  },

  tags: {
    all: ['tags'] as const,
  },

  transactions: {
    all: ['account-transactions'] as const,
  },

  goals: {
    all: ['goals'] as const,
    allocation: ['goals-allocation'] as const,
    history: ['goals-history'] as const,
    projections: ['goals-projections'] as const,
  },

  plans: {
    all: ['plans'] as const,
    rules: ['plans-rules'] as const,
  },

  connections: {
    all: ['connections'] as const,
    detail: (id: string) => ['connections', id] as const,
  },

  paystubs: {
    all: ['paystubs'] as const,
    mappings: ['paystubs-mappings'] as const,
  },

  devMode: {
    all: ['dev-mode'] as const,
  },

  issues: {
    all: ['issues'] as const,
    config: ['bug-reporting-config'] as const,
  },

  netWorth: {
    chart: ['net-worth-chart'] as const,
    chartRange: (range: string) => ['net-worth-chart', range] as const,
  },

  investments: {
    all: ['investments'] as const,
    income: ['investments-income'] as const,
    incomeTimeframe: (timeframe: string) => ['investments-income', timeframe] as const,
    history: ['investments-history'] as const,
    historyRange: (range: string) => ['investments-history', range] as const,
    quotes: ['investments-quotes'] as const,
    equityGrants: ['equity-grants'] as const,
  },

  cashFlow: {
    categories: ['cash-flow-categories'] as const,
    categoriesRange: (start?: string, end?: string) => ['cash-flow-categories', start, end] as const,
    cashVsCredit: ['cash-vs-credit'] as const,
    savingsRate: ['savings-rate-monthly'] as const,
  },

  realEstate: {
    properties: ['real-estate-properties'] as const,
  },

  userSettings: {
    all: ['user-settings'] as const,
  },

  recurring: {
    all: ['recurring'] as const,
  },

  calendar: {
    dailyCashFlow: ['daily-cash-flow'] as const,
    dayTransactions: ['calendar-day-transactions'] as const,
  },
} as const;

export const ACCOUNT_AFFECTED_PREFIXES = [
  queryKeys.accounts.all,
  queryKeys.accounts.allIncl,
  queryKeys.accounts.history,
  queryKeys.accounts.transactions,
  queryKeys.budgets.all,
  queryKeys.budgets.topTransactions,
  queryKeys.calendar.dailyCashFlow,
  queryKeys.calendar.dayTransactions,
  queryKeys.netWorth.chart,
  queryKeys.investments.all,
  queryKeys.investments.history,
  queryKeys.investments.income,
  queryKeys.investments.quotes,
  queryKeys.investments.equityGrants,
  queryKeys.cashFlow.categories,
  queryKeys.cashFlow.cashVsCredit,
  queryKeys.cashFlow.savingsRate,
  queryKeys.realEstate.properties,
] as const;

export const TRANSACTION_AFFECTED_PREFIXES = [
  queryKeys.accounts.all,
  queryKeys.accounts.allIncl,
  queryKeys.accounts.history,
  queryKeys.accounts.transactions,
  queryKeys.budgets.all,
  queryKeys.budgets.topTransactions,
  queryKeys.calendar.dailyCashFlow,
  queryKeys.calendar.dayTransactions,
  queryKeys.netWorth.chart,
  queryKeys.investments.all,
  queryKeys.investments.history,
  queryKeys.investments.income,
  queryKeys.cashFlow.categories,
  queryKeys.cashFlow.cashVsCredit,
  queryKeys.cashFlow.savingsRate,
] as const;
