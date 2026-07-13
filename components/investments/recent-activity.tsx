'use client';

import { useState } from 'react';
import { formatCurrency } from '@/lib/utils/format';
import { formatSafeUTCDate } from '@/lib/utils/date';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { ArrowLeftRight, Landmark, Clock, ArrowRight, TrendingUp, TrendingDown, CircleDollarSign, Banknote, Minus, RefreshCw, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import type { TransactionType } from '@/app/api/investments/income/route';

interface ClassifiedTransaction {
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

interface RecentActivityProps {
  transactions: ClassifiedTransaction[];
}

const TYPE_CONFIG: Record<TransactionType, { label: string; icon: React.ComponentType<{className?: string}>; color: string; bg: string }> = {
  dividend:     { label: 'Dividend',     icon: CircleDollarSign, color: 'text-chart-1',      bg: 'bg-chart-1/10 border-chart-1/20' },
  interest:     { label: 'Interest',     icon: CircleDollarSign, color: 'text-chart-1',      bg: 'bg-chart-1/10 border-chart-1/20' },
  reinvestment: { label: 'Reinvest',     icon: RefreshCw,        color: 'text-chart-2',      bg: 'bg-chart-2/10 border-chart-2/20' },
  buy:          { label: 'Buy',          icon: TrendingUp,       color: 'text-primary',      bg: 'bg-primary/10 border-primary/20' },
  sell:         { label: 'Sell',         icon: TrendingDown,     color: 'text-destructive',  bg: 'bg-destructive/10 border-destructive/20' },
  fee:          { label: 'Fee',          icon: Minus,            color: 'text-amber-500',    bg: 'bg-amber-500/10 border-amber-500/20' },
  deposit:      { label: 'Deposit',      icon: ArrowDownLeft,    color: 'text-chart-2',      bg: 'bg-chart-2/10 border-chart-2/20' },
  withdrawal:   { label: 'Withdrawal',   icon: ArrowUpRight,     color: 'text-muted-foreground', bg: 'bg-muted/20 border-border' },
  transfer:     { label: 'Transfer',     icon: ArrowLeftRight,   color: 'text-muted-foreground', bg: 'bg-muted/20 border-border' },
  other:        { label: 'Activity',     icon: ArrowLeftRight,   color: 'text-muted-foreground', bg: 'bg-muted/20 border-border' },
};

const FILTER_OPTIONS: { label: string; value: TransactionType | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Dividends', value: 'dividend' },
  { label: 'Buys', value: 'buy' },
  { label: 'Sells', value: 'sell' },
  { label: 'Fees', value: 'fee' },
];

export function RecentActivity({ transactions }: RecentActivityProps) {
  const [isCollapsed, setIsCollapsed] = useCardCollapsed('recentActivity');
  const [filter, setFilter] = useState<TransactionType | 'all'>('all');
  const [showAll, setShowAll] = useState(false);

  const filtered = filter === 'all' ? transactions : transactions.filter((tx) => tx.type === filter);
  const displayed = showAll ? filtered : filtered.slice(0, 12);

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm h-full flex flex-col">
      <CollapsibleCardHeader
        isCollapsed={isCollapsed}
        onToggle={setIsCollapsed}
        title={
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="w-4 h-4 text-primary shrink-0" />
            <span>Recent Activity</span>
          </div>
        }
      />
      {!isCollapsed && (
        <div className="flex-1 flex flex-col p-4 sm:p-5 gap-3">
          {/* Type filter */}
          {transactions.length > 0 && (
            <div className="flex border-b border-border w-full gap-6 overflow-x-auto scrollbar-none pb-0.5 mb-1">
              {FILTER_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setFilter(opt.value)}
                  className={`pb-2 px-1 text-xs font-semibold whitespace-nowrap transition-all border-b-2 -mb-px cursor-pointer ${
                    filter === opt.value
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {transactions.length > 0 ? (
            <div className="flex-1 flex flex-col">
              <div className="divide-y divide-border/20">
                {displayed.length > 0 ? displayed.map((tx) => {
                  const typeConfig = TYPE_CONFIG[tx.type];
                  const TypeIcon = typeConfig.icon;
                  const isOutflow = tx.amount < 0;
                  const displayAmount = Math.abs(tx.amount);

                  return (
                    <div key={tx.id} className="flex items-center justify-between py-2.5 first:pt-0 gap-3">
                      {/* Type icon pill */}
                      <div className={`flex-shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase tracking-wide ${typeConfig.color} ${typeConfig.bg}`}>
                        <TypeIcon className="w-2.5 h-2.5" />
                        <span>{typeConfig.label}</span>
                      </div>

                      {/* Description */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-semibold text-foreground truncate block" title={tx.payee || tx.description}>
                            {tx.payee || tx.description}
                          </span>
                          {tx.pending && (
                            <span className="flex items-center gap-0.5 px-1 py-0.5 text-[8px] font-bold rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 leading-none shrink-0">
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
                        <span className={`font-mono text-xs font-semibold tabular-nums blur-number ${
                          tx.type === 'dividend' || tx.type === 'interest' || tx.type === 'reinvestment'
                            ? 'text-chart-1'
                            : tx.type === 'fee' ? 'text-amber-500'
                            : isOutflow ? 'text-foreground' : 'text-foreground'
                        }`}>
                          {isOutflow ? '-' : '+'}{formatCurrency(displayAmount)}
                        </span>
                      </div>
                    </div>
                  );
                }) : (
                  <div className="py-6 text-center text-xs text-muted-foreground/60 italic">
                    No {filter !== 'all' ? filter : ''} transactions found.
                  </div>
                )}
              </div>

              {/* Show more / View all */}
              <div className="mt-3 pt-2 border-t border-border/20 flex gap-2 shrink-0">
                {filtered.length > 12 && !showAll && (
                  <button
                    onClick={() => setShowAll(true)}
                    className="flex-1 text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors py-1.5 bg-muted/20 border border-border/40 rounded-lg"
                  >
                    Show all {filtered.length} transactions
                  </button>
                )}
                <a
                  href="/transactions"
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
