'use client';

import { useState, useEffect } from 'react';
import { formatPercent } from '@/lib/utils/format';

interface RatioData {
  ratio: number;
  totalAssets: number;
  totalLiabilities: number;
  rating: string;
  message: string;
}

export function DebtToAssetRatio() {
  const [data, setData] = useState<RatioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch('/api/net-worth/debt-to-asset-ratio');
        if (!response.ok) throw new Error('Failed to fetch ratio data');
        const result = await response.json();
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        console.error('Error fetching debt to asset ratio:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground mb-4">Debt to Asset Ratio</h3>
        <div className="animate-pulse space-y-3">
          <div className="h-10 bg-muted rounded w-24"></div>
          <div className="h-6 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground mb-4">Debt to Asset Ratio</h3>
        <p className="text-sm text-muted-foreground">{error || 'No data available'}</p>
      </div>
    );
  }

  const getProgressColor = (rating: string) => {
    switch (rating.toLowerCase()) {
      case 'excellent': return 'bg-chart-1';
      case 'good': return 'bg-chart-4';
      case 'fair': return 'bg-chart-3';
      case 'poor': return 'bg-chart-5';
      case 'critical': return 'bg-destructive';
      default: return 'bg-muted-foreground';
    }
  };

  const getRatingHue = (rating: string) => {
    switch (rating.toLowerCase()) {
      case 'excellent': return 'text-chart-1';
      case 'good': return 'text-chart-4';
      case 'fair': return 'text-chart-3';
      case 'poor': return 'text-chart-5';
      case 'critical': return 'text-destructive';
      default: return 'text-muted-foreground';
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-foreground mb-4">Debt to Asset Ratio</h3>

      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="text-4xl font-bold text-foreground financial-value">
            {Math.round(data.ratio * 100)}%
          </div>
          <div className={`text-base font-semibold ${getRatingHue(data.rating)}`}>
            {data.rating}
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
            <div
              className={`h-full ${getProgressColor(data.rating)} transition-all duration-500 rounded-full`}
              style={{ width: `${Math.min(data.ratio * 100, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>0%</span>
            <span>50%</span>
            <span>100%</span>
          </div>
        </div>

        {/* Message */}
        <p className="text-sm text-muted-foreground">{data.message}</p>

        {/* Quick stats */}
        <div className="grid grid-cols-2 gap-4 pt-3 border-t border-border">
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Total Assets</p>
            <p className="text-sm font-semibold text-foreground financial-value">
              ${(data.totalAssets / 1000000).toFixed(2)}M
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Total Liabilities</p>
            <p className="text-sm font-semibold text-foreground financial-value">
              ${(data.totalLiabilities / 1000000).toFixed(2)}M
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
