'use client';
import { useState, useEffect, useRef } from 'react';
import { formatCurrency } from '@/lib/utils/format';
import { formatSafeUTCDate, shiftDaysUTC } from '@/lib/utils/date';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { MobileTabStrip } from '@/components/ui/mobile-tab-strip';
import {
  ArrowLeftRight,
  Landmark,
  Clock,
  ArrowRight,
  ArrowDownRight,
  ArrowUpRight,
  CircleDollarSign,
  Minus,
  RefreshCw,
  ArrowDownLeft,
  Undo2,
  X,
} from 'lucide-react';

import type { ClassifiedTransaction } from '@/lib/hooks/use-investment-income';
import { CASHFLOW_SERIES } from '@/components/investments/income-dividends-panel';
import type { TransactionType } from '@/lib/utils/investment-flows';

interface RecentActivityProps {
  transactions: ClassifiedTransaction[];
  /** Inclusive range start (YYYY-MM-DD) — shown as a subtitle and used for deep links. */
  startDate?: string;
  /** Exclusive range end (YYYY-MM-DD, first day of the month after the range). */
  endDate?: string;
  /** Controlled active filter (see FILTER_OPTIONS values). Omit to manage internally. */
  value?: string;
  onValueChange?: (value: string) => void;
}

/* ── Type → visual identity (colors mirror the chart series where they map) ── */

const SERIES_COLOR_FOR: Partial<Record<TransactionType, string>> = {
  dividend: 'var(--color-chart-1)', // income
  interest: 'var(--color-chart-1)',
  deposit: 'var(--color-chart-4)', // contributions
  withdrawal: 'var(--color-chart-5)', // withdrawals
  fee: 'var(--color-chart-5)', // withdrawals & fees
};

interface TypeConfig {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
  /** Amount tint (null = neutral). */
  amountClass: string | null;
}

const TYPE_CONFIG: Record<TransactionType, TypeConfig> = {
  dividend: { label: 'Dividend', icon: CircleDollarSign, color: 'text-chart-1', bg: 'bg-chart-1/10 border-chart-1/20', amountClass: 'text-chart-1' },
  interest: { label: 'Interest', icon: CircleDollarSign, color: 'text-chart-1', bg: 'bg-chart-1/10 border-chart-1/20', amountClass: 'text-chart-1' },
  reinvestment: { label: 'Reinvest', icon: RefreshCw, color: 'text-chart-2', bg: 'bg-chart-2/10 border-chart-2/20', amountClass: null },
  // Buys/sells are internal reallocations (no net cash in/out), so they stay
  // visually neutral — they are not chart series.
  buy: { label: 'Buy', icon: ArrowDownRight, color: 'text-muted-foreground', bg: 'bg-muted/20 border-border', amountClass: null },
  sell: { label: 'Sell', icon: ArrowUpRight, color: 'text-muted-foreground', bg: 'bg-muted/20 border-border', amountClass: null },
  fee: { label: 'Fee', icon: Minus, color: 'text-chart-5', bg: 'bg-chart-5/10 border-chart-5/20', amountClass: 'text-chart-5' },
  deposit: { label: 'Deposit', icon: ArrowDownLeft, color: 'text-chart-4', bg: 'bg-chart-4/10 border-chart-4/20', amountClass: 'text-chart-4' },
  withdrawal: { label: 'Withdrawal', icon: ArrowUpRight, color: 'text-chart-5', bg: 'bg-chart-5/10 border-chart-5/20', amountClass: null },
  transfer: { label: 'Transfer', icon: ArrowLeftRight, color: 'text-muted-foreground', bg: 'bg-muted/20 border-border', amountClass: null },
  // Correction rows — corrections of earlier fee/withdrawal lines. Shown so
  // users can audit them, but excluded from the capital-flow buckets (fee
  // reversals net against the fee; contribution/withdrawal reversals are
  // bucketed by sign).
  fee_reversal: { label: 'Fee Reversal', icon: Undo2, color: 'text-chart-5', bg: 'bg-chart-5/10 border-chart-5/20', amountClass: 'text-chart-5' },
  withdrawal_reversal: { label: 'Reversal', icon: Undo2, color: 'text-chart-4', bg: 'bg-chart-4/10 border-chart-4/20', amountClass: null },
  other: { label: 'Activity', icon: ArrowLeftRight, color: 'text-muted-foreground', bg: 'bg-muted/20 border-border', amountClass: null },
};

/** Filter pills map to *groups* of transaction types (not single types). */
const FILTER_OPTIONS: { label: string; value: string }[] = [
  { label: 'All', value: 'all' },
  { label: 'Income', value: 'income' },
  { label: 'Contributions', value: 'contributions' },
  { label: 'Withdrawals', value: 'withdrawals' },
  { label: 'Fees', value: 'fees' },
  { label: 'Trades', value: 'trades' },
  { label: 'Reinvests', value: 'reinvests' },
  { label: 'Transfers', value: 'transfers' },
];

