'use client';

import { useState, useEffect, useMemo } from 'react';
import { isAssetAccount, isLiabilityAccount } from '@/lib/utils/account-scope';
import { formatCurrency } from '@/lib/utils/format';
import type { AccountData } from '@/lib/types/financial';

export function AssetAllocation() {
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
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm animate-pulse">
        <div className="h-4 bg-muted rounded w-28 mb-3" />
        <div className="h-2 bg-muted rounded-full" />
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-foreground mb-3">Asset Allocation</h3>
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
      <div className="flex justify-between mt-2">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-chart-1" />
          <span className="text-xs text-muted-foreground">Assets</span>
          <span className="text-xs font-medium text-foreground tabular-nums">{assetPct.toFixed(0)}%</span>
          <span className="text-xs text-muted-foreground tabular-nums">({formatCurrency(totals.totalAssets)})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-destructive" />
          <span className="text-xs text-muted-foreground">Liabilities</span>
          <span className="text-xs font-medium text-foreground tabular-nums">{liabilityPct.toFixed(0)}%</span>
          <span className="text-xs text-muted-foreground tabular-nums">({formatCurrency(totals.totalLiabilities)})</span>
        </div>
      </div>
    </div>
  );
}
