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

/**
 * Human-readable phrase describing a timeframe's window, used wherever the
 * old UI hard-coded "monthly"/"this month" and stopped matching the selected
 * range. Kept in the hook file so every surface (chart, tiles, modal) shares
 * one source of truth.
 *
 * `all` honestly names the server-side 5-year cap rather than "full history".
 */
export function timeframeLabel(tf: IncomeTimeframeValue): string {
  switch (tf) {
    case '6m':
      return 'the last 6 months';
    case '1y':
      return 'the last 12 months';
    case 'ytd':
      return 'this year to date';
    case '3y':
      return 'the last 3 years';
    case 'all':
      return 'the last 5 years';
  }
}

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
  /**
   * Date of the last snapshot inside this month (the month's balance is only
   * known as of this date). Null when the delta is null. Lets the UI label
   * the in-progress month "MTD as of …" instead of implying a full month.
   */
  lastSnapshotDate: string | null;
}

export interface IncomeSource {
  payee: string;
  total: number;
}

export interface IncomeSummary {
  contributions: number;
  withdrawals: number;
  income: number;
  growth: number;
  losses: number;
  net: number;
  /** Annualized income yield % vs average starting balance, or null. */
  annualizedIncomePct: number | null;
  reinvested: number;
  /** Top income (dividend + interest) payees in the selected range. */
  topIncomeSources: IncomeSource[];
  monthCount: number;
  monthsWithSnapshots: number;
}

export interface ClassifiedTransaction {
  id: string;
  date: string;
  amount: number;
  /** Base-currency amount (the route converts to the user's base currency). */
  amountInBase?: number;
  description: string;
  payee: string | null;
  pending: boolean;
  /** Database account id (for deep links into the full transactions view). */
  accountId: string;
  /** Plaid external id (for "view original in Plaid" style links). */
  /** Already converted to the user's base currency by the API. */
  externalId?: string | null;
  accountName: string;
  institutionName: string;
  type: TransactionType;
}

export interface IncomeResponse {
  months: MonthlyFlowDatum[];
  summary: IncomeSummary;
  /** Inclusive range start (YYYY-MM-DD). */
  start: string;
  /** Exclusive range end (YYYY-MM-DD — first day of the month after the range). */
  end: string;
  transactions: ClassifiedTransaction[];
  hasSnapshots: boolean;
  /** User's base currency; every amount in this response is denominated in it. */
  baseCurrency: string;
  /** True when the `all` timeframe hit the server's 60-month cap. */
  allCapped: boolean;
}

/**
 * Shared TanStack query for the investments income/flow breakdown.
 * Keyed by timeframe so the page, the "Capital Flow" chart, and
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
    // The `all` range re-fetches, re-decrypts and re-classifies ~5 years of
    // transactions and snapshots on every refresh — the most expensive query
    // on the page. Cache it aggressively; shorter ranges stay responsive.
    staleTime: timeframe === 'all' ? 10 * 60_000 : 60_000,
  });
}
