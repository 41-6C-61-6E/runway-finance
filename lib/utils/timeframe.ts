export type TimeFrame =
  | '1d'
  | '7d'
  | '30d'
  | '1m'
  | '3m'
  | '6m'
  | '1y'
  | '365d'
  | '5y'
  | 'ytd'
  | 'all'
  | '1d_discrete'
  | '7d_discrete';

function subtractMonthsClamped(date: Date, months: number): void {
  const originalDay = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() - months);
  const maxDays = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(originalDay, maxDays));
}

function subtractYearsClamped(date: Date, years: number): void {
  const originalDay = date.getDate();
  const originalMonth = date.getMonth();
  date.setDate(1);
  date.setFullYear(date.getFullYear() - years);
  date.setMonth(originalMonth);
  const maxDays = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(originalDay, maxDays));
}

/**
 * Calculates start and end dates for a given standard timeframe.
 */
export function getDateRange(timeframe: TimeFrame | string = '1y'): [Date, Date] {
  const endDate = new Date();
  const startDate = new Date();

  switch (timeframe) {
    case '1d':
    case '1d_discrete':
      startDate.setDate(startDate.getDate() - 1);
      break;
    case '7d':
    case '7d_discrete':
      startDate.setDate(startDate.getDate() - 7);
      break;
    case '30d':
      startDate.setDate(startDate.getDate() - 30);
      break;
    case '1m':
    case 'month':
      subtractMonthsClamped(startDate, 1);
      break;
    case '3m':
    case 'quarter':
      subtractMonthsClamped(startDate, 3);
      break;
    case '6m':
      subtractMonthsClamped(startDate, 6);
      break;
    case '1y':
      subtractYearsClamped(startDate, 1);
      break;
    case '365d':
      startDate.setDate(startDate.getDate() - 365);
      break;
    case '5y':
      subtractYearsClamped(startDate, 5);
      break;
    case 'ytd': {
      const now = new Date();
      startDate.setFullYear(now.getFullYear(), 0, 1);
      startDate.setHours(0, 0, 0, 0);
      break;
    }
    case 'all':
      startDate.setFullYear(1900, 0, 1);
      startDate.setHours(0, 0, 0, 0);
      break;
    default:
      subtractYearsClamped(startDate, 1);
      break;
  }

  return [startDate, endDate];
}

/**
 * Converts a timeframe string into an approximate count of months.
 */
export function timeframeToMonths(timeframe: TimeFrame | string = '1y'): number {
  switch (timeframe) {
    case '1d':
    case '7d':
    case '30d':
    case '1m':
    case 'month':
      return 1;
    case '3m':
    case 'quarter':
      return 3;
    case '6m':
      return 6;
    case '1y':
    case '365d':
      return 12;
    case '5y':
      return 60;
    case 'ytd': {
      const currentMonth = new Date().getMonth() + 1; // 1-indexed count of months elapsed this year
      return Math.max(1, currentMonth);
    }
    case 'all':
      return 360;
    default:
      return 12;
  }
}

/**
 * Converts a timeframe string into an approximate count of years.
 */
export function timeframeToYears(timeframe: TimeFrame | string = '1y'): number {
  const months = timeframeToMonths(timeframe);
  return Math.max(1, Math.round(months / 12));
}

/**
 * Returns a human-friendly label for a timeframe key.
 */
export function timeframeToLabel(timeframe: TimeFrame | string): string {
  switch (timeframe) {
    case '1d':
    case '1d_discrete':
      return 'Past 24 Hours';
    case '7d':
    case '7d_discrete':
      return 'Past 7 Days';
    case '30d':
    case '1m':
      return 'Past Month';
    case '3m':
    case 'quarter':
      return 'Past 3 Months';
    case '6m':
      return 'Past 6 Months';
    case '1y':
    case '365d':
      return 'Past Year';
    case '5y':
      return 'Past 5 Years';
    case 'ytd':
      return 'Year to Date';
    case 'all':
      return 'All Time';
    default:
      return timeframe;
  }
}
