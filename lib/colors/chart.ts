import { CHART_COLOR_SCHEMES, SEMANTIC } from './palette';

export const CHART_SERIES_FALLBACK_COLORS = [
  '#6366f1', // Indigo (Chart 1)
  '#10b981', // Emerald (Chart 2)
  '#f59e0b', // Amber (Chart 3)
  '#8b5cf6', // Violet (Chart 4)
  '#ec4899', // Pink (Chart 5)
  '#0ea5e9', // Sky (Chart 6)
  '#14b8a6', // Teal (Chart 7)
  '#f97316', // Orange (Chart 8)
] as const;

export const CHART_CSS_VARS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-synthetic)',
  'var(--destructive-synthetic)',
] as const;

/**
 * Returns a CSS variable color for chart series by index, with fallback hex colors.
 */
export function getChartSeriesColor(index: number, fallbackToHex = false): string {
  if (!fallbackToHex) {
    return CHART_CSS_VARS[index % CHART_CSS_VARS.length];
  }
  return CHART_SERIES_FALLBACK_COLORS[index % CHART_SERIES_FALLBACK_COLORS.length];
}

/**
 * Resolves standard positive / negative delta colors.
 */
export function getDeltaColor(delta: number, inverted = false): string {
  const isPositive = delta >= 0;
  if (inverted) {
    return isPositive ? 'text-destructive' : 'text-emerald-500';
  }
  return isPositive ? 'text-emerald-500' : 'text-destructive';
}
