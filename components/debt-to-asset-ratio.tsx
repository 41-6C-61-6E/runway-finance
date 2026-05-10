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
      <div className="bg-slate-900 rounded-lg border border-slate-800 p-6 shadow-lg">
        <h3 className="text-lg font-semibold text-white mb-4">Debt to Asset Ratio</h3>
        <div className="animate-pulse space-y-4">
          <div className="h-12 bg-slate-800 rounded w-24"></div>
          <div className="h-8 bg-slate-800 rounded"></div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-slate-900 rounded-lg border border-slate-800 p-6 shadow-lg">
        <h3 className="text-lg font-semibold text-white mb-4">Debt to Asset Ratio</h3>
        <p className="text-sm text-slate-400">{error || 'No data available'}</p>
      </div>
    );
  }

  const getRatingColor = (rating: string) => {
    return 'text-gray-400';
  };

  const getProgressColor = (rating: string) => {
    switch (rating.toLowerCase()) {
      case 'excellent':
        return 'bg-emerald-500';
      case 'good':
        return 'bg-blue-500';
      case 'fair':
        return 'bg-yellow-500';
      case 'poor':
        return 'bg-orange-500';
      case 'critical':
        return 'bg-rose-500';
      default:
        return 'bg-slate-500';
    }
  };

  return (
    <div className="bg-slate-900 rounded-lg border border-slate-800 p-6 shadow-lg">
      <h3 className="text-lg font-semibold text-white mb-6">Debt to Asset Ratio</h3>

      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="text-5xl font-bold text-white financial-value">
            {Math.round(data.ratio * 100)}%
          </div>
          <div className={`text-xl font-semibold ${getRatingColor(data.rating)}`}>
            {data.rating}
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-2">
          <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden">
            <div
              className={`h-full ${getProgressColor(data.rating)} transition-all duration-500`}
              style={{ width: `${Math.min(data.ratio * 100, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-slate-400">
            <span>0%</span>
            <span>50%</span>
            <span>100%</span>
          </div>
        </div>

        {/* Message */}
        <p className="text-sm text-slate-300 mt-4">{data.message}</p>

        {/* Quick stats */}
        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-800">
          <div>
            <p className="text-xs text-slate-400 mb-1">Total Assets</p>
            <p className="text-lg font-semibold text-gray-400 financial-value">
              ${(data.totalAssets / 1000000).toFixed(2)}M
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-1">Total Liabilities</p>
            <p className="text-lg font-semibold text-gray-400 financial-value">
              ${(data.totalLiabilities / 1000000).toFixed(2)}M
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
