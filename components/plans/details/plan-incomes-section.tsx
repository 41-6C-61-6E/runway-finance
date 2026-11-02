'use client';

import React from 'react';
import { ArrowUpCircle, Plus, Zap, Pencil, Trash2, HelpCircle } from 'lucide-react';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { formatCurrency } from '@/lib/utils/format';
import { safeString, PlanIncomeItem } from './types';

export interface PlanIncomesSectionProps {
  incomes: PlanIncomeItem[];
  plan: { hasSpouse?: boolean; spouseName?: string };
  isIncomesCollapsed: boolean;
  setIsIncomesCollapsed: (collapsed: boolean) => void;
  showIncomeNotice: boolean;
  setShowIncomeNotice: (show: boolean) => void;
  openAddIncomeModal: () => void;
  openEditIncomeModal: (inc: PlanIncomeItem) => void;
  handleDeleteEvent: (id: string) => void;
}

export function PlanIncomesSection({
  incomes,
  plan,
  isIncomesCollapsed,
  setIsIncomesCollapsed,
  showIncomeNotice,
  setShowIncomeNotice,
  openAddIncomeModal,
  openEditIncomeModal,
  handleDeleteEvent,
}: PlanIncomesSectionProps) {
  return (
    <div className="@container relative bg-muted hover:bg-muted/85 rounded-xl border border-border transition-all duration-200 p-4 sm:p-5 shadow-sm space-y-4">
      <CollapsibleCardHeader
        isCollapsed={isIncomesCollapsed}
        onToggle={setIsIncomesCollapsed}
        title="Additional Retirement Income Streams"
        description="Pensions, Annuities, Rental Income, and Pass-through Cash Flow"
        icon={ArrowUpCircle}
        className="px-0 py-0"
        actions={
          <button
            onClick={openAddIncomeModal}
            className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Income Stream
          </button>
        }
      />

      {!isIncomesCollapsed && (
        <div className="space-y-3 pt-1">
          {showIncomeNotice ? (
            <div className="flex items-start justify-between gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-600 dark:text-emerald-400">
              <div className="flex items-start gap-2">
                <Zap className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-foreground">Income Stream Guidelines:</p>
                  <ul className="list-disc list-inside space-y-0.5 mt-1 text-[11px]">
                    <li><strong>Include:</strong> Pensions, guaranteed annuities, passive rental income, royalties, or side-job wages.</li>
                    <li><strong>Do NOT include:</strong> Core salary, Social Security (computed automatically in Profile), or portfolio withdrawals.</li>
                  </ul>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowIncomeNotice(false)}
                className="text-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-300 p-0.5 rounded cursor-pointer shrink-0"
                title="Hide income guide"
              >
                &times;
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowIncomeNotice(true)}
              className="text-[11px] text-muted-foreground hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              Show income guidelines
            </button>
          )}

          <div className="space-y-3">
            {incomes.length === 0 ? (
              <div className="py-6 text-center border border-dashed border-border rounded-xl space-y-1">
                <p className="text-xs text-muted-foreground italic">No additional income streams configured.</p>
                <p className="text-[11px] text-muted-foreground/70">Add pensions, rental cash flow, or other post-retirement inflows.</p>
              </div>
            ) : (
              incomes.map((inc: PlanIncomeItem, i: number) => {
                const incNameStr = safeString(inc.name, 'Income Stream');
                const incId = safeString(inc.id, `inc_${i}`);
                const incTypeStr = safeString(inc.incomeType || inc.type, 'other');
                const startType = safeString(inc.startDateType || inc.startType, 'retirement');
                const startVal = safeString(inc.startDateValue || inc.startValue, '');
                const endType = safeString(inc.endDateType || inc.endType, 'end_of_plan');
                const endVal = safeString(inc.endDateValue || inc.endValue, '');

                return (
                  <div
                    key={incId}
                    className="@container relative rounded-xl border border-border bg-card hover:border-emerald-500/40 hover:bg-card/90 transition-all duration-200 p-4 sm:p-4.5 shadow-2xs space-y-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500 shrink-0">
                          <ArrowUpCircle className="w-5 h-5" />
                        </div>

                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-foreground truncate">{incNameStr}</span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md border bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 capitalize">
                              {incTypeStr.replace(/_/g, ' ')}
                            </span>
                            {safeString(inc.owner) === 'spouse' && plan.hasSpouse && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                                {plan.spouseName || 'Spouse'}
                              </span>
                            )}
                          </div>

                          <p className="text-[11px] text-muted-foreground">
                            {inc.growthRate ? `${inc.growthRate}% annual growth` : 'Fixed amount'}
                            {startType === 'retirement' ? ' • Starts at Retirement' : startType === 'age' && startVal ? ` • Starts Age ${startVal}` : startType === 'year' && startVal ? ` • Starts ${startVal}` : ''}
                            {endType === 'retirement' ? ' • Until Retirement' : endType === 'end_of_plan' ? ' • Lifetime' : (endType === 'after_n_years' || endType === 'duration') && endVal ? ` • For ${endVal} yrs` : endType === 'age' && endVal ? ` • Until Age ${endVal}` : endType === 'year' && endVal ? ` • Until ${endVal}` : ''}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <span className="text-[10px] text-muted-foreground block font-medium">Annual Inflow</span>
                          <span className="font-mono text-sm font-bold text-emerald-500 block">
                            +{formatCurrency(parseFloat(inc.amount) || 0)}/yr
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEditIncomeModal(inc)}
                            className="p-2 rounded-xl border border-border bg-background/50 hover:bg-background text-muted-foreground hover:text-foreground transition-all cursor-pointer"
                            title="Edit Income Stream"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteEvent(incId)}
                            className="p-2 rounded-xl border border-border bg-background/50 hover:bg-background text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-all cursor-pointer"
                            title="Delete Income Stream"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
