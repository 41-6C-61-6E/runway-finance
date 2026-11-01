'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useUserSettings } from '@/components/user-settings-provider';
import { applyChartColorScheme, CHART_COLOR_SCHEMES, type ChartColorSchemeId } from '@/lib/utils/chart-color-schemes';

export function useChartColorScheme() {
  const userSettingsCtx = useUserSettings();

  const [localScheme, setLocalScheme] = useState<ChartColorSchemeId>('fauntleroy');
  const [localLoading, setLocalLoading] = useState(!userSettingsCtx);

  useEffect(() => {
    if (userSettingsCtx) return;
    fetch('/api/user-settings', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        let s = (data?.chartColorScheme as ChartColorSchemeId) || 'fauntleroy';
        if (!CHART_COLOR_SCHEMES[s]) {
          s = 'fauntleroy';
          fetch('/api/user-settings', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ chartColorScheme: s }),
          }).catch(() => {});
        }
        setLocalScheme(s);
        applyChartColorScheme(s);
      })
      .catch(() => {
        applyChartColorScheme('fauntleroy');
      })
      .finally(() => setLocalLoading(false));
  }, [userSettingsCtx]);

  const scheme = useMemo(() => {
    if (userSettingsCtx) {
      const s = userSettingsCtx.settings?.chartColorScheme as ChartColorSchemeId;
      return CHART_COLOR_SCHEMES[s] ? s : 'fauntleroy';
    }
    return localScheme;
  }, [userSettingsCtx, userSettingsCtx?.settings?.chartColorScheme, localScheme]);

  const loading = userSettingsCtx ? userSettingsCtx.loading : localLoading;

  useEffect(() => {
    applyChartColorScheme(scheme);
  }, [scheme]);

  const updateScheme = useCallback(
    async (id: ChartColorSchemeId) => {
      const validId = CHART_COLOR_SCHEMES[id] ? id : 'fauntleroy';
      applyChartColorScheme(validId);

      if (userSettingsCtx) {
        await userSettingsCtx.updateSetting('chartColorScheme', validId);
        return;
      }

      setLocalScheme(validId);
      await fetch('/api/user-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ chartColorScheme: validId }),
      }).catch(() => {});
    },
    [userSettingsCtx]
  );

  return { scheme, loading, updateScheme };
}

export function useChartColors() {
  const { scheme, loading, updateScheme } = useChartColorScheme();

  const getSeriesColorByIndex = useCallback((index: number) => {
    const chartNum = (index % 5) + 1;
    return `var(--chart-${chartNum})`;
  }, []);

  return {
    scheme,
    loading,
    updateScheme,
    getSeriesColor: getSeriesColorByIndex,
    chart1: 'var(--chart-1)',
    chart2: 'var(--chart-2)',
    chart3: 'var(--chart-3)',
    chart4: 'var(--chart-4)',
    chart5: 'var(--chart-5)',
    constructive: 'var(--constructive)',
    destructive: 'var(--destructive)',
  };
}
