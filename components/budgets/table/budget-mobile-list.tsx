'use client';

import React from 'react';
import Link from 'next/link';
import {
  ArrowUpCircle,
  TrendingDown,
  Pencil,
  Trash2,
  Layers,
  ChevronDown,
  ChevronUp,
  Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ENVELOPE_STATUS_META } from '@/lib/utils/budget-envelope';
import { IconButton } from '@/components/ui/icon-button';
import { BudgetItemTransactionsIcon } from '../budget-transactions-tooltip';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Spinner } from '@/components/ui/loading-spinner';
import type { BudgetData } from './types';

interface BudgetMobileListProps {
  incomeBudgets: BudgetData[];
  expenseBudgets: BudgetData[];
  flashCategoryId: string | null;
  getTxUrl: (coveredCatIds?: string[], catId?: string) => string;
  periodType: string;
  periodKey: string;
  periodSuffix: string;
  formatCurrency: (val: number) => string;
  isEnvelope: (b: BudgetData) => boolean;
  renderEnvelopeBadge: (b: BudgetData) => React.ReactNode;
  setEditBudget: (b: BudgetData) => void;
  setShowForm: (show: boolean) => void;
  setDeleteBudget: (b: BudgetData) => void;
  expandedCatchAll: boolean;
  setExpandedCatchAll: React.Dispatch<React.SetStateAction<boolean>>;
  handleConvertToBudget: (item: { categoryId: string; categoryName: string; actual: number }) => void;
  convertingCatId: string | null;
}

