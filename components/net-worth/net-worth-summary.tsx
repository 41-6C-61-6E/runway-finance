'use client';

import { useState, useEffect, useMemo } from 'react';
import { formatCurrency } from '@/lib/utils/format';
import { isAssetAccount, isLiabilityAccount } from '@/lib/utils/account-scope';
import { ACCOUNT_TYPE_LABELS } from '@/lib/constants/account-types';
import { useShowMath } from '@/lib/hooks/use-show-math';
import { buildNetWorthTraces } from '@/lib/services/trace-engine';
import { CalculationTraceOverlay } from '@/components/financial-logic/calculation-trace';
import { EstimatePill } from '@/components/ui/estimate-pill';
import type { AccountData, ChartPoint } from '@/lib/types/financial';

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

  const deltas = useMemo(() => {
    if (chartData.length < 2) return { assets: 0, liabilities: 0, netWorth: 0, pctAssets: 0, pctLiabilities: 0, pctNetWorth: 0 };
    const cur = chartData[chartData.length - 1];
    const prev = chartData[chartData.length - 2];
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

  const totalLabel = (id: string, value: number, delta: number, pct: number, timeframe?: string) => (
    <>
      <div className="text-2xl font-bold text-foreground financial-value">{formatCurrency(value)}</div>
      <div className={`flex items-center gap-1 mt-1 text-sm font-medium ${delta >= 0 ? 'text-chart-1' : 'text-destructive'}`}>
        <span>{delta >= 0 ? '↑' : '↓'}</span>
        <span className="financial-value">{formatCurrency(Math.abs(delta))}</span>
        <span className="text-xs opacity-80 financial-value">({pct >= 0 ? '+' : ''}{pct.toFixed(1)}%)</span>
      </div>
      {timeframe && (
        <div className="text-xs text-muted-foreground mt-1">
          in the last {timeframe}
        </div>
      )}
    </>
  );

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {[1, 2].map((i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-5 shadow-sm animate-pulse">
            <div className="h-4 bg-muted rounded w-24 mb-3"></div>
            <div className="h-8 bg-muted rounded w-32 mb-2"></div>
            <div className="h-4 bg-muted rounded w-20"></div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm sm:col-span-1">
          <div className="grid grid-cols-1 gap-5">
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-1">Total Assets</h3>
              {totalLabel('assets', totals.totalAssets, deltas.assets, deltas.pctAssets, '1 year')}
              {showMath && traces[0] && <CalculationTraceOverlay trace={traces[0]} />}
            </div>
            <div className="border-t border-border pt-5">
              <h3 className="text-sm font-medium text-muted-foreground mb-1">Total Liabilities</h3>
              {totalLabel('liabilities', totals.totalLiabilities, -deltas.liabilities, -deltas.pctLiabilities, '1 year')}
              {showMath && traces[1] && <CalculationTraceOverlay trace={traces[1]} />}
            </div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm sm:col-span-2">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Net Worth</h3>
          <div className="text-2xl font-bold text-foreground financial-value">{formatCurrency(totals.netWorth)}</div>
          <div className="flex items-center gap-1 mt-2 text-sm font-medium" style={{ color: deltas.netWorth >= 0 ? 'var(--color-chart-1)' : 'var(--color-destructive)' }}>
            <span>{deltas.netWorth >= 0 ? '↑' : '↓'}</span>
            <span className="financial-value">{formatCurrency(Math.abs(deltas.netWorth))}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            in the last 1 year
          </div>
          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-xs text-muted-foreground mb-2">Asset Allocation</p>
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden flex">
              <div
                className="bg-chart-1 h-full transition-all"
                style={{ width: `${totals.totalAssets + totals.totalLiabilities > 0 ? (totals.totalAssets / (totals.totalAssets + totals.totalLiabilities)) * 100 : 0}%` }}
              />
              <div
                className="bg-destructive h-full transition-all"
                style={{ width: `${totals.totalAssets + totals.totalLiabilities > 0 ? (totals.totalLiabilities / (totals.totalAssets + totals.totalLiabilities)) * 100 : 0}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>Assets {totals.totalAssets + totals.totalLiabilities > 0 ? ((totals.totalAssets / (totals.totalAssets + totals.totalLiabilities)) * 100).toFixed(0) : '0'}%</span>
              <span>Liabilities {totals.totalAssets + totals.totalLiabilities > 0 ? ((totals.totalLiabilities / (totals.totalAssets + totals.totalLiabilities)) * 100).toFixed(0) : '0'}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
