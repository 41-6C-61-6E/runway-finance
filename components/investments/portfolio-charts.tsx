import React, { useState, useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { formatCurrency } from '@/lib/utils/format';
import { HoldingPosition, InvestmentAccountDetails } from '@/lib/services/investments';

interface ChartsProps {
  history: Array<{ date: string; value: number }>;
  accounts: InvestmentAccountDetails[];
}

const COLORS = [
  'hsl(var(--primary))',
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#3b82f6', // Blue
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#14b8a6', // Teal
  '#f43f5e', // Rose
  '#a855f7', // Violet
];

export function PortfolioCharts({ history, accounts }: ChartsProps) {
  const [timeRange, setTimeRange] = useState<'3m' | '6m' | '1y' | 'all'>('1y');
  const [allocationType, setAllocationType] = useState<'ticker' | 'sector' | 'assetClass' | 'account'>('ticker');

  // Filter and prepare history data based on time range
  const filteredHistory = useMemo(() => {
    if (history.length === 0) return [];

    const now = new Date();
    const cutoff = new Date();
    if (timeRange === '3m') cutoff.setMonth(now.getMonth() - 3);
    else if (timeRange === '6m') cutoff.setMonth(now.getMonth() - 6);
    else if (timeRange === '1y') cutoff.setFullYear(now.getFullYear() - 1);
    else return history; // 'all'

    const cutoffStr = cutoff.toISOString().split('T')[0];
    return history.filter((h) => h.date >= cutoffStr);
  }, [history, timeRange]);

  // Aggregate allocation data based on selected grouping type
  const allocationData = useMemo(() => {
    const dataMap = new Map<string, number>();
    
    accounts.forEach((acc) => {
      if (allocationType === 'account') {
        dataMap.set(acc.name, (dataMap.get(acc.name) || 0) + acc.totalComputedValue);
      } else {
        acc.holdings.forEach((h) => {
          let key = h.ticker;
          if (allocationType === 'sector') key = h.sector;
          else if (allocationType === 'assetClass') key = h.assetClass;
          
          dataMap.set(key, (dataMap.get(key) || 0) + h.currentValue);
        });
      }
    });

    const total = Array.from(dataMap.values()).reduce((sum, val) => sum + val, 0);

    return Array.from(dataMap.entries())
      .map(([name, value]) => ({
        name,
        value,
        percentage: total > 0 ? (value / total) * 100 : 0,
      }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [accounts, allocationType]);

  const formatXAxis = (tickItem: string) => {
    try {
      const parts = tickItem.split('-');
      if (parts.length < 3) return tickItem;
      const date = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    } catch {
      return tickItem;
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6 mb-6">
      {/* Historical Performance Line Chart */}
      <div className="lg:col-span-2 bg-card/40 backdrop-blur-md border border-border/50 rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col justify-between">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Portfolio History</h3>
            <p className="text-xs text-muted-foreground">Historical growth and valuation timeline</p>
          </div>
          {/* Time range controls */}
          <div className="flex bg-muted/40 p-1 rounded-xl self-start border border-border/30">
            {(['3m', '6m', '1y', 'all'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-3 py-1 text-xs font-medium rounded-lg capitalize transition-all duration-150 ${
                  timeRange === range
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {range}
              </button>
            ))}
          </div>
        </div>

        {filteredHistory.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center border border-dashed border-border/40 rounded-xl bg-muted/10">
            <p className="text-xs text-muted-foreground">No historical snapshot data found.</p>
            <p className="text-[10px] text-muted-foreground/60 mt-1">Add positions and sync to generate history.</p>
          </div>
        ) : (
          <div className="h-64 sm:h-72 w-full pr-1 font-mono text-[10px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={filteredHistory}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.04)" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatXAxis}
                  stroke="currentColor"
                  className="text-muted-foreground/40"
                  tickLine={false}
                  axisLine={false}
                  dy={10}
                />
                <YAxis
                  tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`}
                  stroke="currentColor"
                  className="text-muted-foreground/40"
                  tickLine={false}
                  axisLine={false}
                  dx={-5}
                />
                <Tooltip
                  cursor={{ stroke: 'hsl(var(--primary))', strokeWidth: 1, strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const item = payload[0].payload as { date: string; value: number };
                      return (
                        <div className="bg-popover/95 border border-border/60 rounded-xl p-3 shadow-lg backdrop-blur-md">
                          <p className="text-[10px] font-semibold text-muted-foreground mb-1">{item.date}</p>
                          <p className="text-xs font-bold text-foreground">{formatCurrency(item.value)}</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorValue)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Asset Allocation Donut Chart */}
      <div className="bg-card/40 backdrop-blur-md border border-border/50 rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col justify-between">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Asset Allocation</h3>
            <p className="text-xs text-muted-foreground">Diversification metrics</p>
          </div>
          {/* Allocation controls */}
          <select
            value={allocationType}
            onChange={(e) => setAllocationType(e.target.value as any)}
            className="px-2 py-1 text-xs bg-muted/40 border border-border/30 rounded-lg text-foreground focus:outline-none cursor-pointer"
          >
            <option value="ticker">By Holding</option>
            <option value="sector">By Sector</option>
            <option value="assetClass">By Asset Class</option>
            <option value="account">By Account</option>
          </select>
        </div>

        {allocationData.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center border border-dashed border-border/40 rounded-xl bg-muted/10">
            <p className="text-xs text-muted-foreground">No active assets found.</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="h-40 w-full relative flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={allocationData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {allocationData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="rgba(255,255,255,0.05)" />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const item = payload[0].payload as { name: string; value: number; percentage: number };
                        return (
                          <div className="bg-popover/95 border border-border/60 rounded-xl p-3 shadow-lg backdrop-blur-md text-xs">
                            <p className="font-semibold text-foreground mb-1">{item.name}</p>
                            <p className="text-muted-foreground">
                              {formatCurrency(item.value)} ({item.percentage.toFixed(1)}%)
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Total</span>
                <span className="text-sm font-bold text-foreground">
                  {formatCurrency(allocationData.reduce((sum, d) => sum + d.value, 0))}
                </span>
              </div>
            </div>

            {/* Custom Legend */}
            <div className="w-full max-h-32 overflow-y-auto space-y-1.5 px-2 bg-muted/10 py-2 rounded-xl border border-border/30">
              {allocationData.slice(0, 6).map((item, index) => (
                <div key={item.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 truncate pr-2">
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: COLORS[index % COLORS.length] }}
                    />
                    <span className="font-medium text-foreground truncate">{item.name}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono flex-shrink-0">
                    {item.percentage.toFixed(1)}%
                  </span>
                </div>
              ))}
              {allocationData.length > 6 && (
                <div className="text-[10px] text-muted-foreground italic text-center pt-0.5">
                  + {allocationData.length - 6} other positions
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
