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
