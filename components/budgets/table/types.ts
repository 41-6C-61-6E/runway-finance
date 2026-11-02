export type SortField = 'category' | 'budgeted' | 'actual' | 'variance' | 'progress' | 'account';
export type SortDirection = 'asc' | 'desc';

export interface BudgetData {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  periodType: string;
  nativePeriodType?: 'monthly' | 'quarterly' | 'yearly';
  nativeAmount?: number;
  /** The native period the budget is defined over (e.g. "2026", "2026-Q3"). */
  nativePeriodKey?: string | null;
  /** True when this budget is defined in a longer timeframe than the viewed period (envelope budget). `budgeted` is only an average. */
  prorated?: boolean;
  /** Cumulative spend against the full native-period envelope up to end of viewed period. */
  envelopeSpent?: number | null;
  envelopeRemaining?: number | null;
  envelopePercentUsed?: number | null;
  envelopeStatus?: 'within' | 'nearlyUsed' | 'exceeded' | null;
  envelopeStart?: string | null;
  envelopeEnd?: string | null;
  periodKey?: string | null;
  yearMonth?: string | null;
  isRecurring: boolean;
  fundingAccountId: string | null;
  rollover: boolean;
  rolloverCarryover?: number;
  availableBudget?: number;
  notes: string | null;
  monthlyAmount?: number;
  budgeted: number;
  actual: number;
  remaining: number;
  percentUsed: number;
  type: 'income' | 'expense';
  isDiscretionary?: boolean;
  isEverythingElse?: boolean;
  isCatchAll?: boolean;
  groupedBreakout?: Array<{ categoryId: string; categoryName: string; categoryColor?: string; actual: number }>;
  coveredCategoryIds?: string[];
}

export interface Account {
  id: string;
  name: string;
  tags?: { id: string; name: string; color: string }[];
}
