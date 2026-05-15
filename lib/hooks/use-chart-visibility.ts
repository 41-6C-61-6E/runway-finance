'use client';

import { useState, useEffect, useCallback } from 'react';

export const CHARTS = {
  netWorth: {
    label: 'Net Worth',
    charts: {
      netWorthSummary: 'Summary Cards',
      netWorthChart: 'Net Worth Line Chart',
      debtToAssetRatio: 'Debt-to-Asset Ratio',
      assetAllocationChart: 'Asset Allocation Chart',
      accountValuesChart: 'Account Values Chart',
    },
  },
  cashFlow: {
    label: 'Cash Flow',
    charts: {
      cashFlowSummary: 'Summary Cards',
      incomeExpenseChart: 'Income vs Expense Chart',
      netIncomeAnalysis: 'Net Income Analysis',
      budgetVsActual: 'Budget vs Actual',
      cashFlowSankey: 'Sankey Diagram',
      cashFlowForecast: 'Cash Flow Forecast',
    },
  },
  spending: {
    label: 'Spending',
    charts: {
      spendingBreakdown: 'Spending Breakdown',
      categorySummaries: 'Category Breakdown',
      categoryIncome: 'Income Section',
      categoryExpenses: 'Expenses Section',
    },
  },
  fire: {
    label: 'FIRE',
    charts: {
      fireMetrics: 'Summary Cards',
      fireProjectionChart: 'Projection Chart',
      fireProgressRing: 'Progress Ring',
      whatIfAnalysis: 'What-If Analysis',
      fireScenarios: 'Scenarios',
    },
  },
  retirement: {
    label: 'Retirement Planner',
    charts: {
      retirementInputs: 'Assumptions Inputs',
      retirementMetrics: 'Summary Cards',
      retirementRunwayChart: 'Runway Chart',
      retirementMonteCarlo: 'Monte Carlo Analysis',
    },
  },
  realEstate: {
    label: 'Real Estate',
    charts: {
      realEstateSummary: 'Summary Cards',
      equityOverTimeChart: 'Equity Over Time Chart',
      portfolioAllocationChart: 'Portfolio Allocation Chart',
      propertyCards: 'Property Cards',
      mortgagePaydown: 'Mortgage Paydown Chart',
    },
  },
  budgets: {
    label: 'Budgets',
    charts: {
      budgetSummary: 'Summary Cards',
      budgetVsActualChart: 'Budget vs Actual Chart',
      budgetTable: 'Budget Items Table',
    },
  },
  goals: {
    label: 'Financial Goals',
    charts: {
      goalsSummary: 'Summary Cards',
      goalsList: 'Goals List',
    },
  },
} as const;

export type ChartId = {
  [K in keyof typeof CHARTS]: keyof typeof CHARTS[K]['charts'];
}[keyof typeof CHARTS];

export type ChartVisibility = Partial<Record<string, boolean>>;

const defaultVisibility: ChartVisibility = {};

export function useChartVisibility() {
  const [visibility, setVisibility] = useState<ChartVisibility>(defaultVisibility);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/user-settings', { credentials: 'include', cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        setVisibility(data.chartVisibility ?? {});
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const isVisible = useCallback(
    (chartId: string) => {
      if (loading) return true;
      return visibility[chartId] !== false;
    },
    [visibility, loading]
  );

  const updateVisibility = useCallback(
    async (chartId: string, visible: boolean) => {
      const prev = visibility;
      const next = { ...prev, [chartId]: visible };
      setVisibility(next);
      try {
        const res = await fetch('/api/user-settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ chartVisibility: next }),
        });
        if (!res.ok) throw new Error('Failed to save visibility');
      } catch {
        setVisibility(prev);
      }
    },
    [visibility]
  );

  const updateMultiple = useCallback(
    async (updates: Record<string, boolean>) => {
      const prev = visibility;
      const next = { ...prev, ...updates };
      setVisibility(next);
      try {
        const res = await fetch('/api/user-settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ chartVisibility: next }),
        });
        if (!res.ok) throw new Error('Failed to save visibility');
      } catch {
        setVisibility(prev);
      }
    },
    [visibility]
  );

  return { visibility, loading, isVisible, updateVisibility, updateMultiple };
}
