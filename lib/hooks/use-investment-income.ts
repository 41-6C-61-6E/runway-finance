import { useQuery } from '@tanstack/react-query';
import type { TransactionType } from '@/lib/utils/investment-flows';

export type IncomeTimeframeValue = '6m' | '1y' | 'ytd' | '3y' | 'all';

export const INCOME_TIMEFRAMES: { label: string; value: IncomeTimeframeValue }[] = [
  { label: '6M', value: '6m' },
  { label: '1Y', value: '1y' },
  { label: 'YTD', value: 'ytd' },
  { label: '3Y', value: '3y' },
  { label: 'All', value: 'all' },
];

/* ── Response shapes for GET /api/investments/income?timeframe=… ────────── */

export interface MonthlyFlowDatum {
  month: string; // "YYYY-MM"
  income: number;
  contributions: number;
  withdrawals: number;
  growth: number;
  losses: number;
  /** Sum of all signed components for the month (matches chart bar height). */
  net: number;
  /** Balance delta (end − start) or null when snapshots are insufficient. */
  delta: number | null;
}

export interface IncomeSummary {
  contributions: number;
  withdrawals: number;
  income: number;
  growth: number;
  losses: number;
  net: number;
  /** Sum of income across the trailing 12 months (legacy field). */
  rawTotalAnnual: number;
  /** Sum of income across the selected range. */
  totalIncomePeriod: number;
  /** Annualized income yield % vs average starting balance, or null. */
  annualizedIncomePct: number | null;
  reinvested: number;
  monthCount: number;
  monthsWithSnapshots: number;
}

export interface ClassifiedTransaction {
  id: string;
  date: string;
  amount: number;
  description: string;
  payee: string | null;
  pending: boolean;
  accountName: string;
  institutionName: string;
  type: TransactionType;
}

export interface IncomeResponse {
  months: MonthlyFlowDatum[];
  summary: IncomeSummary;
  byType: Partial<Record<TransactionType, number>>;
  reinvested: number;
  transactions: ClassifiedTransaction[];
  hasSnapshots: boolean;
}

/**
 * Shared TanStack query for the investments income/flow breakdown.
 * Keyed by timeframe so the page, the "How My Capital Is Working" chart, and
 * the Recent Activity panel dedupe to a single request per range.
 */
export function useInvestmentIncomeData(timeframe: IncomeTimeframeValue) {
  return useQuery<IncomeResponse>({
    queryKey: ['investments-income', timeframe],
    queryFn: async () => {
      const res = await fetch(`/api/investments/income?timeframe=${timeframe}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch investment income');
      return res.json();
    },
    staleTime: 60_000,
  });
}
