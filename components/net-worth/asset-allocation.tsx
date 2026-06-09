'use client';

import { useState, useEffect, useMemo } from 'react';
import { isAssetAccount, isLiabilityAccount } from '@/lib/utils/account-scope';
import { formatCurrency } from '@/lib/utils/format';
import type { AccountData } from '@/lib/types/financial';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { PieChart } from 'lucide-react';

export function AssetAllocation() {
  const [isCollapsed, setIsCollapsed] = useCardCollapsed('assetAllocation');
  const [accounts, setAccounts] = useState<AccountData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/accounts', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => setAccounts(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const totals = useMemo(() => {
    let totalAssets = 0;
    let totalLiabilities = 0;
    for (const acc of accounts) {
      const balance = typeof acc.balance === 'string' ? parseFloat(acc.balance) : acc.balance;
      if (isAssetAccount(acc.type)) totalAssets += balance;
      else if (isLiabilityAccount(acc.type)) totalLiabilities += Math.abs(balance);
    }
    return { totalAssets, totalLiabilities };
  }, [accounts]);

  const combined = totals.totalAssets + totals.totalLiabilities;
  const assetPct = combined > 0 ? (totals.totalAssets / combined) * 100 : 0;
  const liabilityPct = combined > 0 ? (totals.totalLiabilities / combined) * 100 : 0;

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <CollapsibleCardHeader
          isCollapsed={isCollapsed}
          onToggle={setIsCollapsed}
          title={
            <div className="flex items-center gap-2">
              <PieChart className="w-4 h-4 text-primary shrink-0" />
              <span>Asset Allocation</span>
            </div>
          }
        />
        {!isCollapsed && (
          <div className="p-5 animate-pulse">
            <div className="h-2 bg-muted rounded-full w-full" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm">
      <CollapsibleCardHeader
        isCollapsed={isCollapsed}
        onToggle={setIsCollapsed}
        title={
          <div className="flex items-center gap-2">
            <PieChart className="w-4 h-4 text-primary shrink-0" />
            <span>Asset Allocation</span>
          </div>
        }
      />
      {!isCollapsed && (
        <div className="p-5">
          <div className="w-full bg-muted rounded-full h-3 overflow-hidden flex">
            <div
              className="bg-chart-1 h-full transition-all"
              style={{ width: `${assetPct}%` }}
            />
            <div
              className="bg-destructive h-full transition-all"
              style={{ width: `${liabilityPct}%` }}
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:flex-row sm:justify-between sm:gap-2 mt-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-chart-1" />
              <span className="text-xs text-muted-foreground">Assets:</span>
              <span className="text-xs font-semibold text-foreground tabular-nums">{assetPct.toFixed(0)}%</span>
              <span className="text-xs text-muted-foreground tabular-nums financial-value">({formatCurrency(totals.totalAssets)})</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-destructive" />
              <span className="text-xs text-muted-foreground">Liabilities:</span>
              <span className="text-xs font-semibold text-foreground tabular-nums">{liabilityPct.toFixed(0)}%</span>
              <span className="text-xs text-muted-foreground tabular-nums financial-value">({formatCurrency(totals.totalLiabilities)})</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
