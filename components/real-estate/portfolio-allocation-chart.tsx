'use client';

import { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { formatCurrency } from '@/lib/utils/format';
import { ChartTooltip } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { PieChart as PieIcon } from 'lucide-react';

interface PropertyData {
  id: string;
  name: string;
  value: number;
  mortgageBalance: number;
}

interface RealEstateData {
  properties: PropertyData[];
}

interface ChartDatum {
  id: string;
  label: string;
  value: number;
  color: string;
  isMortgage: boolean;
  propertyId: string;
  propertyName: string;
  mortgageBalance?: number;
}

export function PortfolioAllocationChart() {
  const [isCollapsed, setIsCollapsed] = useCardCollapsed('portfolioAllocationChart');
  const [data, setData] = useState<RealEstateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/real-estate', { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch');
        return res.json();
      })
      .then((d) => setData(d))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <CollapsibleCardHeader
          isCollapsed={isCollapsed}
          onToggle={setIsCollapsed}
          title={
            <h3 className="text-sm sm:text-base font-normal text-foreground flex items-center gap-2">
              <PieIcon className="w-4 h-4 text-primary" /> Portfolio Allocation
            </h3>
          }
        />
        {!isCollapsed && <LoadingSpinner category="chart" className="h-[300px]" />}
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
            <h3 className="text-sm sm:text-base font-normal text-foreground flex items-center gap-2">
              <PieIcon className="w-4 h-4 text-primary" /> Portfolio Allocation
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

  const properties = data?.properties ?? [];
  if (properties.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <CollapsibleCardHeader
          isCollapsed={isCollapsed}
          onToggle={setIsCollapsed}
          title={
            <h3 className="text-sm sm:text-base font-normal text-foreground flex items-center gap-2">
              <PieIcon className="w-4 h-4 text-primary" /> Portfolio Allocation
            </h3>
          }
        />
        {!isCollapsed && (
          <div className="p-5">
            <ChartEmptyState variant="nodata" />
          </div>
        )}
      </div>
    );
  }

  const chartData: ChartDatum[] = [];
  for (const p of properties) {
    const equity = p.value - p.mortgageBalance;
    const baseColor = `var(--color-chart-${(properties.indexOf(p) % 5) + 1})`;
    if (equity > 0) {
      chartData.push({
        id: `${p.id}-equity`,
        label: p.name,
        value: equity,
        color: baseColor,
        isMortgage: false,
        propertyId: p.id,
        propertyName: p.name,
      });
    }
    if (p.mortgageBalance > 0) {
      chartData.push({
        id: `${p.id}-mortgage`,
        label: `${p.name} (Mortgage)`,
        value: p.mortgageBalance,
        color: 'var(--color-muted-foreground)',
        isMortgage: true,
        propertyId: p.id,
        propertyName: p.name,
        mortgageBalance: p.mortgageBalance,
      });
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm">
      <CollapsibleCardHeader
        isCollapsed={isCollapsed}
        onToggle={setIsCollapsed}
        title={
          <h3 className="text-sm sm:text-base font-normal text-foreground flex items-center gap-2">
            <PieIcon className="w-4 h-4 text-primary" /> Portfolio Allocation
          </h3>
        }
      />

      {!isCollapsed && (
        <>
          <div className="h-[300px] px-2 pb-2">
            <div className="h-full">
              <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 100, height: 100 }}>
                <PieChart>
                  <defs>
                    <pattern id="diagonal-hatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
                      <rect width="6" height="6" fill="var(--color-muted-foreground)" fillOpacity={0.5} />
                      <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(255,255,255,0.4)" strokeWidth="1.2" />
                    </pattern>
                  </defs>
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="id"
                    cx="50%"
                    cy="50%"
                    innerRadius="60%"
                    outerRadius="80%"
                    paddingAngle={0.5}
                    cornerRadius={4}
                    stroke="none"
                  >
                    {chartData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.isMortgage ? 'url(#diagonal-hatch)' : entry.color}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const d = payload[0].payload as ChartDatum;
                      return (
                        <ChartTooltip>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: d.color }} />
                            <span style={{ fontWeight: 600, fontSize: 12 }}>{d.label}</span>
                          </div>
                          <div style={{ fontSize: 12, marginTop: 4 }}>{formatCurrency(d.value)}</div>
                          {d.isMortgage && (
                            <div style={{ fontSize: 11, marginTop: 2, fontStyle: 'italic', opacity: 0.7 }}>
                              Mortgaged amount
                            </div>
                          )}
                        </ChartTooltip>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="px-5 pb-3 space-y-1.5">
            {properties.map((p, i) => {
              const baseColor = `var(--color-chart-${(i % 5) + 1})`;
              const equity = p.value - p.mortgageBalance;
              return (
                <div key={p.id}>
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-sm" style={{ background: baseColor }} />
                      <span className="text-muted-foreground">{p.name}</span>
                    </div>
                    <span className="font-mono text-foreground blur-number">{formatCurrency(p.value)}</span>
                  </div>
                  {p.mortgageBalance > 0 && (
                    <div className="flex items-center justify-between text-xs mt-0.5">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-sm" style={{
                          background: 'var(--color-muted-foreground)',
                        }} />
                        <span className="text-muted-foreground">Mortgage</span>
                      </div>
                      <span className="font-mono text-muted-foreground blur-number">
                        {formatCurrency(p.mortgageBalance)}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
