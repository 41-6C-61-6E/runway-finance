'use client';

import { useState, useEffect, useCallback } from 'react';

export const CHARTS = {
  netWorth: {
    label: 'Net Worth',
    charts: {
      netWorthSummary: 'Summary Cards',
      netWorthChart: 'Net Worth Line Chart',
      debtToAssetRatio: 'Debt-to-Asset Ratio',
      accountValuesChart: 'Account Values Chart',
    },
  },
  flows: {
    label: 'Flows',
    charts: {
      cashFlowSummary: 'Summary Cards',
      budgetVsActual: 'Budget vs Actual',
      cashFlowSankey: 'Sankey Diagram',
      cashFlowForecast: 'Cash Flow Forecast',
    },
  },
  spending: {
    label: 'Spending',
    charts: {
      cashVsCredit: 'Cash vs Credit',
      incomeExpenseChart: 'Income vs Expense Chart',
      spendingBreakdown: 'Spending Breakdown',
      categorySummaries: 'Category Breakdown',
      categoryIncome: 'Income Section',
      categoryExpenses: 'Expenses Section',
    },
  },

  realEstate: {
    label: 'Real Estate',
    charts: {
      equityOverTimeChart: 'Equity Over Time Chart',
      portfolioAllocationChart: 'Portfolio Allocation Chart',
      propertyCards: 'Property Cards',
      mortgagePaydown: 'Property Payoff Projections',
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
      milestonesProjections: 'Milestones & Projections',
    },
  },
  investments: {
    label: 'Investments',
    charts: {
      investmentsSummary: 'Summary Cards',
      performanceChart: 'Portfolio Value Over Time',
      taxBreakdown: 'Tax Wrapper Breakdown',
      topHoldings: 'Top Holdings Sparkline Cards',
      holdingsAllocationChart: 'Holdings Allocation Chart',
      incomeDividends: 'Dividend & Interest Income',
      holdingsTable: 'Holdings Table',
      recentActivity: 'Recent Activity',
    },
  },
} as const;

const defaultVisibility: Partial<Record<string, boolean>> = {};

export function useChartVisibility() {
  const [visibility, setVisibility] = useState<Partial<Record<string, boolean>>>(defaultVisibility);
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
