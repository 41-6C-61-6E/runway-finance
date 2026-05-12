'use client';

import { useChartColorScheme } from '@/lib/hooks/use-chart-colors';

export function ChartColorSchemeInitializer() {
  useChartColorScheme();
  return null;
}
