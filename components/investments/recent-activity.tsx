'use client';

import { formatCurrency } from '@/lib/utils/format';
import { formatSafeUTCDate } from '@/lib/utils/date';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { ArrowLeftRight, Landmark, Clock, ArrowRight } from 'lucide-react';

interface Transaction {
  id: string;
  date: string;
  amount: number;
  description: string;
  payee: string | null;
  pending: boolean;
  accountName: string;
  institutionName: string;
}

interface RecentActivityProps {
  transactions: Transaction[];
}

export function RecentActivity({ transactions }: RecentActivityProps) {
  const [isCollapsed, setIsCollapsed] = useCardCollapsed('recentActivity');

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
        <div className="flex-1 flex flex-col p-4 sm:p-5">
          {transactions.length > 0 ? (
            <div className="flex-1 space-y-4">
              {/* Transactions List */}
              <div className="divide-y divide-border/20">
                {transactions.map((tx) => {
                  // In Runway, negative values are outflows (e.g., buying assets), positive are inflows (e.g., selling, dividends)
                  const isOutflow = tx.amount < 0;
                  const displayAmount = Math.abs(tx.amount);

                  return (
                    <div key={tx.id} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0 gap-3">
                      <div className="min-w-0">
                        {/* Title / Description */}
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-foreground truncate block max-w-[180px] sm:max-w-[280px]" title={tx.payee || tx.description}>
                            {tx.payee || tx.description}
                          </span>
                          {tx.pending && (
                            <span className="flex items-center gap-0.5 px-1 py-0.25 text-[8px] font-bold rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 leading-none">
                              <Clock className="w-2.5 h-2.5" /> Pending
                            </span>
                          )}
                        </div>

                        {/* Subtext (Date & Account) */}
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                          <span className="shrink-0">{formatSafeUTCDate(tx.date, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                          <span className="opacity-40 shrink-0">•</span>
                          <span className="flex items-center gap-1 truncate shrink-0 max-w-[100px] sm:max-w-[180px]">
                            <Landmark className="w-2.5 h-2.5 shrink-0" />
                            <span className="truncate">{tx.accountName}</span>
                          </span>
                        </div>
                      </div>

                      {/* Amount */}
                      <div className="shrink-0 text-right">
                        <span className={`font-mono text-xs font-semibold tabular-nums blur-number ${
                          isOutflow ? 'text-foreground' : 'text-chart-1'
                        }`}>
                          {isOutflow ? '-' : '+'}{formatCurrency(displayAmount)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* View All Shortcut Link */}
              <div className="pt-2 border-t border-border/20 shrink-0">
                <a
                  href="/transactions"
                  className="flex items-center justify-center gap-1 text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors w-full py-1.5 bg-muted/20 border border-border/40 rounded-lg"
                >
                  <span>View All in Transactions</span>
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