const FILTER_TYPES: Record<string, TransactionType[]> = {
  income: ['dividend', 'interest'],
  contributions: ['deposit'],
  withdrawals: ['withdrawal', 'withdrawal_reversal'],
  fees: ['fee', 'fee_reversal'],
  trades: ['buy', 'sell'],
  reinvests: ['reinvestment'],
  transfers: ['transfer'],
};

/** Human-friendly amount phrasing, based on raw transaction sign. */
function amountLabel(tx: ClassifiedTransaction): string {
  if (tx.type === 'buy' && tx.amount < 0) return `Bought ${formatCurrency(Math.abs(tx.amount))}`;
  if (tx.type === 'sell' && tx.amount > 0) return `Sold ${formatCurrency(Math.abs(tx.amount))}`;
  if (tx.type === 'reinvestment' && tx.amount < 0) return `Reinvested ${formatCurrency(Math.abs(tx.amount))}`;
  if (tx.type === 'dividend' || tx.type === 'interest') return `Received ${formatCurrency(Math.abs(tx.amount))}`;
  if (tx.type === 'deposit' && tx.amount > 0) return `Deposited ${formatCurrency(Math.abs(tx.amount))}`;
  if (tx.type === 'withdrawal' && tx.amount < 0) return `Withdrew ${formatCurrency(Math.abs(tx.amount))}`;
  if (tx.type === 'fee' && tx.amount < 0) return `Fee ${formatCurrency(Math.abs(tx.amount))}`;
  if (tx.type === 'fee_reversal') return `Fee reversal ${tx.amount < 0 ? '' : '+'}${formatCurrency(Math.abs(tx.amount))}`;
  if (tx.type === 'withdrawal_reversal') return `Reversal ${tx.amount < 0 ? '−' : '+'}${formatCurrency(Math.abs(tx.amount))}`;
  if (tx.type === 'transfer') return `${tx.amount < 0 ? 'Out' : 'In'} ${formatCurrency(Math.abs(tx.amount))}`;
  return `${tx.amount < 0 ? '−' : '+'}${formatCurrency(Math.abs(tx.amount))}`;
}

/**
 * Deep link to the full transactions view for a date range.
 *
 * `start` is inclusive; `endExclusive` is exclusive (1st of the month after
 * the range) — matching the API's `start`/`end` fields — and is converted to
 * the transactions view's inclusive convention here.
 */
export function buildTransactionsDeepLink(start?: string, endExclusive?: string, extra?: { search?: string; accountId?: string }): string {
  const params = new URLSearchParams();
  if (start) params.set('startDate', start);
  const inclusiveEnd = endExclusive ? shiftDaysUTC(endExclusive, -1) : undefined;
  if (inclusiveEnd) params.set('endDate', inclusiveEnd);
  if (extra?.search) params.set('search', extra.search);
  if (extra?.accountId) params.set('accountId', extra.accountId);
  return `/transactions?${params.toString()}`;
}