export function BudgetMobileList({
  incomeBudgets,
  expenseBudgets,
  flashCategoryId,
  getTxUrl,
  periodType,
  periodKey,
  periodSuffix,
  formatCurrency,
  isEnvelope,
  renderEnvelopeBadge,
  setEditBudget,
  setShowForm,
  setDeleteBudget,
  expandedCatchAll,
  setExpandedCatchAll,
  handleConvertToBudget,
  convertingCatId,
}: BudgetMobileListProps) {
  const renderMobileProgress = (b: BudgetData, isIncome = false) => {
    const envelope = isEnvelope(b);
    const spent = envelope ? (b.envelopeSpent ?? b.actual) : b.actual;
    const total = envelope ? (b.nativeAmount ?? b.budgeted) : (b.availableBudget ?? b.budgeted);
    const pct = envelope
      ? (b.envelopePercentUsed ?? (total > 0 ? (spent / total) * 100 : 0))
      : (b.percentUsed ?? 0);

    let fillClass: string;
    let textClass: string;

    if (envelope) {
      const meta = b.envelopeStatus ? ENVELOPE_STATUS_META[b.envelopeStatus] : null;
      fillClass = meta?.barClass ?? (spent > total ? 'bg-destructive' : 'bg-primary');
      textClass = meta?.textClass ?? (spent > total ? 'text-destructive' : 'text-muted-foreground');
    } else if (isIncome) {
      const isTargetMet = b.remaining >= 0;
      fillClass = isTargetMet ? 'budget-progress-fill' : 'bg-amber-500';
      textClass = isTargetMet ? 'text-primary' : 'text-muted-foreground';
    } else {
      const isOver = b.remaining < 0 || spent > total;
      fillClass = isOver ? 'bg-destructive' : pct > 85 ? 'bg-amber-500' : 'budget-progress-fill';
      textClass = isOver ? 'text-destructive' : pct > 85 ? 'text-amber-500' : 'text-muted-foreground';
    }

    return (
      <div className="space-y-1.5 pt-0.5">
        <div className="flex items-center justify-between gap-3 text-xs font-mono">
          <span className="text-muted-foreground blur-number">
            {formatCurrency(spent)} <span className="text-muted-foreground/60">of</span> {formatCurrency(total)}
          </span>
          <span className={cn('shrink-0 font-medium', textClass)}>
            {Math.round(pct)}%
          </span>
        </div>
        <div
          className="h-2 w-full overflow-hidden rounded-full budget-progress-track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(Math.max(Math.round(pct), 0), 100)}
          aria-label={`${formatCurrency(spent)} of ${formatCurrency(total)} used`}
        >
          <div
            className={`h-full rounded-full transition-all duration-400 ${fillClass}`}
            style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="divide-y divide-border">
      {incomeBudgets.length > 0 && (
        <div className="px-4 py-2 bg-accent/40 text-xs font-semibold text-foreground uppercase tracking-wider border-y border-border/50 flex items-center gap-1.5">
          <ArrowUpCircle className="w-3.5 h-3.5 text-primary" />
          <span>Income</span>
        </div>
      )}
      {incomeBudgets.map((b) => {
        return (
          <div
            key={b.id}
            data-budget-category-id={b.categoryId}
            className={`px-4 py-3 space-y-2 group/row ${flashCategoryId === b.categoryId ? 'ring-2 ring-primary/70 rounded-lg' : ''}`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <div
                  className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full flex-shrink-0 ring-1 ring-white/30 shadow-sm"
                  style={{ backgroundColor: b.categoryColor }}
                />
                <Link
                  href={getTxUrl(b.coveredCategoryIds, b.categoryId)}
                  title={b.categoryName}
                  className="text-foreground font-medium text-sm budget-fade hover:text-primary hover:underline transition-colors min-w-[12ch]"
                >
                  {b.categoryName}
                </Link>
                <BudgetItemTransactionsIcon
                  categoryId={b.coveredCategoryIds && b.coveredCategoryIds.length > 0 ? undefined : b.categoryId}
                  categoryIds={b.coveredCategoryIds && b.coveredCategoryIds.length > 0 ? b.coveredCategoryIds : [b.categoryId]}
                  categoryName={b.categoryName}
                  periodType={periodType}
                  periodKey={periodKey}
                />
                {b.nativePeriodType && b.nativePeriodType !== periodType && b.nativeAmount !== undefined && (
                  <span
                    title={`Rolled up from ${b.nativePeriodType} budget (${formatCurrency(b.nativeAmount)}/${b.nativePeriodType === 'monthly' ? 'mo' : b.nativePeriodType === 'quarterly' ? 'quarter' : 'yr'})`}
                    className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold bg-muted/60 text-muted-foreground border border-border/60 rounded shrink-0"
                  >
                    {formatCurrency(b.nativeAmount)}/{b.nativePeriodType === 'monthly' ? 'mo' : b.nativePeriodType === 'quarterly' ? 'quarter' : 'yr'}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <IconButton
                  size="sm"
                  label="Edit budget"
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center -m-0.5 p-0.5 text-muted-foreground"
                  onClick={() => {
                    setEditBudget(b);
                    setShowForm(true);
                  }}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </IconButton>
                <IconButton
                  size="sm"
                  label="Delete budget"
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center -m-0.5 p-0.5 text-muted-foreground hover:text-destructive/80"
                  onClick={() => setDeleteBudget(b)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </IconButton>
              </div>
            </div>
            {renderMobileProgress(b, true)}
          </div>
        );
      })}

      {expenseBudgets.length > 0 && (
        <div className="px-4 py-2 bg-accent/40 text-xs font-semibold text-foreground uppercase tracking-wider border-y border-border/50 flex items-center gap-1.5">
          <TrendingDown className="w-3.5 h-3.5 text-primary" />
          <span>Expenses</span>
        </div>
      )}
      {expenseBudgets.map((b) => {
        const isEE = b.isEverythingElse || b.isCatchAll || b.categoryName.toLowerCase() === 'everything else';
        return (
          <div
            key={b.id}
            data-budget-category-id={b.categoryId}
            className={`px-4 py-3 space-y-2 group/row ${flashCategoryId === b.categoryId ? 'ring-2 ring-primary/70 rounded-lg' : ''}`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <div
                  className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full flex-shrink-0 ring-1 ring-white/30 shadow-sm"
                  style={{ backgroundColor: b.categoryColor || '#64748b' }}
                />
                <Link
                  href={getTxUrl(
                    isEE && b.groupedBreakout && b.groupedBreakout.length > 0
                      ? b.groupedBreakout.map((i) => i.categoryId)
                      : b.coveredCategoryIds,
                    b.categoryId
                  )}
                  title={b.categoryName}
                  className="text-foreground font-semibold text-sm budget-fade hover:text-primary hover:underline transition-colors min-w-[12ch]"
                >
                  {b.categoryName}
                </Link>
                <BudgetItemTransactionsIcon
                  categoryId={isEE || (b.coveredCategoryIds && b.coveredCategoryIds.length > 0) ? undefined : b.categoryId}
                  categoryIds={isEE ? b.groupedBreakout?.map((i) => i.categoryId) : (b.coveredCategoryIds && b.coveredCategoryIds.length > 0 ? b.coveredCategoryIds : [b.categoryId])}
                  categoryName={b.categoryName}
                  periodType={periodType}
                  periodKey={periodKey}
                />
                {isEnvelope(b) && renderEnvelopeBadge(b)}
                {!isEE && !isEnvelope(b) && b.nativePeriodType && b.nativePeriodType !== periodType && b.nativeAmount !== undefined && (
                  <span
                    title={`Rolled up from ${b.nativePeriodType} budget (${formatCurrency(b.nativeAmount)}/${b.nativePeriodType === 'monthly' ? 'mo' : b.nativePeriodType === 'quarterly' ? 'quarter' : 'yr'})`}
                    className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold bg-muted/60 text-muted-foreground border border-border/60 rounded shrink-0"
                  >
                    {formatCurrency(b.nativeAmount)}/{b.nativePeriodType === 'monthly' ? 'mo' : b.nativePeriodType === 'quarterly' ? 'quarter' : 'yr'}
                  </span>
                )}
                {!isEE && b.rollover && b.rolloverCarryover !== undefined && b.rolloverCarryover > 0 && (
                  <span
                    title={`Base: ${formatCurrency(b.budgeted)} + Rollover: ${formatCurrency(b.rolloverCarryover)} = Total Available: ${formatCurrency(b.availableBudget || b.budgeted)}`}
                    className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold bg-constructive/10 text-constructive border border-constructive/20 rounded shrink-0"
                  >
                    +{formatCurrency(b.rolloverCarryover)} rollover
                  </span>
                )}
                {isEE && (
                  <button
                    type="button"
                    onClick={() => setExpandedCatchAll(!expandedCatchAll)}
                    className="px-2 py-0.5 text-[10px] font-semibold bg-accent border border-border rounded text-primary flex items-center gap-1 shrink-0"
                  >
                    <Layers className="w-3 h-3" />
                    <span>{b.groupedBreakout ? b.groupedBreakout.length : 0} items</span>
                    {expandedCatchAll ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <IconButton
                  size="sm"
                  label="Edit budget"
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center -m-0.5 p-0.5 text-muted-foreground"
                  onClick={() => {
                    setEditBudget(b);
                    setShowForm(true);
                  }}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </IconButton>
                <IconButton
                  size="sm"
                  label="Delete budget"
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center -m-0.5 p-0.5 text-muted-foreground hover:text-destructive/80"
                  onClick={() => setDeleteBudget(b)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </IconButton>
              </div>
            </div>

            {renderMobileProgress(b)}

            {/* Everything Else Mobile Breakout sub-card */}
            {isEE && expandedCatchAll && b.groupedBreakout && (
              <div className="mt-2.5 p-3 bg-muted/30 rounded-xl border border-border/60 space-y-2.5">
                <div className="flex items-center justify-between px-0.5">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-primary" />
                    Unbudgeted Categories
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                      {b.groupedBreakout.length}
                    </span>
                  </span>
                  <span className="text-xs font-mono font-medium text-muted-foreground">
                    Total: <span className="text-foreground blur-number">{formatCurrency(b.actual)}</span>
                  </span>
                </div>
                {b.groupedBreakout.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-1 text-center bg-background/50 rounded-lg border border-border/40">
                    No unbudgeted spending in this period.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {b.groupedBreakout.map((item) => (
                      <div
                        key={item.categoryId}
                        className="group/cat flex items-center justify-between px-3 py-2.5 rounded-xl bg-card border border-border/60 gap-3 min-w-0 shadow-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div
                            className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs"
                            style={{ backgroundColor: item.categoryColor || '#6366f1' }}
                          />
                          <Link
                            href={getTxUrl(undefined, item.categoryId)}
                            className="font-medium text-foreground text-sm truncate hover:text-primary hover:underline transition-colors min-w-0 block"
                            title={item.categoryName}
                          >
                            {item.categoryName}
                          </Link>
                          <BudgetItemTransactionsIcon
                            categoryId={item.categoryId}
                            categoryName={item.categoryName}
                            periodType={periodType}
                            periodKey={periodKey}
                          />
                        </div>
                        <div className="flex items-center gap-2.5 shrink-0">
                          <span className="font-mono text-sm font-semibold text-foreground blur-number">
                            {formatCurrency(item.actual)}
                          </span>
                          <TooltipProvider delayDuration={150}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={() => handleConvertToBudget(item)}
                                  disabled={convertingCatId === item.categoryId}
                                  aria-label={`Convert ${item.categoryName} to standalone budget`}
                                  className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10 hover:bg-primary text-primary hover:text-primary-foreground transition-all duration-150 active:scale-95 disabled:opacity-50 disabled:pointer-events-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary shrink-0"
                                >
                                  {convertingCatId === item.categoryId ? (
                                    <Spinner size="sm" />
                                  ) : (
                                    <Plus className="w-4 h-4" />
                                  )}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">
                                Convert &ldquo;{item.categoryName}&rdquo; to standalone budget ({formatCurrency(Math.max(1, Math.round(item.actual)))}{periodSuffix})
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
