'use client';

import { useMemo, useState, useEffect } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { formatCurrency } from '@/lib/utils/format';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { ChartTypeSelector, type ChartType } from '@/components/charts/chart-type-selector';
import type { ProjectionResult, MonteCarloResult } from '@/lib/services/retirement';
import { usePersistentState } from '@/lib/hooks/use-persistent-state';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { CollapsibleFilterPanel } from '@/components/ui/collapsible-filter-panel';
import { TrendingUp } from 'lucide-react';

const typeOptions = [
  { value: 'line' as ChartType, label: 'Line' },
  { value: 'bar' as ChartType, label: 'Bar' },
];

export function RetirementRunwayChart({
  projection,
  monteCarlo,
}: {
  projection: ProjectionResult;
  monteCarlo?: MonteCarloResult;
}) {
  const [chartType, setChartType] = usePersistentState<ChartType>('finance:retirement-runway:chartType', 'line');
  const [isCollapsed, setIsCollapsed] = useCardCollapsed('retirementRunwayChart');
  const [showFilters, setShowFilters] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const chartData = useMemo(() => {
    return projection.years.map((y, idx) => {
      const dataPoint: any = {
        age: String(y.age),
        'Portfolio Balance': y.endBalance,
        Depleted: 0,
      };

      if (monteCarlo) {
        const medianP = monteCarlo.medianPath[idx];
        const p10P = monteCarlo.p10Path[idx];
        const p90P = monteCarlo.p90Path[idx];
        if (medianP) dataPoint['Median (MC)'] = medianP.balance;
        if (p10P) dataPoint['P10 (MC)'] = p10P.balance;
        if (p90P) dataPoint['P90 (MC)'] = p90P.balance;
      }
      return dataPoint;
    });
  }, [projection, monteCarlo]);

  const maxY = Math.max(
    ...projection.years.map((y) => y.endBalance),
    monteCarlo ? Math.max(...monteCarlo.p90Path.map((p) => p.balance)) : 0,
    1000,
  );

  if (projection.years.length < 2) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <CollapsibleCardHeader
          isCollapsed={isCollapsed}
          onToggle={setIsCollapsed}
          title={
            <h3 className="text-sm sm:text-base font-normal text-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" /> Retirement Runway
            </h3>
          }
        />
        {!isCollapsed && (
          <div className="px-5 pb-5">
            <div className="h-[400px]">
              <ChartEmptyState variant="insufficient" description="Adjust retirement assumptions to see projections" />
            </div>
          </div>
        )}
      </div>
    );
  }

  const xInterval = projection.years.length > 40 ? Math.max(4, Math.floor(projection.years.length / 8)) : 0;

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm">
      <CollapsibleCardHeader
        isCollapsed={isCollapsed}
        onToggle={setIsCollapsed}
        title={
          <h3 className="text-sm sm:text-base font-normal text-foreground flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" /> Retirement Runway
          </h3>
        }
      />
      {!isCollapsed && (
        <>
          <CollapsibleFilterPanel
            isOpen={showFilters}
            onToggle={() => setShowFilters(!showFilters)}
            feedback={
              <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider">
                {chartType.toUpperCase()}
              </span>
            }
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mr-1">Style</span>
              <ChartTypeSelector value={chartType} options={typeOptions} onChange={setChartType} />
            </div>
          </CollapsibleFilterPanel>
          <div className="px-5 pb-5 mt-4">
          <div className="h-[400px]">
            {chartType === 'bar' ? (
              <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 100, height: 100 }}>
                <BarChart
                  data={projection.years.map((y) => ({ age: String(y.age), balance: y.endBalance }))}
                  margin={{ top: 10, right: 10, left: 10, bottom: isMobile ? 10 : 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} horizontal={true} />
                  <XAxis
                    dataKey="age"
                    tickLine={false}
                    axisLine={{ stroke: 'var(--color-border)' }}
                    tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                    interval={xInterval}
                    label={isMobile ? undefined : { value: 'Age', position: 'insideBottom', offset: -5, fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                    width={65}
                    tickFormatter={(v: number) => {
                      if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
                      if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
                      return `$${v}`;
                    }}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const item = payload[0].payload;
                      return (
                        <ChartTooltip>
                          <TooltipHeader>Age {item.age}</TooltipHeader>
                          <TooltipRow label="Portfolio" value={formatCurrency(item.balance)} />
                        </ChartTooltip>
                      );
                    }}
                    cursor={{ fill: 'var(--color-border)', opacity: 0.15 }}
                  />
                  <Bar
                    dataKey="balance"
                    fill={projection.success ? 'var(--color-chart-1)' : 'var(--color-destructive)'}
                    radius={[2, 2, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 100, height: 100 }}>
                <LineChart
                  data={chartData}
                  margin={{
                    top: 10,
                    right: isMobile ? 10 : (monteCarlo ? 120 : 30),
                    left: 10,
                    bottom: isMobile ? (monteCarlo ? 45 : 20) : 20
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={true} horizontal={true} />
                  <XAxis
                    dataKey="age"
                    tickLine={false}
                    axisLine={{ stroke: 'var(--color-border)' }}
                    tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                    interval={xInterval}
                    label={isMobile ? undefined : { value: 'Age', position: 'insideBottom', offset: -5, fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                    width={65}
                    tickFormatter={(v: number) => {
                      if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
                      if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
                      return `$${v}`;
                    }}
                    domain={[0, Math.ceil(maxY * 1.1)]}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload || !payload.length) return null;
                      return (
                        <ChartTooltip>
                          <TooltipHeader>Age {label}</TooltipHeader>
                          {payload.map((p) => (
                            <TooltipRow
                              key={p.name}
                              label={String(p.name)}
                              value={formatCurrency(Number(p.value))}
                              color={p.color}
                            />
                          ))}
                        </ChartTooltip>
                      );
                    }}
                  />
                  {monteCarlo && (
                    <Legend
                      layout={isMobile ? "horizontal" : "vertical"}
                      align={isMobile ? "center" : "right"}
                      verticalAlign={isMobile ? "bottom" : "top"}
                      wrapperStyle={isMobile ? { fontSize: 10, paddingTop: 10, position: 'relative' } : { right: 0, paddingLeft: 10, fontSize: 12 }}
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="Portfolio Balance"
                    stroke="var(--color-primary)"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="Depleted"
                    stroke="var(--color-destructive)"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={false}
                    connectNulls
                  />
                  {monteCarlo && (
                    <>
                      <Line
                        type="monotone"
                        dataKey="Median (MC)"
                        stroke="var(--color-chart-3)"
                        strokeWidth={2}
                        dot={false}
                        connectNulls
                      />
                      <Line
                        type="monotone"
                        dataKey="P10 (MC)"
                        stroke="var(--color-chart-2)"
                        strokeWidth={2}
                        dot={false}
                        connectNulls
                      />
                      <Line
                        type="monotone"
                        dataKey="P90 (MC)"
                        stroke="var(--color-chart-1)"
                        strokeWidth={2}
                        dot={false}
                        connectNulls
                      />
                    </>
                  )}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        </>
      )}
    </div>
  );
}
