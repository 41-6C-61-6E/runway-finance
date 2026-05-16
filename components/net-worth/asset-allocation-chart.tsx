'use client';

import { useState, useEffect, useMemo } from 'react';
import { ResponsiveBar } from '@nivo/bar';
import { ResponsivePie } from '@nivo/pie';
import { useRouter } from 'next/navigation';
import { formatCurrency } from '@/lib/utils/format';
import { nivoTheme } from '@/components/charts/shared-chart-theme';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { ChartTypeSelector, type ChartType } from '@/components/charts/chart-type-selector';
import { isAssetAccount, isLiabilityAccount } from '@/lib/utils/account-scope';

function formatTypeLabel(type: string): string {
  const map: Record<string, string> = {
    checking: 'Checking', savings: 'Savings', investment: 'Investment',
    brokerage: 'Brokerage', retirement: 'Retirement', realestate: 'Real Estate',
    vehicle: 'Vehicle', crypto: 'Crypto', metals: 'Metals', other: 'Other',
    otherAsset: 'Other Assets', credit: 'Credit', loan: 'Loan', mortgage: 'Mortgage',
  };
  return map[type] || type.charAt(0).toUpperCase() + type.slice(1);
}

interface AccountData {
  id: string;
  type: string;
  balance: string | number;
  name: string;
}

const typeOptions = [
  { value: 'bar' as ChartType, label: 'Bar' },
  { value: 'pie' as ChartType, label: 'Pie' },
];

export function AssetAllocationChart() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<AccountData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartType, setChartType] = useState<ChartType>('bar');

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

  const chartData = useMemo(() => {
    const totalsByType: Record<string, { assets: number; liabilities: number }> = {};
    for (const acc of accounts) {
      const balance = typeof acc.balance === 'string' ? parseFloat(acc.balance) : acc.balance;
      if (!totalsByType[acc.type]) totalsByType[acc.type] = { assets: 0, liabilities: 0 };
      if (isAssetAccount(acc.type)) {
        totalsByType[acc.type].assets += balance;
      } else if (isLiabilityAccount(acc.type)) {
        totalsByType[acc.type].liabilities += Math.abs(balance);
      }
    }
    return Object.entries(totalsByType)
      .sort(([, a], [, b]) => (b.assets + b.liabilities) - (a.assets + a.liabilities))
      .map(([type, vals]) => ({
        type: formatTypeLabel(type),
        rawType: type,
        assets: vals.assets,
        liabilities: vals.liabilities,
      }));
  }, [accounts]);

  const totalAssetsAll = chartData.reduce((s, d) => s + d.assets, 0);
  const totalLiabilitiesAll = chartData.reduce((s, d) => s + d.liabilities, 0);

  const pieData = chartData.flatMap((d) => [
    d.assets > 0 ? { id: `${d.type} (Assets)`, value: d.assets, color: 'var(--color-chart-1)', type: d.rawType } : null,
    d.liabilities > 0 ? { id: `${d.type} (Liabilities)`, value: d.liabilities, color: 'var(--color-destructive)', type: d.rawType } : null,
  ].filter(Boolean) as { id: string; value: number; color: string; type: string }[]);

  const handleClick = (accountType: string) => {
    router.push(`/transactions?accountTypes=${accountType}`);
  };

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground mb-3">Asset Allocation</h3>
        <div className="h-[300px] flex items-center justify-center text-muted-foreground">
          <div className="w-7 h-7 border-2 border-border border-t-primary rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground mb-3">Asset Allocation</h3>
        <ChartEmptyState variant="error" error={error} />
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground mb-3">Asset Allocation</h3>
        <div className="h-[300px]">
          <ChartEmptyState variant="nodata" description="No allocation data available" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Asset Allocation</h3>
        <div className="flex items-center gap-2">
          <ChartTypeSelector value={chartType} options={typeOptions} onChange={setChartType} />
        </div>
      </div>
      <div className="h-[300px]">
        {chartType === 'pie' ? (
          <ResponsivePie
            data={pieData}
            margin={{ top: 20, right: 80, bottom: 20, left: 80 }}
            innerRadius={0.4}
            padAngle={1}
            cornerRadius={3}
            colors={{ datum: 'data.color' }}
            borderWidth={1}
            borderColor={{ from: 'color', modifiers: [['darker', 0.2]] }}
            enableArcLinkLabels={false}
            enableArcLabels={false}
            theme={nivoTheme}
            onClick={(datum) => handleClick(datum.data.type)}
            tooltip={({ datum }) => (
              <ChartTooltip>
                <TooltipHeader>{String(datum.label)}</TooltipHeader>
                <TooltipRow label="Amount" value={formatCurrency(datum.value)} />
              </ChartTooltip>
            )}
            legends={[
              {
                anchor: 'bottom',
                direction: 'row',
                justify: false,
                translateY: 56,
                itemsSpacing: 0,
                itemWidth: 100,
                itemHeight: 18,
                itemDirection: 'left-to-right',
                itemOpacity: 1,
                symbolSize: 10,
                symbolShape: 'circle',
              },
            ]}
          />
        ) : (
          <ResponsiveBar
            data={chartData}
            keys={['assets', 'liabilities']}
            indexBy="type"
            layout="horizontal"
            groupMode="grouped"
            margin={{ top: 5, right: 80, left: 100, bottom: 5 }}
            padding={0.2}
            colors={['var(--color-chart-1)', 'var(--color-destructive)']}
            borderColor={{ from: 'color', modifiers: [['darker', 1.6]] }}
            enableLabel={false}
            axisLeft={{ tickSize: 0, tickPadding: 8 }}
            axisBottom={{
              tickSize: 0, tickPadding: 8,
              format: (v: number) => {
                if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
                if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
                return `$${v}`;
              },
            }}
            enableGridX={true}
            enableGridY={false}
            theme={nivoTheme}
            onClick={({ indexValue }) => handleClick(String(indexValue))}
            tooltip={({ id, value, indexValue }) => (
              <ChartTooltip>
                <TooltipHeader>{String(indexValue)}</TooltipHeader>
                <TooltipRow
                  label={id === 'assets' ? 'Assets' : 'Liabilities'}
                  value={formatCurrency(value)}
                />
              </ChartTooltip>
            )}
          />
        )}
      </div>
    </div>
  );
}
