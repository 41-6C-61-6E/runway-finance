'use client';

import { useState, useEffect } from 'react';
import { formatCurrency } from '@/lib/utils/format';
import { useSyntheticData } from '@/lib/hooks/use-synthetic-data';
import { Home, Banknote, Equal, Percent } from 'lucide-react';

interface Summary {
  totalValue: number;
  totalMortgage: number;
  totalEquity: number;
  overallLtv: number;
  propertyCount: number;
}

export function RealEstateSummary() {
  const { isEnabled } = useSyntheticData();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [hasEstimated, setHasEstimated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/real-estate', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        setSummary(data.summary);
        const hasEst = (data.properties ?? []).some((p: { snapshots?: Array<{ isSynthetic?: boolean }> }) =>
          (p.snapshots ?? []).some((s) => s.isSynthetic)
        );
        setHasEstimated(hasEst);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-4 animate-pulse">
            <div className="h-3 w-16 bg-muted rounded mb-3" />
            <div className="h-6 w-24 bg-muted rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (!summary || summary.propertyCount === 0) return null;

  const cards = [
    { label: 'Total Value', value: formatCurrency(summary.totalValue), icon: Home, color: 'text-chart-1' },
    { label: 'Total Mortgage', value: formatCurrency(summary.totalMortgage), icon: Banknote, color: 'text-chart-4' },
    { label: 'Total Equity', value: formatCurrency(summary.totalEquity), icon: Equal, color: 'text-chart-2' },
    { label: 'LTV Ratio', value: `${summary.overallLtv.toFixed(1)}%`, icon: Percent, color: summary.overallLtv > 80 ? 'text-destructive' : summary.overallLtv > 60 ? 'text-chart-3' : 'text-chart-1' },
  ];

  return (
    <div>
      {isEnabled('realEstate') && hasEstimated && (
        <div className="flex items-center gap-1.5 mb-3">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-chart-3/10 border border-chart-3/20">
            <span className="w-1.5 h-0.5 bg-chart-3 rounded-full" style={{ textDecorationStyle: 'dashed' }} />
            <span className="text-[10px] text-chart-3 font-medium">Some values are estimated</span>
          </span>
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div key={card.label} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <Icon className={`w-4 h-4 ${card.color}`} />
              <span className="text-xs text-muted-foreground">{card.label}</span>
            </div>
            <div className={`font-mono text-lg font-bold text-foreground blur-number`}>{card.value}</div>
          </div>
        );
      })}
    </div>
    </div>
  );
}
