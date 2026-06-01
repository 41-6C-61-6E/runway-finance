'use client';

import { useState, useEffect, useMemo } from 'react';
import { isAssetAccount, isLiabilityAccount } from '@/lib/utils/account-scope';
import { useShowMath } from '@/lib/hooks/use-show-math';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { buildDebtToAssetTrace } from '@/lib/services/trace-engine';
import { CalculationTraceOverlay } from '@/components/financial-logic/calculation-trace';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { Percent } from 'lucide-react';

const RATING_THRESHOLDS = [
  { max: 0.35, label: 'Excellent', hue: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  { max: 0.45, label: 'Good', hue: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  { max: 0.55, label: 'Fair', hue: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
  { max: 0.75, label: 'Poor', hue: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  { max: Infinity, label: 'Critical', hue: 'bg-red-500/15 text-red-400 border-red-500/30' },
];

const RATING_PROGRESS_COLORS: Record<string, string> = {
  Excellent: 'bg-emerald-500',
  Good: 'bg-blue-500',
  Fair: 'bg-yellow-500',
  Poor: 'bg-orange-500',
  Critical: 'bg-red-500',
};


function getRating(ratio: number) {
  for (const t of RATING_THRESHOLDS) {
    if (ratio < t.max) return t;
  }
  return RATING_THRESHOLDS[RATING_THRESHOLDS.length - 1];
}

interface AccountData {
  id: string;
  type: string;
  balance: string | number;
  name: string;
}

export function DebtToAssetRatio() {
  const { enabled: showMath } = useShowMath();
  const [accounts, setAccounts] = useState<AccountData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useCardCollapsed('debtToAssetRatio');

  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch('/api/accounts', { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to fetch accounts');
        const data = await res.json();
        setAccounts(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };
    fetchAccounts();
  }, []);

  const { totalAssets, totalLiabilities, ratio, rating } = useMemo(() => {
    let assets = 0;
    let liabilities = 0;

    for (const acc of accounts) {
      const balance = typeof acc.balance === 'string' ? parseFloat(acc.balance) : acc.balance;

      if (isAssetAccount(acc.type)) {
        assets += balance;
      } else if (isLiabilityAccount(acc.type)) {
        liabilities += Math.abs(balance);
      }
    }

    const rawRatio = assets > 0 ? liabilities / assets : 0;
    const ratingInfo = getRating(rawRatio);

    return {
      totalAssets: assets,
      totalLiabilities: liabilities,
      ratio: rawRatio,
      rating: ratingInfo,
    };
  }, [accounts]);

  const debtTrace = useMemo(() => {
    if (!showMath || accounts.length === 0) return null;
    return buildDebtToAssetTrace(accounts);
  }, [accounts, showMath]);

  const pct = ratio * 100;

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm h-full">
        <CollapsibleCardHeader
          isCollapsed={isCollapsed}
          onToggle={setIsCollapsed}
          title={
            <h3 className="text-sm sm:text-base font-bold text-foreground flex items-center gap-2">
              <Percent className="w-4 h-4 text-primary" /> Debt to Asset Ratio
            </h3>
          }
        />
        {!isCollapsed && (
          <div className="p-5">
            <div className="animate-pulse space-y-4">
              <div className="h-5 bg-muted rounded w-40" />
              <div className="h-10 bg-muted rounded w-24" />
              <div className="h-2 bg-muted rounded-full" />
              <div className="h-40 bg-muted rounded" />
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
              <Percent className="w-4 h-4 text-primary" /> Debt to Asset Ratio
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

  if (accounts.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm h-full">
        <CollapsibleCardHeader
          isCollapsed={isCollapsed}
          onToggle={setIsCollapsed}
          title={
            <h3 className="text-sm sm:text-base font-bold text-foreground flex items-center gap-2">
              <Percent className="w-4 h-4 text-primary" /> Debt to Asset Ratio
            </h3>
          }
        />
        {!isCollapsed && (
          <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
            No account data available
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
            <Percent className="w-4 h-4 text-primary" /> Debt to Asset Ratio
          </h3>
        }
      />
      {!isCollapsed && (
        <div className="p-3 sm:p-5">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-4xl font-bold text-foreground financial-value">
              {pct.toFixed(0)}%
            </span>
            <span className={`inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full border ${rating.hue}`}>
              {rating.label}
            </span>
          </div>

          <div className="space-y-1.5 mb-3">
            <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
              <div
                className={`h-full ${RATING_PROGRESS_COLORS[rating.label]} transition-all duration-500 rounded-full`}
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>

          {showMath && debtTrace && <CalculationTraceOverlay trace={debtTrace} />}
        </div>
      )}
    </div>
  );
}
