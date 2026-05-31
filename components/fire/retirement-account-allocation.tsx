'use client';

import { useState, useEffect, useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { formatCurrency } from '@/lib/utils/format';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { isInvestmentAccount } from '@/lib/utils/account-scope';
import { TYPE_HIERARCHY } from '@/lib/constants/account-types';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { PieChart as PieIcon } from 'lucide-react';

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
  'HSA Account': '#22c55e',
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
  const [isCollapsed, setIsCollapsed] = useCardCollapsed('retirementAccountAllocation');
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
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <CollapsibleCardHeader
          isCollapsed={isCollapsed}
          onToggle={setIsCollapsed}
          title={
            <h3 className="text-sm sm:text-base font-bold text-foreground flex items-center gap-2">
              <PieIcon className="w-4 h-4 text-primary" /> Investment Account Allocation
            </h3>
          }
        />
        {!isCollapsed && <LoadingSpinner category="chart" className="h-[280px]" />}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <CollapsibleCardHeader
          isCollapsed={isCollapsed}
          onToggle={setIsCollapsed}
          title={
            <h3 className="text-sm sm:text-base font-bold text-foreground flex items-center gap-2">
              <PieIcon className="w-4 h-4 text-primary" /> Investment Account Allocation
            </h3>
          }
        />
        {!isCollapsed && (
          <div className="p-5">
            <ChartEmptyState variant="error" error={error} />
          </div>
        )}
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <CollapsibleCardHeader
          isCollapsed={isCollapsed}
          onToggle={setIsCollapsed}
          title={
            <h3 className="text-sm sm:text-base font-bold text-foreground flex items-center gap-2">
              <PieIcon className="w-4 h-4 text-primary" /> Investment Account Allocation
            </h3>
          }
        />
        {!isCollapsed && (
          <div className="px-5 pb-5">
            <div className="h-[280px]">
              <ChartEmptyState variant="nodata" description="Link investment accounts to see allocation" />
            </div>
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
          <h3 className="text-sm sm:text-base font-bold text-foreground flex items-center gap-2">
            <PieIcon className="w-4 h-4 text-primary" /> Investment Account Allocation
          </h3>
        }
      />
      {!isCollapsed && (
        <>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 100, height: 100 }}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="id"
                  cx="50%"
                  cy="50%"
                  innerRadius="55%"
                  outerRadius="80%"
                  paddingAngle={0.5}
                  cornerRadius={3}
                  stroke="none"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const datum = payload[0].payload;
                    return (
                      <ChartTooltip>
                        <TooltipHeader>{String(datum.id)}</TooltipHeader>
                        <TooltipRow label="Amount" value={formatCurrency(datum.value)} />
                        <TooltipRow label="Share" value={`${((datum.value / totalInvested) * 100).toFixed(1)}%`} />
                      </ChartTooltip>
                    );
                  }}
                />
                <Legend
                  verticalAlign="bottom"
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 10, color: 'var(--color-muted-foreground)', paddingTop: 10 }}
                />
              </PieChart>
            </ResponsiveContainer>
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
        </>
      )}
    </div>
  );
}
