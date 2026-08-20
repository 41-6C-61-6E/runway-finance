'use client';

import { useState, useEffect, useMemo } from 'react';
import { isAssetAccount, isLiabilityAccount } from '@/lib/utils/account-scope';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { Percent } from 'lucide-react';

const RATING_THRESHOLDS = [
  { max: 0.35, label: 'Excellent', colorVar: 'var(--status-positive)' },
  { max: 0.45, label: 'Good', colorVar: 'var(--chart-2)' },
  { max: 0.55, label: 'Fair', colorVar: 'var(--status-warning)' },
  { max: 0.75, label: 'Poor', colorVar: 'var(--chart-3)' },
  { max: Infinity, label: 'Critical', colorVar: 'var(--destructive)' },
];

const RATING_PROGRESS_COLORS: Record<string, string> = {
  Excellent: 'bg-chart-1',
  Good: 'bg-blue-500',
  Fair: 'bg-yellow-500',
  Poor: 'bg-orange-500',
  Critical: 'bg-chart-5',
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

    const rawRatio = assets > 0 
      ? liabilities / assets 
      : (liabilities > 0 ? Infinity : 0);
    const ratingInfo = getRating(rawRatio);

    return {
      totalAssets: assets,
      totalLiabilities: liabilities,
      ratio: rawRatio,
      rating: ratingInfo,
    };
  }, [accounts]);

  const pct = isFinite(ratio) ? ratio * 100 : 100;

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm h-full">
        <CollapsibleCardHeader
          isCollapsed={isCollapsed}
          onToggle={setIsCollapsed}
          title={
            <div className="flex items-center gap-2">
              <Percent className="w-4 h-4 text-primary shrink-0" />
              <span>Debt to Asset Ratio</span>
            </div>
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
            <div className="flex items-center gap-2">
              <Percent className="w-4 h-4 text-primary shrink-0" />
              <span>Debt to Asset Ratio</span>
            </div>
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
            <div className="flex items-center gap-2">
              <Percent className="w-4 h-4 text-primary shrink-0" />
              <span>Debt to Asset Ratio</span>
            </div>
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
    <div className="bg-card border border-border rounded-xl shadow-sm h-full flex flex-col">
      <CollapsibleCardHeader
        isCollapsed={isCollapsed}
        onToggle={setIsCollapsed}
        title={
          <div className="flex items-center gap-2">
            <Percent className="w-4 h-4 text-primary shrink-0" />
            <span>Debt to Asset Ratio</span>
          </div>
        }
      />
      {!isCollapsed && (
        <div className="flex-1 flex flex-col justify-center p-4 sm:p-5">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2.5 shrink-0">
              <span className="text-2xl sm:text-3xl font-extrabold text-foreground font-mono blur-number">
                {isFinite(ratio) ? `${pct.toFixed(0)}%` : '100%+'}
              </span>
              <span
                className="inline-flex items-center px-2.5 py-0.5 text-[11px] font-bold rounded-full border font-mono"
                style={{
                  color: rating.colorVar,
                  borderColor: `color-mix(in srgb, ${rating.colorVar} 30%, transparent)`,
                  backgroundColor: `color-mix(in srgb, ${rating.colorVar} 10%, transparent)`,
                }}
              >
                {rating.label}
              </span>
            </div>
            <div className="flex-1">
              <div className="h-2.5 w-full bg-muted/50 rounded-full overflow-hidden">
                <div
                  className={`h-full ${RATING_PROGRESS_COLORS[rating.label]} transition-all duration-500 rounded-full`}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
