'use client';

import { useState, useEffect, useCallback } from 'react';

export type ChartTimeRange = '1m' | '3m' | '6m' | '1y' | '5y' | 'ytd' | 'all';
export type ChartTypeOption = 'line' | 'bar';

type ChartDefaults = {
  defaultTimeRange: ChartTimeRange;
  defaultChartType: ChartTypeOption;
};

export function useChartDefaults() {
  const [defaults, setDefaults] = useState<ChartDefaults>({
    defaultTimeRange: '1y',
    defaultChartType: 'line',
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/user-settings', { credentials: 'include', cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        setDefaults({
          defaultTimeRange: (data.defaultChartTimeRange as ChartTimeRange) || '1y',
          defaultChartType: (data.defaultChartType as ChartTypeOption) || 'line',
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const updateDefaults = useCallback(
    async (next: Partial<ChartDefaults>) => {
      const prev = defaults;
      const merged = { ...defaults, ...next };
      setDefaults(merged);
      try {
        const body: Record<string, string> = {};
        if (next.defaultTimeRange !== undefined) body.defaultChartTimeRange = next.defaultTimeRange;
        if (next.defaultChartType !== undefined) body.defaultChartType = next.defaultChartType;
        const res = await fetch('/api/user-settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error('Failed to save');
      } catch {
        setDefaults(prev);
      }
    },
    [defaults]
  );

  return { defaults, loading, updateDefaults };
}
