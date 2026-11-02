'use client';

import React from 'react';
import { ArrowDownCircle, Plus, Pencil, Trash2 } from 'lucide-react';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { formatCurrency } from '@/lib/utils/format';
import { safeString, PlanExpenseItem } from './types';

export interface PlanExpensesSectionProps {
  expenses: PlanExpenseItem[];
  plan: { hasSpouse?: boolean; spouseName?: string };
  isExpensesCollapsed: boolean;
  setIsExpensesCollapsed: (collapsed: boolean) => void;
  openAddExpenseModal: () => void;
  openEditExpenseModal: (exp: PlanExpenseItem) => void;
  handleDeleteEvent: (id: string) => void;
}

export function PlanExpensesSection({
  expenses,
  plan,
  isExpensesCollapsed,
  setIsExpensesCollapsed,
  openAddExpenseModal,
  openEditExpenseModal,
  handleDeleteEvent,
}: PlanExpensesSectionProps) {
  return (
    <div className="@container relative bg-muted hover:bg-muted/85 rounded-xl border border-border transition-all duration-200 p-4 sm:p-5 shadow-sm space-y-4">
      <CollapsibleCardHeader
        isCollapsed={isExpensesCollapsed}
        onToggle={setIsExpensesCollapsed}
        title="Retirement Expenses & Outflows"
        description="Healthcare, Travel, Mortgage payoffs, Relocations, or Special Outlays"
        icon={ArrowDownCircle}
        className="px-0 py-0"
        actions={
          <button
            onClick={openAddExpenseModal}
            className="flex items-center gap-1.5 bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Expense Stream
          </button>
        }
      />

      {!isExpensesCollapsed && (
        <div className="space-y-3 pt-1">
          <div className="space-y-3">
            {expenses.length === 0 ? (
              <div className="py-6 text-center border border-dashed border-border rounded-xl space-y-1">
                <p className="text-xs text-muted-foreground italic">No specialized expenses defined yet.</p>
                <p className="text-[11px] text-muted-foreground/70">Add Travel, College tuition, Weddings, or Major purchases to adjust outflows.</p>
              </div>
            ) : (
              expenses.map((exp: PlanExpenseItem, i: number) => {
                const expNameStr = safeString(exp.name, 'Expense Stream');
                const expId = safeString(exp.id, `exp_${i}`);
                const expTypeStr = safeString(exp.expenseType || exp.type, 'general');
                const startType = safeString(exp.startDateType || exp.startType, 'retirement');
                const startVal = safeString(exp.startDateValue || exp.startValue, '');
                const endType = safeString(exp.endDateType || exp.endType, 'end_of_plan');
                const endVal = safeString(exp.endDateValue || exp.endValue, '');

                return (
                  <div
                    key={expId}
                    className="@container relative rounded-xl border border-border bg-card hover:border-rose-500/40 hover:bg-card/90 transition-all duration-200 p-4 sm:p-4.5 shadow-2xs space-y-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-500 shrink-0">
                          <ArrowDownCircle className="w-5 h-5" />
                        </div>

                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-foreground truncate">{expNameStr}</span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md border bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 capitalize">
                              {expTypeStr.replace(/_/g, ' ')}
                            </span>
                            {safeString(exp.owner) === 'spouse' && plan.hasSpouse && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                                {plan.spouseName || 'Spouse'}
                              </span>
                            )}
                          </div>

                          <p className="text-[11px] text-muted-foreground">
                            {exp.growthRate ? `${exp.growthRate}% annual inflation` : 'Fixed amount'}
                            {startType === 'retirement' ? ' • Starts at Retirement' : startType === 'age' && startVal ? ` • Starts Age ${startVal}` : startType === 'year' && startVal ? ` • Starts ${startVal}` : ''}
                            {endType === 'retirement' ? ' • Until Retirement' : endType === 'end_of_plan' ? ' • Lifetime' : (endType === 'after_n_years' || endType === 'duration') && endVal ? ` • For ${endVal} yrs` : endType === 'age' && endVal ? ` • Until Age ${endVal}` : endType === 'year' && endVal ? ` • Until ${endVal}` : ''}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <span className="text-[10px] text-muted-foreground block font-medium">Annual Outflow</span>
                          <span className="font-mono text-sm font-bold text-rose-500 block">
                            {formatCurrency(parseFloat(exp.amount) || 0)}/yr
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEditExpenseModal(exp)}
                            className="p-2 rounded-xl border border-border bg-background/50 hover:bg-background text-muted-foreground hover:text-primary hover:bg-muted/60 transition-all cursor-pointer"
                            title="Edit Expense"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteEvent(expId)}
                            className="p-2 rounded-xl border border-border bg-background/50 hover:bg-background text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-all cursor-pointer"
                            title="Delete Expense"
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
