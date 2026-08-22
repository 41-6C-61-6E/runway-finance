'use client';

import { useMemo, useState } from 'react';
import { formatCurrency } from '@/lib/utils/format';
import { cn } from '@/lib/utils';
import { ShieldCheck, TrendingUp, Wallet, Landmark } from 'lucide-react';

interface MortgageInfo {
  id: string;
  name: string;
  balance: number;
  originalLoanAmount: number;
  interestRate?: number;
  monthlyPayment?: number;
  metadata?: Record<string, unknown>;
}

interface PropertyEquityProgressBarProps {
  propertyValue: number;
  purchasePrice?: number;
  initialValue?: number;
  linkedMortgages: MortgageInfo[];
  className?: string;
}

export function PropertyEquityProgressBar({
  propertyValue,
  purchasePrice: explicitPurchasePrice,
  initialValue,
  linkedMortgages,
  className,
}: PropertyEquityProgressBarProps) {
  const [hoveredSegment, setHoveredSegment] = useState<string | null>(null);

  const activeMortgages = useMemo(() => {
    return linkedMortgages.filter(
      (m) => !m.metadata || !['paid_off', 'refinanced'].includes((m.metadata as any)?.mortgageStatus)
    );
  }, [linkedMortgages]);

  const {
    totalValue,
    downPayment,
    principalPaid,
    appreciation,
    mortgageOwed,
    totalEquity,
    downPaymentPct,
    principalPaidPct,
    appreciationPct,
    mortgageOwedPct,
    totalEquityPct,
    effectivePurchasePrice,
    isWhollyOwned,
    isUnderwater,
  } = useMemo(() => {
    const val = Math.max(0, propertyValue);
    if (val === 0) {
      return {
        totalValue: 0,
        downPayment: 0,
        principalPaid: 0,
        appreciation: 0,
        mortgageOwed: 0,
        totalEquity: 0,
        downPaymentPct: 0,
        principalPaidPct: 0,
        appreciationPct: 0,
        mortgageOwedPct: 0,
        totalEquityPct: 0,
        effectivePurchasePrice: 0,
        isWhollyOwned: true,
        isUnderwater: false,
      };
    }

    const currentTotalMortgage = activeMortgages.reduce(
      (sum, m) => sum + Math.abs(m.balance),
      0
    );
    const originalTotalMortgage = activeMortgages.reduce(
      (sum, m) => sum + (m.originalLoanAmount > 0 ? m.originalLoanAmount : Math.abs(m.balance)),
      0
    );

    // Determine purchase price or best estimate
    let purchasePrice = explicitPurchasePrice;
    if (!purchasePrice || purchasePrice <= 0) {
      if (initialValue && initialValue > 0) {
        purchasePrice = initialValue;
      } else if (originalTotalMortgage > 0) {
        // Assume standard 20% down payment (80% LTV)
        purchasePrice = originalTotalMortgage / 0.8;
      } else {
        purchasePrice = val;
      }
    }

    // 1. Mortgage Balance Still Owed
    const mortgageOwed = currentTotalMortgage;

    // 2. Principal Paid Off (Loan Amortization)
    const rawPrincipalPaid = Math.max(0, originalTotalMortgage - currentTotalMortgage);

    // 3. Down Payment (Initial Equity at Purchase)
    const rawDownPayment = Math.max(0, purchasePrice - originalTotalMortgage);

    // 4. Value Appreciation (Market Growth)
    const rawAppreciation = Math.max(0, val - purchasePrice);

    // Handle edge case: Depreciated / Underwater property
    const isUnderwater = currentTotalMortgage > val;
    const computedTotalEquity = Math.max(0, val - currentTotalMortgage);

    let downPayment = rawDownPayment;
    let principalPaid = rawPrincipalPaid;
    let appreciation = rawAppreciation;

    if (val < purchasePrice) {
      // Property lost value: appreciation is 0, scale down payment / principal paid to fit actual equity
      appreciation = 0;
      const initialTotalEquity = rawDownPayment + rawPrincipalPaid;
      if (initialTotalEquity > 0) {
        const ratio = Math.min(1, computedTotalEquity / initialTotalEquity);
        downPayment = rawDownPayment * ratio;
        principalPaid = rawPrincipalPaid * ratio;
      } else {
        downPayment = 0;
        principalPaid = 0;
      }
    } else {
      // If purchasePrice + appreciation mismatch val due to rounding
      const sumComponents = downPayment + principalPaid + appreciation + mortgageOwed;
      if (Math.abs(sumComponents - val) > 1 && sumComponents > 0) {
        const factor = val / sumComponents;
        downPayment *= factor;
        principalPaid *= factor;
        appreciation *= factor;
      }
    }

    const totalEquity = Math.max(0, val - mortgageOwed);

    // Calculate percentages relative to Total Current Value (100%)
    const downPaymentPct = (downPayment / val) * 100;
    const principalPaidPct = (principalPaid / val) * 100;
    const appreciationPct = (appreciation / val) * 100;
    const mortgageOwedPct = (mortgageOwed / val) * 100;
    const totalEquityPct = (totalEquity / val) * 100;

    return {
      totalValue: val,
      downPayment,
      principalPaid,
      appreciation,
      mortgageOwed,
      totalEquity,
      downPaymentPct,
      principalPaidPct,
      appreciationPct,
      mortgageOwedPct,
      totalEquityPct,
      effectivePurchasePrice: purchasePrice,
      isWhollyOwned: activeMortgages.length === 0 || currentTotalMortgage === 0,
      isUnderwater,
    };
  }, [propertyValue, explicitPurchasePrice, initialValue, activeMortgages]);

  const segments = useMemo(() => {
    return [
      {
        id: 'downPayment',
        label: 'Down Payment',
        amount: downPayment,
        pct: downPaymentPct,
        colorClass: 'bg-sky-500 hover:bg-sky-400 dark:bg-sky-500/90 dark:hover:bg-sky-400',
        dotColorClass: 'bg-sky-500',
        textColorClass: 'text-sky-600 dark:text-sky-400',
        icon: Wallet,
        description: 'Initial cash equity invested at purchase',
      },
      {
        id: 'principalPaid',
        label: 'Principal Paid',
        amount: principalPaid,
        pct: principalPaidPct,
        colorClass: 'bg-emerald-500 hover:bg-emerald-400 dark:bg-emerald-500/90 dark:hover:bg-emerald-400',
        dotColorClass: 'bg-emerald-500',
        textColorClass: 'text-emerald-600 dark:text-emerald-400',
        icon: ShieldCheck,
        description: 'Mortgage principal paid down to date',
      },
      {
        id: 'appreciation',
        label: 'Appreciation',
        amount: appreciation,
        pct: appreciationPct,
        colorClass: 'bg-violet-500 hover:bg-violet-400 dark:bg-violet-500/90 dark:hover:bg-violet-400',
        dotColorClass: 'bg-violet-500',
        textColorClass: 'text-violet-600 dark:text-violet-400',
        icon: TrendingUp,
        description: 'Market growth above original purchase price',
      },
      {
        id: 'mortgageOwed',
        label: 'Mortgage Owed',
        amount: mortgageOwed,
        pct: mortgageOwedPct,
        colorClass: cn(
          'bg-slate-400/50 hover:bg-slate-400/70 dark:bg-slate-700/70 dark:hover:bg-slate-600/80',
          'bg-[radial-gradient(#94a3b8_1px,transparent_1px)] [background-size:6px_6px] dark:bg-[radial-gradient(#475569_1px,transparent_1px)]'
        ),
        dotColorClass: 'bg-slate-400 dark:bg-slate-600 border border-slate-500/30',
        textColorClass: 'text-slate-600 dark:text-slate-400',
        icon: Landmark,
        description: 'Remaining loan balance owed to lender(s)',
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
          <span className="text-[10px] text-muted-foreground">(100% = Property Value)</span>
        </div>
        <div className="flex items-center gap-2">
          {isWhollyOwned ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <ShieldCheck className="w-3 h-3" />
              100% Owned
            </span>
          ) : (
            <div className="flex items-center gap-1.5 text-[11px] font-mono font-medium">
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold blur-number">
                {totalEquityPct.toFixed(1)}% Equity
              </span>
              <span className="text-muted-foreground">/</span>
              <span className="text-slate-500 dark:text-slate-400 blur-number">
                {mortgageOwedPct.toFixed(1)}% Debt
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Multi-segment Progress Bar with Interactive Hover Tooltips */}
      <div className="relative group">
        <div
          role="progressbar"
          aria-label="Real Estate Equity and Debt Breakdown"
          aria-valuenow={Math.round(totalEquityPct)}
          aria-valuemin={0}
          aria-valuemax={100}
          className="w-full h-4 bg-muted/60 dark:bg-muted/40 rounded-lg p-0.5 overflow-hidden flex items-stretch gap-0.5 shadow-inner border border-border/40"
        >
          {segments.map((seg, idx) => {
            const isFirst = idx === 0;
            const isLast = idx === segments.length - 1;
            const isHovered = hoveredSegment === seg.id;

            return (
              <div
                key={seg.id}
                onMouseEnter={() => setHoveredSegment(seg.id)}
                onMouseLeave={() => setHoveredSegment(null)}
                style={{ width: `${seg.pct}%` }}
                className={cn(
                  'h-full transition-all duration-300 relative cursor-pointer',
                  seg.colorClass,
                  isFirst && 'rounded-l-md',
                  isLast && 'rounded-r-md',
                  isHovered && 'brightness-110 scale-y-110 z-10 shadow-sm'
                )}
                title={`${seg.label}: ${formatCurrency(seg.amount)} (${seg.pct.toFixed(1)}%)`}
              />
            );
          })}
        </div>

        {/* Hover detail pill (dynamic on hover) */}
        {hoveredSegment && (
          <div className="absolute -top-10 left-1/2 -translate-x-1/2 z-30 pointer-events-none transition-all duration-200">
            {(() => {
              const seg = segments.find((s) => s.id === hoveredSegment);
              if (!seg) return null;
              return (
                <div className="px-2.5 py-1 rounded-md bg-popover text-popover-foreground border border-border shadow-lg text-[11px] whitespace-nowrap flex items-center gap-1.5 animate-in fade-in-0 zoom-in-95">
                  <div className={cn('w-2 h-2 rounded-full', seg.dotColorClass)} />
                  <span className="font-medium text-foreground">{seg.label}:</span>
                  <span className="font-mono font-semibold blur-number">{formatCurrency(seg.amount)}</span>
                  <span className="text-muted-foreground font-mono">({seg.pct.toFixed(1)}%)</span>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Legend Breakdown Grid */}
      <div className="grid grid-cols-2 @sm:grid-cols-4 gap-2 pt-1">
        {segments.map((seg) => {
          const isHovered = hoveredSegment === seg.id;
          return (
            <div
              key={seg.id}
              onMouseEnter={() => setHoveredSegment(seg.id)}
              onMouseLeave={() => setHoveredSegment(null)}
              className={cn(
                'p-2 rounded-lg border transition-all cursor-pointer flex flex-col justify-between',
                isHovered
                  ? 'bg-muted/60 border-primary/40 shadow-xs scale-[1.02]'
                  : 'bg-muted/20 hover:bg-muted/40 border-border/40'
              )}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <div className={cn('w-2 h-2 rounded-full shrink-0', seg.dotColorClass)} />
                <span className="text-[11px] font-medium text-muted-foreground truncate">{seg.label}</span>
              </div>
              <div className="flex items-baseline justify-between gap-1">
                <span className="font-mono text-xs font-semibold text-foreground blur-number">
                  {formatCurrency(seg.amount)}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground/80 blur-number">
                  {seg.pct.toFixed(1)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
