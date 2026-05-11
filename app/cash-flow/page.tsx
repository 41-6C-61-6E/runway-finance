'use client';

import { Suspense } from 'react';
import { CashFlowSummary } from '@/components/cash-flow/cash-flow-summary';
import { IncomeExpenseChart } from '@/components/cash-flow/income-expense-chart';
import { NetIncomeAnalysis } from '@/components/cash-flow/net-income-analysis';
import { SpendingBreakdown } from '@/components/cash-flow/spending-breakdown';
import { CategorySummaries } from '@/components/cash-flow/category-summaries';
import { BudgetVsActual } from '@/components/cash-flow/budget-vs-actual';
import { CashFlowSankey } from '@/components/cash-flow/cash-flow-sankey';

function CashFlowContent() {
  return (
    <div className="min-h-screen w-full">
      <div className="px-4 sm:px-6 lg:px-8 py-6">
        <div className="mx-auto max-w-[1600px]">
          <h1 className="text-xl font-semibold text-foreground mb-5">Cash Flow</h1>

          <Suspense fallback={<div className="text-muted-foreground">Loading summary...</div>}>
            <CashFlowSummary />
          </Suspense>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
            <Suspense fallback={<div className="text-muted-foreground">Loading chart...</div>}>
              <IncomeExpenseChart />
            </Suspense>
            <Suspense fallback={<div className="text-muted-foreground">Loading analysis...</div>}>
              <NetIncomeAnalysis />
            </Suspense>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
            <Suspense fallback={<div className="text-muted-foreground">Loading breakdown...</div>}>
              <SpendingBreakdown />
            </Suspense>
            <Suspense fallback={<div className="text-muted-foreground">Loading budget...</div>}>
              <BudgetVsActual />
            </Suspense>
          </div>

          <div className="mt-5">
            <Suspense fallback={<div className="text-muted-foreground">Loading categories...</div>}>
              <CategorySummaries />
            </Suspense>
          </div>

          <div className="mt-5">
            <Suspense fallback={<div className="text-muted-foreground">Loading sankey...</div>}>
              <CashFlowSankey />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CashFlowPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>}>
      <CashFlowContent />
    </Suspense>
  );
}