export function RecentActivity({ transactions, startDate, endDate, value, onValueChange }: RecentActivityProps) {
  const [isCollapsed, setIsCollapsed] = useCardCollapsed('recentActivity');
  const cardRef = useRef<HTMLDivElement>(null);
  const [internalFilter, setInternalFilter] = useState<string>('all');
  // Controlled (shared with the Capital Flow chart) or internal filter.
  const filter = value ?? internalFilter;
  const setFilter = onValueChange ?? setInternalFilter;
  const [showAll, setShowAll] = useState(false);
  // CF-19: when a Capital Flow summary tile drives a filter from off-screen
  // (mobile stacks the card below the chart), bring it into view. Pill
  // clicks inside the card are no-ops for `scrollIntoView` (already visible).
  useEffect(() => {
    if (filter !== 'all' && window.innerWidth < 1024) {
      cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [filter]);

  const filtered =
    filter === 'all' ? transactions : transactions.filter((tx) => (FILTER_TYPES[filter] ?? []).includes(tx.type));
  const displayed = showAll ? filtered : filtered.slice(0, 12);

  const filterLabel = FILTER_OPTIONS.find((f) => f.value === filter)?.label ?? 'All';
  // The API's range end is exclusive; the transactions view's endDate is inclusive
  // (buildTransactionsDeepLink handles the conversion).
  const inclusiveEnd = endDate ? shiftDaysUTC(endDate, -1) : undefined;
  const buildDeepLink = (extra?: { search?: string; accountId?: string }): string =>
    buildTransactionsDeepLink(startDate, endDate, extra);

  const rangeLabel =
    startDate && inclusiveEnd
      ? `${formatSafeUTCDate(startDate, { month: 'short', year: 'numeric' })} – ${formatSafeUTCDate(inclusiveEnd, { month: 'short', day: 'numeric', year: 'numeric' })}`
      : null;

  return (
    <div ref={cardRef} className="bg-card border border-border rounded-xl shadow-sm h-full flex flex-col">
      <CollapsibleCardHeader
        isCollapsed={isCollapsed}
        onToggle={setIsCollapsed}
        title={
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="w-4 h-4 text-primary shrink-0" />
            <span>Activity</span>
            {rangeLabel && (
              // CF-18: show the shared range on mobile too, so it's obvious the
              // list and the Capital Flow chart cover the same window.
              <span key="range" className="text-[10px] font-medium text-muted-foreground/80 truncate max-w-[90px] sm:max-w-[160px]" title={rangeLabel}>
                {rangeLabel}
              </span>
            )}
            {/* CF-19: persistent, visible indicator that a tile-driven (or pill)
                filter is active, with a one-click clear — previously the only
                signal was the pill bar color change on a different card. */}
            {filter !== 'all' && (
              <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-primary bg-primary/10 border border-primary/20 rounded-full px-2 py-0.5">
                {filterLabel}
                <button
                  type="button"
                  onClick={() => setFilter('all')}
                  aria-label="Clear activity filter"
                  className="hover:text-foreground transition-colors"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            )}
          </div>
        }
      />
      {!isCollapsed && (
        <div className="flex-1 flex flex-col p-4 sm:p-5 gap-3">
          {/* Type filter */}
          {transactions.length > 0 && (
            <MobileTabStrip
              tabs={FILTER_OPTIONS.map((opt) => ({ id: opt.value, label: opt.label }))}
              activeTab={filter}
              onChange={(val) => {
                setFilter(val as string);
                setShowAll(false);
              }}
              className="mb-1"
              aria-label="Activity filter"
            />
          )}

          {transactions.length > 0 ? (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="divide-y divide-border/20 overflow-y-auto max-h-[420px] pr-1 -mr-1">
                {displayed.length > 0 ? (
                  displayed.map((tx) => {
                    const typeConfig = TYPE_CONFIG[tx.type];
                    const TypeIcon = typeConfig.icon;
                    const series = CASHFLOW_SERIES.find((s) => SERIES_COLOR_FOR[tx.type] === s.color);
                    return (
                      <a
                        key={tx.id}
                        href={buildDeepLink({ search: tx.payee || tx.description })}
                        title={`${filterLabel} entry — click to view in Transactions`}
                        className="flex items-center justify-between py-2.5 first:pt-0 gap-3 block group transition-colors hover:bg-muted/20 -mx-2 px-2 rounded-md"
                      >
                        {/* Type icon pill */}
                        <div
                          className={`flex-shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded border text-micro font-bold uppercase tracking-wide ${typeConfig.color} ${typeConfig.bg}`}
                          title={`${typeConfig.label}${series ? ` · shown as “${series.label}” in the chart` : ' · internal activity, not shown in the chart'}`}
                        >
                          <TypeIcon className="w-2.5 h-2.5" />
                          <span>{typeConfig.label}</span>
                        </div>

                        {/* Description */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="text-xs font-semibold text-foreground truncate block group-hover:text-primary transition-colors" title={tx.payee || tx.description}>
                              {tx.payee || tx.description || amountLabel(tx)}
                            </span>
                            {tx.pending && (
                              <span className="flex items-center gap-0.5 px-1 py-0.5 text-micro font-bold rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 leading-none shrink-0">
                                <Clock className="w-2.5 h-2.5" /> Pending
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                            <span className="shrink-0">{formatSafeUTCDate(tx.date, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                            <span className="opacity-40">•</span>
                            <span className="flex items-center gap-1 truncate shrink min-w-0">
                              <Landmark className="w-2.5 h-2.5 shrink-0" />
                              <span className="truncate">{tx.accountName}</span>
                            </span>
                          </div>
                        </div>

                        {/* Amount */}
                        <div className="shrink-0 text-right">
                          <span
                            className={`font-mono text-xs font-semibold tabular-nums blur-number ${typeConfig.amountClass ?? 'text-foreground'}`}
                            title={amountLabel(tx)}
                          >
                            {tx.amount < 0 ? '−' : '+'}
                            {formatCurrency(Math.abs(tx.amount))}
                          </span>
                        </div>
                      </a>
                    );
                  })
                ) : (
                  <div className="py-6 text-center text-xs text-muted-foreground/60 italic">No {filterLabel.toLowerCase()} entries found.</div>
                )}
              </div>

              {/* Show more / View all */}
              <div className="mt-3 pt-2 border-t border-border/20 flex gap-2 shrink-0">
                {!showAll && filtered.length > 12 && (
                  <button
                    onClick={() => setShowAll(true)}
                    className="flex-1 text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors py-1.5 bg-muted/20 border border-border/40 rounded-lg"
                  >
                    Show all {filtered.length} entries
                  </button>
                )}
                {showAll && filtered.length > 12 && (
                  <button
                    onClick={() => setShowAll(false)}
                    className="flex-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors py-1.5 bg-muted/20 border border-border/40 rounded-lg"
                  >
                    Show less
                  </button>
                )}
                <a
                  href={buildDeepLink()}
                  data-testid="view-all-transactions"
                  className="flex items-center justify-center gap-1 text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors flex-1 py-1.5 bg-muted/20 border border-border/40 rounded-lg"
                >
                  <span>View in Transactions</span>
                  <ArrowRight className="w-3 h-3" />
                </a>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center p-6 text-center text-xs text-muted-foreground/60 italic">
              No recent investment transactions found.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
