'use client';

import { useState, useEffect, useCallback } from 'react';
import { applyChartColorScheme, resetChartColorScheme, CHART_COLOR_SCHEMES, type ChartColorSchemeId } from '@/lib/utils/chart-color-schemes';

export function useChartColorScheme() {
  const [scheme, setScheme] = useState<ChartColorSchemeId>('fauntleroy');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/user-settings', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        let s = (data.chartColorScheme as ChartColorSchemeId) || 'fauntleroy';
        if (!CHART_COLOR_SCHEMES[s]) {
          s = 'fauntleroy';
          fetch('/api/user-settings', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ chartColorScheme: s }),
          }).catch(() => {});
        }
        setScheme(s);
        applyChartColorScheme(s);
      })
      .catch(() => {
        applyChartColorScheme('fauntleroy');
      })
      .finally(() => setLoading(false));
  }, []);

  const updateScheme = useCallback(async (id: ChartColorSchemeId) => {
    setScheme(id);
    applyChartColorScheme(id);
    await fetch('/api/user-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ chartColorScheme: id }),
    });
  }, []);

  return { scheme, loading, updateScheme };
}
