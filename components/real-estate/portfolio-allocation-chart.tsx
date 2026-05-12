'use client';

import { useState, useEffect } from 'react';
import { ResponsivePie } from '@nivo/pie';
import { formatCurrency } from '@/lib/utils/format';
import { nivoTheme } from '@/components/charts/shared-chart-theme';
import { ChartTooltip } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';

interface PropertyData {
  id: string;
  name: string;
  value: number;
}

interface RealEstateData {
  properties: PropertyData[];
}

export function PortfolioAllocationChart() {
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
        <div className="p-5 pb-2">
          <h3 className="text-sm font-semibold text-foreground">Portfolio Allocation</h3>
        </div>
        <div className="h-[300px] flex items-center justify-center text-muted-foreground">
          <div className="w-7 h-7 border-2 border-border border-t-primary rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Portfolio Allocation</h3>
        <ChartEmptyState variant="error" error={error} />
      </div>
    );
  }

  const properties = data?.properties ?? [];
  if (properties.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Portfolio Allocation</h3>
        <ChartEmptyState variant="nodata" />
      </div>
    );
  }

  const chartData = properties.map((p, i) => ({
    id: p.name,
    label: p.name,
    value: p.value,
    color: `var(--color-chart-${(i % 5) + 1})`,
  }));

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm">
      <div className="p-5 pb-2">
        <h3 className="text-sm font-semibold text-foreground">Portfolio Allocation</h3>
      </div>
      <div className="h-[300px] px-2 pb-2">
        <div className="financial-chart h-full">
          <ResponsivePie
            data={chartData}
            margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
            innerRadius={0.6}
            padAngle={1.5}
            cornerRadius={4}
            activeOuterRadiusOffset={4}
            borderWidth={1}
            borderColor={{ from: 'color', modifiers: [['darker', 0.3]] }}
            colors={{ datum: 'data.color' }}
            enableArcLinkLabels={false}
            enableArcLabels={false}
            theme={nivoTheme}
            tooltip={({ datum }) => (
              <ChartTooltip>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: datum.color }} />
                  <span style={{ fontWeight: 600, fontSize: 12 }}>{datum.label}</span>
                </div>
                <div style={{ fontSize: 12, marginTop: 4 }}>{formatCurrency(datum.value)}</div>
              </ChartTooltip>
            )}
          />
        </div>
      </div>
      <div className="px-5 pb-3 space-y-1.5">
        {chartData.map((d) => (
          <div key={d.id} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ background: d.color }} />
              <span className="text-muted-foreground">{d.label}</span>
            </div>
            <span className="font-mono text-foreground blur-number">{formatCurrency(d.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
