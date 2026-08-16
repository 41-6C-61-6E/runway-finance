/**
 * Centralized React Query Key Registry & Factories
 * Ensures consistent cache scoping and reliable cache invalidation across the app.
 */

export const queryKeys = {
  accounts: {
    all: ['accounts'] as const,
    list: (includeHidden?: boolean) => ['accounts', 'list', { includeHidden: !!includeHidden }] as const,
    detail: (id: string) => ['accounts', 'detail', id] as const,
    history: (timeframe?: string) => ['accounts', 'history', timeframe || '1y'] as const,
    snapshots: ['accounts', 'snapshots'] as const,
  },

  budgets: {
    all: ['budgets'] as const,
    list: (period?: string) => ['budgets', 'list', period || 'current'] as const,
    forecast: (months?: number) => ['budgets', 'forecast', months || 12] as const,
    detail: (id: string) => ['budgets', 'detail', id] as const,
    exclusions: ['budgets', 'exclusions'] as const,
  },

  categories: {
    all: ['categories'] as const,
    list: ['categories', 'list'] as const,
    rules: ['categories', 'rules'] as const,
  },

  transactions: {
    all: ['transactions'] as const,
    list: (filterKey?: string) => ['transactions', 'list', filterKey || 'default'] as const,
    detail: (id: string) => ['transactions', 'detail', id] as const,
  },

  goals: {
    all: ['goals'] as const,
    list: ['goals', 'list'] as const,
    detail: (id: string) => ['goals', 'detail', id] as const,
    projections: ['goals', 'projections'] as const,
    allocation: ['goals', 'allocation'] as const,
    history: ['goals', 'history'] as const,
  },

  plans: {
    all: ['plans'] as const,
    list: ['plans', 'list'] as const,
    detail: (id: string) => ['plans', 'detail', id] as const,
    projections: (planId?: string) => ['plans', 'projections', planId || 'default'] as const,
  },

  netWorth: {
    all: ['net-worth'] as const,
    chart: (timeframe?: string) => ['net-worth', 'chart', timeframe || '1y'] as const,
    summary: ['net-worth', 'summary'] as const,
    trend: (year?: number) => ['net-worth', 'trend', year || new Date().getFullYear()] as const,
  },

  cashFlow: {
    all: ['cash-flow'] as const,
    sankey: (timeframe?: string) => ['cash-flow', 'sankey', timeframe || '1y'] as const,
    monthly: (months?: number) => ['cash-flow', 'monthly', months || 12] as const,
    savingsRate: (months?: number) => ['cash-flow', 'savings-rate', months || 12] as const,
    summary: ['cash-flow', 'summary'] as const,
    forecast: ['cash-flow', 'forecast'] as const,
  },

  wealthFlow: {
    all: ['wealth-flow'] as const,
    sankey: (timeframe?: string) => ['wealth-flow', 'sankey', timeframe || '1y'] as const,
  },

  notifications: {
    all: ['notifications'] as const,
    list: ['notifications', 'list'] as const,
    unreadCount: ['notifications', 'unread-count'] as const,
    customAlerts: ['notifications', 'custom-alerts'] as const,
  },

  paystubs: {
    all: ['paystubs'] as const,
    list: ['paystubs', 'list'] as const,
    mappings: ['paystubs', 'mappings'] as const,
  },

  realEstate: {
    all: ['real-estate'] as const,
    list: ['real-estate', 'list'] as const,
  },

  sharing: {
    all: ['sharing'] as const,
    group: ['sharing', 'group'] as const,
    members: ['sharing', 'members'] as const,
    invites: ['sharing', 'invites'] as const,
  },

  userSettings: {
    all: ['user-settings'] as const,
  },
} as const;
