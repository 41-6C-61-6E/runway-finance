'use client';

import React from 'react';
import { Receipt, Plus, Pencil, Trash2 } from 'lucide-react';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { formatCurrency } from '@/lib/utils/format';
import { safeString, PlanLiabilityItem } from './types';

export interface PlanLiabilitiesSectionProps {
  liabilities: PlanLiabilityItem[];
  plan: { hasSpouse?: boolean; spouseName?: string };
  isLiabilitiesCollapsed: boolean;
  setIsLiabilitiesCollapsed: (collapsed: boolean) => void;
  openAddLiabilityModal: () => void;
  openEditLiabilityModal: (liab: PlanLiabilityItem) => void;
  handleDeleteLiability: (id: string) => void;
}

export function PlanLiabilitiesSection({
  liabilities,
  plan,
  isLiabilitiesCollapsed,
  setIsLiabilitiesCollapsed,
  openAddLiabilityModal,
  openEditLiabilityModal,
  handleDeleteLiability,
}: PlanLiabilitiesSectionProps) {
  return (
    <div className="@container relative bg-muted hover:bg-muted/85 rounded-xl border border-border transition-all duration-200 p-4 sm:p-5 shadow-sm space-y-4">
      <CollapsibleCardHeader
        isCollapsed={isLiabilitiesCollapsed}
        onToggle={setIsLiabilitiesCollapsed}
        title="Debts & Liabilities"
        description="Mortgages, student loans, car loans, and credit card balances"
        icon={Receipt}
        className="px-0 py-0"
        actions={
          <button
            onClick={openAddLiabilityModal}
            className="flex items-center gap-1.5 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Liability
          </button>
        }
      />

      {!isLiabilitiesCollapsed && (
        <div className="space-y-3 pt-1">
          <div className="space-y-3">
            {liabilities.length === 0 ? (
              <div className="py-6 text-center border border-dashed border-border rounded-xl space-y-1">
                <p className="text-xs text-muted-foreground italic">No debts or liabilities defined yet.</p>
                <p className="text-[11px] text-muted-foreground/70">Add Mortgages, Auto Loans, or Personal Debt to model obligations.</p>
              </div>
            ) : (
              liabilities.map((liab: PlanLiabilityItem, i: number) => {
                const liabNameStr = safeString(liab.name, 'Debt / Liability');
                const liabId = safeString(liab.id, `liab_${i}`);
                const balance = parseFloat(liab.balance) || 0;
                const interest = parseFloat(liab.interestRate) || 0;
                const monthlyPmt = parseFloat(liab.monthlyPayment) || 0;
                const yearsRem = parseFloat(liab.yearsRemaining) || 0;

                return (
                  <div
                    key={liabId}
                    className="@container relative rounded-xl border border-border bg-card hover:border-amber-500/40 hover:bg-card/90 transition-all duration-200 p-4 sm:p-4.5 shadow-2xs space-y-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500 shrink-0">
                          <Receipt className="w-5 h-5" />
                        </div>

                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-foreground truncate">{liabNameStr}</span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md border bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">
                              {interest}% APR
                            </span>
                            {yearsRem > 0 && (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md border bg-muted/40 text-muted-foreground border-border">
                                {yearsRem} yrs remaining
                              </span>
                            )}
                            {safeString(liab.owner) === 'spouse' && plan.hasSpouse && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                                {plan.spouseName || 'Spouse'}
                              </span>
                            )}
                          </div>

                          <p className="text-[11px] text-muted-foreground">
                            Monthly Payment: <strong className="text-foreground font-mono">{formatCurrency(monthlyPmt)}/mo</strong> ({formatCurrency(monthlyPmt * 12)}/yr)
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <span className="text-[10px] text-muted-foreground block font-medium">Principal</span>
                          <span className="font-mono text-sm font-bold text-amber-500 block">
                            {formatCurrency(balance)}
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEditLiabilityModal(liab)}
                            className="p-2 rounded-xl border border-border bg-background/50 hover:bg-background text-muted-foreground hover:text-foreground transition-all cursor-pointer"
                            title="Edit Liability"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteLiability(liabId)}
                            className="p-2 rounded-xl border border-border bg-background/50 hover:bg-background text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-all cursor-pointer"
                            title="Delete Liability"
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
