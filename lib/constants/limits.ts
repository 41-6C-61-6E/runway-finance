/**
 * Pagination limits, batch sizes, and data caps.
 */

export const PAGINATION_LIMITS = {
  defaultPageSize: 50,
  maxPaystubsExport: 1000,
  aiModelOptions: 10,
  aiProviderBatch: 50,
  paystubHistorySample: 5,
  recentNotifications: 12,
  criticalNotifications: 2,
} as const;

export const BATCH_LIMITS = {
  maxExportRows: 50_000,
  maxImportRows: 10_000,
  maxUploadSizeBytes: 10 * 1024 * 1024, // 10MB
  serverCacheMaxEntries: 500,
  fetchCacheMaxEntries: 40,
} as const;

export const CHART_POINT_LADDERS = {
  accountHistory: {
    '1m': 31,
    '3m': 30,
    '6m': 26,
    '1y': 24,
    'ytd': 24,
    '5y': 30,
  },
  mobileCaps: {
    small: 15,
    medium: 22,
  },
} as const;

