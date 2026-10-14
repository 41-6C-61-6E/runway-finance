'use client';

import { useMemo } from 'react';

import { formatCurrency, formatPlainPercent } from '@/lib/utils/format';
import { cn } from '@/lib/utils';
import {
  type EquityBreakdownMortgage,
  type EquityBreakdownResult,
  computeEquityBreakdown,
} from '@/lib/services/real-estate-equity-breakdown';
import { IconTip } from '@/components/ui/icon-tip';
import { ShieldCheck } from 'lucide-react';

interface PropertyEquityProgressBarProps {
  propertyValue: number;
  purchasePrice?: number;
  initialValue?: number;
  linkedMortgages: EquityBreakdownMortgage[];
  className?: string;
}

export function PropertyEquityProgressBar({
  propertyValue,
  purchasePrice: explicitPurchasePrice,
  initialValue,
  linkedMortgages,
  className,
}: PropertyEquityProgressBarProps) {
  const {
    totalValue,
    downPayment,
    principalPaid,
    appreciation,
    mortgageOwed,
    downPaymentPct,
    principalPaidPct,
    appreciationPct,
    mortgageOwedPct,
    totalEquityPct,
    isWhollyOwned,
    isUnderwater,
  }: EquityBreakdownResult = useMemo(
    () =>
      computeEquityBreakdown(
        propertyValue,
        explicitPurchasePrice,
        initialValue,
        linkedMortgages,
      ),
    [propertyValue, explicitPurchasePrice, initialValue, linkedMortgages],
  );

  const segments = useMemo(() => {
    return [
      {
        id: 'downPayment',
        label: 'Down Payment',
        amount: downPayment,
        pct: downPaymentPct,
        colorClass: 'bg-sky-500 dark:bg-sky-500/90',
        dotColorClass: 'bg-sky-500',
        textColorClass: 'text-sky-600 dark:text-sky-400',
        description: 'Purchase price minus original purchase mortgage, including rolled-in loan costs.',
      },
      {
        id: 'principalPaid',
        label: 'Principal Paid',
        amount: principalPaid,
        pct: principalPaidPct,
        colorClass: 'bg-emerald-500 dark:bg-emerald-500/90',
        dotColorClass: 'bg-emerald-500',
        textColorClass: 'text-emerald-600 dark:text-emerald-400',
        description: 'Estimated principal paid down from loan balances and refinance payoffs across active and closed mortgages.',
      },
      {
        id: 'appreciation',
        label: 'Appreciation',
        amount: appreciation,
        pct: appreciationPct,
        colorClass: 'bg-violet-500 dark:bg-violet-500/90',
        dotColorClass: 'bg-violet-500',
        textColorClass: 'text-violet-600 dark:text-violet-400',
        description: 'Current property value minus recorded purchase price.',
      },
      {
        id: 'mortgageOwed',
        label: 'Mortgage Debt',
        amount: mortgageOwed,
        pct: mortgageOwedPct,
        colorClass: cn(
          'bg-slate-400/50 dark:bg-slate-700/70',
          'bg-[radial-gradient(#94a3b8_1px,transparent_1px)] [background-size:6px_6px] dark:bg-[radial-gradient(#475569_1px,transparent_1px)]'
        ),
        dotColorClass: 'bg-slate-400 dark:bg-slate-500 border border-slate-500/30',
        textColorClass: 'text-slate-600 dark:text-slate-400',
        description: 'Remaining balance on active linked mortgages.',
        isDebt: true,
      },
    ].filter((s) => s.pct > 0.05);
  }, [
    downPayment,
    downPaymentPct,
    principalPaid,
    principalPaidPct,
    appreciation,
    appreciationPct,
    mortgageOwed,
    mortgageOwedPct,
  ]);

  if (totalValue <= 0) return null;

  return (
    <div className={cn('space-y-3', className)}>
      {/* Header Info */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-foreground">Asset Breakdown</span>
          <span className="text-[10px] text-muted-foreground">(estimated attribution)</span>
          <IconTip
            size={13}
            content="Estimates how the property value is attributed across cash down, principal paid down, market appreciation, and outstanding debt."
            aria-label="About asset breakdown attribution"
          />
        </div>
        <div className="flex items-center gap-2">
          {isWhollyOwned ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <ShieldCheck className="w-3 h-3" />
              100% Owned
            </span>
          ) : (
            <div className="flex items-center gap-2 text-[11px] font-mono">
              <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold blur-number">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                {formatPlainPercent(totalEquityPct)} Equity
              </span>
              <span className="text-muted-foreground/30">•</span>
              <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-medium blur-number">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 shrink-0" />
                {formatPlainPercent(mortgageOwedPct)} Debt
              </span>
            </div>
          )}
        </div>
      </div>

      {isUnderwater && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-2.5 py-2 text-[10px] text-amber-700 dark:text-amber-300">
          Property value is below recorded purchase price. Equity buckets are scaled to current equity.
        </div>
      )}

      {/* Multi-segment Progress Bar without Mouseover Animations */}
      <div
        role="progressbar"
        aria-label="Real Estate Equity and Debt Breakdown"
        aria-valuenow={Math.round(totalEquityPct)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="w-full h-3 sm:h-3.5 bg-muted/60 dark:bg-muted/40 rounded-full p-0.5 overflow-hidden flex items-stretch gap-0.5 shadow-inner border border-border/40"
      >
        {segments.map((seg, idx) => {
          const isFirst = idx === 0;
          const isLast = idx === segments.length - 1;

          return (
            <div
              key={seg.id}
              style={{ width: `${seg.pct}%` }}
              className={cn(
                'h-full',
                seg.colorClass,
                isFirst && 'rounded-l-full',
                isLast && 'rounded-r-full'
              )}
              title={`${seg.label}: ${formatCurrency(seg.amount)} (${formatPlainPercent(seg.pct)})`}
            />
          );
        })}
      </div>

      {/* Clean Legend / Ledger Style */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 pt-1 border-t border-border/25">
        {segments.map((seg) => (
          <div key={seg.id} className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs mb-0.5">
              <span className={cn('w-2 h-2 rounded-full shrink-0', seg.dotColorClass)} />
              <span className="font-medium text-muted-foreground truncate" title={seg.label}>
                {seg.label}
              </span>
            </div>
            <div className="flex items-baseline gap-1.5 font-mono pl-3.5">
              <span className="text-xs sm:text-sm font-bold text-foreground blur-number">
                {formatCurrency(seg.amount)}
              </span>
              <span className="text-[11px] text-muted-foreground/80 blur-number">
                ({formatPlainPercent(seg.pct)})
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
