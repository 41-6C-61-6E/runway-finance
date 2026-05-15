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

// SVG defs layer — injects diagonal hatching pattern
function DefsLayer() {
  return (
    <defs>
      <pattern id="diagonal-hatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
        <rect width="6" height="6" fill="rgba(255,255,255,0.1)" />
        <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(255,255,255,0.4)" strokeWidth="1.2" />
      </pattern>
    </defs>
  );
}

// Hatching overlay layer — applies pattern to mortgage segments
function HatchingLayer(arcs: any) {
  if (!arcs || !arcs.length) return null;
  return (
    <>
      {arcs.map((arc: any) => {
        if (!arc.data.isMortgage) return null;
        return (
          <path
            key={`hatch-${arc.id}`}
            d={arc.path}
            fill="url(#diagonal-hatch)"
            stroke="none"
          />
        );
      })}
    </>
  );
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
            layers={[
              DefsLayer,
              'arcs',
              'arcLabelsLink',
              'arcLabels',
              'slices',
              HatchingLayer,
            ] as any}
            tooltip={({ datum }) => {
              const d = datum as unknown as ChartDatum;
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
                <div className="flex items-center justify-between text-xs mt-0.5 pl-4.5">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-sm" style={{
                      background: 'var(--color-muted-foreground)',
                    }} />
                    <span className="text-muted-foreground" style={{ fontSize: 10 }}>Mortgage</span>
                  </div>
                  <span className="font-mono text-muted-foreground blur-number" style={{ fontSize: 10 }}>
                    {formatCurrency(p.mortgageBalance)}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
