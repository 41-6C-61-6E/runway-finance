'use client';

import { useState, useEffect, useCallback } from 'react';
import { applyChartColorScheme, resetChartColorScheme, type ChartColorSchemeId } from '@/lib/utils/chart-color-schemes';

export function useChartColorScheme() {
  const [scheme, setScheme] = useState<ChartColorSchemeId>('forest');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/user-settings', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        const s = (data.chartColorScheme as ChartColorSchemeId) || 'forest';
        setScheme(s);
        applyChartColorScheme(s);
      })
      .catch(() => {
        applyChartColorScheme('forest');
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
