import type { TimeRange } from '@/components/charts/chart-filters';
import type { Account } from '@/lib/types/account';
export type { Account };

export type ChartType = 'line' | 'bar';
export type GroupingMode = 'account' | 'type' | 'group';

export type TagItem = {
  id: string;
  name: string;
  color: string;
};

export interface ChartPreset {
  id: string;
  name: string;
  timeframe: TimeRange;
  chartType: ChartType;
  groupMode: GroupingMode;
  selectedGroups: string[];
  selectedTypes: string[];
  selectedAccounts: string[];
  selectedTags?: string[];
  isCustom?: boolean;
}

export const DEFAULT_PRESETS: ChartPreset[] = [
  {
    id: 'net-worth',
    name: 'Net Worth Summary',
    timeframe: 'all',
    chartType: 'line',
    groupMode: 'group',
    selectedGroups: [],
    selectedTypes: [],
    selectedAccounts: [],
  },
  {
    id: 'cash-checking',
    name: 'Cash & Checking',
    timeframe: '3m',
    chartType: 'line',
    groupMode: 'account',
    selectedGroups: ['Banking'],
    selectedTypes: ['Cash & Checking'],
    selectedAccounts: [],
  },
  {
    id: 'brokerage-savings',
    name: 'Brokerage & Savings',
    timeframe: '1y',
    chartType: 'line',
    groupMode: 'type',
    selectedGroups: ['Banking', 'Investments'],
    selectedTypes: ['Savings', 'Taxable Brokerage', 'Retirement'],
    selectedAccounts: [],
  },
  {
    id: 'debt-overview',
    name: 'Debt Overview',
    timeframe: '6m',
    chartType: 'bar',
    groupMode: 'account',
    selectedGroups: ['Credit', 'Loans', 'Liabilities'],
    selectedTypes: [],
    selectedAccounts: [],
  },
];

/**
 * @deprecated CC-06: Consolidated into `@/lib/constants/account-types`.
 * Import directly from `@/lib/constants/account-types` instead.
 */
export { TYPE_HIERARCHY, GROUP_ORDER, getHierarchy } from '@/lib/constants/account-types';

export const getSeriesColor = (key: string, mode: GroupingMode, index: number, isAsset: boolean) => {
  const cycle = Math.floor(index / 5);
  const chartNum = (index % 5) + 1;
  const baseVar = `var(--chart-${chartNum})`;
  
  if (isAsset) {
    if (cycle === 0) {
      return baseVar;
    } else if (cycle % 2 === 1) {
      const mixPct = Math.min(75, 20 + Math.floor(cycle / 2) * 20);
      return `color-mix(in oklch, ${baseVar}, white ${mixPct}%)`;
    } else {
      const mixPct = Math.min(75, 20 + (Math.floor(cycle / 2) - 1) * 20);
      return `color-mix(in oklch, ${baseVar}, black ${mixPct}%)`;
    }
  } else {
    const baseMixed = `color-mix(in oklch, ${baseVar}, var(--destructive) 60%)`;
    if (cycle === 0) {
      return baseMixed;
    } else if (cycle % 2 === 1) {
      const mixPct = Math.min(75, 20 + Math.floor(cycle / 2) * 20);
      return `color-mix(in oklch, ${baseMixed}, white ${mixPct}%)`;
    } else {
      const mixPct = Math.min(75, 20 + (Math.floor(cycle / 2) - 1) * 20);
      return `color-mix(in oklch, ${baseMixed}, black ${mixPct}%)`;
    }
  }
};
