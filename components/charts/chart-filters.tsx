'use client';

export type TimeRange = '7d' | '30d' | '90d' | '1m' | '3m' | '6m' | '1y' | '3y' | '365d' | '5y' | 'ytd' | 'all' | '7d_discrete' | '1d' | '1d_discrete';

export const TIME_RANGE_PRESETS: { label: string; value: TimeRange; group?: string }[] = [
  { label: '7D', value: '7d', group: 'Rolling' },
  { label: '1W', value: '7d_discrete', group: 'Discrete' },
  { label: '30D', value: '30d', group: 'Rolling' },
  { label: '1M', value: '1m', group: 'Discrete' },
  { label: '90D', value: '90d', group: 'Rolling' },
  { label: '3M', value: '3m', group: 'Discrete' },
  { label: '6M', value: '6m', group: 'Discrete' },
  { label: '1Y', value: '1y', group: 'Discrete' },
  { label: '365D', value: '365d', group: 'Rolling' },
  { label: '3Y', value: '3y', group: 'Discrete' },
  { label: '5Y', value: '5y', group: 'Discrete' },
  { label: 'YTD', value: 'ytd', group: 'Other' },
  { label: 'All', value: 'all', group: 'Other' },
];

// Ordered for bar display: 7D 1W 30D 1M 90D 3M 6M 1Y 365D 3Y 5Y YTD ALL
export const TIME_RANGE_BAR_ORDER: TimeRange[] = [
  '7d', '7d_discrete', '30d', '1m', '90d', '3m', '6m', '1y', '365d', '3y', '5y', 'ytd', 'all',
];



