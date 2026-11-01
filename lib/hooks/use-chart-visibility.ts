'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useUserSettings } from '@/components/user-settings-provider';

export const CHARTS = {
  netWorth: {
    label: 'Net Worth',
    charts: {
      netWorthSummary: 'Summary Cards',
      netWorthChart: 'Net Worth Line Chart',
      debtToAssetRatio: 'Debt-to-Asset Ratio',
      assetAllocation: 'Asset Allocation',
      debtBreakdown: 'Debt Breakdown',
    },
  },
  flows: {
    label: 'Flows',
    charts: {
      wealthFlowSankey: 'Wealth Flow Sankey',
      cashFlowSankey: 'Cash Flow Sankey',
      incomeExpenseChart: 'Income vs Expense Chart',
    },
  },
  spending: {
    label: 'Spending',
    charts: {
      spendingBreakdown: 'Spending Breakdown',
      cashVsCredit: 'Cash vs Credit',
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
      budgetTable: 'Budget Items Table',
    },
  },
  goals: {
    label: 'Goals',
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

export function useChartVisibility() {
  const userSettingsCtx = useUserSettings();

  const [localVisibility, setLocalVisibility] = useState<Record<string, boolean>>({});
  const [localLoading, setLocalLoading] = useState(!userSettingsCtx);

  useEffect(() => {
    if (userSettingsCtx) return;
    fetch('/api/user-settings', { credentials: 'include', cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        setLocalVisibility(data?.chartVisibility ?? {});
      })
      .catch(() => {})
      .finally(() => setLocalLoading(false));
  }, [userSettingsCtx]);

  const visibility = useMemo<Record<string, boolean>>(() => {
    if (userSettingsCtx) {
      return (userSettingsCtx.settings?.chartVisibility as Record<string, boolean>) ?? {};
    }
    return localVisibility;
  }, [userSettingsCtx, userSettingsCtx?.settings?.chartVisibility, localVisibility]);

  const loading = userSettingsCtx ? userSettingsCtx.loading : localLoading;

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

      if (userSettingsCtx) {
        await userSettingsCtx.updateSetting('chartVisibility', next);
        return;
      }

      setLocalVisibility(next);
      try {
        const res = await fetch('/api/user-settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ chartVisibility: next }),
        });
        if (!res.ok) throw new Error('Failed to save visibility');
      } catch {
        setLocalVisibility(prev);
      }
    },
    [visibility, userSettingsCtx]
  );

  const updateMultiple = useCallback(
    async (updates: Record<string, boolean>) => {
      const prev = visibility;
      const next = { ...prev, ...updates };

      if (userSettingsCtx) {
        await userSettingsCtx.updateSetting('chartVisibility', next);
        return;
      }

      setLocalVisibility(next);
      try {
        const res = await fetch('/api/user-settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ chartVisibility: next }),
        });
        if (!res.ok) throw new Error('Failed to save visibility');
      } catch {
        setLocalVisibility(prev);
      }
    },
    [visibility, userSettingsCtx]
  );

  return { visibility, loading, isVisible, updateVisibility, updateMultiple };
}
