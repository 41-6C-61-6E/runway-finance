/**
 * Type-safe registry of localStorage keys used throughout Runway Finance.
 * Standardizes prefixes (finance:*) and enables systematic cache purge on logout.
 */

export const STORAGE_KEYS = {
  // Appearance & Global Settings
  accent: 'finance-accent',
  textSize: 'finance-text-size',
  onboardingDismissed: 'onboarding-checklist-dismissed',
  mobileHomeNav: 'mobile-home-nav-items',

  // PWA & Version Telemetry
  pwaInstalledBuild: 'pf_installed_build',
  pwaInstalledHash: 'pf_installed_hash',
  pwaUpdateToastEnabled: 'pf_update_toast_enabled',

  // Budgets
  budgets: {
    envelopeInfoDismissed: 'finance:budgets:envelope-info-dismissed',
    periodType: 'finance:budgets:periodType',
    periodKey: 'finance:budgets:periodKey',
    showDirectOnly: 'finance:budgets:showDirectOnly',
    sortField: 'finance:budgets:sortField',
    sortDirection: 'finance:budgets:sortDirection',
    expandedCatchAll: 'finance:budgets:expandedCatchAll',
  },

  // Cash Flow & Spending
  cashFlow: {
    incomeExpenseTimeframe: 'finance:income-expense:timeframe',
    incomeExpenseWindowEnd: 'finance:income-expense:windowEnd',
    incomeExpenseChartType: 'finance:income-expense:chartType',
    cashVsCreditTimeframe: 'finance:cash-vs-credit:timeframe',
    cashVsCreditWindowEnd: 'finance:cash-vs-credit:windowEnd',
    cashVsCreditIncludeSavings: 'finance:cash-vs-credit:include-savings',
    cashVsCreditShowNetPosition: 'finance:cash-vs-credit:show-net-position',
    spendingTimeframe: 'finance:spending-breakdown:timeframe',
    spendingWindowEnd: 'finance:spending-breakdown:windowEnd',
    spendingView: 'finance:spending-breakdown:view',
    spendingGroups: 'finance:spending-breakdown:groups',
    spendingSortBy: 'finance:spending-breakdown:sortBy',
    spendingSortDirection: 'finance:spending-breakdown:sortDirection',
    upcomingBillsViewMode: 'finance:upcoming-bills:viewMode',
    upcomingBillsFlowFilter: 'finance:upcoming-bills:flowFilter',
    upcomingBillsDaysHorizon: 'finance:upcoming-bills:daysHorizon',
  },

  // Sankey & Flows
  flows: {
    activeTab: 'finance:flows:activeTab',
    sankeyTimeframe: 'finance:sankey:timeframe',
    sankeyWindowEnd: 'finance:sankey:windowEnd',
    sankeyHideParents: 'finance:sankey:hideParents',
    wealthFlowRouteThroughAccounts: 'finance:wealth-flow:routeThroughAccounts',
  },

  // Investments
  investments: {
    activeTab: 'finance:investments:activeTab',
    activityFilter: 'finance:investments:activityFilter',
  },

  // Net Worth
  netWorth: {
    activeTab: 'finance:net-worth:activeTab',
    timeframe: 'finance:net-worth-chart:timeframe',
    windowEnd: 'finance:net-worth-chart:windowEnd',
    showPercent: 'finance:net-worth-chart:show-percent',
  },

  // Plans & Projections
  plans: {
    activeTab: 'finance:plans:activeTab',
    selectedPlanId: 'finance:plans:selectedPlanId',
    dollarMode: 'finance:plans:dollarMode',
    viewMode: 'finance:plans:viewMode',
    projectionShowYearlyTable: 'finance:plans:projection:showYearlyTable',
    projectionChartType: 'finance:plans:projection:chartType',
    projectionShowMilestones: 'finance:plans:projection:showMilestones',
    projectionAssetCategories: 'finance:plans:projection:assetCategories',
  },

  // Real Estate
  realEstate: {
    activeTab: 'finance:real-estate:activeTab',
    timeframe: 'finance:real-estate:timeframe',
    windowEnd: 'finance:real-estate:windowEnd',
    selectedPropertyId: 'finance:real-estate:selectedPropertyId',
  },

  // Transactions
  transactions: {
    activeView: 'finance:transactions:activeView',
    dismissedSuggestionIds: 'finance:transactions:dismissedSuggestionIds',
    customPresets: 'finance:transactions:customPresets',
    compactView: 'finance:transactions:compactView',
  },
} as const;

/**
 * Filter predicate to find all user data keys that must be cleared on logout.
 */
export function isUserStorageKey(key: string): boolean {
  return key.startsWith('finance:');
}

