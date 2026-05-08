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

  // Format data for chart
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
    <div className="w-full overflow-hidden bg-slate-900 rounded-lg border border-slate-800 p-6 shadow-lg flex flex-col gap-6">
      {/* Header Section */}
      <div>
        <div className="flex items-start justify-between mb-6">
          <div className="flex-1">
            <h2 className="text-sm font-medium text-slate-400 mb-2">Your net worth</h2>
            <div className="flex items-baseline gap-2">
              <div className="text-4xl font-bold text-white">
                {summary ? formatCurrency(summary.current) : '$0'}
              </div>
            </div>
            {summary && (
              <div className="flex items-center gap-1 mt-3">
                <span
                  className={`text-sm font-semibold text-gray-400`}
                >
                  {isPositiveChange ? '+' : ''}
                  {formatCurrency(summary.change)}
                </span>
                <span
                  className={`text-xs text-gray-400`}
                >
                  ({formatPercent(summary.percentChange)})
                </span>
                <span className="text-xs text-slate-400">
                  All-time change
                </span>
              </div>
            )}
          </div>

          {/* Accounts Info */}
          {summary && (
            <div className="text-right ml-8">
              <div className="text-2xl font-bold text-blue-400">
                {summary.includedAccounts}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                of {summary.totalAccounts} accounts
              </p>
            </div>
          )}
        </div>

        {/* Timeframe Buttons */}
        <div className="flex flex-wrap gap-2">
          {timeframeOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => setTimeframe(option.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                timeframe === option.value
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      {loading ? (
        <div className="h-80 flex items-center justify-center text-slate-400">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin mx-auto mb-2"></div>
            Loading chart...
          </div>
        </div>
      ) : error ? (
        <div className="h-80 flex items-center justify-center text-gray-400">
          <div className="text-center">
            <p className="font-semibold mb-1">Unable to load chart</p>
            <p className="text-sm text-slate-400">{error}</p>
          </div>
        </div>
      ) : data.length === 0 ? (
        <div className="h-80 flex items-center justify-center text-slate-400">
          <div className="text-center">
            <p className="font-semibold mb-1">No data available yet</p>
            <p className="text-sm text-slate-500">Charts will appear once you sync your accounts</p>
          </div>
        </div>
      ) : (
        <div className="h-80 w-full overflow-hidden">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 40 }}>
              <CartesianGrid 
                strokeDasharray="3 3" 
                stroke="#334155" 
                vertical={false}
              />
              <XAxis 
                dataKey="date"
                stroke="#64748b"
                style={{ fontSize: '12px' }}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis 
                stroke="#64748b"
                style={{ fontSize: '12px' }}
                tickFormatter={(value) => {
                  if (value >= 1000000) {
                    return `$${(value / 1000000).toFixed(1)}M`;
                  }
                  if (value >= 1000) {
                    return `$${(value / 1000).toFixed(0)}K`;
                  }
                  return `$${value}`;
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #475569',
                  borderRadius: '0.5rem',
                  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
                }}
                labelStyle={{ color: '#cbd5e1' }}
                formatter={(value) => {
                  if (typeof value === 'number') {
                    return [formatCurrency(value), ''];
                  }
                  return value;
                }}
                cursor={{ stroke: '#3b82f6', strokeWidth: 2 }}
              />
              <Line
                type="monotone"
                dataKey="Net Worth"
                stroke="#3b82f6"
                strokeWidth={3}
                dot={false}
                isAnimationActive={true}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Stats Footer */}
      <div className="pt-4 border-t border-slate-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            {summary && (
              <>
                <div>
                  <p className="text-xs text-slate-400 mb-1">Total Assets</p>
                  <p className="text-lg font-semibold text-gray-400">
                    {formatCurrency(summary.current + summary.change)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 mb-1">Avg. Change</p>
                  <p className="text-lg font-semibold text-gray-400">
                    {formatCurrency(summary.change / Math.max(data.length, 1))}
                  </p>
                </div>
              </>
            )}
          </div>
          
          <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-400 hover:text-slate-300 transition-colors">
            <input
              type="checkbox"
              checked={includeExcluded}
              onChange={(e) => setIncludeExcluded(e.target.checked)}
              className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-600 cursor-pointer"
            />
            Include excluded accounts
          </label>
        </div>
      </div>
    </div>
  );
}
