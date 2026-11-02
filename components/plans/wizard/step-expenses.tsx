'use client';

import React from 'react';

interface StepExpensesProps {
  livingExpenseAmount: number | '';
  setLivingExpenseAmount: (val: number | '') => void;
  healthcareExpenseAmount: number | '';
  setHealthcareExpenseAmount: (val: number | '') => void;
  pensionIncomeAmount: number | '';
  setPensionIncomeAmount: (val: number | '') => void;
}

export function StepExpenses({
  livingExpenseAmount,
  setLivingExpenseAmount,
  healthcareExpenseAmount,
  setHealthcareExpenseAmount,
  pensionIncomeAmount,
  setPensionIncomeAmount,
}: StepExpensesProps) {
  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-xs font-semibold text-muted-foreground">Annual Living Expenses ($/year)</label>
          <input
            type="number"
            required
            min={0}
            step={1000}
            value={livingExpenseAmount}
            onChange={(e) => setLivingExpenseAmount(e.target.value === '' ? '' : parseFloat(e.target.value))}
            className="w-full bg-muted/40 border border-border rounded-xl px-3.5 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 font-bold"
          />
          <p className="text-[11px] text-muted-foreground">
            Base annual outflow required in retirement (excluding taxes & healthcare)
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground">Healthcare Expenses ($/year)</label>
          <input
            type="number"
            min={0}
            step={500}
            value={healthcareExpenseAmount}
            onChange={(e) => setHealthcareExpenseAmount(e.target.value === '' ? '' : parseFloat(e.target.value))}
            className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground">Pension / Passive Income ($/year)</label>
          <input
            type="number"
            min={0}
            step={1000}
            value={pensionIncomeAmount}
            onChange={(e) => setPensionIncomeAmount(e.target.value === '' ? '' : parseFloat(e.target.value))}
            className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
      </div>
    </div>
  );
}

