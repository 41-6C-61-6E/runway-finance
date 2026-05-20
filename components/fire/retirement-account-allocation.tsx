'use client';

import { useState, useEffect, useMemo } from 'react';
import { ResponsivePie } from '@nivo/pie';
import { formatCurrency } from '@/lib/utils/format';
import { nivoTheme } from '@/components/charts/shared-chart-theme';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { isInvestmentAccount } from '@/lib/utils/account-scope';
import { TYPE_HIERARCHY } from '@/lib/constants/account-types';

const SUBGROUP_COLORS: Record<string, string> = {
  '401(k)': 'var(--color-chart-1)',
  '403(b)': 'var(--color-chart-2)',
  'Roth IRA': 'var(--color-chart-3)',
  'Traditional IRA': 'var(--color-chart-4)',
  'SEP IRA': 'var(--color-chart-5)',
  'Simple IRA': 'var(--color-chart-1)',
  'Taxable Brokerage': 'var(--color-chart-2)',
  'Other Investments': 'var(--color-chart-3)',
  'Retirement': 'var(--color-chart-4)',
  '529 Account': 'var(--color-chart-5)',
  'HSA': '#22c55e',
  'Health Accounts': '#22c55e',
};

function getSubGroup(type: string): string {
  return TYPE_HIERARCHY[type]?.subGroup || 'Other';
}

interface AccountData {
  id: string;
  type: string;
  balance: string | number;
  name: string;
}

export function RetirementAccountAllocation() {
  const [accounts, setAccounts] = useState<AccountData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch('/api/accounts');
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

  const investmentAccounts = useMemo(() => {
    return accounts.filter((a) => {
      const balance = typeof a.balance === 'string' ? parseFloat(a.balance) : a.balance;
      return isInvestmentAccount(a.type) && balance > 0;
    });
  }, [accounts]);

  const groups = useMemo(() => {
    const map = new Map<string, { total: number; accounts: AccountData[] }>();
    for (const acc of investmentAccounts) {
      const group = getSubGroup(acc.type);
      const balance = typeof acc.balance === 'string' ? parseFloat(acc.balance) : acc.balance;
      if (!map.has(group)) map.set(group, { total: 0, accounts: [] });
      const entry = map.get(group)!;
      entry.total += balance;
      entry.accounts.push(acc);
    }
    return Array.from(map.entries())
      .map(([label, data]) => ({ label, total: data.total, count: data.accounts.length }))
      .sort((a, b) => b.total - a.total);
  }, [investmentAccounts]);

  const totalInvested = groups.reduce((s, g) => s + g.total, 0);

  const pieData = groups.map((g, index) => ({
    id: g.label,
    value: g.total,
    color: `var(--chart-${(index % 5) + 1})`,
  }));

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground mb-3">Investment Account Allocation</h3>
        <div className="h-[280px] flex items-center justify-center text-muted-foreground">
          <div className="w-7 h-7 border-2 border-border border-t-primary rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground mb-3">Investment Account Allocation</h3>
        <ChartEmptyState variant="error" error={error} />
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground mb-3">Investment Account Allocation</h3>
        <div className="h-[280px]">
          <ChartEmptyState variant="nodata" description="Link investment accounts to see allocation" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm">
      <div className="p-5 pb-3">
        <h3 className="text-sm font-semibold text-foreground mb-1">Investment Account Allocation</h3>
        <p className="text-xs text-muted-foreground">
          {investmentAccounts.length} accounts &middot; {formatCurrency(totalInvested)} total
        </p>
      </div>
      <div className="h-[280px]">
        <ResponsivePie
          data={pieData}
          margin={{ top: 10, right: 100, bottom: 10, left: 100 }}
          innerRadius={0.55}
          padAngle={0.5}
          cornerRadius={3}
          colors={{ datum: 'data.color' }}
          borderWidth={0}
          enableArcLinkLabels={false}
          enableArcLabels={false}
          theme={nivoTheme}
          tooltip={({ datum }) => (
            <ChartTooltip>
              <TooltipHeader>{String(datum.label)}</TooltipHeader>
              <TooltipRow label="Amount" value={formatCurrency(datum.value)} />
              <TooltipRow label="Share" value={`${((datum.value / totalInvested) * 100).toFixed(1)}%`} />
            </ChartTooltip>
          )}
          legends={[
            {
              anchor: 'bottom',
              direction: 'row',
              justify: false,
              translateY: 40,
              itemsSpacing: 4,
              itemWidth: 120,
              itemHeight: 18,
              itemDirection: 'left-to-right',
              itemOpacity: 1,
              symbolSize: 10,
              symbolShape: 'circle',
            },
          ]}
        />
      </div>
      <div className="px-5 pb-4 pt-2 border-t border-border mt-2">
        <div className="space-y-1.5">
          {groups.map((g) => (
            <div key={g.label} className="flex justify-between text-xs">
              <span className="text-muted-foreground">{g.label}</span>
              <span className="text-foreground font-medium">
                {((g.total / totalInvested) * 100).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
