'use client';

import { useState, useEffect } from 'react';
import { formatCurrency } from '@/lib/utils/format';
import { Home, Banknote, Equal, Percent } from 'lucide-react';

interface Summary {
  totalValue: number;
  totalMortgage: number;
  totalEquity: number;
  overallLtv: number;
  propertyCount: number;
}

export function RealEstateSummary() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/real-estate', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => setSummary(data.summary))
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
  );
}
