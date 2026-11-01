'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useUserSettings } from '@/components/user-settings-provider';

export type ChartTimeRange = '1m' | '3m' | '6m' | '1y' | '5y' | 'ytd' | 'all';
export type ChartTypeOption = 'line' | 'bar';
export type ForecastModeOption = 'hybrid' | 'historical' | 'budget';

type ChartDefaults = {
  defaultTimeRange: ChartTimeRange;
  defaultChartType: ChartTypeOption;
  forecastMode: ForecastModeOption;
  forecastLookbackMonths: number;
};

export const DEFAULT_CHART_DEFAULTS: ChartDefaults = {
  defaultTimeRange: '1y',
  defaultChartType: 'line',
  forecastMode: 'hybrid',
  forecastLookbackMonths: 3,
};

export const chartGridDefaults = {
  strokeDasharray: '3 3',
  stroke: 'var(--color-border)',
  vertical: false,
  opacity: 0.3,
} as const;

export const chartXAxisDefaults = {
  tick: { fontSize: 11, fill: 'var(--color-muted-foreground)' },
  tickLine: false,
  axisLine: false,
} as const;

export const chartYAxisDefaults = {
  tick: { fontSize: 11, fill: 'var(--color-muted-foreground)' },
  tickLine: false,
  axisLine: false,
} as const;

export function useChartDefaults() {
  const userSettingsCtx = useUserSettings();

  const [localDefaults, setLocalDefaults] = useState<ChartDefaults>(DEFAULT_CHART_DEFAULTS);
  const [localLoading, setLocalLoading] = useState(!userSettingsCtx);

  useEffect(() => {
    if (userSettingsCtx) return;
    fetch('/api/user-settings', { credentials: 'include', cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        setLocalDefaults({
          defaultTimeRange: (data?.defaultChartTimeRange as ChartTimeRange) || '1y',
          defaultChartType: (data?.defaultChartType as ChartTypeOption) || 'line',
          forecastMode: (data?.forecastMode as ForecastModeOption) || 'hybrid',
          forecastLookbackMonths: typeof data?.forecastLookbackMonths === 'number' ? data.forecastLookbackMonths : 3,
        });
      })
      .catch(() => {})
      .finally(() => setLocalLoading(false));
  }, [userSettingsCtx]);

  const defaults = useMemo<ChartDefaults>(() => {
    if (userSettingsCtx) {
      const data = userSettingsCtx.settings || {};
      return {
        defaultTimeRange: (data.defaultChartTimeRange as ChartTimeRange) || '1y',
        defaultChartType: (data.defaultChartType as ChartTypeOption) || 'line',
        forecastMode: (data.forecastMode as ForecastModeOption) || 'hybrid',
        forecastLookbackMonths: typeof data.forecastLookbackMonths === 'number' ? data.forecastLookbackMonths : 3,
      };
    }
    return localDefaults;
  }, [userSettingsCtx, userSettingsCtx?.settings, localDefaults]);

  const loading = userSettingsCtx ? userSettingsCtx.loading : localLoading;

  const updateDefaults = useCallback(
    async (next: Partial<ChartDefaults>) => {
      const prev = defaults;
      const merged = { ...defaults, ...next };

      if (userSettingsCtx) {
        if (next.defaultTimeRange !== undefined) await userSettingsCtx.updateSetting('defaultChartTimeRange', next.defaultTimeRange);
        if (next.defaultChartType !== undefined) await userSettingsCtx.updateSetting('defaultChartType', next.defaultChartType);
        if (next.forecastMode !== undefined) await userSettingsCtx.updateSetting('forecastMode', next.forecastMode);
        if (next.forecastLookbackMonths !== undefined) await userSettingsCtx.updateSetting('forecastLookbackMonths', next.forecastLookbackMonths);
        return;
      }

      setLocalDefaults(merged);
      try {
        const body: Record<string, any> = {};
        if (next.defaultTimeRange !== undefined) body.defaultChartTimeRange = next.defaultTimeRange;
        if (next.defaultChartType !== undefined) body.defaultChartType = next.defaultChartType;
        if (next.forecastMode !== undefined) body.forecastMode = next.forecastMode;
        if (next.forecastLookbackMonths !== undefined) body.forecastLookbackMonths = next.forecastLookbackMonths;
        const res = await fetch('/api/user-settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error('Failed to save');
      } catch {
        setLocalDefaults(prev);
      }
    },
    [defaults, userSettingsCtx]
  );

  return { defaults, loading, updateDefaults };
}
