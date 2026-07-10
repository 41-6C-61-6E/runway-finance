import { formatSafeUTCDate } from './date';

/**
 * Dynamically formats values on the Y-axis.
 * Automatically adjusts precision based on the range of data being displayed.
 * Helps prevent repeated labels (e.g. all labels showing "$1.3M") when range is narrow.
 */
export function formatChartYAxisCurrency(
  value: number,
  min: number = 0,
  max: number = 0
): string {
  const range = Math.abs(max - min);
  const absV = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (absV === 0) return '$0';

  if (absV >= 1000000) {
    let decimals = 1;
    if (range === 0) decimals = 1;
    else if (range < 50000) decimals = 3;
    else if (range < 200000) decimals = 2;
    else if (range < 1000000) decimals = 1;
    else decimals = 0;

    const vM = absV / 1000000;
    const formattedWithDecimals = vM.toFixed(decimals);
    const formattedWithMaxPrecision = vM.toFixed(3);

    if (parseFloat(formattedWithDecimals) !== parseFloat(formattedWithMaxPrecision)) {
      if (parseFloat(vM.toFixed(1)) === parseFloat(formattedWithMaxPrecision)) {
        decimals = 1;
      } else if (parseFloat(vM.toFixed(2)) === parseFloat(formattedWithMaxPrecision)) {
        decimals = 2;
      } else {
        decimals = 3;
      }
    }

    return `${sign}$${vM.toFixed(decimals)}M`;
  }

  if (absV >= 1000) {
    let decimals = 0;
    if (range === 0) decimals = 0;
    else if (range < 50) decimals = 2;
    else if (range < 200) decimals = 1;
    else decimals = 0;

    const vK = absV / 1000;
    const formattedWithDecimals = vK.toFixed(decimals);
    const formattedWithMaxPrecision = vK.toFixed(2);

    if (parseFloat(formattedWithDecimals) !== parseFloat(formattedWithMaxPrecision)) {
      if (parseFloat(vK.toFixed(1)) === parseFloat(formattedWithMaxPrecision)) {
        decimals = 1;
      } else {
        decimals = 2;
      }
    }

    return `${sign}$${vK.toFixed(decimals)}K`;
  }

  return `${sign}$${absV.toFixed(0)}`;
}

/**
 * Formats a date range cleanly for a chart pill: "Month dd, YYYY to Month dd, YYYY"
 */
export function formatChartDateRange(firstDate: string | Date, lastDate: string | Date): string {
  if (!firstDate || !lastDate) return '';
  const fmt = (d: string | Date) => formatSafeUTCDate(d, { month: 'long', day: '2-digit', year: 'numeric' });
  return `${fmt(firstDate)} to ${fmt(lastDate)}`;
}

/**
 * Formats a date string safely for chart X-axis ticks, complying with guidelines.
 * - Month/Year resolution: e.g. "Jun 26'"
 * - Day resolution:
 *    - Current year: "MMM DD" (e.g. "Jul 02")
 *    - Different years: "MMM DD, YY'" (e.g. "Dec 25, 25'")
 * - Year resolution: "YYYY" (e.g. "2026")
 */
export function formatChartXAxisDate(
  dateInput: string | Date,
  timeframe: string,
  options?: { isMonthly?: boolean }
): string {
  if (!dateInput) return '';
  const dateStr = typeof dateInput === 'string' ? dateInput.split('T')[0] : dateInput.toISOString().split('T')[0];
  const parts = dateStr.split('-');
  const yearVal = parseInt(parts[0], 10);
  const currentYear = new Date().getFullYear();

  // If monthly resolution is specified or if it's multi-year timeframe (transitioning at year boundary)
  // However, short daily timeframes (1m, 7d, 30d) must use day resolution regardless of the isMonthly prop.
  const isShort = timeframe === '1m' || timeframe === '7d' || timeframe === '30d';
  if (options?.isMonthly && !isShort) {
    const formatted = formatSafeUTCDate(dateInput, { month: 'short' });
    const shortYear = String(yearVal).slice(-2);
    return `${formatted} ${shortYear}'`;
  }

  if (timeframe === '5y' || timeframe === 'all') {
    return `${yearVal}`;
  }

  // Day resolution (e.g. timeframe 1m, 7d, 30d)
  if (timeframe === '1m' || timeframe === '7d' || timeframe === '30d') {
    return formatSafeUTCDate(dateInput, { month: 'short', day: '2-digit' });
  }

  // Medium range daily/weekly snapshots (3m, 6m, 1y, ytd)
  if (yearVal === currentYear) {
    return formatSafeUTCDate(dateInput, { month: 'short', day: '2-digit' });
  } else {
    const formatted = formatSafeUTCDate(dateInput, { month: 'short', day: '2-digit' });
    const shortYear = String(yearVal).slice(-2);
    return `${formatted}, ${shortYear}'`;
  }
}

/**
 * Generates an array of date strings to use as custom XAxis ticks.
 * Adapts to screen size by setting different tick limits for mobile vs desktop.
 */
export function getChartXTicksUnified<T extends { [key: string]: any }>(
  data: T[],
  timeframe: string,
  isMobile: boolean,
  dateKey: string = 'date'
): string[] {
  if (!data || data.length === 0) return [];

  const dates = data.map((d) => String(d[dateKey]));
  const maxTicks = isMobile ? 4 : 8;

  if (dates.length <= maxTicks) {
    return dates;
  }

  // For short timeframes (usually daily snapshot), space ticks evenly by index
  if (timeframe === '1m' || timeframe === '7d' || timeframe === '30d') {
    const ticks: string[] = [];
    const step = (data.length - 1) / (maxTicks - 1);
    for (let i = 0; i < maxTicks; i++) {
      const idx = Math.round(step * i);
      if (idx < data.length && !ticks.includes(dates[idx])) {
        ticks.push(dates[idx]);
      }
    }
    return ticks;
  }

  const getYearMonth = (dateStr: string) => dateStr.slice(0, 7); // 'YYYY-MM'
  const getYear = (dateStr: string) => dateStr.slice(0, 4); // 'YYYY'

  const isMultiYear = timeframe === '5y' || timeframe === 'all';

  // Find transition points where the month (or year) changes
  const transitions: string[] = [dates[0]];
  for (let i = 1; i < dates.length; i++) {
    const prevKey = isMultiYear ? getYear(dates[i - 1]) : getYearMonth(dates[i - 1]);
    const currKey = isMultiYear ? getYear(dates[i]) : getYearMonth(dates[i]);
    if (prevKey !== currKey) {
      transitions.push(dates[i]);
    }
  }

  if (transitions.length <= maxTicks) {
    return transitions;
  }

  // Downsample transition points evenly to fit within maxTicks
  const filtered: string[] = [transitions[0]];
  const step = (transitions.length - 1) / (maxTicks - 1);
  for (let i = 1; i < maxTicks - 1; i++) {
    const idx = Math.round(step * i);
    if (idx < transitions.length && !filtered.includes(transitions[idx])) {
      filtered.push(transitions[idx]);
    }
  }
  const lastTransition = transitions[transitions.length - 1];
  if (!filtered.includes(lastTransition)) {
    filtered.push(lastTransition);
  }

  return filtered;
}
