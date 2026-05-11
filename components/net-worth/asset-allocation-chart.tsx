'use client';

import { useState, useEffect, useMemo } from 'react';
import { ResponsiveBar } from '@nivo/bar';
import { formatCurrency } from '@/lib/utils/format';

const ASSET_TYPES = ['checking', 'savings', 'investment', 'other', 'brokerage', 'retirement', 'realestate', 'vehicle', 'crypto', 'metals', 'otherAsset'];
const LIABILITY_TYPES = ['credit', 'loan', 'mortgage'];

function formatTypeLabel(type: string): string {
  const map: Record<string, string> = {
    checking: 'Checking',
    savings: 'Savings',
    investment: 'Investment',
    brokerage: 'Brokerage',
    retirement: 'Retirement',
    realestate: 'Real Estate',
    vehicle: 'Vehicle',
    crypto: 'Crypto',
    metals: 'Metals',
    other: 'Other',
    otherAsset: 'Other Assets',
    credit: 'Credit',
    loan: 'Loan',
    mortgage: 'Mortgage',
  };
  return map[type] || type.charAt(0).toUpperCase() + type.slice(1);
}

interface AccountData {
  id: string;
  type: string;
  balance: string | number;
  name: string;
}

const nivoTheme = {
  background: 'transparent',
  text: { fill: 'var(--color-foreground)', fontSize: 11 },
  axis: {
    domain: { line: { stroke: 'var(--color-border)', strokeWidth: 1 } },
    ticks: { line: { stroke: 'var(--color-border)' }, text: { fill: 'var(--color-muted-foreground)' } },
  },
  grid: { line: { stroke: 'var(--color-border)', strokeDasharray: '3 3' } },
  tooltip: {
    container: {
      background: 'var(--color-card)',
      border: '1px solid var(--color-border)',
      borderRadius: '0.5rem',
      boxShadow: '0 4px 12px var(--color-border)',
      color: 'var(--color-foreground)',
      fontSize: '12px',
    },
  },
  legends: {
    text: { fill: 'var(--color-muted-foreground)', fontSize: 11 },
  },
};

export function AssetAllocationChart() {
  const [accounts, setAccounts] = useState<AccountData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch('/api/accounts?includeHidden=true');
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

      if (ASSET_TYPES.includes(acc.type)) {
        totalsByType[acc.type].assets += balance;
      } else if (LIABILITY_TYPES.includes(acc.type)) {
        totalsByType[acc.type].liabilities += Math.abs(balance);
      }
    }

    return Object.entries(totalsByType)
      .sort(([, a], [, b]) => (b.assets + b.liabilities) - (a.assets + a.liabilities))
      .map(([type, vals]) => ({
        type: formatTypeLabel(type),
        assets: vals.assets,
        liabilities: vals.liabilities,
      }));
  }, [accounts]);

  const totalAssetsAll = chartData.reduce((s, d) => s + d.assets, 0);
  const totalLiabilitiesAll = chartData.reduce((s, d) => s + d.liabilities, 0);

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground mb-3">Asset Allocation</h3>
        <div className="animate-pulse space-y-3">
          <div className="h-[300px] bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground mb-3">Asset Allocation</h3>
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground mb-3">Asset Allocation</h3>
        <p className="text-sm text-muted-foreground">No allocation data available</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-foreground mb-3">Asset Allocation</h3>
      <div className="h-[300px]">
        <ResponsiveBar
          data={chartData}
          keys={['assets', 'liabilities']}
          indexBy="type"
          layout="horizontal"
          groupMode="grouped"
          margin={{ top: 5, right: 80, left: 100, bottom: 5 }}
          padding={0.2}
          valueScale={{ type: 'linear' }}
          colors={['var(--color-chart-1)', 'var(--color-destructive)']}
          borderColor={{ from: 'color', modifiers: [['darker', 1.6]] }}
          enableLabel={true}
          label={(d) => {
            if (d.value === 0) return '';
            const grandTotal = d.id === 'assets' ? totalAssetsAll : totalLiabilitiesAll;
            const pct = grandTotal > 0 ? ((d.value / grandTotal) * 100).toFixed(1) : '0';
            const compact = d.value >= 1000000
              ? `$${(d.value / 1000000).toFixed(1)}M`
              : d.value >= 1000
                ? `$${(d.value / 1000).toFixed(0)}K`
                : `$${d.value.toFixed(0)}`;
            return `${compact} (${pct}%)`;
          }}
          labelTextColor={{ from: 'color', modifiers: [['darker', 2]] }}
          labelSkipWidth={40}
          labelSkipHeight={20}
          axisLeft={{
            tickSize: 0,
            tickPadding: 8,
          }}
          axisBottom={{
            tickSize: 0,
            tickPadding: 8,
            format: (v) => {
              if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
              if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
              return `$${v}`;
            },
          }}
          enableGridX={true}
          enableGridY={false}
          theme={nivoTheme}
          tooltip={({ id, value, indexValue }) => {
            const label = id === 'assets' ? 'Assets' : 'Liabilities';
            return (
              <div>
                <strong>{indexValue}</strong> — {label}<br />
                {formatCurrency(value)}
              </div>
            );
          }}
        />
      </div>
    </div>
  );
}
