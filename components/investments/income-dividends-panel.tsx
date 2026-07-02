'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { formatCurrency } from '@/lib/utils/format';
import { formatChartYAxisCurrency, formatChartXAxisDate } from '@/lib/utils/chart-format';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { ChartTooltip, TooltipHeader, TooltipRow } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { CircleDollarSign, TrendingUp, Calendar } from 'lucide-react';
import type { TransactionType } from '@/app/api/investments/income/route';

interface MonthlyIncome {
  month: string; // "YYYY-MM"
  total: number;
}

interface IncomeDividendsPanelProps {
  monthlyIncome: MonthlyIncome[];
  totalAnnualIncome: number;
  loading?: boolean;
}

function formatMonth(ym: string): string {
  return formatChartXAxisDate(ym + '-01', 'all', { isMonthly: true });
}

export function IncomeDividendsPanel({
  monthlyIncome,
  totalAnnualIncome,
  loading,
}: IncomeDividendsPanelProps) {
  const [isCollapsed, setIsCollapsed] = useCardCollapsed('incomeDividends');
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const chartData = useMemo(() => {
    return monthlyIncome.slice(-12).map((m) => ({
      month: formatMonth(m.month),
      total: m.total,
    }));
  }, [monthlyIncome]);

  const avgMonthly = chartData.length > 0
    ? chartData.reduce((sum, d) => sum + d.total, 0) / chartData.length
    : 0;

  const maxBar = chartData.length > 0 ? Math.max(...chartData.map((d) => d.total)) : 0;

  const formatYTick = useCallback((v: number) => {
    return formatChartYAxisCurrency(v, 0, maxBar * 1.1);
  }, [maxBar]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    return (
      <ChartTooltip>
        <TooltipHeader>{d.month}</TooltipHeader>
        <TooltipRow label="Income" value={formatCurrency(d.total)} color="var(--color-chart-1)" />
      </ChartTooltip>
    );
  };

  const headerEl = (
    <div className="flex items-center gap-2">
      <CircleDollarSign className="w-4 h-4 text-primary shrink-0" />
      <span>Dividend & Interest Income</span>
    </div>
  );

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm h-full">
      <CollapsibleCardHeader isCollapsed={isCollapsed} onToggle={setIsCollapsed} title={headerEl} />

      {!isCollapsed && (
        <div className="p-4 sm:p-5">
          {loading ? (
            <LoadingSpinner category="chart" className="h-[180px]" />
          ) : monthlyIncome.length === 0 ? (
            <ChartEmptyState
              variant="nodata"
              description="No dividend or interest income found in investment accounts. Income will appear here once transactions are classified."
            />
          ) : (
            <div className="space-y-5">
              {/* Summary stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-muted/30 border border-border/60">
                  <div className="flex items-center gap-1.5 mb-1">
                    <TrendingUp className="w-3.5 h-3.5 text-chart-1 shrink-0" />
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">12-Month Total</span>
                  </div>
                  <div className="text-lg font-bold text-foreground blur-number">{formatCurrency(totalAnnualIncome)}</div>
                </div>
                <div className="p-3 rounded-lg bg-muted/30 border border-border/60">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Calendar className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Monthly Avg</span>
                  </div>
                  <div className="text-lg font-bold text-foreground blur-number">{formatCurrency(avgMonthly)}</div>
                </div>
              </div>

              {/* Bar chart */}
              <div>
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Monthly Income (last 12 months)
                </div>
                <div className="h-[140px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }} barSize={16}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} opacity={0.3} />
                      <XAxis
                        dataKey="month"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: 'var(--color-muted-foreground)', fontSize: 10 }}
                        interval={isMobile ? 1 : 0}
                        minTickGap={30}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: 'var(--color-muted-foreground)', fontSize: 10 }}
                        tickFormatter={formatYTick}
                      />
                      <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: 'var(--color-muted-foreground)', opacity: 0.08 }} />
                      <Bar dataKey="total" radius={[3, 3, 0, 0]}>
                        {chartData.map((entry, idx) => (
                          <Cell
                            key={idx}
                            fill={entry.total === maxBar ? 'var(--color-chart-1)' : 'var(--color-chart-1)'}
                            fillOpacity={entry.total === maxBar ? 1 : 0.55}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
