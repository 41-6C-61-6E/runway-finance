'use client';

import { useState, useEffect, useMemo } from 'react';
import { formatCurrency } from '@/lib/utils/format';
import { isAssetAccount, isLiabilityAccount } from '@/lib/utils/account-scope';
import { ACCOUNT_TYPE_LABELS } from '@/lib/constants/account-types';
import { useShowMath } from '@/lib/hooks/use-show-math';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { buildNetWorthTraces } from '@/lib/services/trace-engine';
import { CalculationTraceOverlay } from '@/components/financial-logic/calculation-trace';
import { EstimatePill } from '@/components/ui/estimate-pill';
import { Sparkline } from '@/components/ui/sparkline';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import type { AccountData, ChartPoint, CalculationTrace } from '@/lib/types/financial';
import { DollarSign } from 'lucide-react';

interface ChartResponse {
  data: ChartPoint[];
  summary: {
    current: number;
    previous: number;
    change: number;
    percentChange: number;
  };
}

export function NetWorthSummary() {
  const [accounts, setAccounts] = useState<AccountData[]>([]);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [hasEstimated, setHasEstimated] = useState(false);
  const { enabled: showMath } = useShowMath();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'totals' | 'percentages'>('totals');
  const [isCollapsed, setIsCollapsed] = useCardCollapsed('netWorthSummary');

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const [accountsRes, chartRes] = await Promise.all([
          fetch('/api/accounts'),
          fetch('/api/net-worth/chart?timeframe=1y'),
        ]);
        if (!accountsRes.ok || !chartRes.ok) throw new Error('Failed to fetch data');
        const [accountsData, chartResponse]: [AccountData[], ChartResponse] = await Promise.all([
          accountsRes.json(),
          chartRes.json(),
        ]);
        setAccounts(accountsData);
        setChartData(chartResponse.data || []);
        setHasEstimated((chartResponse.data ?? []).some((d: ChartPoint) => d.isSynthetic));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const totals = useMemo(() => {
    let totalAssets = 0;
    let totalLiabilities = 0;
    const assetByType: Record<string, number> = {};
    const liabilityByType: Record<string, number> = {};

    for (const acc of accounts) {
      const balance = typeof acc.balance === 'string' ? parseFloat(acc.balance) : acc.balance;
      if (isAssetAccount(acc.type)) {
        totalAssets += balance;
        assetByType[acc.type] = (assetByType[acc.type] || 0) + balance;
      } else if (isLiabilityAccount(acc.type)) {
        const abs = Math.abs(balance);
        totalLiabilities += abs;
        liabilityByType[acc.type] = (liabilityByType[acc.type] || 0) + abs;
      }
    }

    return { totalAssets, totalLiabilities, netWorth: totalAssets - totalLiabilities, assetByType, liabilityByType };
  }, [accounts]);

  const traces = useMemo(() => showMath ? buildNetWorthTraces(accounts) : [], [accounts, showMath]);

  const assetHistory = useMemo(() => chartData.map((d) => d.totalAssets), [chartData]);
  const liabilityHistory = useMemo(() => chartData.map((d) => d.totalLiabilities), [chartData]);
  const netWorthHistory = useMemo(() => chartData.map((d) => d.netWorth), [chartData]);

  const assetTrendPositive = useMemo(
    () => assetHistory.length >= 2 && assetHistory[assetHistory.length - 1] >= assetHistory[0],
    [assetHistory]
  );
  const liabilityTrendPositive = useMemo(
    () => liabilityHistory.length >= 2 && liabilityHistory[liabilityHistory.length - 1] >= liabilityHistory[0],
    [liabilityHistory]
  );
  const netWorthTrendPositive = useMemo(
    () => netWorthHistory.length >= 2 && netWorthHistory[netWorthHistory.length - 1] >= netWorthHistory[0],
    [netWorthHistory]
  );

  const deltas = useMemo(() => {
    if (chartData.length < 2) return { assets: 0, liabilities: 0, netWorth: 0, pctAssets: 0, pctLiabilities: 0, pctNetWorth: 0 };
    const cur = chartData[chartData.length - 1];
    const prev = chartData[0];
    const dAssets = cur.totalAssets - prev.totalAssets;
    const dLiabilities = cur.totalLiabilities - prev.totalLiabilities;
    const dNetWorth = cur.netWorth - prev.netWorth;
    return {
      assets: dAssets,
      liabilities: dLiabilities,
      netWorth: dNetWorth,
      pctAssets: prev.totalAssets !== 0 ? (dAssets / prev.totalAssets) * 100 : 0,
      pctLiabilities: prev.totalLiabilities !== 0 ? (dLiabilities / prev.totalLiabilities) * 100 : 0,
      pctNetWorth: prev.netWorth !== 0 ? (dNetWorth / prev.netWorth) * 100 : 0,
    };
  }, [chartData]);

  const section = (title: string, value: number, delta: number, pct: number, history: number[], trendPositive: boolean, trace?: CalculationTrace) => (
    <div className="p-5">
      <div className="flex items-center gap-3 mb-3">
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
        <Sparkline data={history} width={80} height={20} isPositive={trendPositive} />
      </div>
      <div className="text-2xl font-bold text-foreground financial-value">{formatCurrency(value)}</div>
      <div className={`flex items-center gap-1 mt-1 text-sm font-medium ${delta >= 0 ? 'text-chart-1' : 'text-destructive'}`}>
        <span>{delta >= 0 ? '↑' : '↓'}</span>
        <span className="financial-value">{formatCurrency(Math.abs(delta))}</span>
        <span className="text-xs opacity-80 financial-value">({pct >= 0 ? '+' : ''}{pct.toFixed(1)}%)</span>
      </div>
      <div className="text-xs text-muted-foreground mt-1">in the last 1 year</div>
      {showMath && trace && <CalculationTraceOverlay trace={trace} />}
    </div>
  );

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm h-full">
        <CollapsibleCardHeader
          isCollapsed={isCollapsed}
          onToggle={setIsCollapsed}
          title={
            <h3 className="text-sm sm:text-base font-bold text-foreground flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-primary" /> Net Worth Summary
            </h3>
          }
        />
        {!isCollapsed && (
          <div className="animate-pulse">
            <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border h-full">
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-5 space-y-3">
                  <div className="h-4 bg-muted rounded w-24" />
                  <div className="h-8 bg-muted rounded w-32" />
                  <div className="h-4 bg-muted rounded w-20" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm h-full">
        <CollapsibleCardHeader
          isCollapsed={isCollapsed}
          onToggle={setIsCollapsed}
          title={
            <h3 className="text-sm sm:text-base font-bold text-foreground flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-primary" /> Net Worth Summary
            </h3>
          }
        />
        {!isCollapsed && (
          <div className="p-5">
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm h-full">
      <CollapsibleCardHeader
        isCollapsed={isCollapsed}
        onToggle={setIsCollapsed}
        title={
          <h3 className="text-sm sm:text-base font-bold text-foreground flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-primary" /> Net Worth Summary
          </h3>
        }
      />
      {!isCollapsed && (
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border">
        {section('Total Assets', totals.totalAssets, deltas.assets, deltas.pctAssets, assetHistory, assetTrendPositive, traces[0])}
        {section('Total Liabilities', totals.totalLiabilities, -deltas.liabilities, -deltas.pctLiabilities, liabilityHistory, liabilityTrendPositive, traces[1])}
        {section('Net Worth', totals.netWorth, deltas.netWorth, deltas.pctNetWorth, netWorthHistory, netWorthTrendPositive, undefined)}
      </div>
      )}
    </div>
  );
}
