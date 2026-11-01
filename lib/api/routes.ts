/**
 * Type-safe API Route Registry for Runway Finance.
 * Maps all `/api/*` endpoints to structured constants and path builders.
 */

export const API_ROUTES = {
  health: {
    status: '/api/health',
    scheduler: '/api/health/scheduler',
  },
  version: '/api/version',
  userSettings: '/api/user-settings',
  users: {
    me: '/api/users/me',
  },
  auth: {
    session: '/api/auth/session',
  },
  register: '/api/register',
  devMode: '/api/dev-mode',
  changelog: '/api/changelog',

  accounts: {
    list: '/api/accounts',
    detail: (id: string) => `/api/accounts/${id}`,
    history: '/api/accounts/history',
    remap: '/api/accounts/remap',
    convertToManual: (id: string) => `/api/accounts/${id}/convert-to-manual`,
  },

  manualAccounts: {
    list: '/api/manual-accounts',
    detail: (id: string) => `/api/manual-accounts/${id}`,
    adjust: (id: string) => `/api/manual-accounts/${id}/adjust`,
    sync: (id: string) => `/api/manual-accounts/${id}/sync`,
    validateAddress: '/api/manual-accounts/validate-address',
  },

  categories: {
    list: '/api/categories',
    detail: (id: string) => `/api/categories/${id}`,
    reset: '/api/categories/reset',
  },

  categoryRules: {
    list: '/api/category-rules',
    detail: (id: string) => `/api/category-rules/${id}`,
    apply: (id: string) => `/api/category-rules/${id}/apply`,
    applyAll: '/api/category-rules/apply-all',
    bulk: '/api/category-rules/bulk',
    reorder: '/api/category-rules/reorder',
    reset: '/api/category-rules/reset',
    toggleSystem: '/api/category-rules/toggle-system',
  },

  transactions: {
    list: '/api/transactions',
    detail: (id: string) => `/api/transactions/${id}`,
    split: (id: string) => `/api/transactions/${id}/split`,
    revertSplit: (id: string) => `/api/transactions/${id}/revert-split`,
  },

  tags: {
    list: '/api/tags',
    detail: (id: string) => `/api/tags/${id}`,
  },

  budgets: {
    list: '/api/budgets',
    detail: (id: string) => `/api/budgets/${id}`,
    forecast: '/api/budgets/forecast',
    autoBudgetProposal: '/api/budgets/auto-budget/proposal',
    autoBudgetApply: '/api/budgets/auto-budget/apply',
  },

  cashFlow: {
    summary: '/api/cash-flow/summary',
    monthly: '/api/cash-flow/monthly',
    daily: '/api/cash-flow/daily',
    categories: '/api/cash-flow/categories',
    savingsRate: '/api/cash-flow/savings-rate',
    cashVsCredit: '/api/cash-flow/cash-vs-credit',
    budgets: '/api/cash-flow/budgets',
  },

  netWorth: {
    chart: '/api/net-worth/chart',
  },

  wealthFlow: '/api/wealth-flow',

  goals: {
    list: '/api/goals',
    financialGoals: '/api/financial-goals',
    allocation: '/api/goals/allocation',
    bulkReorder: '/api/goals/bulk-reorder',
    history: '/api/goals/history',
    progress: '/api/goals/progress',
    projections: '/api/goals/projections',
  },

  investments: {
    list: '/api/investments',
    history: '/api/investments/history',
    holdingHistory: '/api/investments/holding-history',
    income: '/api/investments/income',
    quotes: '/api/investments/quotes',
    benchmark: '/api/investments/quotes/benchmark',
    securityHistory: '/api/investments/quotes/security-history',
    companyLogo: '/api/investments/company-logo',
    equityGrants: '/api/investments/equity-grants',
    equityGrantDetail: (id: string) => `/api/investments/equity-grants/${id}`,
  },

  realEstate: '/api/real-estate',

  recurring: {
    list: '/api/recurring',
    detail: (id: string) => `/api/recurring/${id}`,
    detect: '/api/recurring/detect',
    merge: '/api/recurring/merge',
    preview: '/api/recurring/preview',
    upcoming: '/api/recurring/upcoming',
  },

  paystubs: {
    list: '/api/paystubs',
    detail: (id: string) => `/api/paystubs/${id}`,
    autoGenerate: '/api/paystubs/auto-generate',
    depositReport: '/api/paystubs/deposit-report',
    import: '/api/paystubs/import',
    mappings: '/api/paystubs/mappings',
    mappingDetail: (id: string) => `/api/paystubs/mappings/${id}`,
  },

  retirement: {
    plans: '/api/retirement/plans',
    rules: '/api/retirement/rules',
  },

  connections: {
    list: '/api/connections',
    detail: (id: string) => `/api/connections/${id}`,
    accounts: (id: string) => `/api/connections/${id}/accounts`,
    resetCursor: (id: string) => `/api/connections/${id}/reset-cursor`,
    sync: (id: string) => `/api/connections/${id}/sync`,
    syncLogs: (id: string) => `/api/connections/${id}/sync-logs`,
    syncAll: '/api/connections/sync',
    simplefinLogs: (id: string) => `/api/connections/simplefin/${id}/logs`,
  },

  plaid: {
    createLinkToken: '/api/plaid/create-link-token',
    exchangePublicToken: '/api/plaid/exchange-public-token',
    sync: '/api/plaid/sync',
    validate: '/api/plaid/validate',
  },

  ai: {
    status: '/api/ai/status',
    models: '/api/ai/models',
    analyze: '/api/ai/analyze',
    analyzeTransaction: '/api/ai/analyze-transaction',
    cancel: '/api/ai/cancel',
    testConnection: '/api/ai/test-connection',
    provider: '/api/ai/provider',
    providerTest: '/api/ai/provider/test',
    providers: '/api/ai/providers',
    providerDetail: (id: string) => `/api/ai/providers/${id}`,
    providerDetailTest: (id: string) => `/api/ai/providers/${id}/test`,
    providerTestActive: '/api/ai/providers/test-active',
    advice: '/api/ai/advice',
    adviceContextPreview: '/api/ai/advice/context-preview',
    adviceStatus: '/api/ai/advice/status',
    proposals: '/api/ai/proposals',
    proposalApprove: (id: string) => `/api/ai/proposals/${id}/approve`,
    proposalReject: (id: string) => `/api/ai/proposals/${id}/reject`,
    proposalsBatch: '/api/ai/proposals/batch',
    proposalsClear: '/api/ai/proposals/clear',
  },

  backup: {
    export: '/api/backup/export',
    exportCsv: '/api/backup/export-csv',
    import: '/api/backup/import',
  },

  export: {
    custom: '/api/export/custom',
    firePlans: '/api/export/fire-plans',
    snapshots: '/api/export/snapshots',
    transactions: '/api/export/transactions',
  },

  import: {
    upload: '/api/import/upload',
    preview: '/api/import/preview',
    execute: '/api/import/execute',
    logs: '/api/import/logs',
    logDetail: (id: string) => `/api/import/logs/${id}`,
  },

  notifications: {
    list: '/api/notifications',
    detail: (id: string) => `/api/notifications/${id}`,
    read: (id: string) => `/api/notifications/${id}/read`,
    subscribe: '/api/notifications/subscribe',
    test: '/api/notifications/test',
    customAlerts: '/api/notifications/custom-alerts',
    customAlertDetail: (id: string) => `/api/notifications/custom-alerts/${id}`,
    customAlertLastFired: (id: string) => `/api/notifications/custom-alerts/${id}/last-fired`,
    customAlertPreview: (id: string) => `/api/notifications/custom-alerts/${id}/preview`,
  },

  bugReporting: {
    list: '/api/bug-reporting',
    detail: (id: string) => `/api/bug-reporting/${id}`,
    config: '/api/bug-reporting/config',
  },

  dataExplorer: {
    list: '/api/data-explorer',
    tables: '/api/data-explorer/tables',
    duplicates: '/api/data-explorer/duplicates',
  },

  analytics: {
    recalculateSnapshots: '/api/analytics/recalculate-snapshots',
  },

  logs: {
    client: '/api/logs/client',
  },
} as const;

