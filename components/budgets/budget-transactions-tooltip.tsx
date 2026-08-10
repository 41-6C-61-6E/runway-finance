'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Receipt, ArrowRight, Loader2 } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

export function getPeriodDateRange(periodType: string, periodKey: string) {
  if (periodType === 'monthly') {
    const [y, m] = periodKey.split('-').map(Number);
    const start = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const dateObj = new Date(y, m - 1, 1);
    const label = dateObj.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    return { startDate: start, endDate: end, label };
  }
  if (periodType === 'quarterly') {
    const [y, q] = periodKey.split('-Q').map(Number);
    const startMonth = (q - 1) * 3 + 1;
    const endMonth = q * 3;
    const start = `${y}-${String(startMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(y, endMonth, 0).getDate();
    const end = `${y}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const label = `Q${q} ${y}`;
    return { startDate: start, endDate: end, label };
  }
  // yearly
  const y = Number(periodKey) || new Date().getFullYear();
  const start = `${y}-01-01`;
  const end = `${y}-12-31`;
  return { startDate: start, endDate: end, label: `${y}` };
}

interface BudgetItemTransactionsIconProps {
  categoryId?: string;
  categoryIds?: string[];
  categoryName: string;
  periodType: string;
  periodKey: string;
  className?: string;
}

interface TransactionItem {
  id: string;
  date: string;
  description: string;
  payee?: string | null;
  amount: number | string;
  accountName?: string | null;
}

export function BudgetItemTransactionsIcon({
  categoryId,
  categoryIds,
  categoryName,
  periodType,
  periodKey,
  className,
}: BudgetItemTransactionsIconProps) {
  const [open, setOpen] = useState(false);

  const { startDate, endDate, label: periodLabel } = useMemo(
    () => getPeriodDateRange(periodType, periodKey),
    [periodType, periodKey]
  );

  const hasCategoryFilter = Boolean(categoryId || (categoryIds && categoryIds.length > 0));

  const targetUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (categoryIds && categoryIds.length > 0) {
      params.set('categoryIds', categoryIds.join(','));
    } else if (categoryId) {
      params.set('categoryId', categoryId);
    }
    params.set('startDate', startDate);
    params.set('endDate', endDate);
    return `/transactions?${params.toString()}`;
  }, [categoryId, categoryIds, startDate, endDate]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['budget-top-transactions', categoryId, categoryIds?.join(','), startDate, endDate],
    queryFn: async () => {
      if (!hasCategoryFilter) return { data: [], total: 0 };
      const params = new URLSearchParams();
      if (categoryIds && categoryIds.length > 0) {
        params.set('categoryIds', categoryIds.join(','));
      } else if (categoryId) {
        params.set('categoryId', categoryId);
      }
      params.set('startDate', startDate);
      params.set('endDate', endDate);
      params.set('limit', '5');
      params.set('sort', 'date');
      params.set('order', 'desc');

      const res = await fetch(`/api/transactions?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch transactions');
      return await res.json();
    },
    enabled: open && hasCategoryFilter,
    staleTime: 30000,
  });

  const txList: TransactionItem[] = data?.data ?? [];
  const totalCount: number = data?.total ?? txList.length;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <Link
            href={targetUrl}
            onClick={(e) => {
              // On mobile touch screens, first tap opens tooltip preview
              if (typeof window !== 'undefined' && window.innerWidth < 768 && !open) {
                e.preventDefault();
                setOpen(true);
              }
            }}
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
            aria-label={`View transactions for ${categoryName}`}
            className={cn(
              "inline-flex items-center justify-center min-w-[28px] min-h-[28px] sm:min-w-[24px] sm:min-h-[24px] p-1 rounded-md text-muted-foreground/60 hover:text-primary hover:bg-accent/80 transition-all cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary shrink-0 opacity-90 sm:opacity-0 group-hover/row:opacity-100 group-hover/cat:opacity-100 focus:opacity-100",
              open && "text-primary bg-accent opacity-100",
              className
            )}
          >
            <Receipt className="w-3.5 h-3.5" />
          </Link>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          align="start"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          className="w-72 sm:w-80 p-0 overflow-hidden bg-popover/95 backdrop-blur border border-border shadow-xl rounded-xl z-[100]"
        >
          {/* Header */}
          <div className="px-3.5 py-2.5 bg-muted/40 border-b border-border flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-foreground truncate">{categoryName}</div>
              <div className="text-[10px] text-muted-foreground font-medium">
                Top Transactions · {periodLabel}
              </div>
            </div>
            <Link
              href={targetUrl}
              onClick={() => setOpen(false)}
              className="text-[11px] font-medium text-primary hover:underline flex items-center gap-1 shrink-0"
            >
              <span>View All</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {/* List Content */}
          <div className="p-2 space-y-1 max-h-60 overflow-y-auto">
            {isLoading ? (
              <div className="p-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                <span>Loading top transactions...</span>
              </div>
            ) : isError ? (
              <div className="p-3 text-center text-xs text-muted-foreground">
                Unable to load transactions.
              </div>
            ) : txList.length === 0 ? (
              <div className="p-3 text-center text-xs text-muted-foreground italic">
                No transactions in this period
              </div>
            ) : (
              txList.map((tx) => {
                const numAmt = typeof tx.amount === 'string' ? parseFloat(tx.amount) : tx.amount;
                const isIncomeTx = !isNaN(numAmt) && numAmt > 0;
                const displayTitle = tx.payee || tx.description || 'Transaction';

                return (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between text-xs px-2 py-1.5 rounded-lg hover:bg-accent/50 transition-colors gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-foreground truncate">{displayTitle}</div>
                      <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                        <span>{formatDate(tx.date)}</span>
                        {tx.accountName && (
                          <>
                            <span>•</span>
                            <span className="truncate">{tx.accountName}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div
                      className={cn(
                        "font-mono text-xs font-semibold shrink-0",
                        isIncomeTx ? "text-constructive" : "text-foreground"
                      )}
                    >
                      {formatCurrency(Math.abs(numAmt))}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Action Button */}
          {txList.length > 0 && (
            <div className="p-2 bg-muted/20 border-t border-border/50">
              <Link
                href={targetUrl}
                onClick={() => setOpen(false)}
                className="w-full py-1.5 px-3 text-xs font-semibold text-primary hover:bg-primary/10 rounded-lg flex items-center justify-center gap-1.5 transition-colors"
              >
                <span>View All ({totalCount}) Transactions</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
