import type { TimeRange } from '@/components/charts/chart-filters';

export type ChartType = 'line' | 'bar';
export type GroupingMode = 'account' | 'type' | 'group';

export interface Account {
  id: string;
  name: string;
  type: string;
  balance: number;
  currency: string;
  institution: string | null;
  isHidden: boolean;
  isExcludedFromNetWorth: boolean;
  connectionId?: string | null;
  plaidConnectionId?: string | null;
  tags?: { id: string; name: string; color: string }[];
  metadata?: Record<string, any> | string | null;
  syncStatus?: { status: 'ok' | 'warning' | 'error'; reason?: string; lastSyncAt?: string } | null;
}

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

export const TYPE_HIERARCHY: Record<string, { group: string; subGroup: string; icon: string }> = {
  checking:   { group: 'Banking',       subGroup: 'Cash & Checking',  icon: '🏦' },
  savings:    { group: 'Banking',       subGroup: 'Savings',          icon: '🏦' },
  other:      { group: 'Banking',       subGroup: 'Cash & Checking',  icon: '🏦' },
  credit:     { group: 'Credit',        subGroup: 'Credit Cards',     icon: '💳' },
  investment: { group: 'Investments',   subGroup: 'Taxable Brokerage', icon: '📈' },
  brokerage:  { group: 'Investments',   subGroup: 'Taxable Brokerage', icon: '📈' },
  retirement: { group: 'Investments',   subGroup: 'Retirement',       icon: '📈' },
  otherinvestment: { group: 'Investments', subGroup: 'Other Investments', icon: '📈' },
  rothira:        { group: 'Investments',   subGroup: 'Roth IRA',         icon: '📈' },
  traditionalira: { group: 'Investments',   subGroup: 'Traditional IRA',  icon: '📈' },
  '401k':         { group: 'Investments',   subGroup: '401(k)',           icon: '📈' },
  '403b':         { group: 'Investments',   subGroup: '403(b)',           icon: '📈' },
  sepira:         { group: 'Investments',   subGroup: 'SEP IRA',          icon: '📈' },
  simpleira:      { group: 'Investments',   subGroup: 'Simple IRA',       icon: '📈' },
  '529':          { group: 'Investments',   subGroup: '529 Account',      icon: '📈' },
  otherAsset: { group: 'Investments',   subGroup: 'Other Assets',     icon: '📈' },
  vehicle:    { group: 'Assets',        subGroup: 'Vehicles',         icon: '🚗' },
  crypto:     { group: 'Assets',        subGroup: 'Crypto Currency',  icon: '₿' },
  metals:     { group: 'Assets',        subGroup: 'Metals',           icon: '🏅' },
  hsa:        { group: 'Investments',   subGroup: 'HSA Account',      icon: '🏥' },
  hsachecking: { group: 'Banking',      subGroup: 'HSA Account',      icon: '🏥' },
  health:     { group: 'Investments',   subGroup: 'HSA Account',      icon: '🏥' },
  loan:       { group: 'Loans',         subGroup: 'Loans',            icon: '📋' },
  mortgage:   { group: 'Loans',         subGroup: 'Mortgages',        icon: '📋' },
  studentloan: { group: 'Loans',        subGroup: 'Student Loans',    icon: '📋' },
  autoloan:    { group: 'Loans',        subGroup: 'Auto Loans',       icon: '📋' },
  otherloan:   { group: 'Loans',        subGroup: 'Other Loans',      icon: '📋' },
  realestate: { group: 'Real Estate',   subGroup: 'Real Estate',      icon: '🏠' },
  primaryhome: { group: 'Real Estate',  subGroup: 'Primary Home',     icon: '🏠' },
  secondaryhome: { group: 'Real Estate', subGroup: 'Secondary Home',   icon: '🏠' },
  rentalproperty: { group: 'Real Estate', subGroup: 'Rental Property', icon: '🏠' },
  commercial:   { group: 'Real Estate', subGroup: 'Commercial',        icon: '🏢' },
  land:         { group: 'Real Estate', subGroup: 'Land',              icon: '🌳' },
  otherrealestate: { group: 'Real Estate', subGroup: 'Other Real Estate', icon: '🏠' },
  'single-family': { group: 'Real Estate', subGroup: 'Single Family Home', icon: '🏠' },
  condo:           { group: 'Real Estate', subGroup: 'Condo',              icon: '🏢' },
  townhouse:       { group: 'Real Estate', subGroup: 'Townhouse',          icon: '🏠' },
  'multi-family':  { group: 'Real Estate', subGroup: 'Multi-Family',       icon: '🏢' },
  otherLiability: { group: 'Liabilities', subGroup: 'Liabilities',    icon: '⚠️' },
};

export const GROUP_ORDER = ['Banking', 'Credit', 'Savings', 'Investments', 'Real Estate', 'Loans', 'Liabilities'];

export function getHierarchy(accountType: string) {
  return TYPE_HIERARCHY[accountType.toLowerCase()] ?? { group: 'Other', subGroup: 'Other', icon: '📁' };
}

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
