'use client';

import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatCurrency, formatPercent } from '@/lib/utils/format';

type TimeFrame = '1m' | '3m' | '6m' | '1y' | '5y' | 'ytd' | 'all';

interface NetWorthDataPoint {
  date: string;
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
}

interface ChartSummary {
  current: number;
  previous: number;
  change: number;
  percentChange: number;
  includedAccounts: number;
  totalAccounts: number;
}

interface ChartResponse {
  data: NetWorthDataPoint[];
  summary: ChartSummary;
}

const timeframeOptions: { label: string; value: TimeFrame }[] = [
  { label: '1M', value: '1m' },
  { label: '3M', value: '3m' },
  { label: '6M', value: '6m' },
  { label: '1Y', value: '1y' },
  { label: '5Y', value: '5y' },
  { label: 'YTD', value: 'ytd' },
  { label: 'All', value: 'all' },
];

export function NetWorthChart() {
  const [timeframe, setTimeframe] = useState<TimeFrame>('1y');
  const [includeExcluded, setIncludeExcluded] = useState(false);
  const [data, setData] = useState<NetWorthDataPoint[]>([]);
  const [summary, setSummary] = useState<ChartSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const url = new URL('/api/net-worth/chart', window.location.origin);
        url.searchParams.set('timeframe', timeframe);
        url.searchParams.set('includeExcluded', includeExcluded.toString());

        const response = await fetch(url.toString());
        if (!response.ok) throw new Error('Failed to fetch chart data');

        const result: ChartResponse = await response.json();
        setData(result.data);
        setSummary(result.summary);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        console.error('Error fetching net worth data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [timeframe, includeExcluded]);

  const chartData = data.map((point) => ({
    date: new Date(point.date).toLocaleDateString('en-US', { 
      month: 'short',
      day: 'numeric',
      year: '2-digit'
    }),
    'Net Worth': point.netWorth,
    'Total Assets': point.totalAssets,
    'Total Liabilities': point.totalLiabilities,
  }));

  const isPositiveChange = summary ? summary.change >= 0 : false;

  return (
    <div className="w-full bg-card border border-border rounded-xl shadow-sm">
      {/* Header Section */}
      <div className="p-5 pb-3">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-sm font-medium text-muted-foreground mb-1">Net Worth</h2>
            <div className="flex items-baseline gap-2">
              <div className="text-3xl font-bold text-foreground blur-number">
                {summary ? formatCurrency(summary.current) : '$0'}
              </div>
            </div>
            {summary && (
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className={`text-sm font-semibold blur-number ${
                  isPositiveChange ? 'text-chart-1' : 'text-destructive'
                }`}>
                  {isPositiveChange ? '+' : ''}
                  {formatCurrency(summary.change)}
                </span>
                <span className={`text-xs blur-number ${
                  isPositiveChange ? 'text-chart-1' : 'text-destructive'
                }`}>
                  ({formatPercent(summary.percentChange)})
                </span>
                <span className="text-xs text-muted-foreground">
                  all time
                </span>
              </div>
            )}
          </div>

          {summary && (
            <div className="text-right">
              <div className="text-2xl font-bold text-primary">
                {summary.includedAccounts}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                of {summary.totalAccounts} accounts
              </p>
            </div>
          )}
        </div>

        {/* Timeframe Buttons */}
        <div className="flex flex-wrap gap-1.5">
          {timeframeOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => setTimeframe(option.value)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                timeframe === option.value
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      {loading ? (
        <div className="h-72 flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <div className="w-7 h-7 border-2 border-border border-t-primary rounded-full animate-spin mx-auto mb-2"></div>
            Loading chart...
          </div>
        </div>
      ) : error ? (
        <div className="h-72 flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <p className="font-medium mb-0.5">Unable to load chart</p>
            <p className="text-sm text-muted-foreground/70">{error}</p>
          </div>
        </div>
      ) : data.length === 0 ? (
        <div className="h-72 flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <p className="font-medium mb-0.5">No data available yet</p>
            <p className="text-xs text-muted-foreground/70">Charts will appear once you sync your accounts</p>
          </div>
        </div>
      ) : (
        <div className="h-72 px-2 pb-2">
          <div className="financial-chart h-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <CartesianGrid 
                  strokeDasharray="3 3" 
                  stroke="var(--color-border)" 
                  vertical={false}
                />
                <XAxis 
                  dataKey="date"
                  stroke="var(--color-muted-foreground)"
                  style={{ fontSize: '11px' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis 
                  stroke="var(--color-muted-foreground)"
                  style={{ fontSize: '11px' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => {
                    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
                    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
                    return `$${value}`;
                  }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--color-card)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '0.5rem',
                    boxShadow: '0 4px 12px var(--color-border)',
                  }}
                  labelStyle={{ color: 'var(--color-foreground)' }}
                  formatter={(value: number) => [formatCurrency(value), '']}
                  cursor={{ stroke: 'var(--color-ring)', strokeWidth: 1.5 }}
                />
                <Line
                  type="monotone"
                  dataKey="Net Worth"
                  stroke="var(--color-primary)"
                  strokeWidth={2.5}
                  dot={false}
                  isAnimationActive={true}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Stats Footer */}
      <div className="px-5 py-3 border-t border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-5">
            {summary && (
              <>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Total Assets</p>
                  <p className="text-sm font-semibold text-foreground blur-number">
                    {formatCurrency(summary.current + summary.change)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Avg Change</p>
                  <p className="text-sm font-semibold text-foreground blur-number">
                    {formatCurrency(data.length > 0 ? summary.change / data.length : 0)}
                  </p>
                </div>
              </>
            )}
          </div>
          
          <label className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors">
            <input
              type="checkbox"
              checked={includeExcluded}
              onChange={(e) => setIncludeExcluded(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-border bg-background text-primary cursor-pointer"
            />
            Include excluded
          </label>
        </div>
      </div>
    </div>
  );
}
