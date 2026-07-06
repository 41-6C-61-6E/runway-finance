export interface AccountData {
  id: string;
  type: string;
  balance: string | number;
  name: string;
  isHidden?: boolean | null;
  isExcludedFromNetWorth?: boolean | null;
  currency?: string;
  institution?: string | null;
  balanceDate?: string | null;
}

export interface ChartPoint {
  date: string;
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  isSynthetic?: boolean;
  [key: string]: string | number | boolean | undefined;
}

export interface CalculationStep {
  label: string;
  inputs: Record<string, number | string>;
  operation: string;
  output: number;
}

export type TraceFormat = 'currency' | 'percentage' | 'ratio' | 'number' | 'years';

export interface CalculationTrace {
  id: string;
  title: string;
  category: 'netWorth' | 'cashFlow' | 'realEstate' | 'fire' | 'budgets' | 'goals';
  formula: string;
  dataSource: string;
  filters: string[];
  typesIncluded: string[];
  typesExcluded: string[];
  steps: CalculationStep[];
  result: number;
  format: TraceFormat;
  children?: CalculationTrace[];
}

export interface WealthFlowAccountDetail {
  id: string;
  name: string;
  type: string;
  beginningBalance: number;
  endingBalance: number;
  delta: number;
  signedNWDelta: number;
}

export interface WealthFlowNode {
  id: string;
  label: string;
  color: string;
  value: number;
  percentage: number;
  type: 'increase' | 'decrease' | 'hub';
  accountGroup?: string;
  accounts?: WealthFlowAccountDetail[];
  netWorthChange?: number;
  visualImbalance?: number;
  description?: string;
}

export interface WealthFlowLink {
  source: string;
  target: string;
  value: number;
}

export interface WealthFlowSummary {
  beginningNetWorth: number;
  endingNetWorth: number;
  netWorthChange: number;
  percentChange: number;
  baseCurrency: string;
  totalIncreases: number;
  totalDecreases: number;
}

export interface WealthFlowData {
  nodes: WealthFlowNode[];
  links: WealthFlowLink[];
  summary: WealthFlowSummary;
}
